/**
 * Prompt — template inlined at build time via Vite ?raw import.
 *
 * The template uses {{building}}, {{team}}, {{codes}}, {{date}}, {{time}}
 * as placeholders. The server resolves {{date}} and {{time}} automatically.
 * We send {{building}}, {{team}}, {{codes}} via call.setPromptVars().
 *
 * Supports presets: 'openai' (default), 'mistral', 'custom'.
 */

// Vite inlines the .md content as a string at build time — no fs.readFileSync needed
import openaiTemplate from './template.md?raw'
import mistralTemplate from './template-mistral.md?raw'
import type { PortiaDB } from '@main/db'

/** Built-in preset templates. */
export const PROMPT_PRESETS: Record<string, string> = {
  openai: openaiTemplate,
  mistral: mistralTemplate,
}

/** Return the raw prompt template based on config preset. */
export function getPromptTemplate(db?: PortiaDB): string {
  if (!db) return openaiTemplate
  const config = db.getConfig()
  if (config.promptPreset === 'custom' && config.customPrompt) {
    return config.customPrompt
  }
  return PROMPT_PRESETS[config.promptPreset || 'openai'] || openaiTemplate
}

/** Return a specific preset template by name. */
export function getPresetTemplate(preset: string): string {
  return PROMPT_PRESETS[preset] || openaiTemplate
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
