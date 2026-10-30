import struct, zlib

N, SS = 1024, 3                      # output size, supersampling factor
# RAISED, not SURFACE: the icon tile is --color-raised #121C3C. --color-surface
# is #0C142E and is NOT used here -- renaming this to SURFACE would invite a
# future palette sync to "correct" it and change the shipped tile.
GROUND, RAISED, ACCENT = (0x08,0x0F,0x24), (0x12,0x1C,0x3C), (0x76,0xCF,0xFF)

TILE_HALF, TILE_EXP = 412, 5         # squircle |x/412|^5 + |y/412|^5 = 1 on (512,512)
MARK = 532                           # mark box, 51.95% of N -> spans 246..778
UNIT = MARK / 24                     # effi-mark.svg grid unit -> canvas px (22.1667)
ORIGIN = (N - MARK) / 2              # grid (0,0) is the mark box corner (246.0)

def in_squircle(x, y, n, half, p):
    return abs((x - n / 2) / half) ** p + abs((y - n / 2) / half) ** p <= 1

QUADS = [
    ((8.16, 1.50), (23.84, 1.50), (20.07, 6.76), (4.22, 6.76)),    # top bar
    ((2.49, 6.76), (8.62, 6.76), (6.66, 9.38), (0.53, 9.38)),      # fold A
    ((6.46, 9.38), (19.07, 9.38), (14.92, 14.63), (2.30, 14.63)),  # middle bar
    ((2.33, 14.63), (8.37, 14.63), (6.39, 17.27), (0.35, 17.27)),  # fold B
    ((0.37, 17.27), (20.19, 17.27), (23.98, 22.52), (5.38, 22.52)),# bottom bar
]

def inside_quad(u, v, quad):
    """Sign-consistency across the four edges. All five quads are convex."""
    sign = 0
    for i in range(4):
        ax, ay = quad[i]
        bx, by = quad[(i + 1) % 4]
        cross = (bx - ax) * (v - ay) - (by - ay) * (u - ax)
        if cross > 0:
            if sign < 0:
                return False
            sign = 1
        elif cross < 0:
            if sign > 0:
                return False
            sign = -1
    return True

def in_mark(u, v):
    """True inside effi-mark.svg, in its 24-unit grid. Five filled
    quadrilaterals -- three sheared bars and two folds -- so each piece is an
    intersection of half-planes. Corners are copied from
    ../src/assets/effi-mark.svg, which stays the master; change all five
    consumers together."""
    return any(inside_quad(u, v, q) for q in QUADS)

def sample(x, y):
    """Returns (r,g,b,a) for one supersample point."""
    if in_mark((x - ORIGIN) / UNIT, (y - ORIGIN) / UNIT):
        return ACCENT + (255,)
    if in_squircle(x, y, N, TILE_HALF, TILE_EXP):
        return RAISED + (255,)
    return GROUND + (255,)

rows = []
for py in range(N):
    row = bytearray()
    for px in range(N):
        acc = [0, 0, 0, 0]
        for sy in range(SS):
            for sx in range(SS):
                r, g, b, a = sample(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)
                acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a
        if acc[3]:
            row += bytes((acc[0] // acc[3], acc[1] // acc[3], acc[2] // acc[3], acc[3] // (SS * SS)))
        else:
            row += b"\0\0\0\0"
    rows.append(bytes(row))

raw = b"".join(b"\0" + r for r in rows)

def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", N, N, 8, 6, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(raw, 9))
       + chunk(b"IEND", b""))
open("icon-1024.png", "wb").write(png)
print("wrote icon-1024.png", len(png), "bytes")
