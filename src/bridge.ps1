[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$csharp = @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out int pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int GetMasterVolumeLevel(out float pfLevelDB);
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
  int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
  int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
  int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }

public class WinDeckNative {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint uCode, uint uMapType);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);

  public static void PrepForeground() {
    AllowSetForegroundWindow(-1);
    keybd_event(0, 0, 0, UIntPtr.Zero);
  }

  public static void KeyDown(byte vk) {
    byte scan = (byte)MapVirtualKey(vk, 0);
    uint ext = (vk == 0x5B || vk == 0x5C || (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || (vk >= 0xAD && vk <= 0xB3)) ? 1u : 0u;
    keybd_event(vk, scan, ext, UIntPtr.Zero);
  }

  public static void KeyUp(byte vk) {
    byte scan = (byte)MapVirtualKey(vk, 0);
    uint ext = (vk == 0x5B || vk == 0x5C || (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || (vk >= 0xAD && vk <= 0xB3)) ? 1u : 0u;
    keybd_event(vk, scan, ext | 2u, UIntPtr.Zero);
  }

  public static void TapVk(byte vk) {
    KeyDown(vk);
    KeyUp(vk);
  }

  public static void SendChord(bool ctrl, bool alt, bool shift, bool win, byte vk) {
    if (win) KeyDown(0x5B);
    if (ctrl) KeyDown(0x11);
    if (alt) KeyDown(0x12);
    if (shift) KeyDown(0x10);
    if (win || ctrl || alt || shift) System.Threading.Thread.Sleep(6);
    KeyDown(vk);
    System.Threading.Thread.Sleep(6);
    KeyUp(vk);
    if (win || ctrl || alt || shift) System.Threading.Thread.Sleep(4);
    if (shift) KeyUp(0x10);
    if (alt) KeyUp(0x12);
    if (ctrl) KeyUp(0x11);
    if (win) KeyUp(0x5B);
  }

  private static IAudioEndpointVolume GetVolObj() {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev;
    enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume aev;
    dev.Activate(ref iid, 23, 0, out aev);
    return aev;
  }

  public static int GetVolumePct() {
    try {
      float v;
      GetVolObj().GetMasterVolumeLevelScalar(out v);
      return (int)Math.Round(v * 100.0f);
    } catch { return -1; }
  }

  public static bool GetMute() {
    try {
      bool m;
      GetVolObj().GetMute(out m);
      return m;
    } catch { return false; }
  }

  public static int SetVolumePct(int pct) {
    try {
      float clamped = Math.Max(0f, Math.Min(1f, pct / 100.0f));
      var v = GetVolObj();
      v.SetMasterVolumeLevelScalar(clamped, Guid.Empty);
      if (clamped > 0f) v.SetMute(false, Guid.Empty);
      return (int)Math.Round(clamped * 100.0f);
    } catch { return -1; }
  }

  public static bool ToggleMute() {
    try {
      var v = GetVolObj();
      bool m;
      v.GetMute(out m);
      v.SetMute(!m, Guid.Empty);
      return !m;
    } catch { return false; }
  }
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp

Write-Output ('{"ready":true,"vol":' + [WinDeckNative]::GetVolumePct() + ',"muted":' + ([WinDeckNative]::GetMute().ToString().ToLower()) + '}')
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $trimmed = $line.Trim()
  if ($trimmed -eq "") { continue }
  $id = 0
  try {
    $cmd = $trimmed | ConvertFrom-Json
    $id = [int]$cmd.reqId
    $op = [string]$cmd.op

    if ($op -eq "get_audio") {
      $vol = [WinDeckNative]::GetVolumePct()
      $muted = [WinDeckNative]::GetMute().ToString().ToLower()
      Write-Output (@{ reqId = $id; ok = $true; vol = $vol; muted = ($muted -eq "true") } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "set_vol") {
      $vol = [WinDeckNative]::SetVolumePct([int]$cmd.vol)
      $muted = [WinDeckNative]::GetMute()
      Write-Output (@{ reqId = $id; ok = $true; vol = $vol; muted = $muted } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "step_vol") {
      $cur = [WinDeckNative]::GetVolumePct()
      if ($cur -lt 0) { $cur = 50 }
      $next = [WinDeckNative]::SetVolumePct($cur + [int]$cmd.delta)
      Write-Output (@{ reqId = $id; ok = $true; vol = $next; muted = $false } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "toggle_mute") {
      $m = [WinDeckNative]::ToggleMute()
      $vol = [WinDeckNative]::GetVolumePct()
      Write-Output (@{ reqId = $id; ok = $true; vol = $vol; muted = $m } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "vk") {
      [WinDeckNative]::TapVk([byte]$cmd.code)
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "chord") {
      [WinDeckNative]::SendChord([bool]$cmd.ctrl, [bool]$cmd.alt, [bool]$cmd.shift, [bool]$cmd.win, [byte]$cmd.code)
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "get_autostart") {
      $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
      $prop = Get-ItemProperty -Path $runKey -Name "PocketDeck" -ErrorAction SilentlyContinue
      $enabled = ($null -ne $prop -and [string]$prop.PocketDeck -ne "")
      Write-Output (@{ reqId = $id; ok = $true; enabled = $enabled } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "set_autostart") {
      $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
      if ([bool]$cmd.enabled) {
        $vbs = [string]$cmd.launcher
        Set-ItemProperty -Path $runKey -Name "PocketDeck" -Value ("wscript.exe `"$vbs`"")
        Write-Output (@{ reqId = $id; ok = $true; enabled = $true } | ConvertTo-Json -Compress)
      } else {
        Remove-ItemProperty -Path $runKey -Name "PocketDeck" -ErrorAction SilentlyContinue
        Write-Output (@{ reqId = $id; ok = $true; enabled = $false } | ConvertTo-Json -Compress)
      }
    }
    elseif ($op -eq "move") {
      $p = [System.Windows.Forms.Cursor]::Position
      [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($p.X + [int]$cmd.dx), ($p.Y + [int]$cmd.dy))
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "click") {
      if ($cmd.btn -eq "right") {
        [WinDeckNative]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
        [WinDeckNative]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
      } else {
        [WinDeckNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [WinDeckNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
      }
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "scroll") {
      [WinDeckNative]::mouse_event(0x0800, 0, 0, [int]$cmd.delta, [UIntPtr]::Zero)
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "sendkeys") {
      [System.Windows.Forms.SendKeys]::SendWait([string]$cmd.keys)
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "desktop") {
      (New-Object -ComObject Shell.Application).ToggleDesktop()
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "screenshot") {
      try {
        $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
        $bmp.Save([string]$cmd.outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose()
        $bmp.Dispose()
        Write-Output (@{ reqId = $id; ok = $true; w = $b.Width; h = $b.Height; mode = "full" } | ConvertTo-Json -Compress)
      } catch {
        [WinDeckNative]::PrepForeground()
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "ms-screenclip:"
        $psi.UseShellExecute = $true
        [System.Diagnostics.Process]::Start($psi) | Out-Null
        Write-Output (@{ reqId = $id; ok = $true; mode = "snip_fallback" } | ConvertTo-Json -Compress)
      }
    }
    elseif ($op -eq "shell") {
      [WinDeckNative]::PrepForeground()
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = [string]$cmd.target
      if ($cmd.args) { $psi.Arguments = [string]$cmd.args }
      if ($cmd.cwd) { $psi.WorkingDirectory = [string]$cmd.cwd }
      $psi.UseShellExecute = $true
      $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
      [System.Diagnostics.Process]::Start($psi) | Out-Null
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "clip_get") {
      $txt = [System.Windows.Forms.Clipboard]::GetText()
      if ($null -eq $txt) { $txt = "" }
      Write-Output (@{ reqId = $id; ok = $true; text = $txt } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "clip_set") {
      $val = [string]$cmd.text
      if ($val -eq "") { [System.Windows.Forms.Clipboard]::Clear() }
      else { [System.Windows.Forms.Clipboard]::SetText($val) }
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    elseif ($op -eq "lock_pc") {
      Start-Process "rundll32.exe" -ArgumentList "user32.dll,LockWorkStation"
      Write-Output (@{ reqId = $id; ok = $true } | ConvertTo-Json -Compress)
    }
    else {
      Write-Output (@{ reqId = $id; ok = $false; err = "unknown_op" } | ConvertTo-Json -Compress)
    }
  } catch {
    $msg = ($_.Exception.Message -replace '[\r\n]', ' ')
    Write-Output (@{ reqId = $id; ok = $false; err = $msg } | ConvertTo-Json -Compress)
  }
  [Console]::Out.Flush()
}
