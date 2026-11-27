// The selection List and Grid share: the current item, kept in step with `selected`, a click and the item's keys.

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
  actions: readonly Action<T>[] | ((item: T) => readonly Action<T>[]);
}

export interface Selection<T> {
  readonly index: number;
  readonly current: T | undefined;
  /** Selects the item at `i`, held to the first and last. */
  select(i: number): void;
  /** A click on the item at `i` selects it and opens it if it was already selected, or `always`. */
  click(
    event: MouseEvent,
    i: number,
    open: ((item: T) => void) | undefined,
    always?: boolean,
  ): void;
  /** Enter, when there is `open`, then the selected item's actions. */
  keys(
    open: ((item: T) => void) | undefined,
    opts: { hint: boolean; inField?: "search" },
  ): Binding[];
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

  $effect(() => {
    // no items (a search matching nothing, items still loading) keeps the selection for later
    if (current === undefined) return;
    last = index;
    const { id, selected } = source();
    if (id(current) !== selected) choose(id(current));
  });

  const actions = $derived.by(() => {
    const { actions } = source();
    return current === undefined ? [] : typeof actions === "function" ? actions(current) : actions;
  });

  function select(i: number): void {
    const { items, id } = source();
    const item = items[Math.min(items.length - 1, Math.max(0, i))];
    if (item !== undefined) choose(id(item));
  }

  return {
    get index() {
      return index;
    },
    get current() {
      return current;
    },
    select,
    click(event, i, open, always = false) {
      // a control in the item does its own thing
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, input, label, select, textarea")
      )
        return;
      const item = source().items[i];
      const opens = always || i === index;
      select(i);
      if (item !== undefined && opens) open?.(item);
    },
    keys(open, { hint, inField }) {
      return [
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
        ...actions.map((a) => ({
          key: a.key,
          label: a.label,
          run: () => current !== undefined && a.run(current),
        })),
      ];
    },
  };
}
