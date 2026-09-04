const $ = s => document.querySelector(s);
const fileInput = $('#fileInput'), sourceImage = $('#sourceImage'), sourceStage = $('#sourceStage');
const processButton = $('#processButton'), downloadButton = $('#downloadButton'), compareButton = $('#compareButton');
const resultCanvas = $('#resultCanvas'), resultStage = $('#resultStage'), processStatus = $('#processStatus');
const sourceStatus = $('#sourceStatus'), resultStatus = $('#resultStatus');
const camera = $('#camera'), cameraButton = $('#cameraButton'), captureButton = $('#captureButton');
const cameraSelect = $('#cameraSelect'), cameraRow = $('#cameraRow'), stopCamera = $('#stopCamera'), guide = $('#guide');
let sourceDataUrl = null, cleanedDataUrl = null, stream = null;

fileInput.addEventListener('change', async e => { const f=e.target.files?.[0]; if(f) loadImageFile(f); });
cameraButton.addEventListener('click', startCamera);
captureButton.addEventListener('click', captureFrame);
stopCamera.addEventListener('click', stopCameraFeed);
processButton.addEventListener('click', processCurrent);
downloadButton.addEventListener('click', ()=>{ if(!cleanedDataUrl)return; const a=document.createElement('a'); a.href=cleanedDataUrl; a.download='keenoncoins-cleaned.png'; a.click(); });
compareButton.addEventListener('click', openCompare);
$('#closeCompare').addEventListener('click', ()=>$('#compareModal').hidden=true);
document.querySelectorAll('.sample').forEach(b=>b.addEventListener('click',()=>loadSyntheticSample(b.dataset.sample)));

function setSource(src){ sourceDataUrl=src; sourceImage.src=src; sourceImage.hidden=false; camera.hidden=true; $('.empty').style.display='none'; sourceStatus.textContent='Image ready'; processButton.disabled=false; resultCanvas.hidden=true; cleanedDataUrl=null; downloadButton.disabled=true; compareButton.disabled=true; resultStatus.textContent='Waiting'; }
function loadImageFile(file){ const r=new FileReader(); r.onload=()=>setSource(r.result); r.readAsDataURL(file); }

async function startCamera(){
  try{
    if(stream) stopCameraFeed();
    stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1920},height:{ideal:1080},facingMode:'environment'},audio:false});
    camera.srcObject=stream; camera.hidden=false; sourceImage.hidden=true; $('.empty').style.display='none'; guide.hidden=false; cameraRow.hidden=false; captureButton.disabled=false; sourceStatus.textContent='Live camera';
    await populateCameras();
  }catch(err){ alert('Camera access failed. Check browser permission and make sure the microscope appears as a webcam device.\n\n'+err.message); }
}
async function populateCameras(){ const devices=await navigator.mediaDevices.enumerateDevices(); const cams=devices.filter(d=>d.kind==='videoinput'); cameraSelect.innerHTML=''; cams.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||`Camera ${i+1}`;cameraSelect.appendChild(o)}); cameraSelect.onchange=async()=>{if(!cameraSelect.value)return; if(stream)stream.getTracks().forEach(t=>t.stop()); stream=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:cameraSelect.value},width:{ideal:1920},height:{ideal:1080}},audio:false}); camera.srcObject=stream;}; }
function stopCameraFeed(){ if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;camera.srcObject=null;camera.hidden=true;guide.hidden=true;cameraRow.hidden=true;captureButton.disabled=true;sourceStatus.textContent=sourceDataUrl?'Image ready':'Waiting'; }
function captureFrame(){ const c=$('#cameraCanvas'); c.width=camera.videoWidth;c.height=camera.videoHeight;c.getContext('2d').drawImage(camera,0,0);setSource(c.toDataURL('image/png'));stopCameraFeed(); }

