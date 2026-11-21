<script lang="ts">
import { Page } from "@sammysul/lsel";
import { version } from "../../../package.json";
import { MIN_WIDTH } from "../lib/device.ts";

interface Props {
  onDismiss: () => void;
}

let { onDismiss }: Props = $props();
</script>

<Page
  name="Yank Wars"
  sub="Vim golf against the clock. Fewest keys wins."
  {version}
  source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/yank-wars"
  width={480}
>
  <section class="needs-keyboard">
    <h2>Yank Wars needs a keyboard</h2>
    <p>
      It's vim golf: you play with a physical keyboard, on a screen at least {MIN_WIDTH}px wide.
      Come back on a computer.
    </p>
    <button onclick={onDismiss}>Play anyway</button>
  </section>
</Page>

<style>
  p {
    color: var(--subtle);
  }
</style>
