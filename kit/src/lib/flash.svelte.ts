export const flash = $state({ text: "", error: false });

let timer: ReturnType<typeof setTimeout> | undefined;

/** A line in the status bar ("Copied"), gone after 2 s. */
export function say(text: string, { error = false } = {}): void {
  flash.text = text;
  flash.error = error;
  clearTimeout(timer);
  timer = setTimeout(() => {
    flash.text = "";
    flash.error = false;
  }, 2000);
}
