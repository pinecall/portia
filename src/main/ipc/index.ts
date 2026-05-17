/**
 * Portia IPC — Handler registration.
 *
 * Composes all domain-specific handler modules.
 */

import { BrowserWindow } from 'electron'
import type { PortiaDB } from '@main/db'
import { registerZenitelHandlers } from './zenitel.handlers'
import { registerDbHandlers } from './db.handlers'
import { registerConfigHandlers } from './config.handlers'

export function registerIpcHandlers(window: BrowserWindow, db: PortiaDB) {
  registerZenitelHandlers(db)
  registerDbHandlers(db)
  registerConfigHandlers(window, db)
}
