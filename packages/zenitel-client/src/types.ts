/**
 * @pinecall/zenitel-client — Type definitions
 *
 * All interfaces for the Zenitel HTTP scraper, scanner, and CLI.
 */

// ── Client Options ──────────────────────────────────────────────────────────

export interface ZenitelClientOptions {
  /** IP or hostname of the Zenitel intercom (e.g. "192.168.1.143") */
  host: string;
  /** Web UI username. Default: "admin" */
  user?: string;
  /** Web UI password. Default: "alphaadmin" */
  password?: string;
  /** Protocol. Default: "http" */
  protocol?: 'http' | 'https';
  /** HTTP request timeout in ms. Default: 5000 */
  timeout?: number;
}

// ── Device Discovery ────────────────────────────────────────────────────────

export interface ZenitelDevice {
  ip: string;
  mac: string;              // "00:13:cb:28:35:ca"
  model?: string;           // "TCIV-2+"
  firmware?: string;        // "9.2.3.0"
  hasCamera: boolean;
  hostname?: string;        // "zenitel01"
  mode?: 'sip' | 'edge' | 'pulse';
  serialNumber?: string;
  hardwareType?: string;    // "8801"
}

export interface ScanOptions {
  /** Scan timeout in ms. Default: 5000 */
  timeout?: number;
  /** Subnet CIDR (e.g. "192.168.1.0/24"). Auto-detected if omitted. */
  subnet?: string;
  /** Which strategies to run. Default: all three. */
  strategies?: ('arp-oui' | 'http-probe')[];
}

// ── Device Info ─────────────────────────────────────────────────────────────

export interface DeviceInfo {
  model: string;            // "TCIV-2+"
  firmware: string;         // "9.2.3.0"
  mac: string;              // "00:13:cb:28:35:ca"
  ip: string;
  hostname: string;         // "zenitel01"
  serialNumber: string;     // "22040000"
  hardwareType: string;     // "8801"
  mode: 'sip' | 'edge' | 'pulse';
  hasCamera: boolean;
  sipDomain?: string;       // "testing-mo16m3gw.sip.twilio.com"
  sipRegistered?: boolean;
  sipNumber?: string;       // "zenitel01"
  outboundProxy?: string;
  uptime?: string;
  webcallEnabled: boolean;
  platform: string;         // "turbine"
  systemModelName?: string; // "Turbine Compact - Video Plus"
}

// ── Relay / Door ────────────────────────────────────────────────────────────

export interface RelayOptions {
  /** Relay ID. Default: "relay1". Options: relay1, gpio1-gpio6 */
  relayId?: string;
  /** Timer in seconds. 0 = toggle (stays active until deactivated). Default: 3 */
  timer?: number;
}

export interface RelayStatus {
  relay1: 'Activated' | 'Deactivated';
  gpio1: 'Activated' | 'Deactivated';
  gpio2: 'Activated' | 'Deactivated';
  gpio3: 'Activated' | 'Deactivated';
  gpio4: 'Activated' | 'Deactivated';
  gpio5: 'Activated' | 'Deactivated';
  gpio6: 'Activated' | 'Deactivated';
}

// ── SIP Config ──────────────────────────────────────────────────────────────

export interface SIPConfig {
  domain?: string;
  outboundProxy?: string;
  transport?: 'udp' | 'tcp' | 'tls';
  displayName?: string;
  directoryNumber?: string;
  authUsername?: string;
  authPassword?: string;
}

// ── Call Status ─────────────────────────────────────────────────────────────

export type CallStatus = 'Idle' | 'Calling' | 'Connected' | 'Ringing';

// ── Provisioning ────────────────────────────────────────────────────────────

/** Full provisioning config for a factory-reset Zenitel */
export interface ProvisionConfig {
  /** SIP registration domain (e.g. "testing-mo16m3gw.sip.twilio.com") */
  sipDomain: string;
  /** SIP auth username (e.g. "zenitel01") */
  sipAuthUser: string;
  /** SIP auth password */
  sipAuthPassword: string;
  /** Outbound proxy address. Defaults to sipDomain if omitted. */
  sipProxy?: string;
  /** SIP transport. Default: "UDP" */
  sipTransport?: 'UDP' | 'TCP' | 'TLS';
  /** Station display name (e.g. "Lobby Intercom"). Defaults to agentNumber. */
  stationName?: string;
  /** The SIP number the call button will dial (e.g. "portia-ae3c") */
  agentNumber: string;
  /** Enable webcall + relay HTTP API. Default: true */
  enableWebcall?: boolean;
  /** Enable auto-answer mode (for AI agent). Default: true */
  autoAnswer?: boolean;
}
