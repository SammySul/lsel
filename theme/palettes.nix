# Each role is annotated with the Melange color it takes (savq/melange-nvim, palettes/dark.lua).
# term: ghostty's bundled Melange Dark.
{
  # Melange as published: each role is the color Melange itself uses for it.
  melange = {
    label = "Melange";

    term = [
      "#34302c"
      "#bd8183"
      "#78997a"
      "#e49b5d"
      "#7f91b2"
      "#b380b0"
      "#7b9695"
      "#c1a78e"
      "#867462"
      "#d47766"
      "#85b695"
      "#ebc06d"
      "#a3a9ce"
      "#cf9bc2"
      "#89b3b6"
      "#ece1d7"
    ];

    base = "#292522"; # a.bg
    raise = "#34302c"; # a.float
    surface = "#403a36"; # a.sel
    overlay = "#867462"; # a.ui, WinSeparator
    highlight = "#403a36"; # a.sel, Visual
    muted = "#867462"; # a.ui, LineNr
    subtle = "#c1a78e"; # a.com, Comment
    text = "#ece1d7"; # a.fg

    accent = "#e49b5d"; # c.yellow, Title
    error = "#bd8183"; # c.red, DiagnosticError
    warning = "#ebc06d"; # b.yellow, DiagnosticWarn
    success = "#78997a"; # c.green, DiagnosticOk
    select = "#ece1d7"; # a.fg, the cursor
  };
}
