
/* SWISH GitHub flat web app
   Existing OnSpace backend is canonical.
   No new database, no new Edge Functions, no third-party secret keys.
*/
const SWISH = {
  backend: 'https://iwgaqieyoahmcjfziwga.backend.onspace.ai',
  // This is the existing public Supabase-compatible anon key already used by the supplied SWISH app.
  // It is NOT an eBay/Gemini/Numista secret.
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODkwNjM4MTgsImV4cCI6MjEwNDQyMzgxOCwicmVmIjoiaXdnYXFpZXlvYWhtY2pmeml3Z2EiLCJyb2xlIjoiYW5vbiIsImlzcyI6Im9uc3BhY2UifQ.cioQ38guPLFAbl3x48mUaJcMSxU5IpZn7-H-JhtvXJc',
  functions: {
    identify:'identify',
    value:'value',
    islamic:'swish-islamic-identify',
    image:'swish-image-download',
    reprice:'reprice',
    repriceAll:'reprice-all',
    decompose:'swish-decompose',
    marketValue:'swish-market-value',
    generate:'swish-list-generate',
    ebayAuth:'ebay-auth-url',
    ebaySync:null,
    ebayListingsSync:null,
    ebayOffer:'ebay-offer-action',
    ebayReturn:'ebay-return-action',
    ebayCase:'ebay-case-respond',
    ebayReply:'ebay-reply-message',
    ebayFinance:'ebay-finances',
    ebayFinanceSummary:'ebay-finances-summary',
    ebayAnalytics:'ebay-analytics',
    ebayImport:'ebay-import-csv',
    ebayExport:'ebay-export-csv',
    dispatch:'dispatch-order',
    listingPreflight:'listing-preflight',
    publishListing:'publish-listing'
  }
};

const sb = window.supabase.createClient(SWISH.backend, SWISH.anon, {
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'swish_github_auth'}
});

const S = {
  page: location.hash.replace('#/','') || 'dashboard',
  sub:'overview',
  user:null,
  tenant:null,
  connector:null,
  selected:null,
  cache:{},
  identifyFiles:[],
  identifyPreviews:[],
  busy:false,
  renderToken:0
};

