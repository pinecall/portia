/**
 * ZenitelClient — HTTP scraper for Zenitel intercom web UI
 *
 * All methods use the goform endpoints documented in the Zenitel wiki
 * and confirmed against a real TCIV-2+ (FW 9.2.3.0) at 192.168.1.143.
 *
 * Auth: HTTP Basic Auth (admin/alphaadmin by default).
 * All goform endpoints use POST with form-urlencoded bodies.
 */

import type {
  ZenitelClientOptions,
  DeviceInfo,
  RelayOptions,
  RelayStatus,
  CallStatus,
  SIPConfig,
  ProvisionConfig,
} from './types.js';

export class ZenitelClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeout: number;

  constructor(private opts: ZenitelClientOptions) {
    const proto = opts.protocol ?? 'http';
    this.baseUrl = `${proto}://${opts.host}`;
    const user = opts.user ?? 'admin';
    const pass = opts.password ?? 'alphaadmin';
    this.authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    this.timeout = opts.timeout ?? 5000;
  }

  // ── Connectivity ────────────────────────────────────────────────────────

  /** Check if the Zenitel is reachable */
  async isReachable(): Promise<boolean> {
    try {
      const res = await this._fetch('/', 'GET', 2000);
      return res.ok || res.status === 302;
    } catch {
      return false;
    }
  }

  // ── Device Info ─────────────────────────────────────────────────────────

  /** Scrape station info + header for full device data */
  async getDeviceInfo(): Promise<DeviceInfo> {
    // 1. Get hidden fields from header (sigmode, frontboard, platform, hwtype)
    const headerHtml = await this._html('/goform/zForm_header');
    const sigmode = this._hidden(headerHtml, 'global_sigmode') || 'sip';
    const frontboard = this._hidden(headerHtml, 'global_frontboard') || '';
    const platform = this._hidden(headerHtml, 'global_platform') || '';
    const hwtype = this._hidden(headerHtml, 'global_hwtype') || '';

    // 2. Get station info table
    const infoHtml = await this._html('/goform/zForm_stn_info');

    // Parse the info table — rows are <td class='header_left'>Label:</td><td>Value</td>
    const field = (label: string): string => {
      const re = new RegExp(
        `header_left'>\\s*${label}[:\\s]*</td>\\s*<td[^>]*>([^<]+)`,
        'i'
      );
      return infoHtml.match(re)?.[1]?.trim() ?? '';
    };

    // Model is in the <h2> tag: "TCIV-2+ Information"
    const modelMatch = infoHtml.match(/<h2>([^<]+)\s+Information/i);
    const model = modelMatch?.[1]?.trim() ?? '';

    // SIP domain includes registration status: "domain.com, Registered - ..."
    const sipDomainRaw = field('Server Domain \\(SIP\\)');
    const sipDomain = sipDomainRaw.split(',')[0]?.trim();
    const sipRegistered = sipDomainRaw.toLowerCase().includes('registered');

    // 3. Check if webcall is enabled
    const webcallHtml = await this._html('/goform/zForm_webcall');
    const webcallEnabled = webcallHtml.includes('checked');

    return {
      model,
      firmware: field('Software Version'),
      mac: field('MAC Address'),
      ip: field('IP Address') || this.opts.host,
      hostname: field('Name'),
      serialNumber: field('Serial Number'),
      hardwareType: hwtype,
      mode: sigmode as 'sip' | 'edge' | 'pulse',
      hasCamera: frontboard === 'video',
      sipDomain,
      sipRegistered,
      sipNumber: field('Number \\(SIP ID\\)'),
      outboundProxy: field('Outbound Proxy'),
      uptime: field('Uptime'),
      webcallEnabled,
      platform,
      systemModelName: field('System Model Name'),
    };
  }

  // ── Webcall API ─────────────────────────────────────────────────────────

  /** Place a call to a number/SIP URI */
  async placeCall(number: string): Promise<void> {
    await this._post('/goform/zForm_webcall', {
      webcall: number,
      message: 'PLACE CALL',
    });
  }

  /** Stop the current call */
  async stopCall(): Promise<void> {
    await this._post('/goform/zForm_webcall', { message: 'STOP' });
  }

  /** Answer an incoming call */
  async answerCall(): Promise<void> {
    await this._post('/goform/zForm_webcall', { message: 'ANSWER' });
  }

  /** Get current call status by scraping the webcall page */
  async getCallStatus(): Promise<CallStatus> {
    const html = await this._html('/goform/zForm_webcall');
    const match = html.match(/Call status:<\/td>\s*<td>(\w+)/i);
    return (match?.[1] as CallStatus) ?? 'Idle';
  }

  // ── Relay / Door Control ────────────────────────────────────────────────

  /** Activate a relay (default: relay1, 3 seconds) */
  async activateRelay(opts?: RelayOptions): Promise<void> {
    const body: Record<string, string> = {
      activate: 'ACTIVATE',
      relayId: opts?.relayId ?? 'relay1',
    };
    if (opts?.timer !== undefined) {
      body.relaytimer = String(opts.timer);
    }
    await this._post('/goform/zForm_webcall', body);
  }

  /** Deactivate a relay */
  async deactivateRelay(relayId = 'relay1'): Promise<void> {
    await this._post('/goform/zForm_webcall', {
      deactivate: 'DEACTIVATE',
      relayId,
    });
  }

  /** Get status of all relays by scraping the webcall page */
  async getRelayStatus(): Promise<RelayStatus> {
    const html = await this._html('/goform/zForm_webcall');
    const parse = (label: string): 'Activated' | 'Deactivated' => {
      const re = new RegExp(`${label} status:</td>\\s*<td>(\\w+)`, 'i');
      const m = html.match(re);
      return m?.[1] === 'Activated' ? 'Activated' : 'Deactivated';
    };
    return {
      relay1: parse('Relay 1'),
      gpio1: parse('Output 1'),
      gpio2: parse('Output 2'),
      gpio3: parse('Output 3'),
      gpio4: parse('Output 4'),
      gpio5: parse('Output 5'),
      gpio6: parse('Output 6'),
    };
  }

  // ── Video ───────────────────────────────────────────────────────────────

  /** Get the MJPG stream URL (port 80, same as web UI — confirmed on TCIV-2+) */
  getMJPGUrl(): string {
    return `http://${this.opts.host}/mjpg/video.mjpg`;
  }

  /** Get RTSP stream URL */
  getRTSPUrl(): string {
    return `rtsp://${this.opts.host}:554/1/RTSP`;
  }

  /** Get auth credentials for MJPG (for Electron protocol handler) */
  getVideoAuth(): { user: string; password: string } {
    return {
      user: this.opts.user ?? 'admin',
      password: this.opts.password ?? 'alphaadmin',
    };
  }

  // ── SIP Configuration ──────────────────────────────────────────────────
  // All fields from POST /goform/zForm_save_changes (confirmed on FW 9.2.3.0)
  //
  // Field map (HTML name → SIPConfig key):
  //   sip_nick        → displayName
  //   sip_id          → directoryNumber
  //   sip_domain      → domain
  //   sip_auth_user   → authUsername
  //   sip_auth_pwd    → authPassword
  //   sip_ppa         → outboundProxy (address)
  //   sip_ppp         → outboundProxy (port)
  //   sip_outbound_transport → transport

  /** Read current SIP config by scraping the form fields */
  async getSIPConfig(): Promise<SIPConfig> {
    const html = await this._html('/goform/zForm_sip_configuration');
    const input = (name: string): string => {
      const re = new RegExp(`name=${name}\\s+value="([^"]*)"`, 'i');
      return html.match(re)?.[1] ?? '';
    };
    const select = (name: string): string => {
      const re = new RegExp(
        `name=${name}[^>]*>([\\s\\S]*?)</select>`,
        'i'
      );
      const block = html.match(re)?.[1] ?? '';
      const sel = block.match(/SELECTED\s+value='([^']*)'/i);
      return sel?.[1] ?? '';
    };

    return {
      displayName: input('sip_nick'),
      directoryNumber: input('sip_id'),
      domain: input('sip_domain'),
      authUsername: input('sip_auth_user'),
      authPassword: input('sip_auth_pwd'),
      outboundProxy: input('sip_ppa'),
      transport: select('sip_outbound_transport') as 'udp' | 'tcp' | 'tls',
    };
  }

  /** Write SIP config via POST to zForm_save_changes */
  async setSIPConfig(config: SIPConfig): Promise<void> {
    const fields: Record<string, string> = {};
    if (config.displayName !== undefined) fields.sip_nick = config.displayName;
    if (config.directoryNumber !== undefined) fields.sip_id = config.directoryNumber;
    if (config.domain !== undefined) fields.sip_domain = config.domain;
    if (config.authUsername !== undefined) fields.sip_auth_user = config.authUsername;
    if (config.authPassword !== undefined) fields.sip_auth_pwd = config.authPassword;
    if (config.outboundProxy !== undefined) fields.sip_ppa = config.outboundProxy;
    if (config.transport !== undefined) fields.sip_outbound_transport = config.transport.toUpperCase();
    fields.save_changes = 'Save';
    await this._post('/goform/zForm_save_changes', fields);
  }

  // ── Webcall Enable/Disable ─────────────────────────────────────────────

  /** Enable webcall + relay HTTP API (required for FW ≥4.11.3.1) */
  async enableWebcall(): Promise<void> {
    await this._post('/goform/zForm_webcall', {
      enable_wc_r_node: 'on',
      savewcr: 'Save',
    });
  }

  /** Disable webcall + relay HTTP API */
  async disableWebcall(): Promise<void> {
    await this._post('/goform/zForm_webcall', {
      savewcr: 'Save',
      // checkbox not sent = disabled
    });
  }

  // ── Direct Access Key (DAK) — call button config ──────────────────────

  /**
   * Set the DAK (call button) to dial a specific SIP address.
   * Button index 0 = physical button 1 on the intercom.
   * @param sipAddress - Full SIP address, e.g. "portia-xxxx@sip.twilio.com"
   * @param buttonIndex - DAK button index (default 0 = Button 1)
   */
  async setDAK(sipAddress: string, buttonIndex = 0): Promise<void> {
    await this._post('/goform/zForm_speeddial_configuration_basic_auth', {
      [`dak_fun${buttonIndex}`]: '0',  // 0 = normal call
      [`dak_value${buttonIndex}`]: sipAddress,
      [`dak_in_call_func${buttonIndex}`]: '5',  // 5 = End Call on button press during call
      message: 'SAVE',
    });
  }

  /** Read the current DAK value for a button */
  async getDAK(buttonIndex = 0): Promise<string> {
    const res = await this._fetch('/goform/zForm_speeddial_configuration_basic_auth');
    const html = await res.text();
    const match = html.match(new RegExp(`name='dak_value${buttonIndex}'[^>]*value='([^']*)'`));
    return match?.[1] || '';
  }

  // ── Config Backup / Restore ────────────────────────────────────────────

  /** Download complete config as tar.gz binary */
  async downloadConfig(): Promise<Buffer> {
    const res = await this._fetch('/ipst_config.tar.gz');
    if (!res.ok) throw new Error(`Download config failed: HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  /** Upload config tar.gz (triggers restore on reboot) */
  async uploadConfig(tarGz: Buffer): Promise<void> {
    // The form uses multipart/form-data with field name "binary"
    const boundary = '----PortiaUpload' + Date.now();
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="binary"; filename="ipst_config.tar.gz"\r\nContent-Type: application/gzip\r\n\r\n`;
    const submit = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="WebRestore"\r\n\r\nUPLOAD\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([
      Buffer.from(header),
      tarGz,
      Buffer.from(submit),
    ]);
    await this._fetch(
      '/goform/zForm_config_backup',
      'POST',
      30000,
      body.toString('binary'),
      `multipart/form-data; boundary=${boundary}`,
    );
  }

  // ── DAK (Call Button) Configuration ─────────────────────────────────────
  // The DAK (Direct Access Key) controls what number the intercom calls
  // when someone presses the call button. Stored in ipst_config.xml.
  //
  // Flow: download backup → modify XML → re-upload → reboot
  //
  // XML structure:
  //   <dak1><fun>0</fun><val>222@domain.sip.twilio.com</val>...</dak1>

  /** Read current DAK1 value from the config backup */
  async readDAK(): Promise<{ number: string; domain: string; raw: string }> {
    const backup = await this.downloadConfig();
    const xml = await this._extractXmlFromTarGz(backup);
    const match = xml.match(/<dak1>[\s\S]*?<val>([^<]*)<\/val>/);
    const raw = match?.[1] ?? '';
    const [number, domain] = raw.includes('@') ? raw.split('@') : [raw, ''];
    return { number, domain, raw };
  }

  /**
   * Configure the call button (DAK1) to dial a specific number.
   * Downloads backup, modifies XML, re-uploads, optionally reboots.
   *
   * @param number - The SIP number to dial (e.g. "portia-ae3c")
   * @param domain - SIP domain (auto-detected from current config if omitted)
   * @param autoReboot - Reboot after upload (default: true)
   */
  async configureCallButton(
    number: string,
    domain?: string,
    autoReboot = true,
  ): Promise<void> {
    // 1. Get current SIP domain if not provided
    if (!domain) {
      const sip = await this.getSIPConfig();
      domain = sip.domain;
    }

    const dialValue = domain ? `${number}@${domain}` : number;

    // 2. Download current config
    const backup = await this.downloadConfig();

    // 3. Extract, modify, re-pack
    const modified = await this._modifyTarGzXml(backup, (xml) => {
      // Replace DAK1 value
      return xml.replace(
        /(<dak1>[\s\S]*?<val>)[^<]*(<\/val>)/,
        `$1${dialValue}$2`,
      );
    });

    // 4. Upload modified config
    await this.uploadConfig(modified);

    // 5. Reboot to apply
    if (autoReboot) {
      await this.reboot();
    }
  }

  // ── Full Provisioning ──────────────────────────────────────────────────
  // One-shot setup for a factory-reset Zenitel. Configures everything
  // in a single backup → modify XML → upload → reboot cycle.
  //
  // XML fields modified:
  //   <sip_nick>       → stationName
  //   <sip_id>         → stationName
  //   <sip_domain>     → sipDomain
  //   <sip_auth_user>  → sipAuthUser
  //   <sip_auth_password> → sipAuthPassword
  //   <sip_outbound_transport> → sipTransport
  //   <dak1><val>      → agentNumber@sipDomain
  //   <enable_wc_r>    → 1 (webcall enabled)
  //   <auto_answer_mode> → 1 (auto-answer for AI)

  /**
   * Provision a factory-reset Zenitel in one operation.
   * Downloads config, modifies all SIP + DAK + webcall fields in XML,
   * uploads, and reboots. Device will be fully configured after ~30s.
   */
  async provisionDevice(config: ProvisionConfig): Promise<void> {
    const proxy = config.sipProxy ?? config.sipDomain;
    const name = config.stationName ?? config.agentNumber;
    const transport = config.sipTransport ?? 'UDP';
    const webcall = config.enableWebcall !== false ? '1' : '0';
    const autoAnswer = config.autoAnswer !== false ? '1' : '0';
    const dakValue = `${config.agentNumber}@${config.sipDomain}`;

    // 1. Download current config backup
    const backup = await this.downloadConfig();

    // 2. Modify all fields in ipst_config.xml
    const modified = await this._modifyTarGzXml(backup, (xml) => {
      return xml
        // SIP identity
        .replace(/(<sip_nick>)[^<]*(<\/sip_nick>)/, `$1${name}$2`)
        .replace(/(<sip_id>)[^<]*(<\/sip_id>)/, `$1${name}$2`)
        // SIP server
        .replace(/(<sip_domain>)[^<]*(<\/sip_domain>)/, `$1${config.sipDomain}$2`)
        .replace(/(<sip_auth_user>)[^<]*(<\/sip_auth_user>)/, `$1${config.sipAuthUser}$2`)
        .replace(/(<sip_auth_password>)[^<]*(<\/sip_auth_password>)/, `$1${config.sipAuthPassword}$2`)
        .replace(/(<sip_outbound_transport>)[^<]*(<\/sip_outbound_transport>)/, `$1${transport}$2`)
        // Outbound proxy (match first occurrence)
        .replace(/(<sip_outbound_proxy_address>)[^<]*/, `$1${proxy}`)
        // Call button → agent number
        .replace(/(\<dak1\>[\s\S]*?\<val\>)[^<]*(\<\/val\>)/, `$1${dakValue}$2`)
        // Enable webcall + relay API
        .replace(/(<enable_wc_r>)[^<]*(<\/enable_wc_r>)/, `$1${webcall}$2`)
        // Auto-answer (AI agent needs this)
        .replace(/(<auto_answer_mode>)[^<]*(<\/auto_answer_mode>)/, `$1${autoAnswer}$2`);
    });

    // 3. Upload modified config
    await this.uploadConfig(modified);

    // 4. Reboot to apply
    await this.reboot();
  }

  // ── Tar.gz helpers (Node built-in zlib, no deps) ──────────────────────

  private async _extractXmlFromTarGz(tarGz: Buffer): Promise<string> {
    const { gunzipSync } = await import('node:zlib');
    const tar = gunzipSync(tarGz);
    // Simple tar parser — find ipst_config.xml
    return this._findFileInTar(tar, 'ipst_config.xml');
  }

  private async _modifyTarGzXml(
    tarGz: Buffer,
    modify: (xml: string) => string,
  ): Promise<Buffer> {
    const { gunzipSync, gzipSync } = await import('node:zlib');
    const tar = gunzipSync(tarGz);

    // Find and modify ipst_config.xml in the tar
    const modified = this._replaceFileInTar(tar, 'ipst_config.xml', modify);

    return gzipSync(modified);
  }

  /**
   * Minimal tar file finder — tar format:
   * Each file: 512-byte header + data padded to 512 bytes
   * Header: name at offset 0 (100 bytes), size at offset 124 (12 bytes, octal)
   */
  private _findFileInTar(tar: Buffer, filename: string): string {
    let offset = 0;
    while (offset < tar.length - 512) {
      const header = tar.subarray(offset, offset + 512);
      const name = header.subarray(0, 100).toString('utf8').replace(/\0/g, '');
      if (!name) break; // End of tar

      const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0/g, '').trim();
      const size = parseInt(sizeStr, 8) || 0;

      if (name.includes(filename)) {
        return tar.subarray(offset + 512, offset + 512 + size).toString('utf8');
      }

      // Next entry: header (512) + data padded to 512
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    throw new Error(`File ${filename} not found in tar`);
  }

  /**
   * Replace a file's content inside a tar buffer.
   * If the new content is a different size, we rebuild the entry.
   */
  private _replaceFileInTar(
    tar: Buffer,
    filename: string,
    modify: (content: string) => string,
  ): Buffer {
    const chunks: Buffer[] = [];
    let offset = 0;
    let replaced = false;

    while (offset < tar.length - 512) {
      const header = Buffer.from(tar.subarray(offset, offset + 512));
      const name = header.subarray(0, 100).toString('utf8').replace(/\0/g, '');
      if (!name) {
        // Copy remaining (end-of-archive markers)
        chunks.push(Buffer.from(tar.subarray(offset)));
        break;
      }

      const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0/g, '').trim();
      const size = parseInt(sizeStr, 8) || 0;
      const dataStart = offset + 512;
      const paddedSize = Math.ceil(size / 512) * 512;

      if (name.includes(filename) && !replaced) {
        const original = tar.subarray(dataStart, dataStart + size).toString('utf8');
        const modified = modify(original);
        const newData = Buffer.from(modified, 'utf8');
        const newPaddedSize = Math.ceil(newData.length / 512) * 512;

        // Update size in header (octal, 11 chars + null)
        const newSizeStr = newData.length.toString(8).padStart(11, '0') + '\0';
        Buffer.from(newSizeStr).copy(header, 124);

        // Recalculate header checksum
        this._updateTarChecksum(header);

        chunks.push(header);
        chunks.push(newData);
        // Pad to 512 boundary
        if (newPaddedSize > newData.length) {
          chunks.push(Buffer.alloc(newPaddedSize - newData.length));
        }
        replaced = true;
      } else {
        chunks.push(Buffer.from(tar.subarray(offset, dataStart + paddedSize)));
      }

      offset = dataStart + paddedSize;
    }

    return Buffer.concat(chunks);
  }

  /** Recalculate tar header checksum (sum of all header bytes with checksum field as spaces) */
  private _updateTarChecksum(header: Buffer): void {
    // Clear checksum field (offset 148, 8 bytes) with spaces
    for (let i = 148; i < 156; i++) header[i] = 0x20;
    // Sum all bytes
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    // Write checksum (6 octal digits + null + space)
    const checksumStr = sum.toString(8).padStart(6, '0') + '\0 ';
    Buffer.from(checksumStr).copy(header, 148);
  }

  // ── Reboot ─────────────────────────────────────────────────────────────

  /** Reboot the Zenitel (required after config changes) */
  async reboot(): Promise<void> {
    try {
      await this._post('/goform/zForm_system_prefs', { reboot: 'Reboot' });
    } catch {
      // May disconnect before response — that's expected
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private async _fetch(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    timeout?: number,
    body?: string,
    contentType?: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout ?? this.timeout);
    try {
      const headers: Record<string, string> = {
        Authorization: this.authHeader,
      };
      if (contentType) headers['Content-Type'] = contentType;

      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async _html(path: string): Promise<string> {
    const res = await this._fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`);
    return res.text();
  }

  private async _post(path: string, fields: Record<string, string>): Promise<string> {
    const body = new URLSearchParams(fields).toString();
    const res = await this._fetch(path, 'POST', undefined, body, 'application/x-www-form-urlencoded');
    return res.text();
  }

  /** Extract value from <input type=hidden id='name' value='val'> */
  private _hidden(html: string, id: string): string {
    const re = new RegExp(`id='${id}'\\s+value='([^']*)'`, 'i');
    return html.match(re)?.[1] ?? '';
  }
}
