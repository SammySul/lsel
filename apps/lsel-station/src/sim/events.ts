import type { ActionId } from "../content/actions.ts";
import type { CrewId } from "../content/crew.ts";
import type { DepartmentId } from "../content/departments.ts";
import type { ModuleId } from "../content/modules.ts";

/** What a tick or a command made happen, for whoever shows or sounds it. The state never depends on these. */
export type GameEvent =
  | { readonly kind: "job-started"; readonly crew: CrewId; readonly action: ActionId }
  | { readonly kind: "job-stopped"; readonly crew: CrewId }
  | { readonly kind: "job-waiting"; readonly crew: CrewId; readonly action: ActionId }
  | { readonly kind: "action-done"; readonly crew: CrewId; readonly action: ActionId }
  | { readonly kind: "level-up"; readonly department: DepartmentId; readonly level: number }
  | { readonly kind: "mastery-step"; readonly action: ActionId; readonly level: number }
  | { readonly kind: "module-built"; readonly module: ModuleId; readonly level: number }
  | { readonly kind: "crew-joined"; readonly crew: CrewId };

export const NO_EVENTS: readonly GameEvent[] = [];
