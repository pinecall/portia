/**
 * Events repository.
 */

import type { AppEvent, EventInput } from '../../../shared/domain'
import { queryAll, run } from '../connection'

export function getEvents(limit = 100): AppEvent[] {
  return queryAll('SELECT * FROM events ORDER BY date DESC LIMIT ?', [limit]) as unknown as AppEvent[]
}

export function addEvent(event: EventInput): EventInput {
  run(
    'INSERT INTO events (type, source, details, visit_id) VALUES (?, ?, ?, ?)',
    [event.type || null, event.source || null, event.details || null, event.visit_id ?? null],
  )
  return event
}
