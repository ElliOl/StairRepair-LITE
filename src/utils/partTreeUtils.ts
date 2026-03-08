import type { PartNode } from '../types'

export type FileTreeNodeType = 'folder' | 'part'

export interface FileTreeNode {
  id: string
  name: string
  /** NAUO instance name when the PRODUCT name is '0' — revealed after repair. */
  instanceName?: string
  type: FileTreeNodeType
  color?: [number, number, number]
  children?: FileTreeNode[]
}

/**
 * Converts a flat PartNode[] (with parentId/children references) to a
 * nested FileTreeNode[] tree for rendering in the PartTree component.
 * Assembly parts become folders; geometry-bearing leaf parts become part nodes.
 */
export function convertPartsToFileTree(parts: PartNode[]): FileTreeNode[] {
  const map = new Map<string, PartNode>()
  parts.forEach((p) => map.set(p.id, p))

  const convert = (part: PartNode): FileTreeNode => {
    const isFolder = part.isAssembly || part.children.length > 0
    // Expose the NAUO instance name only when it differs from the PRODUCT name
    // (i.e. the file is unrepaired and the PRODUCT name is '0').
    const instanceName =
      part.instanceName && part.instanceName !== part.name ? part.instanceName : undefined
    return {
      id: part.id,
      name: part.name || part.id,
      instanceName,
      type: isFolder ? 'folder' : 'part',
      color: part.color ?? undefined,
      children: isFolder
        ? part.children
            .map((childId) => map.get(childId))
            .filter((p): p is PartNode => p !== undefined)
            .map(convert)
        : undefined,
    }
  }

  const roots = parts.filter((p) => p.parentId === null)
  return roots.map(convert)
}

/**
 * Collects all part IDs (leaf nodes) within a subtree rooted at nodeId.
 */
export function getAllPartIdsInSubtree(nodeId: string, nodes: FileTreeNode[]): string[] {
  const findNode = (list: FileTreeNode[], id: string): FileTreeNode | null => {
    for (const n of list) {
      if (n.id === id) return n
      if (n.children) {
        const found = findNode(n.children, id)
        if (found) return found
      }
    }
    return null
  }

  const node = findNode(nodes, nodeId)
  if (!node) return []

  const result: string[] = []
  const collect = (n: FileTreeNode) => {
    if (n.type === 'part') result.push(n.id)
    n.children?.forEach(collect)
  }
  collect(node)
  return result
}

/**
 * Collects all descendant IDs (both folders and parts) from the flat PartNode list.
 * Used for cascading visibility changes.
 */
export function getAllDescendantIds(nodeId: string, parts: PartNode[]): string[] {
  const partMap = new Map<string, PartNode>()
  parts.forEach((p) => partMap.set(p.id, p))

  const result: string[] = []
  const queue = [nodeId]
  while (queue.length) {
    const id = queue.shift()!
    const part = partMap.get(id)
    if (part) {
      result.push(id)
      queue.push(...part.children)
    }
  }
  return result
}
