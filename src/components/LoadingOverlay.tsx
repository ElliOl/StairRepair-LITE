import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

export function LoadingOverlay() {
  const isLoading = useAppStore((s) => s.loading)
  const loadingStage = useAppStore((s) => s.loadingStage)
  const loadingLogs = useAppStore((s) => s.loadingLogs)
  const loadingProgress = useAppStore((s) => s.loadingProgress)
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [loadingLogs])

  if (!isLoading) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <Loader2
            size={24}
            style={{ animation: 'spin 1s linear infinite', color: '#e54d2e', flexShrink: 0 }}
          />
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#e5e5e5', margin: 0 }}>
            {loadingStage || 'Processing…'}
          </h2>
        </div>

        {/* Log output */}
        {loadingLogs.length > 0 && (
          <div
            ref={logContainerRef}
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '10px 12px',
              marginBottom: '16px',
              backgroundColor: '#111111',
              borderRadius: '6px',
              border: '1px solid #222222',
              fontFamily: 'JetBrains Mono, Consolas, monospace',
              fontSize: '11px',
              color: '#a3a3a3',
              maxHeight: '360px',
              minHeight: '120px',
            }}
          >
            {loadingLogs.map((line, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: '3px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {line}
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              flex: 1,
              height: '6px',
              backgroundColor: '#2a2a2a',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                backgroundColor: '#e54d2e',
                borderRadius: '3px',
                transition: 'width 0.3s ease',
                width: `${Math.min(100, Math.max(0, loadingProgress))}%`,
              }}
            />
          </div>
          <span
            style={{
              fontSize: '11px',
              color: '#666666',
              fontFamily: 'JetBrains Mono, Consolas, monospace',
              minWidth: '38px',
              textAlign: 'right',
              flexShrink: 0,
            }}
          >
            {Math.round(loadingProgress)}%
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
