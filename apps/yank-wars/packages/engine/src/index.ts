export type { Extension, Text } from "@codemirror/state";
export type { EditorView } from "@codemirror/view";
export { type BlockedReason, type BrowserInputOptions, browserInput } from "./browserInput.ts";
export { feedKey, type KeyResult } from "./feedKey.ts";
export { type UndoClock, undoHistory } from "./history.ts";
export {
  INSERT_LITERALS,
  insertCommands,
  insertKeymap,
  literalOf,
  recordInsertKey,
} from "./insertKeys.ts";
export { detectPlatform, type KeyEventLike, keyFromEvent, type Platform } from "./keyFromEvent.ts";
export {
  formatKeys,
  isVimKey,
  KeyNotationError,
  keyToDomKey,
  NAMED_KEYS,
  parseKeys,
  type SyntheticKeyInit,
  toCoreKey,
  type VimKey,
} from "./keys.ts";
export { languageExtension } from "./languages.ts";
export {
  currentRun,
  isReset,
  type KeyLog,
  type LogEntry,
  RESET,
  type ResetMarker,
  runs,
  scoreOf,
} from "./log.ts";
export {
  installPrompt,
  type PromptHandler,
  type PromptState,
  routePromptKey,
  type SyntheticPromptEvent,
} from "./prompt.ts";
export {
  type LanguageId,
  PUZZLE_LIMITS,
  type Puzzle,
  PuzzleError,
  type PuzzleJson,
  PuzzleJsonSchema,
  type PuzzleSource,
  parsePuzzle,
} from "./puzzle.ts";
export { type ReplayOptions, type ReplayResult, replay, verifyRun } from "./replay.ts";
export {
  createRound,
  elapsedMs,
  ROUND,
  type RoundConfig,
  type RoundEvent,
  type RoundPhase,
  type RoundState,
  reduceRound,
  remainingMs,
} from "./round.ts";
export {
  createSession,
  destroySession,
  type EditorSession,
  engineExtensions,
  type SessionOptions,
} from "./session.ts";
export { type HudState, sessionSnapshot, type VimMode } from "./snapshot.ts";
export { applyEngineOptions, lockEngine, VIRTUAL_WINDOW_LINES } from "./vimSetup.ts";
