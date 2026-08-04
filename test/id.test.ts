import { describe, expect, it } from "vitest";
import { lowestAvailableId } from "../src/id.js";

describe("lowest available IDs", () => {
  it("fills a deleted gap without renumbering existing IDs", () => {
    expect(lowestAvailableId("P", ["P01", "P03", "P04"])).toEqual({ id:"P02", number:2 });
  });

  it("continues after a contiguous range", () => {
    expect(lowestAvailableId("F", ["F01", "F02"])).toEqual({ id:"F03", number:3 });
  });
});
