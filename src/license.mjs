import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MERCHANT_PUBLIC_KEY_PEM } from './licensePublicKey.mjs';

const EPOCH_2025_MS = Date.UTC(2025, 0, 1);
const LICENSE_VERSION = 1;

export function generateMerchantKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function signLicenseKey({ privateKeyPem, tier = 'pro', serial, issuedDate = new Date() }) {
  const tierCode = tier === 'studio' ? 2 : 1;
  const epochDays = Math.max(0, Math.floor((issuedDate.getTime() - EPOCH_2025_MS) / 86_400_000));
  const serialNum =
    typeof serial === 'number' && serial > 0 ? serial >>> 0 : crypto.randomInt(100000, 999999);

  const header = Buffer.alloc(10);
  header[0] = LICENSE_VERSION;
  header[1] = tierCode;
  header.writeUInt32BE(epochDays, 2);
  header.writeUInt32BE(serialNum, 6);

  const signature = crypto.sign(null, header, privateKeyPem);
  const packed = Buffer.concat([header, signature]).toString('base64url');
  return `PDPRO-${packed}`;
}

export function verifyLicenseKey(rawInput, publicKeyPem = MERCHANT_PUBLIC_KEY_PEM) {
  const cleaned = String(rawInput || '').trim();
  if (!cleaned) {
    return { valid: false, isPro: false, error: '请输入激活码' };
  }
  if (!/^pdpro-/i.test(cleaned)) {
    return { valid: false, isPro: false, error: '激活码格式不正确（应以 PDPRO- 开头）' };
  }

  const body = cleaned.slice(6).trim();
  let buf;
  try {
    buf = Buffer.from(body, 'base64url');
  } catch {
    return { valid: false, isPro: false, error: '激活码编码无效' };
  }

  if (buf.length !== 74 || buf.toString('base64url') !== body) {
    return { valid: false, isPro: false, error: '激活码长度或校验位不匹配，请检查是否复制完整' };
  }

  const version = buf[0];
  const tierCode = buf[1];
  if (version !== LICENSE_VERSION || (tierCode !== 1 && tierCode !== 2)) {
    return { valid: false, isPro: false, error: '不支持的激活码版本' };
  }

  const header = buf.subarray(0, 10);
  const signature = buf.subarray(10, 74);

  try {
    const ok = crypto.verify(null, header, publicKeyPem, signature);
    if (!ok) {
      return { valid: false, isPro: false, error: '激活码签名校验未通过，请核对卡密' };
    }
  } catch {
    return { valid: false, isPro: false, error: '公钥校验异常，请联系作者获取最新安装包' };
  }

  const epochDays = header.readUInt32BE(2);
  const serialNum = header.readUInt32BE(6);
  const issuedAt = new Date(EPOCH_2025_MS + epochDays * 86_400_000).toISOString().slice(0, 10);

  return {
    valid: true,
    isPro: true,
    tier: tierCode === 2 ? 'studio' : 'pro',
    tierLabel: tierCode === 2 ? 'Studio 工作室买断版' : 'Pro 终身专业版',
    serial: `#${String(serialNum).padStart(6, '0')}`,
    issuedAt,
  };
}

export function loadShopConfig(rootDir) {
  const defaults = {
    priceLabel: '¥19.9 终身买断（一次激活 · 永久免费升级）',
    shopUrl: '',
    shopChannelNote: '在闲鱼 / 面包多拍下后系统 24h 自动秒发激活码，粘贴到下方即可永久解锁全部专业面板与主题！',
    contactNote: '闲鱼搜索「PocketDeck无线宏键盘」或联系作者获取卡密',
  };
  const cfgPath = path.join(rootDir, 'shop-config.json');
  if (!fs.existsSync(cfgPath)) return defaults;
  try {
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}
