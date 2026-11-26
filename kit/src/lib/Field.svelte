<!-- A labeled form control with its error. -->
<script lang="ts">
import type { Snippet } from "svelte";

interface Control {
  id: string;
  "aria-invalid": "true" | undefined;
  "aria-describedby": string | undefined;
}

interface Props {
  label: string;
  /** Why the value is refused; check on blur or submit, never while typing (DESIGN.md). */
  error?: string | null;
  /** Spread onto the input, select or textarea: `{#snippet children(control)}<input {...control} />{/snippet}`. */
  children: Snippet<[Control]>;
}

let { label, error = null, children }: Props = $props();

const id = $props.id();
const control = $derived<Control>({
  id: `${id}-control`,
  "aria-invalid": error ? "true" : undefined,
  "aria-describedby": error ? `${id}-error` : undefined,
});
</script>

<div class="lsel-field">
  <label for={control.id}>{label}</label>
  {@render children(control)}
  {#if error}<p id="{id}-error" class="error lsel-appear">{error}</p>{/if}
</div>

<style>
  .lsel-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  label {
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .error {
    margin: 0;
    color: var(--error);
    font-size: var(--text-xs);
  }
</style>
