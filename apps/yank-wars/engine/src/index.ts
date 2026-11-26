export type { Extension, Text } from "@codemirror/state";
export type { EditorView } from "@codemirror/view";
export { type BlockedReason, type BrowserInputOptions, browserInput } from "./browserInput.ts";
export { feedKey, type KeyResult } from "./feedKey.ts";
export { detectPlatform, type KeyEventLike, keyFromEvent, type Platform } from "./keyFromEvent.ts";
export { formatKeys, isVimKey, parseKeys, type VimKey } from "./keys.ts";
export { languageExtension } from "./languages.ts";
export { currentRun, type KeyLog, type LogEntry, RESET, scoreOf } from "./log.ts";
export {
  comparePuzzles,
  DIFFICULTIES,
  type Difficulty,
  type Puzzle,
  type PuzzleJson,
  parsePuzzle,
} from "./puzzle.ts";
export { replay, verifyRun } from "./replay.ts";
export {
  createRound,
  elapsedMs,
  type RoundEvent,
  type RoundPhase,
  type RoundState,
  reduceRound,
  remainingMs,
} from "./round.ts";
export { createSession, destroySession, type EditorSession, engineExtensions } from "./session.ts";
export { type HudState, sessionSnapshot, type VimMode } from "./snapshot.ts";
export { VIRTUAL_WINDOW_LINES } from "./vimSetup.ts";
