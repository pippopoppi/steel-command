#!/usr/bin/env python3
"""Render og.png (1200x630 Twitter/OpenGraph card) and icon-180.png with Pillow."""
import os
import random

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
random.seed(5)


def font(size, bold=True):
    for c in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def building(d, x, y, w, h, col, team):
    d.rounded_rectangle((x + 5, y + 7, x + w + 5, y + h + 7), 10, fill=(0, 0, 0, 70))
    d.rounded_rectangle((x, y, x + w, y + h), 10, fill="#334155")
    d.rounded_rectangle((x + 5, y + 5, x + w - 5, y + h - 5), 8, fill=col)
    d.rectangle((x + 5, y + 5, x + w - 5, y + 12), fill=team)


def tank(d, x, y, s, team, dark, angle_right=True):
    d.rounded_rectangle((x - 16 * s, y - 11 * s, x + 16 * s, y + 11 * s), int(4 * s), fill=dark)
    d.rounded_rectangle((x - 13 * s, y - 8 * s, x + 13 * s, y + 8 * s), int(3 * s), fill=team)
    d.ellipse((x - 6 * s, y - 6 * s, x + 6 * s, y + 6 * s), fill="#1e293b")
    if angle_right:
        d.rectangle((x, y - 2 * s, x + 26 * s, y + 2 * s), fill="#94a3b8")
    else:
        d.rectangle((x - 26 * s, y - 2 * s, x, y + 2 * s), fill="#94a3b8")


def soldier(d, x, y, s, team, dark):
    d.rectangle((x - 4 * s, y + 2 * s, x - 1 * s, y + 8 * s), fill=dark)
    d.rectangle((x + 1 * s, y + 2 * s, x + 4 * s, y + 8 * s), fill=dark)
    d.rounded_rectangle((x - 5 * s, y - 5 * s, x + 5 * s, y + 4 * s), int(3 * s), fill=team)
    d.ellipse((x - 4 * s, y - 12 * s, x + 4 * s, y - 4 * s), fill=dark)


def card():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), "#b7a06a")
    d = ImageDraw.Draw(img, "RGBA")
    for r in range(8):
        for c in range(15):
            if (r + c) % 2 == 0:
                d.rectangle((c * 80, r * 80, c * 80 + 80, r * 80 + 80), fill=(0, 0, 0, 10))
    for i in range(10):
        x, y = random.randint(0, W), random.randint(0, H)
        d.ellipse((x - 30, y - 14, x + 30, y + 14), fill="#9a8657")
    # player base left
    building(d, 60, 240, 150, 120, "#64748b", "#3b82f6")
    building(d, 230, 300, 120, 90, "#ca8a04", "#3b82f6")
    building(d, 90, 400, 110, 90, "#16a34a", "#3b82f6")
    building(d, 230, 140, 140, 100, "#7c3aed", "#3b82f6")
    for i in range(6):
        d.rectangle((400 + (i % 3) * 14, 270 + (i // 3) * 20, 410 + (i % 3) * 14, 290 + (i // 3) * 20), fill="#fbbf24")
    # armies
    for i in range(5):
        tank(d, 470 + (i % 2) * 60, 180 + i * 60, 1.6, "#3b82f6", "#1e3a8a")
    for i in range(10):
        soldier(d, 420 + (i % 5) * 26, 420 + (i // 5) * 36, 1.8, "#3b82f6", "#1e3a8a")
    for i in range(5):
        tank(d, 760 - (i % 2) * 60, 190 + i * 60, 1.6, "#ef4444", "#7f1d1d", angle_right=False)
    for i in range(10):
        soldier(d, 760 + (i % 5) * 26, 420 + (i // 5) * 36, 1.8, "#ef4444", "#7f1d1d")
    for i in range(12):
        x1, y1 = random.randint(560, 640), random.randint(180, 500)
        d.line((x1, y1, x1 + random.randint(30, 90), y1 + random.randint(-20, 20)), fill="#fde047", width=3)
    # enemy base right
    building(d, 960, 120, 150, 120, "#64748b", "#ef4444")
    building(d, 900, 300, 120, 90, "#16a34a", "#ef4444")
    building(d, 1020, 380, 70, 70, "#dc2626", "#ef4444")
    banner = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(banner)
    bd.rounded_rectangle((40, 460, 740, 600), 26, fill=(12, 10, 9, 225))
    img.paste(banner, (0, 0), banner)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((70, 470), "STEEL COMMAND", font=font(70), fill="#fbbf24")
    d.text((72, 553), "Build. Harvest. Pick your General. Crush the enemy base.", font=font(25, bold=False), fill="#e7e5e4")
    img.save(os.path.join(ROOT, "og.png"), optimize=True)
    print("wrote og.png")


def icon():
    S = 180
    img = Image.new("RGB", (S, S), "#1c1917")
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle((0, 110, S, S), fill="#b7a06a")
    tank(d, 90, 100, 3.2, "#3b82f6", "#1e3a8a")
    d.polygon([(120, 20), (160, 20), (140, 60)], fill="#f59e0b")
    img.save(os.path.join(ROOT, "icon-180.png"), optimize=True)
    print("wrote icon-180.png")


if __name__ == "__main__":
    card()
    icon()
