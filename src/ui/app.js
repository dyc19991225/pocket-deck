class KeySwitchAudio {
  constructor() {
    this.ctx = null;
  }
  ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  click(accent = false) {
    try {
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(accent ? 1380 : 980, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.032);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.036);

      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch {
      // ignore if audio blocked
    }
    if (navigator.vibrate) navigator.vibrate(accent ? [18, 25, 18] : 14);
  }
  celebrate() {
    try {
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const t = ctx.currentTime + idx * 0.075;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.23);
      });
    } catch {
      // ignore
    }
    if (navigator.vibrate) navigator.vibrate([25, 35, 25, 35, 45]);
  }
}

const keyAudio = new KeySwitchAudio();

let macros = [];
let profiles = [];
let activeProfile = 'standard';
let themes = [];
let activeTheme = 'cyber_blue';
let license = { isPro: false, tierLabel: '免费体验版', serial: '', shop: {} };
let autostartEnabled = false;

let audioState = { vol: 50, muted: false };
let userDraggingFader = false;
let armedId = null;
let armedTimeout = null;
let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function getCurrentBuiltinSet() {
  const prof = profiles.find((p) => p.id === activeProfile);
  if (prof && Array.isArray(prof.builtinIds)) return new Set(prof.builtinIds);
  return new Set([
    'mute', 'vol_down', 'vol_up', 'play_pause', 'next_track',
    'screenshot', 'snipping', 'pull_clip', 'boss_key', 'open_term',
    'open_ws', 'calc', 'sound_cfg', 'task_mgr', 'lock_pc',
  ]);
}

function applyTheme(themeId) {
  activeTheme = themeId || 'cyber_blue';
  document.body.setAttribute('data-theme', activeTheme);
  renderThemes();
}

function openProModal(reasonMsg = '') {
  updateLicenseUI();
  document.getElementById('pro-err').textContent = reasonMsg || '';
  document.getElementById('pro-modal').classList.remove('hidden');
}

function updateLicenseUI() {
  const badge = document.getElementById('btn-pro-badge');
  if (license.isPro) {
    badge.textContent = `👑 PRO ${license.serial || '终身版'}`;
    badge.classList.add('is-pro');
    document.getElementById('pro-modal-title').textContent = '👑 Pocket Deck Pro 终身授权中心';
    document.getElementById('pro-activate-box').classList.add('hidden');
    document.getElementById('pro-activated-box').classList.remove('hidden');
    document.getElementById('pro-serial-text').textContent = `${license.tierLabel || 'Pro 终身专业版'} · 序列号 ${license.serial || ''} · 签发于 ${license.issuedAt || ''}`;
  } else {
    badge.textContent = '👑 解锁 Pro';
    badge.classList.remove('is-pro');
    document.getElementById('pro-modal-title').textContent = '👑 解锁 Pocket Deck Pro 终身版';
    document.getElementById('pro-activate-box').classList.remove('hidden');
    document.getElementById('pro-activated-box').classList.add('hidden');
  }

  const shop = license.shop || {};
  if (shop.priceLabel) {
    document.getElementById('pro-price-banner').textContent = shop.priceLabel;
  }
  document.getElementById('pro-channel-note').textContent = shop.shopChannelNote || '';

  const shopLink = document.getElementById('pro-shop-link');
  const contactBox = document.getElementById('pro-contact-text');
  if (shop.shopUrl && /^https?:\/\//i.test(shop.shopUrl)) {
    shopLink.href = shop.shopUrl;
    shopLink.classList.remove('hidden');
    contactBox.classList.add('hidden');
  } else {
    shopLink.classList.add('hidden');
    contactBox.classList.remove('hidden');
    contactBox.textContent = shop.contactNote || '闲鱼 / 面包多搜索「Pocket Deck」自动发码';
  }

  const autoBtn = document.getElementById('btn-toggle-autostart');
  if (autoBtn) {
    autoBtn.textContent = autostartEnabled ? '✅ 已开启（点击关闭）' : '🚀 开启开机自启';
  }

  renderProfiles();
  renderThemes();
}

