export class SeededRng {
  private state: number;

  constructor(seed?: number | null) {
    const fallback = Math.floor(Date.now() % 2_147_483_647);
    this.state = (Number.isFinite(seed ?? NaN) ? Number(seed) : fallback) >>> 0;
  }

  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  random(): number {
    return this.next();
  }

  choice<T>(items: T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot choose from an empty array");
    }
    return items[Math.floor(this.next() * items.length)];
  }

  shuffle<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.next() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  randRange(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }
}
