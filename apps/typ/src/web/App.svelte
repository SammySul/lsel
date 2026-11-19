<script lang="ts">
import { Action, Empty, keys, Page } from "@sammysul/lsel";
import { onMount } from "svelte";
import { version } from "../../package.json";
import InstalledFonts from "./components/InstalledFonts.svelte";
import {
  addFile,
  fontName,
  loadLocal,
  loadStored,
  localFontsSupported,
  NotAFont,
  remove,
} from "./lib/fonts.ts";
import { clampSize, prefs, SIZE } from "./lib/prefs.ts";
import { SAMPLE } from "./lib/sample.ts";

interface Font {
  name: string;
  /** Files are kept in this browser; installed fonts only for this visit. */
  kept: boolean;
}

let fonts: Font[] = $state([]);
let text = $state(SAMPLE);
let ready = $state(false);
let problems: string[] = $state([]);
let fileInput: HTMLInputElement | undefined = $state();

const shown = $derived(fonts.filter((f) => !prefs.value.hidden.includes(f.name)));

onMount(async () => {
  try {
    const { loaded, failed, removed } = await loadStored();
    fonts = loaded.map((name) => ({ name, kept: true }));
    problems = [
      ...removed.map((name) => `${name} held no font file, so it was removed.`),
      ...failed.map((name) => `${name} is saved but could not be read as a font.`),
    ];
  } catch {
    problems = ["This browser's storage is not available, so fonts can't be kept."];
  }
  ready = true;
});

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
    fonts = [...fonts, { name, kept }];
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
    fonts = [...fonts, { name: family, kept: false }];
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
  source="https://git.sammysul.com/SammySul/typ"
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

      {#if ready && fonts.length === 0}
        <Empty>No fonts yet. Add font files with <kbd>a</kbd>; they stay in this browser.</Empty>
      {:else}
        <ul class="fonts" aria-label="Your fonts">
          {#each fonts as font (font.name)}
            <li class="lsel-appear">
              <label>
                <input
                  type="checkbox"
                  checked={!prefs.value.hidden.includes(font.name)}
                  onchange={() => toggle(font.name)}
                />
                <span class="name">{font.name}</span>
                {#if !font.kept}<span class="tag">installed</span>{/if}
              </label>
              <button onclick={() => drop(font)} aria-label="Remove {font.name}">Remove</button>
            </li>
          {/each}
        </ul>
      {/if}
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
        {#if ready}<Empty>No fonts selected. Tick one in the list.</Empty>{/if}
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
  .layout {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: var(--space-5);
    align-items: start;
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
  }
  .file {
    display: none;
  }
  .fonts,
  .problems {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .fonts li {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) 0;
    border-bottom: var(--border);
  }
  .fonts label {
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
  .tag {
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .problems {
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
    gap: var(--space-3);
    overflow-x: auto;
  }
  .column {
    display: flex;
    flex: 1 0 280px;
    flex-direction: column;
    gap: var(--space-1);
  }
  .label {
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  textarea {
    height: 70vh;
    resize: vertical;
  }
</style>
