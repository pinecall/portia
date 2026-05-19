/**
 * Portia Logger — scoped logging with levels.
 *
 * Usage:
 *   const log = createLogger('agent')
 *   log.info('Connected')     // [agent] Connected
 *   log.debug('Key: val')     // (silent in production)
 *   log.error('Failed', err)  // [agent] Failed Error: ...
 *
 * Set PORTIA_LOG_LEVEL=debug in .env to enable debug output.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const currentLevel: LogLevel = (process.env.PORTIA_LOG_LEVEL as LogLevel) || 'info'

export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`
  const threshold = LEVELS[currentLevel] ?? LEVELS.info

  return {
    debug: (...args) => { if (threshold <= LEVELS.debug) console.debug(prefix, ...args) },
    info: (...args) => { if (threshold <= LEVELS.info) console.log(prefix, ...args) },
    warn: (...args) => { if (threshold <= LEVELS.warn) console.warn(prefix, ...args) },
    error: (...args) => { console.error(prefix, ...args) }, // always show errors
  }
}
