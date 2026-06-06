# Hues & Cues – Design (2026-06-06)

Local, in-person party game reimplementation. Each player opens the app on their
own machine; one shared global game lives in the Nuxt/Nitro server's memory.
Run with `yarn dev`. No database, no WebSockets, no auth.

## Decisions

- **Sync:** Polling. Clients `GET /api/state` ~every 1.5s and compare a `version`
  counter.
- **Scope:** One global game. Everyone who opens the page joins the same game.
- **Scoring:** Full original rules.
- **Cue:** Purely verbal. The app only announces *"X is giving the cue now"*; no
  text field. Players speak the cue aloud in the room.
- **Game end:** Endless. Turns rotate forever, scoreboard accumulates, manual
  **Reset** button. No automatic end.
- **Code shape:** Frontend entirely in `app.vue` (one file). Backend = in-memory
  store + REST routes under `server/api/`.

## Board

- 30 columns (1–30) × 16 rows (A–P) = 480 cells.
- Color via HSL: column → hue (0–360°), row → lightness (light at top, dark at
  bottom), moderate constant saturation. Approximates the real board without
  hand-maintaining 480 values.
- Cell identity: `{ col: 1..30, row: 0..15 }`. Distance = Chebyshev
  (`max(|dcol|, |drow|)`).

## Phases (server state machine)

1. `lobby` – players join; anyone can start their turn → becomes cue giver.
2. `pick` – cue giver sees 4 random cells (the "card"), picks 1 as the secret
   target.
3. `cue1` – app announces giver gives cue #1; each non-giver places stone #1.
4. `cue2` – app announces giver gives cue #2; each non-giver places stone #2.
5. `reveal` – target + 3×3 scoring frame shown; points tallied; then next turn
   (rotate cue giver).

The giver advances phases with a button. Guessers may move their stone until the
phase advances.

## Scoring (original)

For each placed stone, Chebyshev distance `d` to target:
- `d == 0` → 3 points
- `d == 1` → 2 points
- `d == 2` → 1 point
- else → 0

Cue giver: +1 point per stone with `d <= 1` (inside the 3×3 frame), across both
rounds.

## Server state (in-memory singleton)

```
{
  version: number,              // bumped on every mutation
  phase: 'lobby'|'pick'|'cue1'|'cue2'|'reveal',
  players: { [id]: { name, color, score, lastSeen } },
  turnOrder: id[],
  cueGiverId: id | null,
  card: Cell[4] | null,         // only revealed to giver until reveal
  target: Cell | null,          // hidden from non-givers until reveal
  guesses: { 1: {[id]: Cell}, 2: {[id]: Cell} },
  lastResult: { perPlayer: {...}, giver: number } | null
}
```

Non-giver clients receive a sanitized state (no `target`/`card`) until `reveal`.

## API routes (`server/api/`)

- `GET  /api/state?id=` – sanitized state for that player (+ heartbeat).
- `POST /api/join` `{name}` → `{id}`.
- `POST /api/start-turn` `{id}` – lobby/reveal → pick; sets giver, deals card.
- `POST /api/pick` `{id, cell}` – giver picks target → cue1.
- `POST /api/guess` `{id, round, cell}` – place/move a stone.
- `POST /api/advance` `{id}` – giver: cue1→cue2→reveal.
- `POST /api/reset` `{id}` – wipe scores/state back to lobby.

## Testing

The scoring function is the correctness-critical core → unit-tested (TDD).
Phase transitions guarded server-side. Manual playtest across two browser tabs.

## Out of scope (YAGNI)

Rooms/codes, persistence, enforced clockwise turn order, automatic game end,
mobile-specific layout, Netlify deploy.
