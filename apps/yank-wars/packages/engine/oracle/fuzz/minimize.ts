/** Zeller's ddmin over complements: a 1-minimal ordered sublist for which `fails` still holds. */
export async function ddmin<T>(
  items: readonly T[],
  fails: (xs: readonly T[]) => Promise<boolean>,
): Promise<T[]> {
  let xs = [...items];
  let n = 2;
  while (xs.length >= 2) {
    const size = Math.ceil(xs.length / n);
    let reduced = false;
    for (let at = 0; at < xs.length; at += size) {
      const rest = [...xs.slice(0, at), ...xs.slice(at + size)];
      if (rest.length > 0 && (await fails(rest))) {
        xs = rest;
        n = Math.max(n - 1, 2);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (n >= xs.length) break;
      n = Math.min(n * 2, xs.length);
    }
  }
  return xs;
}
