<script setup lang="ts">
interface Cell { col: number; row: number }
interface PlayerView { id: string; name: string; color: string; score: number }
interface RoundResult { perPlayer: Record<string, number>; giver: number }
interface StateView {
  version: number
  phase: 'lobby' | 'pick' | 'cue1' | 'cue2' | 'reveal'
  players: PlayerView[]
  cueGiverId: string | null
  card: Cell[] | null
  target: Cell | null
  guesses: { 1: Record<string, Cell>; 2: Record<string, Cell> }
  lastResult: RoundResult | null
  you: string | null
  board: { cols: number; rows: number }
}

const COLS = 30
const ROWS = 16
const ROW_LETTERS = 'ABCDEFGHIJKLMNOP'.split('')

const myId = ref<string | null>(null)
const myName = ref('')
const nameInput = ref('')
const state = ref<StateView | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

// --- Board colour model (must match the server's cell identity) ---
function cellColor(col: number, row: number): string {
  const hue = Math.round(((col - 1) / COLS) * 360)
  const light = 90 - (row / (ROWS - 1)) * 70 // 90% (top) -> 20% (bottom)
  return `hsl(${hue}, 70%, ${light}%)`
}
function cellKey(c: Cell): string {
  return `${c.col},${c.row}`
}

// --- Derived helpers ---
const me = computed(() => state.value?.players.find((p) => p.id === myId.value) ?? null)
const isGiver = computed(() => !!myId.value && state.value?.cueGiverId === myId.value)
const giver = computed(() => state.value?.players.find((p) => p.id === state.value?.cueGiverId) ?? null)
const phase = computed(() => state.value?.phase ?? 'lobby')
const activeRound = computed<1 | 2 | null>(() =>
  phase.value === 'cue1' ? 1 : phase.value === 'cue2' ? 2 : null,
)

// Map cellKey -> markers to render on that cell.
const markers = computed(() => {
  const m: Record<string, { color: string; label: string; faded: boolean }[]> = {}
  const s = state.value
  if (!s) return m
  const rounds: (1 | 2)[] = phase.value === 'reveal' ? [1, 2] : phase.value === 'cue2' ? [1, 2] : [1]
  for (const r of rounds) {
    for (const [pid, cell] of Object.entries(s.guesses[r] ?? {})) {
      const player = s.players.find((p) => p.id === pid)
      if (!player) continue
      const key = cellKey(cell)
      ;(m[key] ??= []).push({
        color: player.color,
        label: player.name.slice(0, 2).toUpperCase(),
        faded: phase.value === 'cue2' && r === 1,
      })
    }
  }
  return m
})

// The giver's secret target (also shown to everyone at reveal).
const targetKey = computed(() => (state.value?.target ? cellKey(state.value.target) : null))
function frameDist(c: Cell): number | null {
  const t = state.value?.target
  if (!t) return null
  return Math.max(Math.abs(c.col - t.col), Math.abs(c.row - t.row))
}

const myGuessThisRound = computed<Cell | null>(() => {
  const r = activeRound.value
  if (!r || !myId.value) return null
  return state.value?.guesses[r]?.[myId.value] ?? null
})

// --- Networking ---
async function refresh() {
  const id = myId.value
  state.value = await $fetch<StateView>('/api/state', { query: id ? { id } : {} })
}

async function join() {
  const name = nameInput.value.trim()
  if (!name) return
  const res = await $fetch<{ id: string; state: StateView }>('/api/join', {
    method: 'POST',
    body: { name },
  })
  myId.value = res.id
  myName.value = name
  state.value = res.state
  localStorage.setItem('hnc_id', res.id)
  localStorage.setItem('hnc_name', name)
}

async function act(type: string, extra: Record<string, unknown> = {}) {
  if (!myId.value) return
  state.value = await $fetch<StateView>('/api/action', {
    method: 'POST',
    body: { id: myId.value, type, ...extra },
  })
}

