import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const state = {
  stream:null, side:"obverse", obverse:null, reverse:null,
  assessment:null, tenantId:null, user:null, connected:false, savedItemId:null
};

function setStatus(s){ $("status").textContent=s; }
function setMessage(s){ $("cameraMessage").textContent=s; }

async function loadConnection(){
  const { data:{session} } = await supabase.auth.getSession();
  if(session?.user){
    state.user=session.user;
    const { data: tenants, error } = await supabase.from("tenants").select("id").order("created_at",{ascending:true}).limit(1);
    if(!error && tenants?.[0]){
      state.tenantId=tenants[0].id;
      state.connected=true;
      $("swishConnect").textContent="SWISH connected";
      setStatus("SWISH connected");
      return true;
    }
  }
  state.connected=false;
  $("swishConnect").textContent="Connect SWISH";
  setStatus("Connect SWISH");
  return false;
}

async function connectSwish(){
  const { data:{session} } = await supabase.auth.getSession();
  if(session?.user && state.tenantId){
    await supabase.auth.signOut();
    state.tenantId=null; state.user=null; state.connected=false;
    $("swishConnect").textContent="Connect SWISH";
    setStatus("SWISH disconnected");
    return;
  }
  const email=window.prompt("SWISH email address:");
  if(!email) return;
  const password=window.prompt("SWISH password:");
  if(!password) return;
  setStatus("Connecting to SWISH…");
  const { data, error } = await supabase.auth.signInWithPassword({email,password});
  if(error){ setStatus("SWISH login failed"); alert(error.message); return; }
  state.user=data.user;
  const ok=await loadConnection();
  if(!ok){ await supabase.auth.signOut(); alert("Login succeeded, but no SWISH tenant was found for this account."); }
}

async function startCamera(){
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API unavailable");
    state.stream = await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},
      audio:false
    });
    $("camera").srcObject=state.stream;
    $("capture").disabled=false;
    $("startCamera").textContent="Camera running";
    setMessage("Centre the coin in the guide");
    if(state.connected) setStatus("SWISH connected · Camera ready");
  }catch(e){
    setMessage("Camera unavailable — use Photo instead");
    setStatus(state.connected?"SWISH connected · Photo mode":"Photo mode");
  }
}

function makeCapture(){
  const video=$("camera"), canvas=$("canvas");
  if(!video.videoWidth) return null;
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  const ctx=canvas.getContext("2d");
  ctx.drawImage(video,0,0);
  return canvas.toDataURL("image/jpeg",.88);
}

function storeShot(data){
  if(state.side==="obverse"){
    state.obverse=data; $("obversePreview").src=data;
    state.side="reverse"; $("sideLabel").textContent="REVERSE"; $("nextSide").textContent="Switch to obverse";
  }else{
    state.reverse=data; $("reversePreview").src=data;
    state.side="obverse"; $("sideLabel").textContent="OBVERSE"; $("nextSide").textContent="Switch to reverse";
  }
  $("nextSide").disabled=false;
  $("identify").disabled=!(state.obverse&&state.reverse);
  setStatus(state.obverse&&state.reverse ? (state.connected?"SWISH connected · Both sides captured":"Both sides captured") : "Side captured");
}

$("swishConnect").onclick=connectSwish;
$("startCamera").onclick=startCamera;
$("capture").onclick=()=>{const d=makeCapture();if(d)storeShot(d)};
$("nextSide").onclick=()=>{
  state.side=state.side==="obverse"?"reverse":"obverse";
  $("sideLabel").textContent=state.side.toUpperCase();
};
$("photoInput").onchange=e=>{
  const f=e.target.files?.[0]; if(!f)return;
  const r=new FileReader(); r.onload=()=>storeShot(r.result); r.readAsDataURL(f);
};

function details(){
  return {
    weight_g:parseFloat($("weight").value)||null,
    diameter_mm:parseFloat($("diameter").value)||null,
    metal:$("metal").value,
    notes:$("notes").value.trim(),
    obverse_image:state.obverse,
    reverse_image:state.reverse
  };
}

function imageList(){ return [state.obverse,state.reverse].filter(Boolean); }

function knownAttributes(){
  const d=details();
  return {
    weight: d.weight_g,
    diameter: d.diameter_mm,
    metal: d.metal,
    notes: d.notes
  };
}

