/**
 * Portia — Main Process Entry Point
 *
 * Boot sequence:
 * 1. Register custom protocol handler for MJPG video
 * 2. Initialize SQLite database
 * 3. Create BrowserWindow
 * 4. Register IPC handlers
 * 5. Auto-start agent (if configured)
 */

// Polyfill WebSocket for Node.js (SDK needs it)
import { WebSocket } from 'ws'
;(globalThis as any).WebSocket = WebSocket

import { app, BrowserWindow, shell, protocol } from 'electron'
import { seedDemoData } from '@main/db/seed'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PortiaDB } from '@main/db'
import { registerIpcHandlers } from '@main/ipc'

let mainWindow: BrowserWindow | null = null
let db: PortiaDB

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 16 } } : {}),
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Dev: HMR URL, Prod: static file
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// ── Video protocol handler ──────────────────────────────────────────────

function registerVideoProtocol() {
  protocol.handle('portia-cam', async (request) => {
    const url = new URL(request.url)
    const ip = url.searchParams.get('ip')
    const user = url.searchParams.get('user') ?? 'admin'
    const pass = url.searchParams.get('pass') ?? 'alphaadmin'

    if (!ip) return new Response('Missing ip param', { status: 400 })

    const target = `http://${ip}/mjpg/video.mjpg`
    return fetch(target, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
      },
    })
  })
}

// ── App lifecycle ───────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Set app ID for notifications on Windows
  electronApp.setAppUserModelId('io.pinecall.portia')

  // Optimize child windows
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 1. Video protocol
  registerVideoProtocol()

  // 2. SQLite (async — sql.js WASM init)
  const dbPath = join(app.getPath('userData'), 'portia.db')
  db = await PortiaDB.create(dbPath)
  console.log(`[Portia] Database: ${dbPath}`)

  // Seed defaults on first launch
  const config = db.getConfig()
  const updates: Record<string, any> = {}
  if (!config.agentPhone) updates.agentPhone = PortiaDB.generateSipId()
  if (Object.keys(updates).length) {
    db.updateConfig(updates)
    if (updates.agentPhone) console.log(`[Portia] Generated SIP ID: ${updates.agentPhone}`)
    Object.assign(config, updates)
  }

  // Auto-seed demo data on first launch (no building name = fresh install)
  if (!config.buildingName) {
    seedDemoData(db)
    console.log('[Portia] First launch — seeded Cointel demo data')
  }

  // 3. Window
  const window = createWindow()

  // 4. IPC
  registerIpcHandlers(window, db)

  // 5. Auto-start agent if wizard is done
  if (config.wizardCompleted) {
    import('./agent/bootstrap').then(({ startAgent }) => {
      startAgent({ db, window }).then(ok => {
        console.log(`[Portia] Agent auto-start: ${ok ? 'connected' : 'skipped'}`)
      })
    }).catch(err => {
      console.log(`[Portia] Agent not available: ${err.message}`)
    })
  }

  console.log(`[Portia] Ready. Wizard completed: ${config.wizardCompleted}`)
})

// Ensure agent disconnects before quit (Cmd+Q, dock quit, etc.)
app.on('before-quit', async (e) => {
  e.preventDefault()
  try {
    const { stopAgent } = await import('./agent/bootstrap')
    await stopAgent()
  } catch {}
  db?.close()
  app.exit(0)
})

app.on('window-all-closed', () => {
  // before-quit handles cleanup
  app.quit()
})
