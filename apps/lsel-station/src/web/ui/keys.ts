/** An Enter binding that leaves a focused button its own Enter: keys() would take it. */
export const enterOr =
  (run: () => void) =>
  (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLButtonElement) event.target.click();
    else run();
  };
