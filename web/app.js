const $ = (id) => document.getElementById(id);
let project = null;
let socket = null;
let selectedSource = null;
let editMode = false;
let fired = null;
let toastTimer = null;
let controlDrag = null;
let speakerDrag = null;

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

function render() {
  if (!project) return;
  document.body.classList.toggle("editing", editMode);
  $("mode").textContent = editMode ? "EDIT" : "LIVE"; $("mode").classList.toggle("edit", editMode);
  $("project-name").textContent = project.name;
  renderSources(); renderControls(); renderSettings(); requestAnimationFrame(() => { drawStage(); drawLayout(); });
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
      element.addEventListener("pointerdown", (event) => { if (editMode) beginControlDrag(event, control, element); else { element.setPointerCapture(event.pointerId); send({ type:"control.trigger", id:control.id }); } });
    } else {
      const label = document.createElement("b"); label.textContent = control.id;
      const input = document.createElement("input"); input.type = "range"; input.min = "0"; input.max = "1"; input.step = "0.001"; input.value = control.value;
      const output = document.createElement("output"); output.textContent = `${Math.round(control.value*100)}%`;
      input.addEventListener("input", () => { output.textContent = `${Math.round(input.value*100)}%`; send({ type:"control.value", id:control.id, value:Number(input.value) }); });
      element.append(label,input,output); element.addEventListener("pointerdown", (event) => { if (editMode) beginControlDrag(event, control, element); });
    }
    const remove = document.createElement("button"); remove.className = "remove"; remove.textContent = "×"; remove.addEventListener("click", (event) => { event.stopPropagation(); send({ type:"control.remove", id:control.id }); }); element.append(remove);
    return element;
  }));
}

function beginControlDrag(event, control, element) {
  if (event.target.classList.contains("remove")) return;
  const rect = $("control-board").getBoundingClientRect(); controlDrag = { id:control.id, pointer:event.pointerId, element, rect, dx:event.clientX-element.getBoundingClientRect().left, dy:event.clientY-element.getBoundingClientRect().top };
  element.setPointerCapture(event.pointerId); event.preventDefault();
}
$("control-board").addEventListener("pointermove", (event) => {
  if (!controlDrag || event.pointerId !== controlDrag.pointer) return;
  const control = project.controls.find((item) => item.id === controlDrag.id); if (!control) return;
  control.x = clamp01((event.clientX-controlDrag.rect.left-controlDrag.dx)/controlDrag.rect.width);
  control.y = clamp01((event.clientY-controlDrag.rect.top-controlDrag.dy)/controlDrag.rect.height);
  control.x = Math.min(control.x, 1-control.w); control.y = Math.min(control.y, 1-control.h);
  controlDrag.element.style.left = `${control.x*100}%`; controlDrag.element.style.top = `${control.y*100}%`;
});
$("control-board").addEventListener("pointerup", (event) => {
  if (!controlDrag || event.pointerId !== controlDrag.pointer) return;
  const control = project.controls.find((item) => item.id === controlDrag.id);
  if (control) send({ type:"control.update", id:control.id, patch:{ x:control.x, y:control.y } }); controlDrag = null;
});
$("control-board").addEventListener("pointercancel", () => { controlDrag = null; });

