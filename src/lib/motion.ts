export type MotionSensitivity = 'low' | 'medium' | 'high'

const THRESHOLD: Record<MotionSensitivity, number> = {
  // Average channel delta (0-255). Lower = pick up smaller / dimmer balls.
  low: 18,
  medium: 30,
  high: 48,
}

export function motionThreshold(sensitivity: MotionSensitivity): number {
  return THRESHOLD[sensitivity]
}

/** Mean absolute RGB difference across the frame. */
export function meanAbsDiff(a: ImageData, b: ImageData): number {
  const ad = a.data
  const bd = b.data
  const len = ad.length
  let sum = 0
  let count = 0
  // Stride sampling for speed on mobile
  for (let i = 0; i < len; i += 32) {
    sum +=
      Math.abs(ad[i] - bd[i]) +
      Math.abs(ad[i + 1] - bd[i + 1]) +
      Math.abs(ad[i + 2] - bd[i + 2])
    count += 3
  }
  return count === 0 ? 0 : sum / count
}

/**
 * Build an RGBA ImageData that keeps only pixels different from the background.
 * Tiny dilation helps keep small balls from vanishing.
 */
export function extractMotionPixels(
  frame: ImageData,
  background: ImageData,
  threshold: number,
): ImageData {
  const { width, height } = frame
  const out = new ImageData(width, height)
  const f = frame.data
  const b = background.data
  const o = out.data
  const mask = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const i = p * 4
      const diff =
        (Math.abs(f[i] - b[i]) +
          Math.abs(f[i + 1] - b[i + 1]) +
          Math.abs(f[i + 2] - b[i + 2])) /
        3
      if (diff >= threshold) mask[p] = 1
    }
  }

  // 1px dilation so a small ball survives compression / slight misalignment
  const dilated = new Uint8Array(mask)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      if (mask[p]) continue
      if (
        mask[p - 1] ||
        mask[p + 1] ||
        mask[p - width] ||
        mask[p + width]
      ) {
        dilated[p] = 1
      }
    }
  }

  for (let p = 0; p < mask.length; p++) {
    const i = p * 4
    if (dilated[p]) {
      o[i] = f[i]
      o[i + 1] = f[i + 1]
      o[i + 2] = f[i + 2]
      o[i + 3] = 255
    } else {
      o[i + 3] = 0
    }
  }

  return out
}

/**
 * Find the main moving interval from coarse probe scores.
 * Returns null when motion is too weak to trust.
 */
export function findMotionWindow(
  times: number[],
  scores: number[],
  paddingSec = 0.12,
): { start: number; end: number } | null {
  if (times.length === 0 || scores.length !== times.length) return null

  const max = Math.max(...scores)
  if (max < 2.5) return null

  const cutoff = Math.max(max * 0.28, 2)
  let first = -1
  let last = -1

  for (let i = 0; i < scores.length; i++) {
    if (scores[i] >= cutoff) {
      if (first < 0) first = i
      last = i
    }
  }

  if (first < 0 || last < 0) return null

  // Prefer the densest contiguous run if the clip has multiple bursts
  let bestStart = first
  let bestEnd = last
  let bestLen = last - first
  let runStart = -1

  for (let i = 0; i <= scores.length; i++) {
    const active = i < scores.length && scores[i] >= cutoff
    if (active && runStart < 0) runStart = i
    if (!active && runStart >= 0) {
      const runEnd = i - 1
      const len = runEnd - runStart
      if (len > bestLen) {
        bestLen = len
        bestStart = runStart
        bestEnd = runEnd
      }
      runStart = -1
    }
  }

  const start = Math.max(0, times[bestStart] - paddingSec)
  const end = times[bestEnd] + paddingSec
  if (end - start < 0.05) return null
  return { start, end }
}
