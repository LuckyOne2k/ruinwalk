# B-4: Deadlock zwischen Speichern/Verschieben und Kontolöschung – behoben

Stand 21.11.2026 · Zweig `fix/b4-speichern-kontoloeschung` (Basis `main` `9a05ab4`) · **nicht committet, nicht installiert, nicht live**.
Vorgeschichte: `docs/B2_PRUEFBERICHT.md` (B-4 dort als bekannter Fehler, Pr-Torregel Abschnitt 1), `docs/LOESCHVORGANG.md`.

## 1. Ursache
| Ablauf | Sperrfolge vorher |
|---|---|
| S `save_character` | Charakterzeile C (`for update`) → Update → BEFORE-UPDATE-Trigger `backup_character` → Insert in `character_backups` → Fremdschlüsselprüfung sperrt das Profil Pr (`for key share`) |
| M `move_character` | C (`for update`) → Update → Insert in `audit_log` → Pr (`for key share`, Fremdschlüssel) |
| D `delete_account` | Pr (`for update`) → … → `delete from auth.users` → Kaskade → C |

S/M nehmen C → Pr, D nimmt Pr → C. Laufen beide gleichzeitig für dasselbe Konto, entsteht ein Zyklus: genau ein 40P01 (vorher reproduziert in V6-8 und in der Belastungsmischung B: 245–286 Fälle in 200 Durchläufen). Atomar, kein Datenverlust, aber eine fehlgeschlagene Kontolöschung bzw. ein verlorener Speichervorgang.

## 2. Lösung
`save_character` und `move_character` nehmen die **eigene Profilzeile `for key share` als allererste Sperre**, danach die Charakterzeile – dieselbe Pr-Torregel wie `delete_character`:
```sql
perform 1 from public.profiles where account_id = uid for key share;   -- B-4: Profilsperre ZUERST
if not found then raise exception 'version_conflict' using errcode = 'PT409'; end if;   -- save (move: 'not_found' PT404)
select slot_number into … from public.characters where character_id = p_id and account_id = uid for update;
```
Wirkung: Hält D das Profil (`for update`), wartet S/M am Profil, **bevor** es irgendeine Schreibsperre hält; ist das Konto danach gelöscht, findet die Profilsperre keine Zeile → `version_conflict` bzw. `not_found` – genau die Meldung, die der Client bisher nach der Kaskade bei fehlendem Charakter bekam (`index.html` Z. 2535, 2642, 2704; keine Clientänderung). Hält S/M zuerst das Profil, wartet D am Profil, S/M laufen zu Ende, danach löscht D vollständig.

Unverändert: Signatur, Rückgabe, Fehlercodes (PT401, PT403, PT404, PT409, 22023), SECURITY DEFINER, `search_path`, Rechte, Reihenfolge der Eingabeprüfungen. Kein Bezug zum Instanzkampf (rwi sperrt keine Charakterzeilen).

## 3. Prüfung der Sperrpfade (rw-backend-security, rw-architekt)
| Pfad | Sperrfolge | Zyklus mit S/M? |
|---|---|---|
| D `delete_account` | Pr(upd) → … → C | nein: am Profil serialisiert (V6-8, beide Reihenfolgen) |
| D_adm `delete from auth.users` | U → Pr (vor `on_profile_deleting`) → A → I → C | nein: S/M halten kein U; Profil zuerst |
| D′ `delete_character` | Pr(ks) → C → A | nein: ks ∥ ks verträglich, an C serialisiert |
| `create_character` | Pr(ks, FK) → neue C | nein |
| `touch_login` | Pr (for no key update) | nein: verträglich mit key share |
| D_dir direktes DELETE | C → Pr(ks) | nein gegen S/M (ks verträglich) |
| S ∥ S, S ∥ M (gleicher Charakter) | Pr(ks) → C | nein: an C serialisiert |
Kein neuer Deadlock-Zyklus. Votum beider Prüfer: kein Blocker.

## 4. Tests (lokal, PostgreSQL 16.15 und 17.12)
| Test | PG17 | PG16 |
|---|---|---|
| `b2-sperren.mjs` (`B2_MIX=200`) | **53/53** | **53/53** |
| – V6-8 save/move × (op zuerst, Kontolöschung zuerst) | 4/4, 0 × 40P01, Konto vollständig gelöscht; bei „Kontolöschung zuerst“ hält save/move beim Warten keine Schreibsperre | gleich |
| – V6-13 Mischung B (200 × save, move, Kontolöschung, Charakterlöschung, Beitritt, create_group …) | **0 × 40P01** (vorher 245–286 × B-4), INV-1 = 0 | **0 × 40P01** |
| – V6-15 Migration/Rollback B4, Modus neu und legacy | bestanden | bestanden |
| `supabase/tests/run.sh` (neu + legacy, neuer Strukturtest) | 250/250 × 2 | 250/250 × 2 |
| konto-integration / konto-regel / loesch-trigger / slot3-f9 | 63 / 48 / 59 / 26 | gleich |
| produktion / installation / rechte-audit | 222 / 273 / 29 | gleich |
| Manifest gegen `rollback_dev.sql` | 146/146 | – |
Nicht wiederholt (nicht betroffen): Instanzkampf-Suites, Engine, `npm test` (Client unverändert, Tests nutzen eine Supabase-Attrappe ohne diese SQL-Funktionen).

