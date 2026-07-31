import {
  extractMotionPixels,
  findMotionWindow,
  meanAbsDiff,
  motionThreshold,
  type MotionSensitivity,
} from './motion'

export type BlendMode = 'motion' | 'lighten' | 'average'

export type StrobeOptions = {
  /** Effective output sampling rate (e.g. 15 ≈ every 16 frames at 240fps) */
  fps: number
  /** Original recording frame rate (e.g. 240) */
  sourceFps: number
  blendMode: BlendMode
  /** Motion extraction sensitivity (motion mode only) */
  sensitivity?: MotionSensitivity
  /** Auto-trim to the falling / moving interval before dense sampling */
  autoMotionTrim?: boolean
  startSec?: number
  endSec?: number
  maxFrames?: number
  maxLongEdge?: number
  signal?: AbortSignal
  onProgress?: (progress: StrobeProgress) => void
}

export type StrobeProgress = {
  current: number
  total: number
  ratio: number
  phase?: 'probe' | 'compose'
}

export type StrobeResult = {
  canvas: HTMLCanvasElement
  frameCount: number
  duration: number
  width: number
  height: number
  truncated: boolean
  usedStart: number
  usedEnd: number
  autoTrimmed: boolean
}

const DEFAULT_MAX_FRAMES = 60
const DEFAULT_MAX_LONG_EDGE = 1280

