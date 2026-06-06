import { joinPlayer, viewFor } from '../utils/game'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string }>(event)
  const id = joinPlayer(body?.name ?? '')
  return { id, state: viewFor(id) }
})
