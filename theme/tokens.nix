# The palette as CSS custom properties, plus the type, spacing and shape every project shares.
palette:
let
  base16 = import ./base16.nix palette;
  # font-display optional, not swap: a font that arrives after the first paint would move every line it sets (DESIGN.md, Layout)
  face = family: file: weight: ''
    @font-face {
      font-family: "${family}";
      src: url("./${file}.woff2") format("woff2");
      font-weight: ${toString weight};
      font-style: normal;
      font-display: optional;
    }
  '';
  # Each line carries its own indent: Nix doesn't re-indent an interpolated block.
  vars =
    indent: p:
    builtins.concatStringsSep "\n" (
      map (role: "${indent}--${role}: ${p.${role}};") [
        "base"
        "raise"
        "surface"
        "overlay"
        "highlight"
        "muted"
        "subtle"
        "text"
        "accent"
        "error"
        "warning"
        "success"
        "select"
      ]
      ++ builtins.genList (i: "${indent}--term-${toString i}: ${builtins.elemAt p.term i};") 16
      ++ map (slot: "${indent}--${slot}: ${base16.${slot}};") (builtins.attrNames base16)
    );
in
''
  /* Generated from lsel's theme/tokens.nix; ships in @sammysul/lsel. */
  ${face "Cantarell" "cantarell-regular" 400}
  ${face "Cantarell" "cantarell-bold" 700}
  ${face "DejaVu Sans Mono" "dejavu-sans-mono-regular" 400}
  ${face "DejaVu Sans Mono" "dejavu-sans-mono-bold" 700}
  ${face "MrRobot" "mrrobot" 400}

  :root {
    color-scheme: dark;
  ${vars "  " palette}
  }

  :root {
    --font: "Cantarell", system-ui, sans-serif;
    --font-mono: "DejaVu Sans Mono", ui-monospace, monospace;
    --font-display: "MrRobot", var(--font);
    --text-xs: 12px;
    --text-sm: 14px;
    --text-md: 16px;
    --text-lg: 20px;
    --text-xl: 28px;
    --text-display: 40px;
    --leading: 1.5;

    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 24px;
    --space-6: 32px;
    --space-7: 48px;

    --border: 1px solid var(--overlay);
    --focus: 2px solid var(--accent);
    /* a control's line, padding and border; lh resolves where it's used, so a row kept for controls matches its own text */
    --control-height: calc(1lh + 2 * var(--space-1) + 2px);
    --ease: cubic-bezier(0.4, 0, 0.2, 1);
    --ease-out: cubic-bezier(0, 0, 0.2, 1);
    --motion-fast: 150ms;
    --motion: 180ms;
    --motion-slow: 300ms;
    /* main's distance from the window, which a page that fills the window subtracts */
    --frame-gap: var(--space-5);
  }
  @media (max-width: 600px) {
    :root {
      --frame-gap: var(--space-2);
    }
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
    border-radius: 0;
  }

  html,
  body {
    margin: 0;
    background: var(--base);
    color: var(--text);
    font-family: var(--font);
    font-size: var(--text-sm);
    line-height: var(--leading);
  }

  /* Ghostty's scanlines and vignette (squares' crt.glsl) over everything: rows of a 3-device-pixel period at x0.91, x1, x0.91, then x(1 - 0.4(dx² + dy²)) */
  body::after,
  dialog:modal::after {
    --lsel-lines: linear-gradient(
      rgb(0 0 0 / 0.09) 0 1px,
      transparent 1px 2px,
      rgb(0 0 0 / 0.09) 2px 3px
    );
    content: "";
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    /* 0.1ρ² across an ellipse of half the window's size: the vignette's quadratic, piecewise within 1/1000 */
    background:
      var(--lsel-lines),
      radial-gradient(
        50% 50%,
        rgb(0 0 0 / 0) 0%,
        rgb(0 0 0 / 0.004) 20%,
        rgb(0 0 0 / 0.016) 40%,
        rgb(0 0 0 / 0.036) 60%,
        rgb(0 0 0 / 0.064) 80%,
        rgb(0 0 0 / 0.1) 100%,
        rgb(0 0 0 / 0.144) 120%,
        rgb(0 0 0 / 0.196) 140%,
        rgb(0 0 0 / 0.256) 160%
      );
    background-size:
      100% 3px,
      100%;
  }
  /* the shader counts device pixels; a 3px tile, as WebKit drifts a row every 57px on a repeating gradient's 1.5px period */
  @media (min-resolution: 2dppx) {
    body::after,
    dialog:modal::after {
      --lsel-lines: linear-gradient(
        rgb(0 0 0 / 0.09) 0 0.5px,
        transparent 0.5px 1px,
        rgb(0 0 0 / 0.09) 1px 2px,
        transparent 2px 2.5px,
        rgb(0 0 0 / 0.09) 2.5px 3px
      );
    }
  }
  @media (min-resolution: 3dppx) {
    body::after,
    dialog:modal::after {
      --lsel-lines: linear-gradient(
        rgb(0 0 0 / 0.09) 0 calc(1px / 3),
        transparent calc(1px / 3) calc(2px / 3),
        rgb(0 0 0 / 0.09) calc(2px / 3) calc(4px / 3),
        transparent calc(4px / 3) calc(5px / 3),
        rgb(0 0 0 / 0.09) calc(5px / 3) calc(7px / 3),
        transparent calc(7px / 3) calc(8px / 3),
        rgb(0 0 0 / 0.09) calc(8px / 3) 3px
      );
    }
  }
  /* a modal dialog sits in the top layer, above body's lines: it draws them instead */
  body:has(dialog:modal)::after {
    content: none;
  }

  /* A page's content sits in main, in a thin frame; Page sets its max-width and padding. */
  main {
    width: calc(100% - 2 * var(--frame-gap));
    margin: var(--frame-gap) auto;
    border: var(--border);
  }

  /* The common elements, styled once so every app looks the same; components may extend, not restyle. */
  h1,
  h2 {
    margin: 0;
    line-height: 1.2;
  }
  h1 {
    font-size: var(--text-xl);
  }
  h2 {
    font-size: var(--text-lg);
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }

  button,
  select,
  input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"]),
  textarea {
    font: inherit;
    color: var(--text);
    background: var(--base);
    border: var(--border);
    padding: var(--space-1) var(--space-3);
  }
  button,
  select,
  input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"]) {
    min-height: var(--control-height);
  }
  button,
  select {
    cursor: pointer;
  }
  /* only a real pointer hovers: a tapped button would stay grey; a pressed toggle keeps its accent */
  @media (hover: hover) {
    button:hover:not(:disabled, [aria-disabled="true"], [aria-pressed="true"]),
    select:hover:not(:disabled) {
      border-color: var(--subtle);
    }
  }
  button[aria-pressed="true"] {
    border-color: var(--accent);
  }
  button:disabled,
  button[aria-disabled="true"],
  select:disabled,
  input:disabled,
  textarea:disabled {
    color: var(--muted);
    cursor: default;
  }
  [aria-busy="true"],
  [aria-busy="true"]:disabled {
    cursor: progress;
  }
  input[aria-invalid="true"],
  select[aria-invalid="true"],
  select[aria-invalid="true"]:hover,
  textarea[aria-invalid="true"] {
    border-color: var(--error);
  }

  input[type="checkbox"],
  input[type="radio"],
  input[type="range"] {
    accent-color: var(--accent);
  }

  kbd {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--subtle);
    border: var(--border);
    border-bottom-width: 2px;
    padding: 0 var(--space-1);
  }
  /* a touch screen has no keys to press */
  @media (pointer: coarse) {
    button kbd,
    a kbd {
      display: none;
    }
  }

  pre,
  code {
    font-family: var(--font-mono);
  }
  pre {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--base);
    border: var(--border);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  table {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border);
    text-align: left;
  }
  th {
    color: var(--subtle);
    font-size: var(--text-xs);
    font-weight: 400;
  }

  :focus-visible {
    outline: var(--focus);
    outline-offset: 2px;
  }

  a,
  button,
  input,
  select,
  summary,
  textarea {
    transition:
      color var(--motion-fast) var(--ease),
      background-color var(--motion-fast) var(--ease),
      border-color var(--motion-fast) var(--ease);
  }

  @keyframes lsel-appear {
    from {
      opacity: 0;
    }
  }

  /* Content that appears or swaps; re-key the element in Svelte to replay it. */
  .lsel-appear {
    animation: lsel-appear var(--motion) var(--ease-out) both;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      /* biome-ignore lint/complexity/noImportantStyles: the user's setting must beat every component's own transition */
      transition-duration: 0s !important;
      /* biome-ignore lint/complexity/noImportantStyles: the user's setting must beat every component's own animation */
      animation-duration: 0s !important;
    }
  }
''
