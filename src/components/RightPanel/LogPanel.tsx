import * as React from 'react'
import { useAppStore } from '../../stores/appStore'

export function LogPanel() {
  const { log } = useAppStore()
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight)
  }, [log])
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Log</p>
      <div
        ref={ref}
        className="h-32 rounded-md bg-surface-elevated border border-border p-2 font-mono text-xs text-text-muted overflow-y-auto custom-scrollbar"
      >
        {log.length === 0 ? (
          <span className="text-text-muted/70">No output yet.</span>
        ) : (
          log.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
