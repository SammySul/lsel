// Fits a List or Grid to its room as it resizes, and lets a Page fill grow past the window when one lacks its minimum.

/** Returns the teardown, for an `$effect` to hand back. */
export function refit(element: Element, fit: () => void): () => void {
  // a frame later: resizing inside the observer's own callback is a loop WebKit reports
  let frame = 0;
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  };
  const observer = new ResizeObserver(later);
  observer.observe(element);
  addEventListener("resize", later);
  // once now, before the first paint: drawn at a default size and then fitted, it would jump
  fit();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    removeEventListener("resize", later);
  };
}

// each page's holds: the height it needs for each fitted piece's minimum
const holds = new WeakMap<HTMLElement, Map<Element, number>>();

function apply(page: HTMLElement, all: Map<Element, number>): void {
  const tallest = Math.max(0, ...all.values());
  page.style.minHeight = tallest > 0 ? `${tallest}px` : "";
}

/**
 * Measures `lack`, the height `owner` lacks of its minimum, with `page` (a Page fill) at the window's height,
 * and grows the page by it, so the page scrolls rather than `owner` overlap its footer.
 */
export function hold(owner: Element, page: HTMLElement, lack: () => number): void {
  const all = holds.get(page) ?? new Map<Element, number>();
  holds.set(page, all);
  // from the window's height every time, so no earlier hold ever counts as room: no loop
  page.style.minHeight = "";
  const base = page.getBoundingClientRect().height;
  let height = base;
  // a box stopped at zero height hides part of what is missing: grow again, a few times at most
  for (let i = 0; i < 4; i++) {
    const missing = lack();
    if (missing <= 0.5) break;
    height = Math.ceil(height + missing);
    page.style.minHeight = `${height}px`;
  }
  if (height > base) all.set(owner, height);
  else all.delete(owner);
  apply(page, all);
}

/** Drops `owner`'s hold on `page`, for when it goes away or hides. */
export function release(owner: Element, page: HTMLElement): void {
  const all = holds.get(page);
  if (all?.delete(owner)) apply(page, all);
}
