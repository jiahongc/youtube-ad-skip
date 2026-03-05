"""Generates icon16.png, icon48.png, icon128.png — no dependencies required."""
import struct, zlib, math

def make_png(size, draw_fn):
    raw = b''
    for y in range(size):
        raw += b'\x00'  # filter: None
        for x in range(size):
            raw += bytes(draw_fn(x, y, size))

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # RGBA, 8-bit
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw))
            + chunk(b'IEND', b''))

def in_triangle(px, py, x1, y1, x2, y2, x3, y3):
    d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2)
    d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3)
    d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)

def icon_pixel(x, y, size):
    # Centre coordinates with half-pixel offset for crisp rendering
    cx, cy = size / 2, size / 2
    r = size * 0.46
    dx, dy = x + 0.5 - cx, y + 0.5 - cy

    if math.sqrt(dx*dx + dy*dy) > r:
        return (0, 0, 0, 0)  # transparent outside circle

    px = (x + 0.5) / size
    py = (y + 0.5) / size

    # White play-arrow (triangle pointing right)
    arrow = in_triangle(px, py, 0.15, 0.22, 0.15, 0.78, 0.65, 0.50)
    # White vertical bar — "skip-to-next" bar on the right
    bar   = (0.70 <= px <= 0.83) and (0.22 <= py <= 0.78)

    if arrow or bar:
        return (255, 255, 255, 255)  # white symbol

    return (255, 0, 0, 255)  # YouTube red background

for size in [16, 48, 128]:
    path = f'icon{size}.png'
    with open(path, 'wb') as f:
        f.write(make_png(size, icon_pixel))
    print(f'Created {path}')
