#!/usr/bin/env node
/**
 * zenitel — CLI for testing Zenitel intercom interaction
 *
 * Usage:
 *   zenitel scan                             Discover Zenitel devices on the network
 *   zenitel info -h 192.168.1.143            Get device info
 *   zenitel relay -h 192.168.1.143           Activate relay1 for 3 seconds
 *   zenitel relay -h ... --id gpio1 --timer 5
 *   zenitel call 122 -h 192.168.1.143        Place a call
 *   zenitel stop -h 192.168.1.143            Stop current call
 *   zenitel status -h 192.168.1.143          Get relay + call status
 */

import { ZenitelClient } from './client.js';
import { scanNetwork } from './scanner.js';

const args = process.argv.slice(2);
const command = args[0];

function flag(name: string, short?: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` || (short && args[i] === `-${short}`)) {
      return args[i + 1];
    }
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function getClient(): ZenitelClient {
  const host = flag('host', 'h');
  if (!host) {
    console.error('Error: --host (-h) is required');
    process.exit(1);
  }
  return new ZenitelClient({
    host,
    user: flag('user', 'u') ?? 'admin',
    password: flag('pass', 'p') ?? 'alphaadmin',
  });
}

async function main() {
  switch (command) {
    case 'scan': {
      console.log('🔍 Scanning network for Zenitel devices...\n');
      const devices = await scanNetwork({
        timeout: Number(flag('timeout') ?? 5000),
      });
      if (devices.length === 0) {
        console.log('No Zenitel devices found.');
        break;
      }
      for (const dev of devices) {
        console.log(`  🟢 ${dev.ip}`);
        if (dev.mac) console.log(`     MAC: ${dev.mac}`);
        if (dev.model) console.log(`     Model: ${dev.model}`);
        if (dev.firmware) console.log(`     Firmware: ${dev.firmware}`);
        if (dev.hostname) console.log(`     Hostname: ${dev.hostname}`);
        if (dev.mode) console.log(`     Mode: ${dev.mode}`);
        console.log(`     Camera: ${dev.hasCamera ? 'Yes' : 'No'}`);
        console.log();
      }
      console.log(`Found ${devices.length} device(s).`);
      break;
    }

    case 'info': {
      const client = getClient();
      console.log(`📋 Getting device info from ${flag('host', 'h')}...\n`);
      const info = await client.getDeviceInfo();
      console.log(`  Model:          ${info.model}`);
      console.log(`  System:         ${info.systemModelName}`);
      console.log(`  Firmware:       ${info.firmware}`);
      console.log(`  MAC:            ${info.mac}`);
      console.log(`  Serial:         ${info.serialNumber}`);
      console.log(`  Hostname:       ${info.hostname}`);
      console.log(`  Mode:           ${info.mode}`);
      console.log(`  Camera:         ${info.hasCamera ? 'Yes' : 'No'}`);
      console.log(`  Platform:       ${info.platform}`);
      console.log(`  HW Type:        ${info.hardwareType}`);
      console.log(`  Uptime:         ${info.uptime}`);
      console.log(`  Webcall:        ${info.webcallEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`  SIP Domain:     ${info.sipDomain ?? '—'}`);
      console.log(`  SIP Registered: ${info.sipRegistered ? 'Yes' : 'No'}`);
      console.log(`  SIP Number:     ${info.sipNumber ?? '—'}`);
      console.log(`  Outbound Proxy: ${info.outboundProxy ?? '—'}`);
      break;
    }

    case 'relay': {
      const client = getClient();
      const relayId = flag('id') ?? 'relay1';
      const timer = Number(flag('timer') ?? 3);
      const deactivate = hasFlag('off');

      if (deactivate) {
        console.log(`🔒 Deactivating ${relayId}...`);
        await client.deactivateRelay(relayId);
      } else {
        console.log(`🚪 Activating ${relayId} for ${timer}s...`);
        await client.activateRelay({ relayId, timer });
      }
      console.log('✅ Done.');
      break;
    }

    case 'call': {
      const client = getClient();
      const number = args[1];
      if (!number) {
        console.error('Usage: zenitel call <number> -h <host>');
        process.exit(1);
      }
      console.log(`📞 Calling ${number}...`);
      await client.placeCall(number);
      console.log('✅ Call placed.');
      break;
    }

    case 'stop': {
      const client = getClient();
      console.log('⏹ Stopping call...');
      await client.stopCall();
      console.log('✅ Done.');
      break;
    }

    case 'status': {
      const client = getClient();
      console.log(`📊 Status of ${flag('host', 'h')}:\n`);
      const callStatus = await client.getCallStatus();
      console.log(`  Call: ${callStatus}`);
      const relays = await client.getRelayStatus();
      for (const [key, val] of Object.entries(relays)) {
        console.log(`  ${key}: ${val}`);
      }
      break;
    }

    case 'sip': {
      const client = getClient();
      const subCmd = args[1]; // get | set

      if (subCmd === 'set') {
        const config: Record<string, string> = {};
        if (flag('domain')) config.domain = flag('domain')!;
        if (flag('user')) config.authUsername = flag('user')!;
        if (flag('password')) config.authPassword = flag('password')!;
        if (flag('number')) config.directoryNumber = flag('number')!;
        if (flag('name')) config.displayName = flag('name')!;
        if (flag('proxy')) config.outboundProxy = flag('proxy')!;
        if (flag('transport')) config.transport = flag('transport')!;

        console.log('📝 Writing SIP config...');
        await client.setSIPConfig(config);
        console.log('✅ SIP config saved. Reboot the device for changes to take effect.');
      } else {
        console.log(`📡 SIP config from ${flag('host', 'h')}:\n`);
        const sip = await client.getSIPConfig();
        console.log(`  Name:         ${sip.displayName}`);
        console.log(`  Number:       ${sip.directoryNumber}`);
        console.log(`  Domain:       ${sip.domain}`);
        console.log(`  Auth User:    ${sip.authUsername}`);
        console.log(`  Auth Pass:    ${sip.authPassword}`);
        console.log(`  Proxy:        ${sip.outboundProxy}`);
        console.log(`  Transport:    ${sip.transport}`);
      }
      break;
    }

    case 'webcall': {
      const client = getClient();
      const action = args[1]; // enable | disable
      if (action === 'enable') {
        console.log('🔓 Enabling webcall + relay API...');
        await client.enableWebcall();
        console.log('✅ Webcall enabled.');
      } else if (action === 'disable') {
        console.log('🔒 Disabling webcall + relay API...');
        await client.disableWebcall();
        console.log('✅ Webcall disabled.');
      } else {
        const info = await client.getDeviceInfo();
        console.log(`Webcall: ${info.webcallEnabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log('\nUsage: zenitel webcall enable|disable -h <host>');
      }
      break;
    }

    case 'backup': {
      const client = getClient();
      const { writeFileSync } = await import('node:fs');
      const outFile = flag('out', 'o') || 'ipst_config.tar.gz';
      console.log(`💾 Downloading config backup...`);
      const buf = await client.downloadConfig();
      writeFileSync(outFile, buf);
      console.log(`✅ Saved to ${outFile} (${buf.length} bytes)`);
      break;
    }

    case 'restore': {
      const client = getClient();
      const { readFileSync } = await import('node:fs');
      const inFile = args[1];
      if (!inFile) {
        console.error('Usage: zenitel restore <file.tar.gz> -h <host>');
        process.exit(1);
      }
      console.log(`📤 Uploading config from ${inFile}...`);
      const buf = readFileSync(inFile);
      await client.uploadConfig(buf);
      console.log('✅ Config uploaded. Reboot the device for changes to take effect.');
      break;
    }

    case 'reboot': {
      const client = getClient();
      console.log('🔄 Rebooting device...');
      await client.reboot();
      console.log('✅ Reboot command sent. Device will be offline for ~30 seconds.');
      break;
    }

    case 'video': {
      const client = getClient();
      console.log(`📷 Video URLs for ${flag('host', 'h')}:\n`);
      console.log(`  MJPG:  ${client.getMJPGUrl()}`);
      console.log(`  RTSP:  ${client.getRTSPUrl()}`);
      break;
    }

    case 'dak': {
      const client = getClient();
      const subCmd = args[1]; // get | set

      if (subCmd === 'set') {
        const number = flag('number') || args[2];
        if (!number) {
          console.error('Usage: zenitel dak set --number <sip-number> -h <host>');
          process.exit(1);
        }
        const domain = flag('domain');
        const noReboot = hasFlag('no-reboot');
        console.log(`🔧 Configuring call button to dial: ${number}${domain ? '@' + domain : ' (auto-detect domain)'}...`);
        await client.configureCallButton(number, domain, !noReboot);
        console.log('✅ Call button configured.');
        if (!noReboot) {
          console.log('🔄 Rebooting device... (~30s downtime)');
        } else {
          console.log('⚠️  Reboot required for changes to take effect.');
        }
      } else {
        console.log(`📞 Call button (DAK1) config from ${flag('host', 'h')}:\n`);
        const dak = await client.readDAK();
        console.log(`  Dial Number:  ${dak.number || '(not set)'}`);
        console.log(`  SIP Domain:   ${dak.domain || '(none)'}`);
        console.log(`  Full URI:     ${dak.raw || '(empty)'}`);
      }
      break;
    }

    case 'provision': {
      const client = getClient();
      const sipDomain = flag('domain');
      const sipAuthUser = flag('sip-user');
      const sipAuthPassword = flag('sip-pass');
      const agentNumber = flag('number') || flag('agent');

      if (!sipDomain || !sipAuthUser || !sipAuthPassword || !agentNumber) {
        console.error(`Usage: zenitel provision -h <host> \\
  --domain <sip-domain> \\
  --sip-user <auth-username> \\
  --sip-pass <auth-password> \\
  --number <agent-sip-number>

Optional:
  --name <station-name>     Display name (default: agent number)
  --proxy <outbound-proxy>  Outbound proxy (default: sip domain)
  --transport udp|tcp|tls   SIP transport (default: UDP)`);
        process.exit(1);
      }

      console.log(`\n🔧 Provisioning ${flag('host', 'h')} from factory reset...\n`);
      console.log(`  SIP Domain:     ${sipDomain}`);
      console.log(`  SIP Auth User:  ${sipAuthUser}`);
      console.log(`  Call Button →:  ${agentNumber}@${sipDomain}`);
      console.log(`  Webcall:        Enabled`);
      console.log(`  Auto-answer:    Enabled\n`);

      await client.provisionDevice({
        sipDomain,
        sipAuthUser,
        sipAuthPassword,
        sipProxy: flag('proxy') || undefined,
        sipTransport: (flag('transport')?.toUpperCase() as 'UDP' | 'TCP' | 'TLS') || undefined,
        stationName: flag('name') || undefined,
        agentNumber,
      });

      console.log('✅ Provisioned! Device is rebooting (~30s).');
      console.log(`   After reboot, call button will dial: ${agentNumber}`);
      break;
    }

    default:
      console.log(`zenitel — Zenitel intercom CLI

Commands:
  scan                       Discover devices on the network
  info     -h <host>         Device information
  relay    -h <host>         Activate relay (--id relay1 --timer 3)
  relay    -h <host> --off   Deactivate relay
  call <N> -h <host>         Place a call
  stop     -h <host>         Stop current call
  status   -h <host>         Call + relay status
  sip get  -h <host>         Read SIP configuration
  sip set  -h <host>         Write SIP config (--domain --number --proxy ...)
  webcall enable -h <host>   Enable webcall + relay HTTP API
  webcall disable -h <host>  Disable webcall + relay HTTP API
  backup [file] -h <host>    Download config as tar.gz
  restore <file> -h <host>   Upload config tar.gz
  reboot   -h <host>         Reboot the device
  video    -h <host>         Show video stream URLs

Options:
  -h, --host       IP address of the Zenitel
  -u, --user       Username (default: admin)
  -p, --pass       Password (default: alphaadmin)
      --id         Relay ID (relay1, gpio1-gpio6)
      --timer      Relay timer in seconds (default: 3)
      --timeout    Scan timeout in ms (default: 5000)
      --off        Deactivate relay instead of activating
      --domain     SIP domain
      --number     SIP directory number
      --proxy      Outbound proxy
      --transport  SIP transport (udp/tcp/tls)
      --name       Display name`);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
