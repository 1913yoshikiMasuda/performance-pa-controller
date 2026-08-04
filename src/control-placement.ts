export interface ControlRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const INSET = 0.02;
const GAP = 0.015;
const STEP = 0.01;

function positions(maximum: number): number[] {
  const values: number[] = [];
  for (let value = INSET; value <= maximum + 1e-9; value += STEP) values.push(Number(Math.min(value, maximum).toFixed(3)));
  if (values.at(-1) !== maximum) values.push(Number(maximum.toFixed(3)));
  return [...new Set(values)];
}

function isSeparate(candidate: ControlRect, existing: ControlRect): boolean {
  return candidate.x + candidate.w + GAP <= existing.x
    || existing.x + existing.w + GAP <= candidate.x
    || candidate.y + candidate.h + GAP <= existing.y
    || existing.y + existing.h + GAP <= candidate.y;
}

export function findControlPlacement(controls: ControlRect[], width: number, height: number): Pick<ControlRect, "x" | "y"> | undefined {
  const maxX = 1 - INSET - width, maxY = 1 - INSET - height;
  if (maxX < INSET || maxY < INSET) return undefined;
  for (const y of positions(maxY)) {
    for (const x of positions(maxX)) {
      const candidate = { x, y, w:width, h:height };
      if (controls.every((control) => isSeparate(candidate, control))) return { x, y };
    }
  }
  return undefined;
}
