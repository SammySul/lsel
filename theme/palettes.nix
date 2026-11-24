# Each role is annotated with the Modus colour it takes (modus-themes.el).
# term: upstream's fg-term-* slots, resolved against each palette.
{
  modus-operandi-tinted = {
    label = "Modus Operandi Tinted";

    term = [
      "#000000"
      "#a60000"
      "#006300"
      "#6d5000"
      "#0031a9"
      "#721045"
      "#00598b"
      "#a6a6a6"
      "#595959"
      "#972500"
      "#00603f"
      "#894000"
      "#3546c2"
      "#531ab6"
      "#005f5f"
      "#ffffff"
    ];

    # Light inverts the ramp: each step away from base is darker, not lighter.
    base = "#fbf7f0"; # bg-main
    raise = "#efe9dd"; # bg-dim
    surface = "#dfd5cf"; # bg-inactive
    overlay = "#c9b9b0"; # bg-active
    highlight = "#f1d5d0"; # bg-hl-line
    muted = "#9f9690"; # border
    subtle = "#595959"; # fg-dim
    text = "#000000"; # fg-main

    accent = "#3546c2"; # blue-warmer
    error = "#a60000"; # red
    warning = "#6d5000"; # yellow
    success = "#006300"; # green
    select = "#531ab6"; # magenta-cooler
  };

  modus-vivendi = {
    label = "Modus Vivendi";

    term = [
      "#000000"
      "#ff5f59"
      "#44bc44"
      "#d0bc00"
      "#2fafff"
      "#feacd0"
      "#00d3d0"
      "#a6a6a6"
      "#595959"
      "#ff6b55"
      "#00c06f"
      "#fec43f"
      "#79a8ff"
      "#b6a0ff"
      "#6ae4b9"
      "#ffffff"
    ];

    base = "#000000"; # bg-main
    raise = "#1e1e1e"; # bg-dim
    surface = "#303030"; # bg-inactive
    overlay = "#535353"; # bg-active
    highlight = "#2f3849"; # bg-hl-line
    muted = "#646464"; # border
    subtle = "#989898"; # fg-dim
    text = "#ffffff"; # fg-main

    accent = "#79a8ff"; # blue-warmer
    error = "#ff5f59"; # red
    warning = "#d0bc00"; # yellow
    success = "#44bc44"; # green
    select = "#b6a0ff"; # magenta-cooler
  };
}
