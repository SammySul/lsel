export type VimKey = string & { readonly __brand: "VimKey" };

export class KeyNotationError extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(message);
    this.name = "KeyNotationError";
  }
}

export const NAMED_KEYS: ReadonlySet<string> = new Set([
  "Esc",
  "CR",
  "BS",
  "Del",
  "Tab",
  "Space",
  "Ins",
  "Left",
  "Right",
  "Up",
  "Down",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "lt",
]);

const CANONICAL_NAME = new Map([...NAMED_KEYS].map((n) => [n.toLowerCase(), n]));

// Bare whitespace/control code points have a named spelling (<Space>, <CR>, <Tab>); one key, one spelling.
const NOT_A_CHAR = /^[\p{Cc}\p{Cs} ]$/u;

// ">" is a key of its own (>>, V>); only "<" needs <lt>, since it opens a <...> token.
function isChar(s: string): boolean {
  return [...s].length === 1 && s !== "<" && !NOT_A_CHAR.test(s);
}

interface Parts {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  base: string;
}

function parseBracket(inner: string, ignoreCase: boolean): Parts | undefined {
  const m = (
    ignoreCase ? /^(?:([cC])-)?(?:([aA])-)?(?:([sS])-)?(.+)$/su : /^(C-)?(A-)?(S-)?(.+)$/su
  ).exec(inner);
  if (!m) return undefined;
  const ctrl = m[1] !== undefined;
  const alt = m[2] !== undefined;
  const shift = m[3] !== undefined;
  const rest = m[4] ?? "";
  const name = ignoreCase
    ? CANONICAL_NAME.get(rest.toLowerCase())
    : NAMED_KEYS.has(rest)
      ? rest
      : undefined;
  if (name !== undefined) {
    if (name === "lt" && (ctrl || alt || shift)) return undefined;
    return { ctrl, alt, shift, base: name };
  }
  if (!isChar(rest)) return undefined;
  // A lone character is written bare; Shift on a character is already in the character (A, not <S-a>).
  if (!ctrl && !alt) return undefined;
  return { ctrl, alt, shift, base: rest };
}

function format(p: Parts): string {
  return `<${p.ctrl ? "C-" : ""}${p.alt ? "A-" : ""}${p.shift ? "S-" : ""}${p.base}>`;
}

export function isVimKey(s: string): s is VimKey {
  if (isChar(s)) return true;
  if (s.length < 3 || !s.startsWith("<") || !s.endsWith(">")) return false;
  const inner = s.slice(1, -1);
  if (inner.includes("<") || inner.includes(">")) return false;
  return parseBracket(inner, false) !== undefined;
}

export function parseKeys(notation: string): VimKey[] {
  const keys: VimKey[] = [];
  for (const m of notation.matchAll(/<[^<>]+>|[\s\S]/gu)) {
    const tok = m[0];
    const at = m.index;
    if (tok === "<") throw new KeyNotationError(`bare "<" at ${at}: write <lt>`, at);
    if (tok === " ") {
      keys.push("<Space>" as VimKey);
      continue;
    }
    if (tok.length > 1 && tok.startsWith("<")) {
      const p = parseBracket(tok.slice(1, -1), true);
      if (p === undefined) throw new KeyNotationError(`invalid key ${tok} at ${at}`, at);
      keys.push(format(p) as VimKey);
      continue;
    }
    if (!isChar(tok)) {
      throw new KeyNotationError(`invalid key ${JSON.stringify(tok)} at ${at}: use its <Name>`, at);
    }
    keys.push(tok as VimKey);
  }
  return keys;
}

export function formatKeys(keys: readonly (VimKey | "<Reset>")[]): string {
  return keys.join("");
}

export function toCoreKey(k: VimKey): string {
  return k === "<lt>" ? "<" : k;
}

export interface SyntheticKeyInit {
  key: string;
  keyCode: number;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: false;
  shiftKey: boolean;
}

const DOM_KEY: Readonly<Record<string, readonly [string, number]>> = {
  CR: ["Enter", 13],
  Esc: ["Escape", 27],
  BS: ["Backspace", 8],
  Del: ["Delete", 46],
  Tab: ["Tab", 9],
  Space: [" ", 32],
  Ins: ["Insert", 45],
  Left: ["ArrowLeft", 37],
  Up: ["ArrowUp", 38],
  Right: ["ArrowRight", 39],
  Down: ["ArrowDown", 40],
  Home: ["Home", 36],
  End: ["End", 35],
  PageUp: ["PageUp", 33],
  PageDown: ["PageDown", 34],
  lt: ["<", 0],
};

export function keyToDomKey(key: VimKey): SyntheticKeyInit {
  const p: Parts = isChar(key)
    ? { ctrl: false, alt: false, shift: false, base: key }
    : (parseBracket(key.slice(1, -1), false) ?? {
        ctrl: false,
        alt: false,
        shift: false,
        base: key,
      });
  const [domKey, keyCode] = DOM_KEY[p.base] ?? [p.base, 0];
  return {
    key: domKey,
    keyCode,
    ctrlKey: p.ctrl,
    altKey: p.alt,
    metaKey: false,
    shiftKey: p.shift,
  };
}
