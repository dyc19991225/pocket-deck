import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_SCRIPT = path.join(__dirname, 'bridge.ps1');

const VK_MAP = {
  media_mute: 0xad,
  vol_down: 0xae,
  vol_up: 0xaf,
  media_next: 0xb0,
  media_prev: 0xb1,
  media_play_pause: 0xb3,
  key_left: 0x25,
  key_up: 0x26,
  key_right: 0x27,
  key_down: 0x28,
  key_space: 0x20,
  key_f5: 0x74,
  key_esc: 0x1b,
};

export class WinBridge {
  constructor({ dropsDir, workspaceDir, dryRun = false }) {
    this.dropsDir = dropsDir;
    this.workspaceDir = workspaceDir;
    this.dryRun = dryRun || process.platform !== 'win32';
    this.proc = null;
    this.nextReqId = 1;
    this.pending = new Map();
    this.audioState = { vol: 50, muted: false };

    if (!this.dryRun) {
      this.startWorker();
    }
  }

  startWorker() {
    if (this.proc) return;
    // IMPORTANT: Do NOT set windowsHide: true here, otherwise child GUI apps (Explorer/Terminal/Calc) inherit SW_HIDE!
    // Instead use -WindowStyle Hidden only on the host PowerShell bridge itself, while bridge.ps1 sets Normal on launched apps.
    this.proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Sta', '-WindowStyle', 'Hidden', '-File', BRIDGE_SCRIPT],
      { stdio: ['pipe', 'pipe', 'ignore'] }
    );

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) return;
      try {
        const msg = JSON.parse(trimmed);
        if (typeof msg.vol === 'number' && msg.vol >= 0) {
          this.audioState = { vol: msg.vol, muted: Boolean(msg.muted) };
        }
        if (msg.reqId && this.pending.has(msg.reqId)) {
          const { resolve } = this.pending.get(msg.reqId);
          this.pending.delete(msg.reqId);
          resolve(msg);
        }
      } catch {
        // ignore non-JSON lines
      }
    });

    this.proc.on('exit', () => {
      this.proc = null;
      for (const [, p] of this.pending) {
        p.resolve({ ok: false, err: 'bridge_restarted' });
      }
      this.pending.clear();
    });
  }

  callBridge(payload, timeoutMs = 4500) {
    if (this.dryRun) {
      if (payload.op === 'get_audio') return Promise.resolve({ ok: true, ...this.audioState });
      if (payload.op === 'set_vol') {
        this.audioState = { vol: payload.vol, muted: false };
        return Promise.resolve({ ok: true, ...this.audioState });
      }
      if (payload.op === 'step_vol') {
        this.audioState.vol = Math.max(0, Math.min(100, this.audioState.vol + payload.delta));
        this.audioState.muted = false;
        return Promise.resolve({ ok: true, ...this.audioState });
      }
      if (payload.op === 'toggle_mute') {
        this.audioState.muted = !this.audioState.muted;
        return Promise.resolve({ ok: true, ...this.audioState });
      }
      if (payload.op === 'clip_get') return Promise.resolve({ ok: true, text: this._mockClip || '' });
      if (payload.op === 'clip_set') {
        this._mockClip = String(payload.text || '');
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true, w: 1920, h: 1080 });
    }

    if (!this.proc) this.startWorker();
    const reqId = this.nextReqId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.has(reqId)) {
          this.pending.delete(reqId);
          resolve({ ok: false, err: 'bridge_timeout' });
        }
      }, timeoutMs);

      this.pending.set(reqId, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
      });

      try {
        this.proc.stdin.write(JSON.stringify({ ...payload, reqId }) + '\n');
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(reqId);
        resolve({ ok: false, err: e.message });
      }
    });
  }

  sendFast(payload) {
    void this.callBridge(payload, 1200);
  }

  async getAudioState() {
    const res = await this.callBridge({ op: 'get_audio' }, 1500);
    if (res.ok && typeof res.vol === 'number' && res.vol >= 0) {
      this.audioState = { vol: res.vol, muted: Boolean(res.muted) };
    }
    return this.audioState;
  }

  async setVolume(vol) {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(vol) || 0)));
    const res = await this.callBridge({ op: 'set_vol', vol: clamped }, 1500);
    return { ok: Boolean(res.ok), audio: this.audioState };
  }

  async executeMacro(action) {
    const type = action.actionType;
    const val = action.value || '';

    // 1. CoreAudio Real System Volume & Mute
    if (type === 'audio_mute') {
      const res = await this.callBridge({ op: 'toggle_mute' });
      if (!res.ok) return { ok: false, error: res.err || '静音切换失败' };
      return {
        ok: true,
        audio: this.audioState,
        message: this.audioState.muted ? '🔇 电脑已静音' : `🔊 已取消静音（当前音量 ${this.audioState.vol}%）`,
      };
    }

    if (type === 'audio_step') {
      const delta = Number(val) || 8;
      const res = await this.callBridge({ op: 'step_vol', delta });
      if (!res.ok) return { ok: false, error: res.err || '音量调节失败' };
      return {
        ok: true,
        audio: this.audioState,
        message: `${delta > 0 ? '🔊' : '🔉'} 电脑主音量已调至 ${this.audioState.vol}%`,
      };
    }

    // 2. Media & Hardware Virtual Keys
    if (type === 'vk') {
      if (val === 'media_mute') return this.executeMacro({ ...action, actionType: 'audio_mute' });
      if (val === 'vol_up') return this.executeMacro({ ...action, actionType: 'audio_step', value: '8' });
      if (val === 'vol_down') return this.executeMacro({ ...action, actionType: 'audio_step', value: '-8' });
      const code = VK_MAP[val];
      if (code === undefined) return { ok: false, error: `未知系统键名：${val}` };
      const res = await this.callBridge({ op: 'vk', code });
      return {
        ok: Boolean(res.ok),
        message: `🎵 已发送全局多媒体指令：${action.label}`,
      };
    }

    // 3. Boss Key (Win+D Toggle Desktop)
    if (type === 'show_desktop') {
      const res = await this.callBridge({ op: 'desktop' });
      return {
        ok: Boolean(res.ok),
        message: '🧹 已切换显示桌面 / 恢复窗口 (Win+D)',
      };
    }

    // 4. Full-Screen Capture + Instant Lightbox Preview (gracefully falls back to ms-screenclip: if GDI handle isolated)
    if (type === 'screenshot') {
      const fileName = `pc-screen-${Date.now()}.png`;
      const outPath = path.join(this.dropsDir, fileName);
      if (this.dryRun) {
        fs.writeFileSync(outPath, Buffer.from([137, 80, 78, 71]));
        return { ok: true, message: '📸 已截取屏幕', fileUrl: `/drops/${fileName}`, fileName, w: 1920, h: 1080 };
      }
      const res = await this.callBridge({ op: 'screenshot', outPath }, 6000);
      if (!res.ok) return { ok: false, error: res.err || '截屏失败' };
      if (res.mode === 'snip_fallback') {
        return {
          ok: true,
          message: '✂️ 已唤起 Windows 原生框选截图工具（双击项目下 start-pocket-deck.bat 启动可解锁后台静默全屏抓拍）',
        };
      }
      return {
        ok: true,
        message: `📸 已截取电脑全屏 (${res.w}×${res.h})！`,
        fileUrl: `/drops/${encodeURIComponent(fileName)}`,
        fileName,
        w: res.w,
        h: res.h,
      };
    }

    // 5. Region Snipping Tool (Win+Shift+S / ms-screenclip:)
    if (type === 'snipping_tool') {
      const res = await this.callBridge({ op: 'shell', target: 'ms-screenclip:' });
      return {
        ok: Boolean(res.ok),
        message: '✂️ 已唤起 Windows 区域框选截图工具！请拖动鼠标框选区域',
      };
    }

    // 6. Pull PC Clipboard straight onto Deck
    if (type === 'pull_clipboard') {
      const text = await this.getClipboard();
      return {
        ok: true,
        clipText: text,
        message: text ? `📋 已提取电脑剪贴板 (${text.length} 字符)` : '📋 当前电脑剪贴板为空（或非文本）',
      };
    }

    // 7. Open URL in Foreground Default Browser
    if (type === 'open_url') {
      if (!/^https?:\/\//i.test(val)) return { ok: false, error: '仅支持 http:// 或 https:// 网址' };
      const res = await this.callBridge({ op: 'shell', target: val });
      if (!res.ok) return { ok: false, error: res.err };
      return { ok: true, message: `🌐 已在电脑默认浏览器打开：${action.label}` };
    }

    // 8. Launch Native Windows Apps & Folders via ShellExecuteEx (supports UAC TaskMgr, WT, Explorer, Settings!)
    if (type === 'open_app') {
      let cmd = null;
      if (val === 'terminal') {
        cmd = { op: 'shell', target: 'wt.exe', args: `-d "${this.workspaceDir}"`, cwd: this.workspaceDir };
      } else if (val === 'explorer_drops') {
        cmd = { op: 'shell', target: 'explorer.exe', args: `"${this.dropsDir}"` };
      } else if (val === 'explorer_workspace') {
        cmd = { op: 'shell', target: 'explorer.exe', args: `"${this.workspaceDir}"` };
      } else if (val === 'taskmgr') {
        cmd = { op: 'shell', target: 'taskmgr.exe' };
      } else if (val === 'calc') {
        cmd = { op: 'shell', target: 'calc.exe' };
      } else if (val === 'sound_settings') {
        cmd = { op: 'shell', target: 'ms-settings:sound' };
      }
      if (!cmd) return { ok: false, error: `未知系统应用：${val}` };
      let res = await this.callBridge(cmd);
      // Fallback to powershell.exe if wt.exe fails
      if (!res.ok && val === 'terminal') {
        res = await this.callBridge({
          op: 'shell',
          target: 'powershell.exe',
          args: `-NoExit -Command "Set-Location '${this.workspaceDir}'"`,
          cwd: this.workspaceDir,
        });
      }
      if (!res.ok) return { ok: false, error: res.err || '启动应用失败' };
      return { ok: true, message: `🚀 已在前台打开：${action.label}` };
    }

    // 9. SendKeys Hotkey Combo
    if (type === 'sendkeys') {
      const res = await this.callBridge({ op: 'sendkeys', keys: val });
      if (!res.ok) return { ok: false, error: res.err };
      return { ok: true, message: `⌨️ 已发送快捷键：${action.label}` };
    }

    // 10. Lock Workstation
    if (type === 'lock_pc') {
      await this.callBridge({ op: 'lock_pc' });
      return { ok: true, message: '🔒 电脑已执行锁屏指令' };
    }

    return { ok: false, error: `不支持的按键类型：${type}` };
  }

  async getClipboard() {
    const res = await this.callBridge({ op: 'clip_get' }, 2500);
    return res.ok ? String(res.text || '') : '';
  }

  async setClipboard(text) {
    await this.callBridge({ op: 'clip_set', text: String(text || '') }, 2500);
  }

  close() {
    if (this.proc) {
      try {
        this.proc.stdin.end();
        this.proc.kill();
      } catch {
        // ignore
      }
      this.proc = null;
    }
  }
}
