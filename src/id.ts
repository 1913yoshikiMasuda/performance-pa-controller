export interface AvailableId {
  id: string;
  number: number;
}

export function lowestAvailableId(prefix: string, existing: Iterable<string>): AvailableId {
  const used = new Set(existing);
  for (let number = 1; ; number++) {
    const id = `${prefix}${String(number).padStart(2, "0")}`;
    if (!used.has(id)) return { id, number };
  }
}
