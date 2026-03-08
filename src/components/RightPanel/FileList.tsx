import * as React from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useRepairActions } from '../../hooks/useRepairActions'

export function FileList() {
  const { files, removeFile, options } = useAppStore()
  const { handleRepairOne } = useRepairActions()
  if (files.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Files</p>
      <ul className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
        {files.map((f) => (
          <li
            key={f.filepath}
            className="flex items-center gap-2 rounded-md bg-surface-elevated border border-border px-2 py-1.5 text-sm"
          >
            <span className="flex-1 truncate text-text" title={f.filepath}>
              {f.name}
            </span>
            {(f.namesFlagged !== undefined || f.shellsSplit !== undefined || f.hoopsCompatFixes !== undefined) && (
              <span className="shrink-0 text-xs text-text-muted">
                {[
                  f.namesFlagged ? `${f.namesFlagged} names` : null,
                  f.shellsSplit ? `${f.shellsSplit} shell(s)` : null,
                  f.hoopsCompatFixes ? `HOOPS compat` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            )}
            {f.status === 'ready' && (
              <button
                type="button"
                className="btn btn-accent text-xs py-1 px-2"
                onClick={() => handleRepairOne(f.filepath, options, f.name)}
              >
                Fix
              </button>
            )}
            <button
              type="button"
              className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text"
              onClick={() => removeFile(f.filepath)}
              aria-label="Remove"
            >
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
