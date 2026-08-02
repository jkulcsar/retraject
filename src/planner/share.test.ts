import { describe, expect, it } from "vitest";
import { decodeSharedPath, encodeSharedPath } from "./share";

const RAD = Math.PI / 180;

describe("shared path links", () => {
  const path = {
    waypoints: [
      [0, 50, -60, 0, 40, 0].map((d) => d * RAD),
      [70, -85, 100, 45, -60, 90].map((d) => d * RAD),
      [-40, 40, -55, -30, 60, -20].map((d) => d * RAD),
    ],
    laws: ["quintic", "trapezoidal"] as const,
    blend: false,
  };

  it("round-trips within the 0.1° encoding resolution", () => {
    const decoded = decodeSharedPath(encodeSharedPath({ ...path, laws: [...path.laws] }), 6);
    expect(decoded).not.toBeNull();
    expect(decoded!.laws).toEqual(["quintic", "trapezoidal"]);
    expect(decoded!.blend).toBe(false);
    decoded!.waypoints.forEach((wp, k) =>
      wp.forEach((v, j) => expect(Math.abs(v - path.waypoints[k][j])).toBeLessThan(0.1 * RAD)),
    );
  });

  it("round-trips blended paths (laws omitted by design)", () => {
    const decoded = decodeSharedPath(encodeSharedPath({ ...path, laws: [], blend: true }), 6);
    expect(decoded).not.toBeNull();
    expect(decoded!.blend).toBe(true);
    expect(decoded!.waypoints).toHaveLength(3);
  });

  it("fills a short law list with quintic and truncates a long one", () => {
    const decoded = decodeSharedPath("w=0,0,0,0,0,0;10,0,0,0,0,0;20,0,0,0,0,0&laws=cubic", 6);
    expect(decoded!.laws).toEqual(["cubic", "quintic"]);
  });

  it("rejects malformed input instead of guessing", () => {
    expect(decodeSharedPath("", 6)).toBeNull();
    expect(decodeSharedPath("w=1,2,3", 6)).toBeNull(); // wrong joint count
    expect(decodeSharedPath("w=1,2,3,4,5,6", 6)).toBeNull(); // single waypoint
    expect(decodeSharedPath("w=1,2,3,4,5,x;0,0,0,0,0,0", 6)).toBeNull(); // NaN
    expect(decodeSharedPath("w=0,0,0,0,0,0;1,1,1,1,1,1&laws=evil", 6)).toBeNull(); // unknown law
  });
});
