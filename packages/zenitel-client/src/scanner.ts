/**
 * Network scanner — Discover Zenitel intercoms on the local network
 *
 * Strategy A: ARP table + OUI filter (MAC prefix 00:13:cb = Zenitel)
 * Strategy B: HTTP probe with fingerprinting (zenitel.js in HTML)
 *
 * Both strategies run in parallel and results are merged by IP.
 */

import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { networkInterfaces } from 'node:os';
import type { ZenitelDevice, ScanOptions } from './types.js';
import { ZenitelClient } from './client.js';

const ZENITEL_OUI = '00:13:cb';

// ── Public API ────────────────────────────────────────────────────────────

export async function scanNetwork(opts?: ScanOptions): Promise<ZenitelDevice[]> {
  const timeout = opts?.timeout ?? 5000;
  const strategies = opts?.strategies ?? ['arp-oui', 'http-probe'];
  const subnet = opts?.subnet ?? detectSubnet();

  const results: Map<string, ZenitelDevice> = new Map();

  const tasks: Promise<ZenitelDevice[]>[] = [];

  if (strategies.includes('arp-oui')) {
    tasks.push(arpOuiScan().catch(() => []));
  }

  if (strategies.includes('http-probe') && subnet) {
    tasks.push(httpProbeScan(subnet, timeout).catch(() => []));
  }

  const all = await Promise.all(tasks);

  // Merge by IP (prefer entries with more data)
  for (const batch of all) {
    for (const dev of batch) {
      const existing = results.get(dev.ip);
      if (!existing || (!existing.model && dev.model)) {
        results.set(dev.ip, { ...existing, ...dev });
      }
    }
  }

  return Array.from(results.values());
}

// ── Strategy A: ARP + OUI ────────────────────────────────────────────────

async function arpOuiScan(): Promise<ZenitelDevice[]> {
  const entries = await getArpTable();
  const zenitels = entries.filter(
    (e) => e.mac.toLowerCase().startsWith(ZENITEL_OUI)
  );

  // For each candidate, try to get device info
  const results = await Promise.all(
    zenitels.map(async (entry) => {
      const client = new ZenitelClient({ host: entry.ip, timeout: 3000 });
      try {
        const info = await client.getDeviceInfo();
        return {
          ip: entry.ip,
          mac: entry.mac,
          model: info.model,
          firmware: info.firmware,
          hasCamera: info.hasCamera,
          hostname: info.hostname,
          mode: info.mode,
          serialNumber: info.serialNumber,
          hardwareType: info.hardwareType,
        } satisfies ZenitelDevice;
      } catch {
        // Device unreachable or auth failed — return basic info
        return {
          ip: entry.ip,
          mac: entry.mac,
          hasCamera: false,
        } satisfies ZenitelDevice;
      }
    })
  );

  return results;
}

interface ArpEntry { ip: string; mac: string; }

async function getArpTable(): Promise<ArpEntry[]> {
  const os = platform();

  if (os === 'darwin' || os === 'linux') {
    return new Promise((resolve, reject) => {
      execFile('arp', ['-a'], (err, stdout) => {
        if (err) return reject(err);
        const entries: ArpEntry[] = [];
        for (const line of stdout.split('\n')) {
          // macOS: ? (192.168.1.143) at 0:13:cb:28:35:ca on en0 ifscope [ethernet]
          // Linux: ? (192.168.1.143) at 00:13:cb:28:35:ca [ether] on eth0
          const match = line.match(
            /\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]+)/i
          );
          if (match) {
            // Normalize MAC: "0:13:cb:28:35:ca" → "00:13:cb:28:35:ca"
            const mac = match[2]
              .split(':')
              .map((p) => p.padStart(2, '0'))
              .join(':')
              .toLowerCase();
            entries.push({ ip: match[1], mac });
          }
        }
        resolve(entries);
      });
    });
  }

  if (os === 'win32') {
    return new Promise((resolve, reject) => {
      execFile(
        'powershell',
        [
          '-Command',
          `Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.State -ne "Unreachable" } | Select-Object IPAddress,LinkLayerAddress | ConvertTo-Json`,
        ],
        (err, stdout) => {
          if (err) return reject(err);
          try {
            const raw = JSON.parse(stdout);
            const items = Array.isArray(raw) ? raw : [raw];
            const entries: ArpEntry[] = items
              .filter((item: any) => item.LinkLayerAddress)
              .map((item: any) => ({
                ip: item.IPAddress,
                // Windows uses "00-13-CB-28-35-CA" format
                mac: item.LinkLayerAddress.replace(/-/g, ':').toLowerCase(),
              }));
            resolve(entries);
          } catch {
            resolve([]);
          }
        }
      );
    });
  }

  return [];
}

// ── Strategy B: HTTP Probe ───────────────────────────────────────────────

async function httpProbeScan(
  subnet: string,
  timeout: number
): Promise<ZenitelDevice[]> {
  const ips = expandSubnet(subnet);
  const results: ZenitelDevice[] = [];

  // Probe all IPs in parallel with short timeout
  const probeTimeout = Math.min(timeout, 1500);
  const batches = chunk(ips, 50); // 50 concurrent

  for (const batch of batches) {
    const probes = batch.map(async (ip) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), probeTimeout);
        const res = await fetch(`http://${ip}/`, {
          signal: controller.signal,
          redirect: 'follow',
        });
        clearTimeout(timer);
        const html = await res.text();

        // Fingerprint: look for zenitel.js or Stentofon
        if (
          html.includes('zenitel.js') ||
          html.includes('Stentofon') ||
          html.includes('zForm_header')
        ) {
          // Extract firmware from "zenitel.js?version=X.X.X.X"
          const fwMatch = html.match(/version=(\d+\.\d+\.\d+\.\d+)/);
          results.push({
            ip,
            mac: '',
            firmware: fwMatch?.[1],
            hasCamera: false,
          });
        }
      } catch {
        // Unreachable — skip
      }
    });
    await Promise.all(probes);
  }

  return results;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function detectSubnet(): string | undefined {
  const interfaces = networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        // e.g. "192.168.1.42" + netmask "255.255.255.0" → "192.168.1.0/24"
        const parts = addr.address.split('.');
        parts[3] = '0';
        return `${parts.join('.')}/24`;
      }
    }
  }
  return undefined;
}

function expandSubnet(cidr: string): string[] {
  // Simple /24 expansion — covers 99% of home/office networks
  const base = cidr.split('/')[0];
  const parts = base.split('.');
  const ips: string[] = [];
  for (let i = 1; i <= 254; i++) {
    ips.push(`${parts[0]}.${parts[1]}.${parts[2]}.${i}`);
  }
  return ips;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
