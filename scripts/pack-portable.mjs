#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const releaseRoot = path.join(rootDir, 'release');
const bundleName = 'PocketDeck-Pro-Win64免安装版';
const stageDir = path.join(releaseRoot, bundleName);
const zipPath = path.join(releaseRoot, `${bundleName}.zip`);

console.log('📦 正在构建国内免安装绿色发行包 (内置官方签名 Node 运行时，用户免装环境)...');

fs.rmSync(stageDir, { recursive: true, force: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

fs.mkdirSync(path.join(stageDir, 'bin'), { recursive: true });
fs.mkdirSync(path.join(stageDir, 'src', 'ui'), { recursive: true });
fs.mkdirSync(path.join(stageDir, 'runtime'), { recursive: true });
fs.mkdirSync(path.join(stageDir, 'drops'), { recursive: true });

// 1. Copy client entry ONLY (strictly exclude bin/keygen.mjs & .pocket-deck-secret!)
fs.copyFileSync(path.join(rootDir, 'bin', 'pocket-deck.mjs'), path.join(stageDir, 'bin', 'pocket-deck.mjs'));

// 2. Copy src files
for (const file of fs.readdirSync(path.join(rootDir, 'src'))) {
  const full = path.join(rootDir, 'src', file);
  if (fs.statSync(full).isFile()) {
    fs.copyFileSync(full, path.join(stageDir, 'src', file));
  }
}
for (const file of fs.readdirSync(path.join(rootDir, 'src', 'ui'))) {
  const full = path.join(rootDir, 'src', 'ui', file);
  if (fs.statSync(full).isFile()) {
    fs.copyFileSync(full, path.join(stageDir, 'src', 'ui', file));
  }
}

// 3. Copy package metadata, shop config & launchers
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(stageDir, 'package.json'));
fs.copyFileSync(path.join(rootDir, 'shop-config.json'), path.join(stageDir, 'shop-config.json'));
fs.copyFileSync(path.join(rootDir, '启动-PocketDeck静默托盘版.vbs'), path.join(stageDir, '启动-PocketDeck静默托盘版.vbs'));
fs.copyFileSync(path.join(rootDir, 'start-pocket-deck.bat'), path.join(stageDir, '备用控制台启动.bat'));

// 4. Write foolproof Chinese buyer quickstart guide
const buyerGuide = [
  '================================================================',
  '  🎛️ Pocket Deck Pro v2.5 — 手机/平板秒变无线宏键盘 & 赛博性能副屏',
  '================================================================',
  '',
  '【1. 怎么启动？（免装任何环境）】',
  '  👉 直接双击文件夹里的【启动-PocketDeck静默托盘版.vbs】即可！',
  '  - 电脑浏览器会自动弹出扫码控制台，同时电脑右下角托盘会出现蓝金小图标。',
  '  - 若首次弹出 Windows 防火墙提示，请务必勾选【专用网络 + 公用网络】并点击【允许访问】，否则手机连不上电脑。',
  '',
  '【2. 手机 / 平板怎么连？】',
  '  - 确保手机与电脑连在【同一个路由器 Wi-Fi】（或电脑开热点给手机连）。',
  '  - 打开手机系统相机 / 浏览器扫一扫电脑屏幕右侧二维码，免装 App 秒连！',
  '  - 技巧：在手机 Safari / Chrome 点击「添加到主屏幕」，即可全屏沉浸作为桌面副屏！',
  '',
  '【3. 怎么激活 Pro 专业买断版？】',
  '  - 点击页面右上角金色【👑 解锁 Pro】按钮；',
  '  - 粘贴您在闲鱼 / 面包多获取的 PDPRO-... 激活码，点击【立即验证】即可永久解锁：',
  '    ✅ 剪映 / PR 专属 15 键剪辑台（底层硬件热键，开着中文输入法也能秒分割/删气口！）',
  '    ✅ OBS 直播录屏导播台 & 打工人双虚拟桌面办公摸鱼台',
  '    ✅ 初号机紫 / 黑金暖光 / 黑客绿 4 套桌搭背光皮肤 + 无限自定义按键',
  '    ✅ Windows 开机静默自启',
  '',
  '【4. 如何彻底退出？】',
  '  - 右键点击电脑屏幕右下角托盘里的 Pocket Deck 图标 -> 点击【❌ 退出 Pocket Deck】。',
  '',
].join('\r\n');
fs.writeFileSync(path.join(stageDir, '必看-3秒上手使用说明.txt'), buyerGuide, 'utf8');

// 5. Bundle official signed node.exe runtime
fs.copyFileSync(process.execPath, path.join(stageDir, 'runtime', 'node.exe'));

// 6. Verify no merchant private key leaked into stageDir
if (fs.existsSync(path.join(stageDir, '.pocket-deck-secret')) || fs.existsSync(path.join(stageDir, 'bin', 'keygen.mjs'))) {
  throw new Error('SECURITY ABORT: Secret files detected in release staging directory!');
}

// 7. Create .zip archive on Windows
if (process.platform === 'win32') {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${stageDir}' -DestinationPath '${zipPath}' -CompressionLevel Optimal -Force`,
    ],
    { stdio: 'inherit' }
  );
  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`\n✅ 打包完成！`);
  console.log(`📁 免安装绿色目录 : ${stageDir}`);
  console.log(`🗜️ 网盘/发卡压缩包: ${zipPath} (${sizeMb} MB)`);
}
