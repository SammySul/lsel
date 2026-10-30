// Spike: can codemirror-vim replay a key log without a browser? Needs @codemirror/{state,view,commands}, @replit/codemirror-vim, happy-dom.

import { Window } from "happy-dom";
const w = new Window();
for (const k of ["Window","Element","Range","Text","DocumentFragment","ResizeObserver","IntersectionObserver","document","navigator","MutationObserver","requestAnimationFrame","getComputedStyle","Node","HTMLElement","KeyboardEvent"]) (globalThis as any)[k] ??= (w as any)[k];
(globalThis as any).window = w;
const { EditorView } = await import("@codemirror/view");
const { EditorState } = await import("@codemirror/state");
const { vim, Vim, getCM } = await import("@replit/codemirror-vim");
const { history } = await import("@codemirror/commands");
const GROUP = Number(process.env.GROUP ?? 500);

function replay(start: string, keys: string[]) {
  (Vim as any).resetVimGlobalState_?.();
  const view = new EditorView({ state: EditorState.create({ doc: start, extensions: [vim(), EditorState.allowMultipleSelections.of(true), history({ newGroupDelay: GROUP })] }), parent: document.body as any });
  const cm: any = getCM(view)!;
  const origFindPosV = cm.findPosV.bind(cm);
  cm.findPosV = (start: any, amount: number, unit: string, goal?: number) => unit !== "line" ? origFindPosV(start, amount, unit, goal)
    : { line: Math.min(Math.max(start.line + amount, 0), view.state.doc.lines - 1), ch: start.ch };
  let prompt: null | { value: string; onClose?: (v: string) => void } = null;
  cm.openDialog = (_t: any, onClose: any, opts: any) => { if (!opts?.onKeyDown && !opts?.onKeyUp) return () => {}; prompt = { value: opts?.value ?? "", onClose }; return () => { prompt = null; }; };
  const lit: Record<string, string> = { "<Space>": " ", "<CR>": "\n", "<lt>": "<", "<Tab>": "\t" };
  for (const k of keys) {
    if (prompt) {
      if (k === "<CR>") { const p = prompt; prompt = null; p.onClose?.(p.value); }
      else if (k === "<Esc>") prompt = null;
      else if (k === "<BS>") prompt.value = prompt.value.slice(0, -1);
      else prompt.value += lit[k] ?? k;
      continue;
    }
    const handled = Vim.handleKey(cm, k, "user");
    if (!handled && cm.state.vim?.insertMode) {
      if (k === "<BS>") view.dispatch({ changes: { from: Math.max(0, view.state.selection.main.head - 1), to: view.state.selection.main.head } });
      else cm.replaceSelection(lit[k] ?? k);
    }
  }
  const out = view.state.doc.toString(); view.destroy(); return out;
}
const split = (s: string) => s.match(/<[^>]+>|./gs)!;
const cases: [string, string, string][] = [
  ["foo bar\nfoo baz\nqux foo", ":%s/foo/X/g<CR>", "X bar\nX baz\nqux X"],
  ["a\nb\nc", "qaA,<Esc>jq2@a", "a,\nb,\nc,"],
  ["a1\na2\na3", "qqcwb<Esc>jq@q@@", "b\nb\nb"],
  ["f(x, y)", "fxdiwiZ<Esc>", "f(Z, y)"],
  ["one\ntwo\nthree", "ddp.u", "two\none\nthree"],
  ["one", "ihello <Esc>u", "one"],
  ["one", "ihello <Esc>..u", "hellohello  one"],
  ["c\na\nb", ":sort<CR>", "a\nb\nc"],
  ["x1\ny\nx2", ":g/x/d<CR>", "y"],
  ["ab\ncd", "<C-v>jIZ<Esc>", "Zab\nZcd"],
  ["let a = 1\nlet bb = 2", "qqf=i<Space><Esc>jq@q", "let a  = 1\nlet bb  = 2"],
  ["  a\n    bb\nc", "jjkk$jx", "  a\n    b\nc"],
  ["1\n2\n3\n4\n5", "jqqddjq3@q", "1\n3\n5"],
  ["x", "3ox<Esc>", "x\nx\nx\nx"],
  ["a b c", "wcwB<Esc>w.", "a B B"],
  ["hello", "ciwbye<Esc>", "bye"],
  ["a foo b\nfoo", "/foo<CR>x", "a oo b\nfoo"],
  ["x\nx\nx", "qwA!<Esc>jq:2,3norm @w<CR>", "x!\nx!\nx!"],
  // last: crashes and poisons the shared global state for every later case
  ["a\nb\nc", "qaqqaA,<Esc>j@aq@a", "a,\nb,\nc,"],
];
let pass = 0;
for (const [s, k, want] of cases) { let got: string; try { got = replay(s, split(k)); } catch (e) { got = `CRASH ${(e as Error).name}`; } const ok = got === want; pass += +ok; console.log(ok ? "PASS" : "FAIL", k, ok ? "" : JSON.stringify(got)); }
console.log(`${pass}/${cases.length}`);
