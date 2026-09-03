// Regenerates the two brand assets the UI draws, from the artwork in
// public/brand/. Run it after replacing an original:
//
//   node scripts/derive-brand.mjs
//
// It writes src/app/icon.png (the tab icon) and
// public/brand/entech-wordmark.png (the header lockup). Both are committed —
// this is not a build step, and nothing in the app runs it. See the header of
// src/components/brand.tsx for *why* each derivation exists.
//
// Pure node: PNG in, PNG out, zlib only, so it needs no dependency and no
// browser. It handles 8-bit non-interlaced PNGs, which is what the originals
// are; it throws rather than guessing on anything else.

import fs from "node:fs";
import zlib from "node:zlib";

function readPNG(p) {
  const buf = fs.readFileSync(p);
  let off = 8, w, h, bd, ct, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG unsupported"); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bd !== 8) throw new Error("bit depth " + bd + " unsupported");
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!ch) throw new Error("colour type " + ct + " unsupported");
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const base = y * (stride + 1), ft = raw[base];
    const line = Buffer.from(raw.subarray(base + 1, base + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 4;
      if (ch === 4) { out[d] = line[s]; out[d+1] = line[s+1]; out[d+2] = line[s+2]; out[d+3] = line[s+3]; }
      else if (ch === 3) { out[d] = line[s]; out[d+1] = line[s+1]; out[d+2] = line[s+2]; out[d+3] = 255; }
      else if (ch === 2) { out[d] = out[d+1] = out[d+2] = line[s]; out[d+3] = line[s+1]; }
      else { out[d] = out[d+1] = out[d+2] = line[s]; out[d+3] = 255; }
    }
    prev = line;
  }
  return { w, h, data: out };
}

const CRC = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return b => { let c = -1; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}
function writePNG(p, w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(p, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
  return fs.statSync(p).size;
}

const inkBox = (img, isInk) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    if (!isInk(img.data[i], img.data[i+1], img.data[i+2], img.data[i+3])) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

// --- 1. tab icon: trim the E to its ink, centre it on a square with a small margin,
//     box-downsample to 128 (premultiplied, so the edges do not fringe).
{
  const src = readPNG("public/brand/entech-icon.png");
  const b = inkBox(src, (r, g, bl, a) => a > 24);
  const S = 128, margin = 0.07, box = S * (1 - 2 * margin);
  const k = Math.min(box / b.w, box / b.h);
  const dw = Math.round(b.w * k), dh = Math.round(b.h * k);
  const ox = Math.round((S - dw) / 2), oy = Math.round((S - dh) / 2);
  const out = Buffer.alloc(S * S * 4);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx0 = b.x0 + (x * b.w) / dw, sx1 = b.x0 + ((x + 1) * b.w) / dw;
    const sy0 = b.y0 + (y * b.h) / dh, sy1 = b.y0 + ((y + 1) * b.h) / dh;
    let R = 0, G = 0, B = 0, A = 0, n = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++)
      for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
        const i = (sy * src.w + sx) * 4, a = src.data[i+3] / 255;
        R += src.data[i] * a; G += src.data[i+1] * a; B += src.data[i+2] * a; A += a; n++;
      }
    const d = ((y + oy) * S + (x + ox)) * 4;
    if (!n || A === 0) continue;
    out[d] = Math.round(R / A); out[d+1] = Math.round(G / A); out[d+2] = Math.round(B / A);
    out[d+3] = Math.round((A / n) * 255);
  }
  console.log("icon    ", `ink ${b.w}x${b.h} @${b.x0},${b.y0} -> ${S}x${S}`, writePNG("src/app/icon.png", S, S, out), "bytes");
}

// --- 2. header wordmark: crop the ENTECH letters off the logo (the tagline is
//     illegible at header size) and key the white plate out to transparency, so
//     the mark sits on the dark theme as well as the light one.
{
  const src = readPNG("public/brand/entech-logo.png");
  const CX = 29, CY = 42, CW = 292, CH = 30;
  const out = Buffer.alloc(CW * CH * 4);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const s = ((y + CY) * src.w + (x + CX)) * 4, d = (y * CW + x) * 4;
    const r = src.data[s], g = src.data[s+1], b = src.data[s+2];
    if (src.data[s+3] < 8) continue;                      // already transparent
    const a = 1 - Math.min(r, g, b) / 255;                // coverage over white
    if (a <= 0.004) continue;
    const un = v => Math.max(0, Math.min(255, Math.round((v - 255 * (1 - a)) / a)));
    out[d] = un(r); out[d+1] = un(g); out[d+2] = un(b); out[d+3] = Math.round(a * 255);
  }
  console.log("wordmark", `${CW}x${CH}`, writePNG("public/brand/entech-wordmark.png", CW, CH, out), "bytes");
}
