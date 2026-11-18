import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const PS_BOOT_SCRIPT = `
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinDeckNative {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);
  public static void TapVk(byte vk) {
    keybd_event(vk, 0, 0, UIntPtr.Zero);
    keybd_event(vk, 0, 2, UIntPtr.Zero);
  }
}
"@

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim() -eq "") { continue }
  try {
    $cmd = $line | ConvertFrom-Json
    $op = $cmd.op
    if ($op -eq "vk") {
      [WinDeckNative]::TapVk([byte]$cmd.code)
      Write-Output '{"ok":true}'
    } elseif ($op -eq "move") {
      $p = [System.Windows.Forms.Cursor]::Position
      [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($p.X + [int]$cmd.dx), ($p.Y + [int]$cmd.dy))
      Write-Output '{"ok":true}'
    } elseif ($op -eq "click") {
      if ($cmd.btn -eq "right") {
        [WinDeckNative]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
        [WinDeckNative]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
      } else {
        [WinDeckNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [WinDeckNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
      }
      Write-Output '{"ok":true}'
    } elseif ($op -eq "scroll") {
      [WinDeckNative]::mouse_event(0x0800, 0, 0, [int]$cmd.delta, [UIntPtr]::Zero)
      Write-Output '{"ok":true}'
    } elseif ($op -eq "sendkeys") {
      [System.Windows.Forms.SendKeys]::SendWait([string]$cmd.keys)
      Write-Output '{"ok":true}'
    } elseif ($op -eq "desktop") {
      (New-Object -ComObject Shell.Application).ToggleDesktop()
      Write-Output '{"ok":true}'
    } elseif ($op -eq "screenshot") {
      $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
      $bmp.Save([string]$cmd.outPath, [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose()
      $bmp.Dispose()
      Write-Output '{"ok":true}'
    } else {
      Write-Output '{"ok":false,"err":"unknown_op"}'
    }
  } catch {
    $msg = $_.Exception.Message -replace '"',''''
    Write-Output ('{"ok":false,"err":"' + $msg + '"}')
  }
}
`;

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
    if (!this.dryRun) this.startWorker();
  }

  startWorker() {
    this.proc = spawn('powershell.exe', ['-NoProfile', '-Sta', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    this.proc.stdin.write(PS_BOOT_SCRIPT + '\n');
    this.proc.on('exit', () => {
      this.proc = null;
    });
  }

  sendFast(payload) {
    if (this.dryRun) return;
    if (!this.proc) this.startWorker();
    try {
      this.proc.stdin.write(JSON.stringify(payload) + '\n');
    } catch {
      // ignore pipe closed
    }
  }

  async executeMacro(action) {
    const type = action.actionType;
    const val = action.value || '';

    if (type === 'vk' && VK_MAP[val] !== undefined) {
      this.sendFast({ op: 'vk', code: VK_MAP[val] });
      return { ok: true, message: `已触发系统按键：${action.label}` };
    }

    if (type === 'show_desktop') {
      this.sendFast({ op: 'desktop' });
      return { ok: true, message: '🧹 已切换显示桌面 (Win+D 老板键)' };
    }

    if (type === 'screenshot') {
      const fileName = `pc-screen-${Date.now()}.png`;
      const outPath = path.join(this.dropsDir, fileName);
      if (this.dryRun) {
        fs.writeFileSync(outPath, Buffer.from('dryrun'));
        return { ok: true, message: '已截取电脑屏幕', fileUrl: `/drops/${fileName}`, fileName };
      }
      await this.captureScreenFile(outPath);
      return {
        ok: true,
        message: '📸 已截取电脑全屏并同步到快传列表！',
        fileUrl: `/drops/${fileName}`,
        fileName,
      };
    }

    if (type === 'open_url') {
      if (!/^https?:\/\//i.test(val)) throw new Error('仅允许 http/https 网址');
      if (!this.dryRun) {
        execFile('cmd.exe', ['/c', 'start', '', val], { windowsHide: true });
      }
      return { ok: true, message: `🌐 已在电脑浏览器打开：${val}` };
    }

    if (type === 'open_app') {
      if (!this.dryRun) {
        if (val === 'terminal') {
          execFile('cmd.exe', ['/c', 'start', 'powershell.exe', '-NoExit', '-Command', `Set-Location '${this.workspaceDir}'`]);
        } else if (val === 'explorer_drops') {
          execFile('explorer.exe', [this.dropsDir]);
        } else if (val === 'explorer_workspace') {
          execFile('explorer.exe', [this.workspaceDir]);
        } else if (val === 'taskmgr') {
          execFile('taskmgr.exe');
        } else if (val === 'calc') {
          execFile('calc.exe');
        }
      }
      return { ok: true, message: `🚀 已在电脑启动：${action.label}` };
    }

    if (type === 'sendkeys') {
      this.sendFast({ op: 'sendkeys', keys: val });
      return { ok: true, message: `⌨️ 已发送快捷键：${action.label}` };
    }

    if (type === 'lock_pc') {
      if (!this.dryRun) {
        execFile('rundll32.exe', ['user32.dll,LockWorkStation']);
      }
      return { ok: true, message: '🔒 电脑已安全锁屏' };
    }

    return { ok: false, message: '未知动作类型' };
  }

  captureScreenFile(outPath) {
    return new Promise((resolve, reject) => {
      const ps = `
        Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
        $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
        $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height);
        $g = [System.Drawing.Graphics]::FromImage($bmp);
        $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size);
        $bmp.Save('${outPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);
        $g.Dispose(); $bmp.Dispose();
      `;
      execFile('powershell.exe', ['-NoProfile', '-Sta', '-Command', ps], { timeout: 6000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getClipboard() {
    if (this.dryRun) return Promise.resolve(this._mockClip || '');
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-Sta', '-Command', '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw'],
        { timeout: 3000 },
        (_err, stdout) => resolve((stdout || '').replace(/\r?\n$/, ''))
      );
    });
  }

  setClipboard(text) {
    if (this.dryRun) {
      this._mockClip = String(text);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-Sta',
          '-Command',
          '[Console]::InputEncoding=[System.Text.Encoding]::UTF8; $t=[Console]::In.ReadToEnd(); Set-Clipboard -Value $t',
        ],
        { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true }
      );
      child.stdin.write(String(text));
      child.stdin.end();
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Set-Clipboard failed'))));
    });
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
