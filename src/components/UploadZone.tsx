type UploadZoneProps = {
  file: File | null
  disabled?: boolean
  onSelect: (file: File) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function UploadZone({ file, disabled, onSelect }: UploadZoneProps) {
  return (
    <label
      className={[
        'group relative flex w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed px-5 py-10 transition',
        'border-[var(--stroke)] bg-[var(--surface)]',
        'hover:border-[var(--accent)]/60 hover:bg-[var(--surface-strong)]',
        'focus-within:border-[var(--accent)] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--accent)]/40',
        disabled ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
    >
      <input
        type="file"
        accept="video/*"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.files?.[0]
          if (next) onSelect(next)
          event.target.value = ''
        }}
      />

      <span
        aria-hidden
        className="flash-dot grid h-14 w-14 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--ink)]"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M8 7h3l1-2h4l1 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="13" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </span>

      <div className="text-center">
        <p className="font-display text-xl font-bold tracking-tight text-[var(--ink)]">
          {file ? '別の動画を選ぶ' : '動画を選ぶ'}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          ギャラリーまたは撮影した動画から選択
        </p>
      </div>

      {file && (
        <p className="max-w-full truncate rounded-full bg-[var(--chip)] px-3 py-1 text-xs text-[var(--ink)]">
          {file.name}
          <span className="text-[var(--muted)]"> · {formatBytes(file.size)}</span>
        </p>
      )}
    </label>
  )
}