function onCellClick(col: number, row: number) {
  const r = activeRound.value
  if (!r || isGiver.value) return
  act('guess', { round: r, cell: { col, row } })
}

function onCardPick(cell: Cell) {
  if (phase.value !== 'pick' || !isGiver.value) return
  act('pick', { cell })
}

function leave() {
  localStorage.removeItem('hnc_id')
  localStorage.removeItem('hnc_name')
  myId.value = null
  myName.value = ''
}

const phaseHint = computed(() => {
  const g = giver.value?.name ?? '—'
  switch (phase.value) {
    case 'lobby':
      return 'Wartet auf den Start. Wer den ersten Hinweis geben will, startet den Zug.'
    case 'pick':
      return isGiver.value
        ? 'Du bist Hinweisgeber. Wähle heimlich eine der vier Farben als Ziel.'
        : `${g} wählt gerade heimlich eine Zielfarbe …`
    case 'cue1':
      return isGiver.value
        ? 'Sag jetzt deinen 1. Hinweis laut (ein Wort). Dann „Weiter".'
        : `${g} gibt den 1. Hinweis – setze deinen Stein.`
    case 'cue2':
      return isGiver.value
        ? 'Sag jetzt deinen 2. Hinweis laut (max. zwei Wörter). Dann „Aufdecken".'
        : `${g} gibt den 2. Hinweis – setze deinen zweiten Stein.`
    case 'reveal':
      return 'Aufgedeckt! Punkte vergeben. Wer will, startet die nächste Runde.'
  }
  return ''
})

