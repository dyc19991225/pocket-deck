#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMerchantKeyPair, signLicenseKey, verifyLicenseKey } from '../src/license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const secretDir = path.join(rootDir, '.pocket-deck-secret');
const privKeyPath = path.join(secretDir, 'merchant-private.pem');
const pubKeyModulePath = path.join(rootDir, 'src', 'licensePublicKey.mjs');

function ensureKeys(force = false) {
  fs.mkdirSync(secretDir, { recursive: true });
  if (!force && fs.existsSync(privKeyPath)) {
    const privateKeyPem = fs.readFileSync(privKeyPath, 'utf8');
    return { privateKeyPem, created: false };
  }

  const { publicKeyPem, privateKeyPem } = generateMerchantKeyPair();
  fs.writeFileSync(privKeyPath, privateKeyPem, { encoding: 'utf8' });
  const moduleCode = [
    '// Merchant Ed25519 Public Key (Safe to distribute in client & GitHub).',
    '// Private key stays strictly in .pocket-deck-secret/merchant-private.pem (gitignored).',
    `export const MERCHANT_PUBLIC_KEY_PEM = \`${publicKeyPem.trim()}\\n\`;`,
    '',
  ].join('\n');
  fs.writeFileSync(pubKeyModulePath, moduleCode, 'utf8');
  return { privateKeyPem, publicKeyPem, created: true };
}

const args = process.argv.slice(2);
const cmd = args[0] || 'generate';

if (cmd === 'init') {
  const force = args.includes('--force');
  const res = ensureKeys(force);
  console.log(
    res.created
      ? '✅ 已生成全新 Ed25519 商户公私钥！私钥已安全保存至 .pocket-deck-secret/merchant-private.pem，公钥已写入 src/licensePublicKey.mjs'
      : 'ℹ️  商户私钥已存在 (.pocket-deck-secret/merchant-private.pem)。如需重置请加 --force（注意：重置后旧卡密将失效）'
  );
} else if (cmd === 'generate') {
  const { privateKeyPem, created } = ensureKeys(false);
  if (created) {
    console.log('🔐 首次运行已自动初始化商户专属 Ed25519 签名密钥对！');
  }

  const countIdx = args.indexOf('--count');
  const count = countIdx >= 0 ? Math.max(1, Math.min(5000, Number(args[countIdx + 1]) || 20)) : 50;
  const tierIdx = args.indexOf('--tier');
  const tier = tierIdx >= 0 && args[tierIdx + 1] === 'studio' ? 'studio' : 'pro';

  const serialFile = path.join(secretDir, 'next-serial.txt');
  let nextSerial = 100101;
  if (fs.existsSync(serialFile)) {
    nextSerial = Math.max(100101, Number(fs.readFileSync(serialFile, 'utf8').trim()) || 100101);
  }

  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push(signLicenseKey({ privateKeyPem, tier, serial: nextSerial++ }));
  }
  fs.writeFileSync(serialFile, String(nextSerial), 'utf8');

  const outPath = path.join(secretDir, `cards-${tier}-${new Date().toISOString().slice(0, 10)}.txt`);
  fs.appendFileSync(outPath, keys.join('\n') + '\n', 'utf8');

  console.log(`\n🎉 成功签发 ${count} 张 [${tier.toUpperCase()}] 离线激活码！`);
  console.log(`📂 卡密文件已追加保存至（每行 1 个，可直接粘贴进闲鱼自动发货 / 面包多卡密库）：`);
  console.log(`   ${outPath}\n`);
  console.log(`🔑 前 5 张预览测试卡密：`);
  keys.slice(0, 5).forEach((k, idx) => console.log(`   [${idx + 1}] ${k}`));
  console.log('');
} else if (cmd === 'verify') {
  const target = args[1] || '';
  const { MERCHANT_PUBLIC_KEY_PEM } = await import('../src/licensePublicKey.mjs');
  const result = verifyLicenseKey(target, MERCHANT_PUBLIC_KEY_PEM);
  console.log(result);
} else {
  console.log('用法:');
  console.log('  node bin/keygen.mjs init                # 初始化商户公私钥');
  console.log('  node bin/keygen.mjs generate --count 50 # 批量签发 50 张激活码（闲鱼/面包多发货用）');
  console.log('  node bin/keygen.mjs verify <PDPRO-...>  # 校验任意激活码');
}
