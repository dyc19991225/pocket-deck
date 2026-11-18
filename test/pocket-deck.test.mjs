import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { encodeQrMatrix, renderQrSvg } from '../src/qr.mjs';
import { createPocketDeckServer } from '../src/server.mjs';

test('QR Code SVG generator produces valid finder patterns & SVG markup', () => {
  const url = 'http://192.168.1.88:4799/?pin=654321';
  const matrix = encodeQrMatrix(url);
  assert.ok(matrix.length >= 25 && matrix.length <= 41);
  // Top-left 7x7 finder outer corners & center 3x3 must be dark (1)
  assert.equal(matrix[0][0], 1);
  assert.equal(matrix[0][6], 1);
  assert.equal(matrix[6][0], 1);
  assert.equal(matrix[3][3], 1);
  assert.equal(matrix[1][1], 0);

  const svg = renderQrSvg(url);
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.includes('<path d="M'));
});

test('Pocket Deck Server bootstrap, macro CRUD, clipboard & file drop API', async () => {
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
    // 1. Bootstrap on localhost is auto-authorized and returns QR SVG + 12 default macros
    const bRes = await fetch(`${base}/api/bootstrap`);
    const boot = await bRes.json();
    assert.equal(boot.authorized, true);
    assert.equal(boot.pairPin, '889900');
    assert.equal(boot.macros.length, 12);
    assert.ok(boot.qrSvg.includes('<svg'));
    assert.ok(typeof boot.telemetry.cpuPct === 'number');

    // 2. Add custom macro button & trigger it
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
    assert.equal(mData.macros.length, 13);

    const customId = mData.macros[12].id;
    const tRes = await fetch(`${base}/api/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: customId }),
    });
    const tData = await tRes.json();
    assert.equal(tData.ok, true);

    // 3. Bidirectional Clipboard round-trip
    await fetch(`${base}/api/clipboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello-From-Phone-666' }),
    });
    const cRes = await fetch(`${base}/api/clipboard`);
    const cData = await cRes.json();
    assert.equal(cData.text, 'Hello-From-Phone-666');

    // 4. AirDrop binary upload
    const dRes = await fetch(`${base}/api/drop`, {
      method: 'POST',
      headers: { 'x-file-name': encodeURIComponent('photo.png') },
      body: Buffer.from([137, 80, 78, 71]),
    });
    const dData = await dRes.json();
    assert.equal(dData.ok, true);
    assert.equal(dData.drops.length, 1);
  } finally {
    await closeAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
