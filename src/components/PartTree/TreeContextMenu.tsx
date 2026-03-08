/**
 * TreeContextMenu – right-click context menu for PartTree nodes.
 * Adapted from Trace-CAD-visualizer's TreeContextMenu component.
 */

import * as React from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'

interface TreeContextMenuProps {
  type: 'folder' | 'part'
  nodeId: string
  onSelectAll?: (folderId: string) => void
  children: React.ReactNode
}

export function TreeContextMenu({ type, nodeId, onSelectAll, children }: TreeContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="bg-surface border border-border rounded-md shadow-xl p-1 min-w-[180px] z-50">
          {type === 'folder' && onSelectAll && (
            <ContextMenu.Item
              onSelect={() => onSelectAll(nodeId)}
              className="px-3 py-2 text-xs text-text hover:bg-surface-hover rounded cursor-pointer outline-none transition-colors"
            >
              Select All Parts
            </ContextMenu.Item>
          )}

          {type === 'part' && (
            <ContextMenu.Item
              disabled
              className="px-3 py-2 text-xs text-muted rounded cursor-default outline-none"
            >
              Part
            </ContextMenu.Item>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
