/**
 * Zero-Dependency ISO/IEC 18004 QR Code SVG Generator (Byte Mode, ECC Level L, Versions 1..6)
 * Generates crisp scannable <svg> QR codes for instant Wi-Fi LAN phone pairing without external packages.
 */

// Version 1..6 specs for ECC Level L: [totalCodewords, ecCodewordsPerBlock, alignmentCenters[]]
const VERSION_SPECS = [
  null,
  { total: 26, ec: 7, align: [] },
  { total: 44, ec: 10, align: [6, 18] },
  { total: 70, ec: 15, align: [6, 22] },
  { total: 100, ec: 20, align: [6, 26] },
  { total: 134, ec: 26, align: [6, 30] },
  { total: 172, ec: 18, blocks: 2, align: [6, 34] }, // 2 blocks of (68 data + 18 ec)
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let i = 0; i < ecLen; i++) {
      rem[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return rem;
}

export function encodeQrMatrix(text) {
  const bytes = Buffer.from(text, 'utf8');
  let ver = 1;
  while (ver <= 6) {
    const sp = VERSION_SPECS[ver];
    const blocks = sp.blocks || 1;
    const dataCap = sp.total - sp.ec * blocks;
    if (bytes.length + 2 <= dataCap) break;
    ver++;
  }
  if (ver > 6) throw new Error('QR payload exceeds Version 6 capacity');

  const spec = VERSION_SPECS[ver];
  const blocks = spec.blocks || 1;
  const dataCap = spec.total - spec.ec * blocks;

  // Bit buffer: Mode 0100 (Byte) + 8-bit char count + payload + terminator + pad bytes
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  for (let i = 0; i < 4 && bits.length < dataCap * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataWords = new Uint8Array(dataCap);
  for (let i = 0; i < bits.length / 8; i++) {
    let w = 0;
    for (let b = 0; b < 8; b++) w = (w << 1) | bits[i * 8 + b];
    dataWords[i] = w;
  }
  let padIdx = Math.floor(bits.length / 8);
  let padToggle = true;
  while (padIdx < dataCap) {
    dataWords[padIdx++] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  // Interleave blocks if blocks > 1
  const codewords = [];
  if (blocks === 1) {
    const ec = rsEncode(dataWords, spec.ec);
    codewords.push(...dataWords, ...ec);
  } else {
    const half = dataCap / 2;
    const b1 = dataWords.slice(0, half);
    const b2 = dataWords.slice(half);
    const ec1 = rsEncode(b1, spec.ec);
    const ec2 = rsEncode(b2, spec.ec);
    for (let i = 0; i < half; i++) codewords.push(b1[i], b2[i]);
    for (let i = 0; i < spec.ec; i++) codewords.push(ec1[i], ec2[i]);
  }

  const size = 17 + ver * 4;
  const grid = Array.from({ length: size }, () => new Uint8Array(size));
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));

  const setModule = (r, c, dark) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    grid[r][c] = dark ? 1 : 0;
    reserved[r][c] = 1;
  };

  const placeFinder = (row, col) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onRing = r === 0 || r === 6 || c === 0 || c === 6;
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(row + r, col + c, inOuter && (onRing || inCore));
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment patterns
  for (const r of spec.align) {
    for (const c of spec.align) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setModule(r + dr, c + dc, dark);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // Dark module & reserve format areas
  setModule(size - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = 1;
    if (!reserved[i][8]) reserved[i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    if (!reserved[8][size - 1 - i]) reserved[8][size - 1 - i] = 1;
    if (!reserved[size - 1 - i][8]) reserved[size - 1 - i][8] = 1;
  }

  // Place data bits upward/downward in 2-col zigzags with Mask 0 ((r + c) % 2 === 0)
  const allBits = [];
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) allBits.push((cw >> b) & 1);
  }
  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (const c of [right, right - 1]) {
        if (!reserved[r][c]) {
          const rawBit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          const mask = (r + c) % 2 === 0 ? 1 : 0;
          grid[r][c] = rawBit ^ mask;
        }
      }
    }
    upward = !upward;
  }

  // Format bits for ECC Level L (01) + Mask 0 (000) -> precomputed BCH masked with 101010000010010 = 0x77c4
  const formatBits = 0x77c4;
  const fBit = (i) => (formatBits >> i) & 1;

  for (let i = 0; i <= 5; i++) grid[8][i] = fBit(14 - i);
  grid[8][7] = fBit(8);
  grid[8][8] = fBit(7);
  grid[7][8] = fBit(6);
  for (let i = 0; i <= 5; i++) grid[5 - i][8] = fBit(5 - i);

  for (let i = 0; i <= 7; i++) grid[8][size - 1 - i] = fBit(i);
  for (let i = 0; i <= 6; i++) grid[size - 7 + i][8] = fBit(8 + i);

  return grid;
}

export function renderQrSvg(text, quietZone = 3) {
  const matrix = encodeQrMatrix(text);
  const n = matrix.length;
  const total = n + quietZone * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        path += `M${c + quietZone},${r + quietZone}h1v1h-1z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff" rx="2"/><path d="${path}" fill="#090d16"/></svg>`;
}
