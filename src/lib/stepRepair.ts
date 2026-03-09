/**
 * Text-level STEP file repair engine.
 * Port of PatchContentImpl from native/src/step_text_patch.cpp.
 * Fixes:
 *   1. PRODUCT entities with name '0' → real name from MSB chain or NAUO fallback
 *   2. HOOPS Exchange per-face color overrides → strip OVER_RIDING_STYLED_ITEM,
 *      rebuild MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION
 *   3. Axis-swap — rotate all CARTESIAN_POINT and DIRECTION coordinates
 *      (e.g. Z-up ↔ Y-up) without any geometry library
 */

import {
  type StepEntity,
  collectEntities,
  getNthParam,
  getParamsFrom,
  extractString,
  extractRef,
  parseRefList,
  escapeStepString,
  looksLikeFilePath,
} from './stepParser'
import type { AxisSwap } from '../types'

interface Patch {
  start: number
  end: number
  text: string
}

// ---------------------------------------------------------------------------
// Fix 1: Product name repair
// ---------------------------------------------------------------------------

export function buildNamePatches(entities: StepEntity[]): Patch[] {
  const patches: Patch[] = []

  // MSB name path:
  // MANIFOLD_SOLID_BREP('name', ...) → msb_id → name
  const msbName = new Map<number, string>()
  for (const e of entities) {
    if (e.type !== 'MANIFOLD_SOLID_BREP') continue
    const n = extractString(getNthParam(e.params, 0))
    if (n && n !== '0' && n !== ' ') msbName.set(e.id, n)
  }

  // ADVANCED_BREP_SHAPE_REPRESENTATION('', (items...), #ctx)
  // param 1 items tuple contains the MSB ref → absr_id → msb name
  const absrName = new Map<number, string>()
  for (const e of entities) {
    if (e.type !== 'ADVANCED_BREP_SHAPE_REPRESENTATION') continue
    for (const ref of parseRefList(getNthParam(e.params, 1))) {
      const n = msbName.get(ref)
      if (n) { absrName.set(e.id, n); break }
    }
  }

  // SHAPE_REPRESENTATION_RELATIONSHIP('','',#sr,#absr) → sr_id → msb name
  const srName = new Map<number, string>()
  for (const e of entities) {
    if (e.type !== 'SHAPE_REPRESENTATION_RELATIONSHIP') continue
    const id2 = extractRef(getNthParam(e.params, 2))
    const id3 = extractRef(getNthParam(e.params, 3))
    if (id2 < 0 || id3 < 0) continue
    const n3 = absrName.get(id3)
    const n2 = absrName.get(id2)
    if (n3) srName.set(id2, n3)
    else if (n2) srName.set(id3, n2)
  }

  // SHAPE_DEFINITION_REPRESENTATION(#pds, #sr) → pds_id → msb name
  const pdsName = new Map<number, string>()
  for (const e of entities) {
    if (e.type !== 'SHAPE_DEFINITION_REPRESENTATION') continue
    const pds_id = extractRef(getNthParam(e.params, 0))
    const sr_id = extractRef(getNthParam(e.params, 1))
    const n = srName.get(sr_id)
    if (n !== undefined && pds_id >= 0) pdsName.set(pds_id, n)
  }

  // PRODUCT_DEFINITION_SHAPE('','', #pd) → pd_id → msb name
  const pdMsbName = new Map<number, string>()
  for (const e of entities) {
    if (e.type !== 'PRODUCT_DEFINITION_SHAPE') continue
    const pd_id = extractRef(getNthParam(e.params, 2))
    const n = pdsName.get(e.id)
    if (n !== undefined && pd_id >= 0) pdMsbName.set(pd_id, n)
  }

  // NAUO fallback maps
  const formByProduct = new Map<number, number>() // product_id → pdform_id
  const pdByForm = new Map<number, number>()       // pdform_id  → pd_id
  const nauoNameByPD = new Map<number, string>()  // child_pd_id → instance name

  for (const e of entities) {
    if (
      e.type === 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE' ||
      e.type === 'PRODUCT_DEFINITION_FORMATION'
    ) {
      const prodId = extractRef(getNthParam(e.params, 2))
      if (prodId >= 0) formByProduct.set(prodId, e.id)
    } else if (e.type === 'PRODUCT_DEFINITION') {
      const formId = extractRef(getNthParam(e.params, 2))
      if (formId >= 0) pdByForm.set(formId, e.id)
    } else if (e.type === 'NEXT_ASSEMBLY_USAGE_OCCURRENCE') {
      const n = extractString(getNthParam(e.params, 1))
      const cpd = extractRef(getNthParam(e.params, 4))
      if (cpd >= 0 && n) nauoNameByPD.set(cpd, n)
    }
  }

  // Apply substitutions
  for (const e of entities) {
    if (e.type !== 'PRODUCT') continue
    if (extractString(getNthParam(e.params, 0)) !== '0') continue

    let newName = ''

    // MSB path: product → pdform → pd → pdMsbName
    const formId = formByProduct.get(e.id)
    if (formId !== undefined) {
      const pdId = pdByForm.get(formId)
      if (pdId !== undefined) {
        const msbN = pdMsbName.get(pdId)
        if (msbN) newName = msbN

        // NAUO fallback
        if (!newName) {
          const nauoN = nauoNameByPD.get(pdId)
          if (nauoN && !looksLikeFilePath(nauoN)) newName = nauoN
        }
      }
    }

    if (!newName || newName === '0') continue

    const esc = escapeStepString(newName)
    const restPars = getParamsFrom(e.params, 2)
    const newText = `#${e.id}=PRODUCT('${esc}','${esc}',${restPars});\n`
    patches.push({ start: e.byteStart, end: e.byteEnd, text: newText })
  }

  return patches
}

