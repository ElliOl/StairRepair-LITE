/**
 * PartTreeDrawer – slide-in drawer hosting the PartTree outliner.
 * Adapted from Trace-CAD-visualizer's FileTreeDrawer component.
 * Slides in from the left edge of the 3D viewport.
 */

import { useState, useMemo } from 'react'
import { ListTree, X, Search } from 'lucide-react'
import { PartTree, type PartVisibilityMap } from './PartTree'
import type { FileTreeNode } from '../../utils/partTreeUtils'

interface PartTreeDrawerProps {
  open: boolean
  data: FileTreeNode[]
  partVisibility?: PartVisibilityMap
  onToggle: () => void
  onVisibilityToggle?: (nodeId: string, visible: boolean) => void
  onNodeSelect?: (nodeId: string, mode: 'add' | 'subtract' | 'replace') => void
  onNodeHover?: (nodeId: string | null) => void
  onSelectAllInFolder?: (folderId: string) => void
  selectedParts?: Set<string>
  hoveredPart?: string | null
}

export function PartTreeDrawer({
  open,
  data,
  partVisibility,
  onToggle,
  onVisibilityToggle,
  onNodeSelect,
  onNodeHover,
  onSelectAllInFolder,
  selectedParts,
  hoveredPart,
}: PartTreeDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const handleSearchToggle = () => {
    if (showSearch) setSearchQuery('')
    setShowSearch((prev) => !prev)
  }

  const filteredData = useMemo(() => {
    if (!searchQuery) return data

    const query = searchQuery.toLowerCase()
    const matching = new Set<string>()
    const parentMap = new Map<string, string>()

    const buildParentMap = (nodes: FileTreeNode[], parentId?: string) => {
      nodes.forEach((node) => {
        if (parentId) parentMap.set(node.id, parentId)
        if (node.children) buildParentMap(node.children, node.id)
      })
    }

    buildParentMap(data)

    const findMatches = (nodes: FileTreeNode[]) => {
      nodes.forEach((node) => {
        if (node.name.toLowerCase().includes(query)) {
          matching.add(node.id)
          let cur = node.id
          while (parentMap.has(cur)) {
            const pid = parentMap.get(cur)!
            matching.add(pid)
            cur = pid
          }
        }
        if (node.children) findMatches(node.children)
      })
    }

    findMatches(data)

    const filterTree = (nodes: FileTreeNode[]): FileTreeNode[] =>
      nodes
        .filter((n) => matching.has(n.id))
        .map((n) => ({
          ...n,
          children: n.children ? filterTree(n.children) : undefined,
        }))

    return filterTree(data)
  }, [data, searchQuery])

  return (
    <>
      {/* Slide-in drawer */}
      <div
        className="absolute top-0 left-0 h-full transition-transform duration-300 ease-in-out shadow-xl z-10"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          width: '260px',
        }}
      >
        <div className="h-full flex flex-col bg-surface border-r border-border">
          {/* Header */}
          <div className="px-3 py-2.5 flex items-center justify-between border-b border-border bg-surface flex-shrink-0">
            <button
              onClick={onToggle}
              className="flex items-center gap-2 transition-colors group"
            >
              <ListTree size={14} className="text-text-muted group-hover:text-text transition-colors" />
              <span className="text-xs font-semibold tracking-widest text-text-muted group-hover:text-text transition-colors">
                OUTLINER
              </span>
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={handleSearchToggle}
                className={`p-1 hover:bg-surface-hover rounded transition-colors ${showSearch ? 'bg-surface-hover' : ''}`}
                aria-label="Toggle search"
              >
                <Search size={14} className={showSearch ? 'text-text' : 'text-text-muted'} />
              </button>
              <button
                onClick={onToggle}
                className="p-1 hover:bg-surface-hover rounded transition-colors"
                aria-label="Close outliner"
              >
                <X size={14} className="text-text-muted" />
              </button>
            </div>
          </div>

          {/* Search input */}
          {showSearch && (
            <div className="px-3 py-2 border-b border-border flex-shrink-0">
              <input
                type="text"
                placeholder="Search parts…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2 py-1 bg-surface-elevated border border-border rounded text-xs text-text placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
                autoFocus
              />
            </div>
          )}

          {/* Part count */}
          <div className="px-3 py-1.5 border-b border-border flex-shrink-0">
            <span className="text-[10px] font-semibold tracking-widest text-muted uppercase">
              {filteredData.length > 0
                ? `${countParts(filteredData)} parts`
                : 'No parts'}
            </span>
          </div>

          {/* Tree */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {filteredData.length > 0 ? (
              <PartTree
                data={filteredData}
                partVisibility={partVisibility}
                onVisibilityToggle={onVisibilityToggle}
                onNodeSelect={onNodeSelect}
                onNodeHover={onNodeHover}
                onSelectAllInFolder={onSelectAllInFolder}
                selectedParts={selectedParts}
                hoveredPart={hoveredPart}
                className="h-full"
              />
            ) : (
              <div className="flex items-center justify-center h-full p-4">
                <span className="text-xs text-text-muted text-center">
                  {searchQuery ? 'No matching parts' : 'No parts loaded'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toggle button (visible when drawer is closed) */}
      {!open && (
        <button
          onClick={onToggle}
          className="absolute top-4 left-4 p-2 bg-surface/90 backdrop-blur-sm hover:bg-surface-hover border border-border rounded-md transition-colors z-20"
          title="Open Outliner (parts tree)"
          aria-label="Open outliner"
        >
          <ListTree size={16} className="text-text-muted" />
        </button>
      )}
    </>
  )
}

function countParts(nodes: FileTreeNode[]): number {
  let count = 0
  const walk = (list: FileTreeNode[]) => {
    list.forEach((n) => {
      if (n.type === 'part') count++
      if (n.children) walk(n.children)
    })
  }
  walk(nodes)
  return count
}
