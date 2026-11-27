<!-- Look up a public Instagram profile, preview its picture and recent posts, and download them one by one or as a zip. -->
<script lang="ts">
import { Empty, Field, go, keys, Page, route } from "@sammysul/lsel";
import { version } from "../../package.json";
import { toUsername } from "../shared/types.ts";
import ProfileView from "./components/ProfileView.svelte";

const username = $derived(toUsername(decodeURIComponent(route.path.slice(1))));

let input = $state("");
let invalid = $state<string | null>(null);
let field: HTMLInputElement | undefined = $state();
let view: ProfileView | undefined = $state();

// the field follows the address: a reload, the back button
$effect(() => {
  if (username !== null) input = username;
});

function submit(event: SubmitEvent): void {
  event.preventDefault();
  const name = toUsername(input);
  if (name === null) {
    invalid = "A username is letters, numbers, periods and underscores, up to 30.";
    return;
  }
  invalid = null;
  input = name;
  field?.blur();
  if (name === username) void view?.reload();
  else go(`/${name}`);
}

keys(() => [{ key: "/", label: "Type a username", hint: true, run: () => field?.focus() }]);
</script>

<Page
  name="grab"
  sub="A public Instagram profile's picture and newest posts, to preview and download"
  {version}
  source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/grab"
  width={1200}
>
  <form class="lookup" onsubmit={submit}>
    <Field label="Username" error={invalid}>
      {#snippet children(control)}
        <input
          {...control}
          type="search"
          bind:this={field}
          bind:value={input}
          placeholder="natgeo"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      {/snippet}
    </Field>
    <button type="submit">Look up <kbd>Enter</kbd></button>
  </form>

  {#if username === null}
    <Empty>Type a public profile's username, or paste its address, and press Enter. <kbd>/</kbd> goes to the field.</Empty>
  {:else}
    {#key username}
      <ProfileView {username} bind:this={view} />
    {/key}
  {/if}
</Page>

<style>
  .lookup {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: end;
  }
  .lookup :global(.lsel-field) {
    flex: 1 1 240px;
    max-width: 360px;
  }
</style>
