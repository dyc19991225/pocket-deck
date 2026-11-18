import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { encodeQrMatrix, renderQrSvg } from '../src/qr.mjs';
import { createPocketDeckServer } from '../src/server.mjs';
import { WinBridge } from '../src/winControl.mjs';

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

test('Pocket Deck v2.0 Server bootstrap, 15-key macros, audio fader, clipboard & file drop API', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-deck-test-'));
  const { server, closeAll, pairPin } = createPocketDeckServer({
    rootDir: tmpDir,
    pin: '889900',
    dryRun: true,
  });
  assert.equal(pairPin, '889900');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Bootstrap returns 15 default macros + live audio state
    const bRes = await fetch(`${base}/api/bootstrap`);
    const boot = await bRes.json();
    assert.equal(boot.authorized, true);
    assert.equal(boot.macros.length, 15);
    assert.equal(typeof boot.telemetry.audio.vol, 'number');

    // 2. Hardware Volume Fader + Audio Step & Mute macros
    const fRes = await fetch(`${base}/api/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vol: 40 }),
    });
    const fData = await fRes.json();
    assert.equal(fData.audio.vol, 40);

    const upRes = await fetch(`${base}/api/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'vol_up' }),
    });
    const upData = await upRes.json();
    assert.equal(upData.ok, true);
    assert.equal(upData.audio.vol, 48);

    // 3. Add custom macro button
    const mRes = await fetch(`${base}/api/macros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        icon: '📺',
        label: '打开 B站',
        color: '#fb7185',
        actionType: 'open_url',
        value: 'https://www.bilibili.com',
      }),
    });
    const mData = await mRes.json();
    assert.equal(mData.ok, true);
    assert.equal(mData.macros.length, 16);

    // 4. Bidirectional Clipboard + Pull Clipboard Macro
    await fetch(`${base}/api/clipboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello-Deck-v2' }),
    });
    const pullRes = await fetch(`${base}/api/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'pull_clip' }),
    });
    const pullData = await pullRes.json();
    assert.equal(pullData.clipText, 'Hello-Deck-v2');

    // 5. Screenshot Macro returns fileUrl + dimensions
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

    await bridge.setClipboard('PocketDeck-v2-Verified');
    const clip = await bridge.getClipboard();
    assert.equal(clip, 'PocketDeck-v2-Verified');
  } finally {
    bridge.close();
    fs.rmSync(tmpDrops, { recursive: true, force: true });
  }
});
