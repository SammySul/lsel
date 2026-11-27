// The selection and paging List and Grid share: the current item kept in step with `selected`, its page, a click and the keys every one has.

import type { Binding } from "./keys.svelte.ts";

/** A key for the selected item. */
export interface Action<T> {
  key: string;
  label: string;
  run(item: T): void;
}

interface Source<T> {
  items: readonly T[];
  id: (item: T) => string;
  selected: string | undefined;
  actions: readonly Action<T>[];
  /** Items per page. */
  size: number;
  /** Enter, or a click on the selected item. */
  open: ((item: T) => void) | undefined;
  /** Any item clicked opens at once. */
  openOnClick: boolean;
}

interface Keys {
  hint: boolean;
  /** The component's own movement keys, listed first. */
  move: readonly Binding[];
  /** The keys that turn the page; the first is the one shown. */
  next: readonly string[];
  previous: readonly string[];
  /** Enter also opens from a search box. */
  inField?: "search";
}

export interface Selection<T> {
  readonly index: number;
  readonly current: T | undefined;
  readonly pages: number;
  readonly page: number;
  /** Where the current page starts in the items. */
  readonly start: number;
  /** The current page's items. */
  readonly visible: readonly T[];
  /** Selects the item at `i`, held to the first and last. */
  select(i: number): void;
  /** Moves the selection a page on (1) or back (-1). */
  turn(by: 1 | -1): void;
  /** A click on the visible item at `i`: selects it, and opens it if it was already selected or `openOnClick`. */
  click(event: MouseEvent, i: number): void;
  /** The movement keys, g and G, the page keys, Enter and the selected item's actions; none without items. */
  keys(opts: Keys): Binding[];
}

/** Call in a component's script: `source` reads its props, `choose` writes its bound `selected`. */
export function selection<T>(source: () => Source<T>, choose: (id: string) => void): Selection<T> {
  // where the selection was, so an item that goes away hands it to its neighbor, not the first
  let last = 0;
  const index = $derived.by(() => {
    const { items, id, selected } = source();
    const found = items.findIndex((item) => id(item) === selected);
    return found !== -1 ? found : Math.min(last, Math.max(0, items.length - 1));
  });
  const current = $derived(source().items[index]);
  const size = $derived(source().size);
  const pages = $derived(Math.max(1, Math.ceil(source().items.length / size)));
  const page = $derived(Math.floor(index / size));
  const start = $derived(page * size);
  const visible = $derived(source().items.slice(start, start + size));

  $effect(() => {
    // no items (a search matching nothing, items still loading) keeps the selection for later
    if (current === undefined) return;
    last = index;
    const { id, selected } = source();
    if (id(current) !== selected) choose(id(current));
  });

  function select(i: number): void {
    const { items, id } = source();
    const item = items[Math.min(items.length - 1, Math.max(0, i))];
    if (item !== undefined) choose(id(item));
  }

  const turn = (by: 1 | -1) => select(index + by * size);

  return {
    get index() {
      return index;
    },
    get current() {
      return current;
    },
    get pages() {
      return pages;
    },
    get page() {
      return page;
    },
    get start() {
      return start;
    },
    get visible() {
      return visible;
    },
    select,
    turn,
    click(event, i) {
      // a control in the item does its own thing
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, input, label, select, textarea")
      )
        return;
      const { items, open, openOnClick } = source();
      const item = items[start + i];
      const opens = openOnClick || start + i === index;
      select(start + i);
      if (item !== undefined && opens) open?.(item);
    },
    keys({ hint, move, next, previous, inField }) {
      const { items, actions, open } = source();
      if (items.length === 0) return [];
      return [
        ...move,
        { key: "g", label: "First", run: () => select(0) },
        { key: "G", label: "Last", run: () => select(items.length - 1) },
        ...(pages > 1
          ? [
              { key: next, label: "Next page", hint, run: () => turn(1) },
              { key: previous, label: "Previous page", run: () => turn(-1) },
            ]
          : []),
        ...(open
          ? [
              {
                key: "Enter",
                label: "Open",
                hint,
                inField,
                run: () => current !== undefined && open(current),
              },
            ]
          : []),
        ...(current === undefined ? [] : actions).map((a) => ({
          key: a.key,
          label: a.label,
          run: () => current !== undefined && a.run(current),
        })),
      ];
    },
  };
}
