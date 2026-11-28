"""Recorta el fondo azul de los retratos y escribe PNG con transparencia.
No hay Pillow en esta máquina: sips convierte a BMP, esto hace la clave de color
y escribe el PNG a mano con zlib. Sin dependencias."""
import struct, zlib, sys, os

KEY = (0, 18, 190)      # el azul del fondo, medido en las propias fotos
T0, T1 = 58, 125        # por debajo de T0 es fondo; por encima de T1 es ella

def read_bmp(path):
    f = open(path, 'rb').read()
    off = struct.unpack('<I', f[10:14])[0]
    w, h = struct.unpack('<ii', f[18:26])
    bpp = struct.unpack('<H', f[28:30])[0]
    assert bpp == 24, bpp
    top_down = h < 0
    h = abs(h)
    stride = (w * 3 + 3) // 4 * 4
    rows = []
    for y in range(h):
        yy = y if top_down else h - 1 - y
        i = off + yy * stride
        rows.append(f[i:i + w * 3])
    return w, h, rows

def key_out(w, h, rows, KEY=None):
    kr, kg, kb = KEY or globals()["KEY"]
    out = []
    span = T1 - T0
    for r in rows:
        line = bytearray(w * 4)
        for x in range(w):
            b = r[x * 3]; g = r[x * 3 + 1]; rr = r[x * 3 + 2]
            dr = rr - kr; dg = g - kg; db = b - kb
            d = (dr * dr + dg * dg + db * db) ** .5
            if d <= T0:
                continue                       # fondo puro: alfa 0, ya está a cero
            a = 255 if d >= T1 else int(255 * (d - T0) / span)
            # quitar el reflejo azul del borde del pelo
            m = rr if rr > g else g
            if b > m:
                b = m + (b - m) // 4
            o = x * 4
            line[o] = rr; line[o + 1] = g; line[o + 2] = b; line[o + 3] = a
        out.append(bytes(line))
    return out

def box(w, h, rgba):
    """Caja que envuelve lo que no es transparente."""
    x0, y0, x1, y1 = w, h, -1, -1
    for y, line in enumerate(rgba):
        for x in range(w):
            if line[x * 4 + 3] > 24:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    return x0, y0, x1, y1

def scale(w, h, rgba, nw, nh):
    """Reducción por área, suficiente para bajar de 640 a ~480."""
    out = []
    for ny in range(nh):
        sy0 = ny * h // nh; sy1 = max(sy0 + 1, (ny + 1) * h // nh)
        line = bytearray(nw * 4)
        for nx in range(nw):
            sx0 = nx * w // nw; sx1 = max(sx0 + 1, (nx + 1) * w // nw)
            tr = tg = tb = ta = n = 0
            for y in range(sy0, sy1):
                r = rgba[y]
                for x in range(sx0, sx1):
                    o = x * 4; a = r[o + 3]
                    tr += r[o] * a; tg += r[o + 1] * a; tb += r[o + 2] * a
                    ta += a; n += 1
            o = nx * 4
            if ta:
                line[o] = tr // ta; line[o + 1] = tg // ta; line[o + 2] = tb // ta
            line[o + 3] = ta // n
        out.append(bytes(line))
    return out

def write_png(path, w, h, rgba):
    raw = b"".join(b"\x00" + r for r in rgba)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    png = (b"\x89PNG\r\n\x1a\n" +
           chunk(b"IHDR", struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) +
           chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    open(path, 'wb').write(png)
    return len(png)

if __name__ == "__main__":
    src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
    if len(sys.argv) > 4 and sys.argv[4]:      # clave de color a medida: r,g,b
        KEY = tuple(int(v) for v in sys.argv[4].split(","))
    crop = [int(v) for v in sys.argv[5].split(",")] if len(sys.argv) > 5 else None
    w, h, rows = read_bmp(src)
    rgba = key_out(w, h, rows, KEY)
    if crop:                                   # mismo recorte en todos: deben seguir alineados
        cx0, cy0, cx1, cy1 = crop
        rgba = [r[cx0 * 4:cx1 * 4] for r in rgba[cy0:cy1]]
        w, h = cx1 - cx0, cy1 - cy0
    x0, y0, x1, y1 = box(w, h, rgba)
    if size and size != w:
        rgba = scale(w, h, rgba, size, size * h // w)
        w, h = size, size * h // w
        x0, y0, x1, y1 = [v * size // 640 for v in (x0, y0, x1, y1)]
    n = write_png(dst, w, h, rgba)
    print(f"{os.path.basename(dst):16} {w}x{h}  {n//1024:4} KB   silueta x[{x0},{x1}] y[{y0},{y1}]")
