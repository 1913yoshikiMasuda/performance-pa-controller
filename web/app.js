const $ = (id) => document.getElementById(id);
const performanceSurface=document.querySelector("main");
for(const eventName of ["contextmenu","selectstart","dragstart"])performanceSurface.addEventListener(eventName,(event)=>event.preventDefault());
let theme=localStorage.getItem("pps-theme")==="hype"?"hype":"studio";
let project = null;
let socket = null;
let selectedSource = null;
let editMode = false;
let fired = null;
let toastTimer = null;
let controlDrag = null;
let controlResize = null;
let faderTouch = null;
const padTouches = new Map();
let speakerDrag = null;
const camera = { mode:"3d", az:0, el:0.95, zoom:1, preset:"iso" };
const stagePointers = new Map();
const layoutPointers = new Map();
let stageGesture = null;
let stagePinch = null;
let sourceDrag = null;
let pendingSpatialMove = null;
let spatialMoveFrame = 0;
let layoutOrbit = null;
let layoutPinch = null;

function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function toast(message) { $("toast").textContent = message; $("toast").classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("on"), 1800); }

function connect() {
  socket = new WebSocket(`ws://${location.host}`);
  socket.addEventListener("open", () => { $("status").querySelector("span").textContent = "Hub connected"; send({ type:"state.request" }); });
  socket.addEventListener("close", () => { setStatus(false); setTimeout(connect, 1000); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "state.full" || message.type === "state.project") {
      project = message.project;
      if (message.type === "state.full") setStatus(message.oscReady);
      if (!project.spatialSources.some((source) => source.id === selectedSource)) selectedSource = project.spatialSources[0]?.id ?? null;
      render();
    } else if (message.type === "spatial.moved") {
      const source = project.spatialSources.find((item) => item.id === message.id);
      if (source) source.position = message.position;
      drawStage();
    } else if (message.type === "spatial.fired") {
      const source = project.spatialSources.find((item) => item.id === message.id);
      if (source) source.position = message.position;
      fired = { ...message, at:performance.now() }; drawStage();
    } else if (message.type === "project.data") downloadProject(message.project);
    else if (message.type === "error") toast(message.message);
  });
}

function setStatus(ok) { $("status").classList.toggle("ok", ok); $("status").querySelector("span").textContent = ok ? "OSC socket ready" : "Reconnecting"; }
function selected() { return project?.spatialSources.find((source) => source.id === selectedSource); }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function cssColor(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}

function render() {
  if (!project) return;
  document.body.classList.toggle("editing", editMode);
  $("mode").textContent = editMode ? "EDIT" : "LIVE"; $("mode").classList.toggle("edit", editMode);
  $("project-name").textContent = project.name;
  renderSources(); renderControls(); renderSettings(); requestAnimationFrame(() => { drawStage(); drawLayout(); syncViewControls(); });
}

function renderSources() {
  $("sources").replaceChildren(...project.spatialSources.map((source) => {
    const wrap = document.createElement("div"); wrap.className = "source-wrap";
    const button = document.createElement("button"); button.className = `source${source.id === selectedSource ? " selected" : ""}`; button.textContent = source.id;
    button.addEventListener("click", () => { selectedSource = source.id; $("height").value = source.position[2]; updateHeight(); renderSources(); drawStage(); });
    const remove = document.createElement("button"); remove.className = "remove"; remove.textContent = "×"; remove.addEventListener("click", (event) => { event.stopPropagation(); send({ type:"spatial.remove", id:source.id }); });
    wrap.append(button, remove); return wrap;
  }));
  const source = selected(); if (source) $("height").value = source.position[2]; updateHeight();
}

