#!/usr/bin/env python3
"""Baukasten fuer die Klassenfiguren Ruin Walk (64x64, blickt nach rechts, Licht oben links) - Version 2 (Phase 1b).

Alle Formen sind von Hand als Pixelzeilen gesetzt: Eintrag (y, x0, "pixel") = ab Spalte x0 in Zeile y.
'.' bzw. ' ' = nichts setzen, '_' = Pixel loeschen. Automatisch sind nur:
  kette()        Kettengeflecht aus Platzhaltern '#' (Licht) / '%' (Schatten)
  aussenkontur() 1 px Hauskontur #29190e um die Silhouette (4er-Nachbarschaft) + Einzelloecher schliessen
Ergebnis = Rasterdatei (.txt) als Quelle; Feinarbeit danach direkt im Raster erlaubt.

Aufruf:  python3 bau.py <ausgabe.txt> <figur>     figur: koerper | wanderer | krieger | bogen | magier | heiler
Jede Figur in einem eigenen Prozess bauen (PAL wird je Figur ergaenzt).
"""
import sys

PAL = {
    'k': '#29190e',                                                       # Aussenkontur
    '1': '#f9e0c4', '2': '#ecb98f', '3': '#c98a6b', '4': '#8f5545',       # Haut
    '5': '#c98a4e', '6': '#9c6136', '7': '#6e3f26', '8': '#4a2b1b',       # Haare (Standard braun)
    'W': '#fbf6ea', 'i': '#3b4f8c', 'I': '#7fa3e0', 'q': '#e98d7d',       # Glanz, Iris dunkel/hell, Wange
    'a': '#f3e8cf', 'b': '#d4c19b', 'c': '#a28b69', 'd': '#6e5a47',       # Leinen
    'E': '#a9a4bd', 'e': '#837d9b', 'f': '#615673', 'g': '#3e3a52',       # Hose (Standard)
    't': '#e0c290', 'l': '#ad7442', 'L': '#77492b', 'm': '#4a2b1b',       # Leder/Holz
    'x': '#fff3b0', 'y': '#f2cf55', 'Y': '#c4942e', 'z': '#87601f',       # Gold
}
STAHL = {'S': '#f4f7fb', 's': '#c3cbd8', 'G': '#8a93a8', 'D': '#566282', 'T': '#3e3a52'}

def leer():
    return [['.'] * 64 for _ in range(64)]

def setze(g, zeilen):
    """zeilen: Liste (y, x0, "pixel")."""
    for y, x0, s in zeilen:
        for i, ch in enumerate(s):
            if ch in '. ':
                continue
            x = x0 + i
            if 0 <= x < 64 and 0 <= y < 64:
                g[y][x] = '.' if ch == '_' else ch

def block(y0, x0, rows):
    """Rechteckiger Stempel -> Zeilenliste."""
    return [(y0 + i, x0, r) for i, r in enumerate(rows)]

def faerbe(zeilen, abb):
    return [(y, x, ''.join(abb.get(c, c) for c in s)) for y, x, s in zeilen]

def kette(g):
    for y in range(64):
        for x in range(64):
            c = g[y][x]
            if c in '#%':
                m = (x + (y % 2) * 2) % 4
                if c == '#':
                    g[y][x] = 's' if m == 0 else ('D' if m == 2 and y % 2 else 'G')
                else:
                    g[y][x] = 'G' if m == 0 else ('T' if m == 2 and y % 2 else 'D')

