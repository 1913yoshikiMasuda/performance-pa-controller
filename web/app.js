const $ = (id) => document.getElementById(id);
const performanceSurface=document.querySelector("main");
for(const eventName of ["contextmenu","selectstart","dragstart"])performanceSurface.addEventListener(eventName,(event)=>event.preventDefault());
const themeNames=["studio","hype","light","ocean","power","liminal","gorgeous","neon","amber","sakura","mono"];
const storedTheme=localStorage.getItem("pps-theme");
let theme=themeNames.includes(storedTheme)?storedTheme:"studio";
let project = null;
let gainsBySource = {};
let toggleStates = {};
let socket = null;
let healthSeq=0,lastHealthPong=0,connectionStartedAt=0,webRttMs=null,oscHealth={ready:false,confirmed:false};
const pendingHealthPings=new Map();
let selectedSource = null;
let inspectedControl = null;
let activeGeneralPage = null;
let mobileGeneralSubpage = 0;
let metadataControlId = null;
let pendingLabelUpdate = null;
const linkedSourceIds = new Set();
let linkSelecting = false;
let morphValue = 0;
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
let retriggerHold = null;
const pendingSpatialMoves = new Map();
let spatialMoveFrame = 0;
let layoutOrbit = null;
let layoutPinch = null;
let mobilePanel=localStorage.getItem("pps-mobile-panel")==="general"?"general":"spatial";
let workspaceView=localStorage.getItem("pps-workspace-view")==="general"?"general":"spatial";

function applyWorkspaceView(redraw=true){
  const overview=workspaceView==="general"&&!usesMobileAutoLayout();performanceSurface.dataset.workspace=overview?"general":"spatial";
  $("workspace-view").textContent=overview?"SPATIAL VIEW":"GENERAL VIEW";$("workspace-view").classList.toggle("on",overview);$("workspace-view").title=overview?"Return to Spatial":"Show all General Control pages";
  if(redraw&&project){renderGeneralOverview();requestAnimationFrame(drawStage);}
}

function setMobilePanel(panel,redraw=true){
  mobilePanel=panel==="general"?"general":"spatial";document.querySelector("main").dataset.mobilePanel=mobilePanel;localStorage.setItem("pps-mobile-panel",mobilePanel);
  document.querySelectorAll("#mobile-tabs [data-mobile-panel]").forEach((button)=>button.setAttribute("aria-selected",String(button.dataset.mobilePanel===mobilePanel)));
  if(redraw)requestAnimationFrame(()=>mobilePanel==="spatial"?drawStage():renderControls());
}
document.querySelectorAll("#mobile-tabs [data-mobile-panel]").forEach((button)=>button.addEventListener("click",()=>setMobilePanel(button.dataset.mobilePanel)));
setMobilePanel(mobilePanel,false);

function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function toast(message) { $("toast").textContent = message; $("toast").classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("on"), 1800); }
function renderHealth(){
  const webOk=socket?.readyState===WebSocket.OPEN&&performance.now()-lastHealthPong<7_000,oscOk=webOk&&oscHealth.confirmed,status=$("status");status.classList.toggle("ok",oscOk);status.classList.toggle("warn",webOk&&!oscOk);
  $("health-label").textContent=!webOk?"WEB RECONNECTING":oscOk?"CONNECTION OK":oscHealth.ready?"OSC NO REPLY":"OSC SOCKET DOWN";
  $("health-latency").textContent=`WEB ${webRttMs==null?"—":`${Math.round(webRttMs)}ms`} · OSC ${!oscOk||oscHealth.rttMs==null?"—":`${Math.round(oscHealth.rttMs)}ms`}`;
  status.title=`WebSocket: ${webOk?"connected":"reconnecting"}${webRttMs==null?"":` (${Math.round(webRttMs)} ms)`}\nOSC round trip: ${oscOk?`${Math.round(oscHealth.rttMs)} ms`:oscHealth.ready?"no pong received":"socket unavailable"}`;
}
function sendHealthPing(){if(socket?.readyState!==WebSocket.OPEN)return;const seq=++healthSeq;pendingHealthPings.clear();pendingHealthPings.set(seq,performance.now());send({type:"health.ping",seq});}
function restartConnection(){const stale=socket;socket=null;try{stale?.close();}catch{}pendingHealthPings.clear();webRttMs=null;oscHealth={ready:false,confirmed:false};setStatus(false);connect();}
function healthTick(){
  if(socket?.readyState===WebSocket.OPEN&&performance.now()-lastHealthPong>=7_000){restartConnection();return;}
  if(socket?.readyState===WebSocket.CONNECTING&&performance.now()-connectionStartedAt>=7_000){restartConnection();return;}
  sendHealthPing();renderHealth();
}

function connect() {
  const connection=new WebSocket(`ws://${location.host}`);socket=connection;connectionStartedAt=performance.now();
  connection.addEventListener("open", () => { if(socket!==connection)return;lastHealthPong=performance.now();sendHealthPing();send({ type:"state.request" });renderHealth(); });
  connection.addEventListener("close", () => { if(socket!==connection)return;socket=null;retriggerHold=null;$("spatial-retrigger").classList.remove("held");pendingHealthPings.clear();webRttMs=null;oscHealth={ready:false,confirmed:false};setStatus(false);setTimeout(connect, 1000); });
  connection.addEventListener("message", (event) => {
    if(socket!==connection)return;
    const message = JSON.parse(event.data);
    if (message.type === "state.full" || message.type === "state.project") {
      project = message.project;
      gainsBySource = message.gainsBySource || {};
      toggleStates=message.toggleStates||{};
      if (message.type === "state.full") {oscHealth.ready=Boolean(message.oscReady);setStatus(message.oscReady);}
      if (!project.spatialSources.some((source) => source.id === selectedSource)) selectedSource = project.spatialSources[0]?.id ?? null;
      if (!project.generalPages.some((page) => page.id === activeGeneralPage)) activeGeneralPage = project.generalPages[0]?.id ?? null;
      for(const id of linkedSourceIds)if(!project.spatialSources.some((source)=>source.id===id))linkedSourceIds.delete(id);
      render();
    } else if (message.type === "spatial.moved") {
      const source = project.spatialSources.find((item) => item.id === message.id);
      if (source) source.position = message.position;
      gainsBySource[message.id] = message.gains || [];
      if(message.id===selectedSource)showSpatialOsc(message.id);drawStage();
    } else if (message.type === "spatial.fired") {
      const source = project.spatialSources.find((item) => item.id === message.id);
      if (source) source.position = message.position;
      gainsBySource[message.id] = message.gains || [];
      fired = { ...message, at:performance.now() };if(message.id===selectedSource)showSpatialOsc(message.id);drawStage();
    } else if(message.type==="control.toggled"){
      if(message.gate)toggleStates[message.id]=1;else delete toggleStates[message.id];updateToggleControl(message.id,message.gate);
    } else if(message.type==="control.updated"){
      if(pendingLabelUpdate?.requestId===message.requestId){const notice=pendingLabelUpdate.notice,moved=pendingLabelUpdate.pageId!==pendingLabelUpdate.previousPageId;clearTimeout(pendingLabelUpdate.timer);pendingLabelUpdate=null;if(moved){activeGeneralPage=message.pageId;mobileGeneralSubpage=0;inspectedControl=message.id;}render();toast(notice);}
    } else if(message.type==="generalPage.added"){
      activeGeneralPage=message.page.id;inspectedControl=null;render();
    } else if(message.type==="health.pong"){
      const started=pendingHealthPings.get(message.seq);if(started!==undefined){webRttMs=performance.now()-started;pendingHealthPings.delete(message.seq);}lastHealthPong=performance.now();oscHealth=message.osc||{ready:false,confirmed:false};renderHealth();
    } else if (message.type === "project.data") downloadProject(message.project);
    else if (message.type === "error") toast(message.message);
  });
}

