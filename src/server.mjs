import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderQrSvg } from './qr.mjs';
import { PcTelemetry } from './telemetry.mjs';
import { WinBridge } from './winControl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, 'ui');

export const DEFAULT_MACROS = [
  { id: 'mute', icon: '🔇', label: '静音切换', sub: 'System Mute', color: '#ef4444', actionType: 'vk', value: 'media_mute' },
  { id: 'vol_down', icon: '🔉', label: '音量 -', sub: 'Volume Down', color: '#38bdf8', actionType: 'vk', value: 'vol_down' },
  { id: 'vol_up', icon: '🔊', label: '音量 +', sub: 'Volume Up', color: '#38bdf8', actionType: 'vk', value: 'vol_up' },
  { id: 'play_pause', icon: '⏯️', label: '播放 / 暂停', sub: 'Media Play', color: '#22c55e', actionType: 'vk', value: 'media_play_pause' },
  { id: 'next_track', icon: '⏭️', label: '切下一首', sub: 'Next Track', color: '#a855f7', actionType: 'vk', value: 'media_next' },
  { id: 'screenshot', icon: '📸', label: '电脑截屏传手机', sub: 'Grab PC Screen', color: '#f59e0b', actionType: 'screenshot', value: '' },
  { id: 'boss_key', icon: '🧹', label: '老板键回桌面', sub: 'Win + D', color: '#06b6d4', actionType: 'show_desktop', value: '' },
  { id: 'open_term', icon: '💻', label: '打开终端', sub: 'PowerShell', color: '#6366f1', actionType: 'open_app', value: 'terminal' },
  { id: 'open_drops', icon: '📂', label: '打开快传目录', sub: 'Drops Folder', color: '#eab308', actionType: 'open_app', value: 'explorer_drops' },
  { id: 'task_mgr', icon: '📊', label: '任务管理器', sub: 'Task Manager', color: '#ec4899', actionType: 'open_app', value: 'taskmgr' },
  { id: 'github', icon: '🐙', label: '我的 GitHub', sub: 'dyc19991225', color: '#8b5cf6', actionType: 'open_url', value: 'https://github.com/dyc19991225' },
  { id: 'lock_pc', icon: '🔒', label: '一键锁屏', sub: '双击防误触', color: '#64748b', actionType: 'lock_pc', value: '', confirmRequired: true },
];

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

export function createPocketDeckServer(opts = {}) {
  const rootDir = opts.rootDir || process.cwd();
  const workspaceDir = opts.workspaceDir || path.dirname(rootDir);
  const stateDir = path.join(rootDir, '.pocket-deck');
  const dropsDir = path.join(rootDir, 'drops');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(dropsDir, { recursive: true });

  // Load or generate persistent 6-digit pairing PIN
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

  // Load or seed macros
  const macrosFile = path.join(stateDir, 'macros.json');
  let macros = [...DEFAULT_MACROS];
  if (fs.existsSync(macrosFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(macrosFile, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) macros = parsed;
    } catch {
      macros = [...DEFAULT_MACROS];
    }
  } else {
    fs.writeFileSync(macrosFile, JSON.stringify(macros, null, 2));
  }

  const saveMacros = () => fs.writeFileSync(macrosFile, JSON.stringify(macros, null, 2));

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

  const interval = setInterval(() => {
    if (sseClients.size > 0) {
      broadcast('telemetry', telemetry.sampleFast());
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

      // QR scan auto-cookie pairing redirect (`/?pin=123456`)
      if (pathname === '/' && urlObj.searchParams.get('pin') === pairPin) {
        res.writeHead(302, {
          'Set-Cookie': `pd_pin=${pairPin}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`,
          Location: '/?deck=1',
        });
        res.end();
        return;
      }

      // Pairing PIN endpoint (accessible before auth)
      if (pathname === '/api/pair' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (String(body.pin || '').trim() === pairPin) {
          pushLog('📱 新移动设备已通过 PIN 配对连接！', 'pair');
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

      // Bootstrap info (if unauthorized LAN device, return locked state without sensitive info)
      if (pathname === '/api/bootstrap' && req.method === 'GET') {
        const port = server.address()?.port || opts.port || 4799;
        const snap = telemetry.sampleFast();
        if (!authed) {
          sendJson(res, 200, { authorized: false, hostname: snap.hostname });
          return;
        }
        const pairUrl = `http://${snap.lanIp}:${port}/?pin=${pairPin}`;
        sendJson(res, 200, {
          authorized: true,
          isLocalhost: local,
          pairPin,
          pairUrl,
          qrSvg: renderQrSvg(pairUrl),
          macros,
          drops: listDrops(),
          logs: recentLogs,
          telemetry: snap,
        });
        return;
      }

      // Gate all other /api/* and /drops/* routes behind auth!
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
        res.write(`event: telemetry\ndata: ${JSON.stringify(telemetry.sampleFast())}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (pathname === '/api/trigger' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const macro = macros.find((m) => m.id === body.id);
        if (!macro) {
          sendJson(res, 404, { ok: false, error: '未找到该按钮' });
          return;
        }
        const out = await win.executeMacro(macro);
        pushLog(`${macro.icon} ${out.message}`, local ? 'PC' : 'Phone');
        if (out.fileUrl) {
          broadcast('drops', listDrops());
        }
        sendJson(res, 200, { ...out, drops: out.fileUrl ? listDrops() : undefined });
        return;
      }

      if (pathname === '/api/macros' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const item = {
          id: body.id || `custom_${Date.now().toString(36)}`,
          icon: String(body.icon || '⚡').slice(0, 4),
          label: String(body.label || '快捷指令').slice(0, 18),
          sub: String(body.sub || body.actionType || '').slice(0, 22),
          color: /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#38bdf8',
          actionType: String(body.actionType || 'vk'),
          value: String(body.value || ''),
          confirmRequired: Boolean(body.confirmRequired),
        };
        const idx = macros.findIndex((m) => m.id === item.id);
        if (idx >= 0) macros[idx] = item;
        else macros.push(item);
        saveMacros();
        broadcast('macros', macros);
        pushLog(`✨ 新增自定义按键：${item.icon} ${item.label}`);
        sendJson(res, 200, { ok: true, macros });
        return;
      }

      if (pathname === '/api/macros/reset' && req.method === 'POST') {
        macros = [...DEFAULT_MACROS];
        saveMacros();
        broadcast('macros', macros);
        sendJson(res, 200, { ok: true, macros });
        return;
      }

      if (pathname.startsWith('/api/macros/') && req.method === 'DELETE') {
        const targetId = decodeURIComponent(pathname.slice('/api/macros/'.length));
        macros = macros.filter((m) => m.id !== targetId);
        saveMacros();
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
        pushLog(`📋 已同步剪贴板 (${String(body.text || '').length} 字符)`, local ? 'PC' : 'Phone');
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
          'Content-Disposition': `inline; filename="${encodeURIComponent(reqFile)}"`,
        });
        fs.createReadStream(full).pipe(res);
        return;
      }

      // Serve Static UI
      const uiTarget = pathname === '/' ? 'index.html' : pathname.slice(1);
      const safeUiPath = path.normalize(path.join(UI_DIR, uiTarget));
      if (!safeUiPath.startsWith(UI_DIR) || !fs.existsSync(safeUiPath) || !fs.statSync(safeUiPath).isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(safeUiPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain; charset=utf-8' });
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

  return { server, closeAll, pairPin, telemetry };
}
