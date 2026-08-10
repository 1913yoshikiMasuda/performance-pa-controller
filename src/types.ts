export type XYZ = [number, number, number];
export const MAX_SPEAKERS = 64;
export const MAX_OUTPUT_CHANNEL = 1024;
export const MAX_GENERAL_PAGES = 16;

export interface Room {
  width_m: number;
  depth_m: number;
  height_m: number;
}

export interface Speaker {
  id: string;
  x_m: number;
  y_m: number;
  z_m: number;
  out_ch: number;
}

export interface SpatialSource {
  id: string;
  position: XYZ;
}

export type SceneSlot = "A" | "B";
export interface SceneSnapshot {
  positions: Record<string, XYZ>;
}

export interface GeneralPage {
  id: string;
  name: string;
}

interface ControlBase {
  id: string;
  pageId: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PadControl extends ControlBase {
  type: "pad";
  mode?: "toggle";
}

export interface FaderControl extends ControlBase {
  type: "fader";
  value: number;
}

export type FreeControl = PadControl | FaderControl;

export interface Project {
  schemaVersion: 1;
  name: string;
  osc: { host: string; port: number; namespace: string };
  room: Room;
  dbap: { rolloff_db: number; blur_m: number; hardCenter_m: number; maxDist_m?: number };
  speakers: Speaker[];
  spatialSources: SpatialSource[];
  scenes: Partial<Record<SceneSlot, SceneSnapshot>>;
  generalPages: GeneralPage[];
  controls: FreeControl[];
  nextIds: { speaker: number; spatial: number; pad: number; fader: number };
}

export type ClientMessage =
  | { type: "project.patch"; patch: { name?: string; osc?: Partial<Project["osc"]>; room?: Partial<Room>; dbap?: Partial<Project["dbap"]> } }
  | { type: "project.import"; project: unknown }
  | { type: "project.export" }
  | { type: "generalPage.add" }
  | { type: "generalPage.rename"; id: string; name: string }
  | { type: "generalPage.remove"; id: string }
  | { type: "speaker.add" }
  | { type: "speaker.update"; id: string; patch: Partial<Omit<Speaker, "id">> }
  | { type: "speaker.remove"; id: string }
  | { type: "spatial.add" }
  | { type: "spatial.remove"; id: string }
  | { type: "spatial.move"; id: string; position: XYZ }
  | { type: "spatial.trigger"; id: string; position: XYZ }
  | { type: "spatial.release"; id: string }
  | { type: "spatial.batchMove"; updates: { id: string; position: XYZ }[] }
  | { type: "spatial.batchTrigger"; updates: { id: string; position: XYZ }[] }
  | { type: "spatial.batchRelease"; ids: string[] }
  | { type: "scene.store"; slot: SceneSlot }
  | { type: "scene.clear"; slot: SceneSlot }
  | { type: "control.add"; controlType: "pad" | "switch" | "fader"; pageId: string }
  | { type: "control.update"; id: string; patch: Partial<Pick<FreeControl, "label" | "pageId" | "x" | "y" | "w" | "h">>; requestId?: string }
  | { type: "control.remove"; id: string }
  | { type: "control.trigger"; id: string; gate: 0 | 1 }
  | { type: "control.toggle"; id: string }
  | { type: "control.value"; id: string; value: number }
  | { type: "state.request" };

export type ServerMessage =
  | { type: "state.full"; project: Project; oscReady: boolean; gainsBySource: Record<string, number[]>; toggleStates: Record<string, 0 | 1> }
  | { type: "state.project"; project: Project; gainsBySource: Record<string, number[]>; toggleStates: Record<string, 0 | 1> }
  | { type: "spatial.moved"; id: string; position: XYZ; gains: number[] }
  | { type: "spatial.fired"; id: string; position: XYZ; gains: number[]; seq: number }
  | { type: "control.updated"; id: string; pageId: string; requestId: string }
  | { type: "control.toggled"; id: string; gate: 0 | 1 }
  | { type: "generalPage.added"; page: GeneralPage }
  | { type: "project.data"; project: Project }
  | { type: "error"; operation: string; message: string };

export function defaultProject(): Project {
  return {
    schemaVersion: 1,
    name: "Untitled Project",
    osc: { host: "127.0.0.1", port: 7400, namespace: "/pps" },
    room: { width_m: 10, depth_m: 8, height_m: 4 },
    dbap: { rolloff_db: 6, blur_m: 0.5, hardCenter_m: 0.3 },
    speakers: [
      { id: "SP01", x_m: 0, y_m: 0, z_m: 2, out_ch: 1 },
      { id: "SP02", x_m: 10, y_m: 0, z_m: 2, out_ch: 2 },
      { id: "SP03", x_m: 10, y_m: 8, z_m: 2, out_ch: 3 },
      { id: "SP04", x_m: 0, y_m: 8, z_m: 2, out_ch: 4 }
    ],
    spatialSources: [{ id: "S01", position: [0.5, 0.5, 0.5] }],
    scenes: {},
    generalPages: [{ id: "G01", name: "MAIN" }],
    controls: [
      { id: "P01", pageId: "G01", type: "pad", x: 0.03, y: 0.08, w: 0.14, h: 0.8 },
      { id: "F01", pageId: "G01", type: "fader", x: 0.21, y: 0.08, w: 0.09, h: 0.8, value: 0.75 }
    ],
    nextIds: { speaker: 5, spatial: 2, pad: 2, fader: 2 }
  };
}
