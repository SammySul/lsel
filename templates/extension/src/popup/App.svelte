<script lang="ts">
import { title } from "./title";
</script>

<div class="popup">
  <h1>{title(chrome.runtime.getManifest())}</h1>
</div>

<style>
  .popup {
    width: 360px;
    padding: var(--space-4);
  }
</style>
