/**
 * Portia Constants — magic numbers extracted to named constants.
 */

/** Relay timer for door open (ms) */
export const RELAY_TIMER_MS = 7000

/** Debounce interval for DB saves (ms) */
export const DB_SAVE_DEBOUNCE_MS = 250

/** Timeout waiting for Zenitel reboot (ms) */
export const ZENITEL_REBOOT_TIMEOUT_MS = 60000

/** Number of recent visits to include in keyterms */
export const KEYTERMS_VISIT_LIMIT = 50

/** Maximum access code attempts before lockout */
export const MAX_CODE_ATTEMPTS = 2
