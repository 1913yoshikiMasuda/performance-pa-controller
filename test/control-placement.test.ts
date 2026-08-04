import { describe, expect, it } from "vitest";
import { findControlPlacement, type ControlRect } from "../src/control-placement.js";

const overlaps = (a: ControlRect, b: ControlRect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("general control placement", () => {
  it("places new controls only in unoccupied space", () => {
    const controls: ControlRect[] = [
      { x:.02, y:.02, w:.08, h:.72 },
      { x:.12, y:.02, w:.09, h:.78 }
    ];
    for (let index=0;index<6;index++) {
      const placement=findControlPlacement(controls,.08,.42);
      expect(placement).toBeDefined();
      const added={...placement!,w:.08,h:.42};
      expect(controls.some((control)=>overlaps(added,control))).toBe(false);
      controls.push(added);
    }
  });

  it("refuses to overlap when no free region remains", () => {
    expect(findControlPlacement([{x:0,y:0,w:1,h:1}],.08,.42)).toBeUndefined();
  });
});