// ---------------------------------------------------------------------------
// Fix 2: HOOPS Exchange compatibility
// ---------------------------------------------------------------------------

export function buildHoopsPatches(entities: StepEntity[], content: string): Patch[] {
  if (!content.includes('HOOPS Exchange')) return []

  const patches: Patch[] = []
  const overridingIds = new Set<number>()

  for (const e of entities) {
    if (e.type !== 'OVER_RIDING_STYLED_ITEM') continue
    overridingIds.add(e.id)
    patches.push({ start: e.byteStart, end: e.byteEnd, text: '' }) // delete entity
  }

  if (overridingIds.size === 0) return []

  for (const e of entities) {
    if (e.type !== 'MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION') continue

    const p0 = getNthParam(e.params, 0) // ''
    const p1 = getNthParam(e.params, 1) // (refs...)
    const p2 = getNthParam(e.params, 2) // #context

    const allRefs = parseRefList(p1)
    const kept = allRefs.filter((ref) => !overridingIds.has(ref))
    if (kept.length === allRefs.length) break // nothing to change

    const newItems = '(' + kept.map((r) => `#${r}`).join(',') + ')'
    const newText =
      `#${e.id}=MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION(${p0},${newItems},${p2});\n`
    patches.push({ start: e.byteStart, end: e.byteEnd, text: newText })
    break // only one MDGPR expected
  }

  return patches
}

// ---------------------------------------------------------------------------
// Fix 3: Axis-swap (Z-up ↔ Y-up)
// ---------------------------------------------------------------------------

/**
 * Format a float back to a STEP real literal.
 * STEP requires a decimal point in real numbers (e.g. "1." not "1").
 */
function formatFloat(n: number): string {
  if (Object.is(n, -0)) return '-0.'
  const s = n.toString()
  if (s.includes('.')) return s
  // Scientific notation — ensure uppercase E as per STEP convention
  if (s.includes('e') || s.includes('E')) return s.replace('e', 'E')
  return s + '.'
}