function renderProfiles() {
  const wrap = document.getElementById('profile-tabs');
  if (!wrap || !profiles.length) return;

  wrap.innerHTML = profiles
    .map((p) => {
      const locked = p.proOnly && !license.isPro;
      const lockBadge = locked ? '<span class="prof-lock">🔒PRO</span>' : '';
      return `<button class="prof-pill ${p.id === activeProfile ? 'active' : ''}" data-prof="${p.id}" title="${p.desc || ''}">${p.name}${lockBadge}</button>`;
    })
    .join('');

  const curProf = profiles.find((p) => p.id === activeProfile);
  const descEl = document.getElementById('profile-desc-label');
  if (curProf && descEl) {
    descEl.textContent = `${curProf.name} · ${curProf.desc || '拖动推子实时控音'}`;
  }

  wrap.querySelectorAll('[data-prof]').forEach((btn) => {
    btn.onclick = async () => {
      const profileId = btn.dataset.prof;
      if (profileId === activeProfile) return;
      keyAudio.click(false);
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json();
      if (data.ok) {
        activeProfile = data.activeProfile;
        macros = data.macros;
        renderProfiles();
        renderMacros();
        showToast(`🎛️ 已切换至 ${btn.textContent.replace('🔒PRO', '').trim()}`);
      } else if (data.code === 'PRO_REQUIRED') {
        openProModal(data.error);
      } else {
        showToast(`❌ ${data.error || '切换失败'}`);
      }
    };
  });
}

function renderThemes() {
  const wrap = document.getElementById('theme-dots');
  if (!wrap || !themes.length) return;

  wrap.innerHTML = themes
    .map((t) => {
      const locked = t.proOnly && !license.isPro;
      return `<button class="theme-dot ${t.id === activeTheme ? 'active' : ''}" style="background:${t.accent};color:${t.accent}" data-theme-id="${t.id}" title="${t.name}${locked ? ' (Pro 专属)' : ''}"></button>`;
    })
    .join('');

  wrap.querySelectorAll('[data-theme-id]').forEach((dot) => {
    dot.onclick = async () => {
      const themeId = dot.dataset.themeId;
      if (themeId === activeTheme) return;
      keyAudio.click(false);
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId }),
      });
      const data = await res.json();
      if (data.ok) {
        applyTheme(data.activeTheme);
        const meta = themes.find((x) => x.id === themeId);
        showToast(`🎨 已切换主题：${meta ? meta.name : themeId}`);
      } else if (data.code === 'PRO_REQUIRED') {
        openProModal(data.error);
      }
    };
  });
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

function updateAudioUI(audio) {
  if (!audio || typeof audio.vol !== 'number') return;
  audioState = audio;
  const pill = document.getElementById('pill-vol');
  pill.textContent = audio.muted ? '🔇 已静音' : `🔊 ${audio.vol}%`;
  pill.style.color = audio.muted ? '#f87171' : '#38bdf8';

  const muteBtn = document.getElementById('fader-mute-btn');
  muteBtn.textContent = audio.muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('is-muted', Boolean(audio.muted));

  document.getElementById('fader-val-label').textContent = audio.muted
    ? `已静音 (${audio.vol}%)`
    : `${audio.vol}%`;

  if (!userDraggingFader) {
    document.getElementById('vol-fader').value = String(audio.vol);
  }

  const muteCard = document.querySelector('[data-mid="mute"]');
  if (muteCard) {
    muteCard.classList.toggle('muted-state', Boolean(audio.muted));
    const sub = muteCard.querySelector('.key-sub');
    if (sub && armedId !== 'mute') sub.textContent = audio.muted ? '当前：已静音' : `当前音量 ${audio.vol}%`;
  }
}

function openScreenshotModal(url, fileName, w, h) {
  const modal = document.getElementById('shot-modal');
  document.getElementById('shot-title').textContent = `📸 电脑实时全屏截图 (${w || ''}×${h || ''})`;
  document.getElementById('shot-img').src = `${url}?t=${Date.now()}`;
  const dl = document.getElementById('shot-dl');
  dl.href = url;
  dl.download = fileName || 'screenshot.png';
  modal.classList.remove('hidden');
}

function openClipboardModal(text) {
  const modal = document.getElementById('clip-modal');
  document.getElementById('clip-modal-text').value = text || '';
  document.getElementById('clip-box').value = text || '';
  modal.classList.remove('hidden');
}

