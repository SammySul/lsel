<!-- A fitted List's or Grid's pager row: the detail line, the page buttons and which page of how many. -->
<script lang="ts">
import type { Snippet } from "svelte";
import { keyName } from "./keys.svelte.ts";

interface Props {
  page: number;
  pages: number;
  /** The keys shown on the buttons. */
  previous: string;
  next: string;
  onprevious: () => void;
  onnext: () => void;
  foot?: Snippet | undefined;
}

let { page, pages, previous, next, onprevious, onnext, foot }: Props = $props();
</script>

<div class="pager" class:detail={foot !== undefined}>
  <div class="foot">{#if foot}{@render foot()}{/if}</div>
  <button type="button" disabled={page === 0} onclick={onprevious}
    >‹ <kbd>{keyName(previous)}</kbd></button
  >
  <span>Page {page + 1} of {pages}</span>
  <button type="button" disabled={page >= pages - 1} onclick={onnext}
    ><kbd>{keyName(next)}</kbd> ›</button
  >
</div>

<style>
  .pager {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    padding-top: var(--space-2);
    color: var(--subtle);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .foot {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* as wide as "Page 10 of 10", so a growing count never moves the button before it */
  .pager > span {
    min-width: 11ch;
    text-align: center;
  }
  /* on a phone the detail gets its own line, always there, so the pager keeps one height */
  @media (max-width: 600px) {
    .detail {
      flex-wrap: wrap;
      justify-content: flex-end;
      row-gap: var(--space-1);
    }
    .detail .foot {
      flex-basis: 100%;
      min-height: 1lh;
    }
  }
</style>