// Shape-representation entity types whose items list may contain an
// AXIS2_PLACEMENT_3D that defines the shape's local-to-world coordinate frame.
const SHAPE_REP_TYPES = new Set([
  'SHAPE_REPRESENTATION',
  'ADVANCED_BREP_SHAPE_REPRESENTATION',
  'BREP_WITH_VOIDS_SHAPE_REPRESENTATION',
  'MANIFOLD_SURFACE_SHAPE_REPRESENTATION',
  'GEOMETRICALLY_BOUNDED_SURFACE_SHAPE_REPRESENTATION',
  'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION',
  'EDGE_BASED_WIREFRAME_SHAPE_REPRESENTATION',
])

export function buildAxisSwapPatches(
  entities: StepEntity[],
  mode: Exclude<AxisSwap, 'none'>,
): Patch[] {
  const byId = new Map<number, StepEntity>()
  for (const e of entities) byId.set(e.id, e)

  // Collect DIRECTION entity IDs that define a shape representation's coordinate frame.
  //
  // A shape representation (ADVANCED_BREP_SHAPE_REPRESENTATION, etc.) includes an
  // AXIS2_PLACEMENT_3D in its items list.  The CAD reader builds a rotation matrix
  // from that AP3D and applies it as a LOCAL-TO-WORLD transform on all the geometry.
  // If we also rotate those DIRECTION vectors, the reader applies a second 90° rotation
  // on top of the already-rotated geometry — producing 180° instead of 90°.
  // Solution: leave those frame DIRECTION entities untouched; transform everything else.
  const frameDirectionIds = new Set<number>()
  for (const e of entities) {
    if (!SHAPE_REP_TYPES.has(e.type)) continue
    // param 1 = items tuple, e.g. (#axis_placement, #solid, ...)
    for (const ref of parseRefList(getNthParam(e.params, 1))) {
      const item = byId.get(ref)
      if (item?.type !== 'AXIS2_PLACEMENT_3D') continue
      // AXIS2_PLACEMENT_3D params: ('name', #location, #axis_dir, #ref_dir)
      // param 2 = axis DIRECTION (local Z), param 3 = ref_direction DIRECTION (local X)
      const axisId = extractRef(getNthParam(item.params, 2))
      const refDirId = extractRef(getNthParam(item.params, 3))
      if (axisId >= 0) frameDirectionIds.add(axisId)
      if (refDirId >= 0) frameDirectionIds.add(refDirId)
    }
  }

  const patches: Patch[] = []

  for (const e of entities) {
    if (e.type !== 'CARTESIAN_POINT' && e.type !== 'DIRECTION') continue

    // Skip DIRECTION entities that are part of a shape representation's coordinate frame —
    // the CAD reader will apply them as a local-to-world matrix, so rotating them here
    // would double-apply the rotation.
    if (e.type === 'DIRECTION' && frameDirectionIds.has(e.id)) continue

    // param 0 = name string, param 1 = coordinate tuple (x,y,z)
    const tuplePart = getNthParam(e.params, 1).trim()
    if (!tuplePart.startsWith('(') || !tuplePart.endsWith(')')) continue

    const coords = tuplePart.slice(1, -1).split(',')
    if (coords.length !== 3) continue

    const x = parseFloat(coords[0])
    const y = parseFloat(coords[1])
    const z = parseFloat(coords[2])
    if (isNaN(x) || isNaN(y) || isNaN(z)) continue

    // Z-up → Y-up: rotate −90° around X  →  (x, y, z) ⟶ (x,  z, −y)
    // Y-up → Z-up: rotate +90° around X  →  (x, y, z) ⟶ (x, −z,  y)
    const [nx, ny, nz] = mode === 'zUpToYUp' ? [x, z, -y] : [x, -z, y]

    // Skip coordinates that are unchanged (e.g. pure-X-axis points)
    if (nx === x && ny === y && nz === z) continue

    const namePart = getNthParam(e.params, 0)
    const newText =
      `#${e.id}=${e.type}(${namePart},(${formatFloat(nx)},${formatFloat(ny)},${formatFloat(nz)}));\n`
    patches.push({ start: e.byteStart, end: e.byteEnd, text: newText })
  }

  return patches
}

