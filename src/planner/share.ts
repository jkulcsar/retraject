/**
 * Shareable path links: a taught program serialized into URL query
 * parameters, so a specific motion becomes a link you can send. Plain
 * string handling, no dependencies — trivially portable.
 *
 * Format (all human-readable on purpose):
 *   ?w=0,50,-60,0,40,0;70,-85,100,45,-60,90   waypoints, degrees, ';'-joined
 *   &laws=quintic,trapezoidal                  one law id per segment
 *   &blend=1                                   optional: blend vias instead
 *
 * Decoding is defensive: anything malformed returns null and the app
 * simply starts empty — a bad link must never break the page.
 */
import type { LawId } from "../trajectory";

const LAW_IDS: readonly LawId[] = ["linear", "cubic", "quintic", "bangBang", "trapezoidal"];
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SharedPath {
  /** Joint-space waypoints in radians. */
  waypoints: number[][];
  laws: LawId[];
  blend: boolean;
}

export function encodeSharedPath(path: SharedPath): string {
  const params = new URLSearchParams();
  params.set(
    "w",
    path.waypoints.map((wp) => wp.map((v) => (v * DEG).toFixed(1)).join(",")).join(";"),
  );
  if (!path.blend && path.laws.length > 0) params.set("laws", path.laws.join(","));
  if (path.blend) params.set("blend", "1");
  return params.toString();
}

export function decodeSharedPath(search: string, jointCount: number): SharedPath | null {
  const params = new URLSearchParams(search);
  const w = params.get("w");
  if (!w) return null;

  const waypoints: number[][] = [];
  for (const chunk of w.split(";")) {
    const values = chunk.split(",").map(Number);
    if (values.length !== jointCount || values.some((v) => !Number.isFinite(v))) return null;
    waypoints.push(values.map((v) => v * RAD));
  }
  if (waypoints.length < 2) return null;

  const blend = params.get("blend") === "1";
  let laws: LawId[] = [];
  if (!blend) {
    const raw = params.get("laws");
    laws = raw ? (raw.split(",") as LawId[]) : [];
    // Tolerate a missing/short law list (fill with quintic), reject junk.
    if (laws.some((id) => !LAW_IDS.includes(id))) return null;
    while (laws.length < waypoints.length - 1) laws.push("quintic");
    laws = laws.slice(0, waypoints.length - 1);
  }
  return { waypoints, laws, blend };
}
