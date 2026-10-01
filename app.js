import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SWISH Capture Station — uses the SAME SWISH backend/functions as the main app.
const CONFIG = {
  SUPABASE_URL: "https://iwgaqieyoahmcjfziwga.backend.onspace.ai",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODkwNjM4MTgsImV4cCI6MjEwNDQyMzgxOCwicmVmIjoiaXdnYXFpZXlvYWhtY2pmeml3Z2EiLCJyb2xlIjoiYW5vbiIsImlzcyI6Im9uc3BhY2UifQ.cioQ38guPLFAbl3x48mUaJcMSxU5IpZn7-H-JhtvXJc",
  IDENTIFY_FUNCTION: "swish-identify",
  VALUE_FUNCTION: "swish-market-value",
  IMAGE_BUCKET: "item-images"
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = id => document.getElementById(id);
const state = { stream:null, side:"obverse", obverse:null, reverse:null, assessment:null, tenantId:null, user:null, connected:false, busy:false };

function setStatus(s){ $("status").textContent=s; }
function setMessage(s){ $("cameraMessage").textContent=s; }
function setBusy(v){ state.busy=v; ["identify","value","save","capture","startCamera"].forEach(id=>{ const el=$(id); if(el) el.disabled=v || (id==="capture" && !state.stream); }); }
function setConnectionText(){
  const b=$("swishConnect");
  if(!b) return;
  b.textContent=state.connected ? "SWISH connected" : "Connect SWISH";
  b.classList.toggle("connected",state.connected);
}
function showLogin(show=true){ $("loginPanel")?.classList.toggle("hidden",!show); if(show) $("loginEmail")?.focus(); }
function showError(title,message,detail=""){
  $("errorTitle").textContent=title;
  $("errorMessage").textContent=message;
  $("errorDetail").textContent=detail;
  $("errorPanel").classList.remove("hidden");
}
function clearError(){ $("errorPanel")?.classList.add("hidden"); }

async function readableFunctionError(error){
  let msg=error?.message || "SWISH function failed";
  let detail="";
  try{
    if(error?.context){
      detail=await error.context.clone().text();
      if(detail){ try { const j=JSON.parse(detail); msg=j.error||j.message||msg; detail=JSON.stringify(j,null,2); } catch{} }
    }
  }catch{}
  return {msg,detail};
}

async function getTenant(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return null;
  const {data,error}=await supabase.from("tenants").select("id,name").order("created_at",{ascending:true}).limit(1);
  if(error) throw new Error(`SWISH account found, but tenant lookup failed: ${error.message}`);
  return data?.[0] || null;
}

async function loadConnection(){
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user){ state.connected=false;state.user=null;state.tenantId=null;setConnectionText();setStatus("Connect SWISH");return false; }
    state.user=session.user;
    const tenant=await getTenant();
    if(!tenant) throw new Error("This SWISH account has no business/tenant yet.");
    state.tenantId=tenant.id; state.connected=true; setConnectionText();
    setStatus("SWISH connected · Ready");
    showLogin(false);
    return true;
  }catch(e){
    state.connected=false;state.tenantId=null;setConnectionText();setStatus("SWISH connection needs attention");
    showError("SWISH connection",e.message||String(e));
    return false;
  }
}

async function connectSwish(){
  clearError();
  if(state.connected){ await supabase.auth.signOut(); state.connected=false;state.tenantId=null;state.user=null;setConnectionText();setStatus("Disconnected");showLogin(true);return; }
  showLogin(true);
}

async function login(){
  clearError();
  const email=$("loginEmail").value.trim(), password=$("loginPassword").value;
  if(!email||!password){ showError("Login required","Enter your SWISH email and password.");return; }
  setBusy(true); setStatus("SWISH · Signing in…");
  try{
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error) throw error;
    const ok=await loadConnection();
    if(!ok) return;
    $("loginPassword").value="";
    showLogin(false);
    setStatus("SWISH connected · Ready");
  }catch(e){ showError("SWISH login failed",e.message||String(e));setStatus("Login failed"); }
  finally{setBusy(false);updateButtons();}
}

