/* KeenOnCoins Capture Station
   Standalone browser UI using the existing SWISH/OnSpace backend.
   No new database, no new Edge Functions, no AI or marketplace secrets in the browser. */
(() => {
  'use strict';

  const CONFIG = Object.freeze({
    SUPABASE_URL: 'https://iwgaqieyoahmcjfziwga.backend.onspace.ai',
    // Existing public anon client key from the supplied SWISH web app. This is not a private service key.
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODkwNjM4MTgsImV4cCI6MjEwNDQyMzgxOCwicmVmIjoiaXdnYXFpZXlvYWhtY2pmeml3Z2EiLCJyb2xlIjoiYW5vbiIsImlzcyI6Im9uc3BhY2UifQ.cioQ38guPLFAbl3x48mUaJcMSxU5IpZn7-H-JhtvXJc',
    IDENTIFY_FUNCTION: 'swish-identify',
    ISLAMIC_FUNCTION: 'swish-islamic-identify',
    VALUE_FUNCTION: 'swish-market-value',
    IMAGE_BUCKET: 'item-images'
  });

  const $ = id => document.getElementById(id);
  const state = {
    sb: null, user: null, tenant: null, stream: null, side: 'obverse',
    obverse: null, reverse: null, assessment: null, valuation: null,
    itemId: null, itemMedia: [], busy: false
  };

  function showError(title, message, detail = '') {
    $('errorTitle').textContent = title;
    $('errorMessage').textContent = message || 'An unexpected error occurred.';
    $('errorDetail').textContent = detail || '';
    $('errorDetail').classList.toggle('hidden', !detail);
    $('errorPanel').classList.remove('hidden');
  }
  function clearError() { $('errorPanel').classList.add('hidden'); }
  function status(message, kind = '') {
    const el = $('connection');
    el.className = `connection ${kind}`;
    el.querySelector('span').textContent = message;
  }
  function busy(on, message = 'Working…') {
    state.busy = on;
    $('workStatus').classList.toggle('hidden', !on);
    $('workStatusText').textContent = message;
    ['identifyBtn','islamicBtn','valueBtn','saveBtn','startCamera','capturePhoto','switchSide','stopCamera'].forEach(id => {
      const el = $(id); if (el) el.disabled = on || (id === 'capturePhoto' && !state.stream) || (id === 'switchSide' && !state.stream) || (id === 'stopCamera' && !state.stream);
    });
    refreshButtons();
  }
  function refreshButtons() {
    const signedIn = !!state.user && !!state.tenant;
    const twoSides = !!state.obverse && !!state.reverse;
    $('identifyBtn').disabled = state.busy || !signedIn || !twoSides;
    $('islamicBtn').disabled = state.busy || !signedIn || !twoSides;
    $('valueBtn').disabled = state.busy || !signedIn || !state.assessment;
    $('saveBtn').disabled = state.busy || !signedIn || !state.assessment || !!state.itemId;
    $('capturePhoto').disabled = state.busy || !state.stream;
    $('switchSide').disabled = state.busy || !state.stream;
    $('stopCamera').disabled = state.busy || !state.stream;
    $('startCamera').disabled = state.busy || !!state.stream;
    $('loginPanel').classList.toggle('hidden', signedIn);
    $('connectBtn').textContent = signedIn ? 'Disconnect' : 'Connect SWISH';
    $('checkObverse').classList.toggle('complete', !!state.obverse);
    $('checkReverse').classList.toggle('complete', !!state.reverse);
    $('checkMeasurements').classList.toggle('complete', !!($('weight').value && $('diameter').value));
    $('checkIdentification').classList.toggle('complete', !!state.assessment);
    $('checkSaved').classList.toggle('complete', !!state.itemId);
    $('checkObverse').querySelector('b').textContent = state.obverse ? 'Ready' : 'Pending';
    $('checkReverse').querySelector('b').textContent = state.reverse ? 'Ready' : 'Pending';
    $('checkMeasurements').querySelector('b').textContent = ($('weight').value && $('diameter').value) ? 'Entered' : 'Optional';
    $('checkIdentification').querySelector('b').textContent = state.assessment ? 'Review' : 'Pending';
    $('checkSaved').querySelector('b').textContent = state.itemId ? 'Saved' : 'Pending';
  }
  function details() {
    return {
      weight_g: validNumber($('weight').value),
      diameter_mm: validNumber($('diameter').value),
      thickness_mm: validNumber($('thickness').value),
      metal: $('metal').value || 'Unknown',
      notes: $('notes').value.trim()
    };
  }
  function validNumber(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function knownAttributes() {
    const d = details();
    return { weight_g: d.weight_g, diameter_mm: d.diameter_mm, thickness_mm: d.thickness_mm, metal: d.metal, notes: d.notes };
  }
  function imageDataUrls() { return [state.obverse, state.reverse].filter(Boolean); }

  async function functionError(error) {
    let msg = error?.message || 'SWISH function failed', detail = '';
    try {
      if (error?.context) {
        detail = await error.context.clone().text();
        try { const j = JSON.parse(detail); msg = j.error || j.message || msg; detail = JSON.stringify(j, null, 2); } catch (_) {}
      }
    } catch (_) {}
    return { msg, detail };
  }
  async function invoke(name, body) {
    const { data, error } = await state.sb.functions.invoke(name, { body });
    if (error) { const parsed = await functionError(error); throw new Error(`${parsed.msg}${parsed.detail ? '\n' + parsed.detail : ''}`); }
    if (data?.success === false || data?.error) throw new Error(data.error || 'SWISH returned an unsuccessful response.');
    return data;
  }

  async function loadContext() {
    status('Checking SWISH session…');
    const { data: { session }, error } = await state.sb.auth.getSession();
    if (error) throw error;
    state.user = session?.user || null;
    if (!state.user) {
      state.tenant = null;
      status('Sign in required');
      refreshButtons();
      return false;
    }
    const { data: tenants, error: tenantError } = await state.sb.from('tenants')
      .select('id,name,created_at').order('created_at', { ascending: true }).limit(1);
    if (tenantError) throw new Error(`Tenant lookup failed: ${tenantError.message}`);
    state.tenant = tenants?.[0] || null;
    if (!state.tenant) throw new Error('This SWISH account has no tenant/business record. No coin was saved.');
    status(`Connected · ${state.tenant.name || 'SWISH'}`, 'connected');
    refreshButtons();
    return true;
  }

  async function login(event) {
    event.preventDefault();
    clearError();
    const email = $('loginEmail').value.trim(), password = $('loginPassword').value;
    if (!email || !password) return;
    $('loginBtn').disabled = true; $('loginBtn').textContent = 'Connecting…';
    $('loginMessage').classList.add('hidden');
    try {
      const { error } = await state.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await loadContext();
      $('loginPassword').value = '';
    } catch (e) {
      $('loginMessage').textContent = e.message || String(e);
      $('loginMessage').classList.remove('hidden');
      $('loginMessage').classList.add('error');
      showError('SWISH sign-in failed', e.message || String(e));
      status('Sign-in failed', 'error');
    } finally { $('loginBtn').disabled = false; $('loginBtn').textContent = 'Sign in to SWISH'; refreshButtons(); }
  }

  function updatePhoto(side, dataUrl) {
    state[side] = dataUrl || null;
    const img = $(`${side}Preview`), frame = $(`${side}Frame`), pill = $(`${side}Status`);
    if (dataUrl) {
      img.src = dataUrl; img.classList.remove('hidden'); frame.querySelector('.coin-guide').classList.add('hidden'); frame.querySelector('.frame-hint').classList.add('hidden');
      pill.textContent = 'Captured'; pill.classList.add('done');
    } else {
      img.removeAttribute('src'); img.classList.add('hidden'); frame.querySelector('.coin-guide').classList.remove('hidden'); frame.querySelector('.frame-hint').classList.remove('hidden');
      pill.textContent = 'Missing'; pill.classList.remove('done');
    }
    state.assessment = null; state.valuation = null; state.itemId = null;
    $('resultContent').classList.add('hidden'); $('emptyResult').classList.remove('hidden');
    $('resultBadge').textContent = 'Awaiting scan'; $('saveStatus').classList.add('hidden');
    refreshButtons();
  }
  function readFile(file, side) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { showError('Unsupported file', 'Please select an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Normalize large photos for reliable function/storage uploads while preserving detail.
        const max = 1800, scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext('2d', { alpha: false }).drawImage(img, 0, 0, c.width, c.height);
        updatePhoto(side, c.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => showError('Photo could not be opened', 'Try another image file.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  async function startCamera() {
    clearError();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser. Use Choose photo instead.');
      state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      $('camera').srcObject = state.stream; $('camera').classList.remove('hidden'); await $('camera').play();
      $('cameraMessage').textContent = `Camera running · capture ${state.side.toUpperCase()} first`;
      document.querySelector('.camera-dot').classList.add('live');
      refreshButtons();
    } catch (e) { showError('Camera unavailable', e.message || String(e)); $('cameraMessage').textContent = 'Camera unavailable — use Choose photo.'; }
  }
  function captureCamera() {
    const video = $('camera');
    if (!state.stream || !video.videoWidth) return showError('Camera not ready', 'Start the camera and wait for the preview.');
    const canvas = $('canvas'), max = 1800, scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d', { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
    updatePhoto(state.side, canvas.toDataURL('image/jpeg', 0.92));
    state.side = state.side === 'obverse' ? 'reverse' : 'obverse';
    $('captureSide').textContent = state.side.toUpperCase();
    $('cameraMessage').textContent = `Camera running · next capture: ${state.side.toUpperCase()}`;
  }
  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    state.stream = null; $('camera').srcObject = null; $('camera').classList.add('hidden');
    $('cameraMessage').textContent = 'Camera stopped. You can still upload photos.';
    document.querySelector('.camera-dot').classList.remove('live');
    refreshButtons();
  }

  function candidateText(id, raw) {
    return id.canonicalTitle || id.canonical_title || id.title ||
      id.candidateIdentification?.primaryCandidate ||
      id.candidate_identification?.primary_candidate ||
      raw?.candidateIdentification?.primaryCandidate || 'Identification not established';
  }
  function confidencePercent(id) {
    let c = Number(id.confidence ?? id.identificationConfidence ?? id.identification_confidence ?? 0);
    if (c > 0 && c <= 1) c *= 100;
    return Math.max(0, Math.min(100, Math.round(c)));
  }
  function numistaInfo(raw, id) {
    const n = raw?.numistaVerification || raw?.numista_verification || {};
    const num = id.numistaN || id.numista_n || n.numistaN || n.numista_n || (n.typeId || n.type_id ? `N#${n.typeId || n.type_id}` : '');
    return { label: num || 'Not verified', score: n.matchScore ?? n.match_score ?? id.numistaMatchScore ?? id.numista_match_score, status: n.status || id.numistaStatus || id.numista_status || '' };
  }
  function renderResult() {
    const a = state.assessment, raw = a.rawIdentification, id = raw.identification || raw.result?.identification || raw.result || {};
    const n = numistaInfo(raw, id);
    $('emptyResult').classList.add('hidden'); $('resultContent').classList.remove('hidden');
    $('resultTitle').textContent = candidateText(id, raw);
    $('resultConfidence').textContent = `${a.confidence}%`;
    $('confidenceBar').style.width = `${a.confidence}%`;
    $('resultBadge').textContent = a.confidence >= 80 ? 'Strong candidate' : a.confidence >= 60 ? 'Review carefully' : 'Low confidence';
    $('resultBadge').className = `state-pill ${a.confidence >= 80 ? 'done' : 'warn'}`;
    const rows = [
      ['Identification state', id.identificationState || id.identification_state || 'Not stated'],
      ['Numista reference', n.label],
      ['Numista match', n.score != null ? `${n.score}/100${n.status ? ` · ${n.status}` : ''}` : n.status || 'Not verified'],
      ['Weight entered', details().weight_g != null ? `${details().weight_g} g` : 'Not entered'],
      ['Diameter entered', details().diameter_mm != null ? `${details().diameter_mm} mm` : 'Not entered'],
      ['Metal observed', details().metal],
      ['Reasoning', [id.confidenceReason, id.confidence_reason, n.status, ...(Array.isArray(id.warnings) ? id.warnings : [])].filter(Boolean).join(' · ') || 'Review the source response and physical evidence.']
    ];
    $('resultDetails').replaceChildren();
    rows.forEach(([k,v]) => {
      const wrap = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = v; wrap.append(dt, dd); $('resultDetails').append(wrap);
    });
    const missing = [];
    if (details().weight_g == null) missing.push('weight not entered');
    if (details().diameter_mm == null) missing.push('diameter not entered');
    if (a.confidence < 65) missing.push('low identification confidence');
    if ((id.identificationState || id.identification_state || '').toLowerCase().includes('observation')) missing.push('observation-only result');
    $('reviewWarning').textContent = missing.length
      ? `Manual review required: ${missing.join('; ')}. Compare candidate specifications before saving.`
      : 'Measurements are recorded. Still compare the candidate’s expected weight, diameter, metal and legends before saving.';
    renderCommercialScore();
    refreshButtons();
  }
  function renderCommercialScore() {
    const a = state.assessment, raw = a?.rawIdentification || {}, id = raw.identification || {}, n = raw.numistaVerification || {};
    const conf = a?.confidence || 0, match = Number(n.matchScore ?? n.match_score ?? id.numistaMatchScore ?? 0);
    const val = a?.quick_sale_value != null ? Number(a.quick_sale_value) : 0;
    let score = Math.round(conf * .55 + Math.min(100, Math.max(0, match)) * .30 + (val > 0 ? 15 : 0));
    if ((id.identificationState || id.identification_state || '').toLowerCase().includes('observation')) score = Math.min(score, 59);
    score = Math.max(0, Math.min(100, score));
    $('commercialScore').textContent = String(score);
    $('commercialReason').textContent = `${conf}% ID confidence · ${match}/100 Numista match · ${val > 0 ? 'valuation returned' : 'valuation evidence not yet returned'}. This is a workflow indicator, not a verified market value.`;
  }

  async function identify(kind = 'standard') {
    clearError();
    if (!state.user || !state.tenant) return showError('Connect to SWISH', 'Sign in before running identification.');
    if (!state.obverse || !state.reverse) return showError('Both sides are required', 'Capture or upload an obverse and reverse image.');
    const attrs = knownAttributes();
    const payload = { tenantId: state.tenant.id, tenant_id: state.tenant.id, specialistId: kind === 'islamic' ? 'islamic_silver' : 'coins', nicheId: 'coins', images: imageDataUrls(), knownAttributes: attrs, weight_g: attrs.weight_g, diameter_mm: attrs.diameter_mm, metal: attrs.metal, notes: attrs.notes };
    busy(true, kind === 'islamic' ? 'Running Islamic / countermark identification…' : 'Analysing both sides with SWISH…');
    status('SWISH · identifying…');
    try {
      const raw = await invoke(kind === 'islamic' ? CONFIG.ISLAMIC_FUNCTION : CONFIG.IDENTIFY_FUNCTION, payload);
      const id = raw.identification || raw.result?.identification || raw.result || {};
      const confidence = confidencePercent(id);
      state.assessment = { rawIdentification: raw, identification: candidateText(id, raw), confidence, reference: numistaInfo(raw, id).label, reasoning: id.confidenceReason || id.confidence_reason || '', quick_sale_value: null };
      state.valuation = null; state.itemId = null;
      renderResult();
      status('Connected · Identification complete', 'connected');
      $('saveStatus').classList.add('hidden');
    } catch (e) {
      status('Identification failed', 'error');
      showError(kind === 'islamic' ? 'Islamic / countermark identification failed' : 'SWISH identification failed', e.message || String(e));
    } finally { busy(false); }
  }

  async function valueCoin() {
    clearError();
    if (!state.assessment) return showError('Identify first', 'Run identification before requesting valuation.');
    const raw = state.assessment.rawIdentification, id = raw.identification || raw.result?.identification || {}, n = raw.numistaVerification || {};
    busy(true, 'Requesting valuation from existing SWISH market-value engine…');
    try {
      const data = await invoke(CONFIG.VALUE_FUNCTION, {
        tenantId: state.tenant.id, tenant_id: state.tenant.id,
        title: candidateText(id, raw), specialistId: 'coins',
        attributes: { ...(id.attributes || {}), ...(id.coinFields || {}), ...knownAttributes() },
        condition: id.condition || 'Cannot be reliably graded from supplied images',
        identificationConfidence: Number(id.confidence || 0),
        identificationTier: state.assessment.confidence >= 85 ? 'high' : state.assessment.confidence >= 65 ? 'medium' : 'low',
        numistaTypeId: id.numistaTypeId || n.typeId || null,
        numistaMatchScore: Number(n.matchScore || id.numistaMatchScore || 0),
        numistaMatchTier: n.status || id.numistaStatus || 'no_match',
        applyToItem: false
      });
      state.valuation = data;
      const q = data.quickSaleValue ?? data.quick_sale_value ?? data.valuation?.quickSaleValue ?? data.valuation?.quick_sale_value ?? data.valuation?.recommendedListingPrice ?? data.recommendedListingPrice ?? null;
      state.assessment.quick_sale_value = q == null ? null : Number(q);
      state.assessment.valuation = data;
      renderResult();
      const row = document.createElement('div');
      row.className = 'result-details';
      const pairs = [
        ['Quick-sale estimate', q == null ? 'Not returned' : `£${Number(q).toFixed(2)}`],
        ['Valuation confidence', data.valuationConfidence || data.valuation_confidence || data.valuation?.valuationConfidence || data.valuation?.valuation_confidence || 'Not stated']
      ];
      pairs.forEach(([k,v]) => { const wrap=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;wrap.append(dt,dd);row.append(wrap); });
      $('resultDetails').append(row);
      renderCommercialScore();
      status('Connected · Valuation complete', 'connected');
    } catch (e) {
      showError('SWISH valuation failed', e.message || String(e));
      status('Valuation failed', 'error');
    } finally { busy(false); }
  }

  async function uploadImages(itemId) {
    const urls = [];
    for (const [index, side] of ['obverse', 'reverse'].entries()) {
      const data = state[side];
      if (!data) continue;
      const blob = await (await fetch(data)).blob();
      const path = `${itemId}/${index + 1}_${side}.jpg`;
      const { error } = await state.sb.storage.from(CONFIG.IMAGE_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const { data: publicData } = state.sb.storage.from(CONFIG.IMAGE_BUCKET).getPublicUrl(path);
      urls.push(publicData.publicUrl);
    }
    return urls;
  }

  async function saveCoin() {
    clearError();
    if (!state.assessment) return showError('Identify first', 'There is no identification to save.');
    if (!state.user || !state.tenant) return showError('Connect to SWISH', 'Sign in before saving.');
    if (state.itemId) return showError('Already saved', 'This capture has already been saved to SWISH.');
    const raw = state.assessment.rawIdentification, id = raw.identification || raw.result?.identification || {}, v = state.valuation || state.assessment.valuation || {}, d = details();
    const title = candidateText(id, raw);
    const confidence = state.assessment.confidence / 100;
    const attrs = {
      ...(id.attributes || {}), ...(id.coinFields || {}),
      object_type: id.objectType || id.object_type || 'coin',
      identification_state: id.identificationState || id.identification_state || 'review_required',
      weight_g: d.weight_g, diameter_mm: d.diameter_mm, thickness_mm: d.thickness_mm,
      metal: d.metal, notes: d.notes,
      numista_type_id: id.numistaTypeId || id.numista_type_id || raw.numistaVerification?.typeId || null,
      numista_n: id.numistaN || id.numista_n || raw.numistaVerification?.numistaN || null,
      numista_url: id.numistaUrl || id.numista_url || raw.numistaVerification?.numistaUrl || null,
      capture_station: true, capture_saved_at: new Date().toISOString()
    };
    busy(true, 'Saving coin to the existing SWISH inventory…');
    $('saveStatus').classList.add('hidden');
    try {
      const row = {
        tenant_id: state.tenant.id,
        canonical_title: title || 'Unidentified coin',
        description: d.notes || '',
        specialist_id: 'coins',
        status: state.assessment.confidence >= 80 ? 'identified' : 'review_required',
        disposition_decision: id.dispositionDecision || id.disposition_decision || 'review',
        condition: id.condition || 'Cannot be reliably graded from supplied images',
        condition_grade: id.conditionGrade || id.condition_grade || '',
        condition_notes: id.conditionNotes || id.condition_notes || '',
        identification_confidence: confidence,
        identification_source: id.identificationSource || id.identification_source || 'swish-identify',
        valuation_low: Number(v.valuationLow ?? v.valuation_low ?? v.valuation?.valuationLow ?? 0),
        valuation_mid: Number(v.valuationMid ?? v.valuation_mid ?? v.valuation?.valuationMid ?? state.assessment.quick_sale_value ?? 0),
        valuation_high: Number(v.valuationHigh ?? v.valuation_high ?? v.valuation?.valuationHigh ?? 0),
        valuation_confidence: v.valuationConfidence || v.valuation_confidence || v.valuation?.valuationConfidence || 'not_assessed',
        expected_selling_price: Number(state.assessment.quick_sale_value ?? v.recommendedListingPrice ?? v.recommended_listing_price ?? 0),
        expected_net: 0, expected_profit: 0,
        attributes: attrs, media: [], warnings: Array.isArray(id.warnings) ? id.warnings : [],
        tags: ['capture-station'], acquired_cost: 0
      };
      const { data: item, error } = await state.sb.from('items').insert(row).select('id,canonical_title').single();
      if (error) throw new Error(`Inventory insert failed: ${error.message}`);
      state.itemId = item.id;
      try {
        state.itemMedia = await uploadImages(item.id);
        const { error: mediaError } = await state.sb.from('items').update({ media: state.itemMedia, updated_at: new Date().toISOString() }).eq('id', item.id).eq('tenant_id', state.tenant.id);
        if (mediaError) throw mediaError;
      } catch (photoError) {
        $('saveStatus').textContent = `Coin saved (ID ${item.id}), but image upload failed: ${photoError.message}. Check the existing storage bucket and policies.`;
        $('saveStatus').classList.remove('hidden');
        $('saveStatus').classList.add('error');
        showError('Coin saved, photos need attention', 'The inventory record was saved but one or both photos could not be uploaded.', photoError.message);
      }
      if (state.itemMedia.length === 2) {
        $('saveStatus').textContent = `Saved to SWISH inventory ✓ ${item.canonical_title || title} · ${item.id}`;
        $('saveStatus').classList.remove('hidden','error');
      }
      status('Connected · Coin saved to SWISH', 'connected');
      $('resultBadge').textContent = 'Saved to SWISH'; $('resultBadge').className = 'state-pill done';
      refreshButtons();
    } catch (e) {
      showError('SWISH save failed', e.message || String(e));
      status('Save failed', 'error');
    } finally { busy(false); }
  }

  function resetCapture() {
    updatePhoto('obverse', null); updatePhoto('reverse', null);
    ['weight','diameter','thickness','notes'].forEach(id => $(id).value = '');
    $('metal').value = 'Unknown';
    state.assessment = null; state.valuation = null; state.itemId = null; state.itemMedia = [];
    $('resultContent').classList.add('hidden'); $('emptyResult').classList.remove('hidden');
    $('resultBadge').textContent = 'Awaiting scan'; $('saveStatus').classList.add('hidden');
    state.side = 'obverse'; $('captureSide').textContent = 'OBVERSE';
    clearError(); refreshButtons();
  }

  function bind() {
    $('loginForm').addEventListener('submit', login);
    $('connectBtn').addEventListener('click', async () => {
      clearError();
      if (state.user) {
        await state.sb.auth.signOut(); state.user = null; state.tenant = null;
        status('Signed out'); refreshButtons();
      } else {
        $('loginPanel').classList.remove('hidden');
        $('loginEmail').focus();
      }
    });
    document.querySelectorAll('[data-photo]').forEach(btn => btn.addEventListener('click', () => $(`${btn.dataset.photo}Input`).click()));
    document.querySelectorAll('[data-clear]').forEach(btn => btn.addEventListener('click', () => updatePhoto(btn.dataset.clear, null)));
    $('obverseInput').addEventListener('change', e => { readFile(e.target.files?.[0], 'obverse'); e.target.value = ''; });
    $('reverseInput').addEventListener('change', e => { readFile(e.target.files?.[0], 'reverse'); e.target.value = ''; });
    $('startCamera').addEventListener('click', startCamera);
    $('capturePhoto').addEventListener('click', captureCamera);
    $('switchSide').addEventListener('click', () => { state.side = state.side === 'obverse' ? 'reverse' : 'obverse'; $('captureSide').textContent = state.side.toUpperCase(); $('cameraMessage').textContent = `Camera running · capture ${state.side.toUpperCase()}`; });
    $('stopCamera').addEventListener('click', stopCamera);
    $('identifyBtn').addEventListener('click', () => identify('standard'));
    $('islamicBtn').addEventListener('click', () => identify('islamic'));
    $('valueBtn').addEventListener('click', valueCoin);
    $('saveBtn').addEventListener('click', saveCoin);
    $('resetBtn').addEventListener('click', resetCapture);
    ['weight','diameter','thickness','metal','notes'].forEach(id => $(id).addEventListener('input', refreshButtons));
    window.addEventListener('beforeunload', stopCamera);
  }

  async function init() {
    try {
      if (!window.supabase?.createClient) throw new Error('Supabase client library did not load. Refresh the page or check your connection.');
      state.sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'swish_capture_station_auth' }
      });
      bind();
      await loadContext();
      state.sb.auth.onAuthStateChange(async (_event, session) => {
        state.user = session?.user || null;
        if (!state.user) { state.tenant = null; status('Sign in required'); refreshButtons(); return; }
        try { await loadContext(); } catch (e) { showError('SWISH connection error', e.message || String(e)); status('Backend error', 'error'); }
      });
      refreshButtons();
    } catch (e) {
      $('fatal').textContent = `Capture Station could not start.\n\n${e.message || String(e)}\n\nCheck that index.html, swish.css and swish.js are all in the repository root.`;
      $('fatal').classList.remove('hidden');
      status('Startup error', 'error');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
