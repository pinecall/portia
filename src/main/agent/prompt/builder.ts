/**
 * Prompt builder — reads template.md and renders placeholders.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PortiaDB } from '../../db'

let templateCache: string | null = null

function loadTemplate(): string {
  if (templateCache) return templateCache
  const path = resolve(__dirname, 'template.md')
  templateCache = readFileSync(path, 'utf-8')
  return templateCache
}

export function buildPrompt(db: PortiaDB): string {
  const config = db.getConfig()
  const building = config.buildingName || 'el edificio'
  const teamContext = db.getTeamSummary()
  const codesContext = db.getAccessCodesSummary()

  const now = new Date()
  const dateBlock = `## CURRENT DATE AND TIME\nToday is ${now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })}. Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`

  const prompt = loadTemplate().replace(/\{\{building\}\}/g, building)
  return `${prompt}\n\n${dateBlock}\n\n## ${teamContext}\n\n## ${codesContext}`
}