async function startCamera(){
  clearError();
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API unavailable in this browser.");
    state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false});
    $("camera").srcObject=state.stream; $("startCamera").textContent="Camera running"; setMessage("Centre the coin in the guide");
    setStatus(state.connected?"SWISH connected · Camera ready":"Camera ready · Connect SWISH before identifying"); updateButtons();
  }catch(e){ setMessage("Camera unavailable — use Photo instead");setStatus("Photo mode");showError("Camera unavailable",e.message||String(e),"You can still use Photo to capture each side."); }
}
function makeCapture(){ const v=$("camera"),c=$("canvas"); if(!v.videoWidth)return null;c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);return c.toDataURL("image/jpeg",.86); }
function storeShot(data){
  if(state.side==="obverse"){state.obverse=data;$("obversePreview").src=data;state.side="reverse";$("sideLabel").textContent="REVERSE";$("nextSide").textContent="Switch to obverse";}
  else{state.reverse=data;$("reversePreview").src=data;state.side="obverse";$("sideLabel").textContent="OBVERSE";$("nextSide").textContent="Switch to reverse";}
  $("nextSide").disabled=false;updateButtons();setStatus(state.obverse&&state.reverse?(state.connected?"SWISH connected · Both sides captured":"Both sides captured · Connect SWISH"):"Side captured");
}
function details(){return{weight_g:parseFloat($("weight").value)||null,diameter_mm:parseFloat($("diameter").value)||null,metal:$("metal").value,notes:$("notes").value.trim()};}
function imageList(){return[state.obverse,state.reverse].filter(Boolean);}
function knownAttributes(){const d=details();return{weight:d.weight_g,diameter:d.diameter_mm,material:d.metal,customNotes:d.notes};}
function updateButtons(){
  const captured=!!(state.obverse&&state.reverse);
  $("identify").disabled=state.busy||!captured||!state.connected;
  $("value").disabled=state.busy||!state.assessment?.rawIdentification||!state.connected;
  $("save").disabled=state.busy||!state.assessment?.rawIdentification||!state.connected;
  $("capture").disabled=state.busy||!state.stream;
  $("startCamera").disabled=state.busy;
}

function renderAssessment(){
  const a=state.assessment||{}, id=a.rawIdentification?.identification||{}, nv=a.rawIdentification?.numistaVerification||{};
  $("resultBody").innerHTML="";
  const dl=document.createElement("dl");
  const rows=[
    ["Identification",a.identification||"Not established"],
    ["Confidence",a.confidence!=null?`${a.confidence}%`:"Not established"],
    ["Identification state",id.identificationState||"—"],
    ["Numista",a.reference||"Not verified"],
    ["Quick-sale value",a.quick_sale_value!=null?`£${a.quick_sale_value}`:"Not calculated"],
    ["Reasoning",a.reasoning||""],
  ];
  if(id.candidateIdentification?.alternativeCandidates?.length) rows.push(["Alternatives",id.candidateIdentification.alternativeCandidates.join(" · ")]);
  if(nv.matchScore!=null) rows.push(["Numista match",`${nv.matchScore}/100 · ${nv.status||"unknown"}`]);
  if(Array.isArray(id.evidenceSupporting)&&id.evidenceSupporting.length) rows.push(["Evidence",id.evidenceSupporting.join(" · ")]);
  rows.forEach(([k,v])=>{const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v||"—";dl.append(dt,dd);});
  $("resultBody").append(dl);$("result").classList.remove("hidden");
}