function renderControls() {
  const board = $("control-board"); board.replaceChildren(...project.controls.map((control) => {
    const element = document.createElement("div"); element.className = `control ${control.type}`; element.dataset.id = control.id;
    Object.assign(element.style, { left:`${control.x*100}%`, top:`${control.y*100}%`, width:`${control.w*100}%`, height:`${control.h*100}%` });
    if (control.type === "pad") {
      element.append(document.createTextNode(control.id));
      element.addEventListener("pointerdown", (event) => {
        if(editMode){beginControlDrag(event,control,element);return;}
        if(![...padTouches.values()].some((touch)=>touch.id===control.id))send({type:"control.trigger",id:control.id,gate:1});
        padTouches.set(event.pointerId,{id:control.id,element});element.classList.add("held");element.setPointerCapture(event.pointerId);event.preventDefault();
      });
      element.addEventListener("pointerup",endPadTouch);element.addEventListener("pointercancel",endPadTouch);
    } else {
      const label = document.createElement("b"); label.textContent = control.id;
      const input = document.createElement("input"); input.type = "range"; input.min = "0"; input.max = "1"; input.step = "0.001"; input.value = control.value;
      const output = document.createElement("output"); output.textContent = `${Math.round(control.value*100)}%`;
      const rail=document.createElement("div");rail.className="fader-rail";rail.innerHTML='<i class="fader-fill"></i><i class="fader-thumb"></i>';
      element.style.setProperty("--value",control.value);
      input.addEventListener("input", () => { element.style.setProperty("--value",input.value);output.textContent = `${Math.round(input.value*100)}%`; send({ type:"control.value", id:control.id, value:Number(input.value) }); });
      element.append(label,rail,output,input); element.addEventListener("pointerdown", (event) => { if (editMode) beginControlDrag(event, control, element); else beginFaderTouch(event,control,element,input,output); });
    }
    const remove = document.createElement("button"); remove.className = "remove"; remove.textContent = "×"; remove.addEventListener("click", (event) => { event.stopPropagation(); send({ type:"control.remove", id:control.id }); }); element.append(remove);
    const resize=document.createElement("button");resize.className="resize-handle";resize.setAttribute("aria-label",`Resize ${control.id}`);resize.addEventListener("pointerdown",(event)=>beginControlResize(event,control,element));element.append(resize);
    return element;
  }));
}

function endPadTouch(event){
  const touch=padTouches.get(event.pointerId);if(!touch)return;padTouches.delete(event.pointerId);
  if(![...padTouches.values()].some((item)=>item.id===touch.id)){touch.element.classList.remove("held");send({type:"control.trigger",id:touch.id,gate:0});}
}

function beginControlDrag(event, control, element) {
  if (event.target.classList.contains("remove")||event.target.classList.contains("resize-handle")) return;
  const rect = $("control-board").getBoundingClientRect(); controlDrag = { id:control.id, pointer:event.pointerId, element, rect, dx:event.clientX-element.getBoundingClientRect().left, dy:event.clientY-element.getBoundingClientRect().top };
  element.setPointerCapture(event.pointerId); event.preventDefault();
}
function beginControlResize(event,control,element){
  if(!editMode)return;event.stopPropagation();event.preventDefault();const boardRect=$("control-board").getBoundingClientRect();
  controlResize={pointer:event.pointerId,control,element,boardRect,startX:event.clientX,startY:event.clientY,startW:control.w,startH:control.h};event.currentTarget.setPointerCapture(event.pointerId);
}
function beginFaderTouch(event,control,element,input,output){
  faderTouch={pointer:event.pointerId,control,element,input,output};element.setPointerCapture(event.pointerId);event.preventDefault();updateFaderTouch(event);
}
function updateFaderTouch(event){
  if(!faderTouch||event.pointerId!==faderTouch.pointer)return;const rect=faderTouch.element.getBoundingClientRect(),top=rect.top+22,bottom=rect.bottom-20;
  const value=clamp01(1-(event.clientY-top)/Math.max(1,bottom-top));faderTouch.control.value=value;faderTouch.input.value=value;faderTouch.element.style.setProperty("--value",value);faderTouch.output.textContent=`${Math.round(value*100)}%`;send({type:"control.value",id:faderTouch.control.id,value});
}
$("control-board").addEventListener("pointermove", (event) => {
  if(faderTouch){updateFaderTouch(event);return;}
  if(controlResize?.pointer===event.pointerId){const state=controlResize,minW=state.control.type==="fader"?.065:.08,maxW=state.control.type==="fader"?.3:.45,minH=state.control.type==="fader"?.28:.16;state.control.w=Math.max(minW,Math.min(maxW,1-state.control.x,state.startW+(event.clientX-state.startX)/state.boardRect.width));state.control.h=Math.max(minH,Math.min(.9,1-state.control.y,state.startH+(event.clientY-state.startY)/state.boardRect.height));state.element.style.width=`${state.control.w*100}%`;state.element.style.height=`${state.control.h*100}%`;return;}
  if (!controlDrag || event.pointerId !== controlDrag.pointer) return;
  const control = project.controls.find((item) => item.id === controlDrag.id); if (!control) return;
  control.x = clamp01((event.clientX-controlDrag.rect.left-controlDrag.dx)/controlDrag.rect.width);
  control.y = clamp01((event.clientY-controlDrag.rect.top-controlDrag.dy)/controlDrag.rect.height);
  control.x = Math.min(control.x, 1-control.w); control.y = Math.min(control.y, 1-control.h);
  controlDrag.element.style.left = `${control.x*100}%`; controlDrag.element.style.top = `${control.y*100}%`;
});
$("control-board").addEventListener("pointerup", (event) => {
  if(faderTouch?.pointer===event.pointerId){updateFaderTouch(event);faderTouch=null;return;}
  if(controlResize?.pointer===event.pointerId){send({type:"control.update",id:controlResize.control.id,patch:{w:controlResize.control.w,h:controlResize.control.h}});controlResize=null;return;}
  if (!controlDrag || event.pointerId !== controlDrag.pointer) return;
  const control = project.controls.find((item) => item.id === controlDrag.id);
  if (control) send({ type:"control.update", id:control.id, patch:{ x:control.x, y:control.y } }); controlDrag = null;
});
$("control-board").addEventListener("pointercancel", () => { controlDrag = null; controlResize = null; faderTouch = null; });

