<!-- Compare fonts, from files or installed ones, on a sample text you type. -->
<script lang="ts">
import { Action, Empty, keys, List, Page } from "@sammysul/lsel";
import { version } from "../../package.json";
import InstalledFonts from "./components/InstalledFonts.svelte";
import {
  addFile,
  fontName,
  loadLocal,
  localFontsSupported,
  NotAFont,
  remove,
} from "./lib/fonts.ts";
import { clampSize, prefs, SIZE } from "./lib/prefs.ts";
import { SAMPLE } from "./lib/sample.ts";
import { stored } from "./lib/stored.ts";

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
let text = $state(SAMPLE);
let problems: string[] = $state(
  stored === null
    ? ["This browser's storage is not available, so fonts can't be kept."]
    : stored.removed.map((name) => `${name} held no font file, so it was removed.`),
);
let fileInput: HTMLInputElement | undefined = $state();

const shown = $derived(fonts.filter((f) => f.readable && !prefs.value.hidden.includes(f.name)));

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
  { key: "-", label: "Smaller", run: () => (prefs.value.size = clampSize(prefs.value.size - 2)) },
  {
    key: ["=", "+"],
    label: "Larger",
    run: () => (prefs.value.size = clampSize(prefs.value.size + 2)),
  },
]);
</script>

<Page
  name="typ"
  sub="Compare fonts side by side on your own text."
  {version}
  source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/typ"
  width={1600}
>

  <div class="layout">
    <aside aria-label="Fonts">
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
        <InstalledFonts onpick={addInstalled} />
      {/if}

      {#if problems.length > 0}
        <ul class="problems lsel-appear" role="alert">
          {#each problems as p (p)}<li>{p}</li>{/each}
        </ul>
      {/if}

      <div class="fonts">
        <List items={fonts} id={(f) => f.name} label="Your fonts" pageSize="fit">
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
                  {#if !font.kept}<span class="tag">installed</span>{/if}
                </label>
              {:else}
                <span class="unread">
                  <span class="name">{font.name}</span>
                  <span class="tag unreadable">can't be read</span>
                </span>
              {/if}
              <button onclick={() => drop(font)} aria-label="Remove {font.name}">Remove</button>
            </div>
          {/snippet}
          {#snippet empty()}No fonts yet. Add font files with <kbd>a</kbd>; they stay in this browser.{/snippet}
        </List>
      </div>
    </aside>

    <section class="preview" aria-label="Preview">
      <div class="controls">
        <label class="size">
          Size
          <input type="range" min={SIZE.min} max={SIZE.max} bind:value={prefs.value.size} />
          <span class="px">{prefs.value.size} px</span>
          <kbd>-</kbd><kbd>=</kbd>
        </label>
        <Action label="Reset text" key="r" disabled={text === SAMPLE} run={() => (text = SAMPLE)} />
      </div>

      {#if shown.length === 0}
        <Empty>No fonts selected. Tick one in the list.</Empty>
      {:else}
        <div class="columns">
          {#each shown as font (font.name)}
            <div class="column lsel-appear">
              <span class="label">{font.name}</span>
              <textarea
                bind:value={text}
                spellcheck="false"
                aria-label="Preview in {font.name}"
                style:font-family={`"${font.name}", var(--font)`}
                style:font-size={`${prefs.value.size}px`}
              ></textarea>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>

</Page>

<style>
  /* the fonts list fills the window (a fitted List); the preview stretches to its height */
  .layout {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: var(--space-5);
  }
  @media (max-width: 720px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
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
  /* every row as tall as the tallest, fillers too, so the fitted count holds as fonts come and go */
  .fonts :global(.lsel-list) {
    display: grid;
    grid-auto-rows: 1fr;
  }
  .font {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }
  .font label,
  .unread {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
  }
  .name,
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    flex: none;
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .unreadable {
    color: var(--error);
  }
  .preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    align-items: center;
  }
  .size {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    color: var(--subtle);
  }
  .px {
    min-width: 6ch;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .columns {
    display: flex;
    flex: 1;
    gap: var(--space-3);
    overflow-x: auto;
  }
  .column {
    display: flex;
    flex: 1 0 280px;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .label {
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  /* a floor, not a size: the row's height comes from the fitted list beside it */
  textarea {
    flex: 1 1 0;
    min-height: 10rem;
    resize: none;
  }
</style>
