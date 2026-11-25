import { describe, expect, it } from 'vitest'
import { encodeQr, rsDivisor, rsRemainder } from './qr'

const rows = (m: { modules: boolean[][] }) => m.modules.map((r) => r.map((b) => (b ? '1' : '0')).join(''))
const fnv = (s: string) => {
  let h = 0x811c9dc5
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0
  return h.toString(16)
}

// The fixtures were made with segno 1.6.6 (an independent Python encoder), with its padding set
// to the standard's (it writes 8 zero bits where the stream is already byte-aligned; readers
// ignore the difference). Every version 1-10 and every mask matched when this encoder was written.
const SEGNO_V1_MASK2 = [
  '111111100101001111111', '100000100010101000001', '101110101111001011101', '101110101110101011101',
  '101110101100101011101', '100000101110101000001', '111111101010101111111', '000000001001000000000',
  '101111100110101111100', '001100001010011111111', '000000111011111100110', '111101010011010011100',
  '111101100111011011001', '000000001010001111101', '111111100000100100110', '100000101101000111101',
  '101110101001001111011', '101110101000011010100', '101110101111101100100', '100000100101110011100',
  '111111101010001101010',
]

describe('encodeQr', () => {
  it('computes Reed-Solomon error correction (the "HELLO WORLD" 1-M example)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23])
  })

  it('matches an independent encoder, module for module (version 1)', () => {
    expect(rows(encodeQr('https://x.io/c', { mask: 2 }))).toEqual(SEGNO_V1_MASK2)
  })

  it('matches an independent encoder with version information and four blocks (version 7)', () => {
    const m = encodeQr('https://wendy-wednesdays.pages.dev/events/2026-11-25/courts?tv=1&abcdefghijklmnopqrstuvwxyz0123456789abcdefghij', { mask: 5 })
    expect(m.version).toBe(7)
    expect(fnv(rows(m).join('\n'))).toBe('dd36ec5')
  })

  it('picks the smallest version that fits, and a mask by penalty', () => {
    const m = encodeQr('https://wendy-wednesdays.pages.dev/events/2026-11-25/courts')
    expect(m.version).toBe(4) // 59 bytes: version 4 holds 62 at level M
    expect(m.size).toBe(33)
    expect(m.mask).toBeGreaterThanOrEqual(0)
    expect(encodeQr('https://wendy-wednesdays.pages.dev/events/2026-11-25/courts')).toEqual(m) // deterministic
  })

  it('refuses text longer than version 10 holds', () => {
    expect(() => encodeQr('x'.repeat(214))).toThrow(RangeError)
    expect(encodeQr('x'.repeat(213)).version).toBe(10)
  })
})
