/**
 * PartTree – hierarchical CAD part tree for STEP files.
 *
 * Adapted from Trace-CAD-visualizer's FileTree component.
 * Uses Radix UI Accordion for collapsible folders, Tailwind for styling.
 * Supports visibility toggles, selection, hover, and inline rename.
 */

import * as React from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronRight, Folder, Box, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { TreeContextMenu } from './TreeContextMenu'
import type { FileTreeNode } from '../../utils/partTreeUtils'

export type { FileTreeNode }

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Ensures dark STEP colors are visible against the dark background.
 * Brightens colors below a minimum perceived brightness threshold.
 */
function filterDarkColor(rgb: [number, number, number]): string {
  const r = rgb[0] * 255
  const g = rgb[1] * 255
  const b = rgb[2] * 255
  const brightness = r * 0.299 + g * 0.587 + b * 0.114
  const minBrightness = 42
  if (brightness < minBrightness) {
    const scale = minBrightness / Math.max(brightness, 1)
    return `rgb(${Math.min(255, Math.round(r * scale))}, ${Math.min(255, Math.round(g * scale))}, ${Math.min(255, Math.round(b * scale))})`
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Renders a part label.  When the PRODUCT name is '0' (unrepaired Plasticity
 * export) and we have the NAUO instance name, we show a subtle "→ realName"
 * hint so the user can see what the part will be called after the fix.
 */
function PartLabel({ name, instanceName, visible }: { name: string; instanceName?: string; visible: boolean }) {
  const isBroken = name === '0' && instanceName
  return (
    <span className={`text-xs truncate flex-1 ${visible ? 'text-text-muted' : 'text-muted'} flex items-center gap-1 min-w-0`}>
      <span className={`truncate ${isBroken ? 'text-amber-400/80' : ''}`}>{name}</span>
      {isBroken && (
        <>
          <AlertTriangle size={9} className="flex-shrink-0 text-amber-500/60" />
          <span className="truncate italic text-[10px] text-amber-400/50">→ {instanceName}</span>
        </>
      )}
    </span>
  )
}

export type PartVisibilityMap = Record<string, boolean>

export interface PartTreeProps {
  data: FileTreeNode[]
  partVisibility?: PartVisibilityMap
  onVisibilityToggle?: (nodeId: string, visible: boolean) => void
  onNodeSelect?: (nodeId: string, mode: 'add' | 'subtract' | 'replace') => void
  onNodeRename?: (nodeId: string, newName: string) => void
  onNodeHover?: (nodeId: string | null) => void
  onSelectAllInFolder?: (folderId: string) => void
  selectedParts?: Set<string>
  hoveredPart?: string | null
  className?: string
}

// =============================================================================
// TREE NODE
// =============================================================================

interface TreeNodeProps {
  node: FileTreeNode
  level: number
  partVisibility?: PartVisibilityMap
  onVisibilityToggle?: (nodeId: string, visible: boolean) => void
  onNodeSelect?: (nodeId: string, mode: 'add' | 'subtract' | 'replace') => void
  onNodeRename?: (nodeId: string, newName: string) => void
  onNodeHover?: (nodeId: string | null) => void
  onSelectAllInFolder?: (folderId: string) => void
  selectedParts?: Set<string>
  hoveredPart?: string | null
  openFolders?: string[]
}

function TreeNode({
  node,
  level,
  partVisibility,
  onVisibilityToggle,
  onNodeSelect,
  onNodeRename,
  onNodeHover,
  onSelectAllInFolder,
  selectedParts,
  hoveredPart,
  openFolders,
}: TreeNodeProps) {
  const visibilityFromMap = partVisibility?.[node.id]
  const initialVisibility = visibilityFromMap !== undefined ? visibilityFromMap : true

  const [isVisible, setIsVisible] = React.useState(initialVisibility)
  const [isEditing, setIsEditing] = React.useState(false)
  const [editName, setEditName] = React.useState(node.name)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const rowRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const vis = partVisibility?.[node.id]
    setIsVisible(vis !== undefined ? vis : true)
  }, [partVisibility, node.id])

  const handleVisibilityToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !isVisible
    setIsVisible(next)
    onVisibilityToggle?.(node.id, next)
  }

  const handleNodeClick = (e: React.MouseEvent) => {
    if (e.detail > 1) return
    if (!isEditing && node.type === 'part') {
      let mode: 'add' | 'subtract' | 'replace'
      if (e.shiftKey) {
        mode = 'add'
      } else if (e.metaKey || e.ctrlKey) {
        mode = isSelected ? 'subtract' : 'add'
      } else {
        mode = isSelected ? 'subtract' : 'replace'
      }
      onNodeSelect?.(node.id, mode)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setEditName(node.name)
  }

  const handleRenameComplete = () => {
    if (editName.trim() && editName !== node.name) {
      onNodeRename?.(node.id, editName.trim())
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameComplete()
    else if (e.key === 'Escape') {
      setEditName(node.name)
      setIsEditing(false)
    }
  }

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const isSelected = selectedParts?.has(node.id) ?? false
  const isHovered = hoveredPart === node.id

  React.useEffect(() => {
    if (isSelected && node.type === 'part' && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isSelected, node.type])

  const hasSelectedDescendant = React.useMemo(() => {
    if (node.type !== 'folder' || !selectedParts || selectedParts.size === 0) return false
    const check = (n: FileTreeNode): boolean => {
      if (n.type === 'part') return selectedParts.has(n.id)
      return n.children?.some(check) ?? false
    }
    return node.children?.some(check) ?? false
  }, [node.type, node.children, selectedParts])

  const isOpen = openFolders ? openFolders.includes(node.id) : true
  const showFolderHighlight = node.type === 'folder' && !isOpen && hasSelectedDescendant

  React.useEffect(() => {
    if (showFolderHighlight && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [showFolderHighlight])

  const getAllPartIds = (folderNode: FileTreeNode): string[] => {
    const ids: string[] = []
    const collect = (n: FileTreeNode) => {
      if (n.type === 'part') ids.push(n.id)
      n.children?.forEach(collect)
    }
    collect(folderNode)
    return ids
  }

  const handleFolderTextClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.detail > 1) return
    if (!isEditing && node.type === 'folder') {
      const partIds = getAllPartIds(node)
      const allSelected = partIds.length > 0 && partIds.every((id) => selectedParts?.has(id))
      if (allSelected) {
        partIds.forEach((id) => onNodeSelect?.(id, 'subtract'))
      } else {
        onSelectAllInFolder?.(node.id)
      }
    }
  }

  // Folder node
  if (node.type === 'folder' && node.children) {
    return (
      <TreeContextMenu type="folder" nodeId={node.id} onSelectAll={onSelectAllInFolder}>
        <Accordion.Item value={node.id} className="border-none">
          <div
            ref={rowRef}
            className={`flex items-center gap-2 w-full py-1 px-2 rounded-md transition-colors group ${
              showFolderHighlight ? 'bg-white/10 hover:bg-white/15' : 'hover:bg-surface-hover'
            }`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onDoubleClick={handleDoubleClick}
            onMouseEnter={() => onNodeHover?.(node.id)}
            onMouseLeave={() => onNodeHover?.(null)}
          >
            <Accordion.Trigger
              className="flex items-center gap-2 flex-shrink-0 outline-none [&[data-state=open]>svg:first-child]:rotate-90"
              onClick={(e) => e.stopPropagation()}
            >
              <ChevronRight size={12} className="text-text-muted transition-transform" />
              <Folder
                size={14}
                className={`flex-shrink-0 ${isVisible ? 'text-accent' : 'text-muted'}`}
              />
            </Accordion.Trigger>

            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRenameComplete}
                onKeyDown={handleKeyDown}
                className="text-xs text-text-muted bg-surface-elevated border border-border rounded px-1 outline-none focus:border-accent flex-1"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="flex-1 min-w-0 cursor-pointer" onClick={handleFolderTextClick}>
                <PartLabel name={node.name} instanceName={node.instanceName} visible={isVisible} />
              </div>
            )}

            {!isEditing && (
              <div
                onClick={handleVisibilityToggle}
                className={`p-1 hover:bg-surface-elevated rounded transition-all cursor-pointer ${isVisible ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
                role="button"
                aria-label={isVisible ? 'Hide folder' : 'Show folder'}
              >
                {isVisible ? (
                  <Eye size={12} className="text-text-muted" />
                ) : (
                  <EyeOff size={12} className="text-muted" />
                )}
              </div>
            )}
          </div>

          <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                level={level + 1}
                partVisibility={partVisibility}
                onVisibilityToggle={onVisibilityToggle}
                onNodeSelect={onNodeSelect}
                onNodeRename={onNodeRename}
                onNodeHover={onNodeHover}
                onSelectAllInFolder={onSelectAllInFolder}
                selectedParts={selectedParts}
                hoveredPart={hoveredPart}
                openFolders={openFolders}
              />
            ))}
          </Accordion.Content>
        </Accordion.Item>
      </TreeContextMenu>
    )
  }

  // Part node (leaf)
  return (
    <TreeContextMenu type="part" nodeId={node.id}>
      <div
        ref={rowRef}
        className={`flex items-center gap-2 py-1 px-2 rounded-md transition-colors cursor-pointer group ${
          isSelected
            ? 'bg-white/10'
            : isHovered
              ? 'bg-white/5'
              : 'hover:bg-surface-hover'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleNodeClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => onNodeHover?.(node.id)}
        onMouseLeave={() => onNodeHover?.(null)}
      >
        <div className="w-[12px]" />

        <Box
          size={14}
          className={`flex-shrink-0 ${isVisible ? '' : 'opacity-40'}`}
          style={node.color ? { color: filterDarkColor(node.color) } : undefined}
        />

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameComplete}
            onKeyDown={handleKeyDown}
            className="text-xs text-text-muted bg-surface-elevated border border-border rounded px-1 outline-none focus:border-accent flex-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <PartLabel name={node.name} instanceName={node.instanceName} visible={isVisible} />
        )}

        {!isEditing && (
          <div
            onClick={handleVisibilityToggle}
            className={`p-1 hover:bg-surface-elevated rounded transition-all cursor-pointer ${isVisible ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
            role="button"
            aria-label={isVisible ? 'Hide part' : 'Show part'}
          >
            {isVisible ? (
              <Eye size={12} className="text-text-muted" />
            ) : (
              <EyeOff size={12} className="text-muted" />
            )}
          </div>
        )}
      </div>
    </TreeContextMenu>
  )
}

// =============================================================================
// MAIN PART TREE COMPONENT
// =============================================================================

export function PartTree({
  data,
  partVisibility,
  onVisibilityToggle,
  onNodeSelect,
  onNodeRename,
  onNodeHover,
  onSelectAllInFolder,
  selectedParts,
  hoveredPart,
  className = '',
}: PartTreeProps) {
  const getRootFolderIds = (nodes: FileTreeNode[]): string[] =>
    nodes.filter((n) => n.type === 'folder').map((n) => n.id)

  const getAllFolderIdKey = (nodes: FileTreeNode[]): string => {
    const ids: string[] = []
    const collect = (list: FileTreeNode[]) => {
      list.forEach((n) => {
        if (n.type === 'folder') {
          ids.push(n.id)
          if (n.children) collect(n.children)
        }
      })
    }
    collect(nodes)
    return ids.join(',')
  }

  const [openFolders, setOpenFolders] = React.useState<string[]>(() => getRootFolderIds(data))

  // Reset open folders when tree data changes (new file loaded)
  const folderIdKey = getAllFolderIdKey(data)
  React.useEffect(() => {
    setOpenFolders(getRootFolderIds(data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderIdKey])

  return (
    <div
      className={`bg-surface overflow-y-auto ${className}`}
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a #111111' }}
    >
      <style>{`
        .part-tree-scroll::-webkit-scrollbar { width: 6px; }
        .part-tree-scroll::-webkit-scrollbar-track { background: #111111; }
        .part-tree-scroll::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
        .part-tree-scroll::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }
      `}</style>
      <Accordion.Root
        type="multiple"
        value={openFolders}
        onValueChange={setOpenFolders}
        className="py-1 part-tree-scroll"
      >
        {data.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            level={0}
            partVisibility={partVisibility}
            onVisibilityToggle={onVisibilityToggle}
            onNodeSelect={onNodeSelect}
            onNodeRename={onNodeRename}
            onNodeHover={onNodeHover}
            onSelectAllInFolder={onSelectAllInFolder}
            selectedParts={selectedParts}
            hoveredPart={hoveredPart}
            openFolders={openFolders}
          />
        ))}
      </Accordion.Root>
    </div>
  )
}