**Mutationsproben** (PG17, `schema.sql` per md5 wiederhergestellt): save ohne Profilsperre → ROT (5 Tests, V6-8 save mit 40P01); move ohne Profilsperre → ROT (5, V6-8 move); save mit Profilsperre **nach** der Charakterzeile → ROT (4, V6-8 save „Kontolöschung zuerst“). Zusätzlich prüft `10_tests.sql` die Reihenfolge im Quelltext.

## 5. Dateideltas
| Datei | Änderung |
|---|---|
| `supabase/schema.sql` | `save_character`, `move_character`: je 2 Zeilen Profilsperre + Kommentarblock (3 Zeilen) |
| `supabase/migration_b4_speichern_reihenfolge.sql` | neu: beide Funktionen wörtlich wie `schema.sql`, Rechte, eine Transaktion (**nicht angewendet**) |
| `supabase/rollback_b4_speichern_reihenfolge.sql` | neu: Fassung von `main` `9a05ab4` wörtlich, Rechte |
| `supabase/tests/10_tests.sql` | +1 Prüfung (Reihenfolge Pr vor C in beiden Funktionen) |
| `supabase/dev/rollback_dev.sql` | Fingerabdrücke Z. 183 `move_character` → `f46e5f82…`, Z. 199 `save_character` → `bac10201…` |
| `server/instance/tests/b2-sperren.mjs` | V6-8 als Regression (4 Fälle), V6-15 (Migration/Rollback), Mischung B fordert 0 × 40P01, Kommentare |
| `docs/LOESCHVORGANG.md` | Pr-Torregel um S/M ergänzt, „B-4 behoben“, Restfall B-4c präzisiert |
| `docs/DEV_INSTALLATIONSFREIGABE.md` | neuer maßgeblicher Hash |
| `docs/B2_PRUEFBERICHT.md` | Statuszeile B-4 → behoben, B-4c getrennt offen; alter Hash als „Stand PR 1“ markiert; Abschnitt 13 (Nachtrag) |
| `docs/B4_BERICHT.md` | dieser Bericht |
md5: schema `3795f345…`, Migration `e64f891d…`, Rollback `13bf0512…`.
**SHA-256 `install_dev.sql`:** `9e0b93176851c9fd5bff1dec46fdfb4ed67032c677d951cbdb267839f85e55a7` (2149 Zeilen, zwei Builds gleich).

## 6. Nebenwirkungen und verbleibende Einschränkungen
- Jedes Speichern setzt jetzt eine Key-Share-Sperre auf die eigene Profilzeile (kleiner WAL-Eintrag; Multixact nur bei Überlappung, z. B. zwei Geräte oder `touch_login` gleichzeitig). Keine neue Blockade, beschränkt auf das eigene Konto. Vertretbar (rw-backend-security).
- Eine laufende Kontolöschung wartet höchstens so lange wie ein Speichervorgang (vorher ebenso, an der Sicherung).
- Unter REPEATABLE READ würde save/move nach einer bestätigten Kontolöschung mit 40001 statt PT409 enden; PostgREST nutzt READ COMMITTED – ohne praktische Bedeutung, keine RC-Pflicht ergänzt.
- **Bleibt offen: B-4c (V6-8c)** – direktes `delete from public.characters` (Dashboard/service_role) ∥ `delete_account` desselben Kontos → genau ein 40P01. Per RPC nicht lösbar (PostgreSQL sperrt die Zeile vor jedem Trigger). Betriebsregel: Charaktere über `delete_character` löschen. Technische Lösung nur gemeinsam mit B-6 (Statement-Weg) oder per Rechteentzug – eigene Entscheidung.
- **B-6** unverändert offen (Betriebsregel, `docs/LOESCHVORGANG.md`).
- Nicht live geprüft. Produktionsmigration `migration_b4_speichern_reihenfolge.sql` erst nach ausdrücklicher Freigabe; vorher Live-Stand gegen die Rollback-Fassung vergleichen. Kann zusammen mit der B2-Migration eingespielt werden (unabhängige Funktionen).
