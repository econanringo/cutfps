import type { BlendMode } from '../lib/strobe'
import type { MotionSensitivity } from '../lib/motion'
import { estimateSampleCount, frameStep } from '../lib/videoMeta'

export type ControlsValue = {
  blendMode: BlendMode
  /** Effective sampling rate */
  fps: number
  /** Original recording fps */
  sourceFps: number
  sensitivity: MotionSensitivity
  autoMotionTrim: boolean
  startSec: number
  endSec: number | null
  duration: number | null
}

type ProcessControlsProps = {
  value: ControlsValue
  disabled?: boolean
  processing?: boolean
  canProcess: boolean
  detectedSourceFps: number | null
  onChange: (next: ControlsValue) => void
  onProcess: () => void
  onCancel: () => void
}

const SAMPLE_FPS_OPTIONS = [1, 5, 10, 15, 30] as const
const SOURCE_FPS_OPTIONS = [30, 60, 120, 240] as const

export function ProcessControls({
  value,
  disabled,
  processing,
  canProcess,
  detectedSourceFps,
  onChange,
  onProcess,
  onCancel,
}: ProcessControlsProps) {
  const duration = value.duration
  const rangeSec = Math.max(
    0,
    (value.endSec ?? duration ?? 0) - value.startSec,
  )
  const step = frameStep(value.sourceFps, value.fps)
  const estimate =
    duration != null
      ? estimateSampleCount(rangeSec, value.sourceFps, value.fps, 60)
      : null

  return (
    <section className="space-y-5 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
          合成モード
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2">
          {(
            [
              {
                id: 'motion' as const,
                label: 'ボール軌跡',
                desc: '動いている部分だけ抜き出して重ねる（落下向き）',
              },
              {
                id: 'lighten' as const,
                label: 'クラシック',
                desc: '明るい部分をそのまま重ねる',
              },
              {
                id: 'average' as const,
                label: '半透明',
                desc: '全体を薄く重ねて軌跡っぽくする',
              },
            ] as const
          ).map((mode) => {
            const active = value.blendMode === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, blendMode: mode.id })}
                className={[
                  'rounded-xl border px-3 py-3 text-left transition',
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]'
                    : 'border-[var(--stroke)] bg-transparent text-[var(--ink)] hover:border-[var(--accent)]/50',
                ].join(' ')}
              >
                <span className="block font-display text-base font-bold">
                  {mode.label}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {mode.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {value.blendMode === 'motion' && (
        <>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
              ボールの拾いやすさ
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'low' as const, label: '敏感' },
                  { id: 'medium' as const, label: 'ふつう' },
                  { id: 'high' as const, label: '厳しめ' },
                ] as const
              ).map((item) => {
                const active = value.sensitivity === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({ ...value, sensitivity: item.id })
                    }
                    className={[
                      'rounded-lg border px-2 py-2 text-sm font-semibold transition',
                      active
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                        : 'border-[var(--stroke)] text-[var(--ink)]',
                    ].join(' ')}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              ボールが小さい・暗いときは「敏感」を試してください
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-[var(--stroke)] px-3 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--accent)]"
              checked={value.autoMotionTrim}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  autoMotionTrim: event.target.checked,
                })
              }
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--ink)]">
                落下している区間だけ自動で使う
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                ボールが動いている部分を探して、その前後を重点的に合成します
              </span>
            </span>
          </label>
        </>
      )}

      <div>
        <div className="flex items-end justify-between gap-3">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
            元動画の fps
          </p>
          <p className="font-display text-2xl font-bold text-[var(--ink)]">
            {value.sourceFps}
            <span className="ml-1 text-sm font-semibold text-[var(--muted)]">
              fps
            </span>
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SOURCE_FPS_OPTIONS.map((sourceFps) => {
            const active = value.sourceFps === sourceFps
            return (
              <button
                key={sourceFps}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, sourceFps })}
                className={[
                  'min-w-14 rounded-lg border px-3 py-2 text-sm font-semibold transition',
                  active
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                    : 'border-[var(--stroke)] text-[var(--ink)] hover:border-[var(--ink)]/40',
                ].join(' ')}
              >
                {sourceFps}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {detectedSourceFps != null
            ? `検出: ${detectedSourceFps} fps（必要なら手動で変更）`
            : '高速度撮影なら 240 を指定'}
        </p>
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
            間引き後の密度
          </p>
          <p className="font-display text-2xl font-bold text-[var(--ink)]">
            {value.fps}
            <span className="ml-1 text-sm font-semibold text-[var(--muted)]">
              fps
            </span>
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SAMPLE_FPS_OPTIONS.map((fps) => {
            const active = value.fps === fps
            return (
              <button
                key={fps}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, fps })}
                className={[
                  'min-w-14 rounded-lg border px-3 py-2 text-sm font-semibold transition',
                  active
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                    : 'border-[var(--stroke)] text-[var(--ink)] hover:border-[var(--ink)]/40',
                ].join(' ')}
              >
                {fps}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {step} フレームごとに 1 枚（落下の軌跡は 10〜15fps くらいがおすすめ）
          {estimate != null && !value.autoMotionTrim && (
            <>
              {' '}
              · 約 {estimate.count} 枚
              {estimate.truncated ? '（最大60で打ち切り）' : ''}
            </>
          )}
        </p>
      </div>

      {duration != null && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
              開始（秒）
            </span>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              disabled={disabled}
              value={value.startSec}
              onChange={(event) =>
                onChange({
                  ...value,
                  startSec: Number(event.target.value),
                })
              }
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-[var(--paper)] px-3 py-2.5 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
              終了（秒）
            </span>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              disabled={disabled}
              value={value.endSec ?? duration}
              onChange={(event) =>
                onChange({
                  ...value,
                  endSec: Number(event.target.value),
                })
              }
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-[var(--paper)] px-3 py-2.5 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <p className="col-span-2 text-xs text-[var(--muted)]">
            動画の長さ {duration.toFixed(1)} 秒 · 最大 60 フレームまで合成
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {processing ? (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl border border-[var(--stroke)] bg-transparent px-4 py-3.5 font-semibold text-[var(--ink)] transition hover:bg-[var(--chip)]"
          >
            キャンセル
          </button>
        ) : (
          <button
            type="button"
            disabled={!canProcess || disabled}
            onClick={onProcess}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 font-display text-lg font-bold text-[#042f2e] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ストロボ写真をつくる
          </button>
        )}
      </div>
    </section>
  )
}
