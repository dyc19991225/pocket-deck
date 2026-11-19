import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderQrSvg } from './qr.mjs';
import { PcTelemetry } from './telemetry.mjs';
import { WinBridge } from './winControl.mjs';
import { DEFAULT_MACROS, DECK_PROFILES, DECK_THEMES } from './presets.mjs';
import { verifyLicenseKey, loadShopConfig } from './license.mjs';
import { MERCHANT_PUBLIC_KEY_PEM } from './licensePublicKey.mjs';

export { DEFAULT_MACROS, DECK_PROFILES, DECK_THEMES };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, 'ui');
const PROFILE_STORE_VERSION = 3;
const FREE_CUSTOM_MACRO_LIMIT = 2;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function isLoopback(addr = '') {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function parseCookies(cookieHeader = '') {
  const out = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function readJsonBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    req.on('data', (c) => {
      len += c.length;
      if (len > maxBytes) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function cloneDefaultProfiles() {
  const map = {};
  for (const p of DECK_PROFILES) {
    map[p.id] = p.defaults.map((item) => ({ ...item }));
  }
  return map;
}

export function createPocketDeckServer(opts = {}) {
  const rootDir = opts.rootDir || process.cwd();
  const workspaceDir = opts.workspaceDir || path.dirname(rootDir);
  const publicKeyPem = opts.publicKeyPem || MERCHANT_PUBLIC_KEY_PEM;
  const stateDir = path.join(rootDir, '.pocket-deck');
  const dropsDir = path.join(rootDir, 'drops');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(dropsDir, { recursive: true });

  // 1. Pairing PIN
  const pinFile = path.join(stateDir, 'pair.json');
  let pairPin = opts.pin || '';
  if (!pairPin && fs.existsSync(pinFile)) {
    try {
      pairPin = JSON.parse(fs.readFileSync(pinFile, 'utf8')).pin;
    } catch {
      pairPin = '';
    }
  }
  if (!pairPin) {
    pairPin = String(crypto.randomInt(100000, 999999));
    fs.writeFileSync(pinFile, JSON.stringify({ pin: pairPin }, null, 2));
  }

  // 2. Cryptographic Offline License State
  const licenseFile = path.join(stateDir, 'license.json');
  let licenseState = { valid: false, isPro: false, tier: 'free', tierLabel: '免费体验版', serial: '', issuedAt: '' };
  if (fs.existsSync(licenseFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(licenseFile, 'utf8'));
      const ver = verifyLicenseKey(saved?.key || '', publicKeyPem);
      if (ver.valid) licenseState = ver;
    } catch {
      // ignore invalid license file
    }
  }

  const getLicensePayload = () => ({
    isPro: Boolean(licenseState.isPro),
    tier: licenseState.isPro ? licenseState.tier : 'free',
    tierLabel: licenseState.isPro ? licenseState.tierLabel : '免费体验版',
    serial: licenseState.serial || '',
    issuedAt: licenseState.issuedAt || '',
    freeCustomLimit: FREE_CUSTOM_MACRO_LIMIT,
    shop: loadShopConfig(rootDir),
  });

  // 3. Multi-Profile Macros & Theme Store (backward-compatible with v2 macros.json)
  const profilesFile = path.join(stateDir, 'profiles.json');
  const legacyMacrosFile = path.join(stateDir, 'macros.json');
  let store = {
    version: PROFILE_STORE_VERSION,
    activeProfile: 'standard',
    activeTheme: 'cyber_blue',
    profiles: cloneDefaultProfiles(),
  };

  if (fs.existsSync(profilesFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(profilesFile, 'utf8'));
      if (parsed && parsed.version === PROFILE_STORE_VERSION && parsed.profiles) {
        store = {
          version: PROFILE_STORE_VERSION,
          activeProfile: parsed.activeProfile || 'standard',
          activeTheme: parsed.activeTheme || 'cyber_blue',
          profiles: { ...cloneDefaultProfiles(), ...parsed.profiles },
        };
      }
    } catch {
      // keep defaults
    }
  } else if (fs.existsSync(legacyMacrosFile)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyMacrosFile, 'utf8'));
      if (legacy && Array.isArray(legacy.items) && legacy.items.length > 0) {
        store.profiles.standard = legacy.items;
      }
    } catch {
      // ignore
    }
  }

  // Enforce Pro gates on startup if not activated
  if (!licenseState.isPro) {
    const profMeta = DECK_PROFILES.find((p) => p.id === store.activeProfile);
    if (!profMeta || profMeta.proOnly) store.activeProfile = 'standard';
    const themeMeta = DECK_THEMES.find((t) => t.id === store.activeTheme);
    if (!themeMeta || themeMeta.proOnly) store.activeTheme = 'cyber_blue';
  }

  const saveStore = () => {
    fs.writeFileSync(profilesFile, JSON.stringify(store, null, 2));
  };
  saveStore();

  const getActiveMacros = () => store.profiles[store.activeProfile] || store.profiles.standard;
  const getProfileMetaList = () =>
    DECK_PROFILES.map(({ id, name, badge, proOnly, desc, defaults }) => ({
      id,
      name,
      badge,
      proOnly,
      desc,
      builtinIds: defaults.map((d) => d.id),
    }));

  const telemetry = new PcTelemetry();
  const win = new WinBridge({ dropsDir, workspaceDir, dryRun: Boolean(opts.dryRun) });
  const sseClients = new Set();
  const recentLogs = [];

  const listDrops = () => {
    const files = fs.readdirSync(dropsDir);
    return files
      .map((name) => {
        const st = fs.statSync(path.join(dropsDir, name));
        if (!st.isFile()) return null;
        return {
          name,
          sizeKb: Math.max(1, Math.round(st.size / 1024)),
          mtime: st.mtimeMs,
          url: `/drops/${encodeURIComponent(name)}`,
          isImage: /\.(png|jpe?g|gif|webp|svg)$/i.test(name),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 30);
  };

  const broadcast = (event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  };

  const pushLog = (msg, source = 'deck') => {
    const entry = { time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), msg, source };
    recentLogs.unshift(entry);
    if (recentLogs.length > 25) recentLogs.pop();
    broadcast('log', entry);
  };

  const interval = setInterval(async () => {
    if (sseClients.size > 0) {
      const audio = await win.getAudioState();
      broadcast('telemetry', { ...telemetry.sampleFast(), audio });
    }
  }, 1500);
  interval.unref?.();

  const checkAuth = (req, urlObj) => {
    if (isLoopback(req.socket.remoteAddress)) return true;
    const qPin = urlObj.searchParams.get('pin');
    if (qPin && qPin === pairPin) return true;
    const hPin = req.headers['x-deck-pin'];
    if (hPin && hPin === pairPin) return true;
    const cookies = parseCookies(req.headers.cookie || '');
    return cookies.pd_pin === pairPin;
  };

  const sendJson = (res, status, obj, extraHeaders = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
    res.end(JSON.stringify(obj));
  };

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = urlObj.pathname;
      const local = isLoopback(req.socket.remoteAddress);
      const authed = checkAuth(req, urlObj);

      if (pathname === '/' && urlObj.searchParams.get('pin') === pairPin) {
        res.writeHead(302, {
          'Set-Cookie': `pd_pin=${pairPin}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`,
          Location: '/?deck=1',
        });
        res.end();
        return;
      }

      if (pathname === '/api/pair' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (String(body.pin || '').trim() === pairPin) {
          pushLog('📱 移动设备配对成功！', 'pair');
          sendJson(
            res,
            200,
            { ok: true },
            { 'Set-Cookie': `pd_pin=${pairPin}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax` }
          );
        } else {
          sendJson(res, 401, { ok: false, error: '配对码错误，请核对电脑端显示的 6 位数字' });
        }
        return;
      }

      if (pathname === '/api/bootstrap' && req.method === 'GET') {
        const port = server.address()?.port || opts.port || 4799;
        const snap = telemetry.sampleFast();
        if (!authed) {
          sendJson(res, 200, { authorized: false, hostname: snap.hostname });
          return;
        }
        const [audio, autostart] = await Promise.all([win.getAudioState(), win.getAutostartStatus()]);
        const pairUrl = `http://${snap.lanIp}:${port}/?pin=${pairPin}`;
        sendJson(res, 200, {
          authorized: true,
          isLocalhost: local,
          pairPin,
          pairUrl,
          qrSvg: renderQrSvg(pairUrl),
          activeProfile: store.activeProfile,
          profiles: getProfileMetaList(),
          activeTheme: store.activeTheme,
          themes: DECK_THEMES,
          license: getLicensePayload(),
          autostart,
          macros: getActiveMacros(),
          drops: listDrops(),
          logs: recentLogs,
          telemetry: { ...snap, audio },
        });
        return;
      }

      if (pathname.startsWith('/api/') || pathname.startsWith('/drops/')) {
        if (!authed) {
          sendJson(res, 401, { ok: false, error: '未配对授权，请先扫码或输入 6 位配对码' });
          return;
        }
      }

      if (pathname === '/api/stream' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const audio = await win.getAudioState();
        res.write(`event: telemetry\ndata: ${JSON.stringify({ ...telemetry.sampleFast(), audio })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      // License Activation & Status Endpoints
      if (pathname === '/api/license' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, license: getLicensePayload() });
        return;
      }

      if (pathname === '/api/license/activate' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const rawKey = String(body.key || '').trim();
        const ver = verifyLicenseKey(rawKey, publicKeyPem);
        if (!ver.valid) {
          sendJson(res, 400, { ok: false, error: ver.error });
          return;
        }
        licenseState = ver;
        fs.writeFileSync(licenseFile, JSON.stringify({ key: rawKey, activatedAt: new Date().toISOString() }, null, 2));
        const licPayload = getLicensePayload();
        broadcast('license', licPayload);
        pushLog(`👑 已成功激活 ${ver.tierLabel} (${ver.serial})！全部专业面板与主题已解锁`, 'pro');
        sendJson(res, 200, { ok: true, license: licPayload });
        return;
      }

      // Switch Macro Profile (Standard / Jianying / Streamer / Office)
      if (pathname === '/api/profile' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const target = DECK_PROFILES.find((p) => p.id === body.profileId);
        if (!target) {
          sendJson(res, 404, { ok: false, error: '未找到该预设面板' });
          return;
        }
        if (target.proOnly && !licenseState.isPro) {
          sendJson(res, 402, {
            ok: false,
            code: 'PRO_REQUIRED',
            error: `「${target.name}」为 Pro 专业版专属预设，输入激活码即可永久解锁！`,
          });
          return;
        }
        store.activeProfile = target.id;
        if (!Array.isArray(store.profiles[target.id])) {
          store.profiles[target.id] = target.defaults.map((x) => ({ ...x }));
        }
        saveStore();
        const macros = getActiveMacros();
        broadcast('profile', { activeProfile: store.activeProfile, macros });
        pushLog(`🎛️ 已切换宏面板：${target.name}`, local ? 'PC' : 'Phone');
        sendJson(res, 200, { ok: true, activeProfile: store.activeProfile, macros });
        return;
      }

      // Switch Cyber Theme
      if (pathname === '/api/theme' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const theme = DECK_THEMES.find((t) => t.id === body.themeId);
        if (!theme) {
          sendJson(res, 404, { ok: false, error: '未找到该主题' });
          return;
        }
        if (theme.proOnly && !licenseState.isPro) {
          sendJson(res, 402, {
            ok: false,
            code: 'PRO_REQUIRED',
            error: `「${theme.name}」为 Pro 专属桌搭主题，激活 Pro 即可永久使用！`,
          });
          return;
        }
        store.activeTheme = theme.id;
        saveStore();
        broadcast('theme', { activeTheme: store.activeTheme });
        pushLog(`🎨 已切换桌搭背光主题：${theme.name}`, local ? 'PC' : 'Phone');
        sendJson(res, 200, { ok: true, activeTheme: store.activeTheme });
        return;
      }

      // Toggle Windows Silent Startup
      if (pathname === '/api/autostart' && req.method === 'POST') {
        if (!licenseState.isPro) {
          sendJson(res, 402, {
            ok: false,
            code: 'PRO_REQUIRED',
            error: 'Windows 开机静默自启为 Pro 专业版专属功能！',
          });
          return;
        }
        const body = await readJsonBody(req);
        const launcherPath = path.join(rootDir, '启动-PocketDeck静默托盘版.vbs');
        const out = await win.setAutostart(Boolean(body.enabled), launcherPath);
        if (!out.ok) {
          sendJson(res, 500, { ok: false, error: out.error || '设置开机自启失败' });
          return;
        }
        broadcast('autostart', { autostart: out.enabled });
        pushLog(out.enabled ? '🚀 已开启 Windows 开机静默自启' : '⏸️ 已关闭开机自启', 'PC');
        sendJson(res, 200, { ok: true, autostart: out.enabled });
        return;
      }

      if (pathname === '/api/audio' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const out = await win.setVolume(body.vol);
        broadcast('audio', out.audio);
        sendJson(res, 200, out);
        return;
      }

      if (pathname === '/api/trigger' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const macros = getActiveMacros();
        const macro = macros.find((m) => m.id === body.id);
        if (!macro) {
          sendJson(res, 404, { ok: false, error: '未找到该按钮' });
          return;
        }
        const out = await win.executeMacro(macro);
        if (out.ok) {
          pushLog(`[${local ? '电脑' : '手机'}] ${out.message}`, local ? 'PC' : 'Phone');
        } else {
          pushLog(`❌ 执行失败 (${macro.label}): ${out.error}`, 'err');
        }
        if (out.audio) broadcast('audio', out.audio);
        const drops = out.fileUrl ? listDrops() : undefined;
        if (drops) broadcast('drops', drops);
        sendJson(res, 200, { ...out, drops });
        return;
      }

      if (pathname === '/api/macros' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const macros = getActiveMacros();
        const item = {
          id: body.id || `custom_${Date.now().toString(36)}`,
          icon: String(body.icon || '⚡').slice(0, 4),
          label: String(body.label || '快捷指令').slice(0, 18),
          sub: String(body.sub || body.value || body.actionType || '').slice(0, 22),
          color: /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#38bdf8',
          actionType: String(body.actionType || 'open_url'),
          value: String(body.value || ''),
          confirmRequired: Boolean(body.confirmRequired),
        };
        const idx = macros.findIndex((m) => m.id === item.id);

        // Enforce Free Tier custom macro limit (exclude internal temporary helper IDs starting with _tmp_)
        if (idx < 0 && !item.id.startsWith('_tmp_') && !licenseState.isPro) {
          const profMeta = DECK_PROFILES.find((p) => p.id === store.activeProfile) || DECK_PROFILES[0];
          const builtinSet = new Set(profMeta.defaults.map((d) => d.id));
          const customCount = macros.filter((m) => !builtinSet.has(m.id) && !m.id.startsWith('_tmp_')).length;
          if (customCount >= FREE_CUSTOM_MACRO_LIMIT) {
            sendJson(res, 402, {
              ok: false,
              code: 'PRO_REQUIRED',
              error: `免费体验版最多添加 ${FREE_CUSTOM_MACRO_LIMIT} 个自定义键，激活 Pro 版即可解锁无限制自定义与剪映/直播专业面板！`,
            });
            return;
          }
        }

        if (idx >= 0) macros[idx] = item;
        else macros.push(item);
        saveStore();
        broadcast('macros', macros);
        if (!item.id.startsWith('_tmp_')) {
          pushLog(`✨ 新增自定义按键：${item.icon} ${item.label}`);
        }
        sendJson(res, 200, { ok: true, macros });
        return;
      }

      if (pathname === '/api/macros/reset' && req.method === 'POST') {
        const profMeta = DECK_PROFILES.find((p) => p.id === store.activeProfile) || DECK_PROFILES[0];
        store.profiles[store.activeProfile] = profMeta.defaults.map((x) => ({ ...x }));
        saveStore();
        const macros = getActiveMacros();
        broadcast('macros', macros);
        sendJson(res, 200, { ok: true, macros });
        return;
      }

      if (pathname.startsWith('/api/macros/') && req.method === 'DELETE') {
        const targetId = decodeURIComponent(pathname.slice('/api/macros/'.length));
        store.profiles[store.activeProfile] = getActiveMacros().filter((m) => m.id !== targetId);
        saveStore();
        const macros = getActiveMacros();
        broadcast('macros', macros);
        sendJson(res, 200, { ok: true, macros });
        return;
      }

      if (pathname === '/api/clipboard' && req.method === 'GET') {
        const text = await win.getClipboard();
        sendJson(res, 200, { ok: true, text });
        return;
      }

      if (pathname === '/api/clipboard' && req.method === 'POST') {
        const body = await readJsonBody(req);
        await win.setClipboard(String(body.text || ''));
        pushLog(`📋 已同步电脑剪贴板 (${String(body.text || '').length} 字符)`, local ? 'PC' : 'Phone');
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/trackpad' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (body.op === 'move') {
          win.sendFast({ op: 'move', dx: Math.round(Number(body.dx) || 0), dy: Math.round(Number(body.dy) || 0) });
        } else if (body.op === 'click') {
          win.sendFast({ op: 'click', btn: body.btn === 'right' ? 'right' : 'left' });
        } else if (body.op === 'scroll') {
          win.sendFast({ op: 'scroll', delta: Math.round(Number(body.delta) || 0) });
        } else if (body.op === 'vk') {
          await win.executeMacro({ label: body.value, actionType: 'vk', value: body.value });
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/drop' && req.method === 'POST') {
        const rawHeader = decodeURIComponent(String(req.headers['x-file-name'] || `drop-${Date.now()}.bin`));
        const cleanBase = path.basename(rawHeader).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || `drop-${Date.now()}.bin`;
        const finalName = `${Date.now().toString(36)}-${cleanBase}`;
        const dest = path.join(dropsDir, finalName);

        let bytes = 0;
        const MAX_DROP = 120 * 1024 * 1024;
        const ws = fs.createWriteStream(dest);
        req.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_DROP) {
            req.destroy();
            ws.destroy();
            try { fs.unlinkSync(dest); } catch {}
          }
        });
        req.pipe(ws);
        ws.on('finish', () => {
          const drops = listDrops();
          broadcast('drops', drops);
          pushLog(`⚡ 收到快传文件：${cleanBase} (${Math.max(1, Math.round(bytes / 1024))} KB)`, local ? 'PC' : 'Phone');
          sendJson(res, 200, { ok: true, drops });
        });
        ws.on('error', () => sendJson(res, 500, { ok: false, error: '写入文件失败' }));
        return;
      }

      if (pathname.startsWith('/drops/') && req.method === 'GET') {
        const reqFile = path.basename(decodeURIComponent(pathname.slice('/drops/'.length)));
        const full = path.join(dropsDir, reqFile);
        if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(full).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(full).pipe(res);
        return;
      }

      const uiTarget = pathname === '/' ? 'index.html' : pathname.slice(1);
      const safeUiPath = path.normalize(path.join(UI_DIR, uiTarget));
      if (!safeUiPath.startsWith(UI_DIR) || !fs.existsSync(safeUiPath) || !fs.statSync(safeUiPath).isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(safeUiPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      fs.createReadStream(safeUiPath).pipe(res);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err?.message || 'Internal error' });
    }
  });

  const closeAll = () => {
    clearInterval(interval);
    for (const c of sseClients) {
      try { c.end(); } catch {}
    }
    sseClients.clear();
    win.close();
    return new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, closeAll, pairPin, telemetry, win };
}
