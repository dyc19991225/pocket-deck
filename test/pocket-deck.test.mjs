import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { encodeQrMatrix, renderQrSvg } from '../src/qr.mjs';
import { createPocketDeckServer } from '../src/server.mjs';
import { WinBridge, parseHotkeyChord } from '../src/winControl.mjs';
import { generateMerchantKeyPair, signLicenseKey, verifyLicenseKey } from '../src/license.mjs';

test('QR Code SVG generator produces valid finder patterns & ISO format strips', () => {
  const url = 'http://192.168.1.88:4799/?pin=654321';
  const matrix = encodeQrMatrix(url);
  assert.ok(matrix.length >= 25 && matrix.length <= 41);
  assert.equal(matrix[0][0], 1);
  assert.equal(matrix[0][6], 1);
  assert.equal(matrix[6][0], 1);
  assert.equal(matrix[3][3], 1);
  assert.equal(matrix[1][1], 0);

  const svg = renderQrSvg(url);
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.includes('<path d="M'));
});

test('Ed25519 Offline License Key signing, verification & anti-tamper protection', () => {
  const { publicKeyPem, privateKeyPem } = generateMerchantKeyPair();
  const key = signLicenseKey({ privateKeyPem, tier: 'pro', serial: 100888 });
  assert.ok(key.startsWith('PDPRO-'));

  const verified = verifyLicenseKey(key, publicKeyPem);
  assert.equal(verified.valid, true);
  assert.equal(verified.isPro, true);
  assert.equal(verified.serial, '#100888');

  // Tampering last character or middle character must fail
  const tamperedEnd = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');
  assert.equal(verifyLicenseKey(tamperedEnd, publicKeyPem).valid, false);

  const otherPair = generateMerchantKeyPair();
  assert.equal(verifyLicenseKey(key, otherPair.publicKeyPem).valid, false);
});

test('Hardware Hotkey Chord parser maps Jianying/PR/Win shortcuts accurately', () => {
  assert.deepEqual(parseHotkeyChord('ctrl+b'), { ctrl: true, alt: false, shift: false, win: false, code: 0x42 });
  assert.deepEqual(parseHotkeyChord('ctrl+shift+z'), { ctrl: true, alt: false, shift: true, win: false, code: 0x5a });
  assert.deepEqual(parseHotkeyChord('win+alt+r'), { ctrl: false, alt: true, shift: false, win: true, code: 0x52 });
  assert.deepEqual(parseHotkeyChord('q'), { ctrl: false, alt: false, shift: false, win: false, code: 0x51 });
  assert.equal(parseHotkeyChord('invalid_key_xyz'), null);
});

test('Pocket Deck v2.5 Server bootstrap, Pro gating, Ed25519 activation, Jianying profile & clipboard', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-deck-test-'));
  const { publicKeyPem, privateKeyPem } = generateMerchantKeyPair();
  const validProKey = signLicenseKey({ privateKeyPem, tier: 'pro', serial: 202601 });

  const { server, closeAll, pairPin } = createPocketDeckServer({
    rootDir: tmpDir,
    pin: '889900',
    dryRun: true,
    publicKeyPem,
  });
  assert.equal(pairPin, '889900');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Bootstrap starts in Free mode with 15 standard macros + 4 profiles
    const bRes = await fetch(`${base}/api/bootstrap`);
    const boot = await bRes.json();
    assert.equal(boot.authorized, true);
    assert.equal(boot.license.isPro, false);
    assert.equal(boot.activeProfile, 'standard');
    assert.equal(boot.profiles.length, 4);
    assert.equal(boot.macros.length, 15);
    assert.equal(typeof boot.telemetry.audio.vol, 'number');

    // 2. Pro profile & Pro theme are gated before activation
    const gateProf = await fetch(`${base}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'jianying' }),
    });
    assert.equal(gateProf.status, 402);
    const gateProfJson = await gateProf.json();
    assert.equal(gateProfJson.code, 'PRO_REQUIRED');

    // 3. Free tier allows up to 2 custom macros, blocks 3rd
    for (let i = 1; i <= 2; i++) {
      const mRes = await fetch(`${base}/api/macros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icon: '📺', label: `自定义${i}`, actionType: 'hotkey', value: 'ctrl+b' }),
      });
      assert.equal(mRes.status, 200);
    }
    const thirdRes = await fetch(`${base}/api/macros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icon: '🚫', label: '超限按键', actionType: 'hotkey', value: 'ctrl+e' }),
    });
    assert.equal(thirdRes.status, 402);

    // 4. Activate Pro with Ed25519 key -> unlocks Jianying profile, themes, autostart & unlimited macros!
    const actRes = await fetch(`${base}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: validProKey }),
    });
    const actData = await actRes.json();
    assert.equal(actData.ok, true);
    assert.equal(actData.license.isPro, true);
    assert.equal(actData.license.serial, '#202601');

    const jyRes = await fetch(`${base}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'jianying' }),
    });
    const jyData = await jyRes.json();
    assert.equal(jyData.ok, true);
    assert.equal(jyData.activeProfile, 'jianying');
    assert.equal(jyData.macros[0].id, 'jy_split');

    // Trigger Jianying hardware hotkey macro
    const trigJy = await fetch(`${base}/api/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'jy_split' }),
    });
    const trigJyData = await trigJy.json();
    assert.equal(trigJyData.ok, true);

    // Switch back to standard & test audio + clipboard + screenshot
    await fetch(`${base}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'standard' }),
    });

    await fetch(`${base}/api/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vol: 40 }),
    });
    const upRes = await fetch(`${base}/api/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'vol_up' }),
    });
    const upData = await upRes.json();
    assert.equal(upData.audio.vol, 48);

    await fetch(`${base}/api/clipboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello-Deck-v2.5' }),
    });
    const pullRes = await fetch(`${base}/api/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'pull_clip' }),
    });
    const pullData = await pullRes.json();
    assert.equal(pullData.clipText, 'Hello-Deck-v2.5');

    const sRes = await fetch(`${base}/api/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'screenshot' }),
    });
    const sData = await sRes.json();
    assert.equal(sData.ok, true);
    assert.ok(sData.fileUrl.startsWith('/drops/'));
  } finally {
    await closeAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Real Windows Bridge RPC (CoreAudio read & Clipboard round-trip)', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-only native bridge test');
    return;
  }
  const tmpDrops = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-win-'));
  const bridge = new WinBridge({ dropsDir: tmpDrops, workspaceDir: process.cwd(), dryRun: false });
  try {
    const audio = await bridge.getAudioState();
    assert.ok(audio.vol >= 0 && audio.vol <= 100);

    await bridge.setClipboard('PocketDeck-v2.5-Verified');
    const clip = await bridge.getClipboard();
    assert.equal(clip, 'PocketDeck-v2.5-Verified');
  } finally {
    bridge.close();
    fs.rmSync(tmpDrops, { recursive: true, force: true });
  }
});
