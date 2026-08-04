import { describe, expect, it } from "vitest";
import { defaultProject, MAX_OUTPUT_CHANNEL, MAX_SPEAKERS } from "../src/types.js";
import { parseProject } from "../src/project-store.js";

describe("project parsing", () => {
  it("rejects unknown schemas", () => expect(() => parseProject({ schemaVersion: 9 })).toThrow());
  it("clamps positions and preserves stable IDs", () => {
    const project = defaultProject();
    project.spatialSources[0].position = [-1, 2, 0.5];
    const parsed = parseProject(project);
    expect(parsed.spatialSources[0]).toEqual({ id: "S01", position: [0, 1, 0.5] });
  });
  it("clamps resized controls to safe maximum widths", () => {
    const project = defaultProject();
    project.controls[0].w = 0.9;
    project.controls[1].w = 0.9;
    const parsed = parseProject(project);
    expect(parsed.controls.map((control) => control.w)).toEqual([0.45, 0.3]);
  });
  it("preserves valid custom control sizes", () => {
    const project = defaultProject();
    project.controls[0].w = 0.24; project.controls[0].h = 0.42;
    project.controls[1].w = 0.16; project.controls[1].h = 0.6;
    const parsed = parseProject(project);
    expect(parsed.controls.map(({ w, h }) => [w, h])).toEqual([[0.24, 0.42], [0.16, 0.6]]);
  });
  it("stores Unicode display labels without changing OSC control IDs", () => {
    const project=defaultProject();project.controls[0].label="  メイン\nボーカル 🎤  ";
    const parsed=parseProject(project);
    expect(parsed.controls[0]).toMatchObject({id:"P01",label:"メイン ボーカル 🎤"});
  });
  it("preserves toggle behavior on switch-style pads", () => {
    const project=defaultProject(),pad=project.controls[0];if(pad.type!=="pad")throw new Error("Expected pad");pad.mode="toggle";
    expect(parseProject(project).controls[0]).toMatchObject({id:"P01",type:"pad",mode:"toggle"});
  });
  it("preserves a positive DBAP range and treats zero as unlimited", () => {
    const ranged = defaultProject();
    ranged.dbap.maxDist_m = 4.5;
    expect(parseProject(ranged).dbap.maxDist_m).toBe(4.5);
    ranged.dbap.maxDist_m = 0;
    expect(parseProject(ranged).dbap.maxDist_m).toBeUndefined();
  });
  it("defaults and clamps the DBAP hard-center radius", () => {
    const legacy = defaultProject() as unknown as { dbap: { hardCenter_m?: number } };
    delete legacy.dbap.hardCenter_m;
    expect(parseProject(legacy).dbap.hardCenter_m).toBe(0.3);
    legacy.dbap.hardCenter_m = -1;
    expect(parseProject(legacy).dbap.hardCenter_m).toBe(0);
  });
  it("limits speaker count and logical output channels", () => {
    const project = defaultProject();
    project.speakers = Array.from({ length: MAX_SPEAKERS + 4 }, (_, index) => ({ id:`SP${index + 1}`, x_m:0, y_m:0, z_m:0, out_ch:index === 0 ? 9999 : index + 1 }));
    const parsed = parseProject(project);
    expect(parsed.speakers).toHaveLength(MAX_SPEAKERS);
    expect(parsed.speakers[0].out_ch).toBe(MAX_OUTPUT_CHANNEL);
  });
  it("preserves scene snapshots, clamps positions, and drops missing sources", () => {
    const project=defaultProject();
    project.scenes={A:{positions:{S01:[-1,0.4,2],MISSING:[0.2,0.3,0.4]}},B:{positions:{S01:[0.8,0.7,0.6]}}};
    expect(parseProject(project).scenes).toEqual({
      A:{positions:{S01:[0,0.4,1]}},
      B:{positions:{S01:[0.8,0.7,0.6]}}
    });
  });
});
