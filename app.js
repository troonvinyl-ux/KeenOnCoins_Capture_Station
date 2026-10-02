import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CONFIG = {
  SUPABASE_URL: "https://iwgaqieyoahmcjfziwga.backend.onspace.ai",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODkwNjM4MTgsImV4cCI6MjEwNDQyMzgxOCwicmVmIjoiaXdnYXFpZXlvYWhtY2pmeml3Z2EiLCJyb2xlIjoiYW5vbiIsImlzcyI6Im9uc3BhY2UifQ.cioQ38guPLFAbl3x48mUaJcMSxU5IpZn7-H-JhtvXJc",
  IDENTIFY_FUNCTION: "swish-identify",
  VALUE_FUNCTION: "swish-market-value",
  EBAY_FUNCTION: "swish-ebay-list",
  IMAGE_BUCKET: "item-images"
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = id => document.getElementById(id);
const state = {
  stream:null, side:"obverse", obverse:null, reverse:null,
  assessment:null, tenantId:null, user:null, connected:false, busy:false,
  itemId:null, itemMedia:[], listingId:null, categoryStack:[],
  selectedCategory:null, aspects:[], itemSpecifics:[], categoryLoading:false
};

function setStatus(message){ const b=$("swishConnect"); if(b){b.dataset.status=message;b.title=message;} }
function showLogin(v=true){$("loginPanel")?.classList.toggle("hidden",!v);}
function showError(title,msg,detail=""){const p=$("errorPanel"); if(!p){alert(`${title}\n\n${msg}`);return;} $("errorTitle").textContent=title;$("errorMessage").textContent=msg;$("errorDetail").textContent=detail;p.classList.remove("hidden");}
function clearError(){$("errorPanel")?.classList.add("hidden");}
function setBusy(v){state.busy=v;["identify","value","save","capture","startCamera"].forEach(id=>{const e=$(id);if(e)e.disabled=v || (id==="capture"&&!state.stream);});updateButtons();}
async function readableFunctionError(error){let msg=error?.message||"SWISH function failed",detail="";try{if(error?.context){detail=await error.context.clone().text();try{const j=JSON.parse(detail);msg=j.error||j.message||msg;detail=JSON.stringify(j,null,2);}catch{}}}catch{}return{msg,detail};}

async function getTenant(){
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError) throw new Error(userError.message);
  if(!user) return null;
  const {data,error}=await supabase.from("tenants").select("id,name").order("created_at",{ascending:true}).limit(1);
  if(error) throw new Error(`Tenant lookup failed: ${error.message}`);
  return data?.[0]||null;
}
async function loadConnection(){
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user){state.connected=false;state.user=null;state.tenantId=null;setConnectionText();updateButtons();return false;}
    state.user=session.user; const tenant=await getTenant();
    if(!tenant) throw new Error("This SWISH account has no business/tenant yet.");
    state.tenantId=tenant.id;state.connected=true;setConnectionText();showLogin(false);setStatus("SWISH connected · Ready");updateButtons();return true;
  }catch(e){state.connected=false;state.tenantId=null;setConnectionText();showError("SWISH connection",e.message||String(e));updateButtons();return false;}
}
function setConnectionText(){const b=$("swishConnect");if(b){b.textContent=state.connected?"SWISH connected":"Connect SWISH";b.classList.toggle("connected",state.connected);}}

async function login(e){
  e?.preventDefault();clearError();
  const email=$("loginEmail")?.value.trim()||"",password=$("loginPassword")?.value||"";
  if(!email||!password){showError("Login required","Enter your SWISH email and password.");return;}
  const b=$("loginBtn");b.disabled=true;b.textContent="Connecting…";
  try{
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error) throw error;
    if(!(await loadConnection())) return;
    $("loginPassword").value="";
  }catch(e){showError("SWISH login failed",e.message||String(e));}
  finally{b.disabled=false;b.textContent="Connect";updateButtons();}
}
async function connectSwish(){
  clearError();
  if(state.connected){await supabase.auth.signOut();state.connected=false;state.tenantId=null;state.user=null;setConnectionText();showLogin(true);updateButtons();return;}
  showLogin(true);
}