onMounted(async () => {
  const savedId = localStorage.getItem('hnc_id')
  const savedName = localStorage.getItem('hnc_name')
  if (savedId) {
    myId.value = savedId
    myName.value = savedName ?? ''
  }
  await refresh()
  // If our saved id is no longer known to the server (restart/timeout), drop it.
  if (myId.value && state.value && !state.value.players.some((p) => p.id === myId.value)) {
    leave()
  }
  pollTimer = setInterval(refresh, 1500)
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="app">
    <!-- Name entry -->
    <div v-if="!myId" class="gate">
      <div class="gate-card">
        <h1>Hues &amp; Cues</h1>
        <p class="tag">Farben erraten – Hinweise werden laut im Raum gesagt.</p>
        <form @submit.prevent="join">
          <input v-model="nameInput" placeholder="Dein Name" maxlength="24" autofocus />
          <button type="submit" :disabled="!nameInput.trim()">Mitspielen</button>
        </form>
      </div>
    </div>

    <!-- Game -->
    <template v-else>
      <header class="bar">
        <div class="brand"><span class="dot" /> Hues &amp; Cues</div>
        <div class="hint">{{ phaseHint }}</div>
        <div class="who">
          <span class="chip" :style="{ background: me?.color }">{{ myName }}</span>
          <button class="ghost" @click="leave">Abmelden</button>
        </div>
      </header>

      <main>
        <section class="board-wrap">
          <!-- giver's card -->
          <div v-if="phase === 'pick' && isGiver && state?.card" class="card-pick">
            <span>Deine Karte – wähle ein Ziel:</span>
            <div class="swatches">
              <button
                v-for="c in state.card"
                :key="cellKey(c)"
                class="swatch"
                :style="{ background: cellColor(c.col, c.row) }"
                @click="onCardPick(c)"
              >
                {{ ROW_LETTERS[c.row] }}{{ c.col }}
              </button>
            </div>
          </div>

          <div class="board">
            <!-- column numbers -->
            <div class="corner" />
            <div v-for="col in COLS" :key="'c' + col" class="col-head">{{ col }}</div>
            <!-- rows -->
            <template v-for="row in ROWS" :key="'r' + row">
              <div class="row-head">{{ ROW_LETTERS[row - 1] }}</div>
              <button
                v-for="col in COLS"
                :key="col + '-' + row"
                class="cell"
                :class="{
                  clickable: !!activeRound && !isGiver,
                  target: phase === 'reveal' && targetKey === cellKey({ col, row: row - 1 }),
                  frame:
                    (phase === 'reveal' || isGiver) &&
                    frameDist({ col, row: row - 1 }) === 1,
                  mine:
                    myGuessThisRound &&
                    cellKey(myGuessThisRound) === cellKey({ col, row: row - 1 }),
                }"
                :style="{ background: cellColor(col, row - 1) }"
                @click="onCellClick(col, row - 1)"
              >
                <span
                  v-for="(mk, i) in markers[cellKey({ col, row: row - 1 })] || []"
                  :key="i"
                  class="marker"
                  :class="{ faded: mk.faded }"
                  :style="{ background: mk.color }"
                  >{{ mk.label }}</span
                >
              </button>
            </template>
          </div>
        </section>

        <aside class="side">
          <div class="panel">
            <h2>Am Zug</h2>
            <p v-if="giver" class="giver">
              <span class="chip" :style="{ background: giver.color }">{{ giver.name }}</span>
              <span v-if="isGiver" class="me-tag">(du)</span>
            </p>
            <p v-else class="muted">Niemand – starte eine Runde.</p>

            <!-- giver controls -->
            <div v-if="isGiver" class="controls">
              <button v-if="phase === 'cue1'" @click="act('advance')">Weiter zum 2. Hinweis →</button>
              <button v-if="phase === 'cue2'" class="primary" @click="act('advance')">Aufdecken &amp; werten</button>
            </div>

            <!-- start / next round -->
            <div v-if="phase === 'lobby' || phase === 'reveal'" class="controls">
              <button class="primary" @click="act('start-turn')">
                {{ phase === 'reveal' ? 'Nächste Runde – ich gebe den Hinweis' : 'Zug starten – ich gebe den Hinweis' }}
              </button>
            </div>

            <p v-if="!isGiver && (phase === 'cue1' || phase === 'cue2')" class="muted small">
              Stein gesetzt:
              {{ myGuessThisRound ? ROW_LETTERS[myGuessThisRound.row] + myGuessThisRound.col : 'noch nicht' }}
              – du kannst ihn bis zum Aufdecken verschieben.
            </p>
          </div>

          <div v-if="phase === 'reveal' && state?.lastResult && state?.target" class="panel">
            <h2>Ergebnis</h2>
            <p class="muted small">
              Ziel: {{ ROW_LETTERS[state.target.row] }}{{ state.target.col }} ·
              Hinweisgeber +{{ state.lastResult.giver }}
            </p>
            <ul class="results">
              <li v-for="(pts, pid) in state.lastResult.perPlayer" :key="pid">
                <span>{{ state.players.find((p) => p.id === pid)?.name ?? pid }}</span>
                <b>+{{ pts }}</b>
              </li>
            </ul>
          </div>

          <div class="panel">
            <h2>Punkte</h2>
            <ol class="scores">
              <li v-for="p in state?.players" :key="p.id">
                <span class="chip sm" :style="{ background: p.color }">{{ p.name }}</span>
                <b>{{ p.score }}</b>
              </li>
            </ol>
            <button class="ghost wide" @click="act('reset')">Spiel zurücksetzen</button>
          </div>
        </aside>
      </main>
    </template>
  </div>
</template>

<style>
:root {
  --bg: #14151a;
  --panel: #1d1f27;
  --line: #2c2f3a;
  --text: #e9eaf0;
  --muted: #9aa0b0;
  --accent: #ffd23f;
}
* { box-sizing: border-box; }
html, body, #__nuxt { height: 100%; margin: 0; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
}
.app { min-height: 100%; }

