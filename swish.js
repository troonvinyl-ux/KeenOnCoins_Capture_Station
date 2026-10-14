/* SWISH Coin Capture Station — compatibility frontend
 * Uses the existing SWISH OnSpace backend and existing Edge Functions.
 * No new database, no browser-held eBay secrets, and no automatic listing publication.
 */
(() => {
  'use strict';
  const CONFIG = {
    backend: 'https://iwgaqieyoahmcjfziwga.backend.onspace.ai',
    // Public anon key used by the existing SWISH web app. Never put service-role keys here.
    anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODkwNjM4MTgsImV4cCI6MjEwNDQyMzgxOCwicmVmIjoiaXdnYXFpZXlvYWhtY2pmeml3Z2EiLCJyb2xlIjoiYW5vbiIsImlzcyI6Im9uc3BhY2UifQ.cioQ38guPLFAbl3x48mUaJcMSxU5IpZn7-H-JhtvXJc',
    identifyFunctions: ['swish-identify', 'identify'],
    islamicIdentifyFunctions: ['swish-islamic-identify'],
    valuationFunctions: ['swish-market-value', 'value'],
    imageFunction: 'swish-image-download',
    imageBucket: 'item-images'
  };
  const $ = id => document.getElementById(id);
  const state = { user: null, tenant: null, obverse: null, reverse: null, identification: null, valuation: null, savedItem: null, busy: false };
  const sb = window.supabase.createClient(CONFIG.backend, CONFIG.anon, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'swish_github_auth' }
  });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const say = (id, message, bad=false) => { const el=$(id); if(el) el.innerHTML = message ? `<div class="${bad?'error':'success'}">${esc(message)}</div>` : ''; };
  const busy = v => { state.busy=v; ['identifyBtn','valueBtn','saveBtn','loginBtn'].forEach(id=>{if($(id))$(id).disabled=v;}); };
  function setConnection(text, good=false) { $('connection').innerHTML = `<span class="dot ${good?'good':''}"></span>${esc(text)}`; }
  function payload() {
    return {
      tenant_id: state.tenant?.id || null,
      tenantId: state.tenant?.id || null,
      user_id: state.user?.id || null,
      userId: state.user?.id || null,
      niche: 'coins',
      specialist: 'coins',
      category: 'Coins',
      weight_g: $('weight').value ? Number($('weight').value) : null,
      weight: $('weight').value ? Number($('weight').value) : null,
      diameter_mm: $('diameter').value ? Number($('diameter').value) : null,
      diameter: $('diameter').value ? Number($('diameter').value) : null,
      metal: $('metal').value.trim(),
      notes: $('notes').value.trim(),
      obverse_image: state.obverse?.dataUrl || null,
      reverse_image: state.reverse?.dataUrl || null,
      images: [state.obverse?.dataUrl, state.reverse?.dataUrl].filter(Boolean),
      image_urls: [state.obverse?.url, state.reverse?.url].filter(Boolean),
      identification: state.identification,
      valuation: state.valuation
    };
  }
  async function invokeAny(names, body) {
    let last;
    for (const name of names) {
      const {data,error}=await sb.functions.invoke(name,{body});
      if (!error) return data;
      last=error;
      const status=error.context?.status;
      // Only try a compatibility alias when the function is absent.
      if (status && status !== 404 && status !== 405) throw await describeError(error);
    }
    throw await describeError(last || new Error('No compatible SWISH function responded.'));
  }
  async function describeError(error) {
    let detail=error?.message || String(error);
    try {
      const r=error?.context;
      if(r){ const ct=r.headers?.get?.('content-type')||''; detail=ct.includes('json') ? JSON.stringify(await r.clone().json()) : await r.clone().text(); }
    } catch(_) {}
    return new Error(detail);
  }
  async function loadContext() {
    const {data:{user}}=await sb.auth.getUser();
    state.user=user;
    if(!user){ $('loginCard').hidden=false; $('captureCard').hidden=true; setConnection('Sign in required'); return; }
    // Match the existing SWISH tenant lookup; do not create a tenant or database.
    const {data,error}=await sb.from('tenants').select('id,name,slug,subscription_tier,settings,created_at').order('created_at',{ascending:true}).limit(1);
    if(error) throw error;
    state.tenant=(data||[])[0]||null;
    $('loginCard').hidden=true; $('captureCard').hidden=false;
    setConnection(state.tenant ? `Connected · ${state.tenant.name || 'SWISH'}` : 'Signed in · tenant not resolved',!!state.tenant);
  }
  function readImage(file, side) {
    if(!file) return;
    if(!file.type.startsWith('image/')) { say('actionMessage','Please choose an image file.',true); return; }
    const reader=new FileReader();
    reader.onload=()=> {
      const image={file,dataUrl:String(reader.result),url:null};
      state[side]=image;
      const preview=$(side==='obverse'?'obversePreview':'reversePreview');
      preview.src=image.dataUrl; preview.hidden=false;
      state.identification=null; state.valuation=null; state.savedItem=null;
      $('assessment').hidden=true;
    };
    reader.onerror=()=>say('actionMessage',`Could not read the ${side} image.`,true);
    reader.readAsDataURL(file);
  }
  function renderAssessment() {
    const el=$('assessment');
    const ident=state.identification, val=state.valuation;
    el.hidden=!(ident||val);
    if(!ident&&!val)return;
    const name=ident?.title || ident?.identification || ident?.name || ident?.best_match || ident?.coin_type || 'No confirmed identification returned';
    const confidence=ident?.confidence ?? ident?.confidence_score;
    const value=val?.estimated_value ?? val?.market_value ?? val?.value ?? val?.estimatedValue;
    const currency=val?.currency || 'GBP';
    el.innerHTML=`<h3>Review before saving</h3>
      ${ident?`<p><strong>Suggested identification:</strong> ${esc(name)}</p><p><strong>Confidence:</strong> ${confidence==null?'Not supplied':esc(typeof confidence==='number'&&confidence<=1?`${Math.round(confidence*100)}%`:confidence)}</p><pre>${esc(JSON.stringify(ident,null,2))}</pre>`:''}
      ${val?`<p><strong>Suggested valuation:</strong> ${value==null?'No defensible estimate returned':esc(`${currency} ${value}`)}</p><p class="muted">Check the valuation evidence, currency, condition and comparability before relying on it.</p><pre>${esc(JSON.stringify(val,null,2))}</pre>`:''}
      <label>Corrected identification / title<input id="confirmedTitle" value="${esc(name==='No confirmed identification returned'?'':name)}" placeholder="Enter the identification you are confident in"></label>
      <label>Reviewed value (£)<input id="confirmedValue" type="number" min="0" step="0.01" value="${value!=null && currency==='GBP' ? esc(value) : ''}" placeholder="Leave blank if uncertain"></label>`;
  }
  async function identify() {
    if(!state.obverse&&!state.reverse) throw new Error('Capture or select at least one coin image first.');
    busy(true); say('actionMessage','Identifying coin…');
    try {
      const p=payload();
      // Route Islamic/Arabic-script coins to the existing specialist function first.
      const specialist=/islamic|arabic|dirham|tanker|timurid|countermark|persian|ottoman/i.test(p.notes+' '+p.metal);
      const result=await invokeAny(specialist?[...CONFIG.islamicIdentifyFunctions,...CONFIG.identifyFunctions]:CONFIG.identifyFunctions,p);
      state.identification=result; state.valuation=null; renderAssessment(); say('actionMessage','Identification returned. Review the candidate and confidence before saving.');
    } finally { busy(false); }
  }
  async function valueCoin() {
    if(!state.identification) throw new Error('Identify the coin first so valuation can use the candidate and measurements.');
    busy(true); say('actionMessage','Checking valuation…');
    try {
      const p=payload();
      const result=await invokeAny(CONFIG.valuationFunctions,{...p, identification:state.identification, market:'UK', currency:'GBP', requireEvidence:true, conservative:true});
      state.valuation=result; renderAssessment(); say('actionMessage','Valuation returned. Treat it as an estimate unless supported by comparable sold evidence.');
    } finally { busy(false); }
  }
  async function uploadImage(image, side) {
    if(!image) return null;
    const ext=(image.file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path=`${state.user.id}/coins/${Date.now()}-${side}.${ext}`;
    const {data,error}=await sb.storage.from(CONFIG.imageBucket).upload(path,image.file,{upsert:true,contentType:image.file.type||'image/jpeg'});
    if(error) throw error;
    const {data:publicData}=sb.storage.from(CONFIG.imageBucket).getPublicUrl(data.path);
    return {path:data.path,url:publicData?.publicUrl||null,side};
  }
  async function saveCoin() {
    if(!state.identification) throw new Error('Identify and review the coin before saving.');
    if(!state.tenant?.id) throw new Error('No existing SWISH tenant was resolved. Nothing was saved.');
    const title=$('confirmedTitle')?.value.trim();
    if(!title) throw new Error('Enter or confirm the coin identification before saving.');
    busy(true); say('actionMessage','Saving images and coin record…');
    try {
      // Upload to the existing bucket. If uploads fail, do not write a misleading record.
      const media=[];
      if(state.obverse) media.push(await uploadImage(state.obverse,'obverse'));
      if(state.reverse) media.push(await uploadImage(state.reverse,'reverse'));
      const valText=$('confirmedValue')?.value;
      const row={
        tenant_id:state.tenant.id,
        user_id:state.user.id,
        title,
        name:title,
        category:'Coins',
        niche:'coins',
        specialist_id:'coins',
        weight_g:$('weight').value?Number($('weight').value):null,
        diameter_mm:$('diameter').value?Number($('diameter').value):null,
        metal:$('metal').value.trim()||null,
        notes:$('notes').value.trim()||null,
        media,
        images:media,
        identification_result:state.identification,
        valuation_result:state.valuation,
        estimated_value:valText!=='' && valText!=null ? Number(valText) : null,
        currency:'GBP',
        status:'review'
      };
      // Use the current SWISH items table. No table/schema is created by this frontend.
      const {data,error}=await sb.from('items').insert(row).select().single();
      if(error) throw error;
      state.savedItem=data;
      say('actionMessage',`Saved for review. Item ID: ${data.id}`);
    } finally { busy(false); }
  }
  async function run(fn) {
    if(state.busy)return;
    try { await fn(); } catch(e) { say('actionMessage',e.message||String(e),true); } 
  }
  $('obverseFile').addEventListener('change',e=>readImage(e.target.files?.[0],'obverse'));
  $('reverseFile').addEventListener('change',e=>readImage(e.target.files?.[0],'reverse'));
  $('identifyBtn').addEventListener('click',()=>run(identify));
  $('valueBtn').addEventListener('click',()=>run(valueCoin));
  $('saveBtn').addEventListener('click',()=>run(saveCoin));
  $('loginBtn').addEventListener('click',async()=>{
    if(state.busy)return;
    busy(true);
    try {
      const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      if(error)throw error;
      say('loginMessage',''); await loadContext();
    } catch(e) { say('loginMessage',e.message||String(e),true); }
    finally { busy(false); }
  });
  $('logoutBtn').addEventListener('click',()=>run(async()=>{await sb.auth.signOut();state.user=null;state.tenant=null;await loadContext();}));
  sb.auth.onAuthStateChange(()=>{loadContext().catch(e=>setConnection(e.message));});
  loadContext().catch(e=>{setConnection('Backend error');say('loginMessage',e.message,true);});
})();