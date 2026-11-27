<!-- The current file at full size, what it is, and its own download. -->
<script lang="ts">
import { Action, duration, when } from "@sammysul/lsel";
import { fileName } from "../../shared/types.ts";
import { download, mediaUrl } from "../lib/api.ts";
import type { Entry } from "../lib/entries.ts";

let { entry, username }: { entry: Entry; username: string } = $props();

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
    <Action label="Download" key="d" hint done="Downloading" run={() => download(mediaUrl(media.src, name))} />
    <a href={link} rel="noreferrer">Open on Instagram</a>
  </div>
  {#if entry.post?.caption}<p class="caption">{entry.post.caption}</p>{/if}
</section>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .frame {
    display: flex;
    align-items: center;
    justify-content: center;
    height: min(60vh, 560px);
    background: var(--raise);
    border: var(--border);
  }
  @media (max-width: 800px) {
    .frame {
      height: min(45vh, 560px);
    }
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
    color: var(--subtle);
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
  }
  .caption {
    max-height: 12em;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