/* gate */
.gate { display: grid; place-items: center; min-height: 100vh; padding: 24px; }
.gate-card {
  background: var(--panel); border: 1px solid var(--line); border-radius: 18px;
  padding: 40px; width: min(420px, 100%); text-align: center;
}
.gate-card h1 { margin: 0 0 6px; font-size: 34px; letter-spacing: -0.5px; }
.tag { color: var(--muted); margin: 0 0 24px; }
.gate-card form { display: flex; gap: 10px; }
input {
  flex: 1; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line);
  background: #0f1014; color: var(--text); font-size: 16px;
}
button {
  cursor: pointer; border: none; border-radius: 10px; padding: 12px 16px;
  background: var(--accent); color: #1a1400; font-weight: 600; font-size: 15px;
}
button:disabled { opacity: 0.4; cursor: not-allowed; }
button.ghost { background: transparent; color: var(--muted); border: 1px solid var(--line); }
button.primary { background: var(--accent); }
button.wide { width: 100%; margin-top: 12px; }

/* bar */
.bar {
  display: flex; align-items: center; gap: 16px; padding: 12px 20px;
  border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--bg); z-index: 5;
}
.brand { font-weight: 700; display: flex; align-items: center; gap: 8px; }
.brand .dot {
  width: 14px; height: 14px; border-radius: 50%;
  background: conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red);
}
.bar .hint { flex: 1; color: var(--muted); font-size: 14px; }
.who { display: flex; align-items: center; gap: 10px; }

/* layout */
main { display: grid; grid-template-columns: 1fr 300px; gap: 20px; padding: 20px; align-items: start; }
@media (max-width: 900px) { main { grid-template-columns: 1fr; } }

/* board */
.board-wrap { min-width: 0; }
.card-pick {
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
  padding: 12px 14px; margin-bottom: 14px;
}
.card-pick > span { color: var(--muted); font-size: 14px; }
.swatches { display: flex; gap: 10px; margin-top: 10px; }
.swatch {
  flex: 1; height: 64px; border-radius: 10px; color: #0008; font-weight: 700;
  border: 2px solid #0003; text-shadow: 0 1px 2px #fff6;
}
.board {
  display: grid;
  grid-template-columns: 22px repeat(30, 1fr);
  gap: 1px; background: var(--line); border: 1px solid var(--line);
  border-radius: 8px; overflow: hidden;
}
.corner { background: var(--bg); }
.col-head, .row-head {
  background: var(--bg); color: var(--muted); font-size: 9px;
  display: grid; place-items: center; min-height: 14px;
}
.cell {
  position: relative; aspect-ratio: 1 / 1; padding: 0; border-radius: 0;
  border: none; min-width: 0;
}
.cell.clickable { cursor: crosshair; }
.cell.clickable:hover { outline: 2px solid #fff; outline-offset: -2px; z-index: 2; }
.cell.mine { outline: 2px solid #fff; outline-offset: -2px; z-index: 2; }
.cell.frame { box-shadow: inset 0 0 0 2px #ffffffaa; z-index: 1; }
.cell.target { box-shadow: inset 0 0 0 3px #000, inset 0 0 0 6px #fff; z-index: 3; }
.marker {
  position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%);
  min-width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid #fff;
  color: #fff; font-size: 8px; font-weight: 700; display: grid; place-items: center;
  text-shadow: 0 1px 1px #000; box-shadow: 0 1px 3px #0008; padding: 0 2px;
}
.marker.faded { opacity: 0.45; }

/* side */
.side { display: flex; flex-direction: column; gap: 16px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
.panel h2 { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
.controls { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.controls button { width: 100%; }
.giver { margin: 0; }
.me-tag { color: var(--muted); margin-left: 6px; font-size: 13px; }
.chip { padding: 4px 10px; border-radius: 999px; color: #0009; font-weight: 700; font-size: 13px; }
.chip.sm { font-size: 12px; padding: 3px 8px; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.results, .scores { list-style: none; margin: 0; padding: 0; }
.results li, .scores li { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); }
.scores li b { font-variant-numeric: tabular-nums; font-size: 16px; }
</style>