function renderMacros() {
  const grid = document.getElementById('keycap-grid');
  const builtinSet = getCurrentBuiltinSet();

  grid.innerHTML = macros
    .map((m) => {
      const customDel = !builtinSet.has(m.id)
        ? `<button class="key-del" data-del="${m.id}" title="删除此自定义按钮">✕</button>`
        : '';
      const isMutedCard = m.id === 'mute' && audioState.muted;
      let subText = m.sub || '';
      if (m.id === 'mute') subText = audioState.muted ? '当前：已静音' : `当前音量 ${audioState.vol}%`;
      if (armedId === m.id) subText = '⚠️ 再点一次确认';

      return `
        <div class="keycap ${armedId === m.id ? 'armed' : ''} ${isMutedCard ? 'muted-state' : ''}" style="--glow:${m.color || '#38bdf8'}" data-mid="${m.id}">
          ${customDel}
          <div class="key-icon">${m.icon}</div>
          <div class="key-label">${m.label}</div>
          <div class="key-sub">${subText}</div>
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
        showToast('🔒 防误触保护：3 秒内再点一次确认锁屏！');
        return;
      }

      armedId = null;
      keyAudio.click(true);
      card.classList.add('pressing');
      setTimeout(() => card.classList.remove('pressing'), 150);

      const res = await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || `已执行：${m.label}`);
        if (data.audio) updateAudioUI(data.audio);
        if (data.drops) renderDrops(data.drops);
        if (data.fileUrl) openScreenshotModal(data.fileUrl, data.fileName, data.w, data.h);
        if (data.clipText !== undefined) openClipboardModal(data.clipText);
      } else {
        showToast(`❌ ${data.error || '执行失败'}`);
      }
      renderMacros();
    });
  });
}

function renderTelemetry(t) {
  if (!t) return;
  if (t.audio) updateAudioUI(t.audio);
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
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      keyAudio.click(false);
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    };
  });

  if (!boot.isLocalhost && window.innerWidth < 720) {
    document.getElementById('qr-card').classList.add('hidden');
  } else {
    document.getElementById('pair-pin-badge').textContent = `PIN ${boot.pairPin}`;
    document.getElementById('qr-svg-box').innerHTML = boot.qrSvg;
    document.getElementById('pair-url-text').textContent = boot.pairUrl;
  }

  // Pro Modal Actions
  document.getElementById('btn-pro-badge').onclick = () => {
    keyAudio.click(false);
    openProModal('');
  };
  document.getElementById('pro-modal-close').onclick = () =>
    document.getElementById('pro-modal').classList.add('hidden');

  document.getElementById('pro-activate-btn').onclick = async () => {
    const key = document.getElementById('pro-key-input').value.trim();
    const errEl = document.getElementById('pro-err');
    errEl.textContent = '';
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();
    if (data.ok) {
      license = data.license;
      keyAudio.celebrate();
      updateLicenseUI();
      showToast(`🎉 恭喜！已永久激活 ${license.tierLabel}！`);
    } else {
      errEl.textContent = data.error || '激活失败，请检查激活码';
    }
  };

  document.getElementById('btn-toggle-autostart').onclick = async () => {
    const res = await fetch('/api/autostart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !autostartEnabled }),
    });
    const data = await res.json();
    if (data.ok) {
      autostartEnabled = Boolean(data.autostart);
      updateLicenseUI();
      keyAudio.click(true);
      showToast(autostartEnabled ? '🚀 已开启 Windows 开机静默自启！' : '⏸️ 已关闭开机自启');
    } else {
      showToast(`❌ ${data.error || '设置失败'}`);
    }
  };

  // Hardware Volume Fader Slider & Mute Button!
  const fader = document.getElementById('vol-fader');
  let faderThrottle = 0;
  fader.addEventListener('pointerdown', () => { userDraggingFader = true; });
  window.addEventListener('pointerup', () => { userDraggingFader = false; });
  fader.addEventListener('input', () => {
    const vol = Number(fader.value);
    document.getElementById('fader-val-label').textContent = `${vol}%`;
    const now = performance.now();
    if (now - faderThrottle > 45) {
      faderThrottle = now;
      fetch('/api/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vol }),
      });
    }
  });
  fader.addEventListener('change', async () => {
    userDraggingFader = false;
    const res = await fetch('/api/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vol: Number(fader.value) }),
    });
    const data = await res.json();
    if (data.audio) updateAudioUI(data.audio);
  });

  document.getElementById('fader-mute-btn').onclick = async () => {
    keyAudio.click(true);
    const res = await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'mute' }),
    });
    const data = await res.json();
    if (data.audio) updateAudioUI(data.audio);
    if (data.message) showToast(data.message);
  };

  // Screenshot & Clipboard Modals
  document.getElementById('shot-close').onclick = () =>
    document.getElementById('shot-modal').classList.add('hidden');
  document.getElementById('shot-open-folder').onclick = async () => {
    await fetch('/api/macros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '_tmp_drops', icon: '📂', label: '快传目录', actionType: 'open_app', value: 'explorer_drops' }),
    });
    await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '_tmp_drops' }),
    });
    await fetch('/api/macros/_tmp_drops', { method: 'DELETE' });
    showToast('📂 已在电脑打开 drops 截图目录！');
  };

  document.getElementById('clip-modal-close').onclick = () =>
    document.getElementById('clip-modal').classList.add('hidden');
  document.getElementById('clip-modal-copy').onclick = async () => {
    const txt = document.getElementById('clip-modal-text').value;
    await navigator.clipboard.writeText(txt);
    keyAudio.click(true);
    showToast('📋 已复制到当前设备剪贴板！');
  };
  document.getElementById('clip-modal-push').onclick = async () => {
    const text = document.getElementById('clip-modal-text').value;
    await fetch('/api/clipboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    document.getElementById('clip-modal').classList.add('hidden');
    keyAudio.click(true);
    showToast('📤 已写回电脑剪贴板！');
  };

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
      showToast('🔄 已恢复当前面板默认 15 键布局');
    }
  };

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
    showToast(data.text ? '📥 已提取电脑剪贴板内容！' : '📥 当前电脑剪贴板为空');
  };

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
    if (data.fileUrl) openScreenshotModal(data.fileUrl, data.fileName, data.w, data.h);
  };

  const picker = document.getElementById('file-picker');
  picker.onchange = () => uploadFiles(picker.files);
  const dz = document.getElementById('drop-zone');
  dz.ondragover = (e) => e.preventDefault();
  dz.ondrop = (e) => {
    e.preventDefault();
    uploadFiles(e.dataTransfer.files);
  };

  const modal = document.getElementById('macro-modal');
  const mType = document.getElementById('m-type');
  const mVal = document.getElementById('m-val');
  mType.onchange = () => {
    if (mType.value === 'hotkey') mVal.value = 'ctrl+b';
    else if (mType.value === 'open_url') mVal.value = 'https://www.bilibili.com';
    else if (mType.value === 'sendkeys') mVal.value = '^c';
    else mVal.value = '';
  };

  document.getElementById('btn-add-macro').onclick = () => modal.classList.remove('hidden');
  document.getElementById('m-cancel').onclick = () => modal.classList.add('hidden');
  document.getElementById('m-save').onclick = async () => {
    const payload = {
      icon: document.getElementById('m-icon').value || '⚡',
      label: document.getElementById('m-label').value || '自定义指令',
      color: document.getElementById('m-color').value,
      actionType: mType.value,
      value: mVal.value,
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
    } else if (data.code === 'PRO_REQUIRED') {
      modal.classList.add('hidden');
      openProModal(data.error);
    } else {
      showToast(`❌ ${data.error || '保存失败'}`);
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
  profiles = boot.profiles || [];
  activeProfile = boot.activeProfile || 'standard';
  themes = boot.themes || [];
  activeTheme = boot.activeTheme || 'cyber_blue';
  license = boot.license || license;
  autostartEnabled = Boolean(boot.autostart);

  const logs = boot.logs || [];
  if (boot.telemetry?.audio) audioState = boot.telemetry.audio;

  applyTheme(activeTheme);
  updateLicenseUI();
  renderMacros();
  renderTelemetry(boot.telemetry);
  renderDrops(boot.drops || []);
  renderLogs(logs);
  setupTabsAndActions(boot);

  const es = new EventSource('/api/stream');
  es.addEventListener('telemetry', (e) => renderTelemetry(JSON.parse(e.data)));
  es.addEventListener('audio', (e) => updateAudioUI(JSON.parse(e.data)));
  es.addEventListener('drops', (e) => renderDrops(JSON.parse(e.data)));
  es.addEventListener('macros', (e) => {
    macros = JSON.parse(e.data);
    renderMacros();
  });
  es.addEventListener('profile', (e) => {
    const p = JSON.parse(e.data);
    activeProfile = p.activeProfile;
    macros = p.macros;
    renderProfiles();
    renderMacros();
  });
  es.addEventListener('theme', (e) => {
    const t = JSON.parse(e.data);
    applyTheme(t.activeTheme);
  });
  es.addEventListener('license', (e) => {
    license = JSON.parse(e.data);
    updateLicenseUI();
  });
  es.addEventListener('autostart', (e) => {
    autostartEnabled = Boolean(JSON.parse(e.data).autostart);
    updateLicenseUI();
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
