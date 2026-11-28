// Everything the web app and the server may import from the engine.

export type { Extension, Text } from "@codemirror/state";
export type { EditorView } from "@codemirror/view";
export { feedKey, type KeyResult } from "./feedKey.ts";
export {
  ACCOUNT,
  type Account,
  AccountSync,
  Best,
  type Me,
  parseAccountSync,
} from "./game/account.ts";
export {
  DAILY,
  DailyClaim,
  dailyPuzzle,
  dayOf,
  msUntilNextDay,
  parseDailyClaim,
  SCHEDULE,
} from "./game/daily.ts";
export { currentRun, type KeyLog, type LogEntry, RESET, scoreOf } from "./game/log.ts";
export {
  type ClientFrame,
  LIMITS,
  type PlayerStatus,
  type PlayerView,
  PROTOCOL,
  parseClientFrame,
  type RoomPhase,
  type RoomView,
  type RoundResult,
  type Seat,
  type ServerFrame,
} from "./game/protocol.ts";
export {
  comparePuzzles,
  DIFFICULTIES,
  type Difficulty,
  type Puzzle,
  type PuzzleJson,
  parsePuzzle,
} from "./game/puzzle.ts";
export {
  createRound,
  elapsedMs,
  ROUND,
  type RoundEvent,
  type RoundPhase,
  type RoundState,
  reduceRound,
  remainingMs,
} from "./game/round.ts";
export {
  type BlockedReason,
  type BrowserInputOptions,
  browserInput,
} from "./input/browserInput.ts";
export {
  detectPlatform,
  type KeyEventLike,
  keyFromEvent,
  type Platform,
} from "./input/keyFromEvent.ts";
export { formatKeys, isVimKey, parseKeys, type VimKey } from "./input/keys.ts";
export { languageExtension } from "./languages.ts";
export { replay, verifyRun } from "./replay.ts";
export { createSession, destroySession, type EditorSession, engineExtensions } from "./session.ts";
export { type HudState, sessionSnapshot, type VimMode } from "./snapshot.ts";
export { VIRTUAL_WINDOW_LINES } from "./vim/vimSetup.ts";
