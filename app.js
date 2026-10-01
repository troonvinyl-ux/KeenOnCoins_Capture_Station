/* KeenOnCoins Capture Station
   Static/local-first implementation.
   Add your SWISH/Supabase endpoint in CONFIG when you are ready to connect it.
*/
const CONFIG = {
  SWISH_IDENTIFY_URL: "",
  SWISH_VALUE_URL: "",
  SWISH_SAVE_URL: ""
};

const $ = id => document.getElementById(id);
const state = { stream:null, side:"obverse", obverse:null, reverse:null, assessment:null };

function setStatus(s){ $("status").textContent=s; }
function setMessage(s){ $("cameraMessage").textContent=s; }

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
    setStatus("Camera ready");
  }catch(e){
    setMessage("Camera unavailable — use Photo instead");
    setStatus("Photo mode");
  }
}

function makeCapture(){
  const video=$("camera"), canvas=$("canvas");
  if(!video.videoWidth) return null;
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  const ctx=canvas.getContext("2d");
  ctx.drawImage(video,0,0);
  return canvas.toDataURL("image/jpeg",.92);
}

function storeShot(data){
  if(state.side==="obverse"){
    state.obverse=data; $("obversePreview").src=data;
    state.side="reverse";
    $("sideLabel").textContent="REVERSE";
    $("nextSide").textContent="Switch to obverse";
  }else{
    state.reverse=data; $("reversePreview").src=data;
    state.side="obverse";
    $("sideLabel").textContent="OBVERSE";
    $("nextSide").textContent="Switch to reverse";
  }
  $("nextSide").disabled=false;
  $("identify").disabled=!(state.obverse&&state.reverse);
  setStatus(state.obverse&&state.reverse?"Both sides captured":"Side captured");
}

$("startCamera").onclick=startCamera;
$("capture").onclick=()=>{const d=makeCapture();if(d)storeShot(d)};
$("nextSide").onclick=()=>{
  state.side=state.side==="obverse"?"reverse":"obverse";
  $("sideLabel").textContent=state.side.toUpperCase();
};

$("photoInput").onchange=e=>{
  const f=e.target.files?.[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>storeShot(r.result); r.readAsDataURL(f);
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

async function callApi(url,payload){
  if(!url) return null;
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if(!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

function showAssessment(a){
  state.assessment=a;
  $("resultBody").innerHTML="";
  const dl=document.createElement("dl");
  const fields=[
    ["Identification",a.identification||"Not established"],
    ["Confidence",a.confidence!=null?`${a.confidence}%`:"Not established"],
    ["Reference",a.reference||"—"],
    ["Quick-sale value",a.quick_sale_value!=null?`£${a.quick_sale_value}`:"Not established"],
    ["Reasoning",a.reasoning||"Use the evidence above and avoid over-attribution."]
  ];
  fields.forEach(([k,v])=>{
    const dt=document.createElement("dt"),dd=document.createElement("dd");
    dt.textContent=k;dd.textContent=v;dl.append(dt,dd);
  });
  $("resultBody").append(dl);
  $("result").classList.remove("hidden");
}

$("identify").onclick=async()=>{
  setStatus("Identifying…");
  const payload=details();
  try{
    const result=await callApi(CONFIG.SWISH_IDENTIFY_URL,payload);
    if(result){showAssessment(result);}
    else{
      showAssessment({
        identification:"No live identification endpoint configured",
        confidence:0,
        reference:"—",
        reasoning:"The capture is complete. Connect the existing SWISH identification function in CONFIG.SWISH_IDENTIFY_URL; this build deliberately does not invent an attribution."
      });
    }
    $("value").disabled=false;
    $("save").disabled=false;
    setStatus("Assessment ready");
  }catch(e){setStatus("Identification error");alert(e.message)}
};

$("value").onclick=async()=>{
  setStatus("Valuing…");
  try{
    const result=await callApi(CONFIG.SWISH_VALUE_URL,{...details(),assessment:state.assessment});
    if(result){state.assessment={...state.assessment,...result};showAssessment(state.assessment)}
    else showAssessment({...state.assessment,quick_sale_value:"Not calculated",reasoning:(state.assessment?.reasoning||"")+" No live valuation endpoint configured."});
    setStatus("Valuation ready");
  }catch(e){setStatus("Valuation error");alert(e.message)}
};

$("save").onclick=async()=>{
  setStatus("Saving…");
  try{
    const result=await callApi(CONFIG.SWISH_SAVE_URL,{...details(),assessment:state.assessment});
    if(CONFIG.SWISH_SAVE_URL&&!result) throw new Error("Save failed");
    setStatus(CONFIG.SWISH_SAVE_URL?"Saved to SWISH":"Ready to connect to SWISH");
    alert(CONFIG.SWISH_SAVE_URL?"Saved to SWISH.":"Capture is complete. Add the existing SWISH save endpoint in app.js to write this record.");
  }catch(e){setStatus("Save error");alert(e.message)}
};

window.addEventListener("beforeunload",()=>state.stream?.getTracks().forEach(t=>t.stop()));
