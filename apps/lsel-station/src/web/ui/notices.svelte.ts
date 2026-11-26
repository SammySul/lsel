// Short toasts for what just happened, each clearing itself.

import type { GameEvent } from "../../sim/events.ts";
import type { GameMap } from "../../sim/map.ts";
import { noticeFor } from "./notices.ts";

const SHOWN_MS = 4000;

export type Notices = ReturnType<typeof createNotices>;

/** Short toasts for what just happened. Each clears itself; none needs dismissing. */
export function createNotices(map: GameMap) {
  let list = $state.raw<readonly { id: number; text: string }[]>([]);
  let next = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    get list() {
      return list;
    },
    hear(event: GameEvent): void {
      const text = noticeFor(event, map);
      if (text === null) return;
      const id = next++;
      list = [...list, { id, text }];
      const timer = setTimeout(() => {
        timers.delete(timer);
        list = list.filter((notice) => notice.id !== id);
      }, SHOWN_MS);
      timers.add(timer);
    },
    stop(): void {
      for (const timer of timers) clearTimeout(timer);
    },
  };
}
