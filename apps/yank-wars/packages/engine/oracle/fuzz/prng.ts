/** A small seeded PRNG (sfc32); each case gets its own stream, so case i never depends on cases before it. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number, stream: number) {
    this.a = 0x9e3779b9;
    this.b = seed >>> 0;
    this.c = stream >>> 0;
    this.d = 1;
    for (let i = 0; i < 15; i++) this.next();
  }

  /** uniform in [0, 2^32) */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** uniform integer in [lo, hi] */
  int(lo: number, hi: number): number {
    return lo + (this.next() % (hi - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() / 2 ** 32 < p;
  }

  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new Error("pick from an empty list");
    return xs[this.next() % xs.length] as T;
  }

  /** one of the options, chosen with probability proportional to its weight */
  weighted<T>(options: readonly (readonly [number, T])[]): T {
    const total = options.reduce((s, [w]) => s + w, 0);
    let r = (this.next() / 2 ** 32) * total;
    for (const [w, v] of options) {
      r -= w;
      if (r < 0) return v;
    }
    return (options[options.length - 1] as readonly [number, T])[1];
  }
}
