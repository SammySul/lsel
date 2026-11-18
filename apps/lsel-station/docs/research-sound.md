# Sound effects and ambience: research

Researched 2026-11-18. The question: what is the cleanest way to add small
sound effects and quiet ambience to lsel-station, and is there a good "sound as
code" approach?

## Short answer

Write the sound in code on the plain Web Audio API, with no audio framework.
Describe each effect as a ZzFX parameter list, render it once into an
`AudioBuffer`, and play it through our own gain nodes. Build the ambience by
hand from looped noise, filters, slow LFOs and sparse notes. Create the
`AudioContext` on the first click or key press, suspend it while the tab is
hidden, and play nothing for ticks replayed during catch-up. This passes
`default-src 'self'` unchanged and adds a few KB of code and no asset files.
The synthesis frameworks all break under that CSP as shipped; Strudel is AGPL.

## How this was checked

- **Sources.** Specs, MDN, browser vendors' own pages, and each project's
  repository and npm registry entry. Dates come from the npm registry and from
  GitHub's API for the linked repository, read on 2026-11-18.
- **Sizes.** Measured from the npm tarball of the version named: bytes of the
  published file, and the same file through `gzip -9`. This is not what Vite
  emits after minifying and tree-shaking, which was not measured.
- **Source read.** The published build was searched for `eval`, `Function(`,
  `Blob`, `createObjectURL`, `data:` URLs, `Worker`, `addModule`, `WebAssembly`
  and remote URLs.
- **Local test.** A throwaway page was served with this project's exact CSP
  header, and by a second server without it as a control. It was opened in the
  dev shell's Playwright browsers: Chromium 156.0.8078.4, Firefox 157.0 and
  WebKit 27.2, headless, on macOS. Nothing was heard: "works" means the calls
  succeeded and the context ran. The page is not kept in the repo.
- **Untested.** Desktop Safari, iOS, Android, any headed browser, and any
  truly hidden tab. Playwright's WebKit is not Safari.

## Comparison

Sources for every cell are in the section for that option.

| Option            | Size                                            | License                             | Under `default-src 'self'`                                  | Maintenance                             | Authoring                             |
| ----------------- | ----------------------------------------------- | ----------------------------------- | ----------------------------------------------------------- | --------------------------------------- | ------------------------------------- |
| Raw Web Audio     | 0                                               | none (browser API)                  | Works                                                       | W3C draft, Sept 2026                    | TypeScript code                       |
| ZzFX 1.4.0        | 10.3 KB source, 3.6 KB gzip; micro build 1.2 KB | MIT                                 | Works (tested)                                              | Released 2026-10-01, active             | Web designer, then a parameter list   |
| ZzFXM 2.0.3       | 622 B player, on top of ZzFX                    | MIT                                 | Works by source read, not run                               | Last release 2020-08-31, dormant        | Tracker web app, then nested arrays   |
| jsfxr 1.4.1       | 35.9 KB source, 8.7 KB gzip                     | Unlicense                           | Web Audio path works (tested); WAV data URI path is blocked | Released 2026-05-05                     | sfxr.me, then JSON or a base58 string |
| howler.js 2.2.4   | 26.9 KB core, 8.0 KB gzip                       | MIT                                 | Works for same-origin files, by source read                 | Last release 2023-09-19, slow           | Audio files and sprite maps           |
| Tone.js 15.1.22   | 345.5 KB, 79.2 KB gzip (full build)             | MIT                                 | Fails: clock worker is a blob (tested)                      | Stable 2025-04-27, prereleases Nov 2026 | JS API: synths, transport, effects    |
| Strudel 1.3.0     | 850 KB, 241 KB gzip                             | AGPL-3.0-or-later                   | Fails: `data:` worklets, `Function()`                       | Published 2026-01-18                    | Pattern strings (mini-notation)       |
| Elementary 4.0.3  | 491 KB, 170 KB gzip                             | MIT                                 | Fails: WASM in a blob worklet                               | Stable 2024-12, prerelease 2025-10      | Functional JS signal graph            |
| Csound 7.0.0      | 4.9 MB, 3.5 MB gzip                             | Apache-2.0 wrapper, LGPL-2.1 engine | Fails: WASM, blob workers                                   | Released 2026-10-22, active             | Csound orchestra text                 |
| Faust WASM 0.21.1 | 31 MB package with compiler                     | LGPL-2.1                            | Fails: WASM, blob worklet                                   | Released 2026-11-15, active             | Faust DSP language                    |
| Recorded files    | Per file, not measured                          | Per asset; Kenney is CC0            | Works if same-origin and not inlined                        | Not applicable                          | Audio editor or downloaded packs      |

## Option 1: raw Web Audio, by hand

