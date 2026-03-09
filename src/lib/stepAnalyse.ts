/**
 * Text-level STEP file analyser.
 * Port of CountHoopsCompatFixes from native/src/hoops_compat.cpp
 * plus name-issue detection from the entity scan.
 * No OCCT — pure string operations.
 */

import { collectEntities, extractString, getNthParam } from './stepParser'
import { buildPartTree, type TreeNode } from './stepTree'

export interface AnalyseResult {
  namesFlagged: number
  hoopsCompatFixes: number
  tree: TreeNode[]
}

export function analyseStepContent(content: string): AnalyseResult {
  const entities = collectEntities(content)

  // ---- Count PRODUCT entities with name '0' --------------------------------
  let namesFlagged = 0
  for (const e of entities) {
    if (e.type !== 'PRODUCT') continue
    const name = extractString(getNthParam(e.params, 0))
    if (name === '0' || name === '') namesFlagged++
  }

  // ---- HOOPS Exchange face coverage gap -----------------------------------
  // Port of CountHoopsCompatFixes from native/src/hoops_compat.cpp
  let hoopsCompatFixes = 0

  if (content.includes('HOOPS Exchange')) {
    // Count ADVANCED_FACE entity definitions
    const afNeedle = '=ADVANCED_FACE('
    let faceCount = 0
    let searchPos = 0
    while (true) {
      const idx = content.indexOf(afNeedle, searchPos)
      if (idx === -1) break
      faceCount++
      searchPos = idx + afNeedle.length
    }

    if (faceCount > 0) {
      // Locate MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION
      const mdgrNeedle = 'MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('
      const mdgrPos = content.indexOf(mdgrNeedle)

      if (mdgrPos === -1) {
        // HOOPS file but no MDGPR at all — all faces uncovered
        hoopsCompatFixes = faceCount
      } else {
        // Find the items list: after entity name + '(' we have: '',(items),#context
        const searchFrom = mdgrPos + mdgrNeedle.length
        const commaOpen = content.indexOf(',(', searchFrom)

        if (commaOpen !== -1) {
          let scanPos = commaOpen + 2
          let itemCount = 0
          let depth = 1
          while (scanPos < content.length && depth > 0) {
            const c = content[scanPos]
            if (c === '(') depth++
            else if (c === ')') depth--
            else if (c === '#') itemCount++
            scanPos++
          }
          // itemCount = OVER_RIDING_STYLED_ITEM count + 1 base STYLED_ITEM
          // covered faces = itemCount - 1
          const coveredFaces = Math.max(0, itemCount - 1)
          const uncovered = faceCount - coveredFaces
          hoopsCompatFixes = uncovered > 0 ? uncovered : 0
        } else {
          hoopsCompatFixes = faceCount
        }
      }
    }
  }

  // ---- Build part tree from entity relationships -------------------------
  const tree = buildPartTree(entities)

  return { namesFlagged, hoopsCompatFixes, tree }
}
