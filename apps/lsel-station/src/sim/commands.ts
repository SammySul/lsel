import type { ActionId } from "../content/actions.ts";
import type { CrewId } from "../content/crew.ts";
import type { GameState } from "./state.ts";

export type Command =
  | { kind: "assign"; crew: CrewId; action: ActionId }
  | { kind: "unassign"; crew: CrewId };

export function apply(state: GameState, command: Command): void {
  switch (command.kind) {
    case "assign":
      if (state.jobs[command.crew]?.action === command.action) return;
      state.jobs[command.crew] = { action: command.action, progressMs: 0 };
      return;
    case "unassign":
      delete state.jobs[command.crew];
      return;
    default: {
      const _exhaustive: never = command;
    }
  }
}