const HEIGHT_VIS = 0.7;
function projection(canvas) {
  const rect = canvas.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width*dpr) || canvas.height !== Math.round(rect.height*dpr)) { canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr); }
  const width = rect.width*dpr, height = rect.height*dpr, pad = Math.min(width,height)*0.1;
  if (camera.mode === "2d") return { mode:"2d",dpr,width,height,x0:pad,y0:pad,rw:width-pad*2,rh:height-pad*2 };
  const radius=Math.hypot(0.5,0.5,HEIGHT_VIS/2),scale=(Math.min(width,height)-pad*2)/(radius*2)*camera.zoom;
  const centerY=-(HEIGHT_VIS/2)*Math.cos(camera.el);
  return { mode:"3d",dpr,width,height,scale,ox:width/2,oy:height/2-centerY*scale };
}
function raw3d(p) {
  const x=p[0]-0.5,y=p[1]-0.5,z=(p[2]||0)*HEIGHT_VIS;
  const rx=x*Math.cos(camera.az)+y*Math.sin(camera.az),depth=x*Math.sin(camera.az)-y*Math.cos(camera.az);
  return [rx,-depth*Math.sin(camera.el)-z*Math.cos(camera.el)];
}
function projectPoint(p, view) {
  if(view.mode==="2d") return [view.x0+p[0]*view.rw,view.y0+p[1]*view.rh];
  const [x,y]=raw3d(p);return [view.ox+x*view.scale,view.oy+y*view.scale];
}
function unprojectPoint(x, y, z, view) {
  if(view.mode==="2d") return [clamp01((x-view.x0)/view.rw),clamp01((y-view.y0)/view.rh),z];
  const rx=(x-view.ox)/view.scale,ry=(y-view.oy)/view.scale;
  const depth=-(ry+z*HEIGHT_VIS*Math.cos(camera.el))/Math.sin(camera.el);
  const px=rx*Math.cos(camera.az)+depth*Math.sin(camera.az),py=rx*Math.sin(camera.az)-depth*Math.cos(camera.az);
  return [clamp01(px+0.5),clamp01(py+0.5),z];
}
function line(ctx,a,b,color,width=1) { ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(); }
function drawRoom(ctx, view) {
  const floor=[[0,0,0],[1,0,0],[1,1,0],[0,1,0]], roof=floor.map(([x,y])=>[x,y,1]);
  const grid=cssColor("--grid"),soft=cssColor("--grid-soft");
  for(let i=0;i<4;i++) line(ctx,projectPoint(floor[i],view),projectPoint(floor[(i+1)%4],view),grid,1.2*view.dpr);
  for(let i=1;i<4;i++){const t=i/4;line(ctx,projectPoint([t,0,0],view),projectPoint([t,1,0],view),soft);line(ctx,projectPoint([0,t,0],view),projectPoint([1,t,0],view),soft);}
  if(view.mode==="3d") for(let i=0;i<4;i++){line(ctx,projectPoint(roof[i],view),projectPoint(roof[(i+1)%4],view),soft);line(ctx,projectPoint(floor[i],view),projectPoint(roof[i],view),soft);}
}
function drawStage() {
  if (!project) return; const canvas=$("stage"), view=projection(canvas), ctx=canvas.getContext("2d"),spatial=cssColor("--spatial"),spatialDim=cssColor("--spatial-dim"),speakerColor=cssColor("--speaker"); ctx.clearRect(0,0,view.width,view.height); drawRoom(ctx,view);
  project.speakers.forEach((speaker) => { const p=projectPoint([speaker.x_m/project.room.width_m,speaker.y_m/project.room.depth_m,speaker.z_m/project.room.height_m],view); ctx.beginPath();ctx.arc(...p,5*view.dpr,0,Math.PI*2);ctx.fillStyle=speakerColor;ctx.fill();ctx.fillStyle=speakerColor;ctx.font=`${9*view.dpr}px system-ui`;ctx.fillText(speaker.id,p[0]+7*view.dpr,p[1]); });
  project.spatialSources.forEach((source) => {
    const p=projectPoint(source.position,view),floor=projectPoint([source.position[0],source.position[1],0],view),active=source.id===selectedSource;
    if(view.mode==="3d")line(ctx,floor,p,active?spatial:spatialDim,1.5*view.dpr);
    ctx.beginPath();ctx.arc(...p,(active?8:5)*view.dpr,0,Math.PI*2);ctx.fillStyle=active?spatial:spatialDim;ctx.fill();
    if(view.mode==="2d"){ctx.fillStyle=active?spatial:spatialDim;ctx.font=`${9*view.dpr}px system-ui`;ctx.fillText(`${source.id} · Z ${(source.position[2]*project.room.height_m).toFixed(1)}m`,p[0]+9*view.dpr,p[1]-7*view.dpr);}
  });
  if (fired && performance.now()-fired.at<550) { const p=projectPoint(fired.position,view),r=(performance.now()-fired.at)/550*45*view.dpr;ctx.save();ctx.globalAlpha=1-r/(45*view.dpr);ctx.beginPath();ctx.arc(...p,r,0,Math.PI*2);ctx.strokeStyle=spatial;ctx.lineWidth=2*view.dpr;ctx.stroke();ctx.restore();requestAnimationFrame(drawStage); }
}
function pointerInCanvas(event,canvas){const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
function pointerDistance(points){const values=[...points.values()];return values.length<2?1:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);}
function redrawViews(){drawStage();drawLayout();syncViewControls();}
function setZoom(value){camera.zoom=Math.max(0.5,Math.min(3,Number(value)||1));redrawViews();}
function resetCamera(){camera.az=0;camera.el=0.95;camera.zoom=1;camera.preset="iso";redrawViews();}
function queueSpatialMove(id,position){
  pendingSpatialMove={id,position:[...position]};
  if(!spatialMoveFrame)spatialMoveFrame=requestAnimationFrame(()=>{spatialMoveFrame=0;if(pendingSpatialMove){send({type:"spatial.move",...pendingSpatialMove});pendingSpatialMove=null;}});
}
function flushSpatialMove(){
  if(spatialMoveFrame){cancelAnimationFrame(spatialMoveFrame);spatialMoveFrame=0;}
  if(pendingSpatialMove){send({type:"spatial.move",...pendingSpatialMove});pendingSpatialMove=null;}
}
function pointInPolygon(point,polygon){
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;
}
function isInsideRoom(point,z,view){
  const polygon=[[0,0,z],[1,0,z],[1,1,z],[0,1,z]].map((position)=>projectPoint(position,view));
  return pointInPolygon([point.x*view.dpr,point.y*view.dpr],polygon);
}
const stageCanvas=$("stage");
stageCanvas.addEventListener("pointerdown",(event)=>{
  const point=pointerInCanvas(event,stageCanvas);stagePointers.set(event.pointerId,point);stageCanvas.setPointerCapture(event.pointerId);
  if(sourceDrag){stagePointers.delete(event.pointerId);return;}
  if(stagePointers.size===2&&camera.mode==="3d"){stagePinch={distance:pointerDistance(stagePointers),zoom:camera.zoom};stageGesture=null;return;}
  const source=selected(),view=projection(stageCanvas),inside=source&&isInsideRoom(point,source.position[2],view);
  if(!editMode&&source&&inside){const position=unprojectPoint(point.x*view.dpr,point.y*view.dpr,source.position[2],view);source.position=position;sourceDrag={pointer:event.pointerId,id:source.id,z:position[2]};stageGesture=null;send({type:"spatial.trigger",id:source.id,position});drawStage();return;}
  if(camera.mode==="3d")stageGesture={pointer:event.pointerId,...point,az:camera.az,el:camera.el,moved:false};
});
stageCanvas.addEventListener("pointermove",(event)=>{
  if(!stagePointers.has(event.pointerId))return;const point=pointerInCanvas(event,stageCanvas);stagePointers.set(event.pointerId,point);
  if(stagePinch&&stagePointers.size>=2){setZoom(stagePinch.zoom*pointerDistance(stagePointers)/stagePinch.distance);return;}
  if(sourceDrag?.pointer===event.pointerId){const source=project.spatialSources.find((item)=>item.id===sourceDrag.id),view=projection(stageCanvas);if(!source)return;source.position=unprojectPoint(point.x*view.dpr,point.y*view.dpr,sourceDrag.z,view);queueSpatialMove(source.id,source.position);drawStage();return;}
  if(!stageGesture||stageGesture.pointer!==event.pointerId||camera.mode!=="3d")return;
  const dx=point.x-stageGesture.x,dy=point.y-stageGesture.y;if(Math.hypot(dx,dy)>6)stageGesture.moved=true;
  if(stageGesture.moved){camera.az=stageGesture.az+dx*0.008;camera.el=Math.max(0.15,Math.min(1.48,stageGesture.el-dy*0.006));camera.preset="custom";redrawViews();}
});
function endStagePointer(event){
  stagePointers.delete(event.pointerId);if(stagePointers.size<2)stagePinch=null;
  if(sourceDrag?.pointer===event.pointerId){flushSpatialMove();send({type:"spatial.release",id:sourceDrag.id});sourceDrag=null;}
  if(stageGesture?.pointer===event.pointerId)stageGesture=null;
}
stageCanvas.addEventListener("pointerup",endStagePointer);
stageCanvas.addEventListener("pointercancel",(event)=>{stagePointers.delete(event.pointerId);stageGesture=null;stagePinch=null;if(sourceDrag?.pointer===event.pointerId){flushSpatialMove();send({type:"spatial.release",id:sourceDrag.id});sourceDrag=null;}pendingSpatialMove=null;});
stageCanvas.addEventListener("wheel",(event)=>{if(camera.mode!=="3d")return;event.preventDefault();setZoom(camera.zoom*Math.exp(-event.deltaY*0.0015));},{passive:false});
$("height").addEventListener("input", () => { const source=selected(); if (!source)return; source.position[2]=Number($("height").value); queueSpatialMove(source.id,source.position); updateHeight(); drawStage(); });
$("height").addEventListener("change",flushSpatialMove);
function updateHeight() { const source=selected(); const value=source?.position[2] ?? 0; $("height-value").textContent=project?`${(value*project.room.height_m).toFixed(1)}m`:"0m"; }

