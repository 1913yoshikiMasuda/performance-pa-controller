export type XYZ = [number, number, number];

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

interface ControlBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PadControl extends ControlBase {
  type: "pad";
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
  dbap: { rolloff_db: number; blur_m: number };
  speakers: Speaker[];
  spatialSources: SpatialSource[];
  controls: FreeControl[];
  nextIds: { speaker: number; spatial: number; pad: number; fader: number };
}

export type ClientMessage =
  | { type: "project.patch"; patch: { name?: string; osc?: Partial<Project["osc"]>; room?: Partial<Room>; dbap?: Partial<Project["dbap"]> } }
  | { type: "project.import"; project: unknown }
  | { type: "project.export" }
  | { type: "speaker.add" }
  | { type: "speaker.update"; id: string; patch: Partial<Omit<Speaker, "id">> }
  | { type: "speaker.remove"; id: string }
  | { type: "spatial.add" }
  | { type: "spatial.remove"; id: string }
  | { type: "spatial.move"; id: string; position: XYZ }
  | { type: "spatial.trigger"; id: string; position: XYZ }
  | { type: "spatial.release"; id: string }
  | { type: "control.add"; controlType: "pad" | "fader" }
  | { type: "control.update"; id: string; patch: Partial<Pick<FreeControl, "x" | "y" | "w" | "h">> }
  | { type: "control.remove"; id: string }
  | { type: "control.trigger"; id: string }
  | { type: "control.value"; id: string; value: number }
  | { type: "state.request" };

export type ServerMessage =
  | { type: "state.full"; project: Project; oscReady: boolean }
  | { type: "state.project"; project: Project }
  | { type: "spatial.moved"; id: string; position: XYZ }
  | { type: "spatial.fired"; id: string; position: XYZ; gains: number[]; seq: number }
  | { type: "project.data"; project: Project }
  | { type: "error"; operation: string; message: string };

export function defaultProject(): Project {
  return {
    schemaVersion: 1,
    name: "Untitled Project",
    osc: { host: "127.0.0.1", port: 7400, namespace: "/pps" },
    room: { width_m: 10, depth_m: 8, height_m: 4 },
    dbap: { rolloff_db: 6, blur_m: 0.5 },
    speakers: [
      { id: "SP01", x_m: 0, y_m: 0, z_m: 2, out_ch: 1 },
      { id: "SP02", x_m: 10, y_m: 0, z_m: 2, out_ch: 2 },
      { id: "SP03", x_m: 10, y_m: 8, z_m: 2, out_ch: 3 },
      { id: "SP04", x_m: 0, y_m: 8, z_m: 2, out_ch: 4 }
    ],
    spatialSources: [{ id: "S01", position: [0.5, 0.5, 0.5] }],
    controls: [
      { id: "P01", type: "pad", x: 0.03, y: 0.08, w: 0.14, h: 0.8 },
      { id: "F01", type: "fader", x: 0.21, y: 0.08, w: 0.09, h: 0.8, value: 0.75 }
    ],
    nextIds: { speaker: 5, spatial: 2, pad: 2, fader: 2 }
  };
}
