"""Generate icon16.png, icon48.png, icon128.png (pure Python, no dependencies)."""
import math
import struct
import zlib


def make_png(size, draw_fn):
    raw = b""
    for y in range(size):
        raw += b"\x00"  # PNG scanline filter: None
        for x in range(size):
            raw += bytes(draw_fn(x, y, size))

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # RGBA, 8-bit
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def in_triangle(px, py, x1, y1, x2, y2, x3, y3):
    d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2)
    d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3)
    d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def rounded_rect_alpha(px, py, left, top, right, bottom, radius):
    cx = min(max(px, left + radius), right - radius)
    cy = min(max(py, top + radius), bottom - radius)
    d = math.hypot(px - cx, py - cy)
    return d <= radius


def in_segment(px, py, x1, y1, x2, y2, thickness):
    vx, vy = x2 - x1, y2 - y1
    wx, wy = px - x1, py - y1
    c1 = vx * wx + vy * wy
    if c1 <= 0:
      return math.hypot(px - x1, py - y1) <= thickness
    c2 = vx * vx + vy * vy
    if c2 <= c1:
      return math.hypot(px - x2, py - y2) <= thickness
    b = c1 / c2
    bx, by = x1 + b * vx, y1 + b * vy
    return math.hypot(px - bx, py - by) <= thickness


FONT_5X7 = {
    "A": [
        "01110",
        "10001",
        "10001",
        "11111",
        "10001",
        "10001",
        "10001",
    ],
    "D": [
        "11110",
        "10001",
        "10001",
        "10001",
        "10001",
        "10001",
        "11110",
    ],
    "S": [
        "01111",
        "10000",
        "10000",
        "01110",
        "00001",
        "00001",
        "11110",
    ],
}


def text_pixel(px, py):
    # Text bounds in normalized coordinates (center badge).
    left, top = 0.315, 0.39
    scale = 0.021
    spacing = 0.012
    text = "ADS"
    cursor = left
    for ch in text:
        glyph = FONT_5X7[ch]
        gw = 5 * scale
        gh = 7 * scale
        if cursor <= px <= cursor + gw and top <= py <= top + gh:
            gx = int((px - cursor) / scale)
            gy = int((py - top) / scale)
            gx = min(4, max(0, gx))
            gy = min(6, max(0, gy))
            return glyph[gy][gx] == "1"
        cursor += gw + spacing
    return False


def icon_pixel(x, y, size):
    px = (x + 0.5) / size
    py = (y + 0.5) / size

    # Rounded-square background mask.
    if not rounded_rect_alpha(px, py, 0.06, 0.06, 0.94, 0.94, 0.20):
        return (0, 0, 0, 0)

    # Red gradient background with subtle highlight.
    grad = 1.0 - (0.65 * py + 0.35 * px)
    grad = max(0.0, min(1.0, grad))
    r = int(190 + 65 * grad)
    g = int(8 + 30 * grad)
    b = int(10 + 20 * grad)

    highlight = max(0.0, 1.0 - ((px - 0.28) ** 2 + (py - 0.20) ** 2) / 0.08)
    r = min(255, int(r + 12 * highlight))
    g = min(255, int(g + 6 * highlight))
    b = min(255, int(b + 6 * highlight))

    # ADS label area.
    badge = rounded_rect_alpha(px, py, 0.28, 0.37, 0.65, 0.58, 0.05)
    if badge:
        if text_pixel(px, py):
            return (255, 255, 255, 255)
        # light badge fill
        br = min(255, r + 25)
        bg = min(255, g + 25)
        bb = min(255, b + 25)
        # strike-through over ADS
        if in_segment(px, py, 0.30, 0.56, 0.63, 0.39, 0.012):
            return (255, 255, 255, 255)
        return (br, bg, bb, 255)

    # Skip symbol: two play triangles + right-side bar.
    tri1 = in_triangle(px, py, 0.20, 0.26, 0.20, 0.74, 0.47, 0.50)
    tri2 = in_triangle(px, py, 0.43, 0.26, 0.43, 0.74, 0.70, 0.50)
    bar = (0.73 <= px <= 0.81) and (0.26 <= py <= 0.74)
    symbol = tri1 or tri2 or bar

    if symbol:
        return (255, 255, 255, 255)
    return (r, g, b, 255)


for size in (16, 48, 128):
    out = f"icon{size}.png"
    with open(out, "wb") as f:
        f.write(make_png(size, icon_pixel))
    print(f"Created {out}")
