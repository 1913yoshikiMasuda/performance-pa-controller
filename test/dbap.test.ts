import { describe, expect, it } from "vitest";
import { dbapGains, normToMeters, rangeTaper } from "../src/dbap.js";
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

  it("zeros speakers outside the configured range and keeps constant power", () => {
    const project = defaultProject();
    project.dbap.maxDist_m = 3;
    const gains = dbapGains([0, 0, 0.5], project);
    expect(gains[0]).toBe(1);
    expect(gains.slice(1)).toEqual([0, 0, 0]);
    expect(gains.reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1, 8);
  });

  it("eases gains through the outer quarter of the range", () => {
    expect(rangeTaper(3.75, 5)).toBe(1);
    expect(rangeTaper(4, 5)).toBeGreaterThan(rangeTaper(4.5, 5));
    expect(rangeTaper(4.5, 5)).toBeGreaterThan(rangeTaper(4.9, 5));
    expect(rangeTaper(5, 5)).toBe(0);
  });

  it("changes a ranged speaker continuously before reaching zero", () => {
    const project = defaultProject();
    project.speakers = [
      { id: "FAR", x_m: 0, y_m: 0, z_m: 0, out_ch: 1 },
      { id: "NEAR", x_m: 4.5, y_m: 0, z_m: 0, out_ch: 2 }
    ];
    project.dbap.maxDist_m = 5;
    const gains = [4, 4.5, 4.9, 5].map((x) => dbapGains([x / 10, 0, 0], project)[0]);
    expect(gains[0]).toBeGreaterThan(gains[1]);
    expect(gains[1]).toBeGreaterThan(gains[2]);
    expect(gains[2]).toBeGreaterThan(gains[3]);
    expect(gains[3]).toBe(0);
  });

  it("falls back to the nearest speaker when the range contains none", () => {
    const project = defaultProject();
    project.dbap.maxDist_m = 0.1;
    const gains = dbapGains([0.5, 0.5, 0.5], project);
    expect(gains.filter((gain) => gain > 0)).toHaveLength(1);
    expect(gains.reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1, 8);
  });
});
