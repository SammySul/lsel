import { onDestroy } from "svelte";

export interface Binding {
  /** The first key is the one shown. */
  key: string | readonly string[];
  /** Listed under `?`; unlabeled keys aren't. */
  label?: string;
  /** Also shown in the page footer. */
  hint?: boolean;
  /** `"search"`: fires in a search box too, for keys that type nothing (arrows, Enter). */
  inField?: boolean | "search";
  run(event: KeyboardEvent): void;
}

type Labeled = Binding & { label: string };
type Scope = { bindings: readonly Binding[] };

// Plain, because a teardown reads $state as it was before the update that destroys it.
const registry: Scope[] = [];
let scopes: readonly Scope[] = $state.raw([]);
let listening = false;

export const keyHelp = $state({ open: false });

const publish = () => {
  scopes = [...registry];
};

const keysOf = (b: Binding) => (typeof b.key === "string" ? [b.key] : b.key);

const NOT_TYPING = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NOT_TYPING.has(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
}

const NAMES: Record<string, string> = {
  " ": "Space",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  Escape: "Esc",
};

export const keyName = (key: string) => NAMES[key] ?? key;

/** What `?` lists: in mount order, each key once, going to the scope mounted last. */
export function activeBindings(): Labeled[] {
  const taken = new Set<string>();
  const perScope = scopes.toReversed().map((scope) =>
    scope.bindings.filter((b): b is Labeled => {
      const first = keysOf(b)[0];
      if (b.label === undefined || first === undefined || taken.has(first)) return false;
      taken.add(first);
      return true;
    }),
  );
  return perScope.toReversed().flat();
}

function leaveField(field: HTMLElement): void {
  if (field instanceof HTMLInputElement && field.type === "search" && field.value !== "") {
    field.value = "";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  } else field.blur();
}

function onkeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (keyHelp.open) {
    if (event.key === "?" || event.key === "Escape") {
      keyHelp.open = false;
      event.preventDefault();
    }
    return;
  }
  const field = isField(event.target);
  const search = event.target instanceof HTMLInputElement && event.target.type === "search";
  const reaches = (b: Binding) =>
    !field || b.inField === true || (b.inField === "search" && search && event.key.length > 1);
  for (const scope of registry.toReversed()) {
    const b = scope.bindings.find((b) => keysOf(b).includes(event.key));
    if (b === undefined || !reaches(b)) continue;
    event.preventDefault();
    b.run(event);
    return;
  }
  if (field && event.key === "Escape" && event.target instanceof HTMLElement) {
    event.preventDefault();
    leaveField(event.target);
  }
}

/** The keys a component answers while mounted; re-read when the state `bindings` reads changes. */
export function keys(bindings: () => readonly Binding[]): void {
  const scope: Scope = { bindings: [] };
  if (!listening) {
    window.addEventListener("keydown", onkeydown);
    listening = true;
  }
  registry.push(scope);
  $effect.pre(() => {
    scope.bindings = bindings();
    publish();
  });
  onDestroy(() => {
    registry.splice(registry.indexOf(scope), 1);
    publish();
  });
}