function projection(canvas) {
  const rect = canvas.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width*dpr) || canvas.height !== Math.round(rect.height*dpr)) { canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr); }
  const width = rect.width*dpr, height = rect.height*dpr;
  return { dpr,width,height,cx:width*.5,top:height*.18,a:Math.min(width*.38,height*.62),b:Math.min(width*.18,height*.29),c:Math.min(height*.43,width*.25) };
}
function projectPoint(p, view) { return [view.cx+(p[0]-p[1])*view.a, view.top+(p[0]+p[1])*view.b-p[2]*view.c]; }
function unprojectPoint(x, y, z, view) { const u=(x-view.cx)/view.a, v=(y-view.top+z*view.c)/view.b; return [clamp01((u+v)/2),clamp01((v-u)/2),z]; }
function line(ctx,a,b,color,width=1) { ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(); }
function drawRoom(ctx, view) {
  const floor=[[0,0,0],[1,0,0],[1,1,0],[0,1,0]], roof=floor.map(([x,y])=>[x,y,1]);
  for(let i=0;i<4;i++){ line(ctx,projectPoint(floor[i],view),projectPoint(floor[(i+1)%4],view),"#314353"); line(ctx,projectPoint(roof[i],view),projectPoint(roof[(i+1)%4],view),"#233140"); line(ctx,projectPoint(floor[i],view),projectPoint(roof[i],view),"#233140"); }
}
function drawStage() {
  if (!project) return; const canvas=$("stage"), view=projection(canvas), ctx=canvas.getContext("2d"); ctx.clearRect(0,0,view.width,view.height); drawRoom(ctx,view);
  project.speakers.forEach((speaker) => { const p=projectPoint([speaker.x_m/project.room.width_m,speaker.y_m/project.room.depth_m,speaker.z_m/project.room.height_m],view); ctx.beginPath();ctx.arc(...p,5*view.dpr,0,Math.PI*2);ctx.fillStyle="#778899";ctx.fill();ctx.fillStyle="#8393a5";ctx.font=`${9*view.dpr}px system-ui`;ctx.fillText(speaker.id,p[0]+7*view.dpr,p[1]); });
  project.spatialSources.forEach((source) => { const p=projectPoint(source.position,view), floor=projectPoint([source.position[0],source.position[1],0],view); line(ctx,floor,p,source.id===selectedSource?"#62b9ff":"#36546a",1.5*view.dpr);ctx.beginPath();ctx.arc(...p,(source.id===selectedSource?8:5)*view.dpr,0,Math.PI*2);ctx.fillStyle=source.id===selectedSource?"#62b9ff":"#3a607a";ctx.fill(); });
  if (fired && performance.now()-fired.at<550) { const p=projectPoint(fired.position,view),r=(performance.now()-fired.at)/550*45*view.dpr;ctx.beginPath();ctx.arc(...p,r,0,Math.PI*2);ctx.strokeStyle=`rgba(98,185,255,${1-r/(45*view.dpr)})`;ctx.lineWidth=2*view.dpr;ctx.stroke();requestAnimationFrame(drawStage); }
}
$("stage").addEventListener("pointerdown", (event) => {
  if (editMode || !selected()) return; const canvas=$("stage"),rect=canvas.getBoundingClientRect(),view=projection(canvas),dpr=view.dpr;
  const position=unprojectPoint((event.clientX-rect.left)*dpr,(event.clientY-rect.top)*dpr,selected().position[2],view);
  selected().position=position; send({ type:"spatial.trigger", id:selectedSource, position }); drawStage();
});
$("height").addEventListener("input", () => { const source=selected(); if (!source)return; source.position[2]=Number($("height").value); updateHeight(); drawStage(); });
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
  if (!project || $("settings").hidden) return; const canvas=$("layout-stage"),view=projection(canvas),ctx=canvas.getContext("2d");ctx.clearRect(0,0,view.width,view.height);drawRoom(ctx,view);
  project.speakers.forEach((speaker)=>{const p=projectPoint([speaker.x_m/project.room.width_m,speaker.y_m/project.room.depth_m,speaker.z_m/project.room.height_m],view);ctx.beginPath();ctx.arc(...p,9*view.dpr,0,Math.PI*2);ctx.fillStyle=speakerDrag?.id===speaker.id?"#fff":"#62b9ff";ctx.fill();ctx.fillStyle="#dbeeff";ctx.font=`${10*view.dpr}px system-ui`;ctx.fillText(`${speaker.id} · ${speaker.z_m.toFixed(1)}m`,p[0]+12*view.dpr,p[1]);});
}
$("layout-stage").addEventListener("pointerdown",(event)=>{if(!project)return;const canvas=$("layout-stage"),rect=canvas.getBoundingClientRect(),view=projection(canvas),px=(event.clientX-rect.left)*view.dpr,py=(event.clientY-rect.top)*view.dpr;let best=null,dist=Infinity;project.speakers.forEach((speaker)=>{const p=projectPoint([speaker.x_m/project.room.width_m,speaker.y_m/project.room.depth_m,speaker.z_m/project.room.height_m],view),d=Math.hypot(px-p[0],py-p[1]);if(d<dist){dist=d;best=speaker;}});if(best&&dist<28*view.dpr){speakerDrag={id:best.id,pointer:event.pointerId};canvas.setPointerCapture(event.pointerId);}});
$("layout-stage").addEventListener("pointermove",(event)=>{if(!speakerDrag||event.pointerId!==speakerDrag.pointer)return;const speaker=project.speakers.find((item)=>item.id===speakerDrag.id),canvas=$("layout-stage"),rect=canvas.getBoundingClientRect(),view=projection(canvas);if(!speaker)return;const position=unprojectPoint((event.clientX-rect.left)*view.dpr,(event.clientY-rect.top)*view.dpr,speaker.z_m/project.room.height_m,view);speaker.x_m=position[0]*project.room.width_m;speaker.y_m=position[1]*project.room.depth_m;drawLayout();});
$("layout-stage").addEventListener("pointerup",(event)=>{if(!speakerDrag||event.pointerId!==speakerDrag.pointer)return;const speaker=project.speakers.find((item)=>item.id===speakerDrag.id);if(speaker)send({type:"speaker.update",id:speaker.id,patch:{x_m:speaker.x_m,y_m:speaker.y_m}});speakerDrag=null;});

function patchProject() { send({type:"project.patch",patch:{name:$("set-name").value,osc:{host:$("set-host").value,port:Number($("set-port").value),namespace:$("set-namespace").value},room:{width_m:Number($("room-width").value),depth_m:Number($("room-depth").value),height_m:Number($("room-height").value)},dbap:{rolloff_db:Number($("dbap-rolloff").value),blur_m:Number($("dbap-blur").value)}}}); }
["set-name","set-host","set-port","set-namespace","room-width","room-depth","room-height","dbap-rolloff","dbap-blur"].forEach((id)=>$(id).addEventListener("change",patchProject));
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
