import * as React from 'react'
import { Upload } from 'lucide-react'

interface DropZoneProps {
  onBrowse: () => void
  onDrop: (paths: string[]) => void
}

export function DropZone({ onBrowse, onDrop }: DropZoneProps) {
  const [drag, setDrag] = React.useState(false)

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDrag(false)
      const paths = Array.from(e.dataTransfer.files).map((f) => f.path).filter((p) => /\.(stp|step)$/i.test(p))
      if (paths.length) onDrop(paths)
    },
    [onDrop]
  )

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDrag(true)
  }, [])

  const handleDragLeave = React.useCallback(() => setDrag(false), [])

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${drag ? 'border-accent bg-accent-subtle' : 'border-border bg-surface-elevated'}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <Upload className="mx-auto mb-2 w-8 h-8 text-text-muted" />
      <p className="text-sm text-text-muted mb-2">Drop .stp / .step files or</p>
      <button type="button" className="btn btn-secondary text-sm" onClick={onBrowse}>
        Browse
      </button>
    </div>
  )
}
