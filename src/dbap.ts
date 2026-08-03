import type { Project, XYZ } from "./types.js";

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function normToMeters(position: XYZ, room: Project["room"]): XYZ {
  return [position[0] * room.width_m, position[1] * room.depth_m, position[2] * room.height_m];
}

const MIN_OUTPUT_GAIN = 10 ** (-60 / 20);

export function dbapGains(position: XYZ, project: Project): number[] {
  const [x, y, z] = normToMeters(position.map(clamp01) as XYZ, project.room);
  const alpha = project.dbap.rolloff_db / (20 * Math.log10(2));
  const blur2 = project.dbap.blur_m ** 2;
  const weights = project.speakers.map((speaker) => {
    const distance2 = (x - speaker.x_m) ** 2 + (y - speaker.y_m) ** 2 + (z - speaker.z_m) ** 2;
    return 1 / Math.pow(Math.sqrt(distance2 + blur2), alpha);
  });
  const sumSquares = weights.reduce((sum, gain) => sum + gain * gain, 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return weights.map((gain) => {
    const normalized = gain / norm;
    return normalized < MIN_OUTPUT_GAIN ? 0 : normalized;
  });
}