function waitForEvent(
  target: EventTarget,
  event: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const onEvent = () => {
      cleanup()
      resolve()
    }

    const cleanup = () => {
      target.removeEventListener(event, onEvent)
      signal?.removeEventListener('abort', onAbort)
    }

    target.addEventListener(event, onEvent, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function loadVideo(file: File, signal?: AbortSignal): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)

    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.src = objectUrl

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
    }

    const onAbort = () => {
      cleanup()
      URL.revokeObjectURL(objectUrl)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const onLoaded = () => {
      cleanup()
      resolve(video)
    }

    const onError = () => {
      cleanup()
      URL.revokeObjectURL(objectUrl)
      reject(
        new Error(
          'この動画を読み込めませんでした。別の形式（MP4 など）でお試しください。',
        ),
      )
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    video.addEventListener('loadedmetadata', onLoaded, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

async function seekVideo(
  video: HTMLVideoElement,
  time: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const clamped = Math.min(Math.max(time, 0), Math.max(video.duration - 0.001, 0))

  if (Math.abs(video.currentTime - clamped) < 0.001) {
    return
  }

  const seekPromise = waitForEvent(video, 'seeked', signal)
  video.currentTime = clamped
  await seekPromise
}

function computeOutputSize(
  videoWidth: number,
  videoHeight: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(videoWidth, videoHeight)
  if (longEdge <= maxLongEdge) {
    return { width: videoWidth, height: videoHeight }
  }
  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  }
}

/**
 * Frame-index based sampling:
 * sourceFps=240, fps=15 → take 1 frame every 16 source frames.
 */
function buildSampleTimes(
  start: number,
  end: number,
  sourceFps: number,
  sampleFps: number,
  maxFrames: number,
): { times: number[]; truncated: boolean; frameStep: number } {
  const step = Math.max(1, Math.round(sourceFps / sampleFps))
  const startFrame = Math.max(0, Math.floor(start * sourceFps))
  const endFrame = Math.max(startFrame, Math.floor(end * sourceFps))
  const times: number[] = []
  let truncated = false

  for (let frame = startFrame; frame <= endFrame; frame += step) {
    if (times.length >= maxFrames) {
      truncated = true
      break
    }
    const time = Math.min(end, Math.max(start, (frame + 0.5) / sourceFps))
    times.push(time)
  }

  if (times.length === 0) {
    times.push(start)
  }

  return { times, truncated, frameStep: step }
}

function buildProbeTimes(start: number, end: number, count: number): number[] {
  if (end <= start) return [start]
  const n = Math.max(2, count)
  const times: number[] = []
  for (let i = 0; i < n; i++) {
    times.push(start + ((end - start) * i) / (n - 1))
  }
  return times
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

export async function createStrobeFromVideo(
  file: File,
  options: StrobeOptions,
): Promise<StrobeResult> {
  const {
    fps,
    sourceFps,
    blendMode,
    sensitivity = 'medium',
    autoMotionTrim = blendMode === 'motion',
    startSec,
    endSec,
    maxFrames = DEFAULT_MAX_FRAMES,
    maxLongEdge = DEFAULT_MAX_LONG_EDGE,
    signal,
    onProgress,
  } = options

  if (fps <= 0 || !Number.isFinite(fps)) {
    throw new Error('サンプリング fps が不正です。')
  }

  if (sourceFps <= 0 || !Number.isFinite(sourceFps)) {
    throw new Error('元動画の fps が不正です。')
  }

  const video = await loadVideo(file, signal)
  const objectUrl = video.src

  try {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('動画の長さを取得できませんでした。')
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error('動画の解像度を取得できませんでした。')
    }

    const duration = video.duration
    let start = Math.max(0, startSec ?? 0)
    let end = Math.min(duration, endSec ?? duration)
    let autoTrimmed = false

    if (start >= end) {
      throw new Error('開始時刻は終了時刻より前にしてください。')
    }

    const { width, height } = computeOutputSize(
      video.videoWidth,
      video.videoHeight,
      maxLongEdge,
    )

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new Error('Canvas を初期化できませんでした。')
    }

    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = width
    frameCanvas.height = height
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true })
    if (!frameCtx) {
      throw new Error('フレーム用 Canvas を初期化できませんでした。')
    }

    const overlayCanvas = document.createElement('canvas')
    overlayCanvas.width = width
    overlayCanvas.height = height
    const overlayCtx = overlayCanvas.getContext('2d')
    if (!overlayCtx) {
      throw new Error('オーバーレイ用 Canvas を初期化できませんでした。')
    }

    try {
      await video.play()
      video.pause()
    } catch {
      // ignore
    }

    // Background = first frame of the selected range (usually empty hand / floor)
    await seekVideo(video, start, signal)
    frameCtx.drawImage(video, 0, 0, width, height)
    const background = frameCtx.getImageData(0, 0, width, height)

    if (blendMode === 'motion' && autoMotionTrim) {
      const probeTimes = buildProbeTimes(start, end, 36)
      const scores: number[] = []

      for (let i = 0; i < probeTimes.length; i++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        await seekVideo(video, probeTimes[i], signal)
        frameCtx.drawImage(video, 0, 0, width, height)
        const frame = frameCtx.getImageData(0, 0, width, height)
        scores.push(meanAbsDiff(frame, background))
        onProgress?.({
          current: i + 1,
          total: probeTimes.length,
          ratio: (i + 1) / probeTimes.length * 0.25,
          phase: 'probe',
        })
        await yieldToMain()
      }

      const window = findMotionWindow(probeTimes, scores)
      if (window) {
        start = Math.max(start, window.start)
        end = Math.min(end, window.end)
        autoTrimmed = true
        // Refresh background just before motion so hands entering the frame aren't baked in
        await seekVideo(video, start, signal)
        frameCtx.drawImage(video, 0, 0, width, height)
        const refreshed = frameCtx.getImageData(0, 0, width, height)
        background.data.set(refreshed.data)
      }
    }

    if (start >= end) {
      throw new Error('動いている区間を検出できませんでした。区間を手動で指定してください。')
    }

    const { times, truncated } = buildSampleTimes(
      start,
      end,
      sourceFps,
      fps,
      maxFrames,
    )

    const threshold = motionThreshold(sensitivity)
    const alpha = blendMode === 'average' ? 1 / times.length : 1

    // Paint background first for motion mode
    if (blendMode === 'motion') {
      ctx.putImageData(background, 0, 0)
    }

    for (let i = 0; i < times.length; i++) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      await seekVideo(video, times[i], signal)

      frameCtx.clearRect(0, 0, width, height)
      frameCtx.drawImage(video, 0, 0, width, height)

      if (blendMode === 'motion') {
        const frame = frameCtx.getImageData(0, 0, width, height)
        const motion = extractMotionPixels(frame, background, threshold)
        overlayCtx.clearRect(0, 0, width, height)
        overlayCtx.putImageData(motion, 0, 0)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        ctx.drawImage(overlayCanvas, 0, 0)
      } else if (i === 0) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        ctx.drawImage(frameCanvas, 0, 0)
      } else if (blendMode === 'lighten') {
        ctx.globalCompositeOperation = 'lighten'
        ctx.globalAlpha = 1
        ctx.drawImage(frameCanvas, 0, 0)
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = alpha
        ctx.drawImage(frameCanvas, 0, 0)
      }

      const base = blendMode === 'motion' && autoMotionTrim ? 0.25 : 0
      const span = 1 - base
      onProgress?.({
        current: i + 1,
        total: times.length,
        ratio: base + ((i + 1) / times.length) * span,
        phase: 'compose',
      })

      await yieldToMain()
    }

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    return {
      canvas,
      frameCount: times.length,
      duration,
      width,
      height,
      truncated,
      usedStart: start,
      usedEnd: end,
      autoTrimmed,
    }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('画像の書き出しに失敗しました。'))
      },
      type,
      quality,
    )
  })
}
