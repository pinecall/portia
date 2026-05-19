import { useState, useEffect, useCallback } from 'react'

interface DeviceStatus {
  online: boolean
  model?: string
  firmware?: string
  sipDomain?: string
  sipRegistered?: boolean
  webcallEnabled?: boolean
  uptime?: string
  hasCamera?: boolean
}

/** Polls the Zenitel device every 15s for health and status */
export function useZenitel() {
  const [status, setStatus] = useState<DeviceStatus>({ online: false })
  const [loading, setLoading] = useState(true)

  const check = useCallback(async () => {
    try {
      const info = await window.portia.invoke('zenitel:info')
      setStatus({
        online: true,
        model: info.model,
        firmware: info.firmware,
        sipDomain: info.sipDomain,
        sipRegistered: info.sipRegistered,
        webcallEnabled: info.webcallEnabled,
        uptime: info.uptime,
        hasCamera: info.hasCamera,
      })
    } catch {
      setStatus(prev => ({ ...prev, online: false }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    check()
    const interval = setInterval(check, 15000)
    return () => clearInterval(interval)
  }, [check])

  const openDoor = useCallback(async (timer = 3) => {
    await window.portia.invoke('zenitel:relay', { relayId: 'relay1', timer })
  }, [])

  const refresh = check

  return { ...status, loading, openDoor, refresh }
}
