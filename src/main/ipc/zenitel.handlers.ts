/**
 * Portia IPC — Zenitel handlers.
 */

import { ipcMain } from 'electron'
import { TcivClient, scanNetwork } from 'tciv-client'
import type { PortiaDB } from '@main/db'
import { ENV } from '@main/config/env'

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
    const sipDomain = ENV.SIP_DOMAIN

    // SIP identity — fixed Twilio credential for this intercom
    const sipName = ENV.SIP_NAME
    const sipId = ENV.SIP_ID

    // DAK target — the Portia agent's phone (dynamic per installation)
    const agentPhone = config.agentPhone || config.sipId || 'portia'
    const dakAddress = `${agentPhone}@${sipDomain}`

    // Read current state to avoid unnecessary writes + reboots
    const currentSip = await z.getSIPConfig()
    const currentDak = await z.getDAK()
    const info = await z.getDeviceInfo()

    const sipOk = currentSip.domain === sipDomain
      && currentSip.directoryNumber === sipId
      && currentSip.authUsername === ENV.SIP_AUTH_USER
    const dakOk = currentDak === dakAddress
    let needsReboot = false

    // 1. Configure SIP registration (only if changed)
    if (!sipOk) {
      await z.setSIPConfig({
        displayName: sipName,
        directoryNumber: sipId,
        domain: sipDomain,
        authUsername: ENV.SIP_AUTH_USER,
        authPassword: ENV.SIP_AUTH_PASS,
        outboundProxy: sipDomain,
        transport: 'udp',
      })
      needsReboot = true
      console.log(`[zenitel] SIP config updated: ${sipId}@${sipDomain}`)
    } else {
      console.log(`[zenitel] SIP config already correct — skipping`)
    }

    // 2. Set DAK (only if changed)
    if (!dakOk) {
      await z.setDAK(dakAddress)
      console.log(`[zenitel] DAK updated → ${dakAddress}`)
    } else {
      console.log(`[zenitel] DAK already correct — skipping`)
    }

    // 3. Enable webcall (idempotent, always safe)
    if (!info.webcallEnabled) {
      await z.enableWebcall()
      console.log(`[zenitel] Webcall enabled`)
    }

    // 4. Reboot only if SIP config changed (required for registration)
    if (needsReboot) {
      console.log(`[zenitel] Rebooting to apply SIP changes...`)
      await z.reboot()
    }

    db.updateConfig({ sipId, sipDomain })
    console.log(`[zenitel] Provision done (reboot=${needsReboot})`)
    return { sipId, sipDomain, dakAddress, needsReboot }
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
