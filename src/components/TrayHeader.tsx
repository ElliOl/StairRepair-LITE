import * as React from 'react'
import { X } from 'lucide-react'

export function TrayHeader() {
  const handleClose = () => window.electronAPI?.windowClose?.()

  return (
    <div
      className="flex items-center justify-between px-4 h-10 shrink-0 select-none border-b border-border"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <span className="text-accent font-bold text-sm tracking-tight">StairRepair</span>
        <span className="text-text-muted text-xs font-medium uppercase tracking-wider">Lite</span>
      </div>
      <button
        type="button"
        className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={handleClose}
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