async function identify(){
  clearError();
  if(!state.connected){showLogin(true);showError("Connect SWISH first","The capture is ready, but the SWISH identification engine requires your authenticated SWISH session.");return;}
  if(!state.obverse||!state.reverse){showError("Two sides required","Capture both obverse and reverse before identifying.");return;}
  setBusy(true);setStatus("SWISH · Preparing identification…");
  try{
    const {data,error}=await supabase.functions.invoke(CONFIG.IDENTIFY_FUNCTION,{body:{images:imageList(),specialistId:"coins",tenantId:state.tenantId,knownAttributes:knownAttributes()}});
    if(error){const x=await readableFunctionError(error);throw new Error(x.msg+"\n"+x.detail);}
    if(!data?.identification) throw new Error(data?.error||"SWISH returned no identification data.");
    const id=data.identification,nv=data.numistaVerification||{};
    state.assessment={rawIdentification:data,identification:id.canonicalTitle||id.candidateIdentification?.primaryCandidate||"Not established",confidence:Math.round(Number(id.confidence||0)*100),reference:id.numistaN||nv.numistaN||(nv.typeId?`N#${nv.typeId}`:"—"),reasoning:[id.identificationState?`State: ${id.identificationState}`:"",id.confidenceReason||"",nv.status?`Numista: ${nv.status}${nv.matchScore!=null?` (${nv.matchScore}/100)`:""}`:"",...(id.warnings||[])].filter(Boolean).join(" · ")};
    renderAssessment();setStatus("SWISH · Identification complete");
  }catch(e){console.error(e);setStatus("Identification failed");showError("SWISH identification failed",e.message||String(e),"The request reached the Capture Station code but SWISH did not return a usable result. No coin was saved.");}
  finally{setBusy(false);updateButtons();}
}

async function value(){
  clearError(); if(!state.assessment?.rawIdentification){showError("Identify first","Run identification before valuation.");return;}
  setBusy(true);setStatus("SWISH · Searching market evidence…");
  try{
    const raw=state.assessment.rawIdentification,id=raw.identification||{},nv=raw.numistaVerification||{};
    const {data,error}=await supabase.functions.invoke(CONFIG.VALUE_FUNCTION,{body:{tenantId:state.tenantId,title:id.canonicalTitle||"Unknown coin",specialistId:"coins",attributes:{...(id.attributes||{}),...(id.coinFields||{})},condition:id.condition||"Cannot be reliably graded from supplied images",identificationConfidence:Number(id.confidence||0),identificationTier:id.confidenceTier||"low",numistaTypeId:id.numistaTypeId||nv.typeId||null,numistaMatchScore:Number(nv.matchScore||id.numistaMatchScore||0),numistaMatchTier:nv.status||id.numistaStatus||"no_match",applyToItem:false}});
    if(error){const x=await readableFunctionError(error);throw new Error(x.msg+"\n"+x.detail);}
    if(!data) throw new Error("SWISH returned no valuation data.");
    const q=data.quickSaleValue??data.quick_sale_value??data.valuation?.quickSaleValue??data.valuation?.quick_sale_value??data.recommendedListingPrice??null;
    state.assessment.valuation=data;state.assessment.quick_sale_value=q;state.assessment.reasoning=(state.assessment.reasoning||"")+(q!=null?` · SWISH market evidence returned £${q}.`:" · SWISH returned no quick-sale figure.");renderAssessment();setStatus("SWISH · Valuation complete");
  }catch(e){console.error(e);setStatus("Valuation failed");showError("SWISH valuation failed",e.message||String(e),"Identification has not been altered. Nothing was saved.");}
  finally{setBusy(false);updateButtons();}
}

