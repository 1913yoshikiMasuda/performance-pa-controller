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

  it("moves continuously between speakers without changing the active set", () => {
    const project = defaultProject();
    project.speakers = [
      { id: "LEFT", x_m: 0, y_m: 0, z_m: 0, out_ch: 1 },
      { id: "RIGHT", x_m: 10, y_m: 0, z_m: 0, out_ch: 2 }
    ];
    const leftGains = [0.4, 0.45, 0.5].map((x) => dbapGains([x, 0, 0], project)[0]);
    expect(leftGains[0]).toBeGreaterThan(leftGains[1]);
    expect(leftGains[1]).toBeGreaterThan(leftGains[2]);
    expect(leftGains.every((gain) => gain > 0)).toBe(true);
  });

  it("uses rolloff as spatial focus", () => {
    const project = defaultProject();
    project.speakers = [
      { id: "NEAR", x_m: 1, y_m: 0, z_m: 0, out_ch: 1 },
      { id: "FAR", x_m: 9, y_m: 0, z_m: 0, out_ch: 2 }
    ];
    project.dbap.rolloff_db = 6;
    const wide = dbapGains([0, 0, 0], project);
    project.dbap.rolloff_db = 18;
    const tight = dbapGains([0, 0, 0], project);
    expect(tight[0] / tight[1]).toBeGreaterThan(wide[0] / wide[1]);
  });

  it("zeros only normalized outputs below minus 60 dB", () => {
    const project = defaultProject();
    project.room.width_m = 100;
    project.dbap.rolloff_db = 12;
    project.dbap.blur_m = 0.1;
    project.speakers = [
      { id: "NEAR", x_m: 0, y_m: 0, z_m: 0, out_ch: 1 },
      { id: "INAUDIBLE", x_m: 100, y_m: 0, z_m: 0, out_ch: 2 }
    ];
    const gains = dbapGains([0, 0, 0], project);
    expect(gains[0]).toBeCloseTo(1, 10);
    expect(gains[1]).toBe(0);
  });
});
