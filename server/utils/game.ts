import type { Cell, RoundResult } from './scoring'
import { playerStones, scoreRound } from './scoring'

export type Phase = 'lobby' | 'pick' | 'cue1' | 'cue2' | 'reveal'

export interface Player {
  id: string
  name: string
  color: string
  score: number
  lastSeen: number
}

export interface GameState {
  version: number
  phase: Phase
  players: Record<string, Player>
  turnOrder: string[]
  cueGiverId: string | null
  card: Cell[] | null // 4 candidate cells, only the giver should see these
  target: Cell | null // hidden from non-givers until reveal
  guesses: { 1: Record<string, Cell>; 2: Record<string, Cell> }
  lastResult: RoundResult | null
}

const BOARD_COLS = 30
const BOARD_ROWS = 16
const PLAYER_TIMEOUT_MS = 15_000

// Distinct, readable stone colors handed out to players in order.
const PLAYER_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
]

function freshState(): GameState {
  return {
    version: 1,
    phase: 'lobby',
    players: {},
    turnOrder: [],
    cueGiverId: null,
    card: null,
    target: null,
    guesses: { 1: {}, 2: {} },
    lastResult: null,
  }
}

// Module-level singleton: one shared global game for the whole server process.
const game: GameState = freshState()

function bump() {
  game.version += 1
}

function randomCell(): Cell {
  return {
    col: 1 + Math.floor(Math.random() * BOARD_COLS),
    row: Math.floor(Math.random() * BOARD_ROWS),
  }
}

function dealCard(): Cell[] {
  const cells: Cell[] = []
  const seen = new Set<string>()
  while (cells.length < 4) {
    const c = randomCell()
    const key = `${c.col},${c.row}`
    if (seen.has(key)) continue
    seen.add(key)
    cells.push(c)
  }
  return cells
}

function pruneStalePlayers() {
  const now = Date.now()
  let changed = false
  for (const id of Object.keys(game.players)) {
    if (now - game.players[id].lastSeen > PLAYER_TIMEOUT_MS) {
      delete game.players[id]
      game.turnOrder = game.turnOrder.filter((p) => p !== id)
      changed = true
    }
  }
  // If the active cue giver dropped, reset back to lobby.
  if (game.cueGiverId && !game.players[game.cueGiverId]) {
    game.cueGiverId = null
    game.phase = 'lobby'
    game.card = null
    game.target = null
    game.guesses = { 1: {}, 2: {} }
    changed = true
  }
  if (changed) bump()
}

export function getGame(): GameState {
  pruneStalePlayers()
  return game
}

export function touch(id: string) {
  const p = game.players[id]
  if (p) p.lastSeen = Date.now()
}

export function joinPlayer(name: string): string {
  const id = Math.random().toString(36).slice(2, 10)
  const color = PLAYER_COLORS[Object.keys(game.players).length % PLAYER_COLORS.length]
  game.players[id] = {
    id,
    name: name.trim().slice(0, 24) || 'Spieler',
    color,
    score: 0,
    lastSeen: Date.now(),
  }
  game.turnOrder.push(id)
  bump()
  return id
}

export function startTurn(id: string) {
  if (game.phase !== 'lobby' && game.phase !== 'reveal') return
  if (!game.players[id]) return
  game.cueGiverId = id
  game.card = dealCard()
  game.target = null
  game.guesses = { 1: {}, 2: {} }
  game.lastResult = null
  game.phase = 'pick'
  bump()
}

export function pickTarget(id: string, cell: Cell) {
  if (game.phase !== 'pick' || game.cueGiverId !== id || !game.card) return
  const onCard = game.card.some((c) => c.col === cell.col && c.row === cell.row)
  if (!onCard) return
  game.target = cell
  game.phase = 'cue1'
  bump()
}

export function placeGuess(id: string, round: 1 | 2, cell: Cell) {
  if (id === game.cueGiverId) return // the giver does not guess
  if (!game.players[id]) return
  if (round === 1 && game.phase !== 'cue1') return
  if (round === 2 && game.phase !== 'cue2') return
  if (cell.col < 1 || cell.col > BOARD_COLS || cell.row < 0 || cell.row >= BOARD_ROWS) return
  game.guesses[round][id] = cell
  bump()
}

export function advance(id: string) {
  if (game.cueGiverId !== id) return
  if (game.phase === 'cue1') {
    game.phase = 'cue2'
    bump()
  } else if (game.phase === 'cue2') {
    revealAndScore()
  }
}

function revealAndScore() {
  if (!game.target) return
  const stonesByPlayer: Record<string, Cell[]> = {}
  for (const pid of Object.keys(game.players)) {
    if (pid === game.cueGiverId) continue
    stonesByPlayer[pid] = playerStones(game.guesses[1][pid], game.guesses[2][pid])
  }
  const result = scoreRound(game.target, stonesByPlayer)
  for (const [pid, pts] of Object.entries(result.perPlayer)) {
    if (game.players[pid]) game.players[pid].score += pts
  }
  if (game.cueGiverId && game.players[game.cueGiverId]) {
    game.players[game.cueGiverId].score += result.giver
  }
  game.lastResult = result
  game.phase = 'reveal'
  bump()
}

export function resetGame() {
  // Keep connected players, wipe scores and round state back to the lobby.
  for (const p of Object.values(game.players)) p.score = 0
  game.phase = 'lobby'
  game.cueGiverId = null
  game.card = null
  game.target = null
  game.guesses = { 1: {}, 2: {} }
  game.lastResult = null
  bump()
}

/**
 * Build the view a specific client is allowed to see. The secret target and the
 * giver's card are hidden from non-givers until the reveal phase.
 */
export function viewFor(requesterId: string | null) {
  const isGiver = requesterId != null && requesterId === game.cueGiverId
  const revealed = game.phase === 'reveal'
  return {
    version: game.version,
    phase: game.phase,
    players: Object.values(game.players)
      .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score }))
      .sort((a, b) => b.score - a.score),
    cueGiverId: game.cueGiverId,
    card: isGiver || revealed ? game.card : null,
    target: isGiver || revealed ? game.target : null,
    guesses: game.guesses,
    lastResult: game.lastResult,
    you: requesterId,
    board: { cols: BOARD_COLS, rows: BOARD_ROWS },
  }
}
