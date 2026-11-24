# The palette as CSS custom properties, plus the type, spacing and shape every project shares.
scheme:
let
  face = family: file: weight: ''
    @font-face {
      font-family: "${family}";
      src: url("./${file}.woff2") format("woff2");
      font-weight: ${toString weight};
      font-style: normal;
      font-display: swap;
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
    );
in
''
  /* Generated from lsel's theme/tokens.nix; ships in @sammysul/lsel. */
  ${face "Aporetic Sans" "aporetic-sans-regular" 400}
  ${face "Aporetic Sans" "aporetic-sans-bold" 700}
  ${face "Aporetic Sans Mono" "aporetic-sans-mono-regular" 400}
  ${face "Aporetic Sans Mono" "aporetic-sans-mono-bold" 700}

  /* Light is the base; the system's dark setting swaps every colour at once. */
  :root {
    color-scheme: light dark;
  ${vars "  " scheme.light}
  }
  @media (prefers-color-scheme: dark) {
    :root {
  ${vars "    " scheme.dark}
    }
  }

  :root {
    --font: "Aporetic Sans", system-ui, sans-serif;
    --font-mono: "Aporetic Sans Mono", ui-monospace, monospace;
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
    --ease: cubic-bezier(0.2, 0, 0, 1);
    --motion-fast: 150ms;
    --motion: 200ms;
    --motion-slow: 300ms;
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

  /* A page's content sits in main, in a thin frame; the app sets max-width and padding, never margin. */
  main {
    width: calc(100% - 2 * var(--space-5));
    margin: var(--space-5) auto;
    border: var(--border);
  }
  @media (max-width: 600px) {
    main {
      width: calc(100% - 2 * var(--space-2));
      margin: var(--space-2) auto;
    }
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
  select {
    cursor: pointer;
  }
  button:hover:not(:disabled, [aria-disabled="true"]),
  select:hover:not(:disabled) {
    border-color: var(--subtle);
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
      border-color var(--motion-fast) var(--ease),
      outline-color var(--motion-fast) var(--ease);
  }

  @keyframes lsel-appear {
    from {
      opacity: 0;
    }
  }

  /* Content that appears or swaps; re-key the element in Svelte to replay it. */
  .lsel-appear {
    animation: lsel-appear var(--motion) var(--ease) both;
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
