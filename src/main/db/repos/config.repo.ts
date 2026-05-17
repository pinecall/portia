/**
 * Config repository — key-value store for app configuration.
 */

import type { AppConfig } from '../../../shared/domain'
import { queryAll, run } from '../connection'

const CONFIG_DEFAULTS: AppConfig = {
  zenitelHost: '',
  zenitelUser: 'admin',
  zenitelPassword: 'alphaadmin',
  zenitelHasCamera: false,
  pinecallApiKey: '',
  agentPhone: '',
  buildingName: '',
  language: 'es',
  wizardCompleted: false,
  theme: 'dark',
}

/** Seed config table with defaults if empty. */
export function seedConfigDefaults(): void {
  const results = queryAll('SELECT COUNT(*) as n FROM config')
  const count = (results[0]?.n as number) || 0
  if (count > 0) return

  for (const [k, v] of Object.entries(CONFIG_DEFAULTS)) {
    run('INSERT INTO config (key, value) VALUES (?, ?)', [k, JSON.stringify(v)])
  }
}

export function getConfig(): AppConfig {
  const config = { ...CONFIG_DEFAULTS } as Record<string, unknown>
  const rows = queryAll('SELECT key, value FROM config')
  for (const row of rows) {
    try {
      config[row.key as string] = JSON.parse(row.value as string)
    } catch { /* keep default */ }
  }
  return config as unknown as AppConfig
}

export function updateConfig(updates: Partial<AppConfig>): AppConfig {
  for (const [k, v] of Object.entries(updates)) {
    run(
      'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [k, JSON.stringify(v)],
    )
  }
  return getConfig()
}
