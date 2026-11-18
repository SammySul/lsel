import { ACTIONS } from "../../content/actions.ts";
import { CREW } from "../../content/crew.ts";
import { DEPARTMENTS } from "../../content/departments.ts";
import { MODULES, numeral } from "../../content/modules.ts";
import { UNLOCKS } from "../../content/unlocks.ts";
import type { GameEvent } from "../../sim/events.ts";

/** The short line an event is announced with, or null for the many that pass without one. */
export function noticeFor(event: GameEvent): string | null {
  switch (event.kind) {
    case "level-up":
      return `${DEPARTMENTS[event.department].name} level ${event.level}`;
    case "mastery-step":
      return `${ACTIONS[event.action].name} mastery ${event.level}`;
    case "module-built":
      return `${MODULES[event.module].name} ${numeral(event.level)} built`;
    case "unlocked":
      return `${UNLOCKS[event.unlock].name} ready`;
    case "crew-joined":
      return `${CREW[event.crew].name} joined the crew`;
    case "job-started":
    case "job-stopped":
    case "job-waiting":
    case "action-done":
    case "planted":
    case "harvested":
      return null;
    default: {
      const _exhaustive: never = event;
      return null;
    }
  }
}
