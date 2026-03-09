import * as React from 'react'
import { CheckCircle2, AlertCircle, FileCheck } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { FixResult } from '../types'

function FixEntry({ fix }: { fix: FixResult }) {
  const time = new Date(fix.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  const issues: string[] = []
  if (fix.namesFFixed > 0) issues.push(`${fix.namesFFixed} name${fix.namesFFixed > 1 ? 's' : ''} fixed`)
  if (fix.hoopsFixed > 0) issues.push('HOOPS compat applied')

  return (
    <div className="px-3 py-1.5 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {fix.hadIssues ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
          ) : (
            <FileCheck className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" />
          )}
          <span className="text-xs text-text font-medium truncate" title={fix.name}>
            {fix.name}
          </span>
        </div>
        <span className="text-[10px] text-text-muted shrink-0">{time}</span>
      </div>
      <div className="pl-5 mt-0.5">
        {fix.hadIssues ? (
          <p className="text-[10px] text-green-500">{issues.join(' · ')}</p>
        ) : (
          <p className="text-[10px] text-text-muted">No issues found</p>
        )}
      </div>
    </div>
  )
}

export function RecentFixes() {
  const recentFixes = useAppStore((s) => s.recentFixes)

  return (
    <div className="flex flex-col min-h-0">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5 shrink-0">
        Recent Fixes
      </p>
      {recentFixes.length === 0 ? (
        <div className="rounded-md border border-border bg-surface px-3 py-1.5 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <span className="text-xs text-text-muted">No files processed yet</span>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-surface overflow-y-auto max-h-44">
          {recentFixes.map((fix) => (
            <FixEntry key={`${fix.filepath}-${fix.timestamp}`} fix={fix} />
          ))}
        </div>
      )}
    </div>
  )
}