async function startCamera(){
  clearError();
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API unavailable.");
    state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false});
    $("camera").srcObject=state.stream;await $("camera").play();$("startCamera").textContent="Camera running";$("cameraMessage").textContent="Centre the coin in the guide";updateButtons();
  }catch(e){$("cameraMessage").textContent="Camera unavailable — use Photo instead";showError("Camera unavailable",e.message||String(e),"Use Photo to capture each side.");}
}
function makeCapture(){
  const v=$("camera"),c=$("canvas");if(!v?.videoWidth){showError("Camera not ready","Start the camera first.");return null;}
  c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0,c.width,c.height);return c.toDataURL("image/jpeg",0.9);
}
function storeShot(data){
  if(!data)return;
  if(state.side==="obverse"){state.obverse=data;$("obversePreview").src=data;state.side="reverse";}else{state.reverse=data;$("reversePreview").src=data;state.side="obverse";}
  $("sideLabel").textContent=state.side.toUpperCase();$("nextSide").disabled=false;updateButtons();
}
function details(){return{weight_g:parseFloat($("weight")?.value)||null,diameter_mm:parseFloat($("diameter")?.value)||null,metal:$("metal")?.value||"Unknown",notes:$("notes")?.value.trim()||""};}
function imageList(){return[state.obverse,state.reverse].filter(Boolean);}
function knownAttributes(){const d=details();return{weight:d.weight_g,diameter:d.diameter_mm,material:d.metal,customNotes:d.notes};}

function updateButtons(){
  const captured=!!(state.obverse&&state.reverse);
  $("identify").disabled=state.busy||!captured||!state.connected;
  $("value").disabled=state.busy||!state.assessment?.rawIdentification||!state.connected;
  $("save").disabled=state.busy||!state.assessment?.rawIdentification||!state.connected;
  $("capture").disabled=state.busy||!state.stream;
  $("startCamera").disabled=state.busy;
  $("prepareListing").disabled=!state.itemId||!state.assessment;
  $("submitEbay").disabled=!state.listingId||!state.selectedCategory;
}

function renderAssessment(){
  const a=state.assessment||{},id=a.rawIdentification?.identification||{},n=a.rawIdentification?.numistaVerification||{};
  const rows=[["Identification",a.identification||"Not established"],["Confidence",a.confidence!=null?`${a.confidence}%`:"Not established"],["Identification state",id.identificationState||"—"],["Numista",a.reference||"Not verified"],["Quick-sale value",a.quick_sale_value!=null?`£${a.quick_sale_value}`:"Not calculated"],["Reasoning",a.reasoning||""]];
  if(n.matchScore!=null)rows.push(["Numista match",`${n.matchScore}/100 · ${n.status||"unknown"}`]);
  if(id.candidateIdentification?.alternativeCandidates?.length)rows.push(["Alternatives",id.candidateIdentification.alternativeCandidates.join(" · ")]);
  const body=$("resultBody");body.innerHTML="";const dl=document.createElement("dl");
  rows.forEach(([k,v])=>{const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v||"—";dl.append(dt,dd);});body.append(dl);$("result").classList.remove("hidden");
}

