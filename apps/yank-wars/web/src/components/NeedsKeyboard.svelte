<!-- The notice for touch-only devices and narrow windows. -->
<script lang="ts">
import { Page } from "@sammysul/lsel";
import { MIN_WIDTH } from "../lib/device.ts";
import { PAGE, TAGLINE } from "../lib/page.ts";

interface Props {
  onDismiss: () => void;
}

let { onDismiss }: Props = $props();
</script>

<Page {...PAGE} sub={TAGLINE} width={480}>
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
