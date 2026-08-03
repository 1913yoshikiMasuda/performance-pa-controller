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
  it("compacts legacy control widths for touch-friendly controls", () => {
    const project = defaultProject();
    project.controls[0].w = 0.18;
    project.controls[1].w = 0.13;
    const parsed = parseProject(project);
    expect(parsed.controls.map((control) => control.w)).toEqual([0.14, 0.11]);
  });
});
