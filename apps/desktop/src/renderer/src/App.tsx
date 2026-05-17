import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Wifi, WifiOff, ChevronRight, ChevronLeft,
  Check, Loader2, Radio,
  LayoutDashboard, Users, Key, FileText, Camera, Settings,
  Shield, Clock, TrendingUp, DoorOpen, Activity,
  RefreshCw, CircleDot, Phone, User, Building2, UserCheck,
  Volume2, Mic, ToggleLeft, ToggleRight, Loader2 as Spinner
} from 'lucide-react'
import { useZenitel } from './hooks/useZenitel'
import { useAgent, useElapsed, STAGES } from './hooks/useAgent'
import TeamPage from './pages/TeamPage'
import CodesPage from './pages/CodesPage'
import VisitorsPage from './pages/VisitorsPage'
import EventsPage from './pages/EventsPage'

declare global {
  interface Window {
    portia: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
      on: (channel: string, cb: (...args: any[]) => void) => () => void
      platform: string
    }
  }
}

// ── Logo ──────────────────────────────────────────────────────────────────

function PortiaLogo({ size = 52 }: { size?: number }) {
  const s = size * 0.42
  return (
    <div className="boot-logo" style={{ width: size, height: size, borderRadius: size * 0.27 }}>
      <svg width={s} height={s} viewBox="0 0 24 28" fill="none">
        <path
          d="M4 26V2h9c1.8 0 3.3.4 4.5 1.2 1.2.8 2.1 1.8 2.7 3.1.6 1.3.9 2.7.9 4.2 0 1.5-.3 2.9-.9 4.2-.6 1.3-1.5 2.3-2.7 3.1-1.2.8-2.7 1.2-4.5 1.2H8.5"
          stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

// ── App Root ──────────────────────────────────────────────────────────────

export default function App() {
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.portia.invoke('config:get').then((cfg: any) => {
      setConfig(cfg)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="boot-screen">
        <PortiaLogo />
        <div className="boot-text">Portia</div>
      </div>
    )
  }

  if (!config?.wizardCompleted) {
    return <Wizard onComplete={() => window.location.reload()} />
  }

  return <Dashboard config={config} />
}

// ── Wizard ───────────────────────────────────────────────────────────────

function Wizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState<any[]>([])
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  const scan = async () => {
    setScanning(true)
    setDevices([])
    const result = await window.portia.invoke('zenitel:scan')
    setDevices(result)
    setScanning(false)
    if (result.length === 1) setHost(result[0].ip)
  }

  const testConnection = async () => {
    setTesting(true)
    await window.portia.invoke('config:set', {
      zenitelHost: host,
      zenitelUser: user || 'admin',
      zenitelPassword: pass || 'alphaadmin',
    })
    const result = await window.portia.invoke('zenitel:test')
    setTestResult(result)
    setTesting(false)
  }

  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const factoryReset = async () => {
    if (!confirm('Factory reset will erase all settings on the intercom. Continue?')) return
    setResetting(true)
    setResetDone(false)
    await window.portia.invoke('zenitel:factory-reset')
    setResetting(false)
    setResetDone(true)
    setTestResult(null)
  }

  const [provisioning, setProvisioning] = useState(false)
  const [provisionDone, setProvisionDone] = useState(false)
  const [provisionError, setProvisionError] = useState('')
  const [provisionStep, setProvisionStep] = useState('')

  const finish = async () => {
    setProvisioning(true)
    setProvisionError('')
    try {
      // 1. Detect public IP
      setProvisionStep('Detecting public IP...')
      const ipResult = await window.portia.invoke('sip:detect-ip') as any
      if (!ipResult?.ip) {
        throw new Error('Could not detect public IP. Check your internet connection.')
      }
      const publicIp = ipResult.ip

      // 2. Check if IP is already whitelisted
      setProvisionStep(`Checking IP ${publicIp}...`)
      const checkFirst = await window.portia.invoke('sip:check-ip', { ip: publicIp }) as any

      if (checkFirst?.whitelisted) {
        // Already good — skip whitelist
        setProvisionStep('IP already whitelisted ✓')
        await new Promise(r => setTimeout(r, 800))
      } else {
        // 3. Whitelist IP on Twilio SIP domain
        setProvisionStep(`Whitelisting IP ${publicIp}...`)
        const whitelistResult = await window.portia.invoke('sip:whitelist-ip', {
          ip: publicIp,
          name: `Portia-${publicIp}`,
        }) as any
        if (whitelistResult?.error && !whitelistResult?.success) {
          throw new Error(`IP whitelist failed: ${whitelistResult.error}`)
        }

        // 4. Verify it actually went through
        setProvisionStep('Verifying SIP whitelist...')
        const checkResult = await window.portia.invoke('sip:check-ip', { ip: publicIp }) as any
        if (!checkResult?.whitelisted) {
          throw new Error('SIP verification failed: IP was not whitelisted. Cannot configure intercom.')
        }
      }

      // 5. Provision intercom (DAK + SIP config) — only after whitelist is confirmed
      setProvisionStep('Configuring intercom...')
      await window.portia.invoke('zenitel:provision')

      setProvisionDone(true)
      setProvisionStep('')
      setTimeout(async () => {
        await window.portia.invoke('config:wizard-complete')
        onComplete()
      }, 2000)
    } catch (err: any) {
      setProvisionError(err.message || 'Provisioning failed')
      setProvisioning(false)
      setProvisionStep('')
    }
  }

  const skipProvision = async () => {
    await window.portia.invoke('config:wizard-complete')
    onComplete()
  }

  const steps = ['Detect', 'Connect', 'Ready']

  return (
    <div className="wizard">
      <div className="wizard-header">
        <PortiaLogo />
        <h1>Portia Setup</h1>
        <p className="wizard-sub">Connect your Zenitel intercom to the AI agent</p>
      </div>

      <div className="wizard-steps">
        {steps.map((s, i) => (
          <button
            key={i}
            className={`wizard-step ${step >= i ? 'active' : ''} ${step === i ? 'current' : ''}`}
            onClick={() => i < step && setStep(i)}
          >
            {step > i ? <Check size={14} /> : <span className="step-num">{i + 1}</span>}
            {s}
          </button>
        ))}
      </div>

      <div className="wizard-body">
        {step === 0 && (
          <div className="wizard-card">
            <h2>Find intercoms on the network</h2>
            <button className="btn-primary" onClick={scan} disabled={scanning}>
              {scanning ? <><Loader2 size={16} className="spin" /> Scanning...</> : <><Search size={16} /> Scan Network</>}
            </button>
            {devices.length > 0 && (
              <div className="device-list">
                {devices.map((d: any) => (
                  <div key={d.ip} className={`device-card ${host === d.ip ? 'selected' : ''}`} onClick={() => setHost(d.ip)}>
                    <Radio size={14} className="device-icon" />
                    <div className="device-info">
                      <span className="device-ip">{d.ip}</span>
                      <span className="device-meta">{d.model || 'Zenitel'} · {d.firmware || '—'} · {d.hasCamera ? 'Camera' : 'Audio only'}</span>
                    </div>
                    {host === d.ip && <Check size={14} className="device-check" />}
                  </div>
                ))}
              </div>
            )}
            <input type="text" className="input" placeholder="Or enter IP manually..." value={host} onChange={(e) => setHost(e.target.value)} />
            <button className="btn-primary" disabled={!host} onClick={() => setStep(1)}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-card">
            <h2>Connect to {host}</h2>
            <div className="wizard-credentials">
              <div className="wizard-field">
                <label className="info-label">Username</label>
                <input type="text" className="input" placeholder="admin" value={user} onChange={e => setUser(e.target.value)} />
              </div>
              <div className="wizard-field">
                <label className="info-label">Password</label>
                <input type="password" className="input" placeholder="alphaadmin" value={pass} onChange={e => setPass(e.target.value)} />
              </div>
            </div>
            <p className="settings-hint" style={{ marginBottom: 8 }}>Leave blank to use defaults (admin / alphaadmin)</p>
            <button className="btn-primary" onClick={testConnection} disabled={testing}>
              {testing ? <><Loader2 size={16} className="spin" /> Testing...</> : <><Wifi size={16} /> Test Connection</>}
            </button>
            {testResult && (
              <div className={`test-result ${testResult.reachable ? 'ok' : 'fail'}`}>
                {testResult.reachable ? (
                  <><Check size={16} /><div><div>Connected — {testResult.model}</div><div className="test-detail">Webcall: {testResult.webcallEnabled ? 'Enabled' : 'Disabled'}</div></div></>
                ) : (
                  <><WifiOff size={16} /><div>Connection failed — check credentials</div></>
                )}
              </div>
            )}
            {testResult?.reachable && (
              <div style={{ marginTop: 8 }}>
                {resetDone ? (
                  <div className="test-result ok"><Check size={16} /><div>Factory reset complete — device is rebooting (~30s). Re-test when ready.</div></div>
                ) : (
                  <button className="btn-ghost" onClick={factoryReset} disabled={resetting} style={{ fontSize: 12, opacity: 0.7 }}>
                    {resetting ? <><Loader2 size={14} className="spin" /> Resetting...</> : '⚠️ Factory Reset (optional)'}
                  </button>
                )}
              </div>
            )}
            <div className="wizard-actions">
              <button className="btn-ghost" onClick={() => setStep(0)}><ChevronLeft size={16} /> Back</button>
              <button className="btn-primary" disabled={!testResult?.reachable} onClick={() => setStep(2)}>Continue <ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-card">
            <h2>{provisioning ? (provisionStep || 'Configuring...') : provisionDone ? 'Setup complete' : 'Configure intercom'}</h2>
            {!provisioning && !provisionDone && (
              <>
                <p className="wizard-sub" style={{ textAlign: 'left' }}>This will reconfigure your Zenitel to call Portia. The device reboots after (~30s).</p>
                <div className="checklist">
                  <div className="check-item"><Check size={14} /> Zenitel at {host}</div>
                  <div className="check-item"><Check size={14} /> Connection verified</div>
                  <div className="check-item"><CircleDot size={14} /> SIP registration pending</div>
                </div>
                {provisionError && <div className="test-result fail"><WifiOff size={16} /><div>{provisionError}</div></div>}
                <div className="wizard-actions">
                  <button className="btn-ghost" onClick={skipProvision}>Skip</button>
                  <button className="btn-primary" onClick={finish}>Provision & Launch</button>
                </div>
              </>
            )}
            {provisioning && !provisionDone && (
              <div className="checklist">
                <div className="check-item"><Loader2 size={14} className="spin" /> {provisionStep || 'Starting...'}</div>
              </div>
            )}
            {provisionDone && (
              <div className="checklist">
                <div className="check-item"><Check size={14} /> SIP configured</div>
                <div className="check-item"><Check size={14} /> Call button → Portia agent</div>
                <div className="check-item"><Check size={14} /> Webcall enabled</div>
                <div className="check-item"><Loader2 size={14} className="spin" /> Launching...</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'visitors', label: 'Visitors', icon: UserCheck },
  { id: 'codes', label: 'Access Codes', icon: Key },
  { id: 'events', label: 'Events', icon: FileText },
  { id: 'camera', label: 'Camera', icon: Camera },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function Dashboard({ config }: { config: any }) {
  const [page, setPage] = useState('dashboard')
  const zenitel = useZenitel()
  const { liveCall } = useAgent()

  // Auto-switch to dashboard when call starts
  useEffect(() => {
    if (liveCall?.status === 'active' && page !== 'dashboard') setPage('dashboard')
  }, [liveCall?.id])

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <PortiaLogo size={28} />
          <span>Portia</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className={`status-indicator ${zenitel.online ? 'online' : 'offline'}`} />
          <div className="sidebar-device">
            <span className="device-host">{config.zenitelHost || '—'}</span>
            <span className="device-model">{zenitel.model || (zenitel.loading ? 'Connecting...' : 'Offline')}</span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        {page === 'dashboard' && (liveCall ? <LiveCallView call={liveCall} config={config} /> : <DashboardPage zenitel={zenitel} config={config} />)}
        {page === 'camera' && <CameraPage config={config} />}
        {page === 'team' && <TeamPage />}
        {page === 'visitors' && <VisitorsPage />}
        {page === 'codes' && <CodesPage />}
        {page === 'events' && <EventsPage />}
        {page === 'settings' && <SettingsPage config={config} zenitel={zenitel} />}
      </main>
    </div>
  )
}

// ── Dashboard Page ───────────────────────────────────────────────────────

function DashboardPage({ zenitel, config }: any) {
  const [stats, setStats] = useState({
    visitsToday: 0, granted: 0, denied: 0, avgDuration: 0, resolution: 100,
  })

  useEffect(() => {
    window.portia.invoke('db:stats').then(setStats).catch(() => {})
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="page-header-right">
          <span className={`agent-status ${zenitel.online ? 'online' : ''}`}>
            <CircleDot size={14} />
            {zenitel.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Visits Today" value={stats.visitsToday} icon={Users} />
        <StatCard label="Access Granted" value={stats.granted} icon={Shield} />
        <StatCard label="Avg Duration" value={`${stats.avgDuration}s`} icon={Clock} />
        <StatCard label="Resolution" value={`${stats.resolution}%`} icon={TrendingUp} />
      </div>

      <div className="two-col">
        <div className="info-section">
          <h2>Device</h2>
          <div className="info-grid">
            <InfoRow label="Status" value={zenitel.online ? 'Online' : 'Offline'} status={zenitel.online ? 'ok' : 'warn'} />
            <InfoRow label="Model" value={zenitel.model} />
            <InfoRow label="Firmware" value={zenitel.firmware} />
            <InfoRow label="SIP" value={zenitel.sipRegistered ? 'Registered' : 'Not registered'} status={zenitel.sipRegistered ? 'ok' : 'warn'} />
            <InfoRow label="Webcall" value={zenitel.webcallEnabled ? 'Enabled' : 'Disabled'} status={zenitel.webcallEnabled ? 'ok' : 'warn'} />
            <InfoRow label="Uptime" value={zenitel.uptime} />
          </div>
        </div>

        <div className="info-section">
          <h2>Camera</h2>
          <div className="camera-feed">
            <img
              src={`portia-cam:///?ip=${config.zenitelHost}&user=${config.zenitelUser || 'admin'}&pass=${config.zenitelPassword || 'alphaadmin'}`}
              alt="Lobby"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Settings Page ────────────────────────────────────────────────────────

function SettingsPage({ config, zenitel }: any) {
  const [apiKey, setApiKey] = useState(config.pinecallApiKey || '')
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<'general' | 'intercom'>('general')

  const resetWizard = async () => {
    await window.portia.invoke('config:reset-wizard')
    window.location.reload()
  }

  const saveApiKey = async () => {
    await window.portia.invoke('config:set', { pinecallApiKey: apiKey })
    setEditing(false)
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      <div className="settings-tabs">
        <button className={`settings-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>
          <Settings size={14} /> General
        </button>
        <button className={`settings-tab ${tab === 'intercom' ? 'active' : ''}`} onClick={() => setTab('intercom')}>
          <Volume2 size={14} /> Intercom
        </button>
      </div>

      {tab === 'general' && (
        <>
          <div className="info-section">
            <h2>Connection</h2>
            <div className="info-grid">
              <InfoRow label="Zenitel IP" value={config.zenitelHost} />
              <InfoRow label="Username" value={config.zenitelUser || 'admin'} />
              <InfoRow label="SIP ID" value={config.sipId} />
              <InfoRow label="Status" value={zenitel.online ? 'Connected' : 'Disconnected'} status={zenitel.online ? 'ok' : 'warn'} />
            </div>
          </div>
          <div className="info-section">
            <h2>Agent</h2>
            <div className="settings-field">
              <label className="info-label">API Key</label>
              {editing ? (
                <div className="settings-input-row">
                  <input
                    className="input"
                    type="text"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveApiKey()}
                    placeholder="pk_..."
                    autoFocus
                  />
                  <button className="btn-primary" onClick={saveApiKey}>Save</button>
                  <button className="btn-ghost" onClick={() => { setApiKey(config.pinecallApiKey || ''); setEditing(false) }}>Cancel</button>
                </div>
              ) : (
                <div className="settings-input-row">
                  <span className="info-value">{config.pinecallApiKey ? '••••' + config.pinecallApiKey.slice(-6) : 'Not set'}</span>
                  <button className="btn-ghost" onClick={() => setEditing(true)}>Edit</button>
                </div>
              )}
            </div>
            <div className="info-grid" style={{ marginTop: 8 }}>
              <InfoRow label="Phone Channel" value={config.agentPhone || config.sipId} />
              <InfoRow label="Building" value={config.buildingName || 'Not set'} />
            </div>
          </div>
          <div className="info-section">
            <h2>Device</h2>
            <button className="btn-danger" onClick={resetWizard}>
              Reset Setup
            </button>
            <p className="settings-hint">Re-run the setup wizard to connect a different intercom.</p>
          </div>
        </>
      )}

      {tab === 'intercom' && <IntercomSettings online={zenitel.online} />}
    </div>
  )
}

// ── Intercom Audio Settings ──────────────────────────────────────────────

function IntercomSettings({ online }: { online: boolean }) {
  const [audio, setAudio] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const saveTimer = useRef<any>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const settings = await window.portia.invoke('zenitel:audio:get')
      setAudio(settings)
    } catch (err: any) {
      setError(err.message || 'Failed to load audio settings')
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (online) loadSettings() }, [online, loadSettings])

  const save = useCallback(async (partial: any) => {
    setSaving(true)
    try {
      await window.portia.invoke('zenitel:audio:set', partial)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    }
    setSaving(false)
  }, [])

  const debouncedSave = useCallback((partial: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(partial), 600)
  }, [save])

  const updateSpeaker = (gain: number) => {
    setAudio((a: any) => ({ ...a, speaker: { ...a.speaker, gain } }))
    debouncedSave({ speaker: { gain } })
  }

  const updateMic = (gain: number) => {
    setAudio((a: any) => ({ ...a, mic: { ...a.mic, gain } }))
    debouncedSave({ mic: { gain } })
  }

  const toggleDsp = (key: 'aec' | 'anc' | 'drc', enabled: boolean) => {
    setAudio((a: any) => ({ ...a, [key]: { ...a[key], enabled } }))
    save({ [key]: { enabled } })
  }

  const toggleAvc = (enabled: boolean) => {
    setAudio((a: any) => ({ ...a, avc: { ...a.avc, enabled } }))
    save({ avc: { enabled } })
  }

  if (!online) return <div className="info-section"><p className="settings-hint">Intercom is offline. Connect to configure audio.</p></div>
  if (loading) return <div className="info-section"><Loader2 size={20} className="spin" /> Loading audio settings...</div>
  if (error) return <div className="info-section"><p className="settings-hint" style={{ color: 'var(--red)' }}>{error}</p><button className="btn-ghost" onClick={loadSettings}><RefreshCw size={14} /> Retry</button></div>
  if (!audio) return null

  return (
    <>
      <div className="ic-grid">
        <div className="ic-card">
          <div className="ic-card-header">
            <Volume2 size={18} className="ic-icon ic-icon-speaker" />
            <div>
              <h3 className="ic-card-title">Speaker Output</h3>
              <p className="ic-card-desc">Agent voice playback volume</p>
            </div>
          </div>
          <div className="ic-gain">
            <span className="ic-gain-value">{audio.speaker.gain > 0 ? '+' : ''}{audio.speaker.gain}</span>
            <span className="ic-gain-unit">dB</span>
          </div>
          <div className="slider-row">
            <span className="slider-min">-10</span>
            <input type="range" min={-10} max={13} value={audio.speaker.gain} onChange={e => updateSpeaker(Number(e.target.value))} />
            <span className="slider-max">+13</span>
          </div>
          <p className="ic-hint">0 to +3 dB recommended</p>
        </div>

        <div className="ic-card">
          <div className="ic-card-header">
            <Mic size={18} className="ic-icon ic-icon-mic" />
            <div>
              <h3 className="ic-card-title">Microphone Input</h3>
              <p className="ic-card-desc">Visitor speech sensitivity</p>
            </div>
          </div>
          <div className="ic-gain">
            <span className="ic-gain-value">{audio.mic.gain > 0 ? '+' : ''}{audio.mic.gain}</span>
            <span className="ic-gain-unit">dB</span>
          </div>
          <div className="slider-row">
            <span className="slider-min">-10</span>
            <input type="range" min={-10} max={10} value={audio.mic.gain} onChange={e => updateMic(Number(e.target.value))} />
            <span className="slider-max">+10</span>
          </div>
          <p className="ic-hint">+3 dB if visitors repeat often</p>
        </div>
      </div>

      <div className="ic-dsp">
        <h3 className="ic-section-title">Signal Processing</h3>
        <div className="ic-toggles">
          <AudioToggle label="Echo Cancellation" desc="Prevents feedback loops" enabled={audio.aec.enabled} onChange={v => toggleDsp('aec', v)} />
          <AudioToggle label="Noise Suppression" desc="Filters ambient noise" enabled={audio.anc.enabled} onChange={v => toggleDsp('anc', v)} />
          <AudioToggle label="Dynamic Compression" desc="Normalizes volume levels" enabled={audio.drc.enabled} onChange={v => toggleDsp('drc', v)} />
          <AudioToggle label="Auto Volume" desc="Adapts to ambient noise" enabled={audio.avc.enabled} onChange={v => toggleAvc(v)} />
        </div>
      </div>
      {saving && <div className="audio-saving"><Spinner size={12} className="spin" /> Applying...</div>}
    </>
  )
}

function AudioToggle({ label, desc, enabled, onChange }: { label: string; desc: string; enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`ic-toggle ${enabled ? 'ic-toggle-on' : ''}`} onClick={() => onChange(!enabled)}>
      <div className="ic-toggle-info">
        <span className="ic-toggle-label">{label}</span>
        <span className="ic-toggle-desc">{desc}</span>
      </div>
      {enabled ? <ToggleRight size={26} className="toggle-on" /> : <ToggleLeft size={26} className="toggle-off" />}
    </div>
  )
}

// ── Camera Page ──────────────────────────────────────────────────────────

function CameraPage({ config }: any) {
  return (
    <div className="page">
      <h1>Camera</h1>
      <div className="camera-feed fullscreen">
        <img
          src={`portia-cam:///?ip=${config.zenitelHost}&user=${config.zenitelUser || 'admin'}&pass=${config.zenitelPassword || 'alphaadmin'}`}
          alt="Lobby"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
    </div>
  )
}
// ── Live Call View ───────────────────────────────────────────────────────

function LiveCallView({ call, config }: { call: any; config: any }) {
  const elapsed = useElapsed(call.startedAt)
  const chatRef = useRef<HTMLDivElement>(null)
  const { extracted, stage, doorOpen, messages } = call
  const isLive = call.status === 'active'

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages.length])

  return (
    <div className="page live-call">
      <div className="page-header">
        <h1>{isLive ? 'Live Call' : 'Call Ended'}</h1>
        <div className="page-header-right">
          <span className={`agent-status ${isLive ? 'live' : ''}`}>
            <Phone size={14} />
            {isLive ? elapsed : call.endReason || 'ended'}
          </span>
        </div>
      </div>

      {/* Stepper */}
      <div className="call-stepper">
        {STAGES.map((label, i) => (
          <div key={i} className={`call-step ${stage === i ? 'current' : ''} ${stage > i ? 'done' : ''}`}>
            <div className="call-step-dot">{stage > i ? <Check size={10} /> : <span>{i + 1}</span>}</div>
            <span className="call-step-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="two-col">
        {/* Camera + Visitor Badge */}
        <div className="call-left">
          {/* Live camera feed */}
          <div className="info-section">
            <h2>Camera</h2>
            <div className="camera-feed live">
              <img
                src={`portia-cam:///?ip=${config.zenitelHost}&user=${config.zenitelUser || 'admin'}&pass=${config.zenitelPassword || 'alphaadmin'}`}
                alt="Visitor"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              {isLive && <div className="camera-live-badge"><CircleDot size={10} /> LIVE</div>}
            </div>
          </div>

          {/* Visitor Badge */}
          <div className="info-section">
            <h2>Visitor</h2>
            <div className="visitor-badge">
              <BadgeField icon={User} label="Name" value={extracted.name} />
              <BadgeField icon={Building2} label="Company" value={extracted.company} />
              <BadgeField icon={UserCheck} label="Visiting" value={extracted.host} />
              <div className="badge-code">
                <span className="info-label">Access Code</span>
                <div className="code-digits">
                  {[0,1,2,3,4].map(i => {
                    const d = (extracted.code || '')[i]
                    return <div key={i} className={`code-digit ${d ? 'filled' : ''}`}>{d || ''}</div>
                  })}
                </div>
              </div>
              <div className={`badge-door ${doorOpen ? 'open' : ''}`}>
                <DoorOpen size={16} />
                <span>{doorOpen ? 'Door Open' : stage >= 5 ? 'Verifying...' : 'Door Locked'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div className="info-section">
          <h2>Transcript</h2>
          <div className="chat-feed" ref={chatRef}>
            {messages.filter((m: any) => m.role === 'user' || m.role === 'bot').map((m: any, i: number) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                <span className="chat-role">{m.role === 'user' ? 'Visitor' : 'Agent'}</span>
                <span className="chat-text">{m.text}</span>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="chat-empty">Waiting for conversation...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BadgeField({ icon: Icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <div className={`badge-field ${value ? 'filled' : ''}`}>
      <Icon size={14} className="badge-field-icon" />
      <div>
        <span className="info-label">{label}</span>
        <span className="badge-field-value">{value || <span className="badge-skeleton" />}</span>
      </div>
    </div>
  )
}

// ── Shared Components ────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon }: { label: string; value: any; icon: any }) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <Icon size={16} className="stat-icon" />
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

function InfoRow({ label, value, status }: { label: string; value?: string; status?: 'ok' | 'warn' }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className={`info-value ${status ? `status-${status}` : ''}`}>{value || '—'}</span>
    </div>
  )
}

function PlaceholderPage({ title, desc, icon: Icon }: { title: string; desc: string; icon: any }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <div className="placeholder-card">
        <Icon size={32} />
        <p>{desc}</p>
      </div>
    </div>
  )
}
