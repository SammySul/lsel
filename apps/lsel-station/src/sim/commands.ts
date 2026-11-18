import type { ActionId } from "../content/actions.ts";
import type { CrewId } from "../content/crew.ts";
import { type GameEvent, NO_EVENTS } from "./events.ts";
import type { GameState } from "./state.ts";

export type Command =
  | { kind: "assign"; crew: CrewId; action: ActionId }
  | { kind: "unassign"; crew: CrewId };

/** Changes the game as the player asked. Returns what happened; a command that changes nothing returns nothing. */
export function apply(state: GameState, command: Command): readonly GameEvent[] {
  switch (command.kind) {
    case "assign":
      if (state.jobs[command.crew]?.action === command.action) return NO_EVENTS;
      state.jobs[command.crew] = { action: command.action, progressMs: 0 };
      return [{ kind: "job-started", crew: command.crew, action: command.action }];
    case "unassign":
      if (state.jobs[command.crew] === undefined) return NO_EVENTS;
      delete state.jobs[command.crew];
      return [{ kind: "job-stopped", crew: command.crew }];
    default: {
      const _exhaustive: never = command;
      return NO_EVENTS;
    }
  }
}