- **Size and license.** No dependency. The API is a W3C specification; the
  current document is the Web Audio API 1.1 Working Draft of 2026-09-22
  ([W3C](https://www.w3.org/TR/webaudio-1.1/)).
- **CSP.** Oscillators, gain nodes, filters and buffers filled from script load
  nothing, so no directive applies. In the local test a short oscillator and a
  script-filled buffer ran without error under the CSP in all three browsers.
- **AudioWorklet is the one exception.** A worklet module is fetched with the
  destination `audioworklet`, which CSP maps to `script-src-elem`
  ([CSP3, 6.8.1](https://www.w3.org/TR/CSP3/#effective-directive-for-a-request)).
  With no `script-src` set, that falls back to `default-src`
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/default-src)).
  So the module must be a same-origin file. In the local test
  `audioWorklet.addModule("/worklet.js")` worked and the same code as a `blob:`
  or `data:` URL was refused in all three browsers. Nothing recommended here
  needs a worklet.
- **Waveforms.** `OscillatorNode` offers sine, square (fixed 50% duty),
  sawtooth, triangle and custom
  ([W3C](https://www.w3.org/TR/webaudio-1.1/#enumdef-oscillatortype)). Other
  pulse widths need `createPeriodicWave` or a buffer filled by hand. MDN's
  tutorial builds a pulse from two oscillators and noise from a random buffer
  and a biquad filter
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)).
- **Envelopes.** Scheduled on `AudioParam`s. `setTargetAtTime` is "useful for
  decay or release portions of ADSR envelopes"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime)).
- **Authoring.** TypeScript only. There is no designer tool, so each effect is
  tuned by editing numbers and listening. This is the weak point for effects
  and the reason to borrow ZzFX's parameter format for them.
- **Fit.** Best for the ambience, where we want a few long-lived nodes under
  our control. Tedious for a dozen one-shot effects.

## Option 2: tiny procedural effect synths

### ZzFX

- **What it is.** "A tiny sound generator designed to produce a wide variety of
  sound effects with minimal code overhead"
  ([README](https://github.com/KilledByAPixel/ZzFX)).
- **Size.** `ZzFX.js` is 10,301 bytes unminified and 3,569 gzipped.
  `ZzFXMicro.min.js` is 1,226 bytes and 872 gzipped. The package is 29,982
  bytes unpacked with no dependencies
  ([npm registry](https://registry.npmjs.org/zzfx)). The README says "Less
  than 1 kilobyte when compressed"
  ([README](https://github.com/KilledByAPixel/ZzFX)).
- **License.** MIT ([npm registry](https://registry.npmjs.org/zzfx)).
- **Maintenance.** Version 1.4.0 was published on 2026-10-01
  ([npm registry](https://registry.npmjs.org/zzfx)). The repository was last
  pushed on 2026-11-03 and is not archived
  ([GitHub](https://github.com/KilledByAPixel/ZzFX)).
- **CSP.** The source read found no `eval`, `Function`, `Blob`, `data:` URL,
  worker, worklet, WASM or fetch. It computes samples in a loop and plays them
  with `createBuffer` and `createBufferSource`
  ([source](https://github.com/KilledByAPixel/ZzFX/blob/master/ZzFX.js)). In
  the local test it ran without error under the CSP in all three browsers.
- **Authoring.** The ZzFX sound designer web app produces a call such as
  `zzfx(...[,,537,.02,.02,.22,1,1.59,-6.98,4.97])`
  ([README](https://github.com/KilledByAPixel/ZzFX),
  [designer](https://killedbyapixel.github.io/ZzFX)). The 21 positional
  parameters are volume, randomness, frequency, attack, sustain, release,
  shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
  noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo and filter
  ([source](https://github.com/KilledByAPixel/ZzFX/blob/master/ZzFX.js)).
- **Trap: it creates its context on import.** The module contains
  `audioContext: new AudioContext` at the top level
  ([source](https://github.com/KilledByAPixel/ZzFX/blob/master/ZzFX.js)). In
  the local test Firefox logged a console warning for that alone when the page
  had no gesture yet.
- **Trap: it plays straight to the destination.** `playSamples` connects its
  own gain node to `audioContext.destination`
  ([source](https://github.com/KilledByAPixel/ZzFX/blob/master/ZzFX.js)), so
  our effects and master gain nodes would be bypassed. `buildSamples` only
  returns an array of samples, which is the part to use.
- **Trap: the sample rate is fixed.** `sampleRate: 44100`
  ([source](https://github.com/KilledByAPixel/ZzFX/blob/master/ZzFX.js)).
  Create the buffer at 44,100 Hz and let the context resample it.
- **Trap: pasted arrays are sparse.** Biome's `noSparseArray` rule is in the
  recommended set with severity error
  ([Biome](https://biomejs.dev/linter/rules/no-sparse-array/)), and this
  project uses that set. Store sounds as named fields, or write `undefined` in
  the holes. Not run here.
- **Randomness.** The default `randomness` of 0.05 varies the pitch on each
  build using `Math.random`
  ([source](https://github.com/KilledByAPixel/ZzFX/blob/master/ZzFX.js)). It
  does not touch the game's seeded generator. A cached buffer has one fixed
  pitch; vary `playbackRate` at play time for variety.

### ZzFXM (music tracker format for ZzFX)

- **What it is.** "A music generator for use in tiny JavaScript productions".
  The song format is "loosely based on the MOD format": instruments, patterns,
  a sequence and a tempo, as nested arrays. `zzfxM` builds the whole song as
  sample data and `zzfxP` plays it as one buffer source
  ([README](https://github.com/keithclark/ZzFXM)).
- **Size.** `zzfxm.min.js` is 622 bytes, 473 gzipped
  ([source](https://github.com/keithclark/ZzFXM/blob/master/zzfxm.min.js)).
- **License.** MIT ([GitHub](https://github.com/keithclark/ZzFXM)).
- **Maintenance.** Latest release v2.0.3 on 2020-08-31; the last commit on
  `master` is from 2021-01-30 ([GitHub](https://github.com/keithclark/ZzFXM)).
  There is no `zzfxm` package on npm
  ([npm registry](https://registry.npmjs.org/zzfxm)).
- **CSP.** The source read of `zzfxm.js` found none of the blocked features.
  Not run.
- **Authoring.** A browser tracker
  ([tracker](https://keithclark.github.io/ZzFXM/tracker/)), and a CLI that
  converts ProTracker MOD files ([README](https://github.com/keithclark/ZzFXM)).
- **Fit.** Good for a fixed chiptune song. Not what quiet, non-repeating
  ambience needs. Keep it in mind if the game ever wants a title tune.

### jsfxr

- **What it is.** A "quick 'n' easy game sound effects generator", "a port
  of sfxr to HTML5" ([README](https://github.com/chr15m/jsfxr)).
- **Size.** `sfxr.js` is 35,898 bytes unminified and 8,662 gzipped, plus
  `riffwave.js` at 5,447 and 2,077 ([npm registry](https://registry.npmjs.org/jsfxr)).
- **License.** The Unlicense, a public-domain dedication
  ([GitHub](https://github.com/chr15m/jsfxr)). The npm metadata has no license
  field ([npm registry](https://registry.npmjs.org/jsfxr)).
- **Maintenance.** Version 1.4.1 was published on 2026-05-05, which is also
  the last push ([npm registry](https://registry.npmjs.org/jsfxr),
  [GitHub](https://github.com/chr15m/jsfxr)).
- **CSP.** `sfxr.toAudio(...).play()` uses an `AudioBuffer` and worked under
  the CSP in the local test. `sfxr.toWave(...).dataURI` is a `data:audio/wav`
  URL, and playing it with an `<audio>` element was blocked by `media-src` in
  all three browsers.
- **Authoring.** Design at sfxr.me, press "serialize" and copy the JSON, or
  use the base58 string. Presets include `pickupCoin`, `laserShoot`,
  `explosion`, `powerUp`, `hitHurt`, `jump`, `blipSelect` and `click`
  ([README](https://github.com/chr15m/jsfxr)).
- **Fit.** A fine alternative to ZzFX, with sfxr's own controls. It
  is larger, and each sound is a JSON object of about 27 fields or an opaque
  base58 string, where ZzFX is one short list.

### Others

- **loov/jsfx.** MIT, last pushed 2017-05-13
  ([GitHub](https://github.com/loov/jsfx)). Unmaintained.
- **Bfxr2.** A rewrite of Bfxr in JavaScript, MIT, last pushed 2026-10-22, in
  beta. It is an app with 23 synths, not a small library
  ([GitHub](https://github.com/increpare/bfxr2)). Whether its synth can be
  embedded was not verified.
- **rFXGen.** A desktop and web tool under the zlib license that exports
  `.wav` and has a command line for batch conversion
  ([GitHub](https://github.com/raysan5/rfxgen)). It makes files, so it belongs
  with option 4.

## Option 3: music-as-code and audio frameworks

### Tone.js

- **What it is.** "A Web Audio framework for creating interactive music in the
  browser", with "a global transport for synchronizing and scheduling events as
  well as prebuilt synths and effects"
  ([README](https://github.com/Tonejs/Tone.js)).
- **Size.** The full build `build/Tone.js` is 345,500 bytes minified and 79,213
  gzipped. The package is 5.4 MB unpacked and depends on
  `standardized-audio-context` and `tslib`
  ([npm registry](https://registry.npmjs.org/tone)). The size after
  tree-shaking the ES modules was not measured.
- **License.** MIT ([npm registry](https://registry.npmjs.org/tone)).
- **Maintenance.** `latest` is 15.1.22, published 2025-04-27. `next` is
  15.5.72, published 2026-11-14
  ([npm registry](https://registry.npmjs.org/tone)). The repository was pushed
  on 2026-11-15 ([GitHub](https://github.com/Tonejs/Tone.js)). Active.
- **CSP: fails as shipped.** Tone's clock is a Web Worker built from a `Blob`
  and `URL.createObjectURL`. Workers are governed by `worker-src`, which falls
  back to `child-src`, `script-src`, then `default-src`
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src)).
  In the local test, under our CSP, all three browsers refused the worker with
  an error event and no exception. Tone's `clockSource` stayed `"worker"`, and
  the context ticked 0 times in 1.2 s, against 22 or 23 times without the CSP.
  A `Transport` callback never fired. The same failure is reported upstream:
  the worker error "doesn't raise an exception that would cause Tone to use the
  setTimeout fallback"
  ([Tone.js issue 1210](https://github.com/Tonejs/Tone.js/issues/1210)).
- **CSP: other blob uses.** Its worklet-based nodes and its dependency's
  feature tests also load modules from blob URLs (source read). Under the CSP
  the page that used Tone.js logged further CSP errors and uncaught
  `AbortError`s in the local test.
- **Console noise.** In the local test, loading the script alone logged a CSP
  error in all three browsers, and autoplay warnings in Chromium and Firefox,
  before any gesture. Our e2e test fails on console errors and warnings.
- **Workaround.** The context accepts `clockSource: "timeout"` (source read),
  which avoids the worker. Not tested. The alternative is adding `blob:` to
  `worker-src`, which the project's rules do not allow without Sammy's yes.
- **Authoring.** JavaScript objects: `new Tone.Synth().toDestination()`,
  `synth.triggerAttackRelease("C4", "8n")`
  ([README](https://github.com/Tonejs/Tone.js)).
- **Fit.** Capable, and the nicest "music as code" API here that is MIT. Too
  large for a dozen blips and a hum, and it fights the CSP.

### Strudel (TidalCycles in the browser)

- **License: not usable here.** AGPL-3.0-or-later
  ([npm registry](https://registry.npmjs.org/@strudel/web)). Strudel's own
  guide says "You must license derivative work under the same license"
  ([Strudel](https://strudel.cc/technical-manual/project-start/)). That rules
  it out for an MIT repo.
- **Size.** `@strudel/web` 1.3.0 ships `dist/index.mjs` at 850,423 bytes,
  241,381 gzipped ([npm registry](https://registry.npmjs.org/@strudel/web)).
- **Maintenance.** `@strudel/web` 1.3.0 was published on 2026-01-18
  ([npm registry](https://registry.npmjs.org/@strudel/web)). The repository is
  on Codeberg, which could not be reached from here, so recent activity is not
  verified.
- **CSP: fails as shipped.** By source read of `dist/index.mjs`: several
  AudioWorklet modules are embedded as `data:text/javascript;base64` URLs and
  passed to `addModule`; `evaluate` runs code through `Function()`; and sample
  loaders build URLs on `raw.githubusercontent.com` and `shabda.ndre.gr`. The
  README says "By default, no external samples are loaded"
  ([npm registry](https://registry.npmjs.org/@strudel/web)). The local test
  confirmed that `data:` worklets and `Function()` are refused under our CSP.
  Strudel itself was not run.
- **Authoring.** Pattern strings in mini-notation, for example
  `note('<c a f e>(3,8)').jux(rev).play()`
  ([npm registry](https://registry.npmjs.org/@strudel/web)). It also embeds
  ZzFX as a sound source ([Strudel](https://strudel.cc/learn/synths/)).
- **Fit.** The most expressive "music as code" option, built for live coding.
  Ruled out by license before size or CSP matter.

### Elementary Audio

- **What it is.** "A JavaScript/C++ library for building audio applications".
  The web renderer runs it "using WASM and Web Audio"
  ([npm registry](https://registry.npmjs.org/@elemaudio/web-renderer)).
- **Size.** `@elemaudio/web-renderer` 4.0.3 ships `dist/index.js` at 490,919
  bytes, 169,992 gzipped, and needs `@elemaudio/core`, 100,017 bytes unpacked
  ([npm registry](https://registry.npmjs.org/@elemaudio/web-renderer),
  [npm registry](https://registry.npmjs.org/@elemaudio/core)).
- **License.** MIT
  ([npm registry](https://registry.npmjs.org/@elemaudio/web-renderer)).
- **Maintenance.** `latest` is 4.0.3 from 2024-12-21; `next` is 4.0.8 from
  2025-10-22
  ([npm registry](https://registry.npmjs.org/@elemaudio/web-renderer)). The
  last commit on `main` is from 2024-12-21
  ([GitHub](https://github.com/elemaudio/elementary)). Slow.
- **CSP: fails as shipped.** By source read, it joins the WASM runtime and the
  worklet processor into a `Blob`, calls `createObjectURL`, and passes that to
  `audioWorklet.addModule`. It then compiles WebAssembly, which needs
  `'wasm-unsafe-eval'` in `script-src`
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)).
  Not run.
- **Authoring.** A functional graph in JavaScript:
  `core.render(el.cycle(440), el.cycle(441))`
  ([npm registry](https://registry.npmjs.org/@elemaudio/web-renderer)).

### Csound WASM

- **Size.** `@csound/browser` 7.0.0 ships `dist/csound.js` at 4,872,684 bytes,
  3,529,582 gzipped; the package is 11.1 MB unpacked
  ([npm registry](https://registry.npmjs.org/@csound/browser)).
- **License.** The wrapper is Apache-2.0. Its README says the WASM binary
  package "remains licensed under the GNU Lesser General Public License v2.1"
  ([npm registry](https://registry.npmjs.org/@csound/browser)).
- **Maintenance.** 7.0.0 was published on 2026-10-22
  ([npm registry](https://registry.npmjs.org/@csound/browser)); the repository
  was pushed on 2026-11-17 ([GitHub](https://github.com/csound/csound)).
  Active.
- **CSP: fails as shipped.** By source read: WebAssembly throughout, plus
  workers and worklet modules created from `Blob` URLs. Not run.
- **Authoring.** Csound orchestra and score text, compiled at run time.
- **Fit.** A full synthesis language at megabytes of download. Far out of
  proportion.

### Faust WASM

- **Size.** `@grame/faustwasm` 0.21.1 is 31.4 MB unpacked because it includes
  the Faust compiler ([npm registry](https://registry.npmjs.org/@grame/faustwasm)).
  A DSP can be compiled ahead of time with `faust2wasm` into
  `dsp-module.wasm`, `dsp-meta.json` and glue code
  ([README](https://github.com/grame-cncm/faustwasm)). The size of such an
  export was not measured.
- **License.** LGPL-2.1 ([npm registry](https://registry.npmjs.org/@grame/faustwasm)).
  The license of code generated from our own DSP files was not checked.
- **Maintenance.** 0.21.1 was published on 2026-11-15
  ([npm registry](https://registry.npmjs.org/@grame/faustwasm)). Active.
- **CSP: fails as shipped.** WebAssembly needs `'wasm-unsafe-eval'`, and by
  source read the generator loads its processor with
  `URL.createObjectURL(new Blob([processorCode]))` and `addModule`
  ([source](https://github.com/grame-cncm/faustwasm/tree/master/src)). Not
  run.
- **Authoring.** The Faust DSP language, a second language and toolchain.

### howler.js (file playback)

- **What it is.** An audio library that "defaults to Web Audio API and falls
  back to HTML5 Audio" ([README](https://github.com/goldfire/howler.js)). It
  plays files; it does not synthesize.
- **Size.** `howler.core.min.js` is 26,924 bytes, 7,951 gzipped; the full
  `howler.min.js` is 36,173 and 9,709
  ([npm registry](https://registry.npmjs.org/howler)). The README says "As
  light as 7kb gzipped" ([README](https://github.com/goldfire/howler.js)).
- **License.** MIT ([npm registry](https://registry.npmjs.org/howler)).
- **Maintenance.** Latest release 2.2.4 on 2023-09-19
  ([npm registry](https://registry.npmjs.org/howler)). The last push was on
  2025-11-23, with 419 open issues and pull requests
  ([GitHub](https://github.com/goldfire/howler.js)). Slow.
- **CSP.** By source read: no eval, blob, worker or WASM. It loads files with
  `XMLHttpRequest`, which `connect-src` governs
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src)),
  so same-origin files pass.
- **Useful ideas in it.** It unlocks audio on the first touch, and by default
  it suspends the context "after 30 seconds of inactivity to decrease
  processing and energy usage"
  ([README](https://github.com/goldfire/howler.js)).
- **Fit.** Only relevant with option 4, and even then `fetch` plus
  `decodeAudioData` covers our needs in about 20 lines.

## Option 4: recorded audio files, self-hosted

- **CSP.** `fetch()` is governed by `connect-src` and `<audio>` by
  `media-src`; both fall back to `default-src`
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/media-src)).
  Same-origin files pass. In the local test, fetching and decoding a
  same-origin WAV worked under the CSP in Chromium and WebKit.
- **Trap: Vite inlines small files.** Imported assets under 4,096 bytes "will
  be inlined as base64 URLs"
  ([Vite](https://vite.dev/config/build-options#build-assetsinlinelimit)). A
  short blip is often smaller than that. In the local test `fetch` of a
  `data:` URL and an `<audio>` with a `data:` source were both refused under
  our CSP in all three browsers. Import with `?no-inline`
  ([Vite](https://vite.dev/guide/assets)), or serve the files from
  `src/web/public/`.
- **Trap: our Firefox test browser did not decode.** In the dev shell's
  headless Firefox 157, `decodeAudioData` and `<audio>.play()` never settled
  for a same-origin 16-bit WAV, with and without the CSP, and logged nothing.
  This is probably a limit of that build. It was not checked in desktop
  Firefox. It means file playback cannot be verified by our e2e test in
  Firefox today, while script-filled buffers can.
- **Formats.** `decodeAudioData` takes a complete file in an `ArrayBuffer` and
  resamples it to the context's rate
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)).
  - **MP3** is listed as supported in Chrome, Edge, Firefox and Safari, and
    "the patents behind MP3 have expired, removing many or most licensing
    concerns"
    ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)).
    It is the safe single format.
  - **Ogg Opus** is listed as supported in Chrome, Edge, Firefox and Safari
    ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers)).
    But Safari gained "Ogg container support for both Opus and Vorbis audio"
    only in 18.4, "on macOS Sequoia 15.4, iOS 18.4, iPadOS 18.4, and visionOS
    2.4"
    ([WebKit](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)).
    Older Safari needs a fallback file.
  - **AAC** is less predictable: "Firefox only supports AAC if support is
    provided by the operating system or an external library"
    ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)).
  - **WAV** with plain PCM decoded in Chromium and WebKit in the local test,
    and MDN lists it for Firefox
    ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers)).
    It is uncompressed: 16-bit mono at 44.1 kHz is about 88 KB per second.
- **Size.** Not measured. Depends on the pack and the encoding.
- **Licensing.**
  - Kenney: "all game assets on the asset pages are public domain licensed
    (CC0)", and "Attribution is not required"
    ([Kenney](https://kenney.nl/support)).
  - Freesound lets each uploader choose CC0, CC BY or CC BY-NC, and older
    sounds may carry Sampling+ ([Freesound](https://freesound.org/help/faq/)).
    Check every file. CC BY needs a credits list. CC BY-NC conflicts with an
    MIT repo. Freesound also warns that users may upload content they do not
    own ([Freesound](https://freesound.org/help/faq/)).
  - CC0 files can sit in an MIT repo, but they are not MIT. Keep a short
    notice of where each file came from.
- **Authoring.** Pick from packs, or record and edit. Changing a sound means
  replacing a binary file.
- **Fit.** The right tool for sounds that are hard to synthesize, such as a
  voice or a real machine. For retro blips it adds assets, a build trap and a
  license ledger with no gain.

## What the CSP allows for audio

Our header is `default-src 'self'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'` (`src/server/server.ts`). `'self'` means "resources of
the given type may only be loaded from the same origin as the document"
([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)).

Results of the local test under that header. Chromium, Firefox and WebKit
agreed on every row.

| What                                            | Governing directive | Result                         |
| ----------------------------------------------- | ------------------- | ------------------------------ |
| Oscillator, gain, script-filled `AudioBuffer`   | none                | Works                          |
| `audioWorklet.addModule("/file.js")`            | `script-src-elem`   | Works                          |
| `audioWorklet.addModule(blobUrl)`               | `script-src-elem`   | Refused                        |
| `audioWorklet.addModule(dataUrl)`               | `script-src-elem`   | Refused                        |
| `new Worker(blobUrl)`                           | `worker-src`        | Refused, error event, no throw |
| `WebAssembly.compile`, `new WebAssembly.Module` | `script-src`        | Refused                        |
| `Function("...")`                               | `script-src`        | Refused                        |
| `fetch("/file.wav")`                            | `connect-src`       | Works                          |
| `fetch("data:...")`                             | `connect-src`       | Refused                        |
| `<audio>` with a `data:` source                 | `media-src`         | Refused                        |

The directive names are those in the browsers' own violation reports; for the
worklet rows only Firefox and WebKit reported one. They match the spec's table
([CSP3, 6.8.1](https://www.w3.org/TR/CSP3/#effective-directive-for-a-request)).
WebAssembly is gated on `'wasm-unsafe-eval'` or `'unsafe-eval'`
([CSP3](https://www.w3.org/TR/CSP3/#wasm-integration)). Without the CSP
header every row worked in Chromium and WebKit, and in Firefox except the
`<audio>` row, which never settled (see option 4).

## Autoplay: starting the AudioContext

- **The rule.** A user agent may keep a new context suspended "and to allow it
  only when the AudioContext's relevant global object has sticky activation"
  ([W3C](https://www.w3.org/TR/webaudio-1.1/#allowed-to-start)). Sticky
  activation means the user has interacted with the page at some point
  ([HTML](https://html.spec.whatwg.org/multipage/interaction.html#sticky-activation)).
- **Which events count.** A trusted `keydown` (not Esc), `mousedown`,
  `pointerdown` from a mouse, `pointerup` from touch or pen, or `touchend`
  ([HTML](https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event)).
- **Chromium.** A context "created before the document receives a user
  gesture" starts suspended, "and you will need to call resume() after the
  user gesture." It is also resumed "after a user gesture if start() is called
  on any attached node". The policy applies to Web Audio since Chrome 71
  ([Chrome](https://developer.chrome.com/blog/autoplay)).
- **Firefox.** With the default setting, "audio contexts are only able to play
  on pages once there has been Sticky activation"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)).
- **Safari.** WebKit's own posts cover media elements: "Websites should assume
  any use of `<video>` or `<audio>` requires a user gesture click to play"
  ([WebKit](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/)).
  No WebKit page that spells out the rule for Web Audio was found. In the
  local test, WebKit kept a context created at load suspended and ran it after
  a click.
- **The safe pattern.** MDN sums it up as "Create or resume context from
  inside a user gesture"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)).
  Create the context in the first `pointerdown` or `keydown` handler and call
  `resume()` there. In the local test this left the context running in all
  three browsers.
- **Do not await `resume()` at startup.** If the context is not allowed to
  start, the spec parks the promise until it is
  ([W3C](https://www.w3.org/TR/webaudio-1.1/#dom-audiocontext-resume)). Code
  that awaits it before a gesture hangs.
- **Console warnings, from the local test.** Our e2e test fails on any console
  warning.
  - Firefox logged "An AudioContext was prevented from starting automatically"
    for a bare `new AudioContext()` before any gesture.
  - Chromium logged "The AudioContext was not allowed to start" when a source
    was started before a gesture, but not for the constructor alone.
  - WebKit logged nothing.
  - So: never construct the context at module load, and never start a sound
    before the first gesture.
- **The `interrupted` state.** A context can be paused from outside, for
  example by a phone call or a closed laptop lid
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state)).
  The state is in the 1.1 draft
  ([W3C](https://www.w3.org/TR/webaudio-1.1/#enumdef-audiocontextstate)).
  MDN's data lists it for Chrome 136 and Safari, not Firefox
  ([MDN data](https://github.com/mdn/browser-compat-data/blob/main/api/BaseAudioContext.json)).
  Before playing, check that `state` is `"running"` and call `resume()` if
  not.
- **iOS mute switch.** Jer Noble, author of WebKit's iOS media policy post,
  explains on WebKit's tracker: "we made the decision to map AudioContext
  generated audio to the system's 'Ambient' audio behavior." It mixes with
  other audio, obeys the mute switch, and "would not be allowed to continue to
  play when the browser was not foreground"
  ([WebKit bug 252746](https://bugs.webkit.org/show_bug.cgi?id=252746)). The
  Audio Session spec agrees: an `AudioContext`'s default type is `ambient`
  ([W3C](https://www.w3.org/TR/audio-session/)). That is the right behavior
  for a game: silent on a muted phone, and the player's music keeps playing.
  Leave it alone.
- **`navigator.audioSession`.** "Since iOS 17, you can set the audio session
  type to 'playback'" and "audio will not be suspended", per a comment on
  [WebKit bug 237322](https://bugs.webkit.org/show_bug.cgi?id=237322). MDN
  describes `playback` as "an exclusive type that will pause other playback
  audio on the device"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/type)).
  The API is in Safari 16.4 and later, not in Chrome, and in preview in
  Firefox
  ([MDN data](https://github.com/mdn/browser-compat-data/blob/main/api/AudioSession.json)).
  Not needed here. Not tested on a device.

## Background tabs: timers and the audio clock

The game calls `advance()` from a 100 ms `setInterval` and catches up from
`performance.now()` (`src/web/game.svelte.ts`).

- **Timers slow down when hidden.** Firefox desktop enforces a minimum of 1
  second in inactive tabs. Chrome checks timers once per second, and once per
  minute after the page has been hidden for 5 minutes, silent for 30 seconds
  and has chained 5 or more timers
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#timeouts_in_inactive_tabs),
  [Chrome](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)).
  At 200 ms per tick, a hidden tab runs about 5 ticks per wake-up, and about
  300 at once when Chrome wakes it once per minute.
- **Animation frames stop.** "Most browsers stop sending
  requestAnimationFrame() callbacks to background tabs"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)).
- **Audio changes the throttling.** "Tabs which are playing audio are
  considered foreground and aren't throttled"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)).
  Chrome applies only minimal throttling when "the page has made noises in the
  past 30 seconds"
  ([Chrome](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)).
  "Firefox does not throttle inactive tabs if the tab contains an
  AudioContext"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#timeouts_in_inactive_tabs)).
- **Freezing.** With Energy Saver on, Chrome 133 and later freezes background
  tabs that have been "hidden and silent for more than five minutes" and are
  CPU-intensive
  ([Chrome](https://developer.chrome.com/blog/freezing-on-energy-saver)). In a
  frozen page "JavaScript timers and fetch callbacks don't run"
  ([Chrome](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)).
- **What this means for an idle game.** A looping ambience would keep a hidden
  tab audible. That keeps its timers at full rate, blocks freezing, and plays
  sound from a tab nobody is looking at, for months. The game already catches
  up after throttling, so it gains nothing from staying awake.
- **The audio clock is separate.** `currentTime` advances in blocks of 128
  frames, about 2.9 ms at 44.1 kHz. It "is separate from the system clock" and
  "stops advancing while the context is suspended"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime)).
  The API offers "sample-accurate scheduled sound playback"
  ([W3C](https://www.w3.org/TR/webaudio-1.1/)), while timer callbacks "can
  easily be skewed by tens of milliseconds or more"
  ([web.dev](https://web.dev/articles/audio-scheduling)).
- **Suspending.** `suspend()` halts the audio clock, "temporarily halting
  audio hardware access and reducing CPU/battery usage"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/suspend)).
  In the local test, `suspend()` froze `currentTime` and `resume()` restarted
  it in all three browsers.

Design that follows from this:

1. **Suspend on hide.** On `visibilitychange` to hidden, fade the master gain
   out and call `suspend()`. On visible, call `resume()` and fade in. Whether
   `resume()` succeeds from a `visibilitychange` handler in every browser was
   not tested; if it does not, the next click resumes it.
2. **Play only live events.** `advance()` already knows how many ticks are due.
   A batch of one or two ticks is live. A larger batch is catch-up and plays
   nothing. Also require `document.visibilityState === "visible"`.
3. **Never queue sounds.** An event that cannot play now is dropped, not
   delayed. This is what stops a backlog from replaying.
4. **Limit repeats.** Many short jobs finish close together. Give each sound a
   minimum gap, and play it once per tick however many jobs finished.
5. **Time with the audio clock.** A one-shot effect starts at `currentTime`.
   Ambience notes are scheduled a little ahead with `start(when)`; MDN's
   example wakes every 25 ms and schedules 0.1 s ahead
   ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)).
   Suspending stops both the clock and the scheduled notes, so nothing piles
   up while hidden.

## Ambience techniques

All of these are plain Web Audio nodes and pass the CSP.

- **Noise bed.** Fill an `AudioBuffer` with random values between -1 and 1 and
  shape it with a `BiquadFilterNode`
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)).
  Loop a buffer of a few seconds instead of generating noise forever. Tone.js
  does the same: its noise source "uses looped noise buffers to save on
  performance" and offers white, pink and brown
  ([Tone.js](https://tonejs.github.io/docs/15.1.22/classes/Noise.html)). A low
  band of brown noise reads as station hum or air handling.
- **Slow movement.** Connect a low-frequency `OscillatorNode` to an
  `AudioParam`, such as a gain or a filter frequency. MDN's example is
  `lfo.connect(amp.gain)`
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)).
  Use periods of many seconds, and two LFOs with unrelated periods so the bed
  never repeats audibly.
- **Sparse notes.** Every so often, pick a note from a small scale and play it
  quietly with a long release. `setTargetAtTime` gives the decay
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime)).
  Pattern languages package the same idea as random modifiers such as
  `choose` ([Strudel](https://strudel.cc/learn/random-modifiers/)). No primary
  source prescribes a recipe; the scale, density and timing are ours to tune.
- **Randomness.** Give the ambience its own small seeded generator. The spec
  says all game randomness comes from the generator stored in the save
  (`docs/spec.md`, section 3), and sound must never draw from it.
- **Reverb from a generated impulse response.** `ConvolverNode` "applies a
  linear convolution effect given an impulse response"
  ([W3C](https://www.w3.org/TR/webaudio-1.1/#ConvolverNode)). The response
  can be made in code as decaying noise, with no file: Tone.js describes its
  reverb as "simple convolution created with decaying noise", after ReverbGen
  ([Tone.js](https://tonejs.github.io/docs/15.1.22/classes/Reverb.html),
  [ReverbGen](https://github.com/adelespinasse/reverbGen)).
- **Echo.** A `DelayNode` with its output fed back through a gain node. A
  feedback loop must pass through a `DelayNode`, whose time is then "clamped
  to a minimum of one render quantum"; nodes in a loop without one are muted
  ([W3C](https://www.w3.org/TR/webaudio-1.1/#DelayNode)). Cheaper than a
  convolver, and closer to old hardware.
- **Power.** A context created with `latencyHint: "playback"` asks for the
  "lowest power consumption" at the cost of latency
  ([W3C](https://www.w3.org/TR/webaudio-1.1/#enumdef-audiocontextlatencycategory)).
  Effects tied to clicks want the default `"interactive"`. Not measured.
- **Tie it to the scene.** The scene shows only running jobs (spec 12.4). The
  ambience can follow the same snapshot: a faint layer per active department,
  faded in and out over a second or two.

## Volume, mute and accessibility

- **Bus layout.** An effects gain and an ambience gain into a master gain, on
  one context. MDN: "It's recommended to create one AudioContext and reuse
  it" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext)).
- **Controls are expected.** "If your website or application contains sound,
  you should allow the user control over it". MDN suggests a range input for
  volume and `role="switch"` on buttons that turn audio on and off
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)).
- **WCAG 1.4.2 Audio Control, Level A.** "If any audio on a web page plays
  automatically for more than 3 seconds, either a mechanism is available to
  pause or stop the audio, or a mechanism is available to control audio volume
  independently from the overall system volume level". The reason given is
  that screen reader users cannot hear speech over other audio
  ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html)).
  Short effects fall under 3 seconds. The ambience does not, so it needs a
  mute or volume control that is easy to reach.
- **Start on a user action.** The same page encourages "that the sound be
  started by an action initiated by the user"
  ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html)).
- **Separate controls per kind.** Xbox Accessibility Guideline 105 asks for
  "separate volume controls for each type of audio output (like music volume,
  effects volume ...)"
  ([Microsoft](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/105)).
  The Game Accessibility Guidelines say the same: "Provide separate volume
  controls or mutes for effects, speech and background / music"
  ([GAG](https://gameaccessibilityguidelines.com/provide-separate-volume-controls-or-mutes-for-effects-speech-and-background-music/)).
- **No media query for sound.** The user-preference features in Media Queries
  Level 5 cover motion, transparency, contrast, colors and data use. None
  covers audio ([W3C](https://www.w3.org/TR/mediaqueries-5/)). Sound needs its
  own setting. Do not tie it to reduced motion.
- **Change gain smoothly.** Ramp with `setTargetAtTime` over a few
  milliseconds instead of setting `gain.value`, to avoid clicks
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime)).
- **Default level.** No primary source sets one. ZzFX's own master volume
  defaults to 0.3
  ([source](https://github.com/KilledByAPixel/ZzFX/blob/master/ZzFX.js)).
- **Suggested settings (a proposal, not a sourced convention).** A master
  mute, an effects volume and an ambience volume. Store them per device
  outside the synced save, since volume belongs to the device and not to the
  game. Start with effects on and quiet, ambience off or quieter still. The
  mute must also work before the first gesture.

## Recommendation

Synthesize everything in code on the Web Audio API: ZzFX parameter lists for
the effects, hand-written nodes for the ambience, no framework and no audio
files. One small module owns all sound; nothing else in the game touches Web
Audio.

- **Effects.** A table of named sounds, each a ZzFX parameter list. At first
  use, `buildSamples` turns the list into samples, the module copies them into
  an `AudioBuffer` and caches it. Playing is one `AudioBufferSourceNode` into
  the effects gain node.
- **Ambience.** Hand-written Web Audio nodes into the ambience gain node, as
  in "Ambience techniques" above.
- **Graph.** Sources, then an effects gain and an ambience gain, then a master
  gain, then the destination. One `AudioContext` for everything.
- **Start.** The context is created in the first `pointerdown` or `keydown`
  handler, never at module load.
- **Events.** The simulation reports what happened in a tick as data. The sound
  module plays an event only when the page is visible and the tick was not part
  of a catch-up batch. The context is suspended while the page is hidden.
- **Settings.** A master mute plus effects and ambience volumes, kept per
  device.

Two ways to get ZzFX's synth, for Sammy to choose between:

1. **Vendor `buildSamples`** as one TypeScript file with the MIT notice. No
   dependency, no second `AudioContext`, and the parameters can be typed and
   named. About 100 lines of dense math that we then own.
2. **Depend on `zzfx`** and load it with a dynamic `import()` after the first
   gesture. A static import creates an `AudioContext` at module load, which
   logs a console warning in Firefox and fails our e2e test (see "Autoplay").
   The module's own context is never used and should be closed.

Either way the result is the same sounds. Vendoring is cleaner in this
codebase.

## Open questions

- **Vendor or depend.** Copy ZzFX's `buildSamples` into the repo, or depend on
  `zzfx` and load it after the first gesture. A choice for Sammy.
- **Default state.** Sound on at first run, or off until the player turns it
  on. WCAG leans toward user-started sound; the autoplay rules already delay
  everything until the first gesture.
- **The spec.** `docs/spec.md` section 12.5 and section 16, item 1 still say
  no sound. They need an edit if this goes ahead.
- **Not verified: `resume()` from `visibilitychange`.** Whether every browser
  resumes a suspended context from that handler without a fresh gesture.
- **Not verified: Firefox with a suspended context.** MDN says Firefox does
  not throttle a tab that "contains an AudioContext". Whether a suspended
  context still counts was not found. If it does, close the context on hide
  and make a new one on return.
- **Not verified: Safari.** Its background timer throttling, its exact rule
  for starting Web Audio, and all iOS behavior. No WebKit-authored page was
  found for the first two, and no device was tested.
- **Not verified: file decoding in desktop Firefox**, given the headless
  result above.
- **Not verified: Strudel's repository activity.** Codeberg was unreachable.
- **Not verified: sizes after Vite's build**, for every library.
- **Not verified: Tone.js with `clockSource: "timeout"`** under our CSP.
- **Not run: ZzFXM, Strudel, Elementary, Csound and Faust.** Their CSP results
  are from reading the published source, backed by the generic local test of
  the features they use.
- **Not run: Biome on a ZzFX array.** The sparse-array finding is from Biome's
  documentation.
- **Weaker sources.** The two iOS mute-switch claims rest on comments in
  WebKit's bug tracker, not on WebKit documentation.
