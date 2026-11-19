<script lang="ts">
import { Empty, Popup } from "@sammysul/lsel";

const { name } = chrome.runtime.getManifest();
</script>

<Popup {name}>
  <Empty>Nothing here yet.</Empty>
</Popup>

<style>
  :global(body) {
    width: 360px;
  }
</style>
