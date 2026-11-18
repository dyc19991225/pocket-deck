#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPocketDeckServer } from '../src/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
let port = 4799;
const pIdx = args.indexOf('--port');
if (pIdx >= 0 && args[pIdx + 1]) {
  port = Number(args[pIdx + 1]) || 4799;
}

const { server, pairPin, telemetry } = createPocketDeckServer({ rootDir, port });

server.listen(port, '0.0.0.0', () => {
  const lanIp = telemetry.getLanIp();
  console.log(`\n🎛️  Pocket Deck v1.0 — Wireless Stream Deck & PC Telemetry Hub`);
  console.log(`──────────────────────────────────────────────────────────────`);
  console.log(`  🖥️  电脑主控台 (打开扫码) : http://127.0.0.1:${port}/`);
  console.log(`  📱  手机局域网直连地址    : http://${lanIp}:${port}/?pin=${pairPin}`);
  console.log(`  🔑  6 位安全配对码 (PIN)  : ${pairPin}`);
  console.log(`──────────────────────────────────────────────────────────────\n`);
});
