import type { ToolHandler } from '@main/agent/tools/types'
import { ENV } from '@main/config/env'

interface OpenDoorArgs { code?: string }

export const openDoor: ToolHandler<OpenDoorArgs> = async (params, _call, { db, zenitel }) => {
  const normalized = (params.code || '').replace(/\D/g, '').trim()
  console.log(`[tool] openDoor: code="${normalized}"`)
  const result = db.validateCode(normalized)
  if (!result.valid) {
    db.addEvent({ type: 'err', date: new Date().toISOString(), source: 'agent', details: `Code failed: ${normalized}`, visit_id: null })
    return { success: false, error: 'Invalid access code' }
  }
  console.log(`[tool] Valid code for: ${result.visitor} — opening door`)
  try {
    const timerSec = Math.round(ENV.RELAY_TIMER_MS / 1000)
    await zenitel.activateRelay({ relayId: 'relay1', timer: timerSec })
    // Safety net: explicitly deactivate after timer in case device timer fails
    setTimeout(async () => {
      try {
        await zenitel.deactivateRelay('relay1')
        console.log(`[tool] Door auto-closed after ${timerSec}s`)
      } catch { /* relay already deactivated */ }
    }, ENV.RELAY_TIMER_MS)
  } catch (err: any) {
    console.error(`[tool] Relay failed:`, err.message)
    return { success: false, error: 'Failed to open door — relay error' }
  }
  db.addEvent({ type: 'auth', date: new Date().toISOString(), source: 'agent', details: `Code ${normalized} validated: ${result.visitor}`, visit_id: null })
  return { success: true, visitor: result.visitor, message: `Door opened for ${result.visitor}` }
}
