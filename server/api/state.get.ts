import { getGame, touch, viewFor } from '../utils/game'

export default defineEventHandler((event) => {
  const id = (getQuery(event).id as string) || null
  getGame() // prune stale players first
  if (id) touch(id)
  return viewFor(id)
})
