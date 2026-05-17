/**
 * Prompt — reads template.md, renders greeting, exposes vars for setPromptVars.
 *
 * The template uses {{building}}, {{team}}, {{codes}}, {{date}}, {{time}}
 * as placeholders. The server resolves {{date}} and {{time}} automatically.
 * We send {{building}}, {{team}}, {{codes}} via call.setPromptVars().
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PortiaDB } from '@main/db'

let templateCache: string | null = null

function loadTemplate(): string {
  if (templateCache) return templateCache
  const path = resolve(__dirname, 'template.md')
  templateCache = readFileSync(path, 'utf-8')
  return templateCache
}

/** Return the raw prompt template (with {{placeholders}} intact). */
export function getPromptTemplate(): string {
  return loadTemplate()
}

/** Build the prompt vars object for call.setPromptVars(). */
export function getPromptVars(db: PortiaDB): Record<string, string> {
  const config = db.getConfig()
  return {
    building: config.buildingName || 'el edificio',
    team: db.getTeamSummary(),
    codes: db.getAccessCodesSummary(),
  }
}

/** Build time-aware Spanish greeting. */
export function buildGreeting(db: PortiaDB): string {
  const h = new Date().getHours()
  const saludo = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
  const config = db.getConfig()
  const building = config.buildingName || 'el edificio'
  return `${saludo}, bienvenido a ${building}. Soy la recepcionista virtual. ¿Cuál es su nombre, por favor?`
}