def aussenkontur(g):
    neu = [r[:] for r in g]
    for y in range(64):
        for x in range(64):
            if g[y][x] != '.':
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < 64 and 0 <= yy < 64 and g[yy][xx] not in ('.', 'k'):
                    neu[y][x] = 'k'
                    break
    for y in range(1, 63):
        for x in range(1, 63):
            if neu[y][x] == '.' and all(neu[y + dy][x + dx] != '.' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                neu[y][x] = 'k'
    return neu

def schreibe(pfad, g, kommentar=''):
    benutzt = sorted({c for r in g for c in r if c != '.'})
    with open(pfad, 'w', encoding='utf-8') as f:
        for z in kommentar.strip().split('\n'):
            if z:
                f.write('# ' + z + '\n')
        f.write('palette:\n. transparent\n')
        for c in benutzt:
            f.write(f'{c} {PAL[c]}\n')
        f.write('---\n')
        for r in g:
            f.write(''.join(r) + '\n')

# =====================================================================================================
# KOPF  (Fuellung x21..42 / y4..24 = 22 x 21 px, Kontur y3; ca. 1/3 der Figurhoehe)
# =====================================================================================================
HAUT_KOPF = [
    (4, 28, "22222222"),
    (5, 25, "22222222222222"),
    (6, 24, "2222222222222222"),
    (7, 23, "222222222222222222"),
    (8, 22, "22222222222222222222"),
] + [(y, 21, "2222222222222222222222") for y in range(9, 19)] + [
    (11, 28, "11"), (12, 28, "11"), (13, 28, "1"),
] + [(y, 42, "3") for y in range(12, 19)] + [
    (19, 25, "222222222222222223"),
    (20, 26, "22222222222222233"),
    (21, 27, "222222222222233"),
    (22, 28, "22222222222333"),
    (23, 29, "333222222333"),
    (24, 31, "33333333"),
]

# Frisuren: Hinterkopf + Pony. Haarrampe 5 (Licht) 6 7 8 (tief).
HAAR_KURZ = [                       # Standard / Wanderer: kurz, zerzaust
    (4, 28, "66666666"),
    (5, 25, "66555555566666"),
    (6, 24, "6555555555566666"),
    (7, 23, "655555555555666666"),
    (8, 22, "66555555556666666667"),
    (9, 21, "6655555666666666666777"),
    (10, 21, "6556666666666666667777"),
    (11, 21, "6666666667666676677777"),
    (12, 21, "666667776677667766777 "),
    (13, 21, "666677.77...77...77..."),
    (14, 21, "66667"), (15, 21, "66677"), (16, 21, "66677"), (17, 21, "6677"),
    (18, 21, "6677"), (19, 22, "678"), (20, 23, "788"), (21, 25, "8"),
]
HAAR_PONY = [                       # nur Pony (unter Kapuze, Helm, Hut)
    (11, 27, "6666766676677777"),
    (12, 27, "77667766776677 7"),
    (13, 28, "7...77...77"),
]

# Gesichter (Ausdruck je Klasse). Augen 3x4: Wimper k, Glanz W, Iris i/I. Brauen in Haarfarbe 7/8.
def gesicht(art):
    z = []
    # Ohr
    z += [(17, 27, "23"), (18, 27, "33"), (19, 27, "2")]
    auge_n = [(15, 30, "kkk"), (16, 30, "Wik"), (17, 30, "iIk"), (18, 30, "iI.")]
    auge_f = [(15, 37, "kkk"), (16, 37, "Wik"), (17, 37, "iIk"), (18, 37, "iI.")]
    if art == 'neutral':
        z += [(14, 30, "777"), (14, 37, "777")]
        z += auge_n + auge_f
        z += [(19, 29, "qq"), (19, 41, "3"), (21, 34, "444")]
    elif art == 'neugierig':        # Wanderer: Brauen hoch, Augen gross, Mund klein offen
        z += [(13, 30, "777"), (13, 37, "777"), (14, 30, "..."), (14, 37, "...")]
        z += auge_n + auge_f + [(18, 32, "k"), (18, 39, "k")]
        z += [(19, 29, "qq"), (19, 41, "3"), (21, 35, "44"), (22, 35, "4")]
    elif art == 'entschlossen':     # Krieger: Brauen zur Mitte gesenkt, fester Mund
        z += [(13, 30, "7"), (14, 31, "88"), (14, 37, "88"), (13, 39, "7")]
        z += [(15, 30, "kkk"), (16, 30, "Wik"), (17, 30, "iIk"), (18, 30, "...")]
        z += [(15, 37, "kkk"), (16, 37, "Wik"), (17, 37, "iIk"), (18, 37, "...")]
        z += [(19, 41, "3"), (21, 33, "4444")]
    elif art == 'konzentriert':     # Magier: Brauen gerade tief, halbe Lider, kleiner Mund
        z += [(14, 30, "888"), (14, 37, "888")]
        z += [(15, 30, "kkk"), (16, 30, "Wik"), (17, 30, "iIk"), (18, 30, "...")]
        z += [(15, 37, "kkk"), (16, 37, "Wik"), (17, 37, "iIk"), (18, 37, "...")]
        z += [(19, 41, "3"), (21, 35, "44")]
    elif art == 'sanft':            # Heiler: weiche hohe Brauen, Laecheln
        z += [(13, 31, "77"), (14, 30, "7"), (13, 37, "77"), (14, 39, "7")]
        z += auge_n + auge_f
        z += [(19, 29, "qq"), (19, 40, "q"), (20, 33, "4"), (21, 34, "444"), (20, 37, "4")]
    elif art == 'keck':             # Bogen: eine Braue hoch, schiefes Grinsen
        z += [(14, 30, "777"), (13, 37, "77"), (14, 39, "7")]
        z += auge_n + auge_f
        z += [(19, 29, "qq"), (19, 41, "3"), (21, 34, "44"), (20, 36, "4")]
    return z

def kopf(g, haar=HAAR_KURZ, art='neutral'):
    setze(g, HAUT_KOPF)
    setze(g, haar)
    setze(g, gesicht(art))

# =====================================================================================================
# KOERPER (Fuellung, Licht oben links). Schulter y25, Guertel y36-37, Saum y40, Beine y41-54, Stiefel y55-61.
# =====================================================================================================
RUMPF = [
    (25, 24, "aaaab44444bbcc"),
    (26, 23, "aaaaaab444bbbbcc"),
    (27, 23, "aaaabbbbbbbbbbcc"),
    (28, 23, "aaabbbbbbbbbbbcc"),
    (29, 23, "aabbbbbbbbbbbccc"),
    (30, 23, "abbbbbbbbbbbbccc"),
    (31, 24, "bbbbbbbbbbbbccd"),
    (32, 24, "bbbbbbbbbbbcccd"),
    (33, 24, "bbbbbbbbbbbccdd"),
    (34, 24, "cbbbbbbbbbcccdd"),
    (35, 24, "ccbbbbbbbbccddd"),
    (36, 24, "tllllllyyYlllLL"),
    (37, 24, "LLLLLLLYzzLLLmm"),
    (38, 24, "abbbbbbbbbbccdd"),
    (39, 23, "abbbbbbbbbbbcccdd"),
    (40, 23, "cccccccccccccdddd"),
]
BEIN_HINTEN = [(41, 25, "efffff"), (42, 25, "efffff"), (43, 25, "effffg"), (44, 25, "effffg"),
               (45, 24, "effffg"), (46, 24, "effffg"), (47, 24, "effffg"), (48, 24, "effffg"),
               (49, 23, "effffg"), (50, 23, "effffg"), (51, 23, "effffg"), (52, 23, "effffg"),
               (53, 22, "effffg"), (54, 22, "effffg")]
BEIN_VORNE = [(41, 30, "eEEeeeeef"), (42, 31, "EEeeeeef"), (43, 32, "EEeeeef"),
              (44, 33, "EEeeeef"), (45, 33, "EEeeeef"), (46, 33, "EEEeeef"), (47, 33, "EEEeeff"),
              (48, 34, "EEeeeef"), (49, 34, "EEeeeef"), (50, 34, "Eeeeeef"), (51, 34, "Eeeeeff"),
              (52, 35, "Eeeeeef"), (53, 35, "Eeeeeef"), (54, 35, "Eeeeeff")]
STIEFEL_HINTEN = [(55, 22, "tlllLm"), (56, 22, "LLLLLm"), (57, 22, "lllLLm"), (58, 22, "lllLLmm"),
                  (59, 21, "tllllLLLm"), (60, 21, "LLLLLLLLm"), (61, 21, "mmmmmmmmm")]
STIEFEL_VORNE = [(55, 35, "ttllllL"), (56, 35, "LLLLLLL"), (57, 35, "tllllLL"), (58, 35, "tlllllLL"),
                 (59, 35, "tlllllllLL"), (60, 35, "LLLLLLLLLLm"), (61, 35, "mmmmmmmmmmm")]
ARM_HINTEN = [(26, 22, "cc"), (27, 21, "cccd"), (28, 20, "ccccd"), (29, 20, "ccccd"),
              (30, 19, "cccccd"), (31, 19, "cccccd"), (32, 19, "cccccd"), (33, 19, "dddddd")]
HAND_HINTEN = block(34, 19, [".233.", "22333", "23334", ".334."])           # Mitte x21,y35
ARM_VORNE = [(26, 37, "bbbb"), (27, 36, "abbbbc"), (28, 36, "abbbbcc"), (29, 36, "abbbbbc"),
             (30, 37, "bbbbbcc"), (31, 37, "cbbbbbcd"), (32, 38, "cbbbbcd"), (33, 39, "ddccdd")]
FAUST = [".122.", "11223", "23333", "12223", ".233."]                          # x43..47 y30..34, Griff x45,y32
def faust(g, x=43, y=30, haut=True):
    z = FAUST if haut else [r.translate(str.maketrans('1234', 'tlLm')) for r in FAUST]
    setze(g, block(y, x, z))

def beine(g):
    for t in (BEIN_HINTEN, STIEFEL_HINTEN, BEIN_VORNE, STIEFEL_VORNE):
        setze(g, t)
    setze(g, [(41, 29, "fg"), (42, 30, "g")])                                  # Schritt

def koerper(g, haar=HAAR_KURZ, art='neutral', arm_vorne=True):
    setze(g, ARM_HINTEN); setze(g, HAND_HINTEN)
    beine(g)
    setze(g, RUMPF)
    kopf(g, haar, art)
    if arm_vorne:
        setze(g, ARM_VORNE); faust(g)

FIGUREN = {}
def fig_koerper():
    g = leer(); koerper(g); return g
FIGUREN['koerper'] = fig_koerper

if __name__ == '__main__':
    exec(open(__file__.replace('bau.py', 'klassen.py'), encoding='utf-8').read())
    aus, name = sys.argv[1], sys.argv[2]
    g = FIGUREN[name]()
    kette(g)
    g = aussenkontur(g)
    schreibe(aus, g, f'Ruin Walk Klassenfigur "{name}" - erzeugt mit _vorlage/bau.py + klassen.py, Feinarbeit im Raster erlaubt')
