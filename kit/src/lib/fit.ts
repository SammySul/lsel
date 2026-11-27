// Runs a fitted List's or Grid's measuring now and again whenever its element or the window resizes.

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
