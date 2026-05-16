# @pinecall/zenitel-client

> TypeScript client for Zenitel intercom systems — HTTP scraper, network scanner, and CLI.

Zero runtime dependencies. Uses native `fetch` (Node 22+).

Tested and validated against a real **TCIV-2+** (Turbine Compact - Video Plus), firmware **9.2.3.0**.

## Install

```bash
npm install @pinecall/zenitel-client
```

---

## CLI

The `zenitel` CLI is included for hardware testing and debugging.

```bash
npx zenitel <command> [options]
```

### Device Discovery

```bash
# Auto-scan network via ARP table (OUI 00:13:CB = Zenitel) + HTTP fingerprinting
zenitel scan

# 🔍 Scanning network for Zenitel devices...
#
#   🟢 192.168.1.143
#      MAC: 00:13:cb:28:35:ca
#      Model: TCIV-2+
#      Firmware: 9.2.3.0
#      Hostname: zenitel01
#      Mode: sip
#      Camera: Yes
#
# Found 1 device(s).
```

### Device Information

```bash
zenitel info -h 192.168.1.143

# 📋 Getting device info from 192.168.1.143...
#
#   Model:          TCIV-2+
#   System:         Turbine Compact - Video Plus
#   Firmware:       9.2.3.0
#   MAC:            00:13:cb:28:35:ca
#   Serial:         22040000
#   Hostname:       zenitel01
#   Mode:           sip
#   Camera:         Yes
#   Platform:       turbine
#   HW Type:        8801
#   Uptime:         up 2 days, 20 hours, 3 minutes
#   Webcall:        Enabled
#   SIP Domain:     testing-mo16m3gw.sip.twilio.com
#   SIP Registered: Yes
#   SIP Number:     zenitel01
#   Outbound Proxy: testing-mo16m3gw.sip.twilio.com
```

### Call Status & Relays

```bash
# Full status (call + all relays)
zenitel status -h 192.168.1.143

# Activate relay 1 for 3 seconds (opens door)
zenitel relay -h 192.168.1.143

# Activate GPIO output 2 for 5 seconds
zenitel relay -h 192.168.1.143 --id gpio2 --timer 5

# Deactivate relay
zenitel relay -h 192.168.1.143 --off

# Place a SIP call
zenitel call 122 -h 192.168.1.143

# Stop current call
zenitel stop -h 192.168.1.143
```

### SIP Configuration

```bash
# Read current SIP config
zenitel sip get -h 192.168.1.143

# 📡 SIP config from 192.168.1.143:
#   Name:         zenitel01
#   Number:       zenitel01
#   Domain:       testing-mo16m3gw.sip.twilio.com
#   Auth User:    zenitel01
#   Auth Pass:    Beachway1!Sip
#   Proxy:        testing-mo16m3gw.sip.twilio.com
#   Transport:    UDP

# Write SIP config (requires reboot to take effect)
zenitel sip set -h 192.168.1.143 \
  --domain my-trunk.sip.twilio.com \
  --number station01 \
  --proxy my-trunk.sip.twilio.com \
  --transport udp
```

### Webcall API Management

```bash
# Check webcall status
zenitel webcall -h 192.168.1.143

# Enable webcall + relay HTTP API
zenitel webcall enable -h 192.168.1.143

# Disable webcall + relay HTTP API
zenitel webcall disable -h 192.168.1.143
```

### Config Backup & Restore

```bash
# Download full config as tar.gz
zenitel backup -h 192.168.1.143 -o my_backup.tar.gz

# Contents: ipst_config.xml, zapconfig.json, snmpd.conf, certs/, logos/

# Restore config from backup
zenitel restore my_backup.tar.gz -h 192.168.1.143
```

### Video

```bash
zenitel video -h 192.168.1.143

# 📷 Video URLs for 192.168.1.143:
#   MJPG:  http://192.168.1.143/mjpg/video.mjpg
#   RTSP:  rtsp://192.168.1.143:554/1/RTSP
```

### Call Button (DAK) Configuration

The DAK (Direct Access Key) controls what number the intercom dials when a visitor presses the call button. The value is stored inside `ipst_config.xml` in the device's config backup.

