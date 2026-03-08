import * as React from 'react'
import { useAppStore } from '../stores/appStore'
import type { FileEntry, RepairOptions } from '../types'

export function useRepairActions() {
  const addFiles = useAppStore((s) => s.addFiles)
  const setFileStatus = useAppStore((s) => s.setFileStatus)
  const setModel = useAppStore((s) => s.setModel)
  const appendLog = useAppStore((s) => s.appendLog)
  const clearLog = useAppStore((s) => s.clearLog)
  const setLoading = useAppStore((s) => s.setLoading)

  const analyseFile = React.useCallback(
    async (filepath: string) => {
      const quality = useAppStore.getState().meshQuality
      setFileStatus(filepath, 'analysing')
      try {
        const result = await window.electronAPI.analyseStep(filepath, quality)
        setFileStatus(filepath, 'ready', {
          namesFlagged: result.namesFlagged,
          shellsSplit: result.shellsSplit,
          hoopsCompatFixes: result.hoopsCompatFixes,
        })
        setModel(
          {
            shapeId: result.shapeId,
            mesh: result.mesh,
            edges: result.edges,
            parts: result.parts,
          },
          filepath.split(/[/\\]/).pop() ?? null,
        )
      } catch (e) {
        setFileStatus(filepath, 'error', {
          error: e instanceof Error ? e.message : String(e),
        })
        appendLog(
          `[${new Date().toLocaleTimeString()}] Error analysing ${filepath.split(/[/\\]/).pop()}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    },
    [setFileStatus, setModel, appendLog],
  )

  const handleBrowse = React.useCallback(async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths.length) {
      addFiles(paths)
      for (const p of paths) await analyseFile(p)
    }
  }, [addFiles, analyseFile])

  const handleRepairOne = React.useCallback(
    async (filepath: string, options: RepairOptions, name: string) => {
      const quality = useAppStore.getState().meshQuality
      setLoading(true)
      setFileStatus(filepath, 'repairing')
      appendLog(`[${new Date().toLocaleTimeString()}] ${name} → repairing…`)
      try {
        const dir = filepath.replace(/[/\\][^/\\]+$/, '')
        const base = (name.replace(/\.(stp|step)$/i, '') || 'repaired') + '_fixed.stp'
        const outputPath = `${dir}/${base}`
        const result = await window.electronAPI.repairStep(filepath, outputPath, options)
        if (result.success) {
          setFileStatus(filepath, 'done')
          setModel(
            {
              shapeId: result.shapeId,
              mesh: result.mesh,
              edges: result.edges,
              parts: result.parts,
            },
            base,
          )
          appendLog(`[${new Date().toLocaleTimeString()}] ✓ Saved: ${base}`)
        }
      } catch (e) {
        setFileStatus(filepath, 'error', {
          error: e instanceof Error ? e.message : String(e),
        })
        appendLog(
          `[${new Date().toLocaleTimeString()}] ✗ Error: ${e instanceof Error ? e.message : String(e)}`,
        )
      } finally {
        setLoading(false)
      }
    },
    [setLoading, setFileStatus, setModel, appendLog],
  )

  const handleRepairAll = React.useCallback(
    async (readyFiles: FileEntry[], options: RepairOptions) => {
      clearLog()
      setLoading(true)
      for (const f of readyFiles) {
        await handleRepairOne(f.filepath, options, f.name)
      }
      setLoading(false)
    },
    [clearLog, setLoading, handleRepairOne],
  )

  return {
    handleBrowse,
    analyseFile,
    handleRepairOne,
    handleRepairAll,
  }
}