function renderSettings() {
  if (!project) return;
  const values={"set-name":project.name,"set-host":project.osc.host,"set-port":project.osc.port,"set-namespace":project.osc.namespace,"room-width":project.room.width_m,"room-depth":project.room.depth_m,"room-height":project.room.height_m,"dbap-rolloff":project.dbap.rolloff_db,"dbap-blur":project.dbap.blur_m};
  Object.entries(values).forEach(([id,value])=>{ if(document.activeElement!==$(id)) $(id).value=value; });
  $("speakers").replaceChildren(...project.speakers.map((speaker)=>{
    const row=document.createElement("div");row.className="speaker-row";const name=document.createElement("b");name.textContent=speaker.id;row.append(name);
    [["X", "x_m"],["Y","y_m"],["Z","z_m"],["CH","out_ch"]].forEach(([label,key])=>{const wrap=document.createElement("label");wrap.textContent=label;const input=document.createElement("input");input.type="number";input.step=key==="out_ch"?"1":"0.1";input.value=speaker[key];input.addEventListener("change",()=>send({type:"speaker.update",id:speaker.id,patch:{[key]:Number(input.value)}}));wrap.append(input);row.append(wrap);});
    const remove=document.createElement("button");remove.textContent="×";remove.addEventListener("click",()=>send({type:"speaker.remove",id:speaker.id}));row.append(remove);return row;
  }));
}
function drawLayout() {
  if (!project || $("settings").hidden) return; const canvas=$("layout-stage"),view=projection(canvas),ctx=canvas.getContext("2d"),spatial=cssColor("--spatial"),text=cssColor("--text");ctx.clearRect(0,0,view.width,view.height);drawRoom(ctx,view);
  project.speakers.forEach((speaker)=>{const p=projectPoint([speaker.x_m/project.room.width_m,speaker.y_m/project.room.depth_m,speaker.z_m/project.room.height_m],view);ctx.beginPath();ctx.arc(...p,9*view.dpr,0,Math.PI*2);ctx.fillStyle=speakerDrag?.id===speaker.id?text:spatial;ctx.fill();ctx.fillStyle=text;ctx.font=`${10*view.dpr}px system-ui`;ctx.fillText(`${speaker.id} · ${speaker.z_m.toFixed(1)}m`,p[0]+12*view.dpr,p[1]);});
}
const layoutCanvas=$("layout-stage");
layoutCanvas.addEventListener("pointerdown",(event)=>{
  if(!project)return;const point=pointerInCanvas(event,layoutCanvas);layoutPointers.set(event.pointerId,point);layoutCanvas.setPointerCapture(event.pointerId);
  if(layoutPointers.size===2&&camera.mode==="3d"){layoutPinch={distance:pointerDistance(layoutPointers),zoom:camera.zoom};speakerDrag=null;layoutOrbit=null;return;}
  const view=projection(layoutCanvas),px=point.x*view.dpr,py=point.y*view.dpr;let best=null,dist=Infinity;
  project.speakers.forEach((speaker)=>{const p=projectPoint([speaker.x_m/project.room.width_m,speaker.y_m/project.room.depth_m,speaker.z_m/project.room.height_m],view),d=Math.hypot(px-p[0],py-p[1]);if(d<dist){dist=d;best=speaker;}});
  if(best&&dist<28*view.dpr)speakerDrag={id:best.id,pointer:event.pointerId};
  else if(camera.mode==="3d")layoutOrbit={pointer:event.pointerId,...point,az:camera.az,el:camera.el};
});
layoutCanvas.addEventListener("pointermove",(event)=>{
  if(!layoutPointers.has(event.pointerId))return;const point=pointerInCanvas(event,layoutCanvas);layoutPointers.set(event.pointerId,point);
  if(layoutPinch&&layoutPointers.size>=2){setZoom(layoutPinch.zoom*pointerDistance(layoutPointers)/layoutPinch.distance);return;}
  if(speakerDrag&&event.pointerId===speakerDrag.pointer){const speaker=project.speakers.find((item)=>item.id===speakerDrag.id),view=projection(layoutCanvas);if(!speaker)return;const position=unprojectPoint(point.x*view.dpr,point.y*view.dpr,speaker.z_m/project.room.height_m,view);speaker.x_m=position[0]*project.room.width_m;speaker.y_m=position[1]*project.room.depth_m;drawLayout();return;}
  if(layoutOrbit&&event.pointerId===layoutOrbit.pointer){camera.az=layoutOrbit.az+(point.x-layoutOrbit.x)*0.008;camera.el=Math.max(0.15,Math.min(1.48,layoutOrbit.el-(point.y-layoutOrbit.y)*0.006));camera.preset="custom";redrawViews();}
});
function endLayoutPointer(event){
  layoutPointers.delete(event.pointerId);if(layoutPointers.size<2)layoutPinch=null;
  if(speakerDrag?.pointer===event.pointerId){const speaker=project.speakers.find((item)=>item.id===speakerDrag.id);if(speaker)send({type:"speaker.update",id:speaker.id,patch:{x_m:speaker.x_m,y_m:speaker.y_m}});speakerDrag=null;}
  if(layoutOrbit?.pointer===event.pointerId)layoutOrbit=null;
}
layoutCanvas.addEventListener("pointerup",endLayoutPointer);
layoutCanvas.addEventListener("pointercancel",(event)=>{layoutPointers.delete(event.pointerId);speakerDrag=null;layoutOrbit=null;layoutPinch=null;});
layoutCanvas.addEventListener("wheel",(event)=>{if(camera.mode!=="3d")return;event.preventDefault();setZoom(camera.zoom*Math.exp(-event.deltaY*0.0015));},{passive:false});

