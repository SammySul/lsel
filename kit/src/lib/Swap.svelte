<!-- Text that switches between known options without changing width: it is always as wide as the widest. -->
<script lang="ts">
let { text, options }: { text: string; options: readonly string[] } = $props();

const reserved = $derived([...new Set(options)].filter((o) => o !== text));
</script>

<span class="lsel-swap">
  <span>{text}</span>
  {#each reserved as option (option)}
    <span class="reserve" aria-hidden="true">{option}</span>
  {/each}
</span>

<style>
  .lsel-swap {
    display: inline-grid;
    justify-items: center;
  }
  .lsel-swap > span {
    grid-area: 1 / 1;
  }
  .reserve {
    visibility: hidden;
  }
</style>