function setStep(name,state){const el=document.querySelector(`[data-step="${name}"]`);if(!el)return;el.classList.toggle('active',state==='active');el.classList.toggle('done',state==='done');if(state==='done')el.querySelector('i').textContent='✓';}
function resetSteps(){document.querySelectorAll('.steps div').forEach((el,i)=>{el.classList.remove('active','done');el.querySelector('i').textContent=i+1})}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
async function processCurrent(){
  if(!sourceDataUrl)return; processButton.disabled=true; downloadButton.disabled=true; compareButton.disabled=true; resetSteps(); processStatus.textContent='Processing…'; resultStatus.textContent='Working';
  const stages=['detect','boundary','geometry','pixels','background','png'];
  for(let i=0;i<stages.length;i++){setStep(stages[i],'active');await wait(i===3?160:90);if(i) setStep(stages[i-1],'done');}
  try{const out=await rebuildCoin(sourceDataUrl); resultCanvas.width=out.width;resultCanvas.height=out.height;resultCanvas.getContext('2d').clearRect(0,0,out.width,out.height);resultCanvas.getContext('2d').drawImage(out.canvas,0,0);resultCanvas.hidden=false;cleanedDataUrl=resultCanvas.toDataURL('image/png');setStep('png','done');processStatus.textContent='Complete';resultStatus.textContent='Transparent PNG ✓';downloadButton.disabled=false;compareButton.disabled=false;}catch(e){console.error(e);processStatus.textContent='Needs retake';resultStatus.textContent='Processing failed';alert('The coin could not be reliably isolated from this image. Try a stronger contrasting background and even lighting.');} finally{processButton.disabled=false;}
}

// Pixel-preserving browser CV prototype. No generative redraw: source pixels are warped into the detected coin ellipse.
async function rebuildCoin(dataUrl){
  const img=await loadImg(dataUrl); const max=1800; const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale); const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const im=ctx.getImageData(0,0,w,h),p=im.data;
  const bg=borderMedian(p,w,h); const mask=new Uint8Array(w*h); const scores=new Float32Array(w*h);
  // Contrast against the border background. Adaptive threshold is intentionally conservative.
  let sum=0,n=0; for(let y=1;y<h-1;y+=2)for(let x=1;x<w-1;x+=2){const d=colorDist(p,(y*w+x)*4,bg);scores[y*w+x]=d;if(d>18){sum+=d;n++}}
  const thr=Math.max(22,Math.min(80,(sum/(n||1))*0.52));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const d=colorDist(p,(y*w+x)*4,bg);mask[y*w+x]=d>thr?1:0;}
  // Find the strongest connected component near the image centre.
  const comp=findCentralComponent(mask,w,h); if(!comp || comp.count<Math.max(100,(w*h)*0.01)) throw Error('coin not found');
  const ellipse=ellipseFromComponent(comp,w,h);
  const size=Math.ceil(Math.max(ellipse.rx,ellipse.ry)*2*1.10); const out=document.createElement('canvas');out.width=size;out.height=size;const oc=out.getContext('2d');const od=oc.createImageData(size,size);const q=od.data;
  const cos=Math.cos(ellipse.angle),sin=Math.sin(ellipse.angle), cx=ellipse.cx,cy=ellipse.cy;
  for(let oy=0;oy<size;oy++)for(let ox=0;ox<size;ox++){
    const dx=ox-size/2,dy=oy-size/2; const r=Math.sqrt((dx/(Math.max(1,ellipse.rx*0.98)))**2+(dy/(Math.max(1,ellipse.ry*0.98)))**2);
    if(r>1.02) continue;
    // Map a circular output back into the detected ellipse: this corrects elliptical camera geometry without redrawing detail.
    const ex=dx,ey=dy; const rx=ex*Math.max(1,ellipse.rx/Math.max(1,ellipse.ry));
    const sx=cx + rx*cos - ey*sin, sy=cy + rx*sin + ey*cos; const ix=Math.round(sx),iy=Math.round(sy);
    if(ix<0||iy<0||ix>=w||iy>=h)continue; const si=(iy*w+ix)*4,di=(oy*size+ox)*4;
    const m=mask[iy*w+ix]; if(!m)continue; q[di]=p[si];q[di+1]=p[si+1];q[di+2]=p[si+2];q[di+3]=255;
  }
  // Small edge feather based on neighbouring alpha, not invented colour/detail.
  const feather=new Uint8ClampedArray(q.length);feather.set(q);for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){const i=(y*size+x)*4;if(q[i+3]&&(!q[i-4+3]||!q[i+4+3]||!q[i-size*4+3]||!q[i+size*4+3]))q[i+3]=220;}
  oc.putImageData(od,0,0);return {canvas:out,width:size,height:size};
}
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}
function borderMedian(p,w,h){const a=[];for(let x=0;x<w;x+=Math.max(1,Math.floor(w/80))){a.push([p[x*4],p[x*4+1],p[x*4+2]]);const j=((h-1)*w+x)*4;a.push([p[j],p[j+1],p[j+2]])}for(let y=0;y<h;y+=Math.max(1,Math.floor(h/80))){const a1=(y*w)*4,a2=(y*w+w-1)*4;a.push([p[a1],p[a1+1],p[a1+2]],[p[a2],p[a2+1],p[a2+2]])}return [median(a.map(x=>x[0])),median(a.map(x=>x[1])),median(a.map(x=>x[2]))]}
function median(a){a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]}
function colorDist(p,i,bg){return Math.sqrt((p[i]-bg[0])**2+(p[i+1]-bg[1])**2+(p[i+2]-bg[2])**2)}
function findCentralComponent(mask,w,h){const sx=Math.floor(w/2),sy=Math.floor(h/2),vis=new Uint8Array(w*h);const starts=[];for(let dy=-Math.floor(h*.12);dy<=Math.floor(h*.12);dy+=Math.max(2,Math.floor(h*.02)))for(let dx=-Math.floor(w*.12);dx<=Math.floor(w*.12);dx+=Math.max(2,Math.floor(w*.02))){const x=Math.max(0,Math.min(w-1,sx+dx)),y=Math.max(0,Math.min(h-1,sy+dy));if(mask[y*w+x])starts.push(y*w+x)}let best=null;for(const st of starts){if(vis[st])continue;const q=[st];vis[st]=1;const pts=[];while(q.length){const idx=q.pop();pts.push(idx);const x=idx%w,y=(idx/w)|0;for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(nx<0||ny<0||nx>=w||ny>=h)continue;const ni=ny*w+nx;if(mask[ni]&&!vis[ni]){vis[ni]=1;q.push(ni)}}if(pts.length>250000)break}if(!best||pts.length>best.length)best=pts}if(!best)return null;return {points:best,count:best.length}}
function ellipseFromComponent(comp,w,h){let sx=0,sy=0;for(const i of comp.points){sx+=i%w;sy+=(i/w)|0}const cx=sx/comp.count,cy=sy/comp.count;let xx=0,yy=0,xy=0,minx=w,miny=h,maxx=0,maxy=0;for(const i of comp.points){const x=i%w,y=(i/w)|0,dx=x-cx,dy=y-cy;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y)}xx/=comp.count;yy/=comp.count;xy/=comp.count;const angle=.5*Math.atan2(2*xy,xx-yy);const tr=(xx+yy)/2,det=Math.sqrt(Math.max(0,((xx-yy)/2)**2+xy**2));const l1=Math.max(1,tr+det),l2=Math.max(1,tr-det);let rx=Math.max(4,Math.sqrt(l1)*2.15),ry=Math.max(4,Math.sqrt(l2)*2.15);const bboxRx=(maxx-minx+1)/2,bboxRy=(maxy-miny+1)/2;rx=Math.max(rx,bboxRx*.98);ry=Math.max(ry,bboxRy*.98);return {cx,cy,rx,ry,angle}}

