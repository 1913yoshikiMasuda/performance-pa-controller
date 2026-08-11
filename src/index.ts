import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { clamp01, dbapGains } from "./dbap.js";
import { findControlPlacement, isControlPlacementAvailable } from "./control-placement.js";
import { lowestAvailableId } from "./id.js";
import { OscOutput } from "./osc.js";
import { parseProject, ProjectStore } from "./project-store.js";
import { MAX_GENERAL_PAGES, MAX_OUTPUT_CHANNEL, MAX_SPEAKERS, type ClientMessage, type Project, type ServerMessage, type Speaker, type SpatialSource, type XYZ } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const webDir = join(root, "web");
const projectFile = process.env.PROJECT_FILE ? resolve(process.env.PROJECT_FILE) : join(root, "projects", "_active.json");
const port = Number(process.env.HTTP_PORT ?? 8080);
const store = new ProjectStore(projectFile);
let project = store.load();
const osc = new OscOutput(project.osc);
osc.open();
osc.speakerConfig(project.speakers);
let eventSeq = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const activeGates = new Map<string, Set<WebSocket>>();
const activePadGates = new Map<string, Set<WebSocket>>();
const toggleStates = new Map<string, 0 | 1>();
function releaseAllGates(): void {
  for (const id of activeGates.keys()) osc.spatialRelease(id);
  for (const id of activePadGates.keys()) osc.pad(id, 0);
  for (const [id, gate] of toggleStates) if(gate)osc.pad(id,0);
  activeGates.clear();
  activePadGates.clear();
  toggleStates.clear();
}

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".svg": "image/svg+xml"
};

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(webDir, relative));
  if (!file.startsWith(webDir + sep)) { response.writeHead(403).end("Forbidden"); return; }
  try {
    if (!statSync(file).isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(readFileSync(file));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

const wss = new WebSocketServer({ server, maxPayload: 1_000_000 });
const webSocketAlive=new WeakMap<WebSocket,boolean>();
const send = (socket: WebSocket, message: ServerMessage) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));
const broadcast = (message: ServerMessage) => wss.clients.forEach((socket) => send(socket, message));
const gainsBySource = (): Record<string, number[]> => Object.fromEntries(project.spatialSources.map((source) => [source.id, dbapGains(source.position, project)]));
const currentToggleStates = (): Record<string, 0 | 1> => Object.fromEntries(toggleStates);
const fullState = (): ServerMessage => ({ type: "state.full", project, oscReady: osc.isReady(), gainsBySource: gainsBySource(), toggleStates:currentToggleStates() });

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { store.save(project); saveTimer = undefined; }, 250);
  saveTimer.unref?.();
}

function changed(): void {
  scheduleSave();
  broadcast({ type: "state.project", project, gainsBySource: gainsBySource(), toggleStates:currentToggleStates() });
}

function applySpatialUpdates(updates: { id: string; position: XYZ }[]): { id: string; position: XYZ; gains: number[] }[] {
  if (updates.length === 0 || updates.length > 64) throw new Error("Invalid spatial batch");
  const seen = new Set<string>();
  const resolved = updates.map((update) => {
    if (seen.has(update.id)) throw new Error("Duplicate spatial source");
    seen.add(update.id);
    const source = project.spatialSources.find((item) => item.id === update.id);
    if (!source) throw new Error("Unknown spatial source");
    return { source, position:update.position.map(clamp01) as XYZ };
  });
  return resolved.map(({ source, position }) => {
    source.position = position;
    return { id:source.id, position, gains:dbapGains(position, project) };
  });
}

function nextId(kind: keyof Project["nextIds"], prefix: string, existing: string[]): string {
  const available = lowestAvailableId(prefix, existing);
  project.nextIds[kind] = available.number + 1;
  return available.id;
}

