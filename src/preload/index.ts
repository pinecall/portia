/**
 * Portia — Preload Script (contextBridge)
 *
 * Exposes a safe IPC API to the renderer via window.portia
 */

import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // ── Invoke (renderer → main) ──────────────────────────────────────────
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

  // ── Events (main → renderer) ──────────────────────────────────────────
  on: (channel: string, cb: (...args: any[]) => void) => {
    const handler = (_event: any, ...args: any[]) => cb(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // ── Platform ──────────────────────────────────────────────────────────
  platform: process.platform,
}

contextBridge.exposeInMainWorld('portia', api)

// Type declaration for renderer
export type PortiaAPI = typeof api
