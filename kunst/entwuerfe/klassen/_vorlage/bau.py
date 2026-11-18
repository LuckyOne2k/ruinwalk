#!/usr/bin/env python3
"""Baukasten fuer die Klassenfiguren (64x64, blickt nach rechts, Licht oben links).

Zeichnet NICHTS automatisch "schoen" - alle Formen sind unten als ASCII-Stempel von Hand gesetzt.
Automatisch sind nur zwei Hilfen:
  1. aussenkontur(): 1 px Hauskontur #29190e um die Gesamtsilhouette (4er-Nachbarschaft).
  2. Stempel werden in Reihenfolge (hinten -> vorne) uebereinandergelegt; '.' im Stempel = nichts setzen,
     '_' = Pixel loeschen (transparent).
Ergebnis ist eine Rasterdatei (.txt) = Quelle; Feinarbeit danach direkt im Raster.

Aufruf:  python3 bau.py <ausgabe.txt> <figur>      (figur: koerper, wanderer, krieger, bogen, magier, heiler)
"""
import sys

# ---------------- Hauspalette Klassenfiguren (verbindlich, siehe STIL.md) ----------------
PAL = {
    'k': '#29190e',                                                   # Aussenkontur
    # Haut (4 Stufen)
    '1': '#f9e0c4', '2': '#ecb98f', '3': '#c98a6b', '4': '#8f5545',
    # Haare braun (4)
    '5': '#c98a4e', '6': '#9c6136', '7': '#6e3f26', '8': '#4a2b1b',
    # Augen
    'W': '#fbf6ea', 'q': '#e98d7d', 'i': '#3b4f8c', 'I': '#7fa3e0',                                   # Glanzpunkt, Wangenroete
}

def leer():
    return [['.'] * 64 for _ in range(64)]

def stempel(g, x, y, zeilen):
    for dy, z in enumerate(zeilen):
        for dx, ch in enumerate(z):
            if ch == '.' or ch == ' ':
                continue
            yy, xx = y + dy, x + dx
            if 0 <= yy < 64 and 0 <= xx < 64:
                g[yy][xx] = '.' if ch == '_' else ch

def kette(g):
    """Kettengeflecht: '#' = Lichtseite, '%' = Schattenseite. Ringmuster mit Versatz je Zeile."""
    for y in range(64):
        for x in range(64):
            c = g[y][x]
            if c in '#%':
                m = (x + (y % 2) * 2) % 4
                if c == '#':
                    g[y][x] = 's' if m == 0 else ('D' if m == 2 and y % 2 else 'G')
                else:
                    g[y][x] = 'G' if m == 0 else ('T' if m == 2 and y % 2 else 'D')

