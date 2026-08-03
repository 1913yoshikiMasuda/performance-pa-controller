import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { clamp01, dbapGains } from "./dbap.js";
import { OscOutput } from "./osc.js";
import { parseProject, ProjectStore } from "./project-store.js";
import type { ClientMessage, FreeControl, Project, ServerMessage, Speaker, SpatialSource, XYZ } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const webDir = join(root, "web");
const projectFile = process.env.PROJECT_FILE ? resolve(process.env.PROJECT_FILE) : join(root, "projects", "_active.json");
const port = Number(process.env.HTTP_PORT ?? 8080);
const store = new ProjectStore(projectFile);
let project = store.load();
const osc = new OscOutput(project.osc);
osc.open();
let eventSeq = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml"
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
const send = (socket: WebSocket, message: ServerMessage) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));
const broadcast = (message: ServerMessage) => wss.clients.forEach((socket) => send(socket, message));
const fullState = (): ServerMessage => ({ type: "state.full", project, oscReady: osc.isReady() });

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { store.save(project); saveTimer = undefined; }, 250);
  saveTimer.unref?.();
}

function changed(): void {
  scheduleSave();
  broadcast({ type: "state.project", project });
}

function nextId(kind: keyof Project["nextIds"], prefix: string, existing: string[]): string {
  for (;;) {
    const id = `${prefix}${String(project.nextIds[kind]++).padStart(2, "0")}`;
    if (!existing.includes(id)) return id;
  }
}

function controlPlacement(index: number): Pick<FreeControl, "x" | "y"> {
  return { x: 0.03 + (index % 5) * 0.19, y: 0.08 + (Math.floor(index / 5) % 2) * 0.43 };
}

function handle(message: ClientMessage, socket: WebSocket): void {
  switch (message.type) {
    case "state.request": send(socket, fullState()); break;
    case "project.export": send(socket, { type: "project.data", project }); break;
    case "project.import": {
      project = parseProject(message.project);
      osc.reconfigure(project.osc);
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
      changed();
      break;
    }
    case "speaker.add": {
      const speaker: Speaker = { id: nextId("speaker", "SP", project.speakers.map((item) => item.id)),
        x_m: project.room.width_m / 2, y_m: project.room.depth_m / 2, z_m: project.room.height_m / 2,
        out_ch: Math.max(0, ...project.speakers.map((item) => item.out_ch)) + 1 };
      project.speakers.push(speaker); changed(); break;
    }
    case "speaker.update": {
      const speaker = project.speakers.find((item) => item.id === message.id);
      if (!speaker) throw new Error("Unknown speaker");
      Object.assign(speaker, message.patch);
      project = parseProject(project); changed(); break;
    }
    case "speaker.remove": project.speakers = project.speakers.filter((item) => item.id !== message.id); changed(); break;
    case "spatial.add": {
      const source: SpatialSource = { id: nextId("spatial", "S", project.spatialSources.map((item) => item.id)), position: [0.5, 0.5, 0.5] };
      project.spatialSources.push(source); changed(); break;
    }
    case "spatial.remove": project.spatialSources = project.spatialSources.filter((item) => item.id !== message.id); changed(); break;
    case "spatial.trigger": {
      const source = project.spatialSources.find((item) => item.id === message.id);
      if (!source) throw new Error("Unknown spatial source");
      const position = message.position.map(clamp01) as XYZ;
      source.position = position;
      const gains = dbapGains(position, project);
      const seq = ++eventSeq;
      osc.spatial(source.id, position, gains, seq);
      scheduleSave();
      broadcast({ type: "spatial.fired", id: source.id, position, gains, seq });
      break;
    }
    case "control.add": {
      const placement = controlPlacement(project.controls.length);
      const isPad = message.controlType === "pad";
      const id = nextId(isPad ? "pad" : "fader", isPad ? "P" : "F", project.controls.map((item) => item.id));
      project.controls.push(isPad
        ? { id, type: "pad", ...placement, w: 0.16, h: 0.36 }
        : { id, type: "fader", ...placement, w: 0.13, h: 0.78, value: 0.75 });
      changed(); break;
    }
    case "control.update": {
      const control = project.controls.find((item) => item.id === message.id);
      if (!control) throw new Error("Unknown control");
      Object.assign(control, message.patch);
      project = parseProject(project); changed(); break;
    }
    case "control.remove": project.controls = project.controls.filter((item) => item.id !== message.id); changed(); break;
    case "control.trigger": {
      const control = project.controls.find((item) => item.id === message.id);
      if (!control || control.type !== "pad") throw new Error("Unknown pad");
      osc.pad(control.id, ++eventSeq); break;
    }
    case "control.value": {
      const control = project.controls.find((item) => item.id === message.id);
      if (!control || control.type !== "fader") throw new Error("Unknown fader");
      control.value = clamp01(message.value); osc.fader(control.id, control.value); scheduleSave(); break;
    }
  }
}

wss.on("connection", (socket) => {
  send(socket, fullState());
  socket.on("message", (data) => {
    try { handle(JSON.parse(data.toString()) as ClientMessage, socket); }
    catch (error) { send(socket, { type: "error", operation: "message", message: error instanceof Error ? error.message : "Invalid message" }); }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[controller] http://localhost:${port}`);
  console.log(`[osc] ${project.osc.host}:${project.osc.port}${project.osc.namespace}`);
});

function shutdown(): void {
  if (saveTimer) clearTimeout(saveTimer);
  store.save(project);
  osc.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
