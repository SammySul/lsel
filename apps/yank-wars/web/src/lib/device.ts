// Whether this device can play: a physical keyboard and room for two panes.

export const MIN_WIDTH = 720;

/** Touch-only devices and narrow windows can't play: the game is a physical keyboard and two panes side by side. */
export function needsKeyboardNotice(anyFinePointer: boolean, width: number): boolean {
  return !anyFinePointer || width < MIN_WIDTH;
}