function handle(message: ClientMessage, socket: WebSocket): void {
  switch (message.type) {
    case "health.ping": send(socket,{type:"health.pong",seq:Math.max(0,Math.floor(Number(message.seq)||0)),osc:osc.health()});break;
    case "state.request": send(socket, fullState()); break;
    case "project.export": send(socket, { type: "project.data", project }); break;
    case "project.import": {
      releaseAllGates();
      project = parseProject(message.project);
      osc.reconfigure(project.osc);
      osc.speakerConfig(project.speakers);
      store.save(project);
      broadcast(fullState());
      break;
    }
    case "project.patch": {
      const patch = message.patch;
      project = parseProject({ ...project,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        osc: { ...project.osc, ...patch.osc }, room: { ...project.room, ...patch.room }, dbap: { ...project.dbap, ...patch.dbap }
      });
      osc.reconfigure(project.osc);
      osc.speakerConfig(project.speakers);
      changed();
      break;
    }
    case "generalPage.add": {
      if (project.generalPages.length >= MAX_GENERAL_PAGES) throw new Error(`General page limit is ${MAX_GENERAL_PAGES}`);
      const id = lowestAvailableId("G", project.generalPages.map((page) => page.id)).id;
      const page = { id, name:`PAGE ${project.generalPages.length + 1}` };
      project.generalPages.push(page);changed();send(socket,{type:"generalPage.added",page});break;
    }
    case "generalPage.rename": {
      const page=project.generalPages.find((item)=>item.id===message.id);if(!page)throw new Error("Unknown general page");
      page.name=message.name;project=parseProject(project);changed();break;
    }
    case "generalPage.remove": {
      if(project.generalPages.length<=1)throw new Error("At least one general page is required");
      if(!project.generalPages.some((page)=>page.id===message.id))throw new Error("Unknown general page");
      if(project.controls.some((control)=>control.pageId===message.id))throw new Error("Delete the controls on this page first");
      project.generalPages=project.generalPages.filter((page)=>page.id!==message.id);changed();break;
    }
    case "speaker.add": {
      if (project.speakers.length >= MAX_SPEAKERS) throw new Error(`Speaker limit is ${MAX_SPEAKERS}`);
      const usedOutputs = new Set(project.speakers.map((item) => item.out_ch));
      let outChannel = 1; while (usedOutputs.has(outChannel) && outChannel < MAX_OUTPUT_CHANNEL) outChannel++;
      const speaker: Speaker = { id: nextId("speaker", "SP", project.speakers.map((item) => item.id)),
        x_m: project.room.width_m / 2, y_m: project.room.depth_m / 2, z_m: project.room.height_m / 2,
        out_ch: outChannel };
      project.speakers.push(speaker); osc.speakerConfig(project.speakers); changed(); break;
    }
    case "speaker.update": {
      const speaker = project.speakers.find((item) => item.id === message.id);
      if (!speaker) throw new Error("Unknown speaker");
      Object.assign(speaker, message.patch);
      project = parseProject(project); osc.speakerConfig(project.speakers); changed(); break;
    }
    case "speaker.remove": project.speakers = project.speakers.filter((item) => item.id !== message.id); osc.speakerConfig(project.speakers); changed(); break;
    case "spatial.add": {
      const source: SpatialSource = { id: nextId("spatial", "S", project.spatialSources.map((item) => item.id)), position: [0.5, 0.5, 0.5] };
      project.spatialSources.push(source); changed(); break;
    }
    case "spatial.remove": {
      if (activeGates.has(message.id)) { osc.spatialRelease(message.id); activeGates.delete(message.id); }
      project.spatialSources = project.spatialSources.filter((item) => item.id !== message.id);
      for(const scene of Object.values(project.scenes))if(scene)delete scene.positions[message.id];
      changed(); break;
    }
    case "scene.store": {
      project.scenes[message.slot] = { positions:Object.fromEntries(project.spatialSources.map(({ id, position }) => [id, [...position] as XYZ])) };
      changed(); break;
    }
    case "scene.clear": {
      delete project.scenes[message.slot];changed();break;
    }
    case "spatial.move": {
      const source = project.spatialSources.find((item) => item.id === message.id);
      if (!source) throw new Error("Unknown spatial source");
      const position = message.position.map(clamp01) as XYZ;
      source.position = position;
      const gains = dbapGains(position, project);
      osc.spatialMove(source.id, position, gains);
      scheduleSave();
      broadcast({ type: "spatial.moved", id: source.id, position, gains });
      break;
    }
    case "spatial.trigger": {
      const source = project.spatialSources.find((item) => item.id === message.id);
      if (!source) throw new Error("Unknown spatial source");
      const position = message.position.map(clamp01) as XYZ;
      source.position = position;
      const gains = dbapGains(position, project);
      const seq = ++eventSeq;
      const holders = activeGates.get(source.id) ?? new Set<WebSocket>(); holders.add(socket); activeGates.set(source.id, holders);
      osc.spatialTrigger(source.id, position, gains, project.speakers);
      scheduleSave();
      broadcast({ type: "spatial.fired", id: source.id, position, gains, seq });
      break;
    }
    case "spatial.release": {
      if (!project.spatialSources.some((item) => item.id === message.id)) throw new Error("Unknown spatial source");
      const holders = activeGates.get(message.id); holders?.delete(socket);
      if (!holders || holders.size === 0) { activeGates.delete(message.id); osc.spatialRelease(message.id); }
      break;
    }
    case "spatial.batchMove": {
      const frames = applySpatialUpdates(message.updates);
      osc.spatialBatchMove(frames);scheduleSave();
      for (const frame of frames) broadcast({ type:"spatial.moved", ...frame });
      break;
    }
    case "spatial.batchTrigger": {
      const frames = applySpatialUpdates(message.updates);
      for (const frame of frames) {
        const holders=activeGates.get(frame.id)??new Set<WebSocket>();holders.add(socket);activeGates.set(frame.id,holders);
      }
      osc.spatialBatchTrigger(frames,project.speakers);scheduleSave();
      for (const frame of frames) broadcast({ type:"spatial.fired", ...frame, seq:++eventSeq });
      break;
    }
    case "spatial.batchRelease": {
      const ids=[...new Set(message.ids)];if(ids.length===0||ids.length>64)throw new Error("Invalid spatial batch");
      const releases:string[]=[];
      for(const id of ids){if(!project.spatialSources.some((item)=>item.id===id))throw new Error("Unknown spatial source");const holders=activeGates.get(id);holders?.delete(socket);if(!holders||holders.size===0){activeGates.delete(id);releases.push(id);}}
      if(releases.length)osc.spatialBatchRelease(releases);
      break;
    }
    case "control.add": {
      const page=project.generalPages.find((item)=>item.id===message.pageId);if(!page)throw new Error("Unknown general page");
      const isPad = message.controlType !== "fader",isSwitch=message.controlType==="switch";
      const size=message.controlType==="fader"?{w:.09,h:.78}:isSwitch?{w:.08,h:.72}:{w:.08,h:.42};
      const pageControls=project.controls.filter((control)=>control.pageId===page.id);
      const placement=findControlPlacement(pageControls,size.w,size.h);if(!placement)throw new Error("No free space for another control on this page");
      const id = nextId(isPad ? "pad" : "fader", isPad ? "P" : "F", project.controls.map((item) => item.id));
      project.controls.push(isPad
        ? { id, pageId:page.id, type: "pad", ...(isSwitch?{mode:"toggle" as const}:{}), ...placement, ...size }
        : { id, pageId:page.id, type: "fader", ...placement, ...size, value: 0.75 });
      changed(); break;
    }
    case "control.update": {
      const control = project.controls.find((item) => item.id === message.id);
      if (!control) throw new Error("Unknown control");
      const {behavior,...patch}=message.patch;
      if(behavior!==undefined){
        if(control.type!=="pad")throw new Error("Only Pads and Switches can change behavior");
        if(behavior!=="momentary"&&behavior!=="toggle")throw new Error("Unknown control behavior");
      }
      if (patch.pageId !== undefined && patch.pageId !== control.pageId) {
        const destination=project.generalPages.find((page)=>page.id===patch.pageId);
        if(!destination)throw new Error("Unknown destination page");
        const destinationControls=project.controls.filter((item)=>item.pageId===destination.id&&item.id!==control.id);
        const candidate={x:control.x,y:control.y,w:control.w,h:control.h};
        const placement=isControlPlacementAvailable(destinationControls,candidate)
          ? {x:control.x,y:control.y}
          : findControlPlacement(destinationControls,control.w,control.h);
        if(!placement)throw new Error("No free space for this control on the destination page");
        Object.assign(control,placement);
      }
      if(behavior!==undefined&&control.type==="pad"){
        const toggled=control.mode==="toggle",nextToggled=behavior==="toggle";
        if(toggled!==nextToggled){
          if(activePadGates.has(control.id)){osc.pad(control.id,0);activePadGates.delete(control.id);}
          if(toggleStates.get(control.id)){osc.pad(control.id,0);toggleStates.delete(control.id);}
          if(nextToggled)control.mode="toggle";else delete control.mode;
        }
      }
      Object.assign(control, patch);
      project = parseProject(project);changed();
      if(message.requestId)send(socket,{type:"control.updated",id:control.id,pageId:control.pageId,requestId:String(message.requestId).slice(0,80)});
      break;
    }
    case "control.remove": {
      if (activePadGates.has(message.id)) { osc.pad(message.id, 0); activePadGates.delete(message.id); }
      if(toggleStates.get(message.id)){osc.pad(message.id,0);toggleStates.delete(message.id);}
      project.controls = project.controls.filter((item) => item.id !== message.id); changed(); break;
    }
    case "control.trigger": {
      const control = project.controls.find((item) => item.id === message.id);
      if (!control || control.type !== "pad"||control.mode==="toggle") throw new Error("Unknown momentary pad");
      const holders = activePadGates.get(control.id) ?? new Set<WebSocket>();
      if (message.gate === 1) { holders.add(socket); activePadGates.set(control.id, holders); osc.pad(control.id, 1); }
      else { holders.delete(socket); if (holders.size === 0) { activePadGates.delete(control.id); osc.pad(control.id, 0); } }
      break;
    }
    case "control.toggle": {
      const control=project.controls.find((item)=>item.id===message.id);if(!control||control.type!=="pad"||control.mode!=="toggle")throw new Error("Unknown switch");
      const gate:0|1=toggleStates.get(control.id)?0:1;if(gate)toggleStates.set(control.id,gate);else toggleStates.delete(control.id);osc.pad(control.id,gate);broadcast({type:"control.toggled",id:control.id,gate});break;
    }
    case "control.value": {
      const control = project.controls.find((item) => item.id === message.id);
      if (!control || control.type !== "fader") throw new Error("Unknown fader");
      control.value = clamp01(message.value); osc.fader(control.id, control.value); scheduleSave(); break;
    }
  }
}