function syncViewControls(){
  document.querySelectorAll("[data-view-toolbar]").forEach((toolbar)=>{toolbar.dataset.mode=camera.mode;toolbar.querySelectorAll("[data-view]").forEach((button)=>button.classList.toggle("on",button.dataset.view===camera.mode));});
  document.querySelectorAll("[data-angle]").forEach((button)=>button.classList.toggle("on",button.dataset.angle===camera.preset));
  document.querySelector(".axis-hint").textContent=camera.mode==="3d"?"inside touch — gate & move · outside drag — orbit":"inside touch — gate & move · outside — ignored";
}
function setViewMode(mode){camera.mode=mode==="2d"?"2d":"3d";localStorage.setItem("pps-view",camera.mode);stageGesture=null;stagePinch=null;layoutOrbit=null;layoutPinch=null;redrawViews();}
function applyAngle(name){
  camera.mode="3d";
  camera.preset=name;
  if(name==="front"){camera.az=0;camera.el=0.28;camera.zoom=1;}
  else if(name==="side"){camera.az=Math.PI/2;camera.el=0.42;camera.zoom=1;}
  else if(name==="top"){camera.az=0;camera.el=1.45;camera.zoom=1;}
  else if(name==="reset"||name==="iso"){resetCamera();return;}
  redrawViews();
}
document.querySelectorAll("[data-view]").forEach((button)=>button.addEventListener("click",()=>setViewMode(button.dataset.view)));
document.querySelectorAll("[data-angle]").forEach((button)=>button.addEventListener("click",()=>applyAngle(button.dataset.angle)));
const savedView=localStorage.getItem("pps-view");if(savedView==="2d"||savedView==="3d")camera.mode=savedView;

