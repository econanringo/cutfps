import { useState } from 'react'
import { canvasToBlob, type StrobeResult } from '../lib/strobe'

type ResultViewProps = {
  previewUrl: string
  result: StrobeResult
  onReset: () => void
}

export function ResultView({ previewUrl, result, onReset }: ResultViewProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const download = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const blob = await canvasToBlob(result.canvas)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `cutfps-${Date.now()}.png`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setMessage('保存に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const blob = await canvasToBlob(result.canvas)
      const file = new File([blob], `cutfps-${Date.now()}.png`, {
        type: 'image/png',
      })

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'cutfps',
          text: 'ストロボ写真',
        })
      } else {
        await download()
        setMessage('この端末では共有できないため、ダウンロードしました。')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage('共有に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--surface)]">
        <img
          src={previewUrl}
          alt="ストロボ合成結果"
          className="result-reveal mx-auto max-h-[70vh] w-full object-contain"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
        <span>
          {result.width}×{result.height}
        </span>
        <span aria-hidden>·</span>
        <span>{result.frameCount} フレーム</span>
        {result.autoTrimmed && (
          <>
            <span aria-hidden>·</span>
            <span>
              落下区間 {result.usedStart.toFixed(1)}–
              {result.usedEnd.toFixed(1)} 秒
            </span>
          </>
        )}
        {result.truncated && (
          <>
            <span aria-hidden>·</span>
            <span className="text-[var(--warn)]">60枚で打ち切り</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={download}
          className="rounded-xl bg-[var(--ink)] px-4 py-3.5 font-semibold text-[var(--paper)] transition hover:opacity-90 disabled:opacity-50"
        >
          PNG保存
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={share}
          className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3.5 font-semibold text-[var(--ink)] transition hover:bg-[var(--chip)] disabled:opacity-50"
        >
          共有
        </button>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-[var(--muted)] underline-offset-4 hover:underline"
      >
        最初からやり直す
      </button>

      {message && (
        <p className="text-center text-sm text-[var(--muted)]">{message}</p>
      )}
    </section>
  )
}