function identificationForDisplay(data){
  const id=data?.identification ?? {};
  const nv=data?.numistaVerification ?? {};
  return {
    identification:id.canonicalTitle || id.candidateIdentification || "Not established",
    confidence:id.confidence!=null ? Math.round(Number(id.confidence)*100) : 0,
    reference:id.numistaN || nv.numistaN || (nv.typeId ? `N#${nv.typeId}` : "—"),
    quick_sale_value:state.assessment?.quick_sale_value ?? null,
    reasoning:[
      id.identificationState ? `State: ${id.identificationState}` : "",
      id.confidenceReason || "",
      nv.status ? `Numista: ${nv.status}${nv.matchScore!=null ? ` (${nv.matchScore}/100)` : ""}` : "",
      ...(id.warnings||[])
    ].filter(Boolean).join(" · ") || "Identification returned without additional reasoning."
  };
}

function showAssessment(a){
  state.assessment={...(state.assessment||{}),...a};
  $("resultBody").innerHTML="";
  const dl=document.createElement("dl");
  const fields=[
    ["Identification",state.assessment.identification||"Not established"],
    ["Confidence",state.assessment.confidence!=null?`${state.assessment.confidence}%`:"Not established"],
    ["Reference",state.assessment.reference||"—"],
    ["Quick-sale value",state.assessment.quick_sale_value!=null?`£${state.assessment.quick_sale_value}`:"Not calculated"],
    ["Reasoning",state.assessment.reasoning||"Use the evidence above and avoid over-attribution."]
  ];
  fields.forEach(([k,v])=>{
    const dt=document.createElement("dt"),dd=document.createElement("dd");
    dt.textContent=k;dd.textContent=v;dl.append(dt,dd);
  });
  $("resultBody").append(dl);
  $("result").classList.remove("hidden");
}

function requireConnection(){
  if(!state.connected || !state.tenantId){
    alert("Connect to SWISH first.");
    return false;
  }
  return true;
}

async function identify(){
  if(!requireConnection()) return;
  setStatus("SWISH · Identifying…");
  $("identify").disabled=true;
  try{
    const {data,error}=await supabase.functions.invoke(CONFIG.IDENTIFY_FUNCTION,{
      body:{
        images:imageList(),
        specialistId:"coins",
        tenantId:state.tenantId,
        knownAttributes:knownAttributes()
      }
    });
    if(error) throw error;
    if(!data?.identification) throw new Error(data?.error||"SWISH returned no identification");
    state.assessment={
      rawIdentification:data,
      ...identificationForDisplay(data)
    };
    showAssessment(state.assessment);
    $("value").disabled=false;
    $("save").disabled=false;
    setStatus("SWISH · Identification ready");
  }catch(e){
    console.error(e);
    setStatus("Identification error");
    alert(e.message||"SWISH identification failed");
    $("identify").disabled=false;
  }
}

$("identify").onclick=identify;

$("value").onclick=async()=>{
  if(!requireConnection() || !state.assessment?.rawIdentification) return;
  setStatus("SWISH · Valuing…");
  $("value").disabled=true;
  try{
    const raw=state.assessment.rawIdentification;
    const id=raw.identification||{};
    const nv=raw.numistaVerification||{};
    const attrs={
      ...(id.attributes||{}),
      ...(id.coinFields||{}),
      numista_type_id:id.numistaTypeId||nv.typeId||null,
      numista_n:id.numistaN||nv.numistaN||null,
      numista_title:id.numistaTitle||nv.title||null
    };
    const body={
      tenantId:state.tenantId,
      title:id.canonicalTitle||"Unknown coin",
      specialistId:"coins",
      attributes:attrs,
      condition:id.condition||"Cannot be reliably graded from supplied images",
      identificationConfidence:Number(id.confidence||0),
      identificationTier:id.confidenceTier||"low",
      numistaTypeId:id.numistaTypeId||nv.typeId||null,
      numistaMatchScore:Number(nv.matchScore||id.numistaMatchScore||0),
      numistaMatchTier:nv.status||id.numistaStatus||"no_match",
      applyToItem:false
    };
    const {data,error}=await supabase.functions.invoke(CONFIG.VALUE_FUNCTION,{body});
    if(error) throw error;
    const value=data?.quickSaleValue ?? data?.quick_sale_value ?? data?.valuation?.quickSaleValue ??
      data?.valuation?.quick_sale_value ?? data?.expectedSellingPrice ?? data?.value ?? null;
    const low=data?.low ?? data?.valuation?.low ?? null;
    const high=data?.high ?? data?.valuation?.high ?? null;
    state.assessment.valuation=data;
    state.assessment.quick_sale_value=value;
    state.assessment.reasoning=(state.assessment.reasoning||"")+
      (value!=null ? ` · SWISH valuation evidence: £${value}${low!=null&&high!=null?` (range £${low}–£${high})`:""}.` : " · SWISH returned no quick-sale value.");
    showAssessment(state.assessment);
    setStatus("SWISH · Valuation ready");
    $("save").disabled=false;
  }catch(e){
    console.error(e);
    setStatus("Valuation error");
    alert(e.message||"SWISH valuation failed");
  }finally{$("value").disabled=false;}
};

