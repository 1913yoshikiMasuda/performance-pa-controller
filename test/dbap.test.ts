import { describe, expect, it } from "vitest";
import { dbapGains, normToMeters } from "../src/dbap.js";
import { defaultProject } from "../src/types.js";

describe("3D DBAP", () => {
  it("converts all three normalized axes", () => {
    expect(normToMeters([0.5, 0.25, 0.75], { width_m: 10, depth_m: 8, height_m: 4 })).toEqual([5, 2, 3]);
  });

  it("returns one constant-power gain per speaker", () => {
    const project = defaultProject();
    const gains = dbapGains([0.2, 0.4, 0.8], project);
    expect(gains).toHaveLength(project.speakers.length);
    expect(gains.reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1, 8);
  });

  it("responds to source height", () => {
    const project = defaultProject();
    project.speakers[0].z_m = 0;
    project.speakers[1].z_m = 4;
    expect(dbapGains([0.5, 0, 0], project)[0]).toBeGreaterThan(dbapGains([0.5, 0, 1], project)[0]);
  });
});
