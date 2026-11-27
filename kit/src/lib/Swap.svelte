<!-- Text that switches between known options without changing width: it is always as wide as the widest. -->
<script lang="ts">
interface Props {
  text: string;
  options: readonly string[];
  /** Where a shorter text sits in the widest's width; a label that changes by itself sits at the start. */
  align?: "start" | "center" | "end";
}

let { text, options, align = "center" }: Props = $props();

const reserved = $derived([...new Set(options)].filter((o) => o !== text));
</script>

<!-- drawn from an attribute, so the reserved labels are in neither textContent nor the accessible name; one line, so no space joins its text -->
<span class="lsel-swap" style:justify-items={align}><span>{text}</span>{#each reserved as option (option)}<span class="reserve" data-text={option} aria-hidden="true"></span>{/each}</span>

<style>
  .lsel-swap {
    display: inline-grid;
  }
  .lsel-swap > span {
    grid-area: 1 / 1;
  }
  .reserve {
    visibility: hidden;
  }
  /* an empty text still has a line, so the swap keeps its baseline and its line's height */
  .lsel-swap > :first-child:empty::before {
    content: "\200b";
    content: "\200b" / "";
  }
  /* the first for an engine without alt text; the second gives the reserve none */
  .reserve::after {
    content: attr(data-text);
    content: attr(data-text) / "";
  }
</style>
