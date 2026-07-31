export type VideoMeta = {
  duration: number
  /** Detected or null when unknown */
  sourceFps: number | null
}

function readDurationWithVideoElement(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url

    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
    }

    video.onloadedmetadata = () => {
      const duration = video.duration
      cleanup()
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('動画の長さを取得できませんでした。'))
        return
      }
      resolve(duration)
    }

    video.onerror = () => {
      cleanup()
      reject(
        new Error(
          'この動画を読み込めませんでした。別の形式（MP4 など）でお試しください。',
        ),
      )
    }
  })
}

function snapCommonFps(fps: number): number {
  const candidates = [24, 25, 30, 48, 50, 60, 120, 240]
  let best = fps
  let bestDiff = Infinity
  for (const c of candidates) {
    const diff = Math.abs(c - fps)
    if (diff < bestDiff) {
      best = c
      bestDiff = diff
    }
  }
  return bestDiff / best <= 0.02 ? best : Math.round(fps * 1000) / 1000
}

async function detectSourceFps(file: File): Promise<number | null> {
  try {
    const { createFile, MP4BoxBuffer } = await import('mp4box')
    const mp4 = createFile(false)

    return await new Promise<number | null>((resolve) => {
      let settled = false
      const finish = (fps: number | null) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        try {
          mp4.stop()
        } catch {
          // ignore
        }
        resolve(fps)
      }

      const timer = window.setTimeout(() => finish(null), 4000)

      mp4.onError = () => finish(null)

      mp4.onReady = (info) => {
        const videoTrack =
          info.videoTracks?.[0] ??
          info.tracks?.find((track) => track.type === 'video')

        if (!videoTrack) {
          finish(null)
          return
        }

        const timescale = videoTrack.timescale
        const nbSamples = videoTrack.nb_samples
        let fps: number | null = null

        if (timescale > 0 && nbSamples > 1) {
          if (videoTrack.samples_duration > 0) {
            fps = nbSamples / (videoTrack.samples_duration / timescale)
          } else if (videoTrack.duration > 0) {
            fps = nbSamples / (videoTrack.duration / timescale)
          }
        }

        if (
          (fps == null || !Number.isFinite(fps)) &&
          info.duration > 0 &&
          info.timescale > 0 &&
          nbSamples > 1
        ) {
          fps = nbSamples / (info.duration / info.timescale)
        }

        if (fps != null && Number.isFinite(fps) && fps > 1 && fps < 1000) {
          finish(snapCommonFps(fps))
        } else {
          finish(null)
        }
      }

      void (async () => {
        const chunkSize = 1024 * 1024
        let offset = 0

        try {
          while (offset < file.size && !settled) {
            const slice = file.slice(offset, offset + chunkSize)
            const buffer = MP4BoxBuffer.fromArrayBuffer(
              await slice.arrayBuffer(),
              offset,
            )
            mp4.appendBuffer(buffer)
            offset += chunkSize
          }
          if (!settled) mp4.flush()
        } catch {
          finish(null)
        }
      })()
    })
  } catch {
    return null
  }
}

/**
 * Best-effort MP4/MOV fps probe via mp4box.
 * Falls back to duration-only when the container can't be parsed.
 */
export async function readVideoMeta(file: File): Promise<VideoMeta> {
  const duration = await readDurationWithVideoElement(file)
  const sourceFps = await detectSourceFps(file)
  return { duration, sourceFps }
}

export function frameStep(sourceFps: number, sampleFps: number): number {
  return Math.max(1, Math.round(sourceFps / sampleFps))
}

export function estimateSampleCount(
  durationSec: number,
  sourceFps: number,
  sampleFps: number,
  maxFrames: number,
): { count: number; frameStep: number; truncated: boolean } {
  const step = frameStep(sourceFps, sampleFps)
  const totalSourceFrames = Math.max(1, Math.floor(durationSec * sourceFps) + 1)
  const raw = Math.floor((totalSourceFrames - 1) / step) + 1
  return {
    count: Math.min(raw, maxFrames),
    frameStep: step,
    truncated: raw > maxFrames,
  }
}
