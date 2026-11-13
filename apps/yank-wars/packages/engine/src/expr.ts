// The slice of vimscript expressions golfers put after :s's \= (:help sub-replace-expression, expression-syntax):
// numbers, strings, + - * / % and . (concat), comparisons, ?:, and a few functions.

export class ExprError extends Error {}

export interface ExprContext {
  submatch(n: number): string;
  /** line('.') and friends, 1-based */
  line(which: string): number;
  col(which: string): number;
}

type Value = number | string;

const toNum = (v: Value): number => {
  if (typeof v === "number") return v;
  const m = /^\s*([-+]?)(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)/.exec(v);
  if (!m) return 0;
  const body = m[2] as string;
  const n = /^0[xX]/.test(body)
    ? Number.parseInt(body.slice(2), 16)
    : /^0[bB]/.test(body)
      ? Number.parseInt(body.slice(2), 2)
      : Number.parseInt(body, 10);
  return m[1] === "-" ? -n : n;
};
const toStr = (v: Value): string => (typeof v === "number" ? String(v) : v);
const trunc = (n: number) => (n < 0 ? Math.ceil(n) : Math.floor(n));

function printf(fmt: string, args: Value[]): string {
  let i = 0;
  return fmt.replace(
    /%([-0 +#]*)(\d*)(?:\.(\d+))?([dsxXocS%])/g,
    (_all, flags: string, width: string, prec: string | undefined, conv: string) => {
      if (conv === "%") return "%";
      const a = args[i++] ?? "";
      let s: string;
      if (conv === "d") s = String(trunc(toNum(a)));
      else if (conv === "x") s = toNum(a).toString(16);
      else if (conv === "X") s = toNum(a).toString(16).toUpperCase();
      else if (conv === "o") s = toNum(a).toString(8);
      else if (conv === "c") s = String.fromCharCode(toNum(a));
      else s = toStr(a);
      if (prec !== undefined && (conv === "s" || conv === "S")) s = s.slice(0, Number(prec));
      const w = Number(width || 0);
      if (s.length < w) {
        if (flags.includes("-")) s = s.padEnd(w);
        else if (flags.includes("0") && conv !== "s") {
          const neg = s.startsWith("-");
          s = (neg ? "-" : "") + (neg ? s.slice(1) : s).padStart(w - (neg ? 1 : 0), "0");
        } else s = s.padStart(w);
      }
      return s;
    },
  );
}

export function evalExpr(text: string, ctx: ExprContext): string {
  let i = 0;
  const white = () => {
    while (text[i] === " " || text[i] === "\t") i++;
  };
  const eat = (s: string) => {
    white();
    if (text.startsWith(s, i)) {
      i += s.length;
      return true;
    }
    return false;
  };

  const call = (name: string, args: Value[]): Value => {
    const a = (k: number) => args[k] ?? "";
    switch (name) {
      case "submatch":
        return ctx.submatch(toNum(a(0)));
      case "line":
        return ctx.line(toStr(a(0)));
      case "col":
        return ctx.col(toStr(a(0)));
      case "printf":
        return printf(toStr(a(0)), args.slice(1));
      case "toupper":
        return toStr(a(0)).toUpperCase();
      case "tolower":
        return toStr(a(0)).toLowerCase();
      case "len":
      case "strlen":
      case "strchars":
        return [...toStr(a(0))].length;
      case "repeat":
        return toStr(a(0)).repeat(Math.max(0, toNum(a(1))));
      case "str2nr":
        return args.length > 1 ? Number.parseInt(toStr(a(0)), toNum(a(1))) || 0 : toNum(a(0));
      case "string":
        return typeof a(0) === "number" ? String(a(0)) : `'${toStr(a(0)).replaceAll("'", "''")}'`;
      case "abs":
        return Math.abs(toNum(a(0)));
      case "nr2char":
        return String.fromCodePoint(toNum(a(0)));
      case "char2nr":
        return toStr(a(0)).codePointAt(0) ?? 0;
      case "trim":
        return toStr(a(0)).trim();
      case "max":
      case "min":
        throw new ExprError(`E712: Argument of ${name}() must be a List or Dictionary`);
      default:
        throw new ExprError(`E117: Unknown function: ${name}`);
    }
  };

  const atom = (): Value => {
    white();
    const c = text[i];
    if (c === "(") {
      i++;
      const v = ternary();
      if (!eat(")")) throw new ExprError("E110: Missing ')'");
      return v;
    }
    if (c === "-" || c === "+" || c === "!") {
      i++;
      const v = atom();
      return c === "-" ? -toNum(v) : c === "+" ? toNum(v) : toNum(v) === 0 ? 1 : 0;
    }
    if (c === "'") {
      let s = "";
      i++;
      for (;;) {
        if (i >= text.length) throw new ExprError("E115: Missing quote");
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            s += "'";
            i += 2;
            continue;
          }
          i++;
          return s;
        }
        s += text[i++];
      }
    }
    if (c === '"') {
      let s = "";
      i++;
      const esc: Record<string, string> = {
        n: "\n",
        t: "\t",
        r: "\r",
        e: "\u001b",
        "\\": "\\",
        '"': '"',
      };
      for (;;) {
        if (i >= text.length) throw new ExprError("E114: Missing quote");
        const ch = text[i] as string;
        if (ch === '"') {
          i++;
          return s;
        }
        if (ch === "\\" && i + 1 < text.length) {
          const n = text[i + 1] as string;
          s += esc[n] ?? n;
          i += 2;
          continue;
        }
        s += ch;
        i++;
      }
    }
    const num = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)/.exec(text.slice(i));
    if (num) {
      i += num[0].length;
      return toNum(num[0]);
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (name && text[i + name[0].length] === "(") {
      i += name[0].length + 1;
      const args: Value[] = [];
      white();
      if (text[i] !== ")") {
        for (;;) {
          args.push(ternary());
          if (eat(",")) continue;
          break;
        }
      }
      if (!eat(")")) throw new ExprError("E116: Invalid arguments");
      return call(name[0], args);
    }
    throw new ExprError(`E15: Invalid expression: "${text.slice(i)}"`);
  };

  const term = (): Value => {
    let v = atom();
    for (;;) {
      white();
      const c = text[i];
      if (c !== "*" && c !== "/" && c !== "%") return v;
      i++;
      const r = toNum(atom());
      const l = toNum(v);
      if (c === "*") v = l * r;
      else if (r === 0)
        v = c === "/" ? (l === 0 ? -0x7fffffff : l > 0 ? 0x7fffffff : -0x7fffffff) : 0;
      else v = c === "/" ? trunc(l / r) : l % r;
    }
  };

  const sum = (): Value => {
    let v = term();
    for (;;) {
      white();
      if (text.startsWith("..", i)) {
        i += 2;
        v = toStr(v) + toStr(term());
      } else if (text[i] === "." && !/\d/.test(text[i + 1] ?? "")) {
        i++;
        v = toStr(v) + toStr(term());
      } else if (text[i] === "+" || text[i] === "-") {
        const c = text[i++];
        const r = toNum(term());
        v = c === "+" ? toNum(v) + r : toNum(v) - r;
      } else return v;
    }
  };

  const compare = (): Value => {
    const v = sum();
    white();
    const op = /^(==|!=|>=|<=|>|<)([#?]?)/.exec(text.slice(i));
    if (!op) return v;
    i += op[0].length;
    const r = sum();
    const ic = op[2] === "?";
    let a: Value = v;
    let b: Value = r;
    if (typeof a === "string" && typeof b === "string") {
      if (ic) {
        a = a.toLowerCase();
        b = b.toLowerCase();
      }
    } else {
      a = toNum(a);
      b = toNum(b);
    }
    const res = {
      "==": a === b,
      "!=": a !== b,
      ">": a > b,
      "<": a < b,
      ">=": a >= b,
      "<=": a <= b,
    }[op[1] as string];
    return res ? 1 : 0;
  };

  const logic = (): Value => {
    let v = compare();
    for (;;) {
      if (eat("&&")) v = toNum(v) !== 0 && toNum(compare()) !== 0 ? 1 : 0;
      else if (eat("||")) v = toNum(v) !== 0 || toNum(compare()) !== 0 ? 1 : 0;
      else return v;
    }
  };

  function ternary(): Value {
    const c = logic();
    if (!eat("?")) return c;
    const a = ternary();
    if (!eat(":")) throw new ExprError("E109: Missing ':' after '?'");
    const b = ternary();
    return toNum(c) !== 0 ? a : b;
  }

  const v = ternary();
  white();
  if (i < text.length) throw new ExprError(`E15: Invalid expression: "${text}"`);
  return toStr(v);
}
