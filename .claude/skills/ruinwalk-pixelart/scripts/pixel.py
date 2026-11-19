#!/usr/bin/env python3
"""Ruin Walk – Pixel-Art-Werkzeug (lokal, ohne Netz; braucht nur Pillow).

  python3 pixel.py render  <raster.txt> <ausgabe.png>          Raster -> PNG (1:1, binäre Transparenz)
  python3 pixel.py import  <bild.png> <raster.txt> [--max 62]  PNG -> Raster (zum Überarbeiten vorhandener Bilder)
  python3 pixel.py pruefen <bild.png> [--typ figur|item|status|monster|karte]   Qualitätsprüfung, Exit 1 bei Fehlern
  python3 pixel.py vergleich <ausgabe.png> --alt a.png [...] --neu b.png [...]  Vorher/Nachher-Bogen (1x, 2x, Lupe; 3 Hintergründe)
  python3 pixel.py palette                                      Hauspalette ausgeben (Rasterkopf zum Kopieren)

Rasterformat (UTF-8):
  # beliebige Kommentarzeilen
  palette:
  . transparent
  k #29190e
  r #d9413f
  ---
  ..kkk...
  .krrrk..
Jedes Zeichen = 1 Pixel. Alle Zeilen gleich lang. '.' ist immer transparent.
"""
import sys, os, math, argparse
from collections import Counter
try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit('Pillow fehlt: pip install pillow')

KONTUR = (0x29, 0x19, 0x0e)          # gemessene Hauptkontur aller vorhandenen Grafiken
TYPEN = {   # Größe, Farbgrenze (gesamt), Anzeige im Spiel (px, für die 1x-Vorschau)
    'figur':   dict(w=64, h=64, farben=40, anzeige=64),
    'item':    dict(w=48, h=48, farben=24, anzeige=48),
    'status':  dict(w=32, h=32, farben=16, anzeige=28),
    'monster': dict(w=48, h=48, farben=32, anzeige=48),
    'karte':   dict(w=32, h=32, farben=20, anzeige=32),
}
# Hauspalette: Rampen mit Farbtonverschiebung (Schatten kühler/röter, Licht wärmer) – Grundlage für neue Bilder
HAUSPALETTE = [
    ('k', '#29190e', 'Kontur (Pflicht für Außenkontur)'), ('K', '#140c07', 'tiefster Schatten/Innenkontur'),
    ('w', '#f4f1e8', 'Licht/Weiß'), ('s', '#cdd7e3', 'Stahl hell'), ('g', '#a3a9b3', 'Stahl'), ('G', '#5b6270', 'Stahl dunkel'), ('D', '#363a4a', 'Stahl tief'),
    ('n', '#ebc9a2', 'Haut hell'), ('N', '#c98f6b', 'Haut'), ('h', '#8a5541', 'Haut Schatten'),
    ('t', '#dcc08e', 'Leder hell'), ('b', '#a8723f', 'Leder'), ('B', '#5e3b20', 'Leder dunkel'),
    ('y', '#f4d03f', 'Gold hell'), ('Y', '#b8902a', 'Gold'), ('z', '#7a5a1c', 'Gold Schatten'),
    ('r', '#d9413f', 'Rot'), ('R', '#8c2230', 'Rot dunkel'), ('o', '#ef8d2c', 'Orange'),
    ('l', '#6fd354', 'Grün hell'), ('e', '#3f9a4a', 'Grün'), ('L', '#235a35', 'Grün dunkel'),
    ('c', '#59d8e3', 'Türkis'), ('C', '#2a8c9c', 'Türkis dunkel'),
    ('u', '#4585e6', 'Blau'), ('U', '#26428f', 'Blau dunkel'),
    ('p', '#a65fdc', 'Violett'), ('P', '#5c3190', 'Violett dunkel'), ('m', '#f48fbc', 'Rosa'),
]

def hex2rgb(h):
    h = h.strip().lstrip('#')
    if len(h) != 6: raise ValueError(f'Farbe "{h}" ist kein #rrggbb')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def rgb2hex(c): return '#%02x%02x%02x' % c[:3]

def pixel(im):
    return list(im.get_flattened_data()) if hasattr(im, 'get_flattened_data') else list(im.getdata())

