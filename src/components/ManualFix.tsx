import * as React from 'react'
import { FileSearch, Wrench, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { flattenTree } from '../lib/stepTree'

export function ManualFix() {
  const options = useAppStore((s) => s.options)
  const manualAnalysis = useAppStore((s) => s.manualAnalysis)
  const setManualAnalysis = useAppStore((s) => s.setManualAnalysis)
  const updateManualAnalysis = useAppStore((s) => s.updateManualAnalysis)

  const [treeOpen, setTreeOpen] = React.useState(false)

  const handlePickAndAnalyse = async () => {
    const filepath = await window.electronAPI.pickFile()
    if (!filepath) return

    const name = filepath.split(/[/\\]/).pop() ?? filepath
    setManualAnalysis({ filepath, name: name, namesFlagged: 0, hoopsCompatFixes: 0, tree: [], status: 'analysing' })
    setTreeOpen(false)

    try {
      const result = await window.electronAPI.analyseFile(filepath)
      updateManualAnalysis({
        namesFlagged: result.namesFlagged,
        hoopsCompatFixes: result.hoopsCompatFixes,
        tree: result.tree,
        status: 'ready',
      })
    } catch (e) {
      updateManualAnalysis({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  const handleRepair = async () => {
    if (!manualAnalysis?.filepath) return
    updateManualAnalysis({ status: 'repairing' })
    try {
      const result = await window.electronAPI.repairFile(
        manualAnalysis.filepath,
        options.fixNames,
        options.fixHoopsCompat,
        options.axisSwap,
      )
      updateManualAnalysis({
        status: 'done',
        outputPath: result.outputPath,
        log: result.log,
      })
    } catch (e) {
      updateManualAnalysis({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  const issues: string[] = []
  if (manualAnalysis?.namesFlagged) issues.push(`${manualAnalysis.namesFlagged} name(s) need repair`)
  if (manualAnalysis?.hoopsCompatFixes) issues.push('HOOPS Exchange compat fix needed')
  const hasIssues = issues.length > 0

  const flatTree = React.useMemo(
    () => (manualAnalysis?.tree ? flattenTree(manualAnalysis.tree) : []),
    [manualAnalysis?.tree],
  )

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Manual Fix
        </p>
        {manualAnalysis && (
          <button
            type="button"
            className="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text"
            onClick={() => { setManualAnalysis(null); setTreeOpen(false) }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!manualAnalysis ? (
        <button
          type="button"
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md border border-dashed border-border hover:border-accent text-text-muted hover:text-text transition-colors text-sm"
          onClick={handlePickAndAnalyse}
        >
          <FileSearch className="w-4 h-4" />
          Browse a STEP file…
        </button>
      ) : (
        <div className="rounded-md border border-border bg-surface overflow-hidden">
          {/* File info row */}
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <span className="text-xs text-text font-mono flex-1 truncate" title={manualAnalysis.filepath}>
              {manualAnalysis.name}
            </span>
            <button
              type="button"
              className="text-[10px] text-text-muted hover:text-text underline shrink-0"
              onClick={handlePickAndAnalyse}
            >
              change
            </button>
          </div>

          {/* Status area */}
          <div className="px-3 py-2 space-y-1.5">
            {manualAnalysis.status === 'analysing' && (
              <p className="text-xs text-text-muted">Analysing…</p>
            )}
            {manualAnalysis.status === 'repairing' && (
              <p className="text-xs text-text-muted">Repairing…</p>
            )}
            {manualAnalysis.status === 'error' && (
              <p className="text-xs text-red-500">Error: {manualAnalysis.error}</p>
            )}
            {(manualAnalysis.status === 'ready' || manualAnalysis.status === 'done') && (
              <>
                {manualAnalysis.status === 'done' ? (
                  <div className="space-y-1">
                    <p className="text-xs text-green-500">Saved: {manualAnalysis.outputPath?.split(/[/\\]/).pop()}</p>
                    {manualAnalysis.log?.map((l, i) => (
                      <p key={i} className="text-[10px] text-text-muted">{l}</p>
                    ))}
                  </div>
                ) : hasIssues ? (
                  <ul className="text-xs text-text space-y-0.5">
                    {issues.map((issue, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                        {issue}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-text-muted">No issues detected</p>
                )}

                {/* Part tree toggle */}
                {flatTree.length > 0 && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text transition-colors mt-1"
                    onClick={() => setTreeOpen((v) => !v)}
                  >
                    {treeOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Part tree ({flatTree.length} part{flatTree.length > 1 ? 's' : ''})
                  </button>
                )}
              </>
            )}
          </div>

          {/* Part tree */}
          {treeOpen && flatTree.length > 0 && (
            <div className="border-t border-border overflow-y-auto max-h-36">
              {flatTree.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-1 px-2 py-0.5"
                  style={{ paddingLeft: `${8 + node.depth * 12}px` }}
                >
                  <span className="text-text-muted text-[10px] mr-0.5">
                    {node.isAssembly ? '▾' : '·'}
                  </span>
                  <span
                    className={`text-[10px] truncate ${
                      node.needsNameFix ? 'text-warning' : 'text-text'
                    }`}
                    title={node.needsNameFix ? `was "0" → ${node.name}` : node.name}
                  >
                    {node.name}
                  </span>
                  {node.needsNameFix && (
                    <span className="text-[9px] text-warning ml-auto shrink-0">*</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Fix button */}
          {manualAnalysis.status === 'ready' && hasIssues && (
            <div className="px-3 pb-2.5 pt-1 border-t border-border">
              <button
                type="button"
                className="btn btn-accent w-full text-sm py-1.5"
                onClick={handleRepair}
              >
                <Wrench className="w-3.5 h-3.5" />
                Fix This File
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
