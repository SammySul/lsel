<script lang="ts">
import { name, version } from "../../package.json";
</script>

<main class="lsel-appear">
  <h1>{name}</h1>
  <p>v{version}</p>
</main>

<style>
  main {
    max-width: 720px;
    padding: var(--space-6) var(--space-4);
  }
</style>
