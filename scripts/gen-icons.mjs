import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

function writePng(width, height, getPixel) {
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter byte
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x / width, y / height)
      const off = y * (width * 4 + 1) + 1 + x * 4
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a
    }
  }
  const compressed = zlib.deflateSync(raw)

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type)
    const crcBuf = Buffer.concat([typeB, data])
    const crc = crc32(crcBuf)
    const crcOut = Buffer.alloc(4); crcOut.writeInt32BE(crc)
    return Buffer.concat([len, typeB, data, crcOut])
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6 // bit depth 8, RGBA
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))])
}

function crc32(buf) {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c
  }
  let crc = -1
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1)
}

function lerp(a, b, t) { return a + (b - a) * t }
function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))) }

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function drawIcon(size) {
  const r = size * 0.19  // corner radius fraction

  function inRoundRect(x, y, rx, ry, rw, rh, rad) {
    const ex = Math.max(rx, Math.min(rx + rw, x)) - x
    const ey = Math.max(ry, Math.min(ry + rh, y)) - y
    const cx = x < rx + rad ? rx + rad : x > rx + rw - rad ? rx + rw - rad : x
    const cy = y < ry + rad ? ry + rad : y > ry + rh - rad ? ry + rh - rad : y
    const dx = x - cx, dy = y - cy
    return dx * dx + dy * dy <= rad * rad + 0.5
  }

  // Gradient purple→blue for inner card
  const [pr, pg, pb] = hexToRgb('#7c3aed')
  const [br, bg, bb] = hexToRgb('#3b82f6')
  const [nr, ng, nb] = hexToRgb('#0f172a')

  // Chart waypoints (normalized 0-1)
  const pts = [[0.22, 0.62], [0.36, 0.46], [0.5, 0.55], [0.64, 0.38], [0.78, 0.50]]

  function nearLine(px, py, thickness) {
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0] * size, ay = pts[i][1] * size
      const bx = pts[i + 1][0] * size, by = pts[i + 1][1] * size
      const dx = bx - ax, dy = by - ay
      const lenSq = dx * dx + dy * dy
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
      const nearX = ax + t * dx, nearY = ay + t * dy
      const dist = Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2)
      if (dist < thickness) return true
    }
    return false
  }

  function nearDot(px, py, rad) {
    for (let i = 1; i < pts.length - 1; i++) {
      const dx = px - pts[i][0] * size, dy = py - pts[i][1] * size
      if (dx * dx + dy * dy < rad * rad) return true
    }
    return false
  }

  return writePng(size, size, (nx, ny) => {
    const px = nx * size, py = ny * size
    const bgRound = inRoundRect(px, py, 0, 0, size, size, r)
    if (!bgRound) return [0, 0, 0, 0]

    // Inner card region
    const cardX = 0.14 * size, cardY = 0.28 * size
    const cardW = 0.72 * size, cardH = 0.48 * size
    const cardRad = 0.06 * size
    const inCard = inRoundRect(px, py, cardX, cardY, cardW, cardH, cardRad)

    const thick = size * 0.025
    const dotRad = size * 0.04

    if (nearDot(px, py, dotRad)) return [255, 255, 255, 255]
    if (nearLine(px, py, thick)) return [255, 255, 255, 230]

    if (inCard) {
      const t = (px - cardX) / cardW
      return [clamp(lerp(pr, br, t)), clamp(lerp(pg, bg, t)), clamp(lerp(pb, bb, t)), 255]
    }

    return [nr, ng, nb, 255]
  })
}

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), drawIcon(192))
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), drawIcon(512))
console.log('Icons written to public/')
