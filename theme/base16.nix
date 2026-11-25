# The palette in base16's slots: nvim (mini.base16, via squares) and yank-wars' editor both color code from these.
p:
let
  term = builtins.elemAt p.term;
in
{
  base00 = p.base;
  base01 = p.raise;
  # Visual: the terminal's selection.
  base02 = p.highlight;
  # Comments: subtle, since muted fails AA.
  base03 = p.subtle;
  base04 = term 7;
  base05 = p.text;
  base06 = term 15;
  base07 = term 15;
  base08 = p.accent;
  base09 = p.error;
  base0A = p.warning;
  base0B = p.success;
  base0C = term 6;
  base0D = term 4;
  base0E = term 5;
  base0F = p.subtle;
}
