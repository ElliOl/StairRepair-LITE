import * as React from 'react'
import { FileHeader } from './components/FileHeader'
import { EmptyState } from './components/EmptyState'
import { LoadingOverlay } from './components/LoadingOverlay'
import { RightPanel } from './components/RightPanel'
import { CADViewer } from './components/Viewer/CADViewer'
import { PartTreeDrawer } from './components/PartTree/PartTreeDrawer'
import { useAppStore } from './stores/appStore'
import { useRepairActions } from './hooks/useRepairActions'
import { convertPartsToFileTree, getAllPartIdsInSubtree } from './utils/partTreeUtils'

function parseProgressFromLog(log: string): number | null {
  const bracketMatch = log.match(/\[(\d+)\/(\d+)\]/)
  if (bracketMatch) {
    const done = parseInt(bracketMatch[1], 10)
    const total = parseInt(bracketMatch[2], 10)
    if (total > 0) return Math.round((done / total) * 100)
  }
  const percentMatch = log.match(/\b(\d{1,3})%/)
  if (percentMatch) return parseInt(percentMatch[1], 10)
  return null
}

export default function App() {
  const model = useAppStore((s) => s.model)
  const currentFileName = useAppStore((s) => s.currentFileName)
  const loading = useAppStore((s) => s.loading)
  const showEdges = useAppStore((s) => s.showEdges)
  const appendLog = useAppStore((s) => s.appendLog)
  const addLoadingLog = useAppStore((s) => s.addLoadingLog)
  const setLoadingProgress = useAppStore((s) => s.setLoadingProgress)
  const addFiles = useAppStore((s) => s.addFiles)
  const { handleBrowse, analyseFile } = useRepairActions()

  // Part tree state
  const showPartTree = useAppStore((s) => s.showPartTree)
  const partVisibility = useAppStore((s) => s.partVisibility)
  const selectedPartIds = useAppStore((s) => s.selectedPartIds)
  const hoveredPartId = useAppStore((s) => s.hoveredPartId)
  const togglePartTree = useAppStore((s) => s.togglePartTree)
  const setPartVisibility = useAppStore((s) => s.setPartVisibility)
  const selectPart = useAppStore((s) => s.selectPart)
  const selectAllParts = useAppStore((s) => s.selectAllParts)
  const setHoveredPart = useAppStore((s) => s.setHoveredPart)

  const upAxis = useAppStore((s) => s.upAxis)

  // Viewport rotation state driven by arrow key hotkeys
  const [viewRotationX, setViewRotationX] = React.useState(0)
  const [viewRotationZ, setViewRotationZ] = React.useState(0)

  React.useEffect(() => {
    const cleanup = window.electronAPI?.onBackendLog?.((msg: string) => {
      appendLog(msg)
      // Mirror to loading overlay while an operation is in progress
      if (useAppStore.getState().loading) {
        addLoadingLog(msg)
        const parsed = parseProgressFromLog(msg)
        if (parsed !== null) setLoadingProgress(parsed)
      }
    })
    return () => cleanup?.()
  }, [appendLog, addLoadingLog, setLoadingProgress])

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (isTyping) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setViewRotationZ((prev) => (prev + 90) % 360)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setViewRotationZ((prev) => (prev - 90 + 360) % 360)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setViewRotationX((prev) => (prev - 90 + 360) % 360)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setViewRotationX((prev) => (prev + 90) % 360)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleGlobalDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const paths = Array.from(e.dataTransfer.files)
        .map((f) => f.path)
        .filter((p) => /\.(stp|step)$/i.test(p))
      if (paths.length) {
        const path = paths[0]
        addFiles([path])
        analyseFile(path)
      }
    },
    [addFiles, analyseFile],
  )

  const handleGlobalDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  // Build nested tree from flat part list
  const treeData = React.useMemo(
    () => (model ? convertPartsToFileTree(model.parts) : []),
    [model],
  )

  const handleSelectAllInFolder = React.useCallback(
    (folderId: string) => {
      const ids = getAllPartIdsInSubtree(folderId, treeData)
      selectAllParts(ids)
    },
    [treeData, selectAllParts],
  )

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden min-w-[800px] relative">
      {/* Full-app loading overlay — fixed so it covers everything */}
      <LoadingOverlay />

      {/* Left: viewport column */}
      <div className="flex-1 min-w-[400px] flex flex-col relative">
        <FileHeader fileName={currentFileName} />

        <div
          className="flex-1 pl-1.5 pr-3 pt-1 pb-1.5 relative"
          onDrop={handleGlobalDrop}
          onDragOver={handleGlobalDragOver}
        >
          <div className="h-full w-full rounded-lg overflow-hidden relative" style={{ background: '#27272a' }}>
            <CADViewer
              model={model}
              showEdges={showEdges}
              partVisibility={partVisibility}
              selectedPartIds={selectedPartIds}
              hoveredPartId={hoveredPartId}
              upAxis={upAxis}
              viewRotationX={viewRotationX}
              viewRotationZ={viewRotationZ}
            />

            {!model && !loading && <EmptyState onBrowse={handleBrowse} />}

            {/* Part tree drawer — absolute over the viewport */}
            {model && (
              <PartTreeDrawer
                open={showPartTree}
                data={treeData}
                partVisibility={partVisibility}
                onToggle={togglePartTree}
                onVisibilityToggle={setPartVisibility}
                onNodeSelect={selectPart}
                onNodeHover={setHoveredPart}
                onSelectAllInFolder={handleSelectAllInFolder}
                selectedParts={selectedPartIds}
                hoveredPart={hoveredPartId}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right: settings panel */}
      <RightPanel />
    </div>
  )
}