# ---------- Raster lesen/schreiben ----------
def lies_raster(pfad):
    pal, zeilen, modus = {'.': None}, [], None
    for nr, roh in enumerate(open(pfad, encoding='utf-8').read().split('\n'), 1):
        z = roh.rstrip('\r')
        if modus is None:
            if z.strip() == 'palette:': modus = 'pal'
            elif z.strip() and not z.startswith('#'): raise SystemExit(f'{pfad}:{nr}: erwartet "palette:" vor dem Raster')
            continue
        if modus == 'pal':
            if z.strip() == '---': modus = 'raster'; continue
            if not z.strip() or z.lstrip().startswith('#'): continue
            teile = z.split()
            if len(teile) < 2 or len(teile[0]) != 1: raise SystemExit(f'{pfad}:{nr}: Palettenzeile "<zeichen> <#rrggbb>" erwartet')
            if teile[0] == '.': continue
            try: pal[teile[0]] = hex2rgb(teile[1])
            except ValueError as e: raise SystemExit(f'{pfad}:{nr}: {e}')
            continue
        if z == '' and not zeilen: continue
        zeilen.append(z)
    while zeilen and zeilen[-1] == '': zeilen.pop()
    if modus != 'raster' or not zeilen: raise SystemExit(f'{pfad}: kein Raster nach "---" gefunden')
    breite = len(zeilen[0])
    for i, z in enumerate(zeilen):
        if len(z) != breite: raise SystemExit(f'{pfad}: Rasterzeile {i+1} hat {len(z)} statt {breite} Zeichen')
        for x, ch in enumerate(z):
            if ch not in pal: raise SystemExit(f'{pfad}: Rasterzeile {i+1}, Spalte {x+1}: Zeichen "{ch}" fehlt in der Palette')
    return pal, zeilen

def render(raster, ausgabe):
    pal, zeilen = lies_raster(raster)
    im = Image.new('RGBA', (len(zeilen[0]), len(zeilen)), (0, 0, 0, 0))
    px = im.load()
    for y, z in enumerate(zeilen):
        for x, ch in enumerate(z):
            if pal[ch] is not None: px[x, y] = pal[ch] + (255,)
    os.makedirs(os.path.dirname(os.path.abspath(ausgabe)), exist_ok=True)
    im.save(ausgabe)
    print(f'{ausgabe}: {im.width}x{im.height}, {len(set(z for r in zeilen for z in r) - {"."})} Farben')

ZEICHEN = 'kKwsgGDnNhtbByYzrRoleLcCuUpPmabcdefijqvxABEFHIJMOQSTVWXZ0123456789'
def importiere(bild, raster, maxf=62):
    im = Image.open(bild).convert('RGBA')
    farben = Counter(p[:3] for p in pixel(im) if p[3] >= 128)
    if len(farben) > maxf:
        raise SystemExit(f'{bild}: {len(farben)} Farben (> {maxf}). Erst reduzieren (z. B. --max erhöhen ist keine Lösung: Palette bewusst neu aufbauen).')
    zuordnung, frei = {}, [c for c in ZEICHEN]
    haus = {hex2rgb(h): z for z, h, _ in HAUSPALETTE}
    for c, _ in farben.most_common():
        z = haus.get(c)
        if z is None or z in zuordnung.values():
            z = next(f for f in frei if f not in zuordnung.values())
        zuordnung[c] = z
    with open(raster, 'w', encoding='utf-8') as f:
        f.write(f'# importiert aus {os.path.basename(bild)} ({im.width}x{im.height})\npalette:\n. transparent\n')
        for c, z in zuordnung.items(): f.write(f'{z} {rgb2hex(c)}\n')
        f.write('---\n')
        px = im.load()
        for y in range(im.height):
            f.write(''.join('.' if px[x, y][3] < 128 else zuordnung[px[x, y][:3]] for x in range(im.width)) + '\n')
    print(f'{raster}: {im.width}x{im.height}, {len(zuordnung)} Farben')

