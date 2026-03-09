/**
 * Builds a part tree from STEP text entities — no OCCT required.
 * Uses PRODUCT, PRODUCT_DEFINITION_FORMATION[_WITH_SPECIFIED_SOURCE],
 * PRODUCT_DEFINITION, and NEXT_ASSEMBLY_USAGE_OCCURRENCE to reconstruct
 * the assembly hierarchy and part names.
 */

import {
  type StepEntity,
  extractString,
  extractRef,
  getNthParam,
  looksLikeFilePath,
} from './stepParser'

export interface TreeNode {
  id: string
  name: string
  instanceName: string
  parentId: string | null
  children: string[]
  isAssembly: boolean
  needsNameFix: boolean
}

export function buildPartTree(entities: StepEntity[]): TreeNode[] {
  // product_id → product name
  const productName = new Map<number, string>()
  for (const e of entities) {
    if (e.type !== 'PRODUCT') continue
    productName.set(e.id, extractString(getNthParam(e.params, 0)) || '')
  }

  // product_id → pdform_id
  const formByProduct = new Map<number, number>()
  for (const e of entities) {
    if (
      e.type !== 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE' &&
      e.type !== 'PRODUCT_DEFINITION_FORMATION'
    ) continue
    const prodId = extractRef(getNthParam(e.params, 2))
    if (prodId >= 0) formByProduct.set(prodId, e.id)
  }

  // pdform_id → pd_id
  const pdByForm = new Map<number, number>()
  // pd_id → product_id (reverse lookup)
  const productByPd = new Map<number, number>()
  for (const e of entities) {
    if (e.type !== 'PRODUCT_DEFINITION') continue
    const formId = extractRef(getNthParam(e.params, 2))
    if (formId >= 0) {
      pdByForm.set(formId, e.id)
      // Reverse: find which product this PD belongs to
      for (const [prodId, fId] of formByProduct) {
        if (fId === formId) { productByPd.set(e.id, prodId); break }
      }
    }
  }

  // NAUO: NEXT_ASSEMBLY_USAGE_OCCURRENCE('','instanceName','',#parentPD,#childPD,$)
  // child_pd_id → { instanceName, parent_pd_id }
  const nauoByChildPD = new Map<number, { instanceName: string; parentPdId: number }>()
  for (const e of entities) {
    if (e.type !== 'NEXT_ASSEMBLY_USAGE_OCCURRENCE') continue
    const instanceName = extractString(getNthParam(e.params, 1))
    const parentPdId = extractRef(getNthParam(e.params, 3))
    const childPdId = extractRef(getNthParam(e.params, 4))
    if (childPdId >= 0 && parentPdId >= 0) {
      nauoByChildPD.set(childPdId, { instanceName: instanceName || '', parentPdId })
    }
  }

  // Build node map keyed on product_id (string for the UI)
  const nodeMap = new Map<string, TreeNode>()

  for (const [productId, name] of productName) {
    const formId = formByProduct.get(productId)
    const pdId = formId !== undefined ? pdByForm.get(formId) : undefined

    let instanceName = ''
    if (pdId !== undefined) {
      const nauo = nauoByChildPD.get(pdId)
      if (nauo && !looksLikeFilePath(nauo.instanceName)) instanceName = nauo.instanceName
    }

    const needsNameFix = name === '0' || name === ''
    const displayName = needsNameFix
      ? (instanceName || `Part ${productId}`)
      : name

    nodeMap.set(String(productId), {
      id: String(productId),
      name: displayName,
      instanceName,
      parentId: null, // filled below
      children: [],
      isAssembly: false, // determined below
      needsNameFix,
    })
  }

  // Wire up parent/child from NAUO
  for (const [childPdId, { parentPdId }] of nauoByChildPD) {
    const childProductId = productByPd.get(childPdId)
    const parentProductId = productByPd.get(parentPdId)
    if (childProductId === undefined || parentProductId === undefined) continue

    const childKey = String(childProductId)
    const parentKey = String(parentProductId)
    const childNode = nodeMap.get(childKey)
    const parentNode = nodeMap.get(parentKey)
    if (!childNode || !parentNode) continue

    childNode.parentId = parentKey
    if (!parentNode.children.includes(childKey)) parentNode.children.push(childKey)
    parentNode.isAssembly = true
  }

  // Return flat array sorted: roots first, then children
  return Array.from(nodeMap.values())
}

/** Flatten a tree node list into a depth-first ordered array with depth info. */
export interface FlatTreeNode extends TreeNode {
  depth: number
}

export function flattenTree(nodes: TreeNode[]): FlatTreeNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const result: FlatTreeNode[] = []

  function visit(id: string, depth: number) {
    const node = nodeMap.get(id)
    if (!node) return
    result.push({ ...node, depth })
    for (const childId of node.children) visit(childId, depth + 1)
  }

  const roots = nodes.filter((n) => n.parentId === null)
  for (const root of roots) visit(root.id, 0)

  return result
}