async function uploadImages(itemId){
  const urls=[];
  for(const [index,data] of imageList().entries()){
    const fileName=`${itemId}/${index+1}_${index===0?"obverse":"reverse"}.jpg`;
    const response=await fetch(data);
    const blob=await response.blob();
    const {error}=await supabase.storage.from(CONFIG.IMAGE_BUCKET).upload(fileName,blob,{contentType:"image/jpeg",upsert:true});
    if(error) throw error;
    const {data:urlData}=supabase.storage.from(CONFIG.IMAGE_BUCKET).getPublicUrl(fileName);
    if(urlData?.publicUrl) urls.push(urlData.publicUrl);
  }
  return urls;
}

$("save").onclick=async()=>{
  if(!requireConnection() || !state.assessment?.rawIdentification) return;
  setStatus("SWISH · Saving…");
  $("save").disabled=true;
  try{
    const raw=state.assessment.rawIdentification;
    const id=raw.identification||{};
    const valuation=state.assessment.valuation||{};
    const attrs={
      ...(id.attributes||{}),
      ...(id.coinFields||{}),
      object_type:id.objectType||"coin",
      identification_state:id.identificationState||"observation_only",
      weight_g:details().weight_g,
      diameter_mm:details().diameter_mm,
      metal:details().metal,
      notes:details().notes,
      numista_type_id:id.numistaTypeId||raw.numistaVerification?.typeId||null,
      numista_n:id.numistaN||raw.numistaVerification?.numistaN||null,
      numista_url:id.numistaUrl||raw.numistaVerification?.numistaUrl||null
    };
    const {data:item,error}=await supabase.from("items").insert({
      tenant_id:state.tenantId,
      canonical_title:id.canonicalTitle||"Unidentified coin",
      description:id.condition ? `Condition: ${id.condition}` : "",
      specialist_id:"coins",
      status:(id.identificationState==="observation_only"||Number(id.confidence||0)<0.30)?"review_required":Number(id.confidence||0)>=0.80?"identified":"review_required",
      disposition_decision:id.dispositionDecision||"sell_individual",
      condition:id.condition||"Cannot be reliably graded from supplied images",
      condition_grade:id.conditionGrade||"",
      condition_notes:id.conditionNotes||"",
      identification_confidence:Number(id.confidence||0),
      identification_source:id.identificationSource||"researched",
      valuation_low:Number(valuation.low??0),
      valuation_mid:Number(valuation.mid??state.assessment.quick_sale_value??0),
      valuation_high:Number(valuation.high??0),
      valuation_confidence:valuation.valuationConfidence||"low",
      expected_selling_price:Number(state.assessment.quick_sale_value??valuation.expectedSellingPrice??0),
      expected_net:0,
      expected_profit:0,
      sale_prob_30d:Number(valuation.saleProb30d??0),
      attributes:attrs,
      media:[],
      warnings:Array.isArray(id.warnings)?id.warnings:[],
      tags:[],
      acquired_cost:0
    }).select().single();
    if(error) throw error;
    state.savedItemId=item.id;
    try{
      const urls=await uploadImages(item.id);
      await supabase.from("items").update({media:urls,updated_at:new Date().toISOString()}).eq("id",item.id).eq("tenant_id",state.tenantId);
    }catch(imageError){
      console.warn("Image upload failed after item save:",imageError);
      alert(`Coin saved to SWISH, but image upload failed: ${imageError.message}`);
    }
    setStatus("Saved to SWISH");
    alert(`Saved to SWISH${state.savedItemId?` · ${state.savedItemId}`:""}.`);
  }catch(e){
    console.error(e);
    setStatus("Save error");
    alert(e.message||"SWISH save failed");
  }finally{$("save").disabled=false;}
};

window.addEventListener("beforeunload",()=>state.stream?.getTracks().forEach(t=>t.stop()));
loadConnection().catch(e=>{console.error(e);setStatus("Connect SWISH");});
