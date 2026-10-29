import struct, zlib

N, SS = 1024, 3                      # output size, supersampling factor
GROUND, SURFACE, COPPER = (0x10,0x11,0x12), (0x17,0x19,0x1B), (0xE5,0xA1,0x7C)

TILE_HALF, TILE_EXP = 412, 5         # squircle |x/412|^5 + |y/412|^5 = 1 on (512,512)
MARK = 532                           # mark box, 51.95% of N -> spans 246..778
UNIT = MARK / 18                     # effi-mark.svg grid unit -> canvas px (29.5556)
ORIGIN = (N - MARK) / 2 - 3 * UNIT   # grid (3,3) is the mark box corner (157.3333)
MITER = 2 ** 0.5                     # 45deg miter offset for a 2-wide stroke

def in_squircle(x, y, n, half, p):
    return abs((x - n / 2) / half) ** p + abs((y - n / 2) / half) ** p <= 1

def in_mark(u, v):
    """True inside effi-mark.svg, in its 24-unit grid. Stroke 2, butt caps,
    miter joins -> every edge is a half-plane, so each piece is an intersection
    of inequalities."""
    # Open angular frame "M21 4H8L4 8v8l4 4h13": the stroke is the +-1 offset
    # hexagon minus the -1 offset hexagon. Both 45deg chamfers sit on x+y and
    # y-x, displaced by the miter offset. The right side stays open: neither
    # hexagon is bounded on the right, so nothing closes the frame.
    outer = (3 <= u <= 21 and 3 <= v <= 21
             and u + v >= 12 - MITER and v - u <= 12 + MITER)
    inner = (u >= 5 and 5 <= v <= 19
             and u + v >= 12 + MITER and v - u <= 12 - MITER)
    if outer and not inner:
        return True
    # Interior bars "M8 9h8M8 15h8"
    if 8 <= u <= 16 and (8 <= v <= 10 or 14 <= v <= 16):
        return True
    # Right-hand square "M18 10.5h3v3h-3z"
    return 18 <= u <= 21 and 10.5 <= v <= 13.5

def sample(x, y):
    """Returns (r,g,b,a) for one supersample point."""
    if in_mark((x - ORIGIN) / UNIT, (y - ORIGIN) / UNIT):
        return COPPER + (255,)
    if in_squircle(x, y, N, TILE_HALF, TILE_EXP):
        return SURFACE + (255,)
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
