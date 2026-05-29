"""Generate Beam's PWA icons with zero dependencies.

Draws the Beam mark: a net-carb "budget ring" (a ~78% filled arc) with a
bright beam dot at the leading edge, on a dark teal background. Rendered at
4x supersampling for smooth edges, then box-downsampled.

Run:  python scripts/make_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "icons"

BG = (15, 31, 29)          # deep teal-black
TRACK = (38, 64, 60)       # dim ring track
FILL_A = (45, 212, 191)    # teal (start)
FILL_B = (134, 239, 172)   # green (end)
DOT = (236, 253, 245)      # bright leading dot

SS = 3  # supersample factor


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render(size, pad_frac=0.0, fill_frac=0.78):
    """Return an (size x size) list of RGB tuples."""
    s = size * SS
    pad = s * pad_frac
    cx = cy = s / 2.0
    R = (s / 2.0 - pad)              # outer radius of usable area
    r_out = R * 0.92
    r_in = R * 0.62
    r_mid = (r_out + r_in) / 2.0
    ring_w = (r_out - r_in) / 2.0
    corner = s * 0.22                # rounded-square bg corner radius

    # progress arc runs clockwise from top (-90deg)
    start = -math.pi / 2
    sweep = 2 * math.pi * fill_frac
    end = start + sweep
    dot_x = cx + r_mid * math.cos(end)
    dot_y = cy + r_mid * math.sin(end)
    dot_r = ring_w * 1.15

    px = [BG] * (s * s)
    for y in range(s):
        for x in range(s):
            # rounded-square background mask
            dx = abs(x + 0.5 - cx) - (s / 2 - corner)
            dy = abs(y + 0.5 - cy) - (s / 2 - corner)
            outside = (max(dx, 0) ** 2 + max(dy, 0) ** 2) ** 0.5 - corner
            if outside > 0:
                continue  # leave transparent-equivalent? we keep opaque square
            i = y * s + x
            fx = x + 0.5 - cx
            fy = y + 0.5 - cy
            dist2 = fx * fx + fy * fy
            # Skip the costly trig for pixels nowhere near the ring or dot.
            near_dot = abs(x + 0.5 - dot_x) <= dot_r and abs(y + 0.5 - dot_y) <= dot_r
            if not near_dot and not (r_in * r_in <= dist2 <= r_out * r_out):
                continue
            dist = math.sqrt(dist2)

            # ring band
            if r_in <= dist <= r_out:
                ang = math.atan2(fy, fx)
                rel = (ang - start) % (2 * math.pi)
                if rel <= sweep:
                    px[i] = lerp(FILL_A, FILL_B, rel / sweep)
                else:
                    px[i] = TRACK

            # leading beam dot (drawn over the ring)
            if math.hypot(x + 0.5 - dot_x, y + 0.5 - dot_y) <= dot_r:
                px[i] = DOT

    # box downsample SS x SS
    out = [(0, 0, 0)] * (size * size)
    for y in range(size):
        for x in range(size):
            r = g = b = 0
            for j in range(SS):
                for k in range(SS):
                    sr, sg, sb = px[(y * SS + j) * s + (x * SS + k)]
                    r += sr
                    g += sg
                    b += sb
            n = SS * SS
            out[y * size + x] = (r // n, g // n, b // n)
    return out


def write_png(path, pixels, size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            r, g, b = pixels[y * size + x]
            raw += bytes((r, g, b))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-192.png", 192, 0.0),
        ("icon-512.png", 512, 0.0),
        ("icon-maskable-512.png", 512, 0.16),  # safe-zone padding for maskable
        ("apple-touch-icon.png", 180, 0.06),
        ("favicon-32.png", 32, 0.0),
    ]
    for name, size, pad in targets:
        write_png(OUT / name, render(size, pad_frac=pad), size)
        print("wrote", name)


if __name__ == "__main__":
    main()
