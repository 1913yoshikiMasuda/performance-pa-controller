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
    project.dbap.hardCenter_m = 0;
    project.speakers[0].z_m = 0;
    project.speakers[1].z_m = 4;
    expect(dbapGains([0.5, 0, 0], project)[0]).toBeGreaterThan(dbapGains([0.5, 0, 1], project)[0]);
  });

  it("hard-centers on the nearest speaker using XY distance", () => {
    const project = defaultProject();
    project.dbap.hardCenter_m = 0.3;
    project.speakers[0] = { id: "TARGET", x_m: 5, y_m: 4, z_m: 4, out_ch: 1 };
    project.spatialSources[0].position = [0.5, 0.5, 0];
    expect(dbapGains(project.spatialSources[0].position, project)).toEqual([1, 0, 0, 0]);
  });

  it("uses regular DBAP outside the hard-center radius", () => {
    const project = defaultProject();
    project.dbap.hardCenter_m = 0.3;
    project.speakers[0] = { id: "NEAR", x_m: 5, y_m: 4, z_m: 2, out_ch: 1 };
    const gains = dbapGains([0.54, 0.5, 0.5], project);
    expect(gains[0]).toBeLessThan(1);
    expect(gains.slice(1).some((gain) => gain > 0)).toBe(true);
  });

  it("smoothly blends between hard center and regular DBAP", () => {
    const project = defaultProject();
    project.dbap.hardCenter_m = 0.3;
    project.speakers[0] = { id: "TARGET", x_m: 5, y_m: 4, z_m: 2, out_ch: 1 };
    const targetGains = [0.3, 0.4, 0.5, 0.6].map((distance) =>
      dbapGains([(5 + distance) / 10, 0.5, 0.5], project)[0]
    );
    expect(targetGains[0]).toBe(1);
    expect(targetGains[1]).toBeGreaterThan(targetGains[2]);
    expect(targetGains[2]).toBeGreaterThan(targetGains[3]);
    expect(targetGains[3]).toBeLessThan(1);
  });

  it("keeps constant power through the hard-center transition", () => {
    const project = defaultProject();
    project.dbap.hardCenter_m = 0.3;
    project.speakers[0] = { id: "TARGET", x_m: 5, y_m: 4, z_m: 2, out_ch: 1 };
    const gains = dbapGains([0.545, 0.5, 0.5], project);
    expect(gains.reduce((sum, gain) => sum + gain * gain, 0)).toBeCloseTo(1, 8);
    expect(gains[0]).toBeLessThan(1);
    expect(gains.slice(1).some((gain) => gain > 0)).toBe(true);
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
    project.dbap.hardCenter_m = 0;
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