async function identify(){
  clearError();if(!state.connected){showLogin(true);return;}if(!state.obverse||!state.reverse){showError("Two sides required","Capture both sides first.");return;}
  setBusy(true);setStatus("SWISH · Identifying…");
  try{
    const {data,error}=await supabase.functions.invoke(CONFIG.IDENTIFY_FUNCTION,{body:{images:imageList(),specialistId:"coins",tenantId:state.tenantId,knownAttributes:knownAttributes()}});
    if(error){const r=await readableFunctionError(error);throw new Error(`${r.msg}\n${r.detail}`);}
    if(!data?.identification)throw new Error(data?.error||"SWISH returned no identification.");
    const id=data.identification,n=data.numistaVerification||{};
    state.assessment={rawIdentification:data,identification:id.canonicalTitle||id.candidateIdentification?.primaryCandidate||"Not established",confidence:Math.round(Number(id.confidence||0)*100),reference:id.numistaN||n.numistaN||(n.typeId?`N#${n.typeId}`:"—"),reasoning:[id.identificationState?`State: ${id.identificationState}`:"",id.confidenceReason||"",n.status?`Numista: ${n.status}${n.matchScore!=null?` (${n.matchScore}/100)`:""}`:"",...(id.warnings||[])].filter(Boolean).join(" · ")};
    renderAssessment();computeCommercialScore();$("ebayPanel").classList.remove("hidden");populateListingDraft();setStatus("SWISH · Identification complete");
  }catch(e){showError("SWISH identification failed",e.message||String(e));}finally{setBusy(false);}
}
async function value(){
  clearError();if(!state.assessment?.rawIdentification){showError("Identify first","Run identification before valuation.");return;}
  setBusy(true);setStatus("SWISH · Valuing…");
  try{
    const raw=state.assessment.rawIdentification,id=raw.identification||{},n=raw.numistaVerification||{};
    const {data,error}=await supabase.functions.invoke(CONFIG.VALUE_FUNCTION,{body:{tenantId:state.tenantId,title:id.canonicalTitle||"Unknown coin",specialistId:"coins",attributes:{...(id.attributes||{}),...(id.coinFields||{})},condition:id.condition||"Cannot be reliably graded from supplied images",identificationConfidence:Number(id.confidence||0),identificationTier:id.confidenceTier||"low",numistaTypeId:id.numistaTypeId||n.typeId||null,numistaMatchScore:Number(n.matchScore||id.numistaMatchScore||0),numistaMatchTier:n.status||id.numistaStatus||"no_match",applyToItem:false}});
    if(error){const r=await readableFunctionError(error);throw new Error(`${r.msg}\n${r.detail}`);}
    const q=data?.quickSaleValue??data?.quick_sale_value??data?.valuation?.quickSaleValue??data?.valuation?.quick_sale_value??data?.valuation?.recommendedListingPrice??data?.recommendedListingPrice??null;
    state.assessment.valuation=data;state.assessment.quick_sale_value=q;state.assessment.reasoning=(state.assessment.reasoning||"")+(q!=null?` · Market evidence returned £${q}.`:" · No quick-sale figure returned.");renderAssessment();computeCommercialScore();populateListingDraft();setStatus("SWISH · Valuation complete");
  }catch(e){showError("SWISH valuation failed",e.message||String(e));}finally{setBusy(false);}
}

