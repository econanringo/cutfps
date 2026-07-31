import { useCallback, useRef, useState } from 'react'
import {
  createStrobeFromVideo,
  type BlendMode,
  type StrobeProgress,
  type StrobeResult,
} from '../lib/strobe'
import type { MotionSensitivity } from '../lib/motion'

export type ProcessSettings = {
  fps: number
  sourceFps: number
  blendMode: BlendMode
  sensitivity: MotionSensitivity
  autoMotionTrim: boolean
  startSec: number
  endSec: number | null
}

export type ProcessState =
  | { status: 'idle' }
  | { status: 'processing'; progress: StrobeProgress }
  | { status: 'done'; result: StrobeResult; previewUrl: string }
  | { status: 'error'; message: string }

export function useStrobeProcess() {
  const [state, setState] = useState<ProcessState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState({ status: 'idle' })
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState({ status: 'idle' })
  }, [])

  const process = useCallback(
    async (file: File, settings: ProcessSettings) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState({
        status: 'processing',
        progress: { current: 0, total: 1, ratio: 0, phase: 'compose' },
      })

      try {
        const result = await createStrobeFromVideo(file, {
          fps: settings.fps,
          sourceFps: settings.sourceFps,
          blendMode: settings.blendMode,
          sensitivity: settings.sensitivity,
          autoMotionTrim: settings.autoMotionTrim,
          startSec: settings.startSec,
          endSec: settings.endSec ?? undefined,
          signal: controller.signal,
          onProgress: (progress) => {
            setState({ status: 'processing', progress })
          },
        })

        const previewUrl = result.canvas.toDataURL('image/png')
        setState({ status: 'done', result, previewUrl })
        return result
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setState({ status: 'idle' })
          return null
        }
        const message =
          error instanceof Error
            ? error.message
            : '処理中にエラーが発生しました。'
        setState({ status: 'error', message })
        return null
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    },
    [],
  )

  return { state, process, cancel, reset }
}
