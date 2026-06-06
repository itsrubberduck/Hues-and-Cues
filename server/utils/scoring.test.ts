import { describe, expect, test } from 'vitest'
import { cellDistance, playerStones, scoreGuess, scoreRound } from './scoring'

describe('cellDistance (Chebyshev)', () => {
  test('same cell is distance 0', () => {
    expect(cellDistance({ col: 5, row: 5 }, { col: 5, row: 5 })).toBe(0)
  })

  test('diagonal neighbour is distance 1', () => {
    expect(cellDistance({ col: 5, row: 5 }, { col: 6, row: 6 })).toBe(1)
  })

  test('takes the larger of column and row deltas', () => {
    expect(cellDistance({ col: 2, row: 10 }, { col: 5, row: 11 })).toBe(3)
  })
})

describe('scoreGuess (points for one stone vs target)', () => {
  const target = { col: 15, row: 8 }

  test('exact hit scores 3', () => {
    expect(scoreGuess(target, { col: 15, row: 8 })).toBe(3)
  })

  test('adjacent (distance 1) scores 2', () => {
    expect(scoreGuess(target, { col: 16, row: 9 })).toBe(2)
  })

  test('distance 2 scores 1', () => {
    expect(scoreGuess(target, { col: 17, row: 8 })).toBe(1)
  })

  test('distance 3+ scores 0', () => {
    expect(scoreGuess(target, { col: 18, row: 8 })).toBe(0)
  })
})

describe('playerStones (a player has two cubes per turn)', () => {
  const a = { col: 5, row: 5 }
  const b = { col: 9, row: 2 }

  test('both rounds placed -> both stones count', () => {
    expect(playerStones(a, b)).toEqual([a, b])
  })

  test('only round 1 placed -> the first guess counts twice', () => {
    expect(playerStones(a, undefined)).toEqual([a, a])
  })

  test('only round 2 placed -> the second guess counts twice', () => {
    expect(playerStones(undefined, b)).toEqual([b, b])
  })

  test('nothing placed -> no stones', () => {
    expect(playerStones(undefined, undefined)).toEqual([])
  })
})

describe('scoreRound (tally all stones + cue giver bonus)', () => {
  test('awards per-stone points and gives cue giver +1 per stone within the 3x3 frame', () => {
    const target = { col: 10, row: 10 }
    const stones = {
      alice: [
        { col: 10, row: 10 }, // exact -> 3, in frame
        { col: 11, row: 11 }, // d1 -> 2, in frame
      ],
      bob: [
        { col: 12, row: 10 }, // d2 -> 1, outside frame
        { col: 14, row: 10 }, // d4 -> 0, outside frame
      ],
    }

    const result = scoreRound(target, stones)

    expect(result.perPlayer.alice).toBe(5)
    expect(result.perPlayer.bob).toBe(1)
    // Two stones (alice's exact + alice's d1) sit inside the 3x3 frame.
    expect(result.giver).toBe(2)
  })

  test('handles a player with no stones', () => {
    const target = { col: 1, row: 1 }
    const result = scoreRound(target, { carol: [] })
    expect(result.perPlayer.carol).toBe(0)
    expect(result.giver).toBe(0)
  })
})
