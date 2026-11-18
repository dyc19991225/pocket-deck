// Procedural Cherry-MX Tactile Mechanical Keycap Audio Synth (Zero MP3!)
class KeySwitchAudio {
  constructor() {
    this.ctx = null;
  }
  click(accent = false) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(accent ? 1350 : 980, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.032);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

      osc.connect(g).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch {
      // ignore if audio blocked
    }
    if (navigator.vibrate) navigator.vibrate(accent ? [18, 25, 18] : 14);
  }
}

const keyAudio = new KeySwitchAudio();
const DEFAULT_IDS = new Set([
  'mute', 'vol_down', 'vol_up', 'play_pause', 'next_track', 'screenshot',
  'boss_key', 'open_term', 'open_drops', 'task_mgr', 'github', 'lock_pc',
]);

let macros = [];
let armedId = null;
let armedTimeout = null;
let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function drawSparkline(svgId, values, strokeHex, fillHex) {
  const svg = document.getElementById(svgId);
  if (!svg || !values || values.length < 2) return;
  const w = svg.viewBox.baseVal.width || 200;
  const h = svg.viewBox.baseVal.height || 44;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / 100) * (h - 6) - 3).toFixed(1)}`);
  const linePath = `M${pts.join(' L')}`;
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  svg.innerHTML = `
    <path d="${areaPath}" fill="${fillHex}" opacity="0.22"/>
    <path d="${linePath}" fill="none" stroke="${strokeHex}" stroke-width="2.2" stroke-linecap="round"/>
  `;
}

function renderMacros() {
  const grid = document.getElementById('keycap-grid');
  grid.innerHTML = macros
    .map((m) => {
      const customDel = !DEFAULT_IDS.has(m.id)
        ? `<button class="key-del" data-del="${m.id}" title="删除此自定义按钮">✕</button>`
        : '';
      return `
        <div class="keycap ${armedId === m.id ? 'armed' : ''}" style="--glow:${m.color || '#38bdf8'}" data-mid="${m.id}">
          ${customDel}
          <div class="key-icon">${m.icon}</div>
          <div class="key-label">${m.label}</div>
          <div class="key-sub">${armedId === m.id ? '⚠️ 再点一次确认' : (m.sub || '')}</div>
        </div>
      `;
    })
    .join('');

  grid.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.del;
      const res = await fetch(`/api/macros/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        macros = data.macros;
        renderMacros();
        showToast('🗑️ 已移除自定义按键');
      }
    });
  });

  grid.querySelectorAll('[data-mid]').forEach((card) => {
    card.addEventListener('click', async () => {
      const id = card.dataset.mid;
      const m = macros.find((x) => x.id === id);
      if (!m) return;

      if (m.confirmRequired && armedId !== id) {
        keyAudio.click(false);
        armedId = id;
        renderMacros();
        clearTimeout(armedTimeout);
        armedTimeout = setTimeout(() => {
          armedId = null;
          renderMacros();
        }, 3000);
        showToast('🔒 防误触保护：3 秒内再点一次确认执行！');
        return;
      }

      armedId = null;
      keyAudio.click(true);
      card.classList.add('pressing');
      setTimeout(() => card.classList.remove('pressing'), 140);

      const res = await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || `已执行：${m.label}`);
        if (data.drops) renderDrops(data.drops);
      } else {
        showToast(`❌ ${data.error || '执行失败'}`);
      }
      renderMacros();
    });
  });
}

function renderTelemetry(t) {
  if (!t) return;
  document.getElementById('host-sub').textContent = `${t.hostname} · LAN ${t.lanIp} · 运行 ${t.uptimeHrs}h`;
  document.getElementById('pill-cpu').textContent = `CPU ${t.cpuPct}%`;
  document.getElementById('pill-ram').textContent = `RAM ${t.ramPct}%`;

  document.getElementById('side-cpu-val').textContent = `${t.cpuPct}%`;
  document.getElementById('side-ram-val').textContent = `${t.ramUsedGb} / ${t.ramTotalGb}G`;
  drawSparkline('spark-cpu', t.cpuHistory, '#38bdf8', '#38bdf8');
  drawSparkline('spark-ram', t.ramHistory, '#a855f7', '#a855f7');

  document.getElementById('mon-cpu-big').textContent = `${t.cpuPct}%`;
  document.getElementById('mon-cpu-model').textContent = `${t.cpuModel} (${t.cores.length} 逻辑核心)`;
  drawSparkline('mon-spark-cpu', t.cpuHistory, '#38bdf8', '#38bdf8');

  document.getElementById('mon-ram-big').textContent = `${t.ramPct}%`;
  document.getElementById('mon-ram-detail').textContent = `物理内存已用 ${t.ramUsedGb} GB / 总计 ${t.ramTotalGb} GB`;
  drawSparkline('mon-spark-ram', t.ramHistory, '#a855f7', '#a855f7');

  if (t.disk && t.disk.totalGb > 0) {
    document.getElementById('mon-disk-text').textContent = `${t.disk.usedGb} / ${t.disk.totalGb} GB (${t.disk.pct}%)`;
    document.getElementById('mon-disk-fill').style.width = `${t.disk.pct}%`;
  }

  const coresEl = document.getElementById('cores-grid');
  coresEl.innerHTML = t.cores
    .map(
      (pct, idx) => `
      <div class="core-pill">
        <div class="core-top"><span>#${idx}</span><strong>${pct}%</strong></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>
    `
    )
    .join('');

  if (Array.isArray(t.topProcs) && t.topProcs.length > 0) {
    document.getElementById('top-procs').innerHTML = t.topProcs
      .map((p) => `<div class="proc-row"><span>⚙️ ${p.name}</span><strong>${p.mb} MB</strong></div>`)
      .join('');
  }
}

