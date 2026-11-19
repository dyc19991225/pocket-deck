Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$port = 4799
$url = "http://127.0.0.1:$port/"

# Check if already listening on 4799 -> just open browser and exit
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $iar = $tcp.BeginConnect("127.0.0.1", $port, $null, $null)
  if ($iar.AsyncWaitHandle.WaitOne(250, $false) -and $tcp.Connected) {
    $tcp.Close()
    Start-Process $url
    exit 0
  }
  $tcp.Close()
} catch {}

# Prefer bundled runtime\node.exe for zero-install users, fallback to PATH node
$bundledNode = Join-Path $rootDir "runtime\node.exe"
$nodeExe = if (Test-Path $bundledNode) { $bundledNode } else { "node.exe" }
$entryScript = Join-Path $rootDir "bin\pocket-deck.mjs"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $nodeExe
$psi.Arguments = "`"$entryScript`" --port $port"
$psi.WorkingDirectory = $rootDir
$psi.CreateNoWindow = $true
$psi.UseShellExecute = $false
$nodeProc = [System.Diagnostics.Process]::Start($psi)

# Draw a crisp 32x32 cyber-deck icon dynamically (no external .ico file needed)
$bmp = New-Object System.Drawing.Bitmap(32, 32)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), 2.5)
$keyBrush1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 56, 189, 248))
$keyBrush2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 204, 21))
$g.FillRectangle($bgBrush, 2, 2, 28, 28)
$g.DrawRectangle($borderPen, 2, 2, 27, 27)
$g.FillRectangle($keyBrush1, 7, 7, 7, 7)
$g.FillRectangle($keyBrush2, 18, 7, 7, 7)
$g.FillRectangle($keyBrush1, 7, 18, 7, 7)
$g.FillRectangle($keyBrush1, 18, 18, 7, 7)
$g.Dispose()

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$tray.Text = "Pocket Deck v2.5 无线宏键盘运行中 (双击打开扫码)"
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itemOpen = $menu.Items.Add("🎛️ 打开主控台与手机扫码页")
$itemDrops = $menu.Items.Add("📂 打开快传与截图目录 (drops)")
$menu.Items.Add("-") | Out-Null
$itemExit = $menu.Items.Add("❌ 退出 Pocket Deck")
$tray.ContextMenuStrip = $menu

$itemOpen.Add_Click({ Start-Process $url })
$itemDrops.Add_Click({
  $dropsPath = Join-Path $rootDir "drops"
  if (!(Test-Path $dropsPath)) { New-Item -ItemType Directory -Path $dropsPath | Out-Null }
  Start-Process "explorer.exe" -ArgumentList "`"$dropsPath`""
})
$tray.Add_DoubleClick({ Start-Process $url })

$cleanup = {
  $tray.Visible = $false
  $tray.Dispose()
  if ($null -ne $nodeProc -and !$nodeProc.HasExited) {
    try { $nodeProc.Kill($true) } catch { try { $nodeProc.Kill() } catch {} }
  }
  [System.Windows.Forms.Application]::Exit()
}
$itemExit.Add_Click($cleanup)

Start-Sleep -Milliseconds 650
Start-Process $url
$tray.ShowBalloonTip(2500, "Pocket Deck 已启动", "手机连同一 Wi-Fi 扫描网页二维码即可秒变无线宏键盘！右键右下角图标可随时打开或退出。", [System.Windows.Forms.ToolTipIcon]::Info)

# Auto-exit tray if node process unexpectedly terminates
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
  if ($null -ne $nodeProc -and $nodeProc.HasExited) {
    $timer.Stop()
    & $cleanup
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
