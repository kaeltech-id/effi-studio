import struct, zlib

N, SS = 1024, 3                      # output size, supersampling factor
GROUND, MUTED, ACCENT = (0x0E,0x11,0x16), (0x8A,0x93,0xA5), (0x4C,0x9A,0xFF)
RADIUS = 224                         # rounded-square ground
DOT_D, GAP = 196, 244                # large dots: four of them must not merge at 16pt
RING_W = 36

def in_round_rect(x, y, n, r):
    cx = min(max(x, r), n - r)
    cy = min(max(y, r), n - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def sample(x, y):
    """Returns (r,g,b,a) for one supersample point."""
    if not in_round_rect(x, y, N, RADIUS):
        return (0, 0, 0, 0)
    for i in range(4):
        dx = x - (N / 2 + (i - 1.5) * GAP)
        dy = y - N / 2
        d2 = dx * dx + dy * dy
        if i < 3:                                     # completed: filled muted
            if d2 <= (DOT_D / 2) ** 2:
                return MUTED + (255,)
        else:                                         # current: ringed accent
            outer, inner = DOT_D / 2, DOT_D / 2 - RING_W
            if inner * inner <= d2 <= outer * outer:
                return ACCENT + (255,)
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
