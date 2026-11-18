import os from 'node:os';
import { execFile } from 'node:child_process';

/**
 * Zero-dependency real-time PC Hardware Telemetry Engine
 * Computes exact per-core CPU load deltas + RAM + non-blocking disk & top-process snapshots.
 */
export class PcTelemetry {
  constructor() {
    this.prevCpus = os.cpus();
    this.cpuHistory = Array(40).fill(0);
    this.ramHistory = Array(40).fill(0);
    this.diskInfo = { usedGb: 0, totalGb: 0, pct: 0 };
    this.topProcs = [];
    this.lastSlowPoll = 0;
    this.pollingSlow = false;
  }

  getLanIp() {
    const nets = os.networkInterfaces();
    const candidates = [];
    for (const [name, list] of Object.entries(nets)) {
      if (!list) continue;
      const lower = name.toLowerCase();
      const isVirtual =
        lower.includes('vethernet') ||
        lower.includes('wsl') ||
        lower.includes('vmware') ||
        lower.includes('virtual') ||
        lower.includes('loopback');
      for (const iface of list) {
        if (iface.family === 'IPv4' && !iface.internal) {
          candidates.push({
            ip: iface.address,
            score: isVirtual ? 0 : iface.address.startsWith('192.168.') ? 3 : iface.address.startsWith('10.') ? 2 : 1,
          });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.ip || '127.0.0.1';
  }

  sampleFast() {
    const curCpus = os.cpus();
    const cores = [];
    let sumIdle = 0;
    let sumTotal = 0;

    for (let i = 0; i < curCpus.length; i++) {
      const prev = this.prevCpus[i] || curCpus[i];
      const cur = curCpus[i];
      const pTotal = Object.values(prev.times).reduce((a, b) => a + b, 0);
      const cTotal = Object.values(cur.times).reduce((a, b) => a + b, 0);
      const dTotal = Math.max(1, cTotal - pTotal);
      const dIdle = Math.max(0, cur.times.idle - prev.times.idle);
      const pct = Math.min(100, Math.max(0, Math.round((1 - dIdle / dTotal) * 100)));
      cores.push(pct);
      sumIdle += dIdle;
      sumTotal += dTotal;
    }
    this.prevCpus = curCpus;

    const cpuPct = Math.min(100, Math.max(0, Math.round((1 - sumIdle / Math.max(1, sumTotal)) * 100)));
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPct = Math.round((usedMem / totalMem) * 100);

    this.cpuHistory.push(cpuPct);
    if (this.cpuHistory.length > 40) this.cpuHistory.shift();
    this.ramHistory.push(ramPct);
    if (this.ramHistory.length > 40) this.ramHistory.shift();

    if (Date.now() - this.lastSlowPoll > 5000 && !this.pollingSlow) {
      this.pollDiskAndProcs();
    }

    return {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      cpuModel: (curCpus[0]?.model || 'CPU').replace(/\s+/g, ' ').trim(),
      cpuPct,
      cores,
      cpuHistory: this.cpuHistory,
      ramUsedGb: +(usedMem / 1073741824).toFixed(1),
      ramTotalGb: +(totalMem / 1073741824).toFixed(1),
      ramPct,
      ramHistory: this.ramHistory,
      uptimeHrs: +(os.uptime() / 3600).toFixed(1),
      disk: this.diskInfo,
      topProcs: this.topProcs,
      lanIp: this.getLanIp(),
      timestamp: Date.now(),
    };
  }

  pollDiskAndProcs() {
    if (process.platform !== 'win32') return;
    this.pollingSlow = true;
    this.lastSlowPoll = Date.now();
    const ps = `
      $d = Get-PSDrive C -ErrorAction SilentlyContinue;
      $procs = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 Name, @{N='mb';E={[math]::Round($_.WorkingSet64/1MB)}};
      @{
        used = if($d){ [math]::Round($d.Used/1GB,1) } else { 0 };
        free = if($d){ [math]::Round($d.Free/1GB,1) } else { 0 };
        procs = $procs
      } | ConvertTo-Json -Compress
    `;
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 4000 }, (err, stdout) => {
      this.pollingSlow = false;
      if (err || !stdout) return;
      try {
        const parsed = JSON.parse(stdout.trim());
        const total = +(parsed.used + parsed.free).toFixed(1);
        this.diskInfo = {
          usedGb: parsed.used,
          totalGb: total,
          pct: total > 0 ? Math.round((parsed.used / total) * 100) : 0,
        };
        if (Array.isArray(parsed.procs)) {
          this.topProcs = parsed.procs.map((p) => ({ name: p.Name, mb: p.mb }));
        }
      } catch {
        // ignore transient JSON parse edge cases
      }
    });
  }
}
