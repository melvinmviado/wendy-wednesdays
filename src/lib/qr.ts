// A small QR code encoder: byte mode, error correction level M, versions 1-10 (up to 213 bytes,
// plenty for a page link). No dependencies. Follows ISO/IEC 18004; the structure mirrors Project
// Nayuki's reference encoder (MIT). Returns the module grid; components/QrCode.tsx draws it.

const MAX_VERSION = 10
// Level M, versions 1..10: error correction codewords per block, and number of blocks.
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const NUM_BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const FORMAT_BITS_M = 0 // level M's two format bits

export interface QrMatrix {
  version: number
  mask: number
  size: number
  /** modules[y][x], true = dark. */
  modules: boolean[][]
}

// ---- Reed-Solomon over GF(2^8), polynomial 0x11D ----

function gfMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

export function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

export function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => (result[i] ^= gfMultiply(coef, factor)))
  }
  return result
}

// ---- Sizes ----

function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  return result
}

const dataCodewords = (ver: number) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver - 1] * NUM_BLOCKS[ver - 1]

function alignmentPositions(ver: number, size: number): number[] {
  if (ver === 1) return []
  const numAlign = Math.floor(ver / 7) + 2
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2
  const result = [6]
  for (let i = numAlign - 2; i >= 0; i--) result.push(size - 7 - i * step)
  return result
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0

// ---- Codewords ----

function encodeData(bytes: Uint8Array, ver: number): number[] {
  const capacity = dataCodewords(ver) * 8
  const bits: number[] = []
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  push(0b0100, 4) // byte mode
  push(bytes.length, ver < 10 ? 8 : 16)
  bytes.forEach((b) => push(b, 8))
  push(0, Math.min(4, capacity - bits.length)) // terminator
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8)
  const out: number[] = []
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0))
  return out
}

function addErrorCorrection(data: number[], ver: number): number[] {
  const numBlocks = NUM_BLOCKS[ver - 1]
  const blockEccLen = ECC_PER_BLOCK[ver - 1]
  const rawCodewords = Math.floor(rawDataModules(ver) / 8)
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
  const shortBlockLen = Math.floor(rawCodewords / numBlocks)
  const divisor = rsDivisor(blockEccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, divisor)
    if (i < numShortBlocks) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const result: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i])
    })
  }
  return result
}

// ---- The matrix ----

function buildMatrix(ver: number, codewords: number[], mask: number): QrMatrix {
  const size = ver * 4 + 17
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark
    isFunction[y][x] = true
  }

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4)
      }
    }
  }
  const align = alignmentPositions(ver, size)
  align.forEach((ax, i) => {
    align.forEach((ay, j) => {
      const corner = (i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)
      if (corner) return
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    })
  })

  // Format information (both copies) and the always-dark module.
  const format = (FORMAT_BITS_M << 3) | mask
  let rem = format
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const formatBits = ((format << 10) | rem) ^ 0x5412
  for (let i = 0; i <= 5; i++) set(8, i, bit(formatBits, i))
  set(8, 7, bit(formatBits, 6))
  set(8, 8, bit(formatBits, 7))
  set(7, 8, bit(formatBits, 8))
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(formatBits, i))
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(formatBits, i))
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(formatBits, i))
  set(8, size - 8, true)

  // Version information, from version 7.
  if (ver >= 7) {
    let r = ver
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25)
    const versionBits = (ver << 12) | r
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, bit(versionBits, i))
      set(b, a, bit(versionBits, i))
    }
  }

  // Data, in the zigzag order, then the mask.
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!isFunction[y][x] && i < codewords.length * 8) {
          modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7))
          i++
        }
      }
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFunction[y][x] && maskBit(mask, x, y)) modules[y][x] = !modules[y][x]
    }
  }
  return { version: ver, mask, size, modules }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0
    case 1: return y % 2 === 0
    case 2: return x % 3 === 0
    case 3: return (x + y) % 3 === 0
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  }
}

/** The ISO penalty rules: long runs, 2x2 blocks, finder-like patterns, dark/light balance. */
export function penalty({ modules, size }: QrMatrix): number {
  let score = 0
  const at = (x: number, y: number, vertical: boolean) => (vertical ? modules[x][y] : modules[y][x])
  const finderLike = [true, false, true, true, true, false, true]
  for (const vertical of [false, true]) {
    for (let y = 0; y < size; y++) {
      let run = 1
      for (let x = 1; x <= size; x++) {
        if (x < size && at(x, y, vertical) === at(x - 1, y, vertical)) {
          run++
        } else {
          if (run >= 5) score += run - 2
          run = 1
        }
      }
      for (let x = 0; x + 7 <= size; x++) {
        if (!finderLike.every((v, k) => at(x + k, y, vertical) === v)) continue
        const lightBefore = [1, 2, 3, 4].every((k) => x - k < 0 || !at(x - k, y, vertical))
        const lightAfter = [0, 1, 2, 3].every((k) => x + 7 + k >= size || !at(x + 7 + k, y, vertical))
        if (lightBefore || lightAfter) score += 40
      }
    }
  }
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = modules[y][x]
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3
    }
  }
  const dark = modules.reduce((n, row) => n + row.filter(Boolean).length, 0)
  const total = size * size
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10
  return score
}

/**
 * Encodes `text` (UTF-8) at the smallest version that fits. `mask` forces a mask pattern;
 * otherwise the one with the lowest penalty is used. Throws RangeError if it does not fit.
 */
export function encodeQr(text: string, options: { mask?: number; minVersion?: number } = {}): QrMatrix {
  const bytes = new TextEncoder().encode(text)
  let ver = Math.max(1, options.minVersion ?? 1)
  while (ver <= MAX_VERSION && 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver) * 8) ver++
  if (ver > MAX_VERSION) throw new RangeError(`Too long for a QR code here: ${bytes.length} bytes`)
  const codewords = addErrorCorrection(encodeData(bytes, ver), ver)
  if (options.mask !== undefined) return buildMatrix(ver, codewords, options.mask)
  let best: QrMatrix | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const m = buildMatrix(ver, codewords, mask)
    const s = penalty(m)
    if (s < bestScore) {
      best = m
      bestScore = s
    }
  }
  return best as QrMatrix
}
