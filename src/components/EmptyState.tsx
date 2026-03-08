import { FileStack } from 'lucide-react'

interface EmptyStateProps {
  onBrowse: () => void
}

export function EmptyState({ onBrowse }: EmptyStateProps) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer"
      onClick={onBrowse}
      onKeyDown={(e) => e.key === 'Enter' && onBrowse()}
      role="button"
      tabIndex={0}
      style={{ background: '#27272a', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <FileStack className="w-16 h-16 text-text-muted" strokeWidth={1} />
      <p className="text-text-muted text-sm">Drop .stp / .step files here</p>
      <button type="button" className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); onBrowse(); }}>
        Browse
      </button>
    </div>
  )
}
