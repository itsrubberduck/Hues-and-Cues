export interface Cell {
  col: number // 1..30
  row: number // 0..15
}

/** Chebyshev distance on the board grid. */
export function cellDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row))
}

/** Points a single stone earns against the target (original rules). */
export function scoreGuess(target: Cell, guess: Cell): number {
  const d = cellDistance(target, guess)
  if (d === 0) return 3
  if (d === 1) return 2
  if (d === 2) return 1
  return 0
}

export interface RoundResult {
  perPlayer: Record<string, number>
  giver: number
}

/**
 * Tally every player's stones against the target and compute the cue giver's
 * bonus: +1 per stone that lands inside the 3x3 scoring frame (distance <= 1).
 */
export function scoreRound(
  target: Cell,
  stonesByPlayer: Record<string, Cell[]>,
): RoundResult {
  const perPlayer: Record<string, number> = {}
  let giver = 0

  for (const [playerId, stones] of Object.entries(stonesByPlayer)) {
    let total = 0
    for (const stone of stones) {
      total += scoreGuess(target, stone)
      if (cellDistance(target, stone) <= 1) giver += 1
    }
    perPlayer[playerId] = total
  }

  return { perPlayer, giver }
}
