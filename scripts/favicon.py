# lsel-favicon <letter> [fill]: an SVG favicon, the letter in the display face (MrRobot) as a path (no font needed) on the base color.
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT = "@font@"
BASE = "@base@"
ACCENT = "@accent@"
SIZE = 32
BOX = 26  # the glyph fits in this square, centered

if len(sys.argv) not in (2, 3) or len(sys.argv[1]) != 1:
    sys.exit("usage: lsel-favicon <one letter> [fill color]")
letter = sys.argv[1]
fill = sys.argv[2] if len(sys.argv) == 3 else ACCENT

font = TTFont(FONT)
glyphs = font.getGlyphSet()
name = font.getBestCmap().get(ord(letter))
if name is None:
    sys.exit(f"MrRobot has no glyph for {letter!r}")

bounds = BoundsPen(glyphs)
glyphs[name].draw(bounds)
x0, y0, x1, y1 = bounds.bounds
scale = BOX / max(x1 - x0, y1 - y0)
# font units are y-up: flip, scale, then center the glyph's box in the icon
dx = (SIZE - (x1 - x0) * scale) / 2 - x0 * scale
dy = (SIZE + (y1 - y0) * scale) / 2 + y0 * scale
path = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
glyphs[name].draw(TransformPen(path, (scale, 0, 0, -scale, dx, dy)))

print(f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">
  <title>{letter}</title>
  <rect width="{SIZE}" height="{SIZE}" fill="{BASE}"/>
  <path d="{path.getCommands()}" fill="{fill}"/>
</svg>""")
