import type { Project, XYZ } from "./types.js";

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function normToMeters(position: XYZ, room: Project["room"]): XYZ {
  return [position[0] * room.width_m, position[1] * room.depth_m, position[2] * room.height_m];
}

/** Keep the inner 75% unchanged, then ease continuously to silence at the range edge. */
export function rangeTaper(distance: number, maxDistance?: number): number {
  if (!maxDistance || maxDistance <= 0) return 1;
  const fadeStart = maxDistance * 0.75;
  if (distance <= fadeStart) return 1;
  if (distance >= maxDistance) return 0;
  const remaining = (maxDistance - distance) / (maxDistance - fadeStart);
  return remaining * remaining * (3 - 2 * remaining);
}

export function dbapGains(position: XYZ, project: Project): number[] {
  const [x, y, z] = normToMeters(position.map(clamp01) as XYZ, project.room);
  const hardCenter = project.dbap.hardCenter_m;
  const alpha = project.dbap.rolloff_db / (20 * Math.log10(2));
  const blur2 = project.dbap.blur_m ** 2;
  const maxDistance = project.dbap.maxDist_m;
  const distances: number[] = [];
  const weights = project.speakers.map((speaker) => {
    const distance2 = (x - speaker.x_m) ** 2 + (y - speaker.y_m) ** 2 + (z - speaker.z_m) ** 2;
    const distance = Math.sqrt(distance2);
    distances.push(distance);
    const taper = rangeTaper(distance, maxDistance);
    if (taper === 0) return 0;
    return taper / Math.pow(Math.sqrt(distance2 + blur2), alpha);
  });
  let sumSquares = weights.reduce((sum, gain) => sum + gain * gain, 0);
  if (sumSquares === 0 && weights.length) {
    const nearest = distances.reduce((best, distance, index) => distance < distances[best] ? index : best, 0);
    weights[nearest] = 1;
    sumSquares = 1;
  }
  const norm = Math.sqrt(sumSquares) || 1;
  const gains = weights.map((gain) => gain / norm);
  if (hardCenter <= 0 || !project.speakers.length) return gains;

  const nearest = project.speakers.reduce((best, speaker, index, speakers) => {
    const distance = Math.hypot(x - speaker.x_m, y - speaker.y_m);
    const bestDistance = Math.hypot(x - speakers[best].x_m, y - speakers[best].y_m);
    return distance < bestDistance ? index : best;
  }, 0);
  const nearestDistance = Math.hypot(x - project.speakers[nearest].x_m, y - project.speakers[nearest].y_m);
  if (nearestDistance >= hardCenter * 2) return gains;
  if (nearestDistance <= hardCenter) return project.speakers.map((_, index) => index === nearest ? 1 : 0);

  const proximity = (hardCenter * 2 - nearestDistance) / hardCenter;
  const centerMix = proximity * proximity * (3 - 2 * proximity);
  const blended = gains.map((gain, index) => gain * (1 - centerMix) + (index === nearest ? centerMix : 0));
  const blendNorm = Math.sqrt(blended.reduce((sum, gain) => sum + gain * gain, 0)) || 1;
  return blended.map((gain) => gain / blendNorm);
}
