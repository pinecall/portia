import { z } from 'zod'
import { defineTool } from '../define-tool'
import { ENV } from '@main/config/env'
import { createLogger } from '@main/logger'

const log = createLogger('tool')

export const openDoor = defineTool({
  name: 'openDoor',
  description:
    'Verify the visitor\'s access code and open the building door if valid. ' +
    'Call this ONLY after the visitor provides their 5-digit numeric access code. ' +
    'The tool validates the code against the database and sends DTMF to open the door relay. ' +
    'Returns whether the door was opened successfully and the visitor\'s registered name.',
  schema: z.object({
    code: z.string().describe('The 5-digit numeric access code provided by the visitor'),
  }),
  async handler(params, _call, { db, zenitel }) {
    const normalized = params.code.replace(/\D/g, '').trim()
    log.info(`openDoor: code="${normalized}"`)
    const result = db.validateCode(normalized)
    if (!result.valid) {
      db.addEvent({ type: 'err', date: new Date().toISOString(), source: 'agent', details: `Code failed: ${normalized}`, visit_id: null })
      return { success: false, error: 'Invalid access code' }
    }
    log.info(`Valid code for: ${result.visitor} — opening door`)
    try {
      const timerSec = Math.round(ENV.RELAY_TIMER_MS / 1000)
      await zenitel.activateRelay({ relayId: 'relay1', timer: timerSec })
      // Safety net: explicitly deactivate after timer in case device timer fails
      setTimeout(async () => {
        try {
          await zenitel.deactivateRelay('relay1')
          log.info(`Door auto-closed after ${timerSec}s`)
        } catch { /* relay already deactivated */ }
      }, ENV.RELAY_TIMER_MS)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[tool] Relay failed:`, msg)
      return { success: false, error: 'Failed to open door — relay error' }
    }
    db.addEvent({ type: 'auth', date: new Date().toISOString(), source: 'agent', details: `Code ${normalized} validated: ${result.visitor}`, visit_id: null })
    return { success: true, visitor: result.visitor, message: `Door opened for ${result.visitor}` }
  },
})
