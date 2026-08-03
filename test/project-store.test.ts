import { describe, expect, it } from "vitest";
import { defaultProject } from "../src/types.js";
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
});
