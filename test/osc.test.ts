import { describe, expect, it } from "vitest";
import { encodeBundle, encodeMessage } from "../src/osc.js";

describe("OSC encoding", () => {
  it("encodes a padded address, type tag, int, and float", () => {
    const packet = encodeMessage({ address: "/pps/test", args: [{ type: "i", value: 7 }, { type: "f", value: 0.5 }] });
    expect(packet.length % 4).toBe(0);
    expect(packet.subarray(0, 10).toString()).toContain("/pps/test");
    expect(packet.includes(Buffer.from(",if\0"))).toBe(true);
  });

  it("encodes an immediate bundle with size-prefixed messages", () => {
    const bundle = encodeBundle([{ address: "/pps/a", args: [] }, { address: "/pps/b", args: [] }]);
    expect(bundle.subarray(0, 8).toString()).toBe("#bundle\0");
    expect(bundle.readUInt32BE(12)).toBe(1);
    expect(bundle.readUInt32BE(16)).toBeGreaterThan(0);
  });
});