wss.on("connection", (socket) => {
  webSocketAlive.set(socket,true);socket.on("pong",()=>webSocketAlive.set(socket,true));
  osc.heartbeat();
  send(socket, fullState());
  socket.on("message", (data) => {
    try { handle(JSON.parse(data.toString()) as ClientMessage, socket); }
    catch (error) { send(socket, { type: "error", operation: "message", message: error instanceof Error ? error.message : "Invalid message" }); }
  });
  socket.on("close", () => {
    for (const [id, holders] of activeGates) {
      holders.delete(socket);
      if (holders.size === 0) { activeGates.delete(id); osc.spatialRelease(id); }
    }
    for (const [id, holders] of activePadGates) {
      holders.delete(socket);
      if (holders.size === 0) { activePadGates.delete(id); osc.pad(id, 0); }
    }
  });
});

const oscHeartbeatTimer=setInterval(()=>{if(wss.clients.size>0)osc.heartbeat();},2_000);
oscHeartbeatTimer.unref?.();
const webSocketHeartbeatTimer=setInterval(()=>{for(const socket of wss.clients){if(webSocketAlive.get(socket)===false){socket.terminate();continue;}webSocketAlive.set(socket,false);socket.ping();}},10_000);
webSocketHeartbeatTimer.unref?.();

server.listen(port, "0.0.0.0", () => {
  console.log(`[controller] http://localhost:${port}`);
  console.log(`[osc] ${project.osc.host}:${project.osc.port}${project.osc.namespace}`);
});

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) {
    process.exit(1);
  }
  shuttingDown = true;
  if (saveTimer) clearTimeout(saveTimer);
  clearInterval(oscHeartbeatTimer);
  clearInterval(webSocketHeartbeatTimer);
  store.save(project);
  releaseAllGates();
  osc.close();
  for (const socket of wss.clients) socket.terminate();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