function renderLogs(logs) {
  const box = document.getElementById('event-logs');
  box.innerHTML = logs
    .map((l) => `<div class="log-item"><span>[${l.time}]</span>${l.msg}</div>`)
    .join('');
}

function renderDrops(drops) {
  const box = document.getElementById('drops-list');
  if (!drops || drops.length === 0) {
    box.innerHTML = '<div class="mon-sub">暂无快传文件或电脑截图，点击上方即可双向秒传！</div>';
    return;
  }
  box.innerHTML = drops
    .map(
      (d) => `
      <div class="drop-item">
        ${d.isImage ? `<img class="drop-thumb" src="${d.url}" alt="${d.name}" />` : '<div class="key-icon" style="font-size:22px;margin:0">📄</div>'}
        <div class="drop-meta">
          <div class="drop-name">${d.name}</div>
          <div class="drop-size">${d.sizeKb} KB</div>
        </div>
        <a class="ghost-btn" href="${d.url}" download="${d.name}" target="_blank">⬇ 保存/预览</a>
      </div>
    `
    )
    .join('');
}

async function uploadFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  const statusEl = document.getElementById('drop-status');
  for (const file of fileList) {
    statusEl.textContent = `⏳ 正在高速上传 ${file.name}...`;
    const res = await fetch('/api/drop', {
      method: 'POST',
      headers: { 'x-file-name': encodeURIComponent(file.name) },
      body: file,
    });
    const data = await res.json();
    if (data.ok) renderDrops(data.drops);
  }
  statusEl.textContent = '✅ 快传完成！点击继续选择手机相册/文件，或拖拽文件到此';
  keyAudio.click(true);
  showToast('⚡ 文件已秒传至电脑 drops 目录！');
}