async function uploadImages(itemId){
  const urls=[];for(const [i,data] of imageList().entries()){const path=`${itemId}/${i+1}_${i===0?"obverse":"reverse"}.jpg`;const blob=await(await fetch(data)).blob();const {error}=await supabase.storage.from(CONFIG.IMAGE_BUCKET).upload(path,blob,{contentType:"image/jpeg",upsert:true});if(error)throw error;urls.push(supabase.storage.from(CONFIG.IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);}return urls;
}

async function save(){
  clearError();if(!state.assessment?.rawIdentification){showError("Identify first","There is no identification to save.");return;}
  setBusy(true);setStatus("SWISH · Saving coin…");
  try{
    const raw=state.assessment.rawIdentification,id=raw.identification||{},v=state.assessment.valuation||{},d=details();
    const attrs={...(id.attributes||{}),...(id.coinFields||{}),object_type:id.objectType||"coin",identification_state:id.identificationState||"observation_only",weight_g:d.weight_g,diameter_mm:d.diameter_mm,metal:d.metal,notes:d.notes,numista_type_id:id.numistaTypeId||raw.numistaVerification?.typeId||null,numista_n:id.numistaN||raw.numistaVerification?.numistaN||null,numista_url:id.numistaUrl||raw.numistaVerification?.numistaUrl||null};
    const {data:item,error}=await supabase.from("items").insert({tenant_id:state.tenantId,canonical_title:id.canonicalTitle||"Unidentified coin",description:id.condition?`Condition: ${id.condition}`:"",specialist_id:"coins",status:(id.identificationState==="observation_only"||Number(id.confidence||0)<.30)?"review_required":Number(id.confidence||0)>=.80?"identified":"review_required",disposition_decision:id.dispositionDecision||"sell_individual",condition:id.condition||"Cannot be reliably graded from supplied images",condition_grade:id.conditionGrade||"",condition_notes:id.conditionNotes||"",identification_confidence:Number(id.confidence||0),identification_source:id.identificationSource||"researched",valuation_low:Number(v.valuationLow??v.low??0),valuation_mid:Number(v.valuationMid??v.mid??state.assessment.quick_sale_value??0),valuation_high:Number(v.valuationHigh??v.high??0),valuation_confidence:v.valuationConfidence||"unknown",expected_selling_price:Number(v.recommendedListingPrice??state.assessment.quick_sale_value??0),expected_net:0,expected_profit:0,sale_prob_30d:Number(v.saleProb30d??0),attributes:attrs,media:[],warnings:Array.isArray(id.warnings)?id.warnings:[],tags:[],acquired_cost:0}).select().single();
    if(error)throw error;
    try{const urls=await uploadImages(item.id);await supabase.from("items").update({media:urls,updated_at:new Date().toISOString()}).eq("id",item.id).eq("tenant_id",state.tenantId);}catch(imgErr){showError("Coin saved, photos need attention","The coin record was saved to SWISH, but the photo upload failed.",imgErr.message||String(imgErr));}
    setStatus("Saved to SWISH ✓");alert(`Saved to SWISH\n\n${id.canonicalTitle||"Unidentified coin"}`);
  }catch(e){console.error(e);setStatus("Save failed");showError("SWISH save failed",e.message||String(e),"No partial replacement database is being used; the existing SWISH database remains the source of truth.");}
  finally{setBusy(false);updateButtons();}
}

$("swishConnect").onclick=connectSwish;
$("loginBtn").onclick=login;
$("loginCancel").onclick=()=>showLogin(false);
$("startCamera").onclick=startCamera;
$("capture").onclick=()=>{const d=makeCapture();if(d)storeShot(d);};
$("nextSide").onclick=()=>{state.side=state.side==="obverse"?"reverse":"obverse";$("sideLabel").textContent=state.side.toUpperCase();};
$("photoInput").onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>storeShot(r.result);r.readAsDataURL(f);};
$("identify").onclick=identify;
$("value").onclick=value;
$("save").onclick=save;
$("retryConnection").onclick=()=>{clearError();loadConnection();};
window.addEventListener("beforeunload",()=>state.stream?.getTracks().forEach(t=>t.stop()));
supabase.auth.onAuthStateChange(()=>setTimeout(loadConnection,0));
loadConnection().finally(updateButtons);
