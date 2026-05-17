/**
 * Greeting builder — time-aware Spanish greeting.
 */

import type { PortiaDB } from '../../db'

export function buildGreeting(db: PortiaDB): string {
  const h = new Date().getHours()
  const saludo = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
  const config = db.getConfig()
  const building = config.buildingName || 'el edificio'
  return `${saludo}, bienvenido a ${building}. Soy la recepcionista virtual. ¿Cuál es su nombre, por favor?`
}