function setupTabsAndActions(boot) {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      keyAudio.click(false);
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    };
  });

  // Hide QR card on small mobile screens if opened via ?deck=1 so keys get full focus
  if (!boot.isLocalhost && window.innerWidth < 720) {
    document.getElementById('qr-card').classList.add('hidden');
  } else {
    document.getElementById('pair-pin-badge').textContent = `PIN ${boot.pairPin}`;
    document.getElementById('qr-svg-box').innerHTML = boot.qrSvg;
    document.getElementById('pair-url-text').textContent = boot.pairUrl;
  }

  document.getElementById('btn-copy-url').onclick = async () => {
    await navigator.clipboard.writeText(boot.pairUrl);
    showToast('📋 已复制手机直连配对链接！');
  };

  document.getElementById('btn-reset-macros').onclick = async () => {
    const res = await fetch('/api/macros/reset', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      macros = data.macros;
      renderMacros();
      showToast('🔄 已恢复 12 键出厂布局');
    }
  };

  // Clipboard Beam
  document.getElementById('btn-push-clip').onclick = async () => {
    const text = document.getElementById('clip-box').value;
    await fetch('/api/clipboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    keyAudio.click(true);
    showToast('📤 已写入电脑剪贴板！电脑直接按 Ctrl+V 即可粘贴');
  };

  document.getElementById('btn-pull-clip').onclick = async () => {
    const res = await fetch('/api/clipboard');
    const data = await res.json();
    document.getElementById('clip-box').value = data.text || '';
    keyAudio.click(false);
    showToast('📥 已提取电脑剪贴板内容！');
  };

  // Grab PC Screen from AirDrop tab
  document.getElementById('btn-grab-screen').onclick = async () => {
    keyAudio.click(true);
    showToast('📸 正在截取电脑全屏...');
    const res = await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'screenshot' }),
    });
    const data = await res.json();
    if (data.drops) renderDrops(data.drops);
    showToast('📸 电脑屏幕截图已生成！点击下方即可保存或预览');
  };

  // File Picker & Drag-Drop
  const picker = document.getElementById('file-picker');
  picker.onchange = () => uploadFiles(picker.files);
  const dz = document.getElementById('drop-zone');
  dz.ondragover = (e) => e.preventDefault();
  dz.ondrop = (e) => {
    e.preventDefault();
    uploadFiles(e.dataTransfer.files);
  };

  // Custom Macro Modal
  const modal = document.getElementById('macro-modal');
  document.getElementById('btn-add-macro').onclick = () => modal.classList.remove('hidden');
  document.getElementById('m-cancel').onclick = () => modal.classList.add('hidden');
  document.getElementById('m-save').onclick = async () => {
    const payload = {
      icon: document.getElementById('m-icon').value || '⚡',
      label: document.getElementById('m-label').value || '自定义指令',
      color: document.getElementById('m-color').value,
      actionType: document.getElementById('m-type').value,
      value: document.getElementById('m-val').value,
    };
    const res = await fetch('/api/macros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      macros = data.macros;
      renderMacros();
      modal.classList.add('hidden');
      keyAudio.click(true);
      showToast('✨ 新按键已挂载到宏键盘！');
    }
  };

  // Couch Wireless Trackpad
  const surface = document.getElementById('touch-surface');
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let totalMoved = 0;
  let lastMoveSent = 0;
  let accDx = 0;
  let accDy = 0;

  surface.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    totalMoved = 0;
    surface.setPointerCapture(e.pointerId);
  });

  surface.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - lastX) * 1.85;
    const dy = (e.clientY - lastY) * 1.85;
    lastX = e.clientX;
    lastY = e.clientY;
    totalMoved += Math.hypot(dx, dy);
    accDx += dx;
    accDy += dy;

    const now = performance.now();
    if (now - lastMoveSent > 22 && (Math.abs(accDx) >= 1 || Math.abs(accDy) >= 1)) {
      lastMoveSent = now;
      const sendX = accDx;
      const sendY = accDy;
      accDx = 0;
      accDy = 0;
      fetch('/api/trackpad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'move', dx: sendX, dy: sendY }),
      });
    }
  });

  surface.addEventListener('pointerup', () => {
    if (dragging && totalMoved < 7) {
      keyAudio.click(false);
      fetch('/api/trackpad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'click', btn: 'left' }),
      });
    }
    dragging = false;
  });

  document.getElementById('pad-left-click').onclick = () => {
    keyAudio.click(false);
    fetch('/api/trackpad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'click', btn: 'left' }),
    });
  };
  document.getElementById('pad-right-click').onclick = () => {
    keyAudio.click(false);
    fetch('/api/trackpad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'click', btn: 'right' }),
    });
  };
  document.getElementById('pad-scroll-up').onclick = () => {
    fetch('/api/trackpad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'scroll', delta: 240 }),
    });
  };
  document.getElementById('pad-scroll-down').onclick = () => {
    fetch('/api/trackpad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'scroll', delta: -240 }),
    });
  };

  document.querySelectorAll('[data-pad-vk]').forEach((b) => {
    b.onclick = () => {
      keyAudio.click(true);
      fetch('/api/trackpad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'vk', value: b.dataset.padVk }),
      });
    };
  });

  // Request screen WakeLock on mobile so desk companion screen never dims!
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').catch(() => {});
  }
}

async function init() {
  const res = await fetch('/api/bootstrap');
  const boot = await res.json();

  if (!boot.authorized) {
    document.getElementById('pin-gate').classList.remove('hidden');
    document.getElementById('pin-host').textContent = `连接 ${boot.hostname || '电脑副屏'}`;
    document.getElementById('pin-submit').onclick = async () => {
      const pin = document.getElementById('pin-input').value.trim();
      const pr = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const pd = await pr.json();
      if (pd.ok) location.reload();
      else document.getElementById('pin-err').textContent = pd.error || '配对码不正确';
    };
    return;
  }

  document.getElementById('cockpit').classList.remove('hidden');
  macros = boot.macros || [];
  const logs = boot.logs || [];

  renderMacros();
  renderTelemetry(boot.telemetry);
  renderDrops(boot.drops || []);
  renderLogs(logs);
  setupTabsAndActions(boot);

  // Connect real-time SSE telemetry & event stream
  const es = new EventSource('/api/stream');
  es.addEventListener('telemetry', (e) => renderTelemetry(JSON.parse(e.data)));
  es.addEventListener('drops', (e) => renderDrops(JSON.parse(e.data)));
  es.addEventListener('macros', (e) => {
    macros = JSON.parse(e.data);
    renderMacros();
  });
  es.addEventListener('log', (e) => {
    logs.unshift(JSON.parse(e.data));
    if (logs.length > 25) logs.pop();
    renderLogs(logs);
  });
  es.onerror = () => {
    document.getElementById('conn-dot').style.background = '#ef4444';
  };
  es.onopen = () => {
    document.getElementById('conn-dot').style.background = '#22c55e';
  };
}

init();