function openCompare(){if(!cleanedDataUrl||!sourceDataUrl)return;$('#compareOriginal').src=sourceDataUrl;$('#compareResult').src=cleanedDataUrl;$('#compareModal').hidden=false}
function loadSyntheticSample(kind){const c=document.createElement('canvas');c.width=1000;c.height=800;const x=c.getContext('2d');x.fillStyle=kind==='gold'?'#eee7d9':kind==='silver'?'#222a30':'#d5d5d2';x.fillRect(0,0,c.width,c.height);const cx=500,cy=400,r=260;x.save();x.translate(cx,cy);x.rotate(kind==='gold'?-.08:.04);const grad=x.createRadialGradient(-70,-80,30,0,0,r);grad.addColorStop(0,kind==='gold'?'#f5d88b':kind==='silver'?'#e5e8e9':'#827b6e');grad.addColorStop(1,kind==='gold'?'#9b6d21':kind==='silver'?'#596168':'#292722');x.beginPath();x.ellipse(0,0,r,r*(kind==='dark'?0.88:0.96),0,0,Math.PI*2);x.fillStyle=grad;x.fill();x.lineWidth=12;x.strokeStyle=kind==='gold'?'#d2a74f':kind==='silver'?'#aeb8bd':'#4f4b43';x.stroke();x.lineWidth=2;x.strokeStyle='#ffffff55';x.beginPath();x.arc(0,0,r*.82,0,Math.PI*2);x.stroke();x.fillStyle='#ffffffaa';x.font='bold 70px Georgia';x.textAlign='center';x.textBaseline='middle';x.fillText(kind==='gold'?'K':kind==='silver'?'✣':'K',0,0);x.font='bold 28px Georgia';x.fillText('KEENONCOINS',0,r*.62);x.restore();setSource(c.toDataURL('image/png'))}