```bash
# Read current call button config
zenitel dak get -h 192.168.1.143

# 📞 Call button (DAK1) config from 192.168.1.143:
#   Dial Number:  222
#   SIP Domain:   testing-mo16m3gw.sip.twilio.com
#   Full URI:     222@testing-mo16m3gw.sip.twilio.com

# Set call button to dial a different number
# (downloads backup → modifies XML → re-uploads → reboots)
zenitel dak set --number portia-ae3c -h 192.168.1.143

# Set without auto-reboot
zenitel dak set --number portia-ae3c --no-reboot -h 192.168.1.143

# Set with explicit SIP domain
zenitel dak set --number portia-ae3c --domain my.sip.twilio.com -h 192.168.1.143
```

> **How it works:** The command downloads the device's full config backup (`ipst_config.tar.gz`), extracts `ipst_config.xml`, replaces the `<dak1><val>` field with the new SIP URI, re-packs the tar.gz (with correct checksums), uploads it, and reboots the device. Zero external dependencies — tar parsing is done in pure Node.js using `node:zlib`.

### Full Device Provisioning

Configures a **factory-reset** Zenitel in a single command. Sets SIP credentials, call button target, enables webcall + auto-answer, and reboots.

```bash
zenitel provision -h 192.168.1.143 \
  --domain testing-mo16m3gw.sip.twilio.com \
  --sip-user zenitel01 \
  --sip-pass 'Beachway1!Sip' \
  --number portia-ae3c

# 🔧 Provisioning 192.168.1.143 from factory reset...
#
#   SIP Domain:     testing-mo16m3gw.sip.twilio.com
#   SIP Auth User:  zenitel01
#   Call Button →:  portia-ae3c@testing-mo16m3gw.sip.twilio.com
#   Webcall:        Enabled
#   Auto-answer:    Enabled
#
# ✅ Provisioned! Device is rebooting (~30s).
```

> **Under the hood:** Downloads config backup, modifies 9 XML fields in `ipst_config.xml` (SIP identity, domain, auth credentials, transport, outbound proxy, DAK1 value, webcall enable, auto-answer mode), re-packs with correct tar checksums, uploads, and reboots. One operation, one reboot, zero manual steps.

### Device Reboot

```bash
zenitel reboot -h 192.168.1.143
# Device will be offline for ~30 seconds
```

### CLI Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--host` | `-h` | IP address of the Zenitel | required |
| `--user` | `-u` | Web UI username | `admin` |
| `--pass` | `-p` | Web UI password | `alphaadmin` |
| `--id` | | Relay ID (`relay1`, `gpio1`–`gpio6`) | `relay1` |
| `--timer` | | Relay timer in seconds | `3` |
| `--timeout` | | Scan timeout in ms | `5000` |
| `--off` | | Deactivate relay | |
| `--domain` | | SIP domain | |
| `--number` | | SIP directory number / agent number | |
| `--proxy` | | Outbound proxy | |
| `--transport` | | SIP transport (`udp`/`tcp`/`tls`) | |
| `--name` | | Display name | |
| `--out` | `-o` | Backup output filename | `ipst_config.tar.gz` |
| `--no-reboot` | | Skip reboot after DAK set | |
| `--sip-user` | | SIP auth username (provision) | |
| `--sip-pass` | | SIP auth password (provision) | |

---

## API

### `ZenitelClient`

The main class for interacting with a single Zenitel intercom via its web UI (HTTP).

```typescript
import { ZenitelClient } from '@pinecall/zenitel-client';

const z = new ZenitelClient({
  host: '192.168.1.143',
  user: 'admin',        // default
  password: 'alphaadmin' // default
});
```

#### Connectivity

```typescript
const reachable = await z.isReachable(); // true | false
```

#### Device Info

```typescript
const info = await z.getDeviceInfo();
// {
//   model: 'TCIV-2+',
//   firmware: '9.2.3.0',
//   mac: '00:13:cb:28:35:ca',
//   ip: '192.168.1.143',
//   hostname: 'zenitel01',
//   serialNumber: '22040000',
//   hardwareType: '8801',
//   mode: 'sip',
//   hasCamera: true,
//   sipDomain: 'testing-mo16m3gw.sip.twilio.com',
//   sipRegistered: true,
//   sipNumber: 'zenitel01',
//   outboundProxy: 'testing-mo16m3gw.sip.twilio.com',
//   uptime: 'up 2 days, 20 hours, 3 minutes',
//   webcallEnabled: true,
//   platform: 'turbine',
//   systemModelName: 'Turbine Compact - Video Plus'
// }
```

#### Webcall (Place / Stop / Answer calls)

