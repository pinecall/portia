/**
 * Portia IPC — Zenitel handlers.
 */

import { ipcMain } from 'electron'
import { TcivClient, scanNetwork } from 'tciv-client'
import type { PortiaDB } from '../db'
import { ENV } from '../config/env'

export function registerZenitelHandlers(db: PortiaDB) {
  const _client = (config: { zenitelHost: string; zenitelUser: string; zenitelPassword: string }) =>
    new TcivClient({ host: config.zenitelHost, user: config.zenitelUser, password: config.zenitelPassword })

  ipcMain.handle('zenitel:scan', async () => scanNetwork({ timeout: 8000 }))

  ipcMain.handle('zenitel:info', async () => {
    return _client(db.getConfig()).getDeviceInfo()
  })

  ipcMain.handle('zenitel:test', async () => {
    const config = db.getConfig()
    const z = _client(config)
    const reachable = await z.isReachable()
    if (!reachable) return { reachable: false, webcallEnabled: false }
    const info = await z.getDeviceInfo()
    return { reachable: true, webcallEnabled: info.webcallEnabled, model: info.model }
  })

  ipcMain.handle('zenitel:relay', async (_, opts: any) => {
    const z = _client(db.getConfig())
    if (opts === 'deactivate' || opts?.action === 'deactivate') {
      await z.deactivateRelay(opts?.relayId || 'relay1')
    } else {
      await z.activateRelay({ relayId: opts?.relayId || 'relay1', timer: opts?.timer || 3 })
    }
  })

  ipcMain.handle('zenitel:sip:get', async () => _client(db.getConfig()).getSIPConfig())
  ipcMain.handle('zenitel:sip:set', async (_, config: any) => { await _client(db.getConfig()).setSIPConfig(config) })
  ipcMain.handle('zenitel:webcall:enable', async () => { await _client(db.getConfig()).enableWebcall() })

  ipcMain.handle('zenitel:provision', async () => {
    const config = db.getConfig()
    const z = _client(config)
    const sipDomain = config.sipDomain || ENV.SIP_DOMAIN
    const sipId = config.agentPhone || config.sipId || 'portia'
    const dakAddress = `${sipId}@${sipDomain}`
    await z.setDAK(dakAddress)
    await z.enableWebcall()
    db.updateConfig({ sipId, sipDomain })
    return { sipId, sipDomain, dakAddress }
  })

  ipcMain.handle('zenitel:reboot', async () => { await _client(db.getConfig()).reboot() })
  ipcMain.handle('zenitel:factory-reset', async () => { await _client(db.getConfig()).factoryReset('keep-ip') })

  ipcMain.handle('zenitel:set-mode', async (_, mode: string) => {
    const z = _client(db.getConfig())
    await z.setMode(mode as any)
    await z.applyChanges()
  })

  ipcMain.handle('zenitel:wait-reboot', async () => {
    const online = await _client(db.getConfig()).waitForReboot(60000, 3000)
    return { online }
  })

  ipcMain.handle('zenitel:get-settings', async () => {
    const z = _client(db.getConfig())
    const info = await z.getDeviceInfo()
    const sip = await z.getSIPConfig()
    return {
      mode: info.mode, model: info.model, firmware: info.firmware,
      webcallEnabled: info.webcallEnabled, sipDomain: sip.domain,
      sipNumber: sip.directoryNumber, sipRegistered: info.sipRegistered,
    }
  })

  ipcMain.handle('zenitel:video-url', () => {
    const config = db.getConfig()
    return `portia-cam:///?ip=${config.zenitelHost}&user=${config.zenitelUser}&pass=${config.zenitelPassword}`
  })

  ipcMain.handle('zenitel:audio:get', async () => _client(db.getConfig()).getAudioSettings())
  ipcMain.handle('zenitel:audio:set', async (_, settings: any) => { await _client(db.getConfig()).setAudioSettings(settings) })
}