async function uploadImages(itemId){
  const urls=[];for(let i=0;i<imageList().length;i++){const data=imageList()[i],side=i===0?"obverse":"reverse",path=`${itemId}/${i+1}_${side}.jpg`;const blob=await(await fetch(data)).blob();const {error}=await supabase.storage.from(CONFIG.IMAGE_BUCKET).upload(path,blob,{contentType:"image/jpeg",upsert:true});if(error)throw error;urls.push(supabase.storage.from(CONFIG.IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);}return urls;
}
async function save(){
  clearError();if(!state.assessment?.rawIdentification){showError("Identify first","There is no identification to save.");return;}
  setBusy(true);setStatus("SWISH · Saving coin…");
  try{
    const raw=state.assessment.rawIdentification,id=raw.identification||{},v=state.assessment.valuation||{},d=details();
    const attributes={...(id.attributes||{}),...(id.coinFields||{}),object_type:id.objectType||"coin",identification_state:id.identificationState||"observation_only",weight_g:d.weight_g,diameter_mm:d.diameter_mm,metal:d.metal,notes:d.notes,numista_type_id:id.numistaTypeId||raw.numistaVerification?.typeId||null,numista_n:id.numistaN||raw.numistaVerification?.numistaN||null,numista_url:id.numistaUrl||raw.numistaVerification?.numistaUrl||null};
    const {data:item,error}=await supabase.from("items").insert({tenant_id:state.tenantId,canonical_title:id.canonicalTitle||"Unidentified coin",description:id.condition?`Condition: ${id.condition}`:"",specialist_id:"coins",status:Number(id.confidence||0)>=.8?"identified":"review_required",disposition_decision:id.dispositionDecision||"sell_individual",condition:id.condition||"Cannot be reliably graded from supplied images",condition_grade:id.conditionGrade||"",condition_notes:id.conditionNotes||"",identification_confidence:Number(id.confidence||0),identification_source:id.identificationSource||"researched",valuation_low:Number(v.valuationLow??v.low??0),valuation_mid:Number(v.valuationMid??v.mid??state.assessment.quick_sale_value??0),valuation_high:Number(v.valuationHigh??v.high??0),valuation_confidence:v.valuationConfidence||"unknown",expected_selling_price:Number(v.recommendedListingPrice??state.assessment.quick_sale_value??0),expected_net:0,expected_profit:0,sale_prob_30d:Number(v.saleProb30d??0),attributes,media:[],warnings:Array.isArray(id.warnings)?id.warnings:[],tags:[],acquired_cost:0}).select().single();
    if(error)throw error;
    state.itemId=item.id;
    try{state.itemMedia=await uploadImages(item.id);await supabase.from("items").update({media:state.itemMedia,updated_at:new Date().toISOString()}).eq("id",item.id).eq("tenant_id",state.tenantId);}catch(e){showError("Coin saved, photos need attention","The coin record was saved but photo upload failed.",e.message);}
    $("ebayPanel").classList.remove("hidden");populateListingDraft();setStatus("Saved to SWISH ✓");updateButtons();
  }catch(e){showError("SWISH save failed",e.message||String(e));}finally{setBusy(false);}
}

function computeCommercialScore(){
  const a=state.assessment||{}, raw=a.rawIdentification||{}, id=raw.identification||{}, n=raw.numistaVerification||{};
  const conf=Math.max(0,Math.min(100,Number(a.confidence||0))), match=Math.max(0,Math.min(100,Number(n.matchScore||id.numistaMatchScore||0)));
  const val=a.quick_sale_value!=null?Number(a.quick_sale_value):0;
  let score=Math.round(conf*.55+match*.30+(val>0?15:0));
  if((id.identificationState||"").toLowerCase().includes("observation"))score=Math.min(score,59);
  score=Math.max(0,Math.min(100,score));
  $("commercialScore").textContent=score;$("commercialBadge").textContent=`Commercial score ${score}/100`;
  $("commercialReason").textContent=`${conf}% ID confidence · ${match}/100 Numista match · ${val>0?"market evidence present":"valuation evidence missing"}.`;
}

function populateListingDraft(){
  if(!state.assessment)return;
  const a=state.assessment,raw=a.rawIdentification||{},id=raw.identification||{},d=details();
  const title=(id.canonicalTitle||a.identification||"Unidentified coin").slice(0,80);
  $("ebayTitle").value=title;$("titleCount").textContent=`${title.length}/80`;
  const price=a.quick_sale_value!=null?Number(a.quick_sale_value):Number(raw.valuation?.recommendedListingPrice||0);
  if(price) $("ebayPrice").value=price.toFixed(2);
  $("ebayConditionDescription").value=id.conditionNotes||id.condition||"Condition as shown in photographs. Please study all photographs before purchase.";
  $("ebayDescription").value=buildDescription(id,d,a);
  $("ebayTitle").dispatchEvent(new Event("input"));
}
function buildDescription(id,d,a){
  const lines=[id.canonicalTitle||a.identification||"Unidentified coin","",id.condition?`Condition: ${id.condition}`:"Condition: please assess from photographs.",d.weight_g?`Weight: ${d.weight_g} g`:null,d.diameter_mm?`Diameter: ${d.diameter_mm} mm`:null,d.metal?`Metal: ${d.metal}`:null,a.reference&&a.reference!=="—"?`Reference: ${a.reference}`:null,"","The photographs show the actual item. Please use them together with the measurements above when assessing the item."].filter(x=>x!==null);
  return lines.join("\n");
}

async function ebayCall(body){
  const {data,error}=await supabase.functions.invoke(CONFIG.EBAY_FUNCTION,{body:{tenantId:state.tenantId,...body}});
  if(error){const r=await readableFunctionError(error);throw new Error(`${r.msg}\n${r.detail}`);}
  if(data?.success===false)throw new Error(data.error||"eBay request failed.");
  if(data?.error)throw new Error(data.error);
  return data;
}

async function loadCategories(parentId=""){
  if(!state.connected||!state.tenantId)return;
  state.categoryLoading=true;$("categoryStatus").textContent="Loading live eBay categories…";$("categoryList").innerHTML="";
  try{
    const data=await ebayCall({route:"get_category_children",parentId});
    if(!data.success)throw new Error(data.error||"Live category lookup failed.");
    const children=data.children||[];state.categoryStack=parentId===""?[]:state.categoryStack;
    $("categoryList").innerHTML="";
    children.forEach(c=>{const b=document.createElement("button");b.type="button";b.className="category-row";b.innerHTML=`<span>${escapeHtml(c.name)}</span><small>${c.isLeaf?"LEAF":"›"}</small>`;b.onclick=()=>selectCategoryNode(c);$("categoryList").appendChild(b);});
    $("categoryStatus").textContent=`Live eBay UK categories · ${children.length} choices`;
  }catch(e){$("categoryStatus").textContent="Live categories unavailable";showError("eBay categories",e.message||String(e));}
  finally{state.categoryLoading=false;}
}
function selectCategoryNode(c){
  if(c.isLeaf){state.selectedCategory={id:c.id,name:c.name};$("selectedCategory").textContent=`${c.name} · ${c.id}`;$("loadAspects").disabled=false;$("submitEbay").disabled=!state.listingId;loadAspects();return;}
  state.categoryStack.push({id:c.id,name:c.name});$("categoryPath").textContent=state.categoryStack.map(x=>x.name).join(" › ");$("categoryBack").disabled=false;loadCategories(c.id);
}
async function loadAspects(){
  if(!state.selectedCategory)return;
  $("specificsList").innerHTML="Loading eBay requirements…";
  try{
    const data=await ebayCall({route:"get_category_aspects",categoryId:state.selectedCategory.id});
    state.aspects=data.aspects||[];
    renderSpecifics();
  }catch(e){$("specificsList").textContent=`Could not load category specifics: ${e.message}`;}
}
function renderSpecifics(){
  const wrap=$("specificsList");wrap.innerHTML="";
  const attrs=state.assessment?.rawIdentification?.identification?.attributes||{};
  const existing={...attrs,...details()};
  state.itemSpecifics=[];
  state.aspects.forEach(a=>{
    const name=a.aspectName, key=name.toLowerCase().replace(/[^a-z0-9]+/g,"_");
    const v=Object.keys(existing).find(k=>k.toLowerCase()===key)?.toString();
    const label=document.createElement("label");label.className="specific";
    const required=a.aspectConstraint?.aspectRequired===true;
    label.innerHTML=`${escapeHtml(name)} ${required?"*":""}`;
    const input=document.createElement("input");input.dataset.specific=name;input.value=v||"";
    input.placeholder=required?"Required":"Optional";
    label.appendChild(input);wrap.appendChild(label);
  });
}
function collectSpecifics(){
  return [...document.querySelectorAll("#specificsList input[data-specific]")].map(i=>({name:i.dataset.specific,value:i.value.trim()})).filter(x=>x.value);
}

async function createDraftListing(){
  if(!state.itemId){showError("Save the coin first","The eBay listing must be attached to the SWISH inventory item.");return;}
  if(!state.selectedCategory){showError("Choose an eBay category","Select a live leaf category before creating the listing.");return;}
  const title=$("ebayTitle").value.trim().slice(0,80),description=$("ebayDescription").value.trim(),price=Number($("ebayPrice").value||0);
  if(!title||!description||price<=0){showError("Listing incomplete","Enter a title, description and price.");return;}
  setBusy(true);$("listingStatus").textContent="Creating SWISH eBay draft…";
  try{
    const {data,error}=await supabase.from("listings").insert({tenant_id:state.tenantId,item_id:state.itemId,marketplace_id:"ebay",title,description,price,floor_price:price,ceiling_price:price,shipping_cost:0,status:"draft",category_id:state.selectedCategory.id}).select().single();
    if(error)throw error;
    state.listingId=data.id;state.itemSpecifics=collectSpecifics();
    await supabase.from("items").update({attributes:{...(state.assessment.rawIdentification.identification?.attributes||{}),ebay_category_id:state.selectedCategory.id,ebay_category_name:state.selectedCategory.name}}).eq("id",state.itemId).eq("tenant_id",state.tenantId);
    $("listingStatus").textContent=`Draft ready · ${data.id}`;
    $("submitEbay").disabled=false;updateButtons();
  }catch(e){$("listingStatus").textContent="Draft failed";showError("Could not create eBay draft",e.message||String(e));}
  finally{setBusy(false);}
}

async function submitEbay(){
  if(!state.listingId||!state.selectedCategory)return;
  const title=$("ebayTitle").value.trim().slice(0,80),description=$("ebayDescription").value.trim(),price=Number($("ebayPrice").value||0),quantity=Math.max(1,Number($("ebayQuantity").value||1));
  setBusy(true);$("submitEbay").disabled=true;$("listingStatus").textContent="Submitting securely to eBay…";
  try{
    const {data:updated,error}=await supabase.from("listings").update({title,description,price,category_id:state.selectedCategory.id,updated_at:new Date().toISOString()}).eq("id",state.listingId).select().single();
    if(error)throw error;
    const mediaUrls=state.itemMedia.filter(u=>u.startsWith("https://"));
    const result=await ebayCall({route:"publish",listingId:state.listingId,listingType:"FixedPriceItem",title,description,price,categoryId:state.selectedCategory.id,quantity,condition:$("ebayCondition").value,conditionDescription:$("ebayConditionDescription").value.trim(),itemSpecifics:collectSpecifics(),mediaUrls});
    $("listingStatus").innerHTML=`<strong>eBay listing created ✓</strong><br>Item ID: ${escapeHtml(result.externalListingId||"—")}<br><a href="${result.viewItemUrl||"#"}" target="_blank" rel="noopener">Open listing on eBay</a>`;
  }catch(e){$("listingStatus").textContent="eBay submission failed";showError("eBay submission failed",e.message||String(e));$("submitEbay").disabled=false;}
  finally{setBusy(false);updateButtons();}
}

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

function install(){
  document.addEventListener("click",e=>{
    const t=e.target;
    if(t.closest("#swishConnect"))return connectSwish();
    if(t.closest("#loginBtn"))return login(e);
    if(t.closest("#loginCancel"))return showLogin(false);
    if(t.closest("#startCamera"))return startCamera();
    if(t.closest("#capture")){const img=makeCapture();if(img)storeShot(img);return;}
    if(t.closest("#nextSide")){state.side=state.side==="obverse"?"reverse":"obverse";$("sideLabel").textContent=state.side.toUpperCase();return;}
    if(t.closest("#identify"))return identify();
    if(t.closest("#value"))return value();
    if(t.closest("#save"))return save();
    if(t.closest("#retryConnection"))return loadConnection();
    if(t.closest("#categoryBack")){if(state.categoryStack.length){state.categoryStack.pop();const p=state.categoryStack.at(-1)?.id||"";$("categoryPath").textContent=state.categoryStack.map(x=>x.name).join(" › ")||"Top level";$("categoryBack").disabled=!state.categoryStack.length;loadCategories(p);}return;}
    if(t.closest("#loadAspects"))return loadAspects();
    if(t.closest("#prepareListing"))return createDraftListing();
    if(t.closest("#submitEbay"))return submitEbay();
  });
  $("photoInput")?.addEventListener("change",e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>storeShot(r.result);r.readAsDataURL(f);});
  $("ebayTitle")?.addEventListener("input",()=>{$("titleCount").textContent=`${$("ebayTitle").value.length}/80`;});
  window.addEventListener("beforeunload",()=>state.stream?.getTracks().forEach(t=>t.stop()));
  $("swishConnect").addEventListener("click",()=>{});
  loadConnection();
}
function initialise(){install();updateButtons();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialise,{once:true});else initialise();