```typescript
await z.placeCall('122');        // Dial a number
await z.placeCall('sip:user@domain');
await z.stopCall();              // Hang up
await z.answerCall();            // Answer incoming call
const status = await z.getCallStatus(); // 'Idle' | 'Calling' | 'Connected' | 'Ringing'
```

#### Relay / Door Control

```typescript
// Open door (relay1, 3 seconds)
await z.activateRelay({ relayId: 'relay1', timer: 3 });

// Activate GPIO output 2 for 5 seconds
await z.activateRelay({ relayId: 'gpio2', timer: 5 });

// Deactivate relay
await z.deactivateRelay('relay1');

// Get all relay statuses
const relays = await z.getRelayStatus();
// { relay1: 'Deactivated', gpio1: 'Deactivated', ..., gpio6: 'Deactivated' }
```

Available relay IDs: `relay1`, `gpio1`, `gpio2`, `gpio3`, `gpio4`, `gpio5`, `gpio6`.

#### SIP Configuration

```typescript
// Read
const sip = await z.getSIPConfig();
// {
//   displayName: 'zenitel01',
//   directoryNumber: 'zenitel01',
//   domain: 'testing-mo16m3gw.sip.twilio.com',
//   authUsername: 'zenitel01',
//   authPassword: 'Beachway1!Sip',
//   outboundProxy: 'testing-mo16m3gw.sip.twilio.com',
//   transport: 'UDP'
// }

// Write (partial updates supported)
await z.setSIPConfig({
  domain: 'my-trunk.sip.twilio.com',
  directoryNumber: 'station01',
  outboundProxy: 'my-trunk.sip.twilio.com',
});

// Reboot required for SIP changes to take effect
await z.reboot();
```

#### Webcall Management

```typescript
await z.enableWebcall();   // Enable HTTP webcall + relay API
await z.disableWebcall();  // Disable it
```

> **Note:** Firmware ≥4.11.3.1 disables webcall by default. You must enable it for relay and call control to work via HTTP.

#### Config Backup & Restore

```typescript
// Download full config as tar.gz
const backup = await z.downloadConfig();
fs.writeFileSync('backup.tar.gz', backup);

// Upload config (apply on next reboot)
const tarGz = fs.readFileSync('backup.tar.gz');
await z.uploadConfig(tarGz);
await z.reboot();
```

The backup archive contains:
- `config/ipst_config.xml` — Main configuration (SIP, relays, audio, network)
- `config/zapconfig.json` — ZAP configuration
- `config/snmpd.conf` — SNMP configuration
- `config/certs/` — TLS certificates
- `config/ui/logos/` — Custom logos
- `config/ui/background_images/` — Background images

#### Video

```typescript
const mjpgUrl = z.getMJPGUrl();
// "http://192.168.1.143/mjpg/video.mjpg"
// Use in <img> tags for live feed (Basic Auth required)

const rtspUrl = z.getRTSPUrl();
// "rtsp://192.168.1.143:554/1/RTSP"

const auth = z.getVideoAuth();
// { user: 'admin', password: 'alphaadmin' }
```

**MJPG in a browser/Electron:**
```html
<!-- Direct (if no auth required or same-origin) -->
<img src="http://192.168.1.143/mjpg/video.mjpg" />

<!-- In Electron with protocol handler (recommended) -->
<img src="portia-cam:///?ip=192.168.1.143&user=admin&pass=alphaadmin" />
```

#### Call Button (DAK) Configuration

The call button is the physical button on the intercom that triggers a SIP call. Its target number is stored in the `ipst_config.xml` inside the device firmware.

```typescript
// Read current call button configuration
const dak = await z.readDAK();
// {
//   number: '222',
//   domain: 'testing-mo16m3gw.sip.twilio.com',
//   raw: '222@testing-mo16m3gw.sip.twilio.com'
// }

// Configure call button to dial a random Portia agent
// Flow: download backup → modify XML → upload → reboot
await z.configureCallButton('portia-ae3c');
// Domain auto-detected from current SIP config

// With explicit domain + skip reboot
await z.configureCallButton('portia-ae3c', 'my.sip.twilio.com', false);
```

> **Under the hood:** `configureCallButton()` downloads the full config as `tar.gz`, uses a built-in tar parser (zero dependencies) to locate and modify `ipst_config.xml`, recalculates tar checksums, re-compresses, uploads, and optionally reboots. The entire process takes ~2 seconds.

