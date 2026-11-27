<!-- The current file as large as its column allows, what it is, its own download and its post on Instagram. -->
<script lang="ts">
import { Action, duration, keys, when } from "@sammysul/lsel";
import { fileName } from "../../shared/types.ts";
import { download, mediaUrl } from "../lib/api.ts";
import type { Entry } from "../lib/entries.ts";

let { entry, username, onback }: { entry: Entry; username: string; onback: () => void } = $props();

const media = $derived(entry.media);
const name = $derived(fileName(username, media));
const link = $derived(
  entry.post === null
    ? `https://www.instagram.com/${username}/`
    : `https://www.instagram.com/p/${entry.post.code}/`,
);
const facts = $derived(
  [
    entry.post === null ? "Profile picture" : media.kind === "video" ? "Video" : "Photo",
    `${media.width} × ${media.height}`,
    media.duration === null ? null : duration(media.duration * 1000, "m:ss"),
    entry.of > 1 ? `${entry.index} of ${entry.of}` : null,
    entry.post?.takenAt ? when(entry.post.takenAt) : null,
  ].filter((f) => f !== null),
);

// a new tab, so grab and its ticks stay where they are
const open = () => window.open(link, "_blank", "noopener,noreferrer");

keys(() => [{ key: "o", label: "Open on Instagram", hint: true, run: open }]);
</script>

<section class="preview" aria-label="Preview">
  {#key media.id}
    <div class="frame lsel-appear">
      {#if media.kind === "video"}
        <!-- Instagram's embeds carry no captions track to give it -->
        <!-- svelte-ignore a11y_media_has_caption -->
        <video controls preload="metadata" poster={mediaUrl(media.thumb)} src={mediaUrl(media.src)}></video>
      {:else}
        <img src={mediaUrl(media.src)} alt={entry.post?.caption || `${username}'s profile picture`} />
      {/if}
    </div>
  {/key}
  <p class="facts">{facts.join(" · ")}</p>
  <div class="actions">
    <button type="button" class="back" onclick={onback}>Back <kbd>Esc</kbd></button>
    <Action label="Download" key="d" hint done="Downloading" run={() => download(mediaUrl(media.src, name))} />
    <a href={link} target="_blank" rel="noopener noreferrer">Open on Instagram <kbd>o</kbd></a>
  </div>
  <!-- always there and always this tall, so switching files never moves what is above it -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <p class="caption" tabindex="0" aria-label="Caption">{entry.post?.caption ?? ""}</p>
</section>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    min-height: 0;
  }
  .frame {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    background: var(--raise);
    border: var(--border);
  }
  img,
  video {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  p {
    margin: 0;
  }
  .facts {
    overflow: hidden;
    color: var(--subtle);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }
  /* only a phone shows the preview in the grid's place, so only there is there a grid to go back to */
  .back {
    display: none;
  }
  .caption {
    flex: none;
    height: 4lh;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  @media (max-width: 800px) {
    .caption {
      height: 2lh;
    }
    .back {
      display: inline-block;
    }
  }
</style>