def aussenkontur(g, ausnahmen=()):
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
    # Einzelloecher (transparent, ringsum deckend) mit Kontur schliessen
    for y in range(1, 63):
        for x in range(1, 63):
            if neu[y][x] == '.' and all(neu[y + dy][x + dx] != '.' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                neu[y][x] = 'k'
    return neu

def schreibe(pfad, g, pal, kommentar=''):
    benutzt = sorted({c for r in g for c in r if c != '.'})
    with open(pfad, 'w', encoding='utf-8') as f:
        if kommentar:
            for z in kommentar.strip().split('\n'):
                f.write('# ' + z + '\n')
        f.write('palette:\n. transparent\n')
        for c in benutzt:
            f.write(f'{c} {pal[c]}\n')
        f.write('---\n')
        for r in g:
            f.write(''.join(r) + '\n')

# =====================================================================================
# GRUNDKOERPER (Fuellflaechen ohne Aussenkontur; Kontur kommt am Ende automatisch)
# Koordinaten sind die linke obere Ecke des Stempels.
# =====================================================================================

KOPF = (24, 6, [            # 18 x 17, Schaedel x24..41 / y6..22, Gesicht 3/4 nach rechts
    "....666666666.....",
    "..66555555566666..",
    ".6655555555666666.",
    "665555556666666667",
    "655566666666666677",
    "666666667667667777",
    "666667733373337337",
    "666677311222222222",
    "66677312kk2222kk22",
    "66672312Wi2222Wi22",
    "66672322iI2222iI23",
    "6677322qq222222222",
    "677832222222222233",
    ".7783222222442223.",
    "..88322222222233..",
    "...833222222233...",
    "......33333333....",
])

PAL.update({
    # Leinen/Grundstoff (4)
    'a': '#f3e8cf', 'b': '#d4c19b', 'c': '#a28b69', 'd': '#6e5a47',
    # Hose neutral (4)
    'E': '#a9a4bd', 'e': '#837d9b', 'f': '#615673', 'g': '#3e3a52',
    # Leder (4)
    't': '#e0c290', 'l': '#ad7442', 'L': '#77492b', 'm': '#4a2b1b',
    # Gold (4)
    'x': '#fff3b0', 'y': '#f2cf55', 'Y': '#c4942e', 'z': '#87601f',
})

HALS = (30, 23, ["3344"])

ARM_HINTEN = (18, 26, [
    "....cc.",
    "...cccd",
    "..ccccd",
    ".cccccd",
    ".cccccd",
    ".cccccd",
    ".cccccd",
    ".dccccd",
    ".ddddd.",
])
HAND_HINTEN = (19, 35, [
    ".233.",
    "22333",
    "23334",
    ".334.",
])

BEINE = (24, 42, [
    ".fffffgEEeeeeef.",
    ".fffffgEEeeeeef.",
    ".ffffgg.EEeeeeff",
    ".ffffg..Eeeeeeff",
    "ffffgg..Eeeeeeff",
    "fffffg..EEeeeeff",
    "fffggg..EEEeeeff",
    "ffffgg..EEeeeeff",
    "ffffgg..Eeeeefff",
    "ffffgg..Eeeeeeff",
    "fffffg..Eeeeeeff",
    "fffffg..Eeeeeeff",
    "fffffg..EEeeeeff",
])

STIEFEL_HINTEN = (23, 55, [
    ".tlllLm..",
    ".LLLLLm..",
    ".lllLLm..",
    ".lllLLmm.",
    "tllllLLLm",
    "LLLLLLLLm",
    "mmmmmmmmm",
])
STIEFEL_VORNE = (32, 55, [
    "ttlllllL...",
    "LLLLLLLL...",
    "tllllLLL...",
    "tlllllLLL..",
    "tlllllllLL.",
    "LLLLLLLLLLm",
    "mmmmmmmmmmm",
])

RUMPF = (23, 24, [
    "....aab3334bbc....",
    "..aaaabb44bbbbcc..",
    ".aaaaabbbbbbbbbcc.",
    ".aabbbbbbbbbbbbcc.",
    ".abbbbbbbbbbbbbcc.",
    ".abbbbbbbbbbbbccc.",
    ".abbbbbbbbbbbbccc.",
    ".abbbbbbbbbbbbccc.",
    ".bbbbbbbbbbbbcccd.",
    ".bbbbbbbbbbbcccdd.",
    ".bbbbbbbbbbbccddd.",
    ".cbbbbbbbbbbccddd.",
    ".ccbbbbbbbbcccddd.",
    ".tllllllyyYllllLL.",
    ".LLLLLLLYzzLLLLmm.",
    ".abbbbbbbbbbccddd.",
    "abbbbbbbbbbbcccddd",
    "ccccccccccccdddddd",
])

ARM_VORNE = (36, 25, [
    "..bbbb....",
    ".abbbbc...",
    "aabbbbcc..",
    "abbbbbcc..",
    "abbbbbcc..",
    ".bbbbbccd.",
    ".cbbbbbcd.",
    "..cbbbbbcd",
    "...ddcccdd",
])
HAND_VORNE = (42, 34, [
    ".122.",
    "11223",
    "23333",
    "12223",
    ".233.",
])

def koerper(g, mit_haaren=True, arm_vorne=True):
    for teil in (ARM_HINTEN, HAND_HINTEN, BEINE, STIEFEL_HINTEN, STIEFEL_VORNE, RUMPF, HALS):
        stempel(g, *teil)
    stempel(g, *KOPF)
    if arm_vorne:
        stempel(g, *ARM_VORNE)
        stempel(g, *HAND_VORNE)

FIGUREN = {}

def fig_koerper():
    g = leer(); koerper(g); return g
FIGUREN['koerper'] = fig_koerper



def umfaerben(teil, abb):
    x, y, z = teil
    return (x, y, [''.join(abb.get(c, c) for c in r) for r in z])

STOFF = {'a': 'A', 'b': 'B', 'c': 'C', 'd': 'F'}     # Grundstoff -> Klassenstoff

STAHL = {'S': '#f4f7fb', 's': '#c3cbd8', 'G': '#8a93a8', 'D': '#566282', 'T': '#3e3a52'}

def kapuze(g):
    """Kapuze ueber dem Kopf (Klassenstoff A-F). Gesicht x30..41 bleibt frei, Spitze hinten oben."""
    stempel(g, 22, 4, [
        "....CBBBBBBC.........",
        "..CCBAAABBBBBBBC.....",
        ".CBAAABBBBBBBBBBC....",
        ".BAABBBBBBBBBBBBBBC..",
        "CBABBBBBBBBBBBBBBBBC.",
        "BAABBBBBBBBBBBBBBBBBC",
        "BABBBBBBBBBBBBBBBBBBC",
        "BABBBBBCFFFFFFFFFFFFC",
        "BABBBBC3333333333333.",
        "BABBBBC..............",
        "BABBBBC..............",
        "BABBBBC..............",
        "BBBBBBC..............",
        "BBBBBBC..............",
        "CBBBBBC..............",
        "CBBBBBBC.............",
        ".CBBBBBC.............",
        ".CBBBBBBC............",
        ".CCBBBBBBC...........",
        "..CCBBBBBBCCCCCCCC...",
        "...CCBBBBBBBBBBBBC...",
    ])

def faust(g, x=42, y=34, haut=True):
    z = [".122.", "11223", "23333", "12223", ".233."]
    if not haut:
        z = [r.translate(str.maketrans('1234', 'tlLm')) for r in z]
    stempel(g, x, y, z)

# ------------------------------------------------------------------ WANDERER
def fig_wanderer():
    PAL.update({'A': '#c4a57a', 'B': '#8f7150', 'C': '#644b38', 'F': '#40302b',      # Wollmantel braun
                'N': '#a8ad74', 'O': '#7b824f', 'P': '#555c3b', 'R': '#383e2c'})     # Kittel oliv
    g = leer()
    # Mantel hinten
    stempel(g, 17, 25, [
        ".....CBB", "....CBBB", "...CBBBB", "...CBBBB", "..CBBBBB", "..CBBBBB", "..CBBBBB",
        ".CBBBBBB", ".CBBBBBB", ".CBBBBBB", ".CBBBBBB", "CCBBBBBB", "CCBBBBBB", "CCBBBBBB",
        "CCCBBBBB", "FCCBBBBB", "FCCCBBBB", "FFCCCBBB", "FFFCCCBB", "FFFFCCCC", ".FFFFCCC",
        "..FFFFCC", "....FFF.",
    ])
    # Bettrolle
    stempel(g, 14, 24, [
        "..tttl..", ".ttllLl.", "ttlLlLLl", "tlLlLLmL", "llLmLLmL", ".LLLmmL.", "..LmmL..",
    ])
    koerper(g)
    # Kittel (oliv)
    stempel(g, 23, 25, [
        "..NNNNb433OOOOP...",
        ".NNNNOOb3bOOOOPP..",
        ".NNOOOOObOOOOOPP..",
        ".NOOOOOOOOOOOOPPP.",
        ".NOOOOOOOOOOOOPPP.",
        ".NOOOOOOOOOOOPPPR.",
        ".OOOOOOOOOOOOPPPR.",
        ".OOOOOOOOOOOPPPRR.",
        ".OOOOOOOOOOOPPRRR.",
        ".OOOOOOOOOOPPPRRR.",
        ".POOOOOOOOOPPPRRR.",
        ".PPOOOOOOOPPPRRRR.",
        "..................",
        "..................",
        ".NOOOOOOOOOOPPRRR.",
        "NOOOOOOOOOOOPPPRRR",
        "OOOOOOOOOOOOPPRRRR",
        "PPPPPPPPPPPPRRRRRR",
    ])
    stempel(g, *umfaerben(ARM_VORNE, {'a': 'N', 'b': 'O', 'c': 'P', 'd': 'R'}))
    kapuze(g)
    # Umhang auf den Schultern
    stempel(g, 21, 24, [
        "..CBBBBBBBC.........CC",
        ".CBBBBBBBC.........CBB",
        "CBBBBBBBC..........CBB",
        "CBBBBBBC...........CBC",
        "CBBBBBC.............C.",
        "CCBBBC................",
        ".CCC..................",
    ])
    stempel(g, 30, 25, ["yY", "Yz"])                     # Fibel
    stempel(g, 28, 27, [                                  # Riemen der Bettrolle
        "L.........", "LL........", ".LL.......", "..LL......", "...LL.....",
        "....LL....", ".....LL...", "......LL..", ".......LL.", "........L.",
    ])
    stempel(g, 34, 39, ["tlL", "llL", "lLL", ".L."])     # Steinbeutel
    # Gabelschleuder
    stempel(g, 39, 20, [
        "tl......tl",
        "tlmmEEmmlL",
        "tl..ee..lL",
        "ll......lL",
        ".l......L.",
        ".tl....lL.",
        "..tl..lL..",
        "..tllllL..",
        "...tlLL...",
        "....lL....",
        "....lL....",
        "....lL....",
        "....lL....",
        "....lL....",
    ])
    faust(g)
    stempel(g, 43, 39, [".lL", ".LL", "..m"])
    return g
FIGUREN['wanderer'] = fig_wanderer

# ------------------------------------------------------------------ KRIEGER
def fig_krieger():
    PAL.update({'A': '#ee6f55', 'B': '#c63c3c', 'C': '#8c2436', 'F': '#56192b'})     # Waffenrock rot
    PAL.update(STAHL)
    g = leer()
    koerper(g, arm_vorne=False)
    # Kettenhemd-Aermel hinten
    stempel(g, 18, 26, [
        "....%%.", "...%%%%", "..%%%%%", ".%%%%%%", ".%%%%%%", ".%%%%%%", ".%%%%%%", ".DDDDDD", ".lllLL.",
    ])
    # Rumpf: Kettenhemd + Waffenrock (rot, Licht links, Falte rechts der Mitte)
    stempel(g, 23, 24, [
        "..###########%%...",
        ".############%%%..",
        ".###AABBBBBBC#%%..",
        ".##AABBBBBCBBC%%..",
        ".##ABBBBBBCABC%%..",
        ".##ABBBBBBCABC%%..",
        ".##ABBBBBBCABCC%..",
        ".##ABBBBBBCBBCC%..",
        ".##ABBBBBCBBBCC%..",
        ".##BBBBBBCBBBCCF%.",
        ".#%BBBBBBCBBCCCF%.",
        ".%%CBBBBBCBBCCFF%.",
        ".%%CBBBBBCBBCCFF%.",
        ".tllllllyyYllllLL.",
        ".LLLLLLLYzzLLLLmm.",
        ".##%ABBBBCBBCCF%%.",
        ".##%ABBBBCBBCCF%%.",
        "###%ABBBBCBBCCF%%%",
        "###%ABBBBCBBCCF%%%",
        "##%%ABBBBCBBCCF%%%",
        "DDDDABBBBCBBCCFDDD",
        "....ABBBBCBBCCF...",
        "....CCCCCFCCFFF...",
    ])
    # Helm + Kettenhaube
    stempel(g, 21, 2, [
        "........GssssGG.......",
        "......GsSSssssGGD.....",
        ".....GsSsssssssGGD....",
        "....GsSsssssssssGGD...",
        "....sSssssssssssGGGD..",
        "...GsssssssssssssGGD..",
        "...GsssssssssssssGGDD.",
        "..GsssssssssssssGGGDD.",
        "..DsssssssssssssssGGD.",
        "..TGSGGGSGGGSGGGSGGDT.",
        ".####%%T..............",
        ".####%%D..............",
        ".###%%%D..............",
        ".###%%%D..............",
        ".###%%%D..............",
        ".###%%%D..............",
        ".###%%%D..............",
        ".###%%%D..............",
        ".###%%%%D.............",
        ".%##%%%%%D............",
        "..%%%%%%%%DDDDDDDDD...",
        "..##########%%%%%%%...",
        "...%%%%%%%%%%%%%%%....",
    ])
    # Schulterstueck vorne
    stempel(g, 36, 24, [
        "..GGGGG..",
        ".GsSSssG.",
        "GsSsssGGD",
        "sssssGGDD",
        "DGGGGDDD.",
    ])
    # Arm vorne: Kettenaermel + Lederhandschuh
    stempel(g, 37, 29, [
        "####%%...",
        "####%%%..",
        ".###%%%%.",
        "..lllllLL",
        "..tlllLLm",
    ])
    kette(g)
    # Schwert: Klinge, Parierstange, Knauf
    stempel(g, 43, 9, [".S."] + ["sSG"] * 22)
    stempel(g, 43, 8, [".s."])
    stempel(g, 39, 31, [".GsssSsssGD", "DDGGGGGGGDD"])
    faust(g, haut=False)
    stempel(g, 43, 39, [".s.", "sGD", ".D."])
    # Schild (Holz mit Stahlrand, Buckel) in der hinteren Hand
    stempel(g, 10, 28, [
        ".sssssssssssssG.",
        "sStttmllllmlllGD",
        "stttlmllllmlllLD",
        "sttllmllllmlllLD",
        "sttllmllllmllLLD",
        "stlllmGsssGlLLLD",
        "stlllGsSssGDLLLD",
        "stlllsSsssGDLLLD",
        "stlllsssGGGDLLLD",
        "stlllGsGGGDDLLLD",
        "stlllmGDDDDmLLLD",
        "stlllmllllmlLLLD",
        "stlllmllllmlLLmD",
        ".stllmllllmlLLD.",
        ".stllmllllmlLmD.",
        ".GtllmllllmLLD..",
        "..stlmllllmLmD..",
        "..GtlmllllmLD...",
        "...stmllllmLD...",
        "...GtmlllLmD....",
        "....GtllLLD.....",
        ".....GtLmD......",
        "......GDD.......",
    ])
    return g
FIGUREN['krieger'] = fig_krieger


def robe(g, saum='y', mitte='Y'):
    """Langes Gewand (Klassenstoff A-F) von den Schultern bis y57, Saum y57 in Saumfarbe.
    Oberteil von Hand; Rock: Breite waechst 16 -> 22 px, zwei Falten (hell/dunkel-Paar), Mittelborte x32."""
    oben = [
        ".......AAB3344BBC.......",
        ".....AAAAB4433BBCC......",
        "....AAAAABB43BBBBCC.....",
        "....AAAABBBBmBBBBCC.....",
        "....AABBBBBBmBBBBCCC....",
        "....ABBBBBBBmBBBBCCC....",
        "....ABBBBBBBmBBBBCCC....",
        "....ABBBBBBBmBBBCCCC....",
        "....ABBBBBBBmBBBCCCF....",
        "....BBBBBBBBmBBCCCFF....",
        "....BBBBBBBBmBBCCCFF....",
        "....CBBBBBBBmBBCCFFF....",
        "....CCBBBBBBmBCCCFFF....",
        "....tllllllyyYllllLL....",
        "....LLLLLLLYzzLLLLmm....",
    ]
    stempel(g, 20, 24, [r.replace('m', mitte) for r in oben])
    breite = {39: (24, 39), 40: (23, 40), 41: (23, 40), 42: (23, 40), 43: (23, 40), 44: (22, 41),
              45: (22, 41), 46: (22, 41), 47: (22, 41), 48: (22, 41), 49: (22, 41)}
    for y in range(50, 58):
        breite[y] = (21, 42)
    for y, (x0, x1) in breite.items():
        f1 = 28 if y < 47 else 27                       # Falte links (Lichtseite)
        f2 = 36 if y < 49 else 37                       # Falte rechts (Schattenseite)
        for x in range(x0, x1 + 1):
            c = 'B'
            if x <= x0 + 1: c = 'A' if x == x0 or y < 46 else 'B'
            if x >= x1 - 3: c = 'C'
            if x >= x1 - 1: c = 'F'
            if y >= 42 and x == f1: c = 'C'
            if y >= 42 and x == f1 + 1: c = 'A'
            if y >= 44 and x == f2: c = 'F'
            if y >= 44 and x == f2 + 1: c = 'B'
            if x == 32: c = mitte
            if y == 57: c = saum if x < x1 - 1 else 'z'
            g[y][x] = c

def aermel_weit(g, trim='y'):
    """Weiter Aermel vorne (Klassenstoff) mit Saumborte; Hand kommt unten heraus."""
    stempel(g, 36, 25, [
        "..BBBB....",
        ".ABBBBC...",
        "AABBBBCC..",
        "ABBBBBCC..",
        "ABBBBBBCC.",
        ".BBBBBBCCF",
        ".CBBBBBCCF",
        "..CBBBBBCF",
        "..TTTTTTTU",
    ])
    stempel(g, 38, 33, ["TTTTTTTU".replace('T', trim).replace('U', 'z')])

def aermel_hinten(g):
    stempel(g, 17, 26, [
        ".....CC.",
        "....CCCF",
        "...CCCCF",
        "..CCCCCF",
        "..CCCCCF",
        ".CCCCCCF",
        ".CCCCCCF",
        ".CCCCCCF",
        ".FFFFFFF",
    ])

# ------------------------------------------------------------------ BOGENSCHUETZE
def fig_bogen():
    PAL.update({'A': '#9fcf63', 'B': '#5f9c45', 'C': '#3b6b3b', 'F': '#25462f',      # Jaegergruen
                'N': '#f1f1e6', 'O': '#c94a3c'})                                     # Federn
    g = leer()
    # Koecher hinten (schraeg), Pfeilfedern ueber der Schulter
    stempel(g, 14, 14, [
        ".N..O.N..",
        "NNNOOONN.",
        "NNtOOtNN.",
        ".tNtOtN..",
        "..t.t.t..",
        "..t.t.t..",
        "..LLLLLL.",
        "..tllLLm.",
        "..tllLLm.",
        "..tllLLm.",
        "..tlLLLm.",
        "..tllLLm.",
        "..tllLLm.",
        "..tllLLm.",
        "..tllLLm.",
        "..tlLLLm.",
        "..tllLLm.",
        "..tllLLm.",
        "..LLLLmm.",
        "...mmmm..",
    ])
    koerper(g)
    # Tunika gruen + Lederwams
    stempel(g, 23, 24, [
        "....AAb3344BBC....",
        "..AAAAB4433BBBCC..",
        ".AAAAtlLllLlLBCC..",
        ".AABBtllllllLLBCC.",
        ".ABBBtllllllLLBCC.",
        ".ABBBtlllllLLmBCC.",
        ".ABBBtlllllLLmCCC.",
        ".ABBBtlllllLLmCCC.",
        ".BBBBtllllLLLmCCF.",
        ".BBBBtllllLLLmCFF.",
        ".BBBBlllllLLLmCFF.",
        ".CBBBlllllLLLmCFF.",
        ".CCBBlllllLLmmCFF.",
        "..................",
        "..................",
        ".ABBBBBBBBBBCCCFF.",
        "AABBBBBBBBBBCCCFFF",
        "CCCCCCCCCCCCFFFFFF",
    ])
    stempel(g, *umfaerben(ARM_VORNE, STOFF))
    stempel(g, *umfaerben(ARM_HINTEN, {'c': 'C', 'd': 'F'}))
    stempel(g, 39, 31, ["tllLL", "tlLLm"])               # Armschiene
    kapuze(g)
    # kurzer Kapuzenkragen auf den Schultern
    stempel(g, 22, 23, [
        "..CBBBBBBBBBBBBBBC..",
        ".CBAABBBBBBBBBBBBBC.",
        "CBAABBBCBBBBBBCBBBCF",
        "CBBBBC..CBBBC..CBCF.",
        ".CCC.....CCC....FF..",
    ])
    # Schnuerung am Wams
    stempel(g, 29, 28, ["t", ".", "t", ".", "t"])
    # Bogen: Sehne x42, Holz bogenfoermig bis x47
    holz = {}
    for y in range(16, 57):
        d = min(y - 16, 56 - y)
        x = 43 if d == 0 else 44 if d <= 2 else 45 if d <= 5 else 46 if d <= 9 else 47
        holz[y] = x
    for y, x in holz.items():
        g[y][x - 1] = 't' if y < 36 else 'l'
        g[y][x] = 'L'
    for y in range(17, 56):
        if g[y][42] == '.' or y in (17, 55):
            g[y][42] = 'N'
    for y in (15, 57):
        g[y][43] = 'm'
    faust(g)
    return g
FIGUREN['bogen'] = fig_bogen

def hut_spitz(g):
    """Spitzer Magierhut (Klassenstoff A-F), Spitze knickt nach hinten (links)."""
    spannen = { 2: [(24, 34)], 3: [(21, 35)], 4: [(19, 22), (26, 36)],
               5: [(26, 37)], 6: [(25, 37)], 7: [(25, 38)], 8: [(24, 38)]}
    for y, sp in spannen.items():
        for x0, x1 in sp:
            for x in range(x0, x1 + 1):
                if x <= x0 + 1 and y >= 4:
                    c = 'A'
                elif x >= x1 - 1:
                    c = 'C'
                else:
                    c = 'B'
                if x1 - x0 < 5 and x0 < 25:   # Knick-Spitze
                    c = 'C' if x > x0 else 'F'
                g[y][x] = c
    stempel(g, 23, 9, ["yyyyxyyyyyyyyyYYz", "YYYYYYYYYYYYYYYzzz"])   # Hutband
    stempel(g, 17, 11, [
        "..AAAABBBBBBBBBBBBBBBBBBBBCCC",
        "AABBBBBBBBBBBBBBBBBBBBBBBBCCCF",
        ".FFCCCCCCCCCCCCCCCCCCCCCCCCFF.",
    ])

# ------------------------------------------------------------------ ELEMENTARMAGIER
def fig_magier():
    PAL.update({'A': '#7fb0f0', 'B': '#4377d6', 'C': '#2c4aa2', 'F': '#1f2c66',      # Magierblau
                'u': '#effcff', 'v': '#8fe6f2', 'V': '#3fa6dc', 'X': '#2a5aa8'})     # Kristall
    g = leer()
    aermel_hinten(g)
    stempel(g, *HAND_HINTEN)
    stempel(g, *STIEFEL_HINTEN)
    stempel(g, *STIEFEL_VORNE)
    robe(g)
    stempel(g, *HALS)
    stempel(g, *KOPF)
    hut_spitz(g)
    # Stab: Schaft x44-45, Krallenkopf mit Kristall
    for y in range(11, 62):
        g[y][44] = 'l'; g[y][45] = 'L'
    stempel(g, 41, 2, [
        "...uv...",
        "..uvVV..",
        ".uvvVVX.",
        ".vvVVXX.",
        ".vVVVXX.",
        "..VVXX..",
        "...XX...",
    ])
    stempel(g, 41, 5, [
        "t......L",
        "tl....lL",
        ".tl..lL.",
        "..tllL..",
        "...lL...",
    ])
    # Zauberbuch (Nebenhand laut CW: magier -> buch) in der hinteren Hand
    stempel(g, 11, 31, [
        "mmtttttt.",
        "mLltllllb",
        "mLlllllla",
        "mLllyYlla",
        "mLlyxyYla",
        "mLllYzlla",
        "mLlllllla",
        "mLlllllLa",
        "mLllllLLb",
        "mLLLLLLLb",
        ".mmmmmmm.",
    ])
    stempel(g, *HAND_HINTEN)
    aermel_weit(g)
    faust(g, 42, 35)
    return g
FIGUREN['magier'] = fig_magier

# ------------------------------------------------------------------ HEILER
def fig_heiler():
    PAL.update({'A': '#fbf6ea', 'B': '#e6dfd0', 'C': '#bdb7c6', 'F': '#837d99',      # Gewand weiss
                'N': '#b9ec8c', 'O': '#6cc35a', 'P': '#3f8a4a', 'R': '#245b39',      # Stola gruen
                'u': '#fff6c4', 'v': '#f8e48a', 'V': '#e2bd52'})                     # Lichtscheibe
    g = leer()
    aermel_hinten(g)
    stempel(g, *HAND_HINTEN)
    stempel(g, *STIEFEL_HINTEN)
    stempel(g, *STIEFEL_VORNE)
    robe(g, saum='O', mitte='B')
    # Kapuze liegt im Nacken (schmal, hinter dem Kopf)
    stempel(g, 22, 20, [
        "..CBB......",
        ".CBBBC.....",
        "CBBBBCC....",
        "CBBBBBCCCC.",
        ".CCBBBBBBC.",
    ])
    # Kraeuterbeutel am Guertel
    stempel(g, 35, 39, ["tlL", "OlL", "lLL", ".L."])
    stempel(g, *HALS)
    stempel(g, *KOPF)
    # Stola: zwei gruene Bahnen ueber die Brust bis zur Huefte
    stempel(g, 26, 24, [
        "NO........PO",
        "NO........PO",
        ".NO......PO.",
        ".NO......PO.",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        "..............",
        "..............",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        ".NO......PR.",
        ".yY......yY.",
        ".YY......Yz.",
    ])
    # Stab des Lichts: Schaft, goldener Ring, Lichtkugel
    for y in range(13, 62):
        g[y][44] = 'l'; g[y][45] = 'L'
    stempel(g, 39, 2, [
        "....yyyY....",
        "..yyYvvvYz..",
        ".yYvvuuvvYz.",
        ".yvvuWWuvvz.",
        "yYvuWWWuvvYz",
        "yvvuWWuuvvVz",
        "yYvvuuuvvVYz",
        ".yvvvvvvVVz.",
        ".YzvvvvVVzz.",
        "..zYVVVVYz..",
        "....YYYz....",
        ".....yz.....",
    ])
    # Talisman (Nebenhand laut CW: heiler -> talisman) haengt an der hinteren Hand
    stempel(g, 13, 38, [
        "......R.",
        ".....R..",
        "...R.R..",
        "..yyYY..",
        ".yNNOPz.",
        "yNNOOPPz",
        "yNOOOPPz",
        "YOOPPPRz",
        ".YPPRRz.",
        "..zzzz..",
    ])
    aermel_weit(g, trim='O')
    faust(g, 42, 35)
    return g
FIGUREN['heiler'] = fig_heiler

if __name__ == '__main__':
    aus, name = sys.argv[1], sys.argv[2]
    g = FIGUREN[name]()
    g = aussenkontur(g)
    schreibe(aus, g, PAL, f'Ruin Walk Klassenfigur "{name}" - erzeugt mit _vorlage/bau.py, danach Feinarbeit im Raster')
