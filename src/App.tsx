import { useEffect, useMemo, useState } from 'react'
import { UploadZone } from './components/UploadZone'
import {
  ProcessControls,
  type ControlsValue,
} from './components/ProcessControls'
import { ResultView } from './components/ResultView'
import { useStrobeProcess } from './hooks/useStrobeProcess'
import { readVideoMeta } from './lib/videoMeta'

const initialControls: ControlsValue = {
  blendMode: 'motion',
  fps: 15,
  sourceFps: 240,
  sensitivity: 'medium',
  autoMotionTrim: true,
  startSec: 0,
  endSec: null,
  duration: null,
}

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [controls, setControls] = useState<ControlsValue>(initialControls)
  const [detectedSourceFps, setDetectedSourceFps] = useState<number | null>(
    null,
  )
  const [metaError, setMetaError] = useState<string | null>(null)
  const { state, process, cancel, reset } = useStrobeProcess()

  const processing = state.status === 'processing'
  const done = state.status === 'done'

  useEffect(() => {
    if (!file) {
      setControls(initialControls)
      setDetectedSourceFps(null)
      setMetaError(null)
      return
    }

    let cancelled = false
    setMetaError(null)
    setDetectedSourceFps(null)

    readVideoMeta(file)
      .then((meta) => {
        if (cancelled) return
        setDetectedSourceFps(meta.sourceFps)
        setControls((prev) => ({
          ...prev,
          startSec: 0,
          endSec: meta.duration,
          duration: meta.duration,
          sourceFps: meta.sourceFps ?? prev.sourceFps ?? 240,
        }))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setMetaError(
          error instanceof Error
            ? error.message
            : '動画情報の取得に失敗しました。',
        )
      })

    return () => {
      cancelled = true
    }
  }, [file])

  const canProcess = useMemo(() => {
    if (!file || controls.duration == null || metaError) return false
    const end = controls.endSec ?? controls.duration
    return controls.startSec < end && controls.sourceFps > 0
  }, [file, controls, metaError])

  const handleSelect = (next: File) => {
    reset()
    setFile(next)
  }

  const handleReset = () => {
    reset()
    setFile(null)
    setControls(initialControls)
    setDetectedSourceFps(null)
    setMetaError(null)
  }

  const handleProcess = () => {
    if (!file) return
    void process(file, {
      fps: controls.fps,
      sourceFps: controls.sourceFps,
      blendMode: controls.blendMode,
      sensitivity: controls.sensitivity,
      autoMotionTrim: controls.autoMotionTrim,
      startSec: controls.startSec,
      endSec: controls.endSec,
    })
  }

  const progressLabel =
    state.status === 'processing' && state.progress.phase === 'probe'
      ? '落下区間を探しています…'
      : '合成中…'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-5">
      <header className="rise-in pb-8 pt-4">
        <p className="font-display text-[clamp(3rem,14vw,4.5rem)] leading-[0.9] font-extrabold tracking-tight text-[var(--ink)]">
          cutfps
        </p>
        <p className="rise-in-delay mt-4 max-w-[22rem] text-base leading-relaxed text-[var(--muted)]">
          落ちるボールみたいな小さな動きを抜き出して、1枚のストロボ写真にします。処理はすべて端末内。
        </p>
      </header>

      <main className="rise-in-delay-2 flex flex-1 flex-col gap-5">
        {!done && (
          <>
            <UploadZone
              file={file}
              disabled={processing}
              onSelect={handleSelect}
            />

            {metaError && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {metaError}
              </p>
            )}

            {file && !metaError && (
              <ProcessControls
                value={controls}
                disabled={processing}
                processing={processing}
                canProcess={canProcess}
                detectedSourceFps={detectedSourceFps}
                onChange={setControls}
                onProcess={handleProcess}
                onCancel={cancel}
              />
            )}

            {processing && (
              <section className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-[var(--ink)]">
                    {progressLabel}
                  </span>
                  <span className="text-[var(--muted)]">
                    {state.progress.current} / {state.progress.total}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--chip)]">
                  <div
                    className="progress-bar h-full rounded-full transition-[width] duration-200"
                    style={{
                      width: `${Math.max(4, state.progress.ratio * 100)}%`,
                    }}
                  />
                </div>
              </section>
            )}

            {state.status === 'error' && (
              <p className="rounded-xl border border-red-500/30 bg-red-50 px-3 py-2 text-sm text-red-900">
                {state.message}
              </p>
            )}
          </>
        )}

        {done && (
          <ResultView
            previewUrl={state.previewUrl}
            result={state.result}
            onReset={handleReset}
          />
        )}
      </main>

      <footer className="mt-10 text-center text-xs text-[var(--muted)]">
        動画はサーバーに送信されません
      </footer>
    </div>
  )
}