// ---------------------------------------------------------------------------
// Apply patches to content string
// ---------------------------------------------------------------------------

export function applyPatches(content: string, patches: Patch[]): string {
  if (patches.length === 0) return content

  // Sort by byte offset ascending
  const sorted = [...patches].sort((a, b) => a.start - b.start)

  const parts: string[] = []
  let pos = 0
  for (const patch of sorted) {
    if (patch.start > pos) parts.push(content.slice(pos, patch.start))
    if (patch.text) parts.push(patch.text)
    pos = patch.end
  }
  if (pos < content.length) parts.push(content.slice(pos))
  return parts.join('')
}

// ---------------------------------------------------------------------------
// Header stamp: insert /* Repaired by StairRepair Lite */ after HEADER; line
// ---------------------------------------------------------------------------

function addRepairStamp(content: string): string {
  // Don't double-stamp
  if (content.includes('/* Repaired by StairRepair Lite */')) return content

  const headerIdx = content.indexOf('HEADER;')
  const insertAfter = headerIdx !== -1 ? headerIdx + 'HEADER;'.length : -1

  if (insertAfter === -1) return content

  const eol = content.indexOf('\n', insertAfter)
  const pos = eol === -1 ? insertAfter : eol + 1
  return content.slice(0, pos) + '/* Repaired by StairRepair Lite */\n' + content.slice(pos)
}

// ---------------------------------------------------------------------------
// Public API: patch content string → patched string + log
// ---------------------------------------------------------------------------

export interface RepairResult {
  content: string
  log: string[]
  namesFlagged: number
  hoopsFixesApplied: number
  axisSwapApplied: boolean
}

export function repairStepContent(
  content: string,
  fixNames: boolean,
  fixHoopsCompat: boolean,
  axisSwap: AxisSwap = 'none',
): RepairResult {
  const entities = collectEntities(content)
  const log: string[] = []
  const patches: Patch[] = []

  let namePatches: Patch[] = []
  let hoopsPatches: Patch[] = []
  let axisPatches: Patch[] = []

  if (fixNames) {
    namePatches = buildNamePatches(entities)
    if (namePatches.length > 0) {
      log.push(`Fixed ${namePatches.length} product name(s)`)
    } else {
      log.push('No product name fixes needed')
    }
    patches.push(...namePatches)
  }

  if (fixHoopsCompat) {
    hoopsPatches = buildHoopsPatches(entities, content)
    if (hoopsPatches.length > 0) {
      const deletedItems = hoopsPatches.filter((p) => p.text === '').length
      log.push(`Stripped ${deletedItems} HOOPS Exchange per-face color override(s)`)
    } else if (content.includes('HOOPS Exchange')) {
      log.push('HOOPS Exchange file — no per-face color overrides found')
    } else {
      log.push('Not a HOOPS Exchange file — no compat fix needed')
    }
    patches.push(...hoopsPatches)
  }

  if (axisSwap !== 'none') {
    axisPatches = buildAxisSwapPatches(entities, axisSwap)
    const label = axisSwap === 'zUpToYUp' ? 'Z-up → Y-up' : 'Y-up → Z-up'
    if (axisPatches.length > 0) {
      log.push(`Axis swap (${label}): rotated ${axisPatches.length} coordinate(s)`)
    } else {
      log.push(`Axis swap (${label}): no coordinates found`)
    }
    patches.push(...axisPatches)
  }

  const hadFixes = namePatches.length > 0 || hoopsPatches.length > 0 || axisPatches.length > 0
  const patched = hadFixes
    ? addRepairStamp(applyPatches(content, patches))
    : applyPatches(content, patches)

  return {
    content: patched,
    log,
    namesFlagged: namePatches.length,
    hoopsFixesApplied: hoopsPatches.filter((p) => p.text === '').length,
    axisSwapApplied: axisPatches.length > 0,
  }
}
