#!/usr/bin/env node
'use strict';

/**
 * generate-assets.js — dependency-free placeholder art generator.
 * -------------------------------------------------------------------------
 * Procedurally renders the eyeFind brand mark and a pointer cursor straight
 * to PNG/ICO using only Node's stdlib (zlib). No binaries are committed and
 * nothing is downloaded, so a fresh clone produces identical artwork and the
 * first `npm run dist` has all the icons it needs.
 *
 *   node scripts/generate-assets.js          # create only what's missing
 *   node scripts/generate-assets.js --force  # overwrite existing files
 *
 * Replace the generated files with real eyeFind art whenever you like — by
 * default this script leaves existing assets untouched.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSETS = path.join(__dirname, '..', 'assets');
const FORCE = process.argv.includes('--force');

/* ----------------------------------------------------------------------- *
 * Colour helpers
 * ----------------------------------------------------------------------- */
function hex(value) {
  const h = value.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/* ----------------------------------------------------------------------- *
 * PNG encoder (truecolour + alpha, 8-bit)
 * ----------------------------------------------------------------------- */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // compression / filter / interlace already zero

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/* ----------------------------------------------------------------------- *
 * Supersampled software renderer.
 * `sampler(x, y)` returns straight [r, g, b, a] in 0..255; sub-pixel samples
 * are averaged in premultiplied space so edges stay clean (no dark fringing).
 * ----------------------------------------------------------------------- */
function render(size, sampler, ss) {
  ss = ss || 4;
  const out = Buffer.alloc(size * size * 4);
  const inv = 1 / ss;
  const samples = ss * ss;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sampler(px + (sx + 0.5) * inv, py + (sy + 0.5) * inv);
          const alpha = c[3] / 255;
          r += c[0] * alpha;
          g += c[1] * alpha;
          b += c[2] * alpha;
          a += alpha;
        }
      }
      const o = (py * size + px) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((255 * a) / samples);
    }
  }
  return out;
}

/* ----------------------------------------------------------------------- *
 * The eyeFind app mark — an eye on a rounded sky-blue tile with the
 * signature yellow underline.
 * ----------------------------------------------------------------------- */
function iconSampler(size) {
  const top = hex('#57a4e0');
  const bottom = hex('#3b90d2');
  const sclera = [255, 255, 255];
  const rim = hex('#0d3a5a');
  const iris = hex('#14507a');
  const pupil = hex('#0a2230');
  const yellow = hex('#fbc02d');

  const MARGIN = 0.06; // transparent breathing room around the tile
  const RADIUS = 0.16; // rounded-tile corner radius, normalised
  const half = 0.5 - MARGIN; // half-extent of the tile
  const innerHalf = half - RADIUS; // straight-edge half-extent

  return function (px, py) {
    const x = px / size;
    const y = py / size;

    // Rounded-rect tile mask — proper signed distance, so the tile fills the
    // canvas (minus a margin) with genuinely rounded corners.
    const dx = Math.abs(x - 0.5) - innerHalf;
    const dy = Math.abs(y - 0.5) - innerHalf;
    const ox = Math.max(dx, 0);
    const oy = Math.max(dy, 0);
    const sdf = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - RADIUS;
    if (sdf > 0) return [0, 0, 0, 0];

    let col = mix(top, bottom, Math.min(Math.max(y, 0), 1));

    // Eye, centred a touch above the middle.
    const ex = x - 0.5;
    const ey = y - 0.46;
    const rx = 0.31;
    const ry = 0.196;
    const ellipse = (ex * ex) / (rx * rx) + (ey * ey) / (ry * ry);

    if (ellipse <= 1.0) {
      col = sclera;
      const ir = Math.sqrt(ex * ex + ey * ey);
      if (ir <= 0.135) col = iris;
      if (ir <= 0.064) col = pupil;
      const gx = x - 0.55;
      const gy = y - 0.405;
      if (gx * gx + gy * gy <= 0.03 * 0.03) col = sclera; // catch-light
    } else if (ellipse <= 1.16) {
      col = rim; // thin rim for definition against the tile
    }

    // Yellow underline accent — a slim centred capsule echoing the chrome's
    // divider, clipped naturally by the tile's rounded bottom.
    const halfLen = 0.2;
    const thick = 0.016;
    const clampedX = Math.min(Math.max(x, 0.5 - halfLen), 0.5 + halfLen);
    const bx = x - clampedX;
    const by = y - 0.82;
    if (Math.sqrt(bx * bx + by * by) <= thick) col = yellow;

    return [Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), 255];
  };
}

