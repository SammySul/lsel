<!-- The new app's only page: one answer from the API, its waiting and failing in Status. -->
<script lang="ts">
import { Page, resource, Status, when } from "@sammysul/lsel";
import { name, version } from "../../package.json";
import { fetchHello } from "./lib/api.ts";

const hello = resource((signal) => fetchHello(signal));
</script>

<Page {name} {version}>
  <Status of={hello} waiting="Asking the server…" />
  <!-- its line is there from the start, so the answer arriving moves nothing -->
  <p class="answer">
    {#if hello.value}{hello.value.greeting}, {when(new Date(hello.value.at))}.{/if}
  </p>
</Page>

<style>
  .answer {
    min-height: 1lh;
    margin: 0;
  }
</style>
