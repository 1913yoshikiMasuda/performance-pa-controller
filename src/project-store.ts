import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FreeControl, Project, Speaker, SpatialSource } from "./types.js";
import { clamp01 } from "./dbap.js";
import { defaultProject } from "./types.js";

const finite = (value: unknown, fallback: number): number => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeId = (value: unknown, fallback: string): string => {
  const id = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{1,32}$/.test(id) ? id : fallback;
};

export function parseProject(value: unknown): Project {
  if (!value || typeof value !== "object") throw new Error("Project must be an object");
  const raw = value as Partial<Project>;
  if (raw.schemaVersion !== 1) throw new Error("Unsupported schemaVersion");
  const fallback = defaultProject();
  const room = {
    width_m: Math.max(0.1, finite(raw.room?.width_m, fallback.room.width_m)),
    depth_m: Math.max(0.1, finite(raw.room?.depth_m, fallback.room.depth_m)),
    height_m: Math.max(0.1, finite(raw.room?.height_m, fallback.room.height_m))
  };
  const speakers: Speaker[] = (Array.isArray(raw.speakers) ? raw.speakers : []).slice(0, 64).map((speaker, index) => ({
    id: safeId(speaker?.id, `SP${String(index + 1).padStart(2, "0")}`),
    x_m: Math.max(0, Math.min(room.width_m, finite(speaker?.x_m, 0))),
    y_m: Math.max(0, Math.min(room.depth_m, finite(speaker?.y_m, 0))),
    z_m: Math.max(0, Math.min(room.height_m, finite(speaker?.z_m, 0))),
    out_ch: Math.max(1, Math.floor(finite(speaker?.out_ch, index + 1)))
  }));
  const spatialSources: SpatialSource[] = (Array.isArray(raw.spatialSources) ? raw.spatialSources : []).slice(0, 64).map((source, index) => ({
    id: safeId(source?.id, `S${String(index + 1).padStart(2, "0")}`),
    position: [clamp01(source?.position?.[0]), clamp01(source?.position?.[1]), clamp01(source?.position?.[2])]
  }));
  const controls: FreeControl[] = [];
  for (const [index, control] of (Array.isArray(raw.controls) ? raw.controls : []).slice(0, 64).entries()) {
    if (!control || (control.type !== "pad" && control.type !== "fader")) continue;
    const base = { id: safeId(control.id, `${control.type === "pad" ? "P" : "F"}${String(index + 1).padStart(2, "0")}`),
      x: clamp01(control.x), y: clamp01(control.y), w: Math.max(0.08, Math.min(0.5, finite(control.w, 0.15))), h: Math.max(0.18, Math.min(0.9, finite(control.h, 0.7))) };
    if (control.type === "pad") controls.push({ ...base, type: "pad" });
    else controls.push({ ...base, type: "fader", value: clamp01(control.value) });
  }
  const namespace = String(raw.osc?.namespace ?? fallback.osc.namespace).replace(/[^A-Za-z0-9/_-]/g, "");
  return {
    schemaVersion: 1,
    name: String(raw.name ?? fallback.name).trim().slice(0, 80) || fallback.name,
    osc: { host: String(raw.osc?.host ?? fallback.osc.host).trim() || fallback.osc.host,
      port: Math.max(1, Math.min(65535, Math.floor(finite(raw.osc?.port, fallback.osc.port)))), namespace: namespace.startsWith("/") ? namespace : `/${namespace}` },
    room,
    dbap: { rolloff_db: Math.max(0.1, finite(raw.dbap?.rolloff_db, fallback.dbap.rolloff_db)), blur_m: Math.max(0.01, finite(raw.dbap?.blur_m, fallback.dbap.blur_m)) },
    speakers,
    spatialSources,
    controls,
    nextIds: {
      speaker: Math.max(1, Math.floor(finite(raw.nextIds?.speaker, speakers.length + 1))),
      spatial: Math.max(1, Math.floor(finite(raw.nextIds?.spatial, spatialSources.length + 1))),
      pad: Math.max(1, Math.floor(finite(raw.nextIds?.pad, controls.filter((c) => c.type === "pad").length + 1))),
      fader: Math.max(1, Math.floor(finite(raw.nextIds?.fader, controls.filter((c) => c.type === "fader").length + 1)))
    }
  };
}

export class ProjectStore {
  constructor(private readonly file: string) {}

  load(): Project {
    if (!existsSync(this.file)) return defaultProject();
    return parseProject(JSON.parse(readFileSync(this.file, "utf8")));
  }

  save(project: Project): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const backupDir = join(dirname(this.file), ".backups");
    mkdirSync(backupDir, { recursive: true });
    if (existsSync(this.file)) copyFileSync(this.file, join(backupDir, `${Date.now()}.json`));
    const temp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    renameSync(temp, this.file);
    const backups = readdirSync(backupDir).filter((name) => name.endsWith(".json")).sort().reverse();
    for (const stale of backups.slice(5)) unlinkSync(join(backupDir, stale));
  }
}
