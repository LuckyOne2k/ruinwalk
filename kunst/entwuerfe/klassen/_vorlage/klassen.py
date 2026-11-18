# Klassenfiguren (Phase 1b) - wird von bau.py per exec im selben Namensraum geladen.
# Alle Koordinaten nach STIL.md. Reihenfolge der Stempel = hinten -> vorne.

# ---------------------------------------------------------------- gemeinsame Teile
def kapuze(g, haar7='7', haar8='8'):
    """Kapuze (Klassenstoff A-F) um den Kopf x19..43 / y1..26, Gesicht x28..42 frei, Pony im Kapuzenschatten."""
    setze(g, [
        (2, 25, "CCBBBBBC"),
        (3, 22, "CBAAAABBBBBBBCC"),
        (4, 21, "CBAAABBBBBBBBBBCC"),
        (5, 20, "CBAABBBBBBBBBBBBBCC"),
        (6, 20, "BAABBBBBBBBBBBBBBBBBC"),
        (7, 19, "CBABBBBBBBBBBBBBBBBBBBC"),
        (8, 19, "BAABBBBBBBBBBBBBBBBBBBBC"),
        (9, 19, "BABBBBBBBBBBBBBBBBBBBBBBC"),
        (10, 19, "BABBBBBBC" + "F" * 15 + "C"),
        (11, 19, "BABBBBBBC"), (11, 28, ("787778877787778").replace('7', haar7).replace('8', haar8)),
        (12, 28, "3"), (13, 28, "3"),
    ] + [(y, 19, "BABBBBBBC") for y in range(12, 17)] + [
        (17, 19, "BBBBBBBBC"), (18, 19, "BBBBBBBBC"), (19, 19, "CBBBBBBBC"),
        (20, 20, "CBBBBBBC"),
        (21, 20, "CBBBBBBBC"),
        (22, 21, "CBBBBBBBC"),
        (23, 21, "CCBBBBBBBC"),
        (24, 22, "CCBBBBBBBC"), (24, 39, "CBBC"),
        (25, 22, "CCBBBBBBBBBBBBBBBBBC"),
        (26, 23, "CCBBBBBBBBBBBBBBBC"),
    ])

def robe(g, saum1='y', saum2='Y', mitte='Y'):
    """Langes Gewand (Klassenstoff A-F) y25..57, Rock weitet sich nach unten (Schrittstellung)."""
    setze(g, [
        (25, 24, "AAAAB44444BBCC"),
        (26, 23, "AAAAAAB444BBBBCC"),
        (27, 23, "AAAABBBBmBBBBBCC"),
        (28, 23, "AAABBBBBmBBBBBCC"),
        (29, 23, "AABBBBBBmBBBBCCC"),
        (30, 23, "ABBBBBBBmBBBBCCC"),
        (31, 24, "BBBBBBBmBBBBCCF"),
        (32, 24, "BBBBBBBmBBBCCCF"),
        (33, 24, "BBBBBBBmBBBCCFF"),
        (34, 24, "CBBBBBBmBBCCCFF"),
        (35, 24, "CCBBBBBmBBCCFFF"),
        (36, 24, "tllllllyyYlllLL"),
        (37, 24, "LLLLLLLYzzLLLmm"),
    ])
    breite = {}
    for y in range(38, 58):
        x0 = 23 - (y - 38) // 4
        x1 = 39 + (y - 38) // 3
        breite[y] = (x0, min(x1, 45))
    for y, (x0, x1) in breite.items():
        f1 = 27 - (y - 38) // 8
        f2 = 36 + (y - 38) // 7
        for x in range(x0, x1 + 1):
            c = 'B'
            if x == x0: c = 'A'
            if x == x0 + 1 and y < 48: c = 'A'
            if x >= x1 - 3: c = 'C'
            if x >= x1 - 1: c = 'F'
            if y >= 41 and x == f1: c = 'C'
            if y >= 41 and x == f1 + 1: c = 'A'
            if y >= 43 and x == f2: c = 'F'
            if y >= 43 and x == f2 + 1: c = 'B'
            if x == 31: c = 'm'
            if y == 56: c = saum1 if x < x1 - 1 else saum2
            if y == 57: c = saum2 if x < x1 - 1 else 'z'
            g[y][x] = c
    for y in range(25, 58):
        for x in range(64):
            if g[y][x] == 'm' and y not in (36, 37):
                g[y][x] = mitte

