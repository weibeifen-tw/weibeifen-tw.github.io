#!/usr/bin/env python3
"""Render already-approved 3:4 SVG novel covers into 1200x630 JPG share cards.

Only generated during Jekyll builds. Does not edit original SVG covers or novel text.
An existing custom /assets/og/<id>.jpg takes precedence and is never overwritten.
"""
from io import BytesIO
from pathlib import Path
import re
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import cairosvg

ROOT = Path(__file__).resolve().parents[2]
COVERS = ROOT / "assets" / "covers"
OUT = ROOT / "assets" / "og"
OUT.mkdir(parents=True, exist_ok=True)

def render(cover: Path) -> None:
    target = OUT / (cover.stem + ".jpg")
    if target.exists():
        # A manually approved JPG is preserved (e.g. shanhai.jpg).
        with Image.open(target) as saved:
            saved.verify()
        print(f"KEEP {target.relative_to(ROOT)}")
        return
    svg = cover.read_text(encoding="utf-8")
    # Never allow an SVG to fetch external content while rasterizing.
    if re.search(r'(?:href|xlink:href)\s*=\s*["\']\s*(?:https?:|file:|/|\.\.)', svg, re.I):
        raise ValueError(f"Cover contains external image reference: {cover.name}")
    png = cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=480, output_height=640)
    with Image.open(BytesIO(png)) as source:
        cover_image = source.convert("RGB")
    # Quiet, photographic-safe surround; the full original cover remains legible.
    bg = ImageOps.fit(cover_image, (1200, 630), method=Image.Resampling.LANCZOS)
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(34))).enhance(0.57)
    page = Image.new("RGB", (1200, 630), "#f2eee8")
    page.paste(bg, (0, 0))
    main = ImageOps.contain(cover_image, (440, 570), method=Image.Resampling.LANCZOS)
    page.paste(main, ((1200 - main.width) // 2, (630 - main.height) // 2))
    page.save(target, "JPEG", quality=88, optimize=True, progressive=True)
    with Image.open(target) as image:
        assert image.size == (1200, 630) and image.format == "JPEG"
    print(f"CREATE {target.relative_to(ROOT)}")

def main():
    covers = sorted(COVERS.glob("*.svg"))
    assert covers, "No novel covers were found"
    for cover in covers:
        render(cover)
    print(f"OG preview assets ready: {len(covers)} novel covers")

if __name__ == "__main__":
    main()
