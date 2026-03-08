import * as React from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function FileInfoPanel() {
  const files = useAppStore((s) => s.files)
  const removeFile = useAppStore((s) => s.removeFile)
  const file = files[0]
  if (!file) return null

  const issues: string[] = []
  if (file.namesFlagged !== undefined && file.namesFlagged > 0) {
    issues.push(`${file.namesFlagged} part name(s) need repair`)
  }
  if (file.shellsSplit !== undefined && file.shellsSplit > 0) {
    issues.push(`${file.shellsSplit} solid(s) with disconnected shells`)
  }
  if (file.hoopsCompatFixes !== undefined && file.hoopsCompatFixes > 0) {
    issues.push('HOOPS Exchange compatibility fixes needed')
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">File info</p>
        <button
          type="button"
          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text"
          onClick={() => removeFile(file.filepath)}
          aria-label="Remove file"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="rounded-md bg-surface-elevated border border-border px-3 py-2.5 text-sm space-y-2">
        <div>
          <p className="text-xs text-text-muted mb-0.5">Location</p>
          <p className="text-text truncate font-mono text-xs" title={file.filepath}>
            {file.filepath}
          </p>
        </div>
        {file.status === 'analysing' && (
          <p className="text-xs text-text-muted">Analysing…</p>
        )}
        {file.status === 'repairing' && (
          <p className="text-xs text-text-muted">Repairing…</p>
        )}
        {file.status === 'done' && (
          <p className="text-xs text-green-600 dark:text-green-500">Repaired successfully</p>
        )}
        {file.status === 'ready' && (
          <div>
            <p className="text-xs text-text-muted mb-0.5">Issues found</p>
            {issues.length > 0 ? (
              <ul className="text-text text-xs space-y-0.5">
                {issues.map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
              </ul>
            ) : (
              <p className="text-text text-xs">No issues detected</p>
            )}
          </div>
        )}
        {file.status === 'error' && file.error && (
          <div>
            <p className="text-xs text-red-500">Error: {file.error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