#### Full Device Provisioning

One-shot setup for a factory-reset Zenitel. Configures SIP credentials, call button, webcall, and auto-answer in a single backup→upload→reboot cycle.

```typescript
import type { ProvisionConfig } from '@pinecall/zenitel-client';

await z.provisionDevice({
  sipDomain: 'testing-mo16m3gw.sip.twilio.com',
  sipAuthUser: 'zenitel01',
  sipAuthPassword: 'Beachway1!Sip',
  agentNumber: 'portia-ae3c',         // Call button will dial this
  // Optional:
  sipProxy: 'proxy.sip.twilio.com',   // Default: sipDomain
  sipTransport: 'UDP',                 // Default: UDP
  stationName: 'Lobby Intercom',       // Default: agentNumber
  enableWebcall: true,                 // Default: true
  autoAnswer: true,                    // Default: true
});
// Device reboots automatically after upload
```

**XML fields modified** (9 total):
| XML Element | Value |
|---|---|
| `<sip_nick>` | stationName |
| `<sip_id>` | stationName |
| `<sip_domain>` | sipDomain |
| `<sip_auth_user>` | sipAuthUser |
| `<sip_auth_password>` | sipAuthPassword |
| `<sip_outbound_transport>` | sipTransport |
| `<sip_outbound_proxy_address>` | sipProxy |
| `<dak1><val>` | agentNumber@sipDomain |
| `<enable_wc_r>` | 1 |
| `<auto_answer_mode>` | 1 |

#### Reboot

```typescript
await z.reboot();
// Device will be offline for approximately 30 seconds
```

---

### `scanNetwork()`

Discovers Zenitel intercoms on the local network using multiple strategies.

```typescript
import { scanNetwork } from '@pinecall/zenitel-client';

const devices = await scanNetwork();
// [
//   {
//     ip: '192.168.1.143',
//     mac: '00:13:cb:28:35:ca',
//     model: 'TCIV-2+',
//     firmware: '9.2.3.0',
//     hasCamera: true,
//     hostname: 'zenitel01',
//     mode: 'sip'
//   }
// ]
```

#### Scan Options

```typescript
const devices = await scanNetwork({
  timeout: 5000,                       // Scan timeout (ms)
  subnet: '192.168.1.0/24',           // Auto-detected if omitted
  strategies: ['arp-oui', 'http-probe'] // Default: both
});
```

#### Discovery Strategies

| Strategy | Method | Pros | Cons |
|----------|--------|------|------|
| **`arp-oui`** | Parse ARP table, filter by MAC prefix `00:13:CB` | Fast, no scanning | Requires recent ARP entry |
| **`http-probe`** | Probe every IP in subnet, look for `zenitel.js` | Works without ARP cache | Slow on large subnets |

Results from all strategies are **merged by IP** — if the same device is found by multiple strategies, the entry with the most data wins.

---

## Supported Hardware

Confirmed on Zenitel Turbine platform (hardware type `8801`):

| Model | Camera | Relay | Webcall | SIP Config | DAK | Firmware |
|-------|--------|-------|---------|------------|-----|----------|
| **TCIV-2+** | ✅ MJPG/RTSP | ✅ relay1 + gpio1–6 | ✅ | ✅ | ✅ | 9.2.3.0 |
| TCIV-3+ | ✅ | ✅ | ✅ | ✅ | ✅ | Expected compatible |
| TCIS-2 | ❌ | ✅ | ✅ | ✅ | ✅ | Expected compatible |

## Goform Endpoint Map

All communication uses the Zenitel web UI's goform API:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Login page (302 redirect) |
| `/goform/zForm_header` | GET | Device hidden fields (mode, platform, hwtype) |
| `/goform/zForm_stn_info` | GET | Station info table (model, MAC, firmware, SIP status) |
| `/goform/zForm_webcall` | GET/POST | Webcall + relay control |
| `/goform/zForm_sip_configuration` | GET | SIP config form fields |
| `/goform/zForm_save_changes` | POST | Write SIP configuration |
| `/goform/zForm_config_backup` | POST | Config restore (multipart upload) |
| `/ipst_config.tar.gz` | GET | Config backup download |
| `/goform/zForm_system_prefs` | POST | Reboot device |
| `/mjpg/video.mjpg` | GET | Live MJPG video stream (port 80) |

Authentication: **HTTP Basic Auth** on all endpoints.

## License

Apache-2.0
