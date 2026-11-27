<!-- Look up a public Instagram profile, preview its picture and recent posts, and download them one by one or as a zip. -->
<script lang="ts">
import { Empty, Field, go, keys, Page, persisted, route } from "@sammysul/lsel";
import * as v from "valibot";
import { version } from "../../package.json";
import { safeDecode, toUsername, USERNAME } from "../shared/types.ts";
import ProfileView from "./components/ProfileView.svelte";

const username = $derived(toUsername(safeDecode(route.path.slice(1)) ?? ""));

let input = $state("");
let invalid = $state<string | null>(null);
let field: HTMLInputElement | undefined = $state();
let view: ProfileView | undefined = $state();

// the last few profiles that loaded, newest first, one key each
const RECENT = 5;
const recent = persisted("grab:recent", v.array(v.pipe(v.string(), v.regex(USERNAME))), []);
const remember = (name: string) => {
  recent.value = [name, ...recent.value.filter((n) => n !== name)].slice(0, RECENT);
};

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

keys(() => [
  { key: "/", label: "Type a username", hint: true, run: () => field?.focus() },
  ...recent.value.map((name, i) => ({
    key: String(i + 1),
    label: `Open ${name}`,
    run: () => go(`/${name}`),
  })),
]);
</script>

<Page
  name="grab"
  sub="A public Instagram profile's picture and newest posts, to preview and download"
  {version}
  source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/grab"
  width={1200}
  fill
>
  <form class="lookup" onsubmit={submit}>
    <div class="name">
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
    </div>
    <button type="submit">Look up <kbd>Enter</kbd></button>
    <!-- always a button high, so the first profile remembered never moves the page -->
    <nav class="recent" aria-label="Recent profiles">
      {#each recent.value as name, i (name)}
        <button type="button" aria-pressed={name === username} onclick={() => go(`/${name}`)}
          >{name} <kbd>{i + 1}</kbd></button
        >
      {:else}
        <span class="none">Profiles you open come back here, on 1 to {RECENT}.</span>
      {/each}
    </nav>
  </form>

  {#if username === null}
    <Empty>Type a public profile's username, or paste its address, and press Enter. <kbd>/</kbd> goes to the field.</Empty>
  {:else}
    {#key username}
      <ProfileView {username} bind:this={view} onfound={remember} />
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
  .name {
    flex: 1 1 240px;
    max-width: 360px;
  }
  /* the padding keeps focus outlines unclipped; the margin takes it back, so the row stays where it was */
  .recent {
    box-sizing: content-box;
    display: flex;
    flex: 1 1 100%;
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
    min-height: var(--control-height);
    margin: calc(-1 * var(--space-1));
    padding: var(--space-1);
    overflow: hidden;
    white-space: nowrap;
  }
  .none {
    overflow: hidden;
    color: var(--subtle);
    text-overflow: ellipsis;
  }
  /* beside the field on a wide window, a line of its own on a narrow one */
  @media (min-width: 801px) {
    .recent {
      flex-basis: 0;
    }
  }
</style>
