import type { Cell } from '../utils/scoring'
import {
  advance,
  pickTarget,
  placeGuess,
  resetGame,
  startTurn,
  touch,
  viewFor,
} from '../utils/game'

interface ActionBody {
  id: string
  type: 'start-turn' | 'pick' | 'guess' | 'advance' | 'reset'
  cell?: Cell
  round?: 1 | 2
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ActionBody>(event)
  if (!body?.id || !body?.type) {
    throw createError({ statusCode: 400, message: 'id and type required' })
  }
  touch(body.id)

  switch (body.type) {
    case 'start-turn':
      startTurn(body.id)
      break
    case 'pick':
      if (body.cell) pickTarget(body.id, body.cell)
      break
    case 'guess':
      if (body.cell && (body.round === 1 || body.round === 2)) {
        placeGuess(body.id, body.round, body.cell)
      }
      break
    case 'advance':
      advance(body.id)
      break
    case 'reset':
      resetGame()
      break
    default:
      throw createError({ statusCode: 400, message: 'unknown action' })
  }

  return viewFor(body.id)
})