const esc = v => String(v ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money = v => Number.isFinite(Number(v)) ? 'Â£'+Number(v).toFixed(2) : 'â';
const date = v => v ? new Date(v).toLocaleDateString('en-GB') : 'â';
const datetime = v => v ? new Date(v).toLocaleString('en-GB') : 'â';
const arr = v => Array.isArray(v) ? v : [];
const obj = v => v && typeof v==='object' ? v : {};
const toast = (msg, bad=false) => {
  const old=document.querySelector('.toast'); if(old) old.remove();
  const el=document.createElement('div'); el.className='toast '+(bad?'error':''); el.textContent=msg;
  document.body.appendChild(el); setTimeout(()=>el.remove(),4500);
};
const setConn = (ok,text) => {
  const el=document.querySelector('#connection');
  if(el) el.innerHTML='<span class="dot '+(ok?'good':'')+'"></span>'+esc(text);
};

async function edge(name,payload={}) {
  const {data,error}=await sb.functions.invoke(name,{body:payload});
  if(error){
    let detail='';
    try{
      const r=error.context;
      if(r){
        const ct=r.headers?.get?.('content-type')||'';
        if(ct.includes('application/json')){const j=await r.clone().json();detail=j?.error||j?.message||j?.details||JSON.stringify(j);}
        else detail=await r.clone().text();
      }
    }catch(_){}
    const status=error.context?.status?` [HTTP ${error.context.status}]`:'';
    throw new Error((detail||error.message||String(error))+status);
  }
  return data;
}

async function edgeAny(names,payload={}){
  let last=null;
  for(const name of names){
    try{return await edge(name,payload)}
    catch(e){last=e}
  }
  throw last||new Error('No compatible SWISH Edge Function responded.');
}

async function table(name,query={}) {
  let q=sb.from(name).select(query.select||'*');
  if(query.eq) Object.entries(query.eq).forEach(([k,v])=>q=q.eq(k,v));
  if(query.ilike) Object.entries(query.ilike).forEach(([k,v])=>q=q.ilike(k,v));
  if(query.neq) Object.entries(query.neq).forEach(([k,v])=>q=q.neq(k,v));
  if(query.in) Object.entries(query.in).forEach(([k,v])=>q=q.in(k,v));
  if(query.order) q=q.order(query.order.column,{ascending:query.order.ascending!==false});
  if(query.limit) q=q.limit(query.limit);
  if(query.single) q=q.single();
  const {data,error}=await q;
  if(error) throw error;
  return data;
}
async function safeTable(name,query={},fallback=[]){
  try{return await table(name,query)}catch(e){
    if(/relation .* does not exist|Could not find the table|schema cache/i.test(String(e.message||e))) return fallback;
    throw e;
  }
}

async function insert(name,row){ const {data,error}=await sb.from(name).insert(row).select().single(); if(error)throw error; return data; }
async function update(name,id,patch){ const {data,error}=await sb.from(name).update(patch).eq('id',id).select().single(); if(error)throw error; return data; }
async function remove(name,id){ const {error}=await sb.from(name).delete().eq('id',id); if(error)throw error; }

async function loadContext(){
  const {data:{user}}=await sb.auth.getUser();
  S.user=user;
  if(!user){setConn(false,'Sign in required');return false;}
  try {
    const tenants=await table('tenants',{select:'id,name,slug,subscription_tier,settings,created_at',order:{column:'created_at',ascending:true},limit:1});
    S.tenant=tenants?.[0]||null;
    if(S.tenant){
      const c=await table('marketplace_connectors',{select:'*',eq:{tenant_id:S.tenant.id,marketplace_id:'ebay'},limit:1});
      S.connector=c?.[0]||null;
    }
    setConn(true,(S.connector?.status||'Connected')+' Â· eBay');
    return true;
  } catch(e){ setConn(false,'Backend connected Â· tenant lookup failed'); return true; }
}

function shell(content){
  const nav=[
    ['dashboard','â Home'],['inventory','â« Inventory'],['identify','â Identify'],
    ['listings','â£ Listings'],['orders','â¤ Orders'],['ebay','eBay'],['more','â¢â¢â¢ More']
  ];
  document.querySelector('#app').innerHTML=`
    <div class="app"><main class="main">
      <div class="top">
        <div><div class="brand">S<span>WISH</span></div><div class="status">KeenOnCoins Â· GitHub frontend Â· existing SWISH backend</div></div>
        <div id="connection" class="conn"><span class="dot"></span>Connectingâ¦</div>
      </div>
      <div class="nav">${nav.map(([p,t])=>`<button type="button" class="${S.page===p?'active':''}" data-go="${p}">${t}</button>`).join('')}</div>
      <div id="view">${content}</div>
    </main>
    <div class="bottom"><div class="bottomin">
      ${nav.slice(0,5).map(([p,t])=>`<button type="button" class="${S.page===p?'active':''}" data-go="${p}">${t}</button>`).join('')}
    </div></div></div>`;
  document.querySelectorAll('[data-go]').forEach(b=>{
    b.onclick=(e)=>{e.preventDefault();e.stopPropagation();go(b.dataset.go);};
  });
  setConn(!!S.user,(S.connector?.status||'Connected')+' Â· eBay');
}
function go(p){
  S.page=p;
  const target='#/'+p;
  if(location.hash!==target) history.pushState({page:p},'',target);
  render();
}

// Global navigation safety net: catches taps on navigation controls even if a page re-rendered them.
document.addEventListener('click',(e)=>{
  const el=e.target.closest?.('[data-go],[data-more]');
  if(!el)return;
  const p=el.dataset.go||el.dataset.more;
  if(!p)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  go(p);
},true);

function currentHashPage(){
  const raw=location.hash.replace(/^#\//,'').split('?')[0];
  return raw||'dashboard';
}

window.addEventListener('hashchange',()=>{
  const p=currentHashPage();
  if(p!==S.page){S.page=p;render();}
});

async function render(){
  const token=++S.renderToken;
  if(!S.user){renderLogin();return;}
  const pages={
    dashboard:pageDashboard,inventory:pageInventory,identify:pageIdentify,listings:pageListings,
    orders:pageOrders,ebay:pageEbay,more:pageMore,
    acquisitions:pageAcquisitions,opportunities:pageOpportunities,review:pageReview,
    audit:pageAudit,dispatch:pageDispatch,repricing:pageRepricing,insights:pageInsights,
    money:pageMoney,tasks:pageTasks,settings:pageSettings,command:pageCommand
  };
  shell('<div class="empty">Loadingâ¦</div>');
  try {
    const pageFn = pages[S.page] || pages.more;
    if (typeof pageFn === 'function') await pageFn();
    if(token!==S.renderToken) return;
  } catch(e){
    if(token!==S.renderToken) return;
    const v=document.querySelector('#view');
    if(v) v.innerHTML=`<div class="card"><div class="error">${esc(e.message)}</div></div>`;
  }
}
function replaceView(html){
  const v=document.querySelector('#view');
  if(v && S.page===currentHashPage()) v.innerHTML=html;
}
function tabs(items,active){return `<div class="tabs">${items.map(x=>`<button class="${active===x[0]?'active':''}" data-sub="${x[0]}">${x[1]}</button>`).join('')}</div>`}
function bindSubs(){document.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>{S.sub=b.dataset.sub;render();});}

function renderLogin(){
  document.querySelector('#app').innerHTML=`<main class="main"><div class="card login">
    <div class="brand">S<span>WISH</span></div><p class="muted">Sign in through the existing SWISH backend. No eBay, Gemini or Numista API key is required here.</p>
    <div class="two"><input id="email" type="email" placeholder="Email"><input id="password" type="password" placeholder="Password"></div>
    <div class="toolbar" style="margin-top:12px"><button class="btn primary" id="login">Sign in</button></div>
    <div id="loginErr"></div>
  </div></main>`;
  document.querySelector('#login').onclick=async()=>{
    const er=document.querySelector('#loginErr');er.innerHTML='<div class="empty">Signing inâ¦</div>';
    const {error}=await sb.auth.signInWithPassword({email:document.querySelector('#email').value,password:document.querySelector('#password').value});
    if(error)er.innerHTML=`<div class="error">${esc(error.message)}</div>`;else{await loadContext();render();}
  };
}

async function pageDashboard(){
  const [inv,ebayListings,orders,tasks]=await Promise.all([
    safeTable('inventory',{limit:1000}),safeTable('ebay_listings',{limit:1000}),safeTable('orders',{limit:500}),safeTable('tasks',{limit:500})
  ]);
  const inventoryCount=inv.length||ebayListings.length;
  const awaiting=orders.filter(x=>['awaiting_dispatch','paid','processing'].includes(String(x.status)));
  const openTasks=tasks.filter(x=>x.status!=='completed');
  replaceView(`<div class="card"><h2>SWISH Seller Hub</h2><p class="muted">Existing database and Edge Functions remain canonical.</p>
    <div class="grid">
      <div class="card metric"><span class="muted">Inventory</span><b>${inventoryCount}</b></div>
      <div class="card metric"><span class="muted">Orders</span><b>${orders.length}</b></div>
      <div class="card metric"><span class="muted">Awaiting dispatch</span><b>${awaiting.length}</b></div>
      <div class="card metric"><span class="muted">Open tasks</span><b>${openTasks.length}</b></div>
    </div></div>
    <div class="card"><h3>Quick actions</h3><div class="toolbar">
      <button class="btn primary" data-go="identify">Identify item</button>
      <button class="btn" id="syncEbay">Full eBay sync</button>
      <button class="btn" id="syncImages">Sync images</button>
      <button class="btn" data-go="inventory">Open inventory</button>
    </div><div id="dashMsg"></div></div>`);
  document.querySelector('#syncEbay').onclick=()=>showBackendUnavailable('dashMsg','Live eBay sync','ebay-sync / ebay-sync-listings');
  document.querySelector('#syncImages').onclick=async()=>runAction('image', {tenantId:S.tenant?.id,mode:'all'},'Image sync complete.','dashMsg');
  document.querySelectorAll('[data-go]').forEach(b=>{
    b.onclick=(e)=>{e.preventDefault();e.stopPropagation();go(b.dataset.go);};
  });
}

async function pageInventory(){
  replaceView(`<div class="card"><h2>Inventory</h2>
    <div class="toolbar"><input id="invSearch" placeholder="Search title / SKU"><button class="btn primary" id="invLoad">Search</button><button class="btn" id="invSync">eBay Sync</button></div>
    <div class="toolbar"><button class="btn" data-invfilter="all">All</button><button class="btn" data-invfilter="review">Needs review</button><button class="btn" data-invfilter="listed">Listed</button></div>
    <div id="invBox"><div class="empty">Loading inventoryâ¦</div></div></div>`);
  document.querySelector('#invLoad').onclick=loadInventory;
  document.querySelector('#invSync').onclick=syncEbayInventory;
  document.querySelectorAll('[data-invfilter]').forEach(b=>b.onclick=()=>{S.sub=b.dataset.invfilter;loadInventory()});
  await loadInventory();
}
async function syncEbayInventory(){
  const box=document.querySelector('#invBox');
  if(box)box.innerHTML=`<div class="error"><b>Live eBay sync is not available in the existing SWISH backend.</b><br>
    The backend currently returns HTTP 404 for both <code>ebay-sync-listings</code> and <code>ebay-sync</code>.
    <p class="muted">CSV import is independent and uses the existing <code>ebay-import-csv</code> function.</p></div>`;
  return null;
}
async function loadInventory(){
  const box=document.querySelector('#invBox');if(!box)return;
  try{
    const q=document.querySelector('#invSearch')?.value.trim()||'';
    let rows=await safeTable('inventory',{limit:1000,order:{column:'created_at',ascending:false}});
    // If the inventory table is empty, use the existing eBay listings table as the live eBay inventory source.
    // This does not create a new table or backend.
    if(!rows.length){
      const listings=await safeTable('ebay_listings',{limit:1000,order:{column:'created_at',ascending:false}});
      rows=listings.map(x=>({...x,id:x.inventory_item_id||x.item_id||x.id,__source:'ebay_listings',title:x.title||x.item_title,canonical_title:x.title||x.item_title,ebay_item_id:x.ebay_item_id||x.external_listing_id,external_listing_id:x.external_listing_id||x.ebay_item_id,status:x.status||'listed'}));
    }
    if(q)rows=rows.filter(x=>[x.title,x.canonical_title,x.sku,x.ebay_item_id,x.external_listing_id].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())));
    if(S.sub==='review')rows=rows.filter(x=>x.status==='review'||Number(x.confidence??x.identification_confidence??0)<.65);
    if(S.sub==='listed')rows=rows.filter(x=>x.ebay_item_id||x.external_listing_id||x.listing_id||x.status==='listed'||x.status==='active');
    box.innerHTML=rows.length?rows.map(inventoryRow).join(''):'<div class="empty">No inventory found.</div>';
    box.querySelectorAll('[data-inv]').forEach(b=>b.onclick=()=>openInventory(b.dataset.inv));
  }catch(e){box.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
function inventoryRow(x){return `<div class="row" data-inv="${esc(x.id||'')}"><div class="grow"><div class="title">${esc(x.title||x.canonical_title||x.sku||x.id)}</div><div class="muted">${esc(x.sku||x.id||'')}</div><div style="margin-top:5px"><span class="tag">${esc(x.status||'active')}</span><span class="tag">${x.ebay_item_id||x.external_listing_id?'eBay linked':'Not linked'}</span></div></div><div>${money(x.expected_selling_price||x.price||x.valuation_mid||x.valuation||0)}</div></div>`}

async function openInventory(id){
  const x=(await table('inventory',{eq:{id},single:true})); S.selected=x; pageInventoryItem(x);
}
function pageInventoryItem(x){
  const a=obj(x.attributes||x.identification_data);const media=arr(x.media);const imgs=media.length?media:(x.image_url?[x.image_url]:[]);
  replaceView(`<div class="card"><div class="toolbar"><button class="btn" id="backInv">â Inventory</button><button class="btn primary" id="reid">Re-identify</button><button class="btn" id="revalue">Re-value</button><button class="btn" id="islamic">Islamic / Countermark</button></div>
    <h2>${esc(x.title||x.canonical_title||'Untitled item')}</h2><p class="muted">${esc(x.sku||x.id)}</p>
    <div class="two"><div><h3>Images</h3><div class="thumbgrid">${imgs.map(u=>`<img src="${esc(u)}">`).join('')||'<div class="empty">No images stored</div>'}</div></div>
    <div><h3>Identification</h3><p>Confidence: <b>${x.confidence==null&&x.identification_confidence==null?'â':Math.round(Number(x.identification_confidence??x.confidence)*100)+'%'}</b></p>
    <p class="muted">${esc(a.numista_status||'Numista status not recorded')}</p><pre class="pre">${esc(JSON.stringify(a,null,2))}</pre></div></div>
    <div class="two"><div class="card"><b>Valuation</b><p>${money(x.valuation_low)} â ${money(x.valuation_mid??x.valuation)} â ${money(x.valuation_high)}</p><span class="muted">${esc(x.valuation_confidence||'not valued')}</span></div>
    <div class="card"><b>eBay</b><p>${esc(x.ebay_item_id||x.external_listing_id||'Not linked')}</p><button class="btn primary" id="prepareListing">Prepare eBay listing</button></div></div>
    <div id="itemMsg"></div></div>`);
  document.querySelector('#backInv').onclick=()=>go('inventory');
  document.querySelector('#reid').onclick=()=>engineOnItem('identify',x);
  document.querySelector('#revalue').onclick=()=>engineOnItem('value',x);
  document.querySelector('#islamic').onclick=()=>engineOnItem('islamic',x);
  document.querySelector('#prepareListing').onclick=()=>createListingFromItem(x);
}
async function engineOnItem(kind,item){
  const out=document.querySelector('#itemMsg');out.innerHTML='<div class="empty"><div class="spinner"></div><p>Running SWISH engineâ¦</p></div>';
  try{
    const urls=arr(item.media).filter(u=>/^https?:/i.test(u));
    let d;
    if(kind==='identify'){
      d=await edgeAny([SWISH.functions.identify,'swish-identify'],{tenant_id:S.tenant?.id,item_id:item.id,tenantId:S.tenant?.id,itemId:item.id,existingImageUrls:urls,specialistId:item.specialist_id||'curiosities_collectibles',knownAttributes:item.attributes||{}});
      const ident=d?.identification||d?.result||{};
      const patch={title:ident.title||ident.canonicalTitle||item.title,canonical_title:ident.canonicalTitle||ident.canonical_title||item.canonical_title,confidence:ident.confidence??item.confidence,identification_confidence:ident.confidence??item.identification_confidence,identification_data:ident,updated_at:new Date().toISOString()};
      if(ident.attributes)patch.attributes={...(item.attributes||{}),...ident.attributes};
      await update('inventory',item.id,patch); S.selected={...item,...patch};
    } else if(kind==='value'){
      d=await edgeAny([SWISH.functions.value,SWISH.functions.marketValue],{tenant_id:S.tenant?.id,item_id:item.id,tenantId:S.tenant?.id,itemId:item.id,title:item.title||item.canonical_title||'Unknown item',specialistId:item.specialist_id||'curiosities_collectibles',attributes:item.attributes||{},condition:item.condition||'',identificationConfidence:Number(item.identification_confidence??item.confidence??0),identificationTier:Number(item.identification_confidence??item.confidence??0)>=.85?'high':Number(item.identification_confidence??item.confidence??0)>=.65?'medium':'low',numistaTypeId:item.attributes?.numista_type_id?Number(item.attributes.numista_type_id):null,numistaMatchScore:Number(item.attributes?.numista_match_score||0),numistaMatchTier:item.attributes?.numista_status||'no_match',applyToItem:false});
      const v=d?.valuation||d?.result||d||{};
      const price=Number(v.recommendedListingPrice??v.recommended_listing_price??v.valuationMid??v.valuation_mid??0);
      const patch={valuation_low:Number(v.valuationLow??v.valuation_low??0),valuation_mid:Number((v.valuationMid??v.valuation_mid??price??0)),valuation_high:Number(v.valuationHigh??v.valuation_high??0),valuation_confidence:v.valuationConfidence||v.valuation_confidence||'insufficient_data',expected_selling_price:price,expected_net:price*.8725,expected_profit:price*.8725-Number(item.acquired_cost||item.cost||0),updated_at:new Date().toISOString()};
      await update('inventory',item.id,patch);S.selected={...item,...patch};
    } else {
      d=await edgeAny([SWISH.functions.islamic],{tenant_id:S.tenant?.id,item_id:item.id,tenantId:S.tenant?.id,itemId:item.id,existingImageUrls:urls,knownAttributes:item.attributes||{}});
    }
    out.innerHTML=`<div class="success"><b>${kind==='identify'?'Identification':kind==='value'?'Valuation':'Islamic / countermark'} complete.</b><pre class="pre">${esc(JSON.stringify(d,null,2))}</pre></div>`;
    if(kind!=='islamic')setTimeout(()=>pageInventoryItem(S.selected),100);
  }catch(e){out.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}

async function pageIdentify(){
  replaceView(`<div class="card"><h2>Identify / Value</h2><p class="muted">Uses the existing SWISH AI Edge Functions and learning/verification data held by the backend. No AI API key is entered here.</p>
    <label class="drop" id="drop"><input id="files" type="file" accept="image/*" multiple class="hidden"><b>Drop images here or tap to choose</b><br><span class="muted">Multiple images improve identification.</span></label>
    <div id="previews" class="thumbgrid" style="margin-top:12px"></div>
    <div class="toolbar" style="margin-top:12px"><button class="btn primary" id="identifyBtn">Analyse with SWISH AI</button><button class="btn" id="clearFiles">Clear</button></div>
    <div id="identifyOut"></div></div>`);
  const input=document.querySelector('#files');const drop=document.querySelector('#drop');
  drop.onclick=()=>input.click();input.onchange=e=>addIdentifyFiles(e.target.files);
  drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();addIdentifyFiles(e.dataTransfer.files)};
  document.querySelector('#clearFiles').onclick=()=>{S.identifyFiles=[];S.identifyPreviews=[];drawPreviews()};
  document.querySelector('#identifyBtn').onclick=runNewIdentification;
}
function addIdentifyFiles(files){for(const f of Array.from(files||[])){S.identifyFiles.push(f);S.identifyPreviews.push(URL.createObjectURL(f));}drawPreviews();}
function drawPreviews(){const b=document.querySelector('#previews');if(!b)return;b.innerHTML=S.identifyPreviews.map((u,i)=>`<div style="position:relative"><img src="${esc(u)}"><button class="btn bad" style="position:absolute;right:2px;top:2px;padding:2px 6px" data-rm="${i}">Ã</button></div>`).join('');b.querySelectorAll('[data-rm]').forEach(x=>x.onclick=()=>{const i=Number(x.dataset.rm);S.identifyFiles.splice(i,1);S.identifyPreviews.splice(i,1);drawPreviews();});}
async function uploadImage(file,bucket='images',folder='identify'){
  const path=`${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const {data,error}=await sb.storage.from(bucket).upload(path,file,{upsert:true});
  if(error)throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
async function runNewIdentification(){
  const out=document.querySelector('#identifyOut');if(!S.identifyFiles.length){out.innerHTML='<div class="error">Add at least one image.</div>';return}
  out.innerHTML='<div class="empty"><div class="spinner"></div><p>Running SWISH identification engineâ¦</p></div>';
  try{
    const urls=[];for(const f of S.identifyFiles){try{urls.push(await uploadImage(f))}catch(e){}}
    const d=await edgeAny([SWISH.functions.identify,'swish-identify'],{images:urls.length?urls:S.identifyPreviews,image_data:urls.length?undefined:'local'});
    const candidates=d?.candidates||((d?.identification)?[d.identification]:[]);
    out.innerHTML=`<div class="card"><h3>Identification results</h3>${candidates.length?candidates.map((c,i)=>`<div class="row"><div class="grow"><div class="title">${esc(c.title||`Candidate ${i+1}`)}</div><div class="muted">${esc(c.category||'')} ${c.model?'Â· '+esc(c.model):''} Â· ${c.confidence==null?'':Math.round(Number(c.confidence)*100)+'% confidence'}</div><p class="small">${esc(c.description||'')}</p></div><div class="price">${money(c.estimated_value??c.valuation)}</div></div>`).join(''):'<div class="empty">No candidate returned.</div>'}
      <pre class="pre">${esc(JSON.stringify(d,null,2))}</pre>
      ${candidates.length?`<button class="btn primary" id="saveIdent">Save selected result to inventory</button>`:''}</div>`;
    if(candidates.length)document.querySelector('#saveIdent').onclick=()=>saveIdentified(candidates[0],d,urls);
  }catch(e){out.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
async function saveIdentified(c,d,urls){
  try{
    if(d?.item_id){toast('Identification updated existing item');go('inventory');return;}
    const row={title:c.title,brand:c.brand,model:c.model,category:c.category,valuation:c.estimated_value,description:c.description,identification_data:c,confidence:c.confidence,status:'active'};
    if(urls?.length)row.image_url=urls[0];
    await insert('inventory',row);toast('Item saved to inventory');go('inventory');
  }catch(e){toast(e.message,true)}
}

async function pageListings(){
  replaceView(`<div class="card"><h2>Listings</h2>${tabs([['all','All'],['active','Active'],['draft','Draft'],['scheduled','Scheduled'],['ended','Ended']],S.sub)}
    <div class="toolbar"><button class="btn primary" id="refreshListings">Refresh</button><button class="btn" id="newListing">New listing</button><button class="btn" id="reprAll">Reprice all</button></div><div id="listBox"><div class="empty">Loadingâ¦</div></div></div>`);
  bindSubs();document.querySelector('#refreshListings').onclick=loadListingsPage;document.querySelector('#reprAll').onclick=()=>runEdgeToast(SWISH.functions.repriceAll,{},'Bulk repricing triggered');document.querySelector('#newListing').onclick=()=>listingEditor();
  await loadListingsPage();
}
async function loadListingsPage(){
  const box=document.querySelector('#listBox');if(!box)return;
  try{
    let rows=await table('listings',{limit:1000,order:{column:'updated_at',ascending:false}});
    if(S.sub!=='all')rows=rows.filter(x=>x.status===S.sub);
    box.innerHTML=rows.length?`<div class="table-wrap"><table class="tbl"><thead><tr><th>Title</th><th>Platform</th><th>Status</th><th class="right">Price</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.title||'Untitled')}</td><td>${esc(x.platform||'')}</td><td>${esc(x.status||'')}</td><td class="right">${money(x.price)}</td><td><button class="btn" data-edit="${esc(x.id)}">Edit</button> <button class="btn" data-pre="${esc(x.id)}">Preflight</button> <button class="btn primary" data-pub="${esc(x.id)}">Publish</button> <button class="btn" data-rep="${esc(x.id)}">Reprice</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No listings found.</div>';
    box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>listingEditor(b.dataset.edit));
    box.querySelectorAll('[data-pre]').forEach(b=>b.onclick=()=>runEdgeToast(SWISH.functions.listingPreflight,{listing_id:b.dataset.pre},'Preflight complete'));
    box.querySelectorAll('[data-pub]').forEach(b=>b.onclick=()=>runEdgeToast(SWISH.functions.publishListing,{listing_id:b.dataset.pub},'Listing published'));
    box.querySelectorAll('[data-rep]').forEach(b=>b.onclick=()=>runEdgeToast(SWISH.functions.reprice,{listing_id:b.dataset.rep},'Listing repriced'));
  }catch(e){box.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
async function listingEditor(id){
  let x=id?await table('listings',{eq:{id},single:true}):{platform:'ebay',status:'draft'};
  replaceView(`<div class="card"><div class="toolbar"><button class="btn" id="backListings">â Listings</button><button class="btn primary" id="saveListing">Save</button>${id?'<button class="btn" id="preflight">Preflight</button><button class="btn good" id="publish">Publish</button>':''}</div><h2>${id?'Edit':'New'} Listing</h2>
    <div class="two"><div><label class="muted">Title *</label><input id="lfTitle" value="${esc(x.title)}"></div><div><label class="muted">Price (Â£)</label><input id="lfPrice" type="number" step="0.01" value="${esc(x.price??'')}"></div>
    <div><label class="muted">Platform</label><select id="lfPlatform"><option value="ebay">eBay</option><option value="amazon">Amazon</option><option value="depop">Depop</option><option value="vinted">Vinted</option></select></div>
    <div><label class="muted">Status</label><select id="lfStatus"><option>draft</option><option>active</option><option>ended</option><option>scheduled</option></select></div>
    <div><label class="muted">Condition</label><input id="lfCondition" value="${esc(x.condition)}"></div><div><label class="muted">Category</label><input id="lfCategory" value="${esc(x.category)}"></div>
    <div style="grid-column:1/-1"><label class="muted">Description</label><textarea id="lfDesc">${esc(x.description)}</textarea></div>
    <div><label class="muted">Inventory Item ID</label><input id="lfItem" value="${esc(x.item_id)}"></div></div><div id="listingMsg"></div></div>`);
  document.querySelector('#lfPlatform').value=x.platform||'ebay';document.querySelector('#lfStatus').value=x.status||'draft';
  document.querySelector('#backListings').onclick=()=>go('listings');
  document.querySelector('#saveListing').onclick=async()=>{try{
    const row={...x,title:document.querySelector('#lfTitle').value,price:Number(document.querySelector('#lfPrice').value||0),platform:document.querySelector('#lfPlatform').value,status:document.querySelector('#lfStatus').value,condition:document.querySelector('#lfCondition').value,category:document.querySelector('#lfCategory').value,description:document.querySelector('#lfDesc').value,item_id:document.querySelector('#lfItem').value||null};
    delete row.id; const saved=id?await update('listings',id,row):await insert('listings',row);toast('Listing saved');listingEditor(saved.id);
  }catch(e){toast(e.message,true)}};
  if(id){document.querySelector('#preflight').onclick=()=>runEdgeToast(SWISH.functions.listingPreflight,{listing_id:id},'Preflight complete');document.querySelector('#publish').onclick=()=>runEdgeToast(SWISH.functions.publishListing,{listing_id:id},'Published');}
}

async function createListingFromItem(item){
  const title=prompt('eBay title',item.title||item.canonical_title||'');if(title===null)return;
  const price=Number(prompt('eBay price',item.expected_selling_price||item.valuation_mid||''));if(!price)return;
  try{
    const d=await edge(SWISH.functions.generate,{tenant_id:S.tenant?.id,item_id:item.id,tenantId:S.tenant?.id,itemId:item.id,title,price,delivery_method:'SIMPLE_DELIVERY',deliveryMethod:'SIMPLE_DELIVERY'});
    const listingId=d?.listingId||d?.listing_id||d?.listing?.id||d?.id;if(!listingId)throw new Error('Listing generator returned no listing ID.');
    await edge('swish-ebay-list',{tenant_id:S.tenant?.id,item_id:item.id,tenantId:S.tenant?.id,itemId:item.id,listingId,listing_id:listingId,listingType:d.listingType||'FIXED_PRICE',categoryId:d.categoryId,deliveryMethod:'SIMPLE_DELIVERY'});
    toast('eBay listing submitted');
  }catch(e){toast(e.message,true)}
}

async function pageOrders(){
  replaceView(`<div class="card"><h2>Orders</h2><div class="toolbar"><button class="btn primary" id="syncOrders">Sync eBay orders</button><button class="btn" id="refreshOrders">Refresh</button></div><div id="ordersBox"></div></div>`);
  document.querySelector('#syncOrders').onclick=async()=>{try{await edge('ebay-orders',{tenantId:S.tenant?.id,daysBack:90});toast('eBay orders synced');await loadOrdersPage()}catch(e){toast(e.message,true)}};
  document.querySelector('#refreshOrders').onclick=loadOrdersPage;await loadOrdersPage();
}
async function loadOrdersPage(){
  const box=document.querySelector('#ordersBox');if(!box)return;try{const rows=await table('orders',{limit:500,order:{column:'created_at',ascending:false}});box.innerHTML=rows.length?`<div class="table-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Buyer</th><th>Status</th><th class="right">Total</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.external_order_id||x.order_id||x.id)}</td><td>${esc(x.buyer_name||x.buyer_username||'')}</td><td>${esc(x.status||'')}</td><td class="right">${money(x.total_amount??x.total)}</td><td><button class="btn" data-dispatch="${esc(x.id)}">Dispatch</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No orders.</div>';box.querySelectorAll('[data-dispatch]').forEach(b=>b.onclick=()=>dispatchOne(b.dataset.dispatch));}catch(e){box.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
async function dispatchOne(id){const n=prompt('Tracking number (optional)')||'';const c=prompt('Carrier (optional)','Royal Mail')||'';try{await edge(SWISH.functions.dispatch,{order_id:id,tracking_number:n,carrier:c});toast('Dispatched');loadOrdersPage()}catch(e){toast(e.message,true)}}

async function pageEbay(){
  replaceView(`<div class="card"><h2>eBay Hub</h2><p class="muted">All eBay credentials remain in the existing backend. This frontend only invokes the existing Edge Functions.</p>
    <div class="grid"><div class="card metric"><span class="muted">Account</span><b>${esc(S.connector?.status||'Unknown')}</b></div><div class="card metric"><span class="muted">Seller</span><b style="font-size:14px">${esc(S.connector?.seller_account_id||'â')}</b></div><div class="card metric"><span class="muted">Last sync</span><b style="font-size:14px">${datetime(S.connector?.last_sync_at)}</b></div><div class="card metric"><span class="muted">Publishing</span><b>${S.connector?.can_publish?'READY':'CHECK'}</b></div></div>
    <div class="toolbar"><button class="btn primary" id="ebayConnect">Connect eBay</button><button class="btn" id="ebaySync">Full sync</button><button class="btn" id="ebayListSync">Sync listings</button></div>
    <div class="four">
      ${[['ebayListings','Listings'],['categories','Category Manager'],['ebayOrders','Orders'],['messages','Messages'],['offers','Offers'],['returns','Returns'],['cases','Cases'],['finance','Finances'],['analytics','Analytics'],['import','Import / Export'],['logs','Logs']].map(x=>`<button class="btn" data-ebay="${x[0]}">${x[1]}</button>`).join('')}
    </div><div id="ebayMsg"></div></div>`);
  document.querySelector('#ebayConnect').onclick=async()=>{try{const d=await edge(SWISH.functions.ebayAuth,{});if(d?.url)window.open(d.url,'_blank');else toast('No OAuth URL returned',true)}catch(e){toast(e.message,true)}};
  document.querySelector('#ebaySync').onclick=()=>showBackendUnavailable('ebayMsg','Full eBay sync','ebay-sync');
  document.querySelector('#ebayListSync').onclick=()=>showBackendUnavailable('ebayMsg','eBay listings sync','ebay-sync-listings');
  document.querySelectorAll('[data-ebay]').forEach(b=>b.onclick=()=>ebaySub(b.dataset.ebay));
}
function ebaySub(p){S.page='ebay';S.sub=p;renderEbaySub();}
async function renderEbaySub(){
  const base=`<div class="card"><div class="toolbar"><button class="btn" id="backEbay">â eBay Hub</button></div>`;
  if(S.sub==='categories'){replaceView(base+'<h2>eBay Category Manager</h2><div id="ebaySubBox"></div></div>');return loadCategoryManager();}
  if(S.sub==='ebayListings'){replaceView(base+'<h2>eBay Listings</h2><div id="ebaySubBox"></div></div>');return loadEbayListings();}
  if(S.sub==='ebayOrders'){replaceView(base+'<h2>eBay Orders</h2><div id="ebaySubBox"></div></div>');return loadTableInto('ebay_orders','ebaySubBox');}
  if(S.sub==='messages'){replaceView(base+'<h2>eBay Messages</h2><div id="ebaySubBox"></div></div>');return loadMessages();}
  if(S.sub==='offers'){replaceView(base+'<h2>eBay Offers</h2><div id="ebaySubBox"></div></div>');return loadOffers();}
  if(S.sub==='returns'){replaceView(base+'<h2>eBay Returns</h2><div id="ebaySubBox"></div></div>');return loadReturns();}
  if(S.sub==='cases'){replaceView(base+'<h2>eBay Cases</h2><div id="ebaySubBox"></div></div>');return loadCases();}
  if(S.sub==='finance'){replaceView(base+'<h2>eBay Finances</h2><div id="ebaySubBox"></div></div>');return loadFinance();}
  if(S.sub==='analytics'){replaceView(base+'<h2>eBay Analytics</h2><div id="ebaySubBox"></div></div>');return loadAnalytics();}
  if(S.sub==='import'){replaceView(base+`<h2>eBay Import / Export</h2><div class="two"><div><select id="impType"><option>listings</option><option>orders</option><option>inventory</option><option>categories</option></select><input id="csvFile" type="file" accept=".csv,.xlsx"><button class="btn primary" id="importCsv">Import</button></div><div><button class="btn" id="exportCsv">Export</button></div></div><div id="ebaySubBox"></div></div>`);return bindImport();}
  if(S.sub==='logs'){replaceView(base+'<h2>eBay Logs</h2><div id="ebaySubBox"></div></div>');return loadLogs();}
}
function categoryValue(x){
  const a=obj(x.attributes||x.identification_data||{});
  return {id:x.ebay_category_id||x.category_id||x.ebay_categoryId||a.ebay_category_id||a.category_id||'',name:x.ebay_category_name||x.category_name||a.ebay_category_name||a.category_name||x.category||''};
}
async function ebayCategorySearch(term){
  const payload={tenant_id:S.tenant?.id,tenantId:S.tenant?.id,query:term,search:term,marketplace_id:'EBAY_GB',marketplaceId:'EBAY_GB'};
  for(const name of ['ebay-taxonomy-search','ebay-category-search','ebay-categories','ebay-taxonomy']){
    try{const d=await edge(name,payload);const rows=arr(d?.categories||d?.results||d?.data||d);if(rows.length)return rows;}catch(e){}
  }
  return [];
}
async function loadCategoryManager(){
  const b=document.querySelector('#ebaySubBox');if(!b)return;
  b.innerHTML=`<div class="toolbar"><input id="catSearch" placeholder="Search inventory title / SKU / category" style="min-width:240px"><button class="btn primary" id="catRefresh">Refresh inventory</button></div>
  <div class="card" style="margin:12px 0"><b>Category Manager</b><p class="muted">This uses the existing SWISH database. Search your inventory, choose an eBay category, then save it. SWISH will store the eBay category ID and name. The browser never receives eBay credentials.</p></div>
  <div id="catBox"><div class="empty">Loading inventoryâ¦</div></div>`;
  document.querySelector('#catRefresh').onclick=loadCategoryManager;
  document.querySelector('#catSearch').oninput=()=>renderCategoryRows(S.cache.categoryInventory||[],document.querySelector('#catSearch').value);
  await loadCategoryChoices();
}
async function loadCategoryChoices(){
  const inv=await safeTable('inventory',{limit:1000,order:{column:'created_at',ascending:false}});
  const listings=await safeTable('ebay_listings',{limit:1000,order:{column:'created_at',ascending:false}});
  const lm={};listings.forEach(x=>{const key=x.item_id||x.inventory_item_id||x.ebay_item_id||x.external_listing_id;if(key)lm[key]=x;});
  const rows=inv.length ? inv.map(x=>({...x,__listing:lm[x.id]||lm[x.ebay_item_id]||null,__cat:categoryValue({...x,...(lm[x.id]||{})})})) : listings.map(x=>({...x,id:x.inventory_item_id||x.item_id||x.id,__listing:x,__cat:categoryValue(x),__source:'ebay_listings',title:x.title||x.item_title,canonical_title:x.title||x.item_title,ebay_item_id:x.ebay_item_id||x.external_listing_id,external_listing_id:x.external_listing_id||x.ebay_item_id}));
  S.cache.categoryInventory=rows;renderCategoryRows(rows,'');
}
function renderCategoryRows(rows,term){
  const b=document.querySelector('#catBox');if(!b)return;term=String(term||'').toLowerCase().trim();
  const filtered=rows.filter(x=>!term||[x.title,x.canonical_title,x.sku,x.ebay_item_id,x.external_listing_id,x.__cat?.id,x.__cat?.name].some(v=>String(v||'').toLowerCase().includes(term)));
  if(!filtered.length){b.innerHTML='<div class="empty">No matching inventory items.</div>';return;}
  b.innerHTML=`<div class="table-wrap"><table class="tbl"><thead><tr><th>Item</th><th>eBay listing</th><th>Current category</th><th>Change</th></tr></thead><tbody>${filtered.map(x=>{const c=x.__cat||{};return `<tr><td><div class="title">${esc(x.title||x.canonical_title||x.sku||x.id)}</div><div class="muted">${esc(x.sku||x.id)}</div></td><td>${esc(x.ebay_item_id||x.external_listing_id||x.__listing?.external_listing_id||'Not linked')}</td><td>${c.id?`<b>${esc(c.id)}</b> Â· ${esc(c.name||'')}`:'<span class="muted">Not set</span>'}</td><td><button class="btn primary" data-cat-item="${esc(x.id)}">Select category</button></td></tr>`}).join('')}</tbody></table></div>`;
  b.querySelectorAll('[data-cat-item]').forEach(btn=>btn.onclick=()=>openCategoryEditor(btn.dataset.catItem));
}
async function openCategoryEditor(itemId){
  let item=null;
  try{item=await table('inventory',{eq:{id:itemId},single:true})}catch(_){}
  const listings=await safeTable('ebay_listings',{limit:1000});
  if(!item) item=listings.find(x=>(x.inventory_item_id||x.item_id||x.id)===itemId)||listings.find(x=>x.id===itemId);
  if(!item) throw new Error('Inventory/listing record not found');
  const listing=listings.find(x=>x.item_id===itemId||x.inventory_item_id===itemId||x.ebay_item_id===item.ebay_item_id||x.external_listing_id===item.external_listing_id)||null;
  const current=categoryValue({...item,...(listing||{})});
  replaceView(`<div class="card"><div class="toolbar"><button class="btn" id="catBack">â Category Manager</button></div><h2>Change eBay category</h2><p><b>${esc(item.title||item.canonical_title||item.id)}</b></p>
  <div class="two"><div><label class="muted">eBay Category ID</label><input id="catId" value="${esc(current.id)}" placeholder="e.g. 179731"></div><div><label class="muted">Category name</label><input id="catName" value="${esc(current.name)}" placeholder="e.g. Other Collectables"></div></div>
  <div class="toolbar" style="margin-top:12px"><input id="catChoiceSearch" placeholder="Type category name to search eBay"><button class="btn" id="catAI">AI suggest</button><button class="btn primary" id="catSave">Save category</button></div>
  <div id="catChoices"><div class="muted">Type at least 2 characters to search. If the existing backend exposes an eBay taxonomy search it will be used; otherwise enter the exact eBay category ID/name.</div></div><div id="catMsg"></div></div>`);
  document.querySelector('#catBack').onclick=()=>{S.sub='categories';renderEbaySub()};
  document.querySelector('#catChoiceSearch').oninput=async()=>{
    const q=document.querySelector('#catChoiceSearch').value.trim();if(q.length<2)return;
    const live=await ebayCategorySearch(q);const list=live.map(c=>({id:c.ebay_category_id||c.category_id||c.id||c.categoryId,name:c.ebay_category_name||c.category_name||c.name||c.category||''})).filter(c=>c.id&&c.name).slice(0,100);
    document.querySelector('#catChoices').innerHTML=list.length?list.map(c=>`<button class="btn" style="margin:4px" data-cat-choice="${esc(c.id)}" data-cat-name="${esc(c.name)}">${esc(c.name)} Â· ${esc(c.id)}</button>`).join(''):'<div class="muted">No live eBay category search is available through the existing backend. You can still enter the exact eBay category ID and name.</div>';
    document.querySelectorAll('[data-cat-choice]').forEach(x=>x.onclick=()=>{document.querySelector('#catId').value=x.dataset.catChoice;document.querySelector('#catName').value=x.dataset.catName});
  };
  document.querySelector('#catAI').onclick=async()=>{try{const urls=arr(item.media).filter(u=>/^https?:/i.test(u));const d=await edgeAny([SWISH.functions.identify,'swish-identify'],{tenant_id:S.tenant?.id,item_id:item.id,tenantId:S.tenant?.id,itemId:item.id,existingImageUrls:urls,specialistId:item.specialist_id||'curiosities_collectibles',knownAttributes:item.attributes||{},categorySuggestionOnly:true});const suggested=d?.category||d?.suggested_category||d?.result?.category||d?.candidates?.[0]?.category||'';if(suggested){document.querySelector('#catName').value=suggested;toast('AI suggestion added â select/enter the matching eBay category ID before saving')}else toast('AI did not return a category suggestion',true)}catch(e){toast(e.message,true)}};
  document.querySelector('#catSave').onclick=async()=>{const id=document.querySelector('#catId').value.trim(),name=document.querySelector('#catName').value.trim();if(!id||!name){toast('Enter both the eBay category ID and name',true);return}const msg=document.querySelector('#catMsg');msg.innerHTML='<div class="empty">Saving category to SWISHâ¦</div>';try{
    const patch={ebay_category_id:id,ebay_category_name:name,category:name,category_id:id,updated_at:new Date().toISOString()};
    if(item.__source!=='ebay_listings' && item.id) await update('inventory',item.id,patch).catch(()=>{});
    if(listing?.id) await update('ebay_listings',listing.id,patch).catch(()=>{});
    else if(item.__source==='ebay_listings' && item.id) await update('ebay_listings',item.id,patch).catch(()=>{});
    let ebayChanged=false;
    for(const fn of ['ebay-revise-listing','ebay-revise-item','ebay-category-update']){try{await edge(fn,{tenant_id:S.tenant?.id,tenantId:S.tenant?.id,item_id:item.id,itemId:item.id,listing_id:listing?.id,listingId:listing?.external_listing_id||listing?.ebay_item_id||item.ebay_item_id||item.external_listing_id,categoryId:id,category_id:id,categoryName:name,category_name:name});ebayChanged=true;break}catch(e){}}
    msg.innerHTML=ebayChanged?'<div class="success">Category saved to SWISH and the existing eBay revision action accepted the update.</div>':'<div class="success">Category saved to SWISH. The current backend did not expose an eBay category-revision action, so the live eBay listing was not falsely reported as changed.</div>';
  }catch(e){msg.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
}

async function loadEbayListings(){const box=document.querySelector('#ebaySubBox');try{const rows=await table('ebay_listings',{limit:500,order:{column:'created_at',ascending:false}});box.innerHTML=tableHTML(rows,['title','status','price','external_listing_id'],true)}catch(e){box.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
function tableHTML(rows,fields,actions=false){if(!rows.length)return'<div class="empty">No records.</div>';return`<div class="table-wrap"><table class="tbl"><thead><tr>${fields.map(f=>`<th>${esc(f.replace(/_/g,' '))}</th>`).join('')}${actions?'<th>Actions</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr>${fields.map(f=>`<td>${esc(typeof r[f]==='number'&&/price|amount|total/.test(f)?money(r[f]):r[f]??'')}</td>`).join('')}${actions?`<td><button class="btn" data-reprice="${esc(r.id||'')}">Reprice</button></td>`:''}</tr>`).join('')}</tbody></table></div>`}
async function loadTableInto(name,id){const b=document.querySelector('#'+id);try{const rows=await table(name,{limit:500,order:{column:'created_at',ascending:false}});b.innerHTML=tableHTML(rows,Object.keys(rows[0]||{}).filter(k=>['id','tenant_id'].indexOf(k)<0).slice(0,7));}catch(e){b.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
async function loadMessages(){const b=document.querySelector('#ebaySubBox');try{const rows=await table('ebay_messages',{limit:200,order:{column:'created_at',ascending:false}});b.innerHTML=rows.length?rows.map(r=>`<div class="row"><div class="grow"><div class="title">${esc(r.subject||'eBay message')}</div><div class="muted">${esc(r.buyer_username||'')} Â· ${esc(r.body||r.message||'')}</div></div><button class="btn" data-msg="${esc(r.message_id||r.id)}">Reply</button></div>`).join(''):'<div class="empty">No messages.</div>';b.querySelectorAll('[data-msg]').forEach(x=>x.onclick=async()=>{const text=prompt('Reply');if(!text)return;try{await edge(SWISH.functions.ebayReply,{message_id:x.dataset.msg,body:text});toast('Reply sent')}catch(e){toast(e.message,true)}})}catch(e){b.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
async function loadOffers(){const b=document.querySelector('#ebaySubBox');try{const rows=await table('ebay_offers',{limit:200,order:{column:'created_at',ascending:false}});b.innerHTML=rows.map(r=>`<div class="row"><div class="grow"><div class="title">${esc(r.title||r.item_title||r.offer_id)}</div><div class="muted">${money(r.offer_price)} Â· ${esc(r.status||'')}</div></div><button class="btn good" data-offer="${esc(r.id)}" data-action="accept">Accept</button><button class="btn bad" data-offer="${esc(r.id)}" data-action="decline">Decline</button></div>`).join('')||'<div class="empty">No offers.</div>';b.querySelectorAll('[data-offer]').forEach(x=>x.onclick=async()=>{try{await edge(SWISH.functions.ebayOffer,{offer_id:x.dataset.offer,action:x.dataset.action});toast('Offer updated');loadOffers()}catch(e){toast(e.message,true)}})}catch(e){b.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
async function loadReturns(){const b=document.querySelector('#ebaySubBox');try{const rows=await table('ebay_returns',{limit:200,order:{column:'created_at',ascending:false}});b.innerHTML=rows.map(r=>`<div class="row"><div class="grow"><div class="title">${esc(r.return_id||r.external_return_id)}</div><div class="muted">${esc(r.status||'')} Â· ${esc(r.reason||'')}</div></div><button class="btn" data-ret="${esc(r.id)}">Action</button></div>`).join('')||'<div class="empty">No returns.</div>';b.querySelectorAll('[data-ret]').forEach(x=>x.onclick=async()=>{const a=prompt('Return action','accept');if(!a)return;try{await edge(SWISH.functions.ebayReturn,{return_id:x.dataset.ret,action:a});toast('Return action submitted')}catch(e){toast(e.message,true)}})}catch(e){b.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
async function loadCases(){const b=document.querySelector('#ebaySubBox');try{const rows=await table('ebay_cases',{limit:200,order:{column:'created_at',ascending:false}});b.innerHTML=rows.map(r=>`<div class="row"><div class="grow"><div class="title">${esc(r.case_id||r.external_case_id)}</div><div class="muted">${esc(r.status||'')} Â· ${esc(r.reason||'')}</div></div><button class="btn" data-case="${esc(r.id)}">Respond</button></div>`).join('')||'<div class="empty">No cases.</div>';b.querySelectorAll('[data-case]').forEach(x=>x.onclick=async()=>{try{await edge(SWISH.functions.ebayCase,{case_id:x.dataset.case});toast('Case response submitted')}catch(e){toast(e.message,true)}})}catch(e){b.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
async function loadFinance(){const b=document.querySelector('#ebaySubBox');try{const summary=await edge(SWISH.functions.ebayFinance,{});const payouts=await table('ebay_payouts',{limit:50,order:{column:'created_at',ascending:false}});const tx=await table('ebay_transactions',{limit:50,order:{column:'created_at',ascending:false}});b.innerHTML=`<pre class="pre">${esc(JSON.stringify(summary,null,2))}</pre><h3>Payouts</h3>${tableHTML(payouts,['payout_id','amount','status','created_at'])}<h3>Transactions</h3>${tableHTML(tx,['transaction_id','amount','type','created_at'])}`}catch(e){b.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
async function loadAnalytics(){const b=document.querySelector('#ebaySubBox');try{const a=await edge(SWISH.functions.ebayAnalytics,{});const orders=await table('orders',{limit:500});const by={};orders.forEach(o=>{const d=new Date(o.created_at||Date.now());const k=`${d.getMonth()+1}/${d.getFullYear()}`;by[k]??={orders:0,revenue:0};by[k].orders++;by[k].revenue+=Number(o.total_amount||o.sale_price||0)});b.innerHTML=`<pre class="pre">${esc(JSON.stringify(a,null,2))}</pre><div class="table-wrap"><table class="tbl"><thead><tr><th>Month</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>${Object.entries(by).slice(-12).map(([k,v])=>`<tr><td>${k}</td><td>${v.orders}</td><td>${money(v.revenue)}</td></tr>`).join('')}</tbody></table></div>`}catch(e){b.innerHTML=`<div class="error">${esc(e.message)}</div>`}}

function normKey(v){
  return String(v??'').toLowerCase().trim().replace(/[\u2018\u2019]/g,"'").replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function rowMap(row){
  const out={};
  Object.entries(row||{}).forEach(([k,v])=>{out[normKey(k)]=v});
  return out;
}
function pick(row,keys){
  const r=rowMap(row);
  for(const k of keys){
    const v=r[normKey(k)];
    if(v!==undefined && v!==null && String(v).trim()!=='') return v;
  }
  return '';
}
function num(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(String(v).replace(/[Â£$,]/g,'').trim());
  return Number.isFinite(n)?n:null;
}
function splitUrls(v){
  if(!v)return [];
  return String(v).split(/[\s,|;]+/).map(x=>x.trim()).filter(x=>/^https?:\/\//i.test(x));
}
function ebayCsvItem(row){
  const itemId=String(pick(row,['Item number','Item ID','eBay item ID','eBay item number','Listing ID','Listing number'])||'').trim();
  const title=String(pick(row,['Title','Item title','Listing title','Name'])||'Untitled eBay item').trim();
  const sku=String(pick(row,['Custom label (SKU)','Custom label','SKU','Seller SKU','Seller reference'])||'').trim();
  const price=num(pick(row,['Current price','Buy It Now price','Price','Start price','Sale price','Listing price']));
  const categoryId=String(pick(row,['eBay category 1 ID','eBay category ID','Category 1 ID','Category ID','eBay categoryId'])||'').trim();
  const categoryName=String(pick(row,['eBay category 1 name','eBay category name','Category 1 name','Category name','Category 1'])||'').trim();
  const description=String(pick(row,['Description','Item description','Listing description'])||'').trim();
  const condition=String(pick(row,['Condition','Condition description'])||'').trim();
  const imageValue=pick(row,['Picture URL','Picture URLs','Image URL','Image URLs','Gallery URL','Pic URL','Photo URL']);
  const images=splitUrls(imageValue);
  const statusRaw=String(pick(row,['Listing status','Status','Item status'])||'').trim().toLowerCase();
  const status=statusRaw.includes('ended')||statusRaw.includes('sold')?'ended':statusRaw||'active';
  const quantity=num(pick(row,['Available quantity','Quantity','Quantity available']));
  return {
    itemId,title,sku,price,categoryId,categoryName,description,condition,images,status,quantity,
    raw:row
  };
}
async function importEbayRowsDirect(rows,type){
  const parsed=rows.map(ebayCsvItem).filter(x=>x.itemId||x.title!=='Untitled eBay item');
  if(!parsed.length)throw new Error('No usable eBay listing rows were found in the file.');
  const existing=await safeTable('inventory',{limit:5000});
  const byEbay=new Map(),bySku=new Map();
  existing.forEach(x=>{
    [x.ebay_item_id,x.external_listing_id,x.ebay_item_number,x.item_number].forEach(k=>{if(k)byEbay.set(String(k),x)});
    if(x.sku)bySku.set(String(x.sku).toLowerCase(),x);
  });
  const stats={read:parsed.length,updated:0,created:0,failed:0,failures:[],categories:{}};
  for(const p of parsed){
    if(p.categoryId||p.categoryName){
      const key=`${p.categoryId||''}|${p.categoryName||''}`;
      stats.categories[key]=(stats.categories[key]||0)+1;
    }
    const existingRow=(p.itemId&&byEbay.get(p.itemId))||(p.sku&&bySku.get(p.sku.toLowerCase()));
    const patch={
      title:p.title,
      sku:p.sku||existingRow?.sku||null,
      description:p.description||existingRow?.description||null,
      condition:p.condition||existingRow?.condition||null,
      status:p.status,
      price:p.price,
      expected_selling_price:p.price,
      ebay_item_id:p.itemId||existingRow?.ebay_item_id||null,
      external_listing_id:p.itemId||existingRow?.external_listing_id||null,
      ebay_category_id:p.categoryId||existingRow?.ebay_category_id||null,
      ebay_category_name:p.categoryName||existingRow?.ebay_category_name||null,
      category:p.categoryName||existingRow?.category||null,
      category_id:p.categoryId||existingRow?.category_id||null,
      image_url:p.images[0]||existingRow?.image_url||null,
      media:p.images.length?p.images:(Array.isArray(existingRow?.media)?existingRow.media:[]),
      attributes:{
        ...(obj(existingRow?.attributes)),
        ebay_imported:true,
        ebay_item_id:p.itemId||existingRow?.ebay_item_id||null,
        ebay_category_id:p.categoryId||existingRow?.ebay_category_id||null,
        ebay_category_name:p.categoryName||existingRow?.ebay_category_name||null,
        import_type:type,
        imported_at:new Date().toISOString(),
        ebay_raw:p.raw
      },
      updated_at:new Date().toISOString()
    };
    // Do not send undefined values; null is intentional for known fields.
    try{
      if(existingRow?.id){
        await update('inventory',existingRow.id,patch);
        stats.updated++;
      }else{
        const created=await insert('inventory',patch);
        stats.created++;
        if(created?.id){
          const copy={...created};
          if(p.itemId)byEbay.set(p.itemId,copy);
          if(p.sku)bySku.set(p.sku.toLowerCase(),copy);
        }
      }
    }catch(e){
      stats.failed++;
      if(stats.failures.length<20)stats.failures.push({item:p.itemId||p.title,error:e.message||String(e)});
    }
  }
  return stats;
}
function categorySummaryHtml(stats){
  const cats=Object.entries(stats.categories||{}).sort((a,b)=>b[1]-a[1]);
  if(!cats.length)return '';
  return `<div class="card" style="margin-top:12px"><h3>Proven eBay Categories</h3><p class="muted">Read directly from the eBay Category ID/name columns in the imported file. No new category table was created.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>eBay category</th><th>ID</th><th>Uses</th></tr></thead><tbody>${cats.slice(0,50).map(([k,n])=>{const [id,name]=k.split('|');return `<tr><td>${esc(name||'')}</td><td>${esc(id||'')}</td><td>${n}</td></tr>`}).join('')}</tbody></table></div></div>`;
}


function csvDataUrlFromText(text){
  const bytes=new TextEncoder().encode(String(text||''));
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  }
  return 'data:text/csv;base64,'+btoa(binary);
}

function rowsToEbayCsv(rows){
  if(typeof XLSX==='undefined') throw new Error('XLSX parser is not loaded. Check index.html.');
  const ws=XLSX.utils.json_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(ws);
}

function ebayImportPayload(type,filename,rows,csvUrl){
  return {
    type:type==='inventory'?'listings':type,
    tenantId:S.tenant?.id,
    tenant_id:S.tenant?.id,
    filename,
    csv_url:csvUrl,
    rows,
    normalized_rows:rows,
    source:'ebay_active_listings_csv',
    marketplace_id:'EBAY_GB',
    marketplaceId:'EBAY_GB',
    mapping:{
      ebay_item_id:'Item number',
      title:'Title',
      sku:'Custom label (SKU)',
      quantity:'Available quantity',
      format:'Format',
      currency:'Currency',
      start_price:'Start price',
      buy_it_now_price:'Auction Buy It Now price',
      current_price:'Current price',
      sold_quantity:'Sold quantity',
      watchers:'Watchers',
      bids:'Bids',
      start_date:'Start date',
      end_date:'End date',
      category_1_name:'eBay category 1 name',
      category_1_id:'eBay category 1 number',
      category_2_name:'eBay category 2 name',
      category_2_id:'eBay category 2 number',
      condition:'Condition',
      epid:'eBay Product ID(ePID)',
      listing_site:'Listing site',
      upc:'P:UPC',
      ean:'P:EAN',
      isbn:'P:ISBN'
    },
    match_priority:['ebay_item_id','sku'],
    preserve_existing_fields:[
      'images','media','image_urls','description',
      'identification_data','identification_confidence','attributes',
      'valuation_low','valuation_mid','valuation_high','valuation_confidence',
      'expected_selling_price','expected_profit'
    ],
    prevent_duplicates:true
  };
}

/*
 * IMPORTANT:
 * The existing ebay-import-csv Edge Function is the canonical import route.
 * It expects to LOAD the CSV itself. The old GitHub version tried to give
 * it rows only, which caused the backend to return one "Load failed" result
 * for every item.
 *
 * We therefore give the existing function a fetchable DATA URL containing
 * the actual eBay CSV. This avoids the missing "imports" storage bucket.
 * No new database, storage bucket or Edge Function is created.
 */
async function importEbayRowsViaBackend(rows,type,filename,originalCsvText){
  const csvText=originalCsvText || rowsToEbayCsv(rows);
  const csvUrl=csvDataUrlFromText(csvText);
  const payload=ebayImportPayload(type,filename,rows,csvUrl);

  const d=await edge(SWISH.functions.ebayImport,payload);

  return {
    ...(d||{}),
    success:d?.success!==false,
    read:Number(d?.read??d?.total??rows.length),
    created:Number(d?.created??d?.inserted??d?.created_count??0),
    updated:Number(d?.updated??d?.updated_count??0),
    duplicates:Number(d?.duplicates??d?.duplicate_count??0),
    failed:Number(d?.failed??d?.failed_count??d?.failures?.length??0),
    failures:Array.isArray(d?.failures)?d.failures:(Array.isArray(d?.errors)?d.errors:[])
  };
}

function categorySummaryHtmlFromRows(rows){
  const counts=new Map();
  for(const r of rows){
    const id=r.ebay_category_1_id||r.category_1_id||r.categoryId||'';
    const name=r.ebay_category_1_name||r.category_1_name||r.categoryName||'';
    if(id||name){
      const k=id+'|'+name;
      counts.set(k,(counts.get(k)||0)+1);
    }
  }
  const cats=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  if(!cats.length)return '';
  return `<div class="card" style="margin-top:12px"><h3>Proven eBay Categories</h3><p class="muted">Read directly from the supplied eBay Category ID/name columns. No category table was created.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>eBay category</th><th>ID</th><th>Uses</th></tr></thead><tbody>${cats.slice(0,50).map(([k,n])=>{const [id,name]=k.split('|');return `<tr><td>${esc(name||'')}</td><td>${esc(id||'')}</td><td>${n}</td></tr>`}).join('')}</tbody></table></div></div>`;
}

async function bindImport(){
  const importBtn=document.querySelector('#importCsv');
  const exportBtn=document.querySelector('#exportCsv');
  if(!importBtn)return;

  importBtn.onclick=async()=>{
    const f=document.querySelector('#csvFile')?.files?.[0];
    if(!f)return toast('Choose an eBay CSV/XLSX file first.',true);

    const box=document.querySelector('#ebaySubBox');
    importBtn.disabled=true;
    importBtn.textContent='Readingâ¦';
    if(box)box.innerHTML='<div class="empty"><div class="spinner"></div><p>Reading the eBay exportâ¦</p></div>';

    try{
      if(typeof XLSX==='undefined')throw new Error('XLSX parser is not loaded. Check index.html.');

      const buf=await f.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',cellDates:true});
      const sheet=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
      if(!rows.length)throw new Error('The selected eBay file contains no data rows.');

      const type=document.querySelector('#impType')?.value||'listings';
      if(type==='listings'||type==='inventory'){
        const parsed=rows.map(ebayCsvItem).filter(x=>x.itemId||x.title!=='Untitled eBay item');
        if(!parsed.length)throw new Error('No usable eBay listing rows were found.');

        /*
         * Convert the ORIGINAL eBay worksheet back to CSV. The existing
         * backend can now fetch this data URL without the missing imports
         * storage bucket.
         */
        const csvText=XLSX.utils.sheet_to_csv(sheet);

        if(box)box.innerHTML=`<div class="empty"><div class="spinner"></div><p>Sending ${parsed.length} eBay listings to the existing SWISH import serviceâ¦</p><p class="muted">No browser-side inventory writes. No storage bucket required.</p></div>`;

        const stats=await importEbayRowsViaBackend(parsed,type,f.name,csvText);

        const failed=Number(stats.failed||0);
        const created=Number(stats.created||0);
        const updated=Number(stats.updated||0);
        const duplicates=Number(stats.duplicates||0);

        if(box){
          box.innerHTML=`
            <div class="${failed ? 'error' : 'success'}">
              <b>eBay import ${failed ? 'returned failures' : 'completed'}.</b>
              <br>${created} created Â· ${updated} updated Â· ${duplicates} duplicates Â· ${failed} failed Â· ${parsed.length} rows read
              <p class="muted">Backend: existing <code>ebay-import-csv</code> Edge Function.</p>
            </div>
            ${stats.failures?.length?`<div class="error" style="margin-top:12px"><b>Backend response</b><pre class="pre">${esc(JSON.stringify(stats.failures.slice(0,20),null,2))}</pre></div>`:''}
            ${categorySummaryHtmlFromRows(parsed.map(x=>({
              ebay_category_1_id:x.categoryId,
              ebay_category_1_name:x.categoryName
            })))}`;
        }

        await loadInventory();
      }else{
        const csvText=XLSX.utils.sheet_to_csv(sheet);
        const d=await edge(SWISH.functions.ebayImport,
          ebayImportPayload(type,f.name,rows,csvDataUrlFromText(csvText)));
        if(box)box.innerHTML=`<div class="success">Import completed.<pre class="pre">${esc(JSON.stringify(d,null,2))}</pre></div>`;
      }
    }catch(e){
      if(box)box.innerHTML=`<div class="error"><b>eBay CSV import failed.</b><br>${esc(e.message||String(e))}<p class="muted">The existing <code>ebay-import-csv</code> backend was called using a fetchable data URL. No new database or storage bucket was created.</p></div>`;
    }finally{
      importBtn.disabled=false;
      importBtn.textContent='Import';
    }
  };

  if(exportBtn){
    exportBtn.onclick=async()=>{
      try{
        const d=await edge(SWISH.functions.ebayExport,{
          type:document.querySelector('#impType')?.value||'listings',
          tenant_id:S.tenant?.id,
          tenantId:S.tenant?.id
        });
        if(d?.url)window.open(d.url,'_blank');
        else toast('Export triggered');
      }catch(e){toast(e.message,true)}
    };
  }
}
async function loadLogs(){const b=document.querySelector('#ebaySubBox');try{const rows=await table('ebay_logs',{limit:300,order:{column:'created_at',ascending:false}});b.innerHTML=rows.map(r=>`<div class="row"><div class="grow"><div class="title">${esc(r.event||r.action||'eBay log')}</div><div class="muted">${datetime(r.created_at)} Â· ${esc(r.level||'info')}</div><pre class="pre">${esc(JSON.stringify(r,null,2))}</pre></div></div>`).join('')||'<div class="empty">No logs.</div>'}catch(e){b.innerHTML=`<div class="error">${esc(e.message)}</div>`}}

async function pageMore(){
  replaceView(`<div class="card"><h2>SWISH tools</h2><div class="four">
    ${[['acquisitions','Acquisitions'],['opportunities','Opportunities'],['review','Review required'],['audit','Audit'],['dispatch','Dispatch'],['repricing','Repricing'],['insights','Insights'],['money','Money'],['tasks','Tasks'],['command','Command Centre'],['settings','Settings']].map(x=>`<button class="btn" data-more="${x[0]}">${x[1]}</button>`).join('')}
  </div><div class="toolbar" style="margin-top:12px"><button class="btn bad" id="signout">Sign out</button></div></div>`);
  document.querySelectorAll('[data-more]').forEach(b=>b.onclick=(e)=>{e.preventDefault();go(b.dataset.more)});
  document.querySelector('#signout').onclick=async()=>{await sb.auth.signOut();S.user=null;renderLogin()};
}
async function genericCrudPage(title,tableName,fields){
  replaceView(`<div class="card"><h2>${title}</h2><div class="toolbar"><button class="btn primary" id="refreshGeneric">Refresh</button><button class="btn" id="newGeneric">New</button></div><div id="genericBox"></div></div>`);
  document.querySelector('#refreshGeneric').onclick=()=>genericCrudPage(title,tableName,fields);
  document.querySelector('#newGeneric').onclick=async()=>{const row={};fields.forEach(f=>row[f]=prompt(f.replace(/_/g,' '))||'');try{await insert(tableName,row);toast('Created');genericCrudPage(title,tableName,fields)}catch(e){toast(e.message,true)}};
  try{const rows=await safeTable(tableName,{limit:500,order:{column:'created_at',ascending:false}});document.querySelector('#genericBox').innerHTML=tableHTML(rows,fields)}catch(e){document.querySelector('#genericBox').innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
function pageAcquisitions(){return genericCrudPage('Acquisitions','acquisitions',['source','platform','total_cost','item_count','status','notes'])}
function pageOpportunities(){return genericCrudPage('Opportunities','opportunities',['title','platform','buy_price','estimated_sell_price','margin','status'])}
async function pageReview(){await genericReview('Review Required','inventory')}
async function genericReview(title,name){const rows=await safeTable(name,{limit:500});const r=rows.filter(x=>x.status==='review'||Number(x.confidence??x.identification_confidence??0)<.65);replaceView(`<div class="card"><h2>${title}</h2>${r.length?r.map(x=>`<div class="row"><div class="grow"><div class="title">${esc(x.title||x.canonical_title||x.sku||x.id)}</div><div class="muted">${esc(x.notes||'Needs attention')}</div></div><button class="btn primary" data-review="${esc(x.id)}">Identify</button></div>`).join(''):'<div class="empty">Nothing requires review.</div>'}</div>`);document.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{try{await edgeAny([SWISH.functions.identify,'swish-identify'],{item_id:b.dataset.review});toast('Re-identification triggered')}catch(e){toast(e.message,true)}})}
function pageAudit(){return genericCrudPage('Audit','audit_log',['action','entity_type','entity_id','created_at'])}
function pageDispatch(){return genericCrudPage('Dispatch','orders',['external_order_id','buyer_name','status','dispatch_by','tracking_number','carrier'])}
function pageRepricing(){return genericCrudPage('Repricing','listings',['title','platform','price','suggested_price','status'])}
async function pageInsights(){const [inv,orders]=await Promise.all([safeTable('inventory',{limit:1000}),safeTable('orders',{limit:1000})]);replaceView(`<div class="card"><h2>Insights</h2><div class="grid"><div class="card metric"><span class="muted">Inventory</span><b>${inv.length}</b></div><div class="card metric"><span class="muted">Orders</span><b>${orders.length}</b></div><div class="card metric"><span class="muted">Inventory value</span><b>${money(inv.reduce((s,x)=>s+Number(x.expected_selling_price||x.valuation_mid||x.valuation||0),0))}</b></div><div class="card metric"><span class="muted">Sales</span><b>${money(orders.reduce((s,x)=>s+Number(x.total_amount||x.sale_price||0),0))}</b></div></div></div>`)}
async function pageMoney(){let summary=null;try{summary=await edge(SWISH.functions.ebayFinanceSummary,{})}catch(e){}const [fees,orders,payouts]=await Promise.all([safeTable('fees',{limit:500}),safeTable('orders',{limit:500}),safeTable('payouts',{limit:500})]);replaceView(`<div class="card"><h2>Money</h2><pre class="pre">${esc(JSON.stringify(summary,null,2))}</pre><div class="grid"><div class="card metric"><span class="muted">Orders</span><b>${money(orders.reduce((s,x)=>s+Number(x.total_amount||x.total||0),0))}</b></div><div class="card metric"><span class="muted">Fees</span><b>${money(fees.reduce((s,x)=>s+Number(x.amount||x.fee_amount||0),0))}</b></div><div class="card metric"><span class="muted">Payouts</span><b>${money(payouts.reduce((s,x)=>s+Number(x.amount||0),0))}</b></div></div></div>`)}
async function pageTasks(){const rows=await safeTable('tasks',{limit:500,order:{column:'created_at',ascending:false}});replaceView(`<div class="card"><h2>Tasks</h2><div class="toolbar"><button class="btn primary" id="newTask">New task</button></div>${rows.map(t=>`<div class="row"><button class="btn" data-task="${esc(t.id)}">${t.status==='completed'?'â':'â'}</button><div class="grow"><div class="title">${esc(t.title)}</div><div class="muted">${esc(t.priority||'medium')} Â· ${date(t.due_date)}</div></div></div>`).join('')||'<div class="empty">No tasks.</div>'}</div>`);const newTask=document.querySelector('#newTask'); if(newTask)newTask.onclick=async()=>{const title=prompt('Task title');if(!title)return;try{await insert('tasks',{title,status:'open',priority:'medium'});toast('Task created');pageTasks()}catch(e){toast(e.message,true)}};document.querySelectorAll('[data-task]').forEach(b=>b.onclick=async()=>{const t=rows.find(x=>x.id===b.dataset.task);try{await update('tasks',t.id,{status:t.status==='completed'?'open':'completed',completed_at:t.status==='completed'?null:new Date().toISOString()});pageTasks()}catch(e){toast(e.message,true)}})}
async function pageCommand(){const inv=await safeTable('inventory',{limit:1000});replaceView(`<div class="card"><h2>Command Centre</h2><div class="grid"><div class="card metric"><span class="muted">Inventory</span><b>${inv.length}</b></div><div class="card metric"><span class="muted">Backend</span><b>ONLINE</b></div></div><div class="toolbar"><button class="btn primary" id="cmdSync">Sync inventory</button><button class="btn" id="cmdOrders">Sync orders</button><button class="btn" id="cmdListings">Sync listings</button><button class="btn" id="cmdIdentify">Batch identify</button><button class="btn" id="cmdReprice">Reprice all</button></div>
    <div class="card"><h3>AI / Learning Engine controls</h3><p class="muted">These buttons call the existing SWISH specialist/learning layers. They do not contain an AI provider key in the browser.</p>
      <div class="toolbar"><input id="engineItem" placeholder="Existing inventory item ID"><button class="btn primary" id="engReId">Identify / Re-ID</button><button class="btn" id="engIslamic">Islamic / Countermark</button><button class="btn" id="engValue">Market value</button><button class="btn" id="engDecompose">Decompose</button></div>
    </div><div id="cmdOut"></div></div>`);
  const gof=(f,p,msg)=>runAction(f,p,msg,'cmdOut');
  document.querySelector('#cmdSync').onclick=()=>gof('sync-inventory',{tenantId:S.tenant?.id},'Inventory sync complete');
  document.querySelector('#cmdOrders').onclick=()=>gof('sync-orders',{tenantId:S.tenant?.id},'Order sync complete');
  document.querySelector('#cmdListings').onclick=()=>gof('sync-listings',{tenantId:S.tenant?.id},'Listing sync complete');
  document.querySelector('#cmdIdentify').onclick=()=>gof('batch-identify',{tenantId:S.tenant?.id},'Batch identification triggered');
  document.querySelector('#cmdReprice').onclick=()=>gof(SWISH.functions.repriceAll,{},'Bulk repricing triggered');
  const runEngineById=async(kind)=>{
    const id=document.querySelector('#engineItem').value.trim();if(!id)return toast('Enter an inventory item ID',true);
    try{
      const item=await table('inventory',{eq:{id},single:true});const urls=arr(item.media).filter(u=>/^https?:/i.test(u));
      let names,payload;
      if(kind==='identify'){names=[SWISH.functions.identify,'swish-identify'];payload={tenant_id:S.tenant?.id,item_id:id,tenantId:S.tenant?.id,itemId:id,existingImageUrls:urls,specialistId:item.specialist_id||'curiosities_collectibles',knownAttributes:item.attributes||{}}}
      if(kind==='islamic'){names=[SWISH.functions.islamic];payload={tenant_id:S.tenant?.id,item_id:id,tenantId:S.tenant?.id,itemId:id,existingImageUrls:urls,knownAttributes:item.attributes||{}}}
      if(kind==='value'){names=[SWISH.functions.value,SWISH.functions.marketValue];payload={tenant_id:S.tenant?.id,item_id:id,tenantId:S.tenant?.id,itemId:id,title:item.title||item.canonical_title||'Unknown item',specialistId:item.specialist_id||'curiosities_collectibles',attributes:item.attributes||{},condition:item.condition||'',identificationConfidence:Number(item.identification_confidence??item.confidence??0),identificationTier:Number(item.identification_confidence??item.confidence??0)>=.85?'high':Number(item.identification_confidence??item.confidence??0)>=.65?'medium':'low',numistaTypeId:item.attributes?.numista_type_id?Number(item.attributes.numista_type_id):null,numistaMatchScore:Number(item.attributes?.numista_match_score||0),numistaMatchTier:item.attributes?.numista_status||'no_match',applyToItem:false}}
      if(kind==='decompose'){names=[SWISH.functions.decompose];payload={tenant_id:S.tenant?.id,item_id:id,tenantId:S.tenant?.id,itemId:id,existingImageUrls:urls,knownAttributes:item.attributes||{}}}
      const d=await edgeAny(names,payload);document.querySelector('#cmdOut').innerHTML=`<div class="success">AI engine complete.<pre class="pre">${esc(JSON.stringify(d,null,2))}</pre></div>`;
    }catch(e){document.querySelector('#cmdOut').innerHTML=`<div class="error">${esc(e.message)}</div>`}
  };
  document.querySelector('#engReId').onclick=()=>runEngineById('identify');
  document.querySelector('#engIslamic').onclick=()=>runEngineById('islamic');
  document.querySelector('#engValue').onclick=()=>runEngineById('value');
  document.querySelector('#engDecompose').onclick=()=>runEngineById('decompose');
}
async function pageSettings(){const p=S.user?await table('profiles',{eq:{id:S.user.id},single:true}).catch(()=>({})):{};replaceView(`<div class="card"><h2>Settings</h2><div class="two"><div><label class="muted">Email</label><input value="${esc(S.user?.email||'')}" disabled></div><div><label class="muted">Full name</label><input id="profName" value="${esc(p?.full_name||'')}"></div><div><label class="muted">Phone</label><input id="profPhone" value="${esc(p?.phone||'')}"></div><div><label class="muted">Timezone</label><select id="profTZ"><option>Europe/London</option><option>Europe/Paris</option><option>America/New_York</option></select></div></div><div class="toolbar" style="margin-top:12px"><button class="btn primary" id="saveProf">Save profile</button></div></div>`);document.querySelector('#saveProf').onclick=async()=>{try{await sb.from('profiles').upsert({...(p||{}),id:S.user.id,full_name:document.querySelector('#profName').value,phone:document.querySelector('#profPhone').value,timezone:document.querySelector('#profTZ').value});toast('Profile saved')}catch(e){toast(e.message,true)}}}

function showBackendUnavailable(target,title,fn){
  const el=document.querySelector('#'+target);
  if(el)el.innerHTML=`<div class="error"><b>${esc(title)} unavailable.</b><br>
    Existing SWISH backend function <code>${esc(fn)}</code> is returning HTTP 404.
    <p class="muted">No replacement backend has been created. CSV import uses the separate existing <code>ebay-import-csv</code> function.</p></div>`;
}
async function runAction(fnKey,payload,msg,target){
  const fn=SWISH.functions[fnKey]||fnKey;const el=document.querySelector('#'+target);if(!fn){showBackendUnavailable(target,String(fnKey),'missing backend function');return null;}if(el)el.innerHTML='<div class="empty"><div class="spinner"></div>Workingâ¦</div>';
  try{const d=await edge(fn,payload);if(el)el.innerHTML=`<div class="success">${esc(msg)}<pre class="pre">${esc(JSON.stringify(d,null,2))}</pre></div>`;else toast(msg);return d}catch(e){if(el)el.innerHTML=`<div class="error">${esc(e.message)}</div>`;else toast(e.message,true)}
}
async function runEdgeToast(fn,payload,msg){try{const d=await edge(fn,payload);toast(msg);return d}catch(e){toast(e.message,true)}}

async function init(){
  S.page=currentHashPage();
  const {data:{session}}=await sb.auth.getSession();S.user=session?.user||null;
  if(!S.user){renderLogin();return;}
  await loadContext();render();
  sb.auth.onAuthStateChange(async(_event,session)=>{S.user=session?.user||null;if(!S.user)renderLogin();else{await loadContext();render();}});
}
window.addEventListener('load',init);
