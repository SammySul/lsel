<script lang="ts">
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
import { clampSize, readPrefs, SIZE, writePrefs } from "./lib/prefs.ts";
import { SAMPLE } from "./lib/sample.ts";

interface Font {
  name: string;
  /** Files are kept in this browser; installed fonts only for this visit. */
  kept: boolean;
}

const storage = (() => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
})();

const prefs = readPrefs(storage);
let fonts: Font[] = $state([]);
let hidden: string[] = $state(prefs.hidden);
let size = $state(prefs.size);
let text = $state(SAMPLE);
let ready = $state(false);
let problems: string[] = $state([]);
let fileInput: HTMLInputElement | undefined = $state();
let installed: InstalledFonts | undefined = $state();
let installedOpen = $state(false);

const shown = $derived(fonts.filter((f) => !hidden.includes(f.name)));

onMount(async () => {
  try {
    const { loaded, failed } = await loadStored();
    fonts = loaded.map((name) => ({ name, kept: true }));
    problems = failed.map((name) => `${name} is saved but could not be read as a font.`);
  } catch {
    problems = ["This browser's storage is not available, so fonts can't be kept."];
  }
  ready = true;
});

$effect(() => {
  if (ready) writePrefs(storage, { hidden, size });
});

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
    hidden = hidden.filter((h) => h !== name);
  }
  problems = found;
  if (fileInput) fileInput.value = "";
}

async function addInstalled(family: string) {
  if (fonts.some((f) => f.name === family)) {
    hidden = hidden.filter((h) => h !== family);
    return;
  }
  try {
    await loadLocal(family);
    fonts = [...fonts, { name: family, kept: false }];
    hidden = hidden.filter((h) => h !== family);
    problems = [];
  } catch {
    problems = [`${family} could not be loaded.`];
  }
}

async function drop(font: Font) {
  if (font.kept) await remove(font.name);
  fonts = fonts.filter((f) => f !== font);
  hidden = hidden.filter((h) => h !== font.name);
}

function toggle(name: string) {
  hidden = hidden.includes(name) ? hidden.filter((h) => h !== name) : [...hidden, name];
}

function onkeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target;
  if (
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement && t.type !== "checkbox")
  ) {
    if (e.key === "Escape") t.blur();
    return;
  }
  if (e.key === "a") fileInput?.click();
  else if (e.key === "i" && localFontsSupported()) {
    if (installedOpen) installedOpen = false;
    else void installed?.show();
  } else if (e.key === "/" && localFontsSupported()) void installed?.show();
  else if (e.key === "-") size = clampSize(size - 2);
  else if (e.key === "=" || e.key === "+") size = clampSize(size + 2);
  else if (e.key === "r") text = SAMPLE;
  else return;
  e.preventDefault();
}
</script>

<svelte:window {onkeydown} />

<main>
  <header>
    <h1>typ</h1>
    <p class="sub">Compare fonts side by side on your own text.</p>
  </header>

  <div class="layout">
    <aside aria-label="Fonts">
      <button onclick={() => fileInput?.click()}>Add font files <kbd>a</kbd></button>
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
        <InstalledFonts bind:this={installed} bind:open={installedOpen} onpick={addInstalled} />
      {/if}

      {#if problems.length > 0}
        <ul class="problems lsel-appear" role="alert">
          {#each problems as p (p)}<li>{p}</li>{/each}
        </ul>
      {/if}

      {#if ready && fonts.length === 0}
        <p class="note">No fonts yet. Add font files; they stay in this browser.</p>
      {:else}
        <ul class="fonts" aria-label="Your fonts">
          {#each fonts as font (font.name)}
            <li class="lsel-appear">
              <label>
                <input
                  type="checkbox"
                  checked={!hidden.includes(font.name)}
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
          <input type="range" min={SIZE.min} max={SIZE.max} bind:value={size} />
          <span class="px">{size} px</span>
          <kbd>-</kbd><kbd>=</kbd>
        </label>
        <button onclick={() => (text = SAMPLE)} disabled={text === SAMPLE}>
          Reset text <kbd>r</kbd>
        </button>
      </div>

      {#if shown.length === 0}
        {#if ready}<p class="note">No fonts selected.</p>{/if}
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
                style:font-size={`${size}px`}
              ></textarea>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <footer>
    typ <span class="version">v{version}</span> ·
    <a href="https://github.com/SammySul/typ">source</a> · MIT
  </footer>
</main>

<style>
  main {
    padding: var(--space-6) var(--space-4);
  }
  .sub {
    margin: var(--space-1) 0 var(--space-5);
    color: var(--subtle);
  }
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
  .note {
    margin: 0;
    color: var(--subtle);
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
  footer {
    margin-top: var(--space-6);
    color: var(--subtle);
    font-size: var(--text-xs);
  }
</style>
