<!-- The line under the editors: mode, pending keys, prompt and messages, as vim's would show them. -->
<script lang="ts">
import type { BlockedReason, VimMode } from "@yank-wars/engine";
import { CHORD_LABELS } from "../lib/chords.ts";
import type { RoundController } from "../lib/round.svelte.ts";

let { ctl }: { ctl: RoundController } = $props();

const MODE: Record<VimMode, string> = {
  normal: "NORMAL",
  insert: "INSERT",
  replace: "REPLACE",
  visual: "VISUAL",
  "visual line": "VISUAL LINE",
  "visual block": "VISUAL BLOCK",
};

const BLOCKED: Record<BlockedReason, string> = {
  dead: "Dead keys are unsupported: switch to a layout without them",
  ime: "IME input is unsupported",
  meta: "Cmd/Win shortcuts are off during a round",
  fkey: "Function keys do nothing here",
  unfocused: "Click the editor to type",
};

const snap = $derived(ctl.snap);
const mode = $derived(
  snap.insertModeReturn && snap.mode === "normal" ? "(insert)" : MODE[snap.mode],
);
const message = $derived(snap.message ?? snap.error);
// Chrome on Windows/Linux closes the tab on Ctrl+W before the page can prevent it.
const hint = $derived(
  ctl.blocked !== null
    ? BLOCKED[ctl.blocked]
    : ctl.platform === "other" && snap.mode === "insert"
      ? "Ctrl+W closes the tab in Chrome"
      : null,
);
</script>

<footer class="status">
  <div class="line">
    {#if snap.prompt}
      <span class="prompt"
        >{snap.prompt.prefix}{snap.prompt.value}<span class="caret" aria-hidden="true"></span></span
      >
    {:else}
      <span class="mode mode-{snap.mode.replace(' ', '-')}">-- {mode} --</span>
      {#if snap.recording !== null}<span class="rec">recording @{snap.recording}</span>{/if}
      {#if message}<span class="message" class:error={snap.message === null}>{message}</span>{/if}
    {/if}
    <span class="spacer"></span>
    <span class="pending">{snap.prompt ? "" : snap.pending}</span>
    {#if ctl.claim === "checking"}
      <span class="claim">checking…</span>
    {:else if ctl.claim === "rejected"}
      <span class="claim rejected">the server disagrees, keep going</span>
    {:else}
      <span class="off" class:match={ctl.linesOff === 0}>
        {ctl.linesOff === 0 ? "matches" : `${ctl.linesOff} line${ctl.linesOff === 1 ? "" : "s"} off`}
      </span>
    {/if}
  </div>
  <div class="line sub">
    <span class="hint">{hint ?? ""}</span>
    <span class="spacer"></span>
    <span class="chords">
      <kbd>{CHORD_LABELS.reset}</kbd> reset · <kbd>{CHORD_LABELS.forfeit}</kbd> give up ·
      <kbd>{CHORD_LABELS.numbers}</kbd> numbers
    </span>
  </div>
</footer>

<style>
  .status {
    display: grid;
    gap: 4px;
    padding: 8px 16px;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 1.6em;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .mode {
    font-weight: 700;
    color: var(--subtle);
  }
  .mode-insert,
  .mode-replace {
    color: var(--success);
  }
  .mode-visual,
  .mode-visual-line,
  .mode-visual-block {
    color: var(--accent);
  }
  .rec {
    color: var(--error);
  }
  .message {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .message.error {
    color: var(--error);
  }
  .prompt {
    white-space: pre;
  }
  .caret {
    display: inline-block;
    width: 0.6em;
    height: 1.1em;
    vertical-align: text-bottom;
    background: var(--select);
  }
  .pending {
    color: var(--subtle);
    min-width: 6ch;
    text-align: right;
  }
  .off,
  .claim.rejected {
    color: var(--warning);
  }
  .claim {
    color: var(--subtle);
  }
  .off.match {
    color: var(--success);
  }
  .sub {
    font-family: var(--font);
    font-size: var(--text-xs);
    color: var(--subtle);
  }
  .hint {
    color: var(--warning);
  }
</style>
