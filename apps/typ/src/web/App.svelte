<!-- Compare fonts, from files or installed ones, on a sample text you type. -->
<script lang="ts">
import { Action, keys, List, Page } from "@sammysul/lsel";
import { untrack } from "svelte";
import { version } from "../../package.json";
import InstalledFonts from "./components/InstalledFonts.svelte";
import Preview from "./components/Preview.svelte";
import {
  addFile,
  fontName,
  loadLocal,
  localFontsSupported,
  NotAFont,
  remove,
  type Stored,
} from "./lib/fonts.ts";
import { prefs } from "./lib/prefs.ts";

/** `stored` is null when this browser's storage can't be opened. */
const props: { stored: Stored | null } = $props();
// read once: from here on the list is the app's own
const stored = untrack(() => props.stored);

interface Font {
  name: string;
  /** Files are kept in this browser; installed fonts only for this visit. */
  kept: boolean;
  /** False for a saved file the browser can't load: listed only so it can be removed. */
  readable: boolean;
}

let fonts: Font[] = $state([
  ...(stored?.loaded ?? []).map((name) => ({ name, kept: true, readable: true })),
  ...(stored?.failed ?? []).map((name) => ({ name, kept: true, readable: false })),
]);
let problems: string[] = $state(
  stored === null
    ? ["This browser's storage is not available, so fonts can't be kept."]
    : stored.removed.map((name) => `${name} held no font file, so it was removed.`),
);
let fileInput: HTMLInputElement | undefined = $state();
let selected: string | undefined = $state();
const current = $derived(fonts.find((f) => f.name === selected));
// the installed fonts stand in for Your fonts while open: one fitted list on the screen
let installing = $state(false);

const shown = $derived(
  fonts.filter((f) => f.readable && !prefs.value.hidden.includes(f.name)).map((f) => f.name),
);

function unhide(name: string) {
  prefs.value.hidden = prefs.value.hidden.filter((h) => h !== name);
}

async function addFiles(files: FileList | null) {
  const found: string[] = [];
  for (const file of files ?? []) {
    const name = fontName(file);
    if (fonts.some((f) => f.name === name)) {
      found.push(`${name} is already in the list.`);
      continue;
    }
    let kept = true;
    try {
      await addFile(file);
    } catch (e) {
      if (e instanceof NotAFont) {
        found.push(`${file.name} could not be read as a font.`);
        continue;
      }
      kept = false;
      found.push(`${name} is shown for this visit only: the browser didn't let typ keep it.`);
    }
    fonts = [...fonts, { name, kept, readable: true }];
    unhide(name);
  }
  problems = found;
  if (fileInput) fileInput.value = "";
}

async function addInstalled(family: string) {
  if (fonts.some((f) => f.name === family)) {
    unhide(family);
    return;
  }
  try {
    await loadLocal(family);
    fonts = [...fonts, { name: family, kept: false, readable: true }];
    unhide(family);
    problems = [];
  } catch {
    problems = [`${family} could not be loaded.`];
  }
}

async function drop(font: Font) {
  try {
    if (font.kept) await remove(font.name);
  } catch {
    problems = [`${font.name} could not be removed from this browser's storage.`];
    return;
  }
  fonts = fonts.filter((f) => f !== font);
  unhide(font.name);
}

function toggle(name: string) {
  const { hidden } = prefs.value;
  prefs.value.hidden = hidden.includes(name) ? hidden.filter((h) => h !== name) : [...hidden, name];
}

keys(() => [
  ...(localFontsSupported()
    ? [{ key: "i", label: "Installed fonts", run: () => (installing = !installing) }]
    : []),
  ...(localFontsSupported() && !installing
    ? [{ key: "/", label: "Search installed fonts", run: () => (installing = true) }]
    : []),
]);
</script>

<Page
  name="typ"
  sub="Compare fonts side by side on your own text"
  {version}
  source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/typ"
  width={1600}
>

  <div class="layout">
    <aside aria-label="Fonts">
      <div class="add">
        <Action label="Add font files" key="a" hint run={() => fileInput?.click()} />
        <input
          bind:this={fileInput}
          class="file"
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          multiple
          tabindex="-1"
          aria-label="Font files"
          onchange={(e) => addFiles(e.currentTarget.files)}
        />
        {#if localFontsSupported()}
          <button type="button" aria-pressed={installing} onclick={() => (installing = !installing)}
            >Installed fonts <kbd>i</kbd></button
          >
        {/if}
      </div>

      {#if problems.length > 0}
        <ul class="problems lsel-appear" role="alert">
          {#each problems as p (p)}<li>{p}</li>{/each}
        </ul>
      {/if}

      {#if installing}
        <InstalledFonts onpick={addInstalled} onclose={() => (installing = false)} />
      {:else}
        <List
          items={fonts}
          id={(f) => f.name}
          bind:selected
          label="Your fonts"
          fit
          actions={[
            { key: "x", label: "Tick or untick", run: (f: Font) => f.readable && toggle(f.name) },
            { key: "Delete", label: "Remove", run: (f: Font) => void drop(f) },
          ]}
        >
          {#snippet row(font)}
            <div class="font">
              {#if font.readable}
                <label>
                  <input
                    type="checkbox"
                    checked={!prefs.value.hidden.includes(font.name)}
                    onchange={() => toggle(font.name)}
                  />
                  <span class="name">{font.name}</span>
                </label>
              {:else}
                <span class="name unreadable">{font.name}</span>
              {/if}
              <button onclick={() => drop(font)} aria-label="Remove {font.name}">Remove</button>
            </div>
          {/snippet}
          {#snippet empty()}<span class="empty">No fonts yet. Add some with <kbd>a</kbd>.</span>{/snippet}
          {#snippet foot()}
            {#if current?.readable === false}
              <span class="unreadable">Can't be read</span>
            {:else if current?.kept === false}
              Installed
            {/if}
          {/snippet}
        </List>
      {/if}
    </aside>

    <Preview names={shown} />
  </div>

</Page>

<style>
  .layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: var(--space-5);
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .add {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .file {
    display: none;
  }
  .problems {
    margin: 0;
    padding: 0;
    color: var(--error);
    list-style: none;
  }
  /* as tall as a font's row, so the fitted count holds as the first font comes in; a block cuts its own line */
  .empty {
    display: block;
    min-height: var(--control-height);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    align-content: center;
  }
  /* the name gives way, never the button */
  .font {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: center;
  }
  .font label {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .unreadable {
    color: var(--error);
  }
  /* a phone: under the preview, Preview.svelte putting itself first, the two buttons on one line */
  @media (max-width: 720px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-3);
    }
    .add {
      flex-direction: row;
    }
    .add > :global(*) {
      flex: 1;
    }
  }
</style>