function setStatus(ok) { if(!ok)lastHealthPong=0;renderHealth(); }
function selected() { return project?.spatialSources.find((source) => source.id === selectedSource); }
function oscPath(path){const namespace=project?.osc.namespace?.replace(/\/$/,"")||"/pps";return `${namespace}/${path}`;}
function formatOscNumber(value){const rounded=Number(value).toFixed(3).replace(/\.?(?:0+)$/,"");return rounded==="-0"?"0":rounded;}
function formatOscList(values,limit=8){const visible=values.slice(0,limit).map(formatOscNumber).join(" "),remaining=values.length-limit;return `${visible}${remaining>0?` … +${remaining}ch`:""}`;}
function showSpatialOsc(id=selectedSource){
  const source=project?.spatialSources.find((item)=>item.id===id);if(!source){$("spatial-osc-hint").textContent="—";return;}
  const gate=sourceDrag?.ids?.includes(id)||retriggerHold?.ids?.includes(id)?1:0,gains=gainsBySource[id]||[];
  $("spatial-osc-hint").textContent=`${oscPath(`spatial/${id}/trigger`)}  ${gate}\n${oscPath(`spatial/${id}/position`)}  ${formatOscList(source.position,3)}\n${oscPath(`spatial/${id}/gains`)}  ${formatOscList(gains)}`;
}
function showControlOsc(control){
  if(!control)return;inspectedControl=control.id;
  const value=control.type==="pad"?(control.mode==="toggle"?(toggleStates[control.id]||0):0):control.value;
  $("general-osc-hint").textContent=`${oscPath(`${control.type}/${control.id}/${control.type==="pad"?"trigger":"value"}`)}  ${formatOscNumber(value)}`;
}
function updateOscReadouts(){if(!project)return;$("osc-target").textContent=`${project.osc.host}${project.osc.namespace}`;$("osc-port").textContent=`UDP ${project.osc.port}`;$("osc-destination").title=`OSC ${project.osc.host}:${project.osc.port}${project.osc.namespace}`;showSpatialOsc();const control=project.controls.find((item)=>item.id===inspectedControl);if(control)showControlOsc(control);else{$("general-osc-hint").textContent="Tap a control to inspect OSC";inspectedControl=null;}}
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function powerPercentages(gains) {
  const powers=gains.map((gain)=>Math.max(0,gain*gain)),total=powers.reduce((sum,power)=>sum+power,0);
  if(total===0)return powers.map(()=>0);
  const raw=powers.map((power)=>power/total*100),percentages=raw.map(Math.floor);
  let remaining=100-percentages.reduce((sum,value)=>sum+value,0);
  const order=raw.map((value,index)=>({index,fraction:value-percentages[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
  for(let i=0;i<remaining;i++)percentages[order[i].index]++;
  return percentages;
}
function cssColor(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}
function sourceColor(id){
  const palettes={
    studio:["#65b7df","#9a8fd5","#58ae91","#d09262","#c87d98","#788fcf"],
    hype:["#62ff7a","#c8ff54","#4df5c1","#f1ff72","#56d96f","#a1ffb0"],
    light:["#087f9c","#b34e32","#4779b8","#8b6b2d","#637b43","#9b5580"],
    ocean:["#38d9ff","#5af2c7","#4c91ff","#77f0ff","#5dcda8","#8ba8ff"],
    power:["#ff542e","#ffd23f","#ff8b2d","#ef365d","#ffb13b","#e94d1d"],
    liminal:["#a8e0d0","#e5d7a5","#9ebbc0","#b8c99d","#d1b6aa","#8cb4aa"],
    gorgeous:["#f4c86b","#e968a8","#bb79e6","#ff9c78","#d9a8ff","#f0d28a"],
    neon:["#2de2e6","#ff4fd8","#7a5cff","#4dffb8","#ff6b9d","#62b8ff"],
    amber:["#ffb347","#ffd166","#e88d2a","#ffe29a","#d9791f","#ffc96b"],
    sakura:["#c65b86","#277d83","#9b6ab3","#d77991","#438b72","#b86b58"],
    mono:["#f5f5f5","#c9c9c9","#999999","#e1e1e1","#777777","#b4b4b4"]
  }[theme];
  let hash=0;for(const char of id)hash=(hash*31+char.charCodeAt(0))>>>0;return palettes[hash%palettes.length];
}

function render() {
  if (!project) return;
  if(metadataControlId&&!project.controls.some((control)=>control.id===metadataControlId))closeControlMetadata();
  document.body.classList.toggle("editing", editMode);
  $("mode").textContent = editMode ? "EDIT" : "LIVE"; $("mode").classList.toggle("edit", editMode);
  $("project-name").textContent = project.name;
  updateOscReadouts();renderSources();renderSceneControls();renderGeneralPages();renderControls();renderSettings();applyWorkspaceView(false);requestAnimationFrame(() => { drawStage();drawLayout();syncViewControls(); });
}

function renderSources() {
  $("sources").replaceChildren(...project.spatialSources.map((source) => {
    const wrap = document.createElement("div"); wrap.className = "source-wrap";
    const button = document.createElement("button"); button.className = `source${source.id === selectedSource ? " selected" : ""}${linkedSourceIds.has(source.id)?" linked":""}`;button.style.setProperty("--source-color",sourceColor(source.id));
    const dot=document.createElement("i");dot.className="source-dot";const meta=document.createElement("span");meta.innerHTML=`<small>SOURCE</small><b>${source.id}</b>`;button.append(dot,meta);
    button.addEventListener("click", () => {
      if(linkSelecting){if(linkedSourceIds.has(source.id))linkedSourceIds.delete(source.id);else linkedSourceIds.add(source.id);renderSources();renderLinkControl();return;}
      selectedSource=source.id;$("height").value=source.position[2];updateHeight();showSpatialOsc(source.id);renderSources();drawStage();
    });
    const remove = document.createElement("button"); remove.className = "remove"; remove.textContent = "×"; remove.addEventListener("click", (event) => { event.stopPropagation(); send({ type:"spatial.remove", id:source.id }); });
    wrap.append(button, remove); return wrap;
  }));
  const source = selected();if(source)$("height").value=source.position[2];$("spatial-retrigger").disabled=editMode||!source;updateHeight();renderLinkControl();
}

function renderLinkControl(){
  const button=$("link-mode"),count=linkedSourceIds.size;button.classList.toggle("on",linkSelecting||count>1);
  button.textContent=linkSelecting?"DONE":count>1?`LINK ${count}`:"LINK";
  button.title=linkSelecting?"Finish link selection":count>1?`${count} sources move together`:"Select sources to move together";
}

function renderSceneControls(){
  const sceneA=project?.scenes?.A,sceneB=project?.scenes?.B,ready=Boolean(sceneA&&sceneB);
  $("scene-a").classList.toggle("stored",Boolean(sceneA));$("scene-b").classList.toggle("stored",Boolean(sceneB));
  $("scene-a").textContent=sceneA?"SET A ✓":"SET A";$("scene-b").textContent=sceneB?"SET B ✓":"SET B";
  $("scene-a").title=sceneA?"Tap to overwrite · hold to clear Scene A":"Store current source positions in Scene A";
  $("scene-b").title=sceneB?"Tap to overwrite · hold to clear Scene B":"Store current source positions in Scene B";
  $("scene-morph").disabled=!ready;$("scene-morph").value=morphValue;$("scene-morph-value").textContent=`${Math.round(morphValue*100)}%`;
}

function bindSceneButton(slot){
  const button=$("scene-"+slot.toLowerCase());let timer=0,longPress=false;
  const cancel=()=>{if(timer){clearTimeout(timer);timer=0;}};
  button.addEventListener("pointerdown",()=>{longPress=false;if(!project?.scenes?.[slot])return;timer=setTimeout(()=>{timer=0;longPress=true;if(confirm(`Clear Scene ${slot}?`)){send({type:"scene.clear",slot});toast(`Scene ${slot} cleared`);}},650);});
  button.addEventListener("pointerup",cancel);button.addEventListener("pointercancel",cancel);button.addEventListener("pointerleave",cancel);
  button.addEventListener("click",(event)=>{if(longPress){longPress=false;event.preventDefault();return;}morphValue=slot==="A"?0:1;renderSceneControls();send({type:"scene.store",slot});toast(`Scene ${slot} stored · hold to clear`);});
}

function renderGeneralPages(){
  const tabs=project.generalPages.map((page)=>{
    const button=document.createElement("button");button.className="general-tab";button.type="button";button.role="tab";button.textContent=page.name;button.title=`${page.name} · ${page.id}`;button.dataset.pageId=page.id;button.setAttribute("aria-selected",String(page.id===activeGeneralPage));
    button.addEventListener("click",()=>{if(activeGeneralPage===page.id)return;activeGeneralPage=page.id;mobileGeneralSubpage=0;inspectedControl=null;$("general-osc-hint").textContent="Tap a control to inspect OSC";renderGeneralPages();renderControls();});
    return button;
  });
  $("general-tabs").replaceChildren(...tabs);
  const active=project.generalPages.find((page)=>page.id===activeGeneralPage);
  $("general-page-rename").disabled=!active;
  $("general-page-remove").disabled=!active||project.generalPages.length<=1;
}

function createControlElement(control,overview=false){
  const isSwitch=control.type==="pad"&&control.mode==="toggle",switchOn=isSwitch&&Boolean(toggleStates[control.id]);
  const element = document.createElement("div"); element.className = `control ${control.type}${isSwitch?" switch":""}${switchOn?" on":""}`; element.dataset.id = control.id;
  Object.assign(element.style, { left:`${control.x*100}%`, top:`${control.y*100}%`, width:`${control.w*100}%`, height:`${control.h*100}%` });
  const title=document.createElement("span");title.className="control-title";const titleText=document.createElement("b");titleText.textContent=control.label||control.id;title.append(titleText);if(control.label){const id=document.createElement("small");id.textContent=control.id;title.append(id);}
  if (control.type === "pad") {
    element.append(title);if(isSwitch){const state=document.createElement("i");state.className="switch-state";state.textContent=switchOn?"ON":"OFF";element.append(state);}
    element.addEventListener("pointerdown", (event) => {
      if(editMode){showControlOsc(control);if(!overview&&!usesMobileAutoLayout())beginControlDrag(event,control,element);return;}
      padTouches.set(event.pointerId,{id:control.id,element,inside:true,isSwitch});showControlOsc(control);element.classList.add("held");element.setPointerCapture(event.pointerId);event.preventDefault();
    });
    element.addEventListener("pointermove",updatePadTouch);element.addEventListener("pointerup",endPadTouch);element.addEventListener("pointercancel",endPadTouch);
  } else {
    const input = document.createElement("input"); input.type = "range"; input.min = "0"; input.max = "1"; input.step = "0.001"; input.value = control.value;
    const output = document.createElement("output"); output.textContent = `${Math.round(control.value*100)}%`;
    const rail=document.createElement("div");rail.className="fader-rail";rail.innerHTML='<i class="fader-fill"></i><i class="fader-thumb"></i>';
    element.style.setProperty("--value",control.value);
    input.addEventListener("input", () => { control.value=Number(input.value);syncFaderControls(control.id,control.value,element);showControlOsc(control);send({ type:"control.value", id:control.id, value:control.value }); });
    element.append(title,rail,output,input); element.addEventListener("pointerdown", (event) => { showControlOsc(control);if (editMode){if(!overview&&!usesMobileAutoLayout())beginControlDrag(event,control,element);}else beginFaderTouch(event,control,element,input,output); });
    if(overview){element.addEventListener("pointermove",updateFaderTouch);element.addEventListener("pointerup",endFaderTouch);element.addEventListener("pointercancel",(event)=>endFaderTouch(event,false));}
  }
  const metadata=document.createElement("button");metadata.className="metadata-handle";metadata.textContent="✎";metadata.setAttribute("aria-label",`Edit ${control.id}`);metadata.addEventListener("pointerdown",(event)=>{event.stopPropagation();event.preventDefault();openControlMetadata(control);});element.append(metadata);
  const remove = document.createElement("button"); remove.className = "remove"; remove.textContent = "×"; remove.addEventListener("click", (event) => { event.stopPropagation(); send({ type:"control.remove", id:control.id }); }); element.append(remove);
  const resize=document.createElement("button");resize.className="resize-handle";resize.setAttribute("aria-label",`Resize ${control.id}`);resize.addEventListener("pointerdown",(event)=>beginControlResize(event,control,element));element.append(resize);
  return element;
}

function renderGeneralOverview(){
  if(!project)return;
  $("general-overview").replaceChildren(...project.generalPages.map((page)=>{
    const section=document.createElement("section");section.className="overview-page";section.dataset.pageId=page.id;
    const tab=document.createElement("button");tab.type="button";tab.className="overview-tab";tab.innerHTML=`<b></b><small></small>`;tab.querySelector("b").textContent=page.name;tab.querySelector("small").textContent=page.id;tab.addEventListener("click",()=>{activeGeneralPage=page.id;mobileGeneralSubpage=0;renderGeneralPages();renderControls();});
    const board=document.createElement("div");board.className="overview-board";board.replaceChildren(...project.controls.filter((control)=>control.pageId===page.id).map((control)=>createControlElement(control,true)));
    section.append(tab,board);return section;
  }));
}

function renderControls() {
  const allControls=project.controls.filter((control)=>control.pageId===activeGeneralPage),board=$("control-board"),mobilePages=paginateMobileGeneralControls(allControls,board),pageCount=mobilePages.length;
  mobileGeneralSubpage=Math.max(0,Math.min(pageCount-1,mobileGeneralSubpage));
  const controls=mobilePages[mobileGeneralSubpage];
  updateMobileGeneralPager(pageCount);
  board.replaceChildren(...controls.map((control)=>createControlElement(control)));renderGeneralOverview();
}

function mobileGeneralRows(board){
  const available=board.clientHeight||Math.max(124,innerHeight-260),rowHeight=124,gap=8,padding=16;
  return Math.max(2,Math.floor((available-padding+gap)/(rowHeight+gap)));
}
function paginateMobileGeneralControls(controls,board){
  if(!usesMobileAutoLayout())return[controls];
  const rows=mobileGeneralRows(board),pages=[];let page=[],occupied=Array.from({length:rows},()=>[false,false]);
  const place=(height)=>{for(let row=0;row<=rows-height;row++)for(let column=0;column<2;column++){let free=true;for(let offset=0;offset<height;offset++)if(occupied[row+offset][column])free=false;if(free){for(let offset=0;offset<height;offset++)occupied[row+offset][column]=true;return true;}}return false;};
  for(const control of controls){const height=control.type==="fader"?2:1;if(!place(height)&&page.length){pages.push(page);page=[];occupied=Array.from({length:rows},()=>[false,false]);place(height);}page.push(control);}
  if(page.length||!pages.length)pages.push(page);return pages;
}
function updateMobileGeneralPager(pageCount){
  const pager=$("mobile-general-pager"),multiple=pageCount>1;pager.setAttribute("aria-hidden",String(!multiple));pager.classList.toggle("inactive",!multiple);
  $("mobile-general-page").textContent=`${mobileGeneralSubpage+1} / ${pageCount}`;$("mobile-general-prev").disabled=mobileGeneralSubpage===0;$("mobile-general-next").disabled=mobileGeneralSubpage>=pageCount-1;
}
function changeMobileGeneralSubpage(delta){mobileGeneralSubpage+=delta;renderControls();}

function updateToggleControl(id,gate){
  const control=project?.controls.find((item)=>item.id===id);if(!control)return;document.querySelectorAll(".control").forEach((element)=>{if(element.dataset.id!==id)return;element.classList.toggle("on",Boolean(gate));const state=element.querySelector(".switch-state");if(state)state.textContent=gate?"ON":"OFF";});if(inspectedControl===id)showControlOsc(control);
}

function syncFaderControls(id,value,sourceElement){
  document.querySelectorAll(".control.fader").forEach((element)=>{if(element.dataset.id!==id||element===sourceElement)return;element.style.setProperty("--value",value);const input=element.querySelector("input"),output=element.querySelector("output");if(input)input.value=value;if(output)output.textContent=`${Math.round(value*100)}%`;});
}

function openControlMetadata(control){
  metadataControlId=control.id;$("control-metadata-id").textContent=`${control.type==="pad"&&control.mode==="toggle"?"SWITCH":control.type.toUpperCase()} · ${control.id}`;$("control-label").value=control.label||"";
  $("control-behavior-label").hidden=control.type!=="pad";$("control-behavior").value=control.type==="pad"&&control.mode==="toggle"?"toggle":"momentary";
  $("control-page").replaceChildren(...project.generalPages.map((page)=>{const option=document.createElement("option");option.value=page.id;option.textContent=page.name;option.selected=page.id===control.pageId;return option;}));
  $("control-metadata-osc").textContent=oscPath(`${control.type}/${control.id}/${control.type==="pad"?"trigger":"value"}`);$("control-metadata").hidden=false;
  requestAnimationFrame(()=>{$("control-label").focus();$("control-label").select();});
}
function closeControlMetadata(){$("control-metadata").hidden=true;metadataControlId=null;}
function updateControlLabel(value){
  if(!metadataControlId)return;const id=metadataControlId,label=[...String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").trim()].slice(0,40).join(""),control=project.controls.find((item)=>item.id===id),pageId=$("control-page").value;if(!control||!project.generalPages.some((page)=>page.id===pageId))return;
  const previousPageId=control.pageId,labelChanged=label!==(control.label||""),moved=pageId!==previousPageId,behavior=control.type==="pad"?$("control-behavior").value:undefined,behaviorChanged=control.type==="pad"&&behavior!==(control.mode==="toggle"?"toggle":"momentary");
  if(pendingLabelUpdate)clearTimeout(pendingLabelUpdate.timer);const requestId=`label-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const notice=behaviorChanged?(behavior==="toggle"?"Pad changed to Switch":"Switch changed to Pad"):moved?(labelChanged?"Control updated and moved":"Control moved to another tab"):(label?"Display name updated":"Display name cleared");
  const timer=setTimeout(()=>{if(pendingLabelUpdate?.requestId===requestId){pendingLabelUpdate=null;toast("Control not saved · restart Node");}},1800);pendingLabelUpdate={id,requestId,timer,notice,pageId,previousPageId};
  send({type:"control.update",id,patch:{label,pageId,...(behavior?{behavior}:{})},requestId});closeControlMetadata();
}

function pointerInsideElement(event,element){const rect=element.getBoundingClientRect();return event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;}
function updatePadHeld(id,element){element.classList.toggle("held",[...padTouches.values()].some((touch)=>touch.id===id&&touch.inside));}
function updatePadTouch(event){
  const touch=padTouches.get(event.pointerId);if(!touch)return;touch.inside=pointerInsideElement(event,touch.element);updatePadHeld(touch.id,touch.element);event.preventDefault();
}
function endPadTouch(event){
  const touch=padTouches.get(event.pointerId);if(!touch)return;const fire=event.type!=="pointercancel"&&pointerInsideElement(event,touch.element);padTouches.delete(event.pointerId);updatePadHeld(touch.id,touch.element);
  if(fire){touch.element.classList.add("fired");setTimeout(()=>touch.element.classList.remove("fired"),100);if(touch.isSwitch)send({type:"control.toggle",id:touch.id});else{send({type:"control.trigger",id:touch.id,gate:1});send({type:"control.trigger",id:touch.id,gate:0});}}
  const control=project.controls.find((item)=>item.id===touch.id);if(control&&inspectedControl===touch.id)showControlOsc(control);
}

function beginControlDrag(event, control, element) {
  if (event.target.classList.contains("remove")||event.target.classList.contains("resize-handle")) return;
  const rect = $("control-board").getBoundingClientRect(); controlDrag = { id:control.id, pointer:event.pointerId, element, rect, dx:event.clientX-element.getBoundingClientRect().left, dy:event.clientY-element.getBoundingClientRect().top };
  element.setPointerCapture(event.pointerId); event.preventDefault();
}
function beginControlResize(event,control,element){
  if(!editMode||usesMobileAutoLayout())return;event.stopPropagation();event.preventDefault();const boardRect=$("control-board").getBoundingClientRect();
  controlResize={pointer:event.pointerId,control,element,boardRect,startX:event.clientX,startY:event.clientY,startW:control.w,startH:control.h};event.currentTarget.setPointerCapture(event.pointerId);
}
function usesMobileAutoLayout(){return matchMedia("(max-width:600px) and (orientation:portrait)").matches;}
function beginFaderTouch(event,control,element,input,output){
  const rect=element.getBoundingClientRect();
  faderTouch={pointer:event.pointerId,control,element,input,output,startY:event.clientY,startValue:control.value,travel:Math.max(60,rect.height-42),active:false,lastSent:control.value,pending:null,frame:0};
  element.classList.add("touching");element.setPointerCapture(event.pointerId);event.preventDefault();
}
function updateFaderTouch(event){
  if(!faderTouch||event.pointerId!==faderTouch.pointer)return;const state=faderTouch,delta=state.startY-event.clientY,slop=6;
  if(!state.active&&Math.abs(delta)<=slop)return;state.active=true;state.element.classList.add("adjusting");
  const effective=Math.sign(delta)*Math.max(0,Math.abs(delta)-slop),value=clamp01(state.startValue+effective/state.travel);
  state.control.value=value;state.input.value=value;state.element.style.setProperty("--value",value);state.output.textContent=`${Math.round(value*100)}%`;syncFaderControls(state.control.id,value,state.element);
  showControlOsc(state.control);
  if(Math.abs(value-state.lastSent)<.002)return;state.pending=value;
  if(!state.frame)state.frame=requestAnimationFrame(()=>flushFaderValue(state,false));
}
function flushFaderValue(state,force){
  if(state.frame){cancelAnimationFrame(state.frame);state.frame=0;}const value=state.pending;state.pending=null;
  if(value==null||(!force&&Math.abs(value-state.lastSent)<.002))return;send({type:"control.value",id:state.control.id,value});state.lastSent=value;
}
function endFaderTouch(event,update=true){
  if(!faderTouch||event.pointerId!==faderTouch.pointer)return;const state=faderTouch;if(update)updateFaderTouch(event);flushFaderValue(state,true);state.element.classList.remove("touching","adjusting");faderTouch=null;
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
  if(faderTouch?.pointer===event.pointerId){endFaderTouch(event);return;}
  if(controlResize?.pointer===event.pointerId){send({type:"control.update",id:controlResize.control.id,patch:{w:controlResize.control.w,h:controlResize.control.h}});controlResize=null;return;}
  if (!controlDrag || event.pointerId !== controlDrag.pointer) return;
  const control = project.controls.find((item) => item.id === controlDrag.id);
  if (control) send({ type:"control.update", id:control.id, patch:{ x:control.x, y:control.y } }); controlDrag = null;
});
$("control-board").addEventListener("pointercancel", (event) => { controlDrag = null; controlResize = null; if(faderTouch?.pointer===event.pointerId)endFaderTouch(event,false); });

function projection(canvas) {
  const rect=canvas.getBoundingClientRect(),dpr=Math.max(1,Math.min(3,Number(devicePixelRatio)||1));
  const pixelWidth=Math.max(1,Math.round(Math.max(1,rect.width)*dpr)),pixelHeight=Math.max(1,Math.round(Math.max(1,rect.height)*dpr));
  if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}
  const width=pixelWidth,height=pixelHeight,pad=Math.min(width,height)*0.1,compact=performanceSurface.dataset.workspace==="general";
  if (camera.mode === "2d") {
    const roomAspect=project.room.width_m/project.room.depth_m,availableWidth=width-pad*2,availableHeight=height-pad*2;
    if(compact)return {mode:"2d",dpr,width,height,x0:pad,y0:pad,rw:availableWidth,rh:availableHeight};
    let rw=availableWidth,rh=rw/roomAspect;if(rh>availableHeight){rh=availableHeight;rw=rh*roomAspect;}
    return { mode:"2d",dpr,width,height,x0:(width-rw)/2,y0:(height-rh)/2,rw,rh };
  }
  const corners=[];for(const x of [0,1])for(const y of [0,1])for(const z of [0,1])corners.push(raw3d([x,y,z]));
  const xs=corners.map((point)=>point[0]),ys=corners.map((point)=>point[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const fitX=(width-pad*2)/Math.max(.001,maxX-minX),fitY=(height-pad*2)/Math.max(.001,maxY-minY),scaleX=(compact?fitX:Math.min(fitX,fitY))*camera.zoom,scaleY=(compact?fitY:Math.min(fitX,fitY))*camera.zoom;
  return { mode:"3d",dpr,width,height,scaleX,scaleY,ox:width/2-(minX+maxX)/2*scaleX,oy:height/2-(minY+maxY)/2*scaleY };
}
function raw3d(p) {
  const x=(p[0]-0.5)*project.room.width_m,y=(p[1]-0.5)*project.room.depth_m,z=(p[2]||0)*project.room.height_m;
  const rx=x*Math.cos(camera.az)+y*Math.sin(camera.az),depth=x*Math.sin(camera.az)-y*Math.cos(camera.az);
  return [rx,-depth*Math.sin(camera.el)-z*Math.cos(camera.el)];
}
function projectPoint(p, view) {
  if(view.mode==="2d") return [view.x0+p[0]*view.rw,view.y0+p[1]*view.rh];
  const [x,y]=raw3d(p);return [view.ox+x*view.scaleX,view.oy+y*view.scaleY];
}
function unprojectPoint(x, y, z, view) {
  if(view.mode==="2d") return [clamp01((x-view.x0)/Math.max(.001,view.rw)),clamp01((y-view.y0)/Math.max(.001,view.rh)),z];
  const scaleX=Math.max(.001,view.scaleX),scaleY=Math.max(.001,view.scaleY),sinEl=Math.max(.001,Math.sin(camera.el)),rx=(x-view.ox)/scaleX,ry=(y-view.oy)/scaleY;
  const depth=-(ry+z*project.room.height_m*Math.cos(camera.el))/sinEl;
  const px=rx*Math.cos(camera.az)+depth*Math.sin(camera.az),py=rx*Math.sin(camera.az)-depth*Math.cos(camera.az);
  return [clamp01(px/project.room.width_m+0.5),clamp01(py/project.room.depth_m+0.5),z];
}
function line(ctx,a,b,color,width=1) { ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(); }
function drawRoom(ctx, view) {
  const floor=[[0,0,0],[1,0,0],[1,1,0],[0,1,0]], roof=floor.map(([x,y])=>[x,y,1]);
  const grid=cssColor("--grid"),soft=cssColor("--grid-soft"),edgeWidth=(view.mode==="3d"?1.75:1.2)*view.dpr;
  for(let i=0;i<4;i++) line(ctx,projectPoint(floor[i],view),projectPoint(floor[(i+1)%4],view),grid,edgeWidth);
  for(let i=1;i<4;i++){const t=i/4;line(ctx,projectPoint([t,0,0],view),projectPoint([t,1,0],view),soft);line(ctx,projectPoint([0,t,0],view),projectPoint([1,t,0],view),soft);}
  if(view.mode==="3d") for(let i=0;i<4;i++){line(ctx,projectPoint(roof[i],view),projectPoint(roof[(i+1)%4],view),grid,edgeWidth);line(ctx,projectPoint(floor[i],view),projectPoint(roof[i],view),grid,edgeWidth);}
}
function drawStage() {
  if (!project) return; const canvas=$("stage"),view=projection(canvas),ctx=canvas.getContext("2d"),speakerColor=cssColor("--speaker"),selectedSourceState=selected(),selectedColor=selectedSourceState?sourceColor(selectedSourceState.id):cssColor("--spatial"),selectedGains=gainsBySource[selectedSource]||[],selectedPercentages=powerPercentages(selectedGains);ctx.clearRect(0,0,view.width,view.height);drawRoom(ctx,view);
  const speakerPoints=project.speakers.map((speaker)=>projectPoint([speaker.x_m/project.room.width_m,speaker.y_m/project.room.depth_m,speaker.z_m/project.room.height_m],view));
  if(selectedSourceState){const sourcePoint=projectPoint(selectedSourceState.position,view);speakerPoints.forEach((speakerPoint,index)=>{const gain=selectedGains[index]||0;if(gain<=.001)return;ctx.save();ctx.globalAlpha=.1+gain*.55;line(ctx,sourcePoint,speakerPoint,selectedColor,(.5+gain*4.5)*view.dpr);ctx.restore();});}
  project.speakers.forEach((speaker,index)=>{
    const p=speakerPoints[index],size=6*view.dpr,gain=selectedGains[index]||0,power=gain*gain;ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(Math.PI/4);ctx.strokeStyle=speakerColor;ctx.lineWidth=1.5*view.dpr;ctx.strokeRect(-size/2,-size/2,size,size);ctx.restore();
    if(selectedSourceState){ctx.beginPath();ctx.arc(p[0],p[1],11*view.dpr,-Math.PI/2,-Math.PI/2+Math.PI*2*power);ctx.strokeStyle=selectedColor;ctx.lineWidth=2.5*view.dpr;ctx.stroke();}
    ctx.fillStyle=speakerColor;ctx.font=`600 ${8.5*view.dpr}px system-ui`;ctx.fillText(`SP · ${speaker.id}${selectedSourceState?`  ${selectedPercentages[index]||0}%`:""}`,p[0]+9*view.dpr,p[1]+3*view.dpr);
  });
  project.spatialSources.forEach((source) => {
    const p=projectPoint(source.position,view),floor=projectPoint([source.position[0],source.position[1],0],view),active=source.id===selectedSource,color=sourceColor(source.id);
    ctx.save();ctx.globalAlpha=active?1:.52;if(view.mode==="3d")line(ctx,floor,p,color,1.3*view.dpr);ctx.beginPath();ctx.arc(...p,(active?7:5)*view.dpr,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();if(active){ctx.beginPath();ctx.arc(...p,11*view.dpr,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=1.2*view.dpr;ctx.stroke();}ctx.fillStyle=color;ctx.font=`650 ${9*view.dpr}px system-ui`;ctx.fillText(`SRC · ${source.id}${view.mode==="2d"?`  Z ${(source.position[2]*project.room.height_m).toFixed(1)}m`:""}`,p[0]+10*view.dpr,p[1]-8*view.dpr);ctx.restore();
  });
  if (fired && performance.now()-fired.at<550) { const p=projectPoint(fired.position,view),r=(performance.now()-fired.at)/550*45*view.dpr;ctx.save();ctx.globalAlpha=1-r/(45*view.dpr);ctx.beginPath();ctx.arc(...p,r,0,Math.PI*2);ctx.strokeStyle=sourceColor(fired.id);ctx.lineWidth=2*view.dpr;ctx.stroke();ctx.restore();requestAnimationFrame(drawStage); }
}
function pointerInCanvas(event,canvas){const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
function pointerDistance(points){const values=[...points.values()];return values.length<2?1:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);}
function redrawViews(){drawStage();drawLayout();syncViewControls();}
function setZoom(value){camera.zoom=Math.max(0.5,Math.min(3,Number(value)||1));redrawViews();}
function resetCamera(){camera.az=0;camera.el=0.95;camera.zoom=1;camera.preset="iso";redrawViews();}
function linkedSourcesFor(id){
  const anchor=project.spatialSources.find((source)=>source.id===id);if(!anchor)return[];
  if(linkedSourceIds.size<2||!linkedSourceIds.has(id))return[anchor];
  return project.spatialSources.filter((source)=>linkedSourceIds.has(source.id));
}
function moveSourceGroup(id,target,axes=[0,1]){
  const members=linkedSourcesFor(id),anchor=members.find((source)=>source.id===id);if(!anchor)return[];
  const deltas=[0,0,0];
  for(const axis of axes){const desired=target[axis]-anchor.position[axis],minimum=Math.max(...members.map((source)=>-source.position[axis])),maximum=Math.min(...members.map((source)=>1-source.position[axis]));deltas[axis]=Math.max(minimum,Math.min(maximum,desired));}
  return members.map((source)=>{for(const axis of axes)source.position[axis]=clamp01(source.position[axis]+deltas[axis]);return{id:source.id,position:[...source.position]};});
}
function queueSpatialMoves(updates){
  for(const update of updates)pendingSpatialMoves.set(update.id,{id:update.id,position:[...update.position]});
  if(!spatialMoveFrame)spatialMoveFrame=requestAnimationFrame(()=>{spatialMoveFrame=0;flushSpatialMoves();});
}
function flushSpatialMoves(){
  if(spatialMoveFrame){cancelAnimationFrame(spatialMoveFrame);spatialMoveFrame=0;}
  if(pendingSpatialMoves.size){send({type:"spatial.batchMove",updates:[...pendingSpatialMoves.values()]});pendingSpatialMoves.clear();}
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
  if(sourceDrag||retriggerHold){stagePointers.delete(event.pointerId);return;}
  if(stagePointers.size===2&&camera.mode==="3d"){stagePinch={distance:pointerDistance(stagePointers),zoom:camera.zoom};stageGesture=null;return;}
  const source=selected(),view=projection(stageCanvas),inside=source&&isInsideRoom(point,source.position[2],view);
  if(!editMode&&source&&inside){const target=unprojectPoint(point.x*view.dpr,point.y*view.dpr,source.position[2],view),updates=moveSourceGroup(source.id,target),ids=updates.map(({id})=>id);sourceDrag={pointer:event.pointerId,id:source.id,ids,z:source.position[2]};stageGesture=null;showSpatialOsc(source.id);send({type:"spatial.batchTrigger",updates});drawStage();return;}
  showSpatialOsc();
  if(camera.mode==="3d")stageGesture={pointer:event.pointerId,...point,az:camera.az,el:camera.el,moved:false};
});
stageCanvas.addEventListener("pointermove",(event)=>{
  if(!stagePointers.has(event.pointerId))return;const point=pointerInCanvas(event,stageCanvas);stagePointers.set(event.pointerId,point);
  if(stagePinch&&stagePointers.size>=2){setZoom(stagePinch.zoom*pointerDistance(stagePointers)/stagePinch.distance);return;}
  if(sourceDrag?.pointer===event.pointerId){const source=project.spatialSources.find((item)=>item.id===sourceDrag.id),view=projection(stageCanvas);if(!source)return;const target=unprojectPoint(point.x*view.dpr,point.y*view.dpr,sourceDrag.z,view),updates=moveSourceGroup(source.id,target);showSpatialOsc(source.id);queueSpatialMoves(updates);drawStage();return;}
  if(!stageGesture||stageGesture.pointer!==event.pointerId||camera.mode!=="3d")return;
  const dx=point.x-stageGesture.x,dy=point.y-stageGesture.y;if(Math.hypot(dx,dy)>6)stageGesture.moved=true;
  if(stageGesture.moved){camera.az=stageGesture.az+dx*0.008;camera.el=Math.max(0.15,Math.min(1.48,stageGesture.el-dy*0.006));camera.preset="custom";redrawViews();}
});
function endStagePointer(event){
  stagePointers.delete(event.pointerId);if(stagePointers.size<2)stagePinch=null;
  if(sourceDrag?.pointer===event.pointerId){const {id,ids}=sourceDrag;flushSpatialMoves();send({type:"spatial.batchRelease",ids});sourceDrag=null;showSpatialOsc(id);}
  if(stageGesture?.pointer===event.pointerId)stageGesture=null;
}
stageCanvas.addEventListener("pointerup",endStagePointer);
stageCanvas.addEventListener("pointercancel",(event)=>{stagePointers.delete(event.pointerId);stageGesture=null;stagePinch=null;if(sourceDrag?.pointer===event.pointerId){const {id,ids}=sourceDrag;flushSpatialMoves();send({type:"spatial.batchRelease",ids});sourceDrag=null;showSpatialOsc(id);}pendingSpatialMoves.clear();});
stageCanvas.addEventListener("wheel",(event)=>{if(camera.mode!=="3d")return;event.preventDefault();setZoom(camera.zoom*Math.exp(-event.deltaY*0.0015));},{passive:false});
$("height").addEventListener("input", () => { const source=selected();if(!source)return;const target=[...source.position];target[2]=Number($("height").value);const updates=moveSourceGroup(source.id,target,[2]);showSpatialOsc(source.id);queueSpatialMoves(updates);updateHeight();drawStage(); });
$("height").addEventListener("change",flushSpatialMoves);
function updateHeight() { const source=selected(); const value=source?.position[2] ?? 0; $("height-value").textContent=project?`${(value*project.room.height_m).toFixed(1)}m`:"0m"; }

const spatialRetrigger=$("spatial-retrigger");
spatialRetrigger.addEventListener("pointerdown",(event)=>{
  const source=selected();if(editMode||!source||sourceDrag||retriggerHold)return;
  event.preventDefault();spatialRetrigger.setPointerCapture(event.pointerId);flushSpatialMoves();
  const updates=linkedSourcesFor(source.id).map((member)=>({id:member.id,position:[...member.position]}));
  retriggerHold={pointer:event.pointerId,id:source.id,ids:updates.map(({id})=>id)};spatialRetrigger.classList.add("held");showSpatialOsc(source.id);
  send({type:"spatial.batchTrigger",updates});
});
function endSpatialRetrigger(event){
  if(retriggerHold?.pointer!==event.pointerId)return;
  const {id,ids}=retriggerHold;retriggerHold=null;spatialRetrigger.classList.remove("held");send({type:"spatial.batchRelease",ids});showSpatialOsc(id);
}
spatialRetrigger.addEventListener("pointerup",endSpatialRetrigger);
spatialRetrigger.addEventListener("pointercancel",endSpatialRetrigger);
spatialRetrigger.addEventListener("lostpointercapture",endSpatialRetrigger);

function applySceneMorph(value){
  const sceneA=project.scenes?.A,sceneB=project.scenes?.B;if(!sceneA||!sceneB)return;
  morphValue=clamp01(value);const updates=[];
  for(const source of project.spatialSources){const from=sceneA.positions[source.id],to=sceneB.positions[source.id];if(!from||!to)continue;source.position=from.map((start,index)=>start+(to[index]-start)*morphValue);updates.push({id:source.id,position:[...source.position]});}
  $("scene-morph-value").textContent=`${Math.round(morphValue*100)}%`;if(updates.length)queueSpatialMoves(updates);updateHeight();showSpatialOsc();drawStage();
}

function renderSettings() {
  if (!project) return;
  $("speaker-count").textContent=`${project.speakers.length} / 64`;$("speaker-add").disabled=project.speakers.length>=64;
  const values={"set-name":project.name,"set-host":project.osc.host,"set-port":project.osc.port,"set-namespace":project.osc.namespace,"room-width":project.room.width_m,"room-depth":project.room.depth_m,"room-height":project.room.height_m,"dbap-rolloff":project.dbap.rolloff_db,"dbap-blur":project.dbap.blur_m,"dbap-hard-center":project.dbap.hardCenter_m,"dbap-range":project.dbap.maxDist_m||0};
  Object.entries(values).forEach(([id,value])=>{ if(document.activeElement!==$(id)) $(id).value=value; });
  $("speakers").replaceChildren(...project.speakers.map((speaker)=>{
    const row=document.createElement("div");row.className="speaker-row";const name=document.createElement("b");name.textContent=`◇ ${speaker.id}`;row.append(name);
    [["X", "x_m"],["Y","y_m"],["Z","z_m"],["CH","out_ch"]].forEach(([label,key])=>{const wrap=document.createElement("label");wrap.textContent=label;const input=document.createElement("input");input.type="number";input.step=key==="out_ch"?"1":"0.1";if(key==="out_ch"){input.min="1";input.max="1024";}input.value=speaker[key];input.addEventListener("change",()=>send({type:"speaker.update",id:speaker.id,patch:{[key]:Number(input.value)}}));wrap.append(input);row.append(wrap);});
    const remove=document.createElement("button");remove.textContent="×";remove.addEventListener("click",()=>send({type:"speaker.remove",id:speaker.id}));row.append(remove);return row;
  }));
}
function drawLayout() {
  if (!project || $("settings").hidden) return; const canvas=$("layout-stage"),view=projection(canvas),ctx=canvas.getContext("2d"),spatial=cssColor("--spatial"),text=cssColor("--text");ctx.clearRect(0,0,view.width,view.height);drawRoom(ctx,view);
  project.speakers.forEach((speaker)=>{const p=projectPoint([speaker.x_m/project.room.width_m,speaker.y_m/project.room.depth_m,speaker.z_m/project.room.height_m],view),size=12*view.dpr;ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(Math.PI/4);ctx.fillStyle=speakerDrag?.id===speaker.id?text:spatial;ctx.fillRect(-size/2,-size/2,size,size);ctx.restore();ctx.fillStyle=text;ctx.font=`${10*view.dpr}px system-ui`;ctx.fillText(`SP · ${speaker.id} · ${speaker.z_m.toFixed(1)}m`,p[0]+12*view.dpr,p[1]);});
}
const layoutCanvas=$("layout-stage");
layoutCanvas.addEventListener("pointerdown",(event)=>{
  if(!project)return;event.preventDefault();const point=pointerInCanvas(event,layoutCanvas);layoutPointers.set(event.pointerId,point);layoutCanvas.setPointerCapture(event.pointerId);
  if(layoutPointers.size===2&&camera.mode==="3d"){layoutPinch={distance:pointerDistance(layoutPointers),zoom:camera.zoom};speakerDrag=null;layoutOrbit=null;return;}
  const view=projection(layoutCanvas),px=point.x*view.dpr,py=point.y*view.dpr;let best=null,dist=Infinity;
  project.speakers.forEach((speaker)=>{const p=projectPoint([speaker.x_m/project.room.width_m,speaker.y_m/project.room.depth_m,speaker.z_m/project.room.height_m],view),d=Math.hypot(px-p[0],py-p[1]);if(d<dist){dist=d;best=speaker;}});
  if(best&&dist<28*view.dpr)speakerDrag={id:best.id,pointer:event.pointerId};
  else if(camera.mode==="3d")layoutOrbit={pointer:event.pointerId,...point,az:camera.az,el:camera.el};
});
layoutCanvas.addEventListener("pointermove",(event)=>{
  if(!layoutPointers.has(event.pointerId))return;event.preventDefault();const point=pointerInCanvas(event,layoutCanvas);layoutPointers.set(event.pointerId,point);
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
function setViewMode(mode){camera.mode=mode==="2d"?"2d":"3d";localStorage.setItem("pps-view",camera.mode);stageGesture=null;stagePinch=null;layoutOrbit=null;layoutPinch=null;speakerDrag=null;layoutPointers.clear();redrawViews();}
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

function patchProject() { send({type:"project.patch",patch:{name:$("set-name").value,osc:{host:$("set-host").value,port:Number($("set-port").value),namespace:$("set-namespace").value},room:{width_m:Number($("room-width").value),depth_m:Number($("room-depth").value),height_m:Number($("room-height").value)},dbap:{rolloff_db:Number($("dbap-rolloff").value),blur_m:Number($("dbap-blur").value),hardCenter_m:Number($("dbap-hard-center").value),maxDist_m:Number($("dbap-range").value)}}}); }
["set-name","set-host","set-port","set-namespace","room-width","room-depth","room-height","dbap-rolloff","dbap-blur","dbap-hard-center","dbap-range"].forEach((id)=>$(id).addEventListener("change",patchProject));
function applyTheme(next){theme=themeNames.includes(next)?next:"studio";document.documentElement.dataset.theme=theme;localStorage.setItem("pps-theme",theme);$("theme").value=theme;document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();renderMobileThemeOptions();if(project)renderSources();requestAnimationFrame(redrawViews);}
function renderMobileThemeOptions(){
  $("mobile-theme-current").textContent=theme.toUpperCase();$("mobile-theme-options").replaceChildren(...themeNames.map((name)=>{const button=document.createElement("button");button.type="button";button.textContent=name.toUpperCase();button.classList.toggle("selected",name===theme);button.addEventListener("click",()=>{applyTheme(name);closeMobileThemeMenu();});return button;}));
}
function openMobileThemeMenu(){renderMobileThemeOptions();$("mobile-theme-menu").hidden=false;}
function closeMobileThemeMenu(){$("mobile-theme-menu").hidden=true;}
$("theme").addEventListener("change",()=>applyTheme($("theme").value));
$("mobile-theme-open").addEventListener("click",openMobileThemeMenu);
$("workspace-view").addEventListener("click",()=>{workspaceView=workspaceView==="general"?"spatial":"general";localStorage.setItem("pps-workspace-view",workspaceView);applyWorkspaceView();});
$("mobile-theme-close").addEventListener("click",closeMobileThemeMenu);
$("mobile-theme-menu").addEventListener("pointerdown",(event)=>{if(event.target===$("mobile-theme-menu"))closeMobileThemeMenu();});
applyTheme(theme);
$("mode").addEventListener("click",()=>{editMode=!editMode;if(editMode)linkSelecting=false;render();});
$("settings-open").addEventListener("click",()=>{if(!editMode){toast("Switch to EDIT to change setup");return;}$("settings").hidden=false;renderSettings();requestAnimationFrame(drawLayout);});
$("settings-close").addEventListener("click",()=>{$("settings").hidden=true;});
$("control-metadata-close").addEventListener("click",closeControlMetadata);
$("control-metadata").addEventListener("pointerdown",(event)=>{if(event.target===$("control-metadata"))closeControlMetadata();});
$("control-metadata-form").addEventListener("submit",(event)=>{event.preventDefault();updateControlLabel($("control-label").value);});
$("control-label-clear").addEventListener("click",()=>updateControlLabel(""));
$("link-mode").addEventListener("click",()=>{linkSelecting=!linkSelecting;if(linkSelecting&&selectedSource)linkedSourceIds.add(selectedSource);if(!linkSelecting&&linkedSourceIds.size<2)linkedSourceIds.clear();renderSources();});
bindSceneButton("A");bindSceneButton("B");
$("scene-morph").addEventListener("input",()=>applySceneMorph(Number($("scene-morph").value)));
$("scene-morph").addEventListener("change",flushSpatialMoves);
$("spatial-add").addEventListener("click",()=>send({type:"spatial.add"}));
$("pad-add").addEventListener("click",()=>send({type:"control.add",controlType:"pad",pageId:activeGeneralPage}));
$("switch-add").addEventListener("click",()=>send({type:"control.add",controlType:"switch",pageId:activeGeneralPage}));
$("fader-add").addEventListener("click",()=>send({type:"control.add",controlType:"fader",pageId:activeGeneralPage}));
$("general-page-add").addEventListener("click",()=>send({type:"generalPage.add"}));
$("general-page-rename").addEventListener("click",()=>{const page=project?.generalPages.find((item)=>item.id===activeGeneralPage);if(!page)return;const name=prompt("Page name",page.name);if(name===null)return;send({type:"generalPage.rename",id:page.id,name});});
$("general-page-remove").addEventListener("click",()=>{const page=project?.generalPages.find((item)=>item.id===activeGeneralPage);if(!page)return;if(project.generalPages.length<=1){toast("At least one page is required");return;}if(project.controls.some((control)=>control.pageId===page.id)){toast("Delete the controls on this page first");return;}if(confirm(`Delete empty page “${page.name}”?`))send({type:"generalPage.remove",id:page.id});});
$("mobile-general-prev").addEventListener("click",()=>changeMobileGeneralSubpage(-1));
$("mobile-general-next").addEventListener("click",()=>changeMobileGeneralSubpage(1));
$("speaker-add").addEventListener("click",()=>send({type:"speaker.add"}));
$("project-load").addEventListener("click",()=>$("project-file").click());
$("project-save").addEventListener("click",()=>send({type:"project.export"}));
$("project-export").addEventListener("click",()=>send({type:"project.export"}));
$("project-import").addEventListener("click",()=>$("project-file").click());
$("project-file").addEventListener("change",async()=>{try{const data=JSON.parse(await $("project-file").files[0].text());send({type:"project.import",project:data});toast("Project imported");}catch{toast("Invalid project file");}$("project-file").value="";});
function downloadProject(data){const blob=new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${data.name.replace(/[^A-Za-z0-9_-]+/g,"-")||"project"}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
addEventListener("resize",()=>{applyWorkspaceView(false);drawStage();drawLayout();if(project)renderControls();});
setInterval(healthTick,2_000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState!=="visible")return;if(socket?.readyState===WebSocket.OPEN&&performance.now()-lastHealthPong>=7_000)restartConnection();else sendHealthPing();});
connect();
