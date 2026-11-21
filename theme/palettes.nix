# Each role is annotated with the Rosé Pine color it takes (rose-pine/palette).
# term: ghostty's bundled Rose Pine themes, with upstream's current text color.
{
  # Moon on pure black; Moon's own base becomes the first step up.
  rose-pine-moon = {
    label = "Rosé Pine Moon";

    term = [
      "#393552"
      "#eb6f92"
      "#3e8fb0"
      "#f6c177"
      "#9ccfd8"
      "#c4a7e7"
      "#ea9a97"
      "#e0def4"
      "#6e6a86"
      "#eb6f92"
      "#3e8fb0"
      "#f6c177"
      "#9ccfd8"
      "#c4a7e7"
      "#ea9a97"
      "#e0def4"
    ];

    base = "#000000";
    raise = "#232136"; # base
    surface = "#2a273f"; # surface
    overlay = "#393552"; # overlay
    highlight = "#44415a"; # highlight med
    muted = "#6e6a86"; # muted
    subtle = "#908caa"; # subtle
    text = "#e0def4"; # text

    accent = "#3e8fb0"; # pine
    error = "#eb6f92"; # love
    warning = "#f6c177"; # gold
    success = "#9ccfd8"; # foam
    select = "#ea9a97"; # rose
  };
}
