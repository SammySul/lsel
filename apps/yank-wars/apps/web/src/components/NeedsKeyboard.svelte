<script lang="ts">
import { MIN_WIDTH } from "../lib/device.ts";

interface Props {
  onDismiss: () => void;
}

let { onDismiss }: Props = $props();
</script>

<main class="needs-keyboard">
  <img src="/favicon.svg" alt="" width="64" height="64" />
  <h1>Yank Wars needs a keyboard</h1>
  <p>
    It's vim golf: you play with a physical keyboard, on a screen at least {MIN_WIDTH}px wide.
    Come back on a computer.
  </p>
  <button onclick={onDismiss}>Play anyway</button>
</main>

<style>
  .needs-keyboard {
    max-width: 420px;
    margin: 0 auto;
    padding: 64px 24px;
    text-align: center;
  }
  h1 {
    margin: 24px 0 12px;
  }
  p {
    color: var(--subtle);
    line-height: 1.5;
  }
  button {
    margin-top: 16px;
  }
</style>