def aermel_fallend(g, borte='y', borte2='Y'):
    """Weiter Aermel vorne: Arm nach vorn angewinkelt, Stoff faellt unter dem Unterarm herab (Oeffnung rechts unten)."""
    setze(g, [
        (26, 37, "BBBB"),
        (27, 36, "ABBBBC"),
        (28, 36, "ABBBBBC"),
        (29, 36, "ABBBBBBC"),
        (30, 36, "ABBBBBBB" + borte),
        (31, 36, "BBBBBBBB" + borte),
        (32, 36, "CBBBBBBC" + borte2),
        (33, 37, "CBBBBBC" + borte2),
        (34, 37, "CBBBBC" + borte2),
        (35, 38, "CBBC" + borte2),
        (36, 38, "C" + borte * 2 + borte2),
        (37, 39, borte2 * 2),
    ])

def aermel_hinten(g):
    setze(g, [(26, 22, "CC"), (27, 21, "CCCF"), (28, 20, "BCCCF"), (29, 20, "BCCCF"),
              (30, 19, "BBCCCF"), (31, 19, "BCCCCF"), (32, 19, "BCCCCF"), (33, 19, "FFFFFF")])

def bogen_holz(g, xs=44, y0=10, y1=54, sehne='a'):
    """Bogen senkrecht: Spitzen bei x=xs, groesste Woelbung xs+5 in der Mitte; Sehne x=xs-1."""
    mitte = (y0 + y1) / 2
    for y in range(y0, y1 + 1):
        d = min(y - y0, y1 - y)
        o = 0 if d == 0 else 1 if d <= 2 else 2 if d <= 5 else 3 if d <= 9 else 4 if d <= 15 else 5
        x = xs + o
        g[y][x - 1] = 't' if y < mitte else 'l'
        g[y][x] = 'L'
    for y in range(y0 + 1, y1):
        if g[y][xs - 1] == '.':
            g[y][xs - 1] = sehne
    g[y0 - 1][xs] = 'm'; g[y1 + 1][xs] = 'm'

