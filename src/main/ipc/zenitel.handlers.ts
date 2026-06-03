/**
 * Portia IPC — Zenitel handlers.
 */

import { ipcMain } from 'electron'
import { TcivClient, scanNetwork } from 'tciv-client'
import type { PortiaDB } from '@main/db'
import { ENV } from '@main/config/env'
import { ZENITEL_REBOOT_TIMEOUT_MS } from '@main/constants'
import { createLogger } from '@main/logger'
import { z } from 'zod'

const log = createLogger('zenitel')

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
    return {
      reachable: true,
      webcallEnabled: info.webcallEnabled,
      model: info.model,
      firmware: info.firmware,
      mode: info.mode,
      sipRegistered: info.sipRegistered,
    }
  })

  const RelayOptsSchema = z.union([
    z.literal('deactivate'),
    z.object({
      action: z.enum(['activate', 'deactivate']).optional(),
      relayId: z.string().optional(),
      timer: z.number().optional(),
    }),
  ])

  ipcMain.handle('zenitel:relay', async (_, raw: unknown) => {
    const parsed = RelayOptsSchema.safeParse(raw)
    if (!parsed.success) return { error: 'Invalid relay options' }
    const opts = parsed.data
    const z = _client(db.getConfig())
    if (opts === 'deactivate' || (typeof opts === 'object' && opts.action === 'deactivate')) {
      await z.deactivateRelay(typeof opts === 'object' ? opts.relayId || 'relay1' : 'relay1')
    } else if (typeof opts === 'object') {
      await z.activateRelay({ relayId: opts.relayId || 'relay1', timer: opts.timer || 3 })
    }
  })

  ipcMain.handle('zenitel:sip:get', async () => _client(db.getConfig()).getSIPConfig())
  ipcMain.handle('zenitel:sip:set', async (_, config: Record<string, unknown>) => { await _client(db.getConfig()).setSIPConfig(config as Parameters<TcivClient['setSIPConfig']>[0]) })
  ipcMain.handle('zenitel:webcall:enable', async () => { await _client(db.getConfig()).enableWebcall() })

  ipcMain.handle('zenitel:provision', async () => {
    const config = db.getConfig()
    const z = _client(config)
    const sipDomain = ENV.SIP_DOMAIN
    const sipName = ENV.SIP_NAME
    const sipId = ENV.SIP_ID

    // Agent's SIP ID — the intercom DAK must call this, not itself
    const agentSipId = config.agentPhone

    // Pre-flight validation
    if (!sipDomain) return { error: 'Missing SIP domain (PORTIA_SIP_DOMAIN)' }
    if (!sipId) return { error: 'Missing SIP ID (PORTIA_SIP_ID)' }
    if (!agentSipId) return { error: 'Missing agent phone (run wizard first)' }
    if (!ENV.SIP_AUTH_USER) return { error: 'Missing SIP auth user (PORTIA_SIP_AUTH_USER)' }
    if (!ENV.SIP_AUTH_PASS) return { error: 'Missing SIP auth password (PORTIA_SIP_AUTH_PASS)' }

    // DAK target — intercom button calls the agent's random SIP ID (e.g. "portia-ef99@domain")
    const dakAddress = `${agentSipId}@${sipDomain}`

    // Read current state to avoid unnecessary writes + reboots
    const currentSip = await z.getSIPConfig()
    const currentDak = await z.getDAK()

    log.info(`Current SIP: ${currentSip.directoryNumber}@${currentSip.domain}`)
    log.info(`Current DAK: ${currentDak}`)
    log.info(`Target SIP: ${sipId}@${sipDomain}`)
    log.info(`Target DAK: ${dakAddress}`)

    const sipOk = currentSip.domain === sipDomain
      && currentSip.directoryNumber === sipId
      && currentSip.authUsername === ENV.SIP_AUTH_USER
    const dakOk = currentDak === dakAddress
    let needsReboot = false

    // 1. Configure SIP registration (only if changed)
    if (!sipOk) {
      await z.setSIPConfig({
        displayName: sipName || sipId,
        directoryNumber: sipId,
        domain: sipDomain,
        authUsername: ENV.SIP_AUTH_USER,
        authPassword: ENV.SIP_AUTH_PASS,
        outboundProxy: sipDomain,
        transport: 'udp',
      })
      needsReboot = true
      log.info(`SIP config updated: ${sipId}@${sipDomain} (user: ${ENV.SIP_AUTH_USER})`)
    } else {
      log.info('SIP config already correct — skipping')
    }

    // 2. Set DAK (only if changed)
    if (!dakOk) {
      await z.setDAK(dakAddress)
      log.info(`DAK updated → ${dakAddress}`)
    } else {
      log.info('DAK already correct — skipping')
    }

    // 3. Enable webcall + relay HTTP API
    await z.enableWebcall()

    // 4. Reboot only if SIP config changed (required for registration)
    if (needsReboot) {
      log.info('Rebooting to apply SIP changes...')
      await z.reboot()
    }

    db.updateConfig({ sipId, sipDomain })
    log.info(`Provision done (reboot=${needsReboot})`)
    return { sipId, sipDomain, dakAddress, needsReboot }
  })

  ipcMain.handle('zenitel:reboot', async () => { await _client(db.getConfig()).reboot() })
  ipcMain.handle('zenitel:factory-reset', async () => { await _client(db.getConfig()).factoryReset('keep-ip') })

  ipcMain.handle('zenitel:set-mode', async (_, mode: string) => {
    const z = _client(db.getConfig())
    await z.setMode(mode as 'sip' | 'dip' | 'exc' | 'srv')
    await z.applyChanges()
  })

  ipcMain.handle('zenitel:wait-reboot', async () => {
    const online = await _client(db.getConfig()).waitForReboot(ZENITEL_REBOOT_TIMEOUT_MS, 3000)
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
  ipcMain.handle('zenitel:audio:set', async (_, settings: Record<string, unknown>) => { await _client(db.getConfig()).setAudioSettings(settings as Parameters<TcivClient['setAudioSettings']>[0]) })
}
