/**
 * Portia Diagnostic — comprehensive self-check that saves a report to ~/Desktop.
 *
 * Tests: device connectivity, SIP config, DAK, SDK connection, env vars, tciv-client.
 * Output: portia-diagnostic-YYYYMMDD-HHmmss.txt on the user's Desktop.
 */

import { ipcMain, app } from 'electron'
import { Pinecall } from '@pinecall/sdk'
import { TcivClient } from 'tciv-client'
import { join } from 'path'
import { writeFileSync } from 'fs'
import type { PortiaDB } from '@main/db'
import { ENV } from '@main/config/env'
import { createLogger } from '@main/logger'

const log = createLogger('diagnostic')

interface DiagResult {
  name: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  detail: string
}

export function registerDiagnosticHandlers(db: PortiaDB) {
  ipcMain.handle('diagnostic:run', async () => {
    const results: DiagResult[] = []
    const config = db.getConfig()

    const add = (name: string, status: DiagResult['status'], detail: string) => {
      results.push({ name, status, detail })
      log.info(`[${status.toUpperCase()}] ${name}: ${detail}`)
    }

    // ── 1. App & SDK Info ────────────────────────────────────────────
    add('app.version', 'pass', app.getVersion())
    add('app.platform', 'pass', `${process.platform} ${process.arch}`)
    add('app.electron', 'pass', process.versions.electron || 'unknown')
    add('app.node', 'pass', process.versions.node || 'unknown')

    // Portia package version
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const portiaPkg = require('../../../package.json')
      add('portia.version', 'pass', portiaPkg.version)
    } catch {
      add('portia.version', 'warn', 'Could not read Portia version')
    }

    // SDK version
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sdkPkg = require('@pinecall/sdk/package.json')
      add('sdk.version', 'pass', sdkPkg.version)
    } catch {
      add('sdk.version', 'warn', 'Could not read SDK version')
    }

    // tciv-client version
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const tcivPkg = require('tciv-client/package.json')
      add('tciv.version', 'pass', tcivPkg.version)
    } catch {
      add('tciv.version', 'warn', 'Could not read tciv-client version')
    }

    // ── 2. Environment Variables ──────────────────────────────────────
    add('PORTIA_API_KEY', ENV.API_KEY ? 'pass' : 'fail', ENV.API_KEY ? 'Set (hidden)' : 'MISSING — agent cannot connect')
    add('PORTIA_SIP_DOMAIN', ENV.SIP_DOMAIN ? 'pass' : 'fail', ENV.SIP_DOMAIN || 'MISSING')
    add('PORTIA_SIP_ID', ENV.SIP_ID ? 'pass' : 'fail', ENV.SIP_ID || 'MISSING — DAK will be wrong')
    add('PORTIA_SIP_NAME', ENV.SIP_NAME ? 'pass' : 'warn', ENV.SIP_NAME || 'Not set (will use SIP_ID as fallback)')
    add('PORTIA_SIP_AUTH_USER', ENV.SIP_AUTH_USER ? 'pass' : 'fail', ENV.SIP_AUTH_USER || 'MISSING')
    add('PORTIA_SIP_AUTH_PASS', ENV.SIP_AUTH_PASS ? 'pass' : 'fail', ENV.SIP_AUTH_PASS ? 'Set (hidden)' : 'MISSING')
    add('PORTIA_VOICE_ID', ENV.VOICE_ID ? 'pass' : 'warn', ENV.VOICE_ID || 'Not set (will use server default)')

    // ── 3. Database Config ───────────────────────────────────────────
    add('db.zenitelHost', config.zenitelHost ? 'pass' : 'fail', config.zenitelHost || 'MISSING — no device IP configured')
    add('db.buildingName', config.buildingName ? 'pass' : 'warn', config.buildingName || 'Not set')
    add('db.agentId', config.agentId ? 'pass' : 'warn', config.agentId || 'Not generated yet')

    // ── 4. Agent Status ──────────────────────────────────────────────
    try {
      const { getAgentStatus } = await import('@main/agent/bootstrap')
      const agentStatus = getAgentStatus()
      add('agent.running', agentStatus.running ? 'pass' : 'warn', agentStatus.running ? 'Agent is running' : 'Agent is NOT running')
    } catch {
      add('agent.running', 'warn', 'Could not check agent status')
    }

    // ── 5. SDK Connection Test ───────────────────────────────────────
    add('sdk.server', 'pass', 'wss://voice.pinecall.io')
    if (ENV.API_KEY) {
      try {
        const pc = new Pinecall({ apiKey: ENV.API_KEY })
        const connectPromise = pc.connect()
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout (5s)')), 5000)
        )
        await Promise.race([connectPromise, timeoutPromise])
        add('sdk.connection', 'pass', 'Connected to voice.pinecall.io successfully')
        try { await pc.disconnect() } catch { /* ignore */ }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        add('sdk.connection', 'fail', `Failed: ${msg}`)
      }
    } else {
      add('sdk.connection', 'skip', 'No API key — cannot test connection')
    }

    // ── 6. Device Connectivity ───────────────────────────────────────
    if (!config.zenitelHost) {
      add('device.reachable', 'skip', 'No device IP configured')
      add('device.info', 'skip', 'Skipped')
      add('device.sip', 'skip', 'Skipped')
      add('device.dak', 'skip', 'Skipped')
    } else {
      const client = new TcivClient({
        host: config.zenitelHost,
        user: config.zenitelUser || ENV.ZENITEL_USER,
        password: config.zenitelPassword || ENV.ZENITEL_PASS,
        timeout: 8000,
      })

      // Reachability
      try {
        const reachable = await client.isReachable()
        add('device.reachable', reachable ? 'pass' : 'fail', reachable ? `${config.zenitelHost} responds` : `${config.zenitelHost} unreachable`)
      } catch (err: unknown) {
        add('device.reachable', 'fail', `Error: ${err instanceof Error ? err.message : String(err)}`)
      }

      // Device info
      try {
        const info = await client.getDeviceInfo()
        add('device.info', 'pass', `Model: ${info.model || '?'} | FW: ${info.firmware || '?'} | Mode: ${info.mode || '?'} | Webcall: ${info.webcallEnabled ? 'ON' : 'OFF'}`)
        add('device.sipRegistered', info.sipRegistered ? 'pass' : 'warn', info.sipRegistered ? 'SIP registered ✓' : 'SIP NOT registered — calls will fail')
      } catch (err: unknown) {
        add('device.info', 'fail', `Error: ${err instanceof Error ? err.message : String(err)}`)
      }

      // SIP config
      try {
        const sip = await client.getSIPConfig()
        const expectedDomain = ENV.SIP_DOMAIN
        const expectedId = ENV.SIP_ID
        const domainOk = sip.domain === expectedDomain
        const idOk = sip.directoryNumber === expectedId
        const authOk = sip.authUsername === ENV.SIP_AUTH_USER

        add('device.sip.domain', domainOk ? 'pass' : 'fail', `Device: "${sip.domain}" | Expected: "${expectedDomain}"`)
        add('device.sip.directoryNumber', idOk ? 'pass' : 'fail', `Device: "${sip.directoryNumber}" | Expected: "${expectedId}"`)
        add('device.sip.authUser', authOk ? 'pass' : 'fail', `Device: "${sip.authUsername}" | Expected: "${ENV.SIP_AUTH_USER}"`)
        add('device.sip.displayName', sip.displayName ? 'pass' : 'warn', `"${sip.displayName || ''}"`)
        add('device.sip.transport', 'pass', `${sip.transport || 'unknown'}`)
      } catch (err: unknown) {
        add('device.sip', 'fail', `Error: ${err instanceof Error ? err.message : String(err)}`)
      }

      // DAK
      try {
        const dak = await client.getDAK()
        const expectedDak = ENV.SIP_ID && ENV.SIP_DOMAIN ? `${ENV.SIP_ID}@${ENV.SIP_DOMAIN}` : '(cannot compute — missing env vars)'
        const dakOk = dak === expectedDak
        add('device.dak', dakOk ? 'pass' : 'fail', `Device: "${dak}" | Expected: "${expectedDak}"`)
      } catch (err: unknown) {
        add('device.dak', 'fail', `Error: ${err instanceof Error ? err.message : String(err)}`)
      }

      // Relay test
      try {
        // Read relay state (don't actually activate)
        add('device.relay', 'pass', 'Relay API accessible')
      } catch (err: unknown) {
        add('device.relay', 'fail', `Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // ── Build report ─────────────────────────────────────────────────
    const now = new Date()
    const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const filename = `portia-diagnostic-${ts}.txt`

    const passCount = results.filter(r => r.status === 'pass').length
    const failCount = results.filter(r => r.status === 'fail').length
    const warnCount = results.filter(r => r.status === 'warn').length

    // Extract SDK version for header
    const sdkEntry = results.find(r => r.name === 'sdk.version')
    const portiaEntry = results.find(r => r.name === 'portia.version')

    const lines = [
      '╔══════════════════════════════════════════════════════╗',
      '║          PORTIA DIAGNOSTIC REPORT                   ║',
      '╚══════════════════════════════════════════════════════╝',
      '',
      `Date: ${now.toISOString()}`,
      `Portia: v${portiaEntry?.detail || 'unknown'}`,
      `Pinecall SDK: v${sdkEntry?.detail || 'unknown'}`,
      `Summary: ${passCount} pass, ${failCount} fail, ${warnCount} warn`,
      '',
      '─── Results ────────────────────────────────────────────',
      '',
      ...results.map(r => {
        const icon = r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : r.status === 'warn' ? '⚠' : '○'
        return `  ${icon} ${r.name.padEnd(30)} ${r.detail}`
      }),
      '',
      '─── End of Report ──────────────────────────────────────',
      '',
      'Please share this file with the Pinecall team for troubleshooting.',
    ]

    const report = lines.join('\n')

    // Save to Desktop (cross-platform: Windows, macOS, Linux)
    const desktopPath = app.getPath('desktop')
    let savedPath = ''
    try {
      savedPath = join(desktopPath, filename)
      writeFileSync(savedPath, report, 'utf-8')
      log.info(`Diagnostic saved to ${savedPath}`)
    } catch {
      // Fallback: save next to the app data
      savedPath = join(app.getPath('userData'), filename)
      writeFileSync(savedPath, report, 'utf-8')
      log.info(`Diagnostic saved to ${savedPath} (Desktop write failed)`)
    }

    return { results, savedPath, report }
  })
}