/* ----------------------------------------------------------------------- *
 * Pointer cursor — a clean arrow with a dark outline, tip at the top-left
 * (hotspot 0,0, matching the CSS `url(...), pointer` fallback).
 * ----------------------------------------------------------------------- */
function pointerSampler(size) {
  const s = size / 32;
  const poly = [
    [1.0, 1.0],
    [1.0, 27.4],
    [6.78, 21.6],
    [10.9, 31.5],
    [15.0, 29.9],
    [10.9, 19.98],
    [18.3, 19.98]
  ].map((p) => [p[0] * s, p[1] * s]);

  const fill = [255, 255, 255];
  const line = hex('#16242f');
  const border = 1.3 * s;

  function inside(x, y) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  function edgeDistance(x, y) {
    let min = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0], ay = poly[j][1];
      const bx = poly[i][0], by = poly[i][1];
      const vx = bx - ax, vy = by - ay;
      let t = ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy);
      t = Math.min(1, Math.max(0, t));
      const d = Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
      if (d < min) min = d;
    }
    return min;
  }

  return function (x, y) {
    const within = inside(x, y);
    const d = edgeDistance(x, y);
    if (within) {
      return d > border ? [fill[0], fill[1], fill[2], 255] : [line[0], line[1], line[2], 255];
    }
    return d < border * 0.8 ? [line[0], line[1], line[2], 255] : [0, 0, 0, 0];
  };
}

/* ----------------------------------------------------------------------- *
 * ICO container — wraps one PNG per size (Vista+ / electron-builder happy).
 * ----------------------------------------------------------------------- */
function buildICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  const blobs = [];

  entries.forEach((entry, i) => {
    const o = i * 16;
    directory[o] = entry.size >= 256 ? 0 : entry.size; // width  (0 ⇒ 256)
    directory[o + 1] = entry.size >= 256 ? 0 : entry.size; // height (0 ⇒ 256)
    directory.writeUInt16LE(1, o + 4); // colour planes
    directory.writeUInt16LE(32, o + 6); // bits per pixel
    directory.writeUInt32LE(entry.buffer.length, o + 8);
    directory.writeUInt32LE(offset, o + 12);
    offset += entry.buffer.length;
    blobs.push(entry.buffer);
  });

  return Buffer.concat([header, directory, ...blobs]);
}

/* ----------------------------------------------------------------------- *
 * Emit
 * ----------------------------------------------------------------------- */
function writeAsset(name, buffer) {
  const target = path.join(ASSETS, name);
  if (fs.existsSync(target) && !FORCE) {
    console.log('  skip   ' + name + '  (already exists — pass --force to replace)');
    return;
  }
  fs.writeFileSync(target, buffer);
  console.log('  write  ' + name + '  (' + buffer.length.toLocaleString() + ' bytes)');
}

function main() {
  if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });
  console.log('eyeFind · generating placeholder assets' + (FORCE ? ' (force)' : '') + '\n');

  writeAsset('icon.png', encodePNG(512, 512, render(512, iconSampler(512), 4)));

  const icoSizes = [256, 64, 48, 32, 16];
  const icoEntries = icoSizes.map((sz) => ({
    size: sz,
    buffer: encodePNG(sz, sz, render(sz, iconSampler(sz), sz <= 48 ? 5 : 4))
  }));
  writeAsset('icon.ico', buildICO(icoEntries));

  writeAsset('gta-pointer.png', encodePNG(32, 32, render(32, pointerSampler(32), 5)));

  console.log('\nDone.');
}

main();
