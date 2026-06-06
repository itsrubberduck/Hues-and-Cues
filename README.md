# Hues & Cues 🎨

Eine lokale, selbstgehostete Nachbildung des Partyspiels **Hues and Cues** für
Spielabende im selben Raum. Jeder öffnet die Seite auf dem eigenen Rechner, die
Hinweise werden **laut ausgesprochen** – die App koordiniert nur Board, Züge und
Punkte.

Gebaut mit [Nuxt 3](https://nuxt.com). Ein gemeinsames Spiel pro Server,
Zustand im Arbeitsspeicher, kein Backend-Service, keine Datenbank.

## So wird gespielt

1. **Server starten** (siehe unten) und `http://localhost:3000` öffnen.
2. Jede:r gibt einen Namen ein und ist sofort im selben Spiel.
3. **Wer dran ist** klickt „Zug starten", bekommt eine Karte mit **4 Farben** und
   wählt heimlich eine als Ziel.
4. Die:der Hinweisgeber:in sagt einen **1. Hinweis laut** (ein Wort). Alle
   anderen setzen ihren Stein auf ein Farbfeld des Boards.
5. Dann ein **2. Hinweis laut** (max. zwei Wörter) und ein zweiter Stein.
6. „Aufdecken & werten" zeigt das Ziel und den 3×3-Wertungsrahmen, die Punkte
   werden vergeben. Danach startet die nächste Runde.

### Wertung (Originalregeln)

Distanz eines Steins zum Zielfeld (Chebyshev, also „König-Schritte"):

| Entfernung | Punkte |
| ---------- | ------ |
| exakt getroffen | **3** |
| direkt angrenzend (1 Feld) | **2** |
| zwei Felder entfernt | **1** |
| weiter weg | 0 |

Die:der **Hinweisgeber:in** bekommt **+1 Punkt pro Stein**, der im 3×3-Rahmen um
das Ziel liegt (Entfernung ≤ 1).

Wer beim **2. Hinweis keinen neuen Stein** setzt, dessen erster Tipp wird einfach
nochmal gewertet (zählt doppelt) – wie zwei Würfel auf demselben Feld.

Es gibt kein automatisches Spielende – das Scoreboard läuft weiter, bis jemand
auf **„Spiel zurücksetzen"** klickt.

### Hinweis-Regeln (verbal)

Wie im Original: keine reinen Grundfarbennamen und nicht „hell"/„dunkel".
Abstrakte Begriffe wie „Lavendel" oder „Kaffee" sind erlaubt. Die App erzwingt
das nicht – ihr sagt die Hinweise laut und haltet euch selbst an die Regeln.

## Setup

```bash
yarn install
yarn dev
```

Dann im Browser `http://localhost:3000` öffnen. Für die anderen im Raum:

```bash
yarn dev --host
```

zeigt die Netzwerk-Adresse (`http://<deine-IP>:3000`), die alle im selben (W)LAN
aufrufen können.

> Das `dev`-Script setzt bewusst `TMPDIR=/tmp`. Grund: Nuxts vite-node-Socket
> landet sonst unter dem langen macOS-Pfad `/var/folders/…` und überschreitet das
> 104-Zeichen-Limit für Unix-Sockets – dann bricht der Dev-Server mit
> „Failed to restrict vite-node socket permissions" ab.

## Tests

Die Wertungslogik ist mit Unit-Tests abgesichert:

```bash
yarn test
```

## Architektur

- **Frontend:** alles in [`app.vue`](app.vue) – Board (30×16 = 480 HSL-Farben),
  Lobby, Phasen-UI, Scoreboard. Pollt `GET /api/state` alle 1,5 s.
- **Backend:** In-Memory-Spielzustand in
  [`server/utils/game.ts`](server/utils/game.ts) + REST-Routen unter
  [`server/api/`](server/api/) (`state`, `join`, `action`). Die geheime
  Zielfarbe und die Karte werden Nicht-Hinweisgebern erst beim Aufdecken
  geschickt.
- **Wertung:** [`server/utils/scoring.ts`](server/utils/scoring.ts), getestet in
  [`server/utils/scoring.test.ts`](server/utils/scoring.test.ts).

> ⚠️ Der Spielzustand lebt im Server-Prozess. Ein Neustart (oder `yarn dev`-Reload)
> setzt das Spiel zurück. Inaktive Spieler:innen fliegen nach ~15 s raus.

## Lizenz / Hinweis

Inoffizielles Fan-Projekt zum privaten Gebrauch. „Hues and Cues" ist ein Spiel
von Scott Brady, veröffentlicht von The Op (USAopoly).
