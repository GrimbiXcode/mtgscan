@AGENTS.md

# Arbeitsablauf für Claude

Architektur, Code-Stil und Hintergründe stehen in `AGENTS.md` (oben
eingebunden). Hier steht, **wie** Änderungen ins Projekt kommen. Diese
Regeln hat der Projektinhaber festgelegt und gelten immer, auch wenn eine
Anfrage nur „mergen“ sagt.

## Branches: Feature → `test` → Freigabe → `main`

- `main` ist Produktion, `test` ist das Test-System.
- Neue Arbeit immer auf einem eigenen Branch, abgezweigt von `test`.
- **Immer zuerst nach `test` mergen** (PR `<branch>` → `test`). Der
  Projektinhaber prüft dann auf dem Test-System.
- **Nach `main` erst nach ausdrücklicher Freigabe** des Projektinhabers
  für diesen Stand („Freigabe für Prod“ o. ä.) – dann per PR `test` →
  `main`. Ohne Freigabe nie nach `main` mergen oder pushen, auch nicht
  für kleine Fixes oder Doku.
- Merges als **Merge-Commit**, nicht Squash: so teilen `test` und `main`
  dieselbe History und ein PR `test` → `main` enthält genau das, was auf
  dem Test-System geprüft wurde.
- Nach jedem Merge nach `test` kurz melden, was jetzt auf `test` liegt und
  was der Projektinhaber prüfen sollte.

## Vor jedem Merge: Tests

Vor **jedem** Merge – nach `test` und nach `main` – auf dem Stand, der
gemergt werden soll:

```bash
npm ci        # falls node_modules fehlt oder package-lock.json sich geändert hat
npm test      # Benchmark (volle Auflösung + 1280px) und UI-Smoke-Test
```

- `npm run benchmark` / `npm run benchmark -- --max-width=1280`: Erkennung
  gegen die Fotos in `sandbox/test-images/` (Details in `AGENTS.md`,
  „Testing the Recognition Pipeline“). Alle Fixtures müssen bestehen.
- `npm run test:ui`: baut die App und fährt sie mit `sandbox/ui-smoke.mjs`
  in Headless-Chromium durch (Scan per Foto, Ergebnis-Sheet, Sammlung inkl.
  Rückgängig und Suche, Werkstatt, manuelle Eingabe, Kamera mit
  Fake-Gerät, Desktop-Breite, Rechtsseite). Netzwerk ist gemockt; Anfragen
  an jsdelivr lassen den Test fehlschlagen. Startet einen eigenen
  `vite preview` auf Port 4179 – nicht `npm run dev` starten.
  `-- --screenshots=sandbox/ui-smoke-shots` speichert Screenshots.
- Browser: `CHROMIUM_PATH` auf eine Chromium-Binary setzen (Cloud-Sessions:
  `CHROMIUM_PATH=/opt/pw-browsers/chromium`), sonst einmalig
  `npx playwright-core install chromium`.

Schlägt etwas fehl: **den Fehler im Code beheben**, nicht den Test
abschwächen, überspringen oder Erwartungen passend machen – dann erneut
`npm test`. Erst mit grünem Lauf mergen. Kann ein Test nicht laufen (z. B.
fehlender Browser), nicht trotzdem mergen, sondern das dem Projektinhaber
sagen.

Neue Funktionen bekommen passende Prüfungen in `sandbox/ui-smoke.mjs`
bzw. neue Fixtures für den Benchmark.

In Cloud-Sessions ist `api.scryfall.com` gesperrt: Der Benchmark fällt dann
auf die Set-Codes aus den Dateinamen zurück (Warnung im Output) – das ist
in Ordnung. Ein echter Test mit Scryfall passiert auf dem Test-System.