# ---------------------------------------------------------------- WANDERER (Schleuder, keine Nebenhand)
def fig_wanderer():
    PAL.update({'A': '#c4a57a', 'B': '#8f7150', 'C': '#644b38', 'F': '#40302b',      # Wollmantel braun
                'N': '#a8ad74', 'O': '#7b824f', 'P': '#555c3b', 'R': '#383e2c',      # Kittel oliv
                'E': '#b3a98f', 'e': '#8a8069', 'f': '#6e5a47', 'g': '#433d35',      # Hose sandgrau
                'i': '#2f6a3f', 'I': '#7cc18a'})                                     # Augen gruen
    g = leer()
    # Mantel hinten
    for y in range(26, 52):
        x0 = 21 - (y - 26) // 4
        w = 4 + (y - 26) // 5
        setze(g, [(y, x0, ("C" if y > 30 else "B") + "B" * (w - 1))])
    setze(g, [(y, 21 - (y - 26) // 4, "C") for y in range(40, 52)])
    setze(g, [(52, 15, "FFCCCCC"), (53, 16, "FFFF")])
    # Bettrolle
    setze(g, block(21, 12, ["..tttl..", ".ttllLl.", "ttlLlLLl", "tlLlLLmL", "llLmLLmL", ".LLLmmL.", "..LmmL.."]))
    koerper(g, haar=HAAR_PONY, art='neugierig', arm_vorne=False)
    # Kittel
    setze(g, [
        (25, 24, "NNNNb44444OOPP"),
        (26, 23, "NNNNNOb444OOOOPP"),
        (27, 23, "NNNOOOObOOOOOOPP"),
        (28, 23, "NNOOOOOOOOOOOOPP"),
        (29, 23, "NOOOOOOOOOOOOPPP"),
        (30, 23, "NOOOOOOOOOOOOPPP"),
        (31, 24, "OOOOOOOOOOOPPPR"),
        (32, 24, "OOOOOOOOOOOPPPR"),
        (33, 24, "OOOOOOOOOOPPPRR"),
        (34, 24, "POOOOOOOOOPPPRR"),
        (35, 24, "PPOOOOOOOOPPRRR"),
        (38, 24, "NOOOOOOOOOOPPRR"),
        (39, 23, "NOOOOOOOOOOOPPPRR"),
        (40, 23, "OOOOOOOOOOOOOPRRR"),
        (41, 23, "PPPPPPPPPPPPPRRRR"),
    ])
    setze(g, faerbe(ARM_VORNE, {'a': 'N', 'b': 'O', 'c': 'P', 'd': 'R'}))
    kapuze(g)
    # Umhang auf den Schultern + Fibel
    setze(g, [(26, 21, "CBBBBBC"), (27, 20, "CBBBBBC"), (28, 20, "CBBBBC"), (29, 20, "CBBBC"), (30, 20, "CCC"),
              (26, 36, "CC"), (27, 36, "CBB"), (28, 37, "CB"), (25, 29, "yY"), (26, 29, "Yz")])
    # Riemen der Bettrolle
    setze(g, [(27 + i, 27 + i, "LL") for i in range(9)])
    setze(g, block(38, 33, ["tlL", "llL", "lLL", ".L."]))                     # Steinbeutel
    # Gabelschleuder (aktiv gehoben)
    setze(g, [
        (19, 41, "tl......tl"),
        (20, 41, "tlmmEEmmlL"),
        (21, 41, "tl..ee..lL"),
        (22, 41, "tl......lL"),
        (23, 42, "tl....lL"),
        (24, 43, "tl..lL"),
        (25, 44, "tllL"),
        (26, 45, "lL"), (27, 45, "lL"), (28, 45, "lL"), (29, 45, "lL"),
        (35, 45, "lL"), (36, 45, "LL"), (37, 46, "m"),
    ])
    faust(g)
    return g
FIGUREN['wanderer'] = fig_wanderer

# ---------------------------------------------------------------- KRIEGER (Schwert + Schild)
def fig_krieger():
    PAL.update({'A': '#ee6f55', 'B': '#c63c3c', 'C': '#8c2436', 'F': '#56192b',      # Waffenrock rot
                '7': '#4a3a40', '8': '#2e2232',                                      # Haar schwarz
                'i': '#5a3a28', 'I': '#d29a4a'})                                     # Augen braun
    PAL.update(STAHL)
    g = leer()
    setze(g, faerbe(ARM_HINTEN, {'c': '%', 'd': 'D'})); setze(g, faerbe(HAND_HINTEN, {'2': 'l', '3': 'L', '4': 'm'}))
    # Kettenbeinlinge + Kniebuckel
    setze(g, faerbe(BEIN_HINTEN, {'e': '%', 'f': '%', 'g': '%'}))
    setze(g, faerbe(BEIN_VORNE, {'E': '#', 'e': '#', 'f': '%'}))
    setze(g, [(41, 29, "%%"), (42, 30, "%")])
    setze(g, STIEFEL_HINTEN); setze(g, STIEFEL_VORNE)
    setze(g, [(46, 34, "sSsG"), (47, 33, "GsSsGD"), (48, 34, "GGDD")])
    # Kettenhemd + Waffenrock
    setze(g, [
        (27, 23, "###AABBBBBBC#%%%"),
        (28, 23, "##AABBBBBCBBC%%%"),
        (29, 23, "##ABBBBBBCABC%%%"),
        (30, 23, "##ABBBBBBCABCC%%"),
        (31, 24, "#ABBBBBBCABCC%%"),
        (32, 24, "#ABBBBBBCBBCC%%"),
        (33, 24, "#BBBBBBBCBBCCF%"),
        (34, 24, "%CBBBBBBCBBCFF%"),
        (35, 24, "%CCBBBBBCBCCFF%"),
        (36, 24, "tllllllyyYlllLL"),
        (37, 24, "LLLLLLLYzzLLLmm"),
        (38, 24, "#%ABBBBCBBCCF%%"),
        (39, 23, "##%ABBBBCBBCCF%%%"),
        (40, 23, "DDDABBBBCBBCCFDDD"),
        (41, 26, "ABBBBCBBCCF"),
        (42, 26, "ABBBBCBBCCF"),
        (43, 26, "CCCCCFCCFFF"),
    ])
    kopf(g, haar=HAAR_PONY, art='entschlossen')
    # Helm mit Nietenreif
    setze(g, [
        (2, 26, "GsSSsssGD"),
        (3, 24, "GsSSssssssGGD"),
        (4, 22, "GsSssssssssssGGD"),
        (5, 21, "GsSsssssssssssssGGD"),
        (6, 20, "sSsssssssssssssssGGD"),
        (7, 19, "GssssssssssssssssssGGD"),
        (8, 19, "GsssssssssssssssssssGGD"),
        (9, 19, "DssssssssssssssssssssGGD"),
        (10, 19, "TGSGGGSGGGSGGGSGGGSGGGDDT"),
        (11, 19, "TDDDDDDDDDDDDDDDDDDDDDDDT"),
    ])
    # Kettenhaube
    setze(g, [(y, 19, "#####%%%%D") for y in range(12, 22)] + [
        (22, 20, "####%%%%%D"), (23, 21, "###%%%%%D"),
        (24, 22, "###%%%%%%D"), (24, 39, "%%%D"),
        (25, 22, "######%%%%%%%%%%%%%D"),
        (26, 23, "%%%%%%%%%%%%%%%%%D"),
    ])
    # Schulterstueck + Arm (Kette) + Handschuh
    setze(g, [(25, 37, "GGGGG"), (26, 36, "GsSSsG"), (27, 35, "GsSsssGD"), (28, 35, "sssssGGD"), (29, 36, "DGGGGDD"),
              (30, 37, "###%%"), (31, 37, "####%%%"), (32, 38, "###%%%"), (33, 39, "lllLL")])
    # Schwert schraeg nach vorn oben gehalten
    for y in range(10, 28):
        xc = 47 + (29 - y) // 2
        setze(g, [(y, xc - 1, "sSG")])
    setze(g, [(9, 57, "S")])
    setze(g, [(26, 42, "sG"), (27, 44, "sG"), (28, 46, "GG"), (29, 48, "GD"), (30, 50, "D")])  # Parierstange
    setze(g, [(29, 46, "LL")])                                                                 # Griff
    faust(g, haut=False)
    setze(g, [(35, 43, "L"), (36, 42, "sG"), (37, 42, "GD")])                                  # Knauf
    # Schild (Holz, Stahlrand, Buckel)
    setze(g, block(27, 9, [
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
    ]))
    return g
FIGUREN['krieger'] = fig_krieger

# ---------------------------------------------------------------- BOGENSCHUETZE (Bogen + Koecher)
def fig_bogen():
    PAL.update({'A': '#9fcf63', 'B': '#5f9c45', 'C': '#3b6b3b', 'F': '#25462f',      # Jaegergruen
                'N': '#f1f1e6', 'O': '#c94a3c',                                      # Federn
                '7': '#b05a2a', '8': '#6e2f1c',                                      # Haar kupfer
                'E': '#8f9763', 'e': '#6a7046', 'f': '#4b5133', 'g': '#313624'})     # Hose oliv
    g = leer()
    # Koecher hinten mit drei Befiederungen
    setze(g, block(11, 12, [
        ".N..O.N..",
        "NNNOOONN.",
        "NNtOOtNN.",
        ".tNtOtN..",
        "..t.t.t..",
        "..t.t.t..",
        "..LLLLLL.",
    ] + ["..tllLLm."] * 12 + ["..LLLLmm.", "...mmmm.."]))
    koerper(g, haar=HAAR_PONY, art='keck', arm_vorne=False)
    # Tunika + Lederwams
    setze(g, [
        (25, 24, "AAAAB44444BBCC"),
        (26, 23, "AAAAAtlLlLlLBBCC"),
        (27, 23, "AAAAtllllllLLBCC"),
        (28, 23, "AABBtllllllLLBCC"),
        (29, 23, "ABBBtlllllLLmBCC"),
        (30, 23, "ABBBtlllllLLmCCC"),
        (31, 24, "BBBtlllllLLmCCF"),
        (32, 24, "BBBtllllLLLmCCF"),
        (33, 24, "BBBlllllLLLmCFF"),
        (34, 24, "CBBlllllLLmmCFF"),
        (35, 24, "CCBlllllLLmmFFF"),
        (38, 24, "ABBBBBBBBBBCCFF"),
        (39, 23, "AABBBBBBBBBBCCCFF"),
        (40, 23, "CCCCCCCCCCCCCFFFF"),
        (28, 30, "t"), (30, 30, "t"), (32, 30, "t"),
    ])
    setze(g, faerbe(ARM_VORNE, {'a': 'A', 'b': 'B', 'c': 'C', 'd': 'F'}))
    setze(g, faerbe(ARM_HINTEN, {'c': 'C', 'd': 'F'}))
    setze(g, [(32, 40, "tllL"), (33, 40, "tlLm")])                              # Armschiene
    kapuze(g)
    # kurzer Kapuzenkragen
    setze(g, [(25, 22, "CBBBBBBBBBBBBBBBBBC"), (26, 21, "CBAABBBBBBBBBBBBBBBC"),
              (27, 21, "CBBBBCBBBBBBCBBBBCF"), (28, 21, "CBBC..CBBBC...CBCF"), (29, 22, "CC.....CC.....FF")])
    bogen_holz(g, xs=44, y0=10, y1=54)
    faust(g)
    return g
FIGUREN['bogen'] = fig_bogen

# ---------------------------------------------------------------- ELEMENTARMAGIER (Zauberstab + Zauberbuch)
HAAR_LANG_HINTEN = [(y, 20, "56677") for y in range(13, 20)] + [
    (20, 20, "5667"), (21, 20, "5667"), (22, 20, "6677"), (23, 20, "6778"), (24, 21, "778"), (25, 21, "78")]

def hut_spitz(g):
    """Markanter Spitzhut: Krempe 36 px (x14..49), Kegel y1..9, Spitze knickt nach hinten (links) und haengt herab."""
    setze(g, [
        (2, 21, "FCCCBBBBAABBC"),
        (3, 19, "FFC.....CBAABBBC"),
        (4, 19, "FF.....CBAAABBBBC"),
        (5, 25, "CBAAABBBBBBBBC"),
        (6, 24, "CBAAABBBBBBBBBCC"),
        (7, 23, "CBAAABBBBBBBBBBBCC"),
        (8, 22, "yyyyyxyyyyyyyyyyyYYz"),
        (9, 21, "YYYYYYYYYYYYYYYYYYYzzz"),
        (10, 16, "AAAAABBBBBBBBBBBBBBBBBBBBBBBBBBCCC"),
        (11, 14, "AABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBCCF"),
        (12, 16, "FFCCCCCCCCCCCCCCCCCCCCCCCCCCCCCFF"),
    ])

def fig_magier():
    PAL.update({'A': '#7fb0f0', 'B': '#4377d6', 'C': '#2c4aa2', 'F': '#1f2c66',      # Magierblau
                'u': '#effcff', 'v': '#8fe6f2', 'V': '#3fa6dc', 'X': '#2a5aa8',      # Kristall
                '5': '#f1f1f8', '6': '#c6cae0', '7': '#9095b8', '8': '#5d5f88',      # Haar silber
                'i': '#5a3a9a', 'I': '#a07ae0'})                                     # Augen violett
    g = leer()
    setze(g, HAAR_LANG_HINTEN)
    aermel_hinten(g)
    setze(g, STIEFEL_HINTEN); setze(g, STIEFEL_VORNE)
    robe(g)
    kopf(g, haar=HAAR_PONY, art='konzentriert')
    setze(g, [(y, 21, "5667") for y in range(13, 19)])
    hut_spitz(g)
    # Stab mit Krallenkopf und Kristall
    for y in range(9, 62):
        g[y][45] = 'l'; g[y][46] = 'L'
    setze(g, block(2, 43, ["..uv..", ".uvVV.", "uvvVVX", "vvVVXX", "vVVVXX", ".VVXX.", "..XX.."]))
    setze(g, block(6, 42, ["l......L", "lL....LL", ".lL..LL.", "..lLLL..", "...lL..."]))
    aermel_fallend(g)
    faust(g)
    # Zauberbuch in der hinteren Hand
    setze(g, block(29, 11, [
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
    ]))
    setze(g, HAND_HINTEN)
    return g
FIGUREN['magier'] = fig_magier

# ---------------------------------------------------------------- HEILER (Stab des Lichts + Talisman)
def heiligenschein(g):
    setze(g, [(2, 27, "xyyyyyyyyyY"), (3, 24, "yyY"), (3, 38, "YYz"), (4, 23, "yY"), (4, 40, "Yz"), (5, 24, "Yz")])

def fig_heiler():
    PAL.update({'A': '#fbf6ea', 'B': '#e3dccb', 'C': '#b0a9c4', 'F': '#746d95',      # Gewand weiss, Schatten violett
                'N': '#b9ec8c', 'O': '#6cc35a', 'P': '#3f8a4a', 'R': '#245b39',      # Stola gruen
                'u': '#fff6c4', 'v': '#f8e48a', 'V': '#e2bd52',                      # Lichtscheibe
                '5': '#fff3b0', '6': '#f2cf55', '7': '#c08a34', '8': '#7e5422',      # Haar goldblond
                'i': '#2f7a8a', 'I': '#6fc8d8'})                                     # Augen tuerkis
    g = leer()
    heiligenschein(g)
    setze(g, HAAR_LANG_HINTEN)
    aermel_hinten(g)
    setze(g, STIEFEL_HINTEN); setze(g, STIEFEL_VORNE)
    robe(g, saum1='O', saum2='P', mitte='B')
    kopf(g, haar=HAAR_KURZ, art='sanft')
    setze(g, [(y, 21, "5667") for y in range(13, 19)])
    # Stola
    setze(g, [(y, 26, "NO") for y in range(25, 36)] + [(y, 35, "PR") for y in range(25, 36)] +
             [(y, 26, "NO") for y in range(38, 46)] + [(y, 35, "PR") for y in range(38, 46)] +
             [(46, 26, "yY"), (46, 35, "yY"), (47, 26, "Yz"), (47, 35, "Yz")])
    # Stab des Lichts
    for y in range(11, 62):
        g[y][45] = 'l'; g[y][46] = 'L'
    setze(g, block(2, 41, [
        "...yyyY...",
        ".yyYvvvYz.",
        "yYvuuWuvYz",
        "yvuWWWuvVz",
        "yvuWWuuvVz",
        "yYvuuuvVYz",
        ".yYvvvVYz.",
        "..zYYYYz..",
        "....yz....",
    ]))
    aermel_fallend(g, borte='O', borte2='P')
    faust(g)
    # Talisman: kurze Goldkette + rundes Amulett mit gruenem Stein, haengt unter der hinteren Hand
    setze(g, [(38, 20, "Y"), (39, 20, "y")])
    setze(g, block(40, 17, [
        "..yYY..",
        ".yNNOYz",
        "yNWNOPz",
        "yNNOPPz",
        "YOOPPRz",
        ".YPRRz.",
        "..zzz..",
    ]))
    return g
FIGUREN['heiler'] = fig_heiler