function patchProject() { send({type:"project.patch",patch:{name:$("set-name").value,osc:{host:$("set-host").value,port:Number($("set-port").value),namespace:$("set-namespace").value},room:{width_m:Number($("room-width").value),depth_m:Number($("room-depth").value),height_m:Number($("room-height").value)},dbap:{rolloff_db:Number($("dbap-rolloff").value),blur_m:Number($("dbap-blur").value)}}}); }
["set-name","set-host","set-port","set-namespace","room-width","room-depth","room-height","dbap-rolloff","dbap-blur"].forEach((id)=>$(id).addEventListener("change",patchProject));
function applyTheme(next){theme=next==="hype"?"hype":"studio";document.documentElement.dataset.theme=theme;localStorage.setItem("pps-theme",theme);$("theme").textContent=`THEME · ${theme.toUpperCase()}`;requestAnimationFrame(redrawViews);}
$("theme").addEventListener("click",()=>applyTheme(theme==="studio"?"hype":"studio"));
applyTheme(theme);
$("mode").addEventListener("click",()=>{editMode=!editMode;render();});
$("settings-open").addEventListener("click",()=>{if(!editMode){toast("Switch to EDIT to change setup");return;}$("settings").hidden=false;renderSettings();requestAnimationFrame(drawLayout);});
$("settings-close").addEventListener("click",()=>{$("settings").hidden=true;});
$("spatial-add").addEventListener("click",()=>send({type:"spatial.add"}));
$("pad-add").addEventListener("click",()=>send({type:"control.add",controlType:"pad"}));
$("fader-add").addEventListener("click",()=>send({type:"control.add",controlType:"fader"}));
$("speaker-add").addEventListener("click",()=>send({type:"speaker.add"}));
$("project-export").addEventListener("click",()=>send({type:"project.export"}));
$("project-import").addEventListener("click",()=>$("project-file").click());
$("project-file").addEventListener("change",async()=>{try{const data=JSON.parse(await $("project-file").files[0].text());send({type:"project.import",project:data});toast("Project imported");}catch{toast("Invalid project file");}$("project-file").value="";});
function downloadProject(data){const blob=new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${data.name.replace(/[^A-Za-z0-9_-]+/g,"-")||"project"}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
addEventListener("resize",()=>{drawStage();drawLayout();});
connect();
