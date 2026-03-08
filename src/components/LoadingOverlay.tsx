import { Loader2 } from 'lucide-react'

export function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-viewport/90 z-10">
      <Loader2 className="w-10 h-10 text-accent animate-spin" />
      <p className="text-text-muted text-sm">Processing…</p>
    </div>
  )
}