# ---------- Prüfung ----------
def helligkeit(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def pruefe(bild, typ=None):
    if not os.path.isfile(bild): raise SystemExit(f'{bild}: Datei fehlt')
    im = Image.open(bild).convert('RGBA'); w, h = im.size; px = im.load()
    fehler, warn, info = [], [], []
    t = TYPEN.get(typ) if typ else None
    if typ and not t: raise SystemExit(f'unbekannter Typ {typ} (erlaubt: {", ".join(TYPEN)})')
    if t and (w, h) != (t['w'], t['h']): fehler.append(f'Größe {w}x{h}, erwartet {t["w"]}x{t["h"]} für {typ}')
    halb = sum(1 for p in pixel(im) if 0 < p[3] < 255)
    if halb: fehler.append(f'{halb} halbtransparente Pixel (nur 0 oder 255 erlaubt – sonst Matsch auf der Karte)')
    deck = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] == 255]
    if not deck: fehler.append('Bild ist leer'); return fehler, warn, info
    farben = Counter(px[x, y][:3] for x, y in deck)
    grenze = t['farben'] if t else 48
    if len(farben) > grenze: fehler.append(f'{len(farben)} Farben (Grenze {grenze}) – Verläufe/Rauschen statt bewusster Rampen')
    info.append(f'{w}x{h}, {len(deck)} deckende Pixel, {len(farben)} Farben')
    # fast gleiche Farben (Rauschen)
    fl = list(farben)
    nah = [(a, b) for i, a in enumerate(fl) for b in fl[i+1:] if sum(abs(a[k] - b[k]) for k in range(3)) < 18]
    if nah: warn.append(f'{len(nah)} fast gleiche Farbpaare (z. B. {rgb2hex(nah[0][0])}/{rgb2hex(nah[0][1])}) – zusammenlegen')
    def opak(x, y): return 0 <= x < w and 0 <= y < h and px[x, y][3] == 255
    # Streupixel: deckend, alle 8 Nachbarn transparent
    streu = [(x, y) for x, y in deck if not any(opak(x+dx, y+dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy)]
    if streu: fehler.append(f'{len(streu)} Streupixel ohne Nachbarn, z. B. bei {streu[0]}')
    # Löcher: transparent, alle 4 Nachbarn deckend
    loch = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] == 0 and all(opak(x+dx, y+dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    if loch: warn.append(f'{len(loch)} Einzelloch/Löcher im Motiv, z. B. bei {loch[0]}')
    # Außenkontur: Randpixel (4-Nachbar transparent/Bildrand) sollen dunkel sein
    rand = [(x, y) for x, y in deck if any(not opak(x+dx, y+dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    dunkel = [p for p in rand if helligkeit(px[p][:3]) < 60]
    anteil = round(100 * len(dunkel) / len(rand)) if rand else 0
    info.append(f'Außenkontur dunkel: {anteil} % der Randpixel (Hauskontur {rgb2hex(KONTUR)})')
    if anteil < 70: warn.append(f'nur {anteil} % dunkle Außenkontur – Silhouette hebt sich auf der Karte schlecht ab (Ziel ≥ 85 %, bewusste Lichtkante erlaubt)')
    # Konturklumpen: 2x2-Block, dessen 4 Pixel ALLE dunkle Randpixel sind (doppelte Außenlinie; dunkle Innenflächen zählen nicht)
    randmenge = set(rand)
    def ist_k(x, y): return (x, y) in randmenge and helligkeit(px[x, y][:3]) < 60
    klumpen = sum(1 for x in range(w-1) for y in range(h-1) if all(ist_k(x+a, y+b) for a in (0, 1) for b in (0, 1)))
    if klumpen > max(2, len(deck) // 150): warn.append(f'{klumpen} 2x2-Klumpen in der Außenkontur – Linie wirkt dick/unsauber (Doppelpixel entfernen)')
    # Waisen: Pixel ohne gleichfarbigen 8-Nachbarn (Rauschen), Konturfarben ausgenommen
    waisen = [(x, y) for x, y in deck if helligkeit(px[x, y][:3]) >= 60 and not any(opak(x+dx, y+dy) and px[x+dx, y+dy][:3] == px[x, y][:3] for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy)]
    q = round(100 * len(waisen) / len(deck), 1)
    info.append(f'Einzelfarbpixel: {len(waisen)} ({q} %)')
    if q > 6: warn.append(f'{q} % Einzelfarbpixel – wirkt verrauscht (Glanzpunkte/Augen bewusst setzen, Rest zu Flächen zusammenfassen)')
    # Bildrand berührt / Füllgrad
    xs = [x for x, _ in deck]; ys = [y for _, y in deck]
    if min(xs) == 0 or min(ys) == 0 or max(xs) == w-1 or max(ys) == h-1: warn.append('Motiv berührt den Bildrand (Kontur abgeschnitten?) – 1 px Luft lassen')
    fuell = (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1) / (w * h)
    info.append(f'Begrenzungsrahmen {max(xs)-min(xs)+1}x{max(ys)-min(ys)+1} ({round(fuell*100)} % der Fläche)')
    if fuell < 0.35: warn.append('Motiv nutzt weniger als 35 % der Fläche – im Spiel zu klein')
    return fehler, warn, info

# ---------- Vergleichsbogen ----------
def schachbrett(w, h, a=(58, 52, 66), b=(46, 41, 52), s=8):
    im = Image.new('RGB', (w, h), a); d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if (x // s + y // s) % 2: d.rectangle([x, y, x+s-1, y+s-1], fill=b)
    return im

def vergleich(ausgabe, alt, neu):
    reihen = [('VORHER', alt), ('NACHHER', neu)] if alt else [('ENTWURF', neu)]
    bilder = [[Image.open(f).convert('RGBA') for f in fs] for _, fs in reihen]
    groesst = max(max(i.width, i.height) for r in bilder for i in r)
    lupe = max(2, 256 // groesst)
    hg = [((42, 37, 48), 'dunkel'), ((214, 206, 186), 'hell'), (None, 'Karo')]
    zelle_w = groesst * (1 + 2 + lupe) + 40
    zeile_h = groesst * lupe * len(hg) + 20 * (len(hg) + 1)
    spalten = max(len(r) for r in bilder)
    W = 90 + spalten * zelle_w; H = len(reihen) * (zeile_h + 10)
    bogen = Image.new('RGB', (W, H), (24, 21, 28)); d = ImageDraw.Draw(bogen)
    for ri, ((titel, _), r) in enumerate(zip(reihen, bilder)):
        y0 = ri * (zeile_h + 10)
        d.text((8, y0 + 8), titel, fill=(244, 208, 63))
        for si, im in enumerate(r):
            x0 = 90 + si * zelle_w
            for hi, (farbe, name) in enumerate(hg):
                yy = y0 + 20 + hi * (groesst * lupe + 20)
                flaeche_w = groesst * (1 + 2 + lupe) + 20
                feld = schachbrett(flaeche_w, groesst * lupe) if farbe is None else Image.new('RGB', (flaeche_w, groesst * lupe), farbe)
                feld.paste(im, (0, 0), im)
                g2 = im.resize((im.width * 2, im.height * 2), Image.NEAREST); feld.paste(g2, (im.width + 6, 0), g2)
                gl = im.resize((im.width * lupe, im.height * lupe), Image.NEAREST); feld.paste(gl, (im.width * 3 + 14, 0), gl)
                bogen.paste(feld, (x0, yy))
                if si == 0: d.text((8, yy + 4), name, fill=(160, 150, 170))
    bogen.save(ausgabe); print(f'{ausgabe}: Vergleichsbogen {W}x{H} (1x, 2x, Lupe {lupe}x; dunkel/hell/Karo)')

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    a = sp.add_parser('render'); a.add_argument('raster'); a.add_argument('ausgabe')
    a = sp.add_parser('import'); a.add_argument('bild'); a.add_argument('raster'); a.add_argument('--max', type=int, default=62)
    a = sp.add_parser('pruefen'); a.add_argument('bilder', nargs='+'); a.add_argument('--typ')
    a = sp.add_parser('vergleich'); a.add_argument('ausgabe'); a.add_argument('--alt', nargs='*', default=[]); a.add_argument('--neu', nargs='+', required=True)
    sp.add_parser('palette')
    x = ap.parse_args()
    if x.cmd == 'render': render(x.raster, x.ausgabe)
    elif x.cmd == 'import': importiere(x.bild, x.raster, x.max)
    elif x.cmd == 'palette':
        print('palette:\n. transparent'); [print(f'{z} {h}   # {n}') for z, h, n in HAUSPALETTE]; print('---')
    elif x.cmd == 'vergleich':
        if x.alt and len(x.alt) != len(x.neu): raise SystemExit('--alt und --neu brauchen gleich viele Bilder')
        vergleich(x.ausgabe, x.alt, x.neu)
    elif x.cmd == 'pruefen':
        schlecht = 0
        for b in x.bilder:
            f, wn, inf = pruefe(b, x.typ)
            print(f'== {b}: {"FEHLER" if f else "ok"}')
            for s in inf: print('   ·', s)
            for s in wn: print('   ! Hinweis:', s)
            for s in f: print('   ✗', s)
            schlecht += bool(f)
        sys.exit(1 if schlecht else 0)

if __name__ == '__main__': main()
