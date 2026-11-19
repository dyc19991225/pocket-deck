<p align="center">
  <img src="docs/readme/hero-cockpit.png" width="920" alt="Pocket Deck v2.5 — Wireless Stream Deck Macro Pad, Jianying/PR Studio & PC Hardware Telemetry Hub" />
</p>

# Pocket Deck 🎛️📱（手机/平板秒变电脑无线宏键盘 · 剪映PR神速剪辑台 · 性能副屏 · 局域网秒传）

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node Version" />
  <img src="https://img.shields.io/badge/dependencies-0%20npm%20deps-blue.svg" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d4.svg" alt="Windows 10/11" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License" />
</p>

**零外部依赖 (`0 npm dependencies`) · 纯原生 Node.js + Win32 低延迟桥接 · 手机扫码免装 App 秒连！**

不用花 ¥1,000+ 买实体 Stream Deck！只要一台吃灰的旧手机、iPad 或安卓平板，用系统相机扫一扫屏幕二维码，立刻解锁全套桌面效率神器：

1. **🎛️ 拟物 3D OLED 宏键盘 (`Stream Deck MK.2`)**：15 键电容触感布局、Windows CoreAudio 物理主音量推子、静音切换、切歌暂停、老板键回桌面，自带清脆 **Cherry-MX 机械轴合成音效 + 手机马达振动反馈**，支持自由新增自定义按键！
2. **🎬 剪映 / Premiere Pro 剪辑师专属神速台**：Win32 底层硬件扫描码（Hardware Scan-Code Chord）触发，**彻底无视中文输入法干扰**！开着拼音输入法也绝不卡键，一键分割素材 (`Ctrl+B`)、波纹删前段气口 (`Q`)、删后段废话 (`W`)、打节奏标记 (`M`)、一键导出成片 (`Ctrl+E`)。
3. **🎙️ OBS 直播导播台 & 🐟 办公提效摸鱼台**：一键抓拍前 30 秒高光 (`Win+Alt+G`)、系统录屏 (`Win+Alt+R`)、会议紧急闭麦、**双虚拟桌面秒切隐身 (`Ctrl+Win+←/→`)**、秒唤微信 (`Ctrl+Alt+W`)、系统剪贴板历史 (`Win+V`)。
4. **📊 实时硬件性能副屏 (`Live Telemetry`)**：基于 SSE 毫秒级推送 **CPU 每核心实时负载柱状矩阵、内存趋势波形图、系统盘空间与占用 Top 5 进程**，横放显示器下方秒变赛博副屏！
5. **⚡ 局域网零流量双向秒传舱 (`AirDrop & Clipboard`)**：
   - **剪贴板互传**：手机复制的文字/链接一键塞进电脑剪贴板直接 `Ctrl+V`，也可一键拉取电脑当前剪贴板；
   - **局域网高速传图 + 电脑全屏截图**：零云端、不走外网流量，手机相册原图秒传电脑 `drops/` 目录，也可在手机上一键抓取电脑当前屏幕。
6. **🖱️ 沙发/床上无线触控板 (`Wireless Trackpad & PPT`)**：原生 Win32 低延迟桥接（`< 5ms`），单指滑动控制鼠标光标、双指滚轮上下翻页、PPT 全屏放映翻页笔，躺在床上也能遥控电脑看剧！
7. **🎨 4 套客制化桌搭背光皮肤**：深空赛博蓝、初号机霓虹紫、黑金客制化暖光、黑客终端荧光绿，随心秒切桌搭氛围。
8. **🚀 Windows 系统托盘静默自启**：双击 `启动-PocketDeck静默托盘版.vbs`，自动隐藏控制台黑框，并在任务栏右下角常驻蓝金小图标，开机即用。

---

## ⚡ 快速开始

### 方式 1：直接运行免安装发行包（小白推荐 · 免装任何环境）

前往 [Releases 页面](https://github.com/dyc19991225/pocket-deck/releases) 下载最新版的 `PocketDeck-Pro-Win64免安装版.zip`：
1. 解压到任意目录；
2. 双击 `启动-PocketDeck静默托盘版.vbs`；
3. 电脑会自动弹出主控台，手机与电脑连同一 Wi-Fi，用相机扫码即可秒连！

---

### 方式 2：从源码运行（开发者推荐）

```bash
# 1. 克隆代码仓库
git clone https://github.com/dyc19991225/pocket-deck.git
cd pocket-deck

# 2. 运行自动化测试（全套 5 项通过）
npm test

# 3. 启动本地服务（默认端口 4799）
npm start
```

启动后在电脑浏览器打开 `http://127.0.0.1:4799/`，用手机或平板扫描页面右侧的 **原生 SVG 二维码**（内置 6 位安全动态 PIN 防蹭连）即可开始使用。

---

## 🛠️ 核心架构与技术亮点

- **0 npm dependencies**：全项目不依赖任何第三方 npm 包，全部基于 Node.js 原生标准库（`node:http`、`node:crypto`、`node:child_process`、`node:fs`）。
- **Win32 驻留式低延迟桥接 (`src/bridge.ps1`)**：长驻单个 STA 模式原生进程，通过管道接收 JSON 指令直接调用 Win32 C# `keybd_event`、`mouse_event` 与 CoreAudio COM 接口，延迟 `< 5ms`。
- **无感硬件组合键 (`SendChord`)**：直接按下并释放底层虚拟扫描码，彻底绕过 Windows 输入法（IME）的拼音拦截，剪片、录屏组合键百分百稳定生效。
- **Ed25519 离线签名鉴权 (`src/license.mjs`)**：商户专属非对称密钥对离线验签，支持本地授权分级与开机自启。
- **一键免安装绿色打包脚本 (`npm run pack:win`)**：单命令自动提取官方签名 Node 运行时，打包为即开即用的绿色便携目录和 Release zip 包。

---

## 🧪 运行自动化测试

```bash
npm test
```

测试套件涵盖：
- ✅ 原生 QR Code SVG 矩阵与寻像模式生成
- ✅ Ed25519 离线卡密生成、防篡改签名校验
- ✅ 硬件扫描码（Hardware Hotkey Chord）映射与解析
- ✅ Server 端 15 键宏面板、音量推子、双向剪贴板与全屏截屏 API
- ✅ 真实 Windows Bridge RPC 与 CoreAudio 系统音量往返通信

---

## License

[MIT](LICENSE) © dyc19991225
