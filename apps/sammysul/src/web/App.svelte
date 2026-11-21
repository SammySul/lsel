<script lang="ts">
import { List, Page } from "@sammysul/lsel";
import { name, version } from "../../package.json";
import { type Project, projects } from "./projects.ts";

let selected: string | undefined = $state();

function open(project: Project): void {
  location.assign(project.url);
}
</script>

<Page
  {name}
  sub="Things I've built, and where they run."
  {version}
  source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/sammysul"
>
  <List items={projects} id={(p) => p.name} bind:selected label="Projects" onopen={open} hint>
    {#snippet row(project)}
      <span class="project">
        <a href={project.url}>{project.name}</a>
        <span class="what">{project.what}</span>
      </span>
    {/snippet}
    {#snippet empty()}Nothing here yet.{/snippet}
  </List>
</Page>

<style>
  .project {
    display: grid;
    grid-template-columns: 14ch 1fr;
  }
  .what {
    color: var(--subtle);
  }
  @media (max-width: 40rem) {
    .project {
      grid-template-columns: 1fr;
    }
  }
</style>
