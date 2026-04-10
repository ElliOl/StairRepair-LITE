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

  // Solid body name path: any solid body type → name (used to infer ABSR/product names)
  const SOLID_BODY_TYPES = new Set([
    'MANIFOLD_SOLID_BREP',
    'BREP_WITH_VOIDS',
    'FACETED_BREP',
    'FACETED_BREP_SHELL',
  ])
  const msbName = new Map<number, string>()
  for (const e of entities) {
    if (!SOLID_BODY_TYPES.has(e.type)) continue
    const n = extractString(getNthParam(e.params, 0))
    if (n && n !== '0' && n !== ' ') msbName.set(e.id, n)
  }

  // SHAPE_REPRESENTATION and ADVANCED_BREP_SHAPE_REPRESENTATION already carry
  // the correct assembly/folder name as their own first parameter (e.g. 'spheres',
  // 'cubes', 'comp').  Build a direct id → name map so we can use these names as
  // the primary source and avoid misusing the first solid's name as the assembly name.
  const srOwnName = new Map<number, string>()
  for (const e of entities) {
    if (
      e.type !== 'SHAPE_REPRESENTATION' &&
      e.type !== 'ADVANCED_BREP_SHAPE_REPRESENTATION'
    ) continue
    const n = extractString(getNthParam(e.params, 0))
    if (n && n !== '0' && n !== ' ') srOwnName.set(e.id, n)
  }

  // ADVANCED_BREP_SHAPE_REPRESENTATION('name', (items...), #ctx)
  // Prefer the entity's own name (the assembly/folder name).  Fall back to the
  // first solid body ref name only when the entity itself has no meaningful name.
  const absrName = new Map<number, string>()
  for (const e of entities) {
    if (e.type !== 'ADVANCED_BREP_SHAPE_REPRESENTATION') continue
    const ownN = srOwnName.get(e.id)
    if (ownN) { absrName.set(e.id, ownN); continue }
    for (const ref of parseRefList(getNthParam(e.params, 1))) {
      const n = msbName.get(ref)
      if (n) { absrName.set(e.id, n); break }
    }
  }

  // SHAPE_REPRESENTATION_RELATIONSHIP('','',#sr,#absr) → sr_id → assembly name
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

  // SHAPE_DEFINITION_REPRESENTATION(#pds, #sr) → pds_id → assembly name
  // Prefer the SR entity's own name (most direct source), then fall back to the
  // MSB-derived srName built from the relationship chain.
  const pdsName = new Map<number, string>()
  for (const e of entities) {
    if (e.type !== 'SHAPE_DEFINITION_REPRESENTATION') continue
    const pds_id = extractRef(getNthParam(e.params, 0))
    const sr_id = extractRef(getNthParam(e.params, 1))
    const n = srOwnName.get(sr_id) ?? srName.get(sr_id)
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
// Fix 2: Decompose multi-body products into single-body leaf products
//
// Plasticity bundles multiple solids into one PRODUCT (one ABSR with N MSBs).
// CAD tools like KeyShot name each body after its parent PRODUCT, so all bodies
// in a folder show the same name. The fix creates a separate leaf PRODUCT for
// every MSB, links them into the assembly via NEXT_ASSEMBLY_USAGE_OCCURRENCE,
// and empties / removes the original multi-body ABSR so nothing renders twice.
// ---------------------------------------------------------------------------

export function buildDecomposePatches(entities: StepEntity[], content: string): Patch[] {
  const byId = new Map<number, StepEntity>()
  for (const e of entities) byId.set(e.id, e)

  let maxId = 0
  for (const e of entities) if (e.id > maxId) maxId = e.id
  let nextId = maxId + 1
  const alloc = () => nextId++

  // ── product_id → pd_id ────────────────────────────────────────────────────
  const pdFormByProd = new Map<number, number>()
  const pdByForm = new Map<number, number>()
  for (const e of entities) {
    if (
      e.type === 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE' ||
      e.type === 'PRODUCT_DEFINITION_FORMATION'
    ) {
      const prodId = extractRef(getNthParam(e.params, 2))
      if (prodId >= 0) pdFormByProd.set(prodId, e.id)
    } else if (e.type === 'PRODUCT_DEFINITION') {
      const formId = extractRef(getNthParam(e.params, 2))
      if (formId >= 0) pdByForm.set(formId, e.id)
    }
  }
  const prodToPd = new Map<number, number>()
  for (const [pId, fId] of pdFormByProd) {
    const pd = pdByForm.get(fId)
    if (pd !== undefined) prodToPd.set(pId, pd)
  }

  // ── pd_id → pds_id (part-level PDS only) → sr_id ─────────────────────────
  const pdToPds = new Map<number, number>()
  const pdsToSr = new Map<number, number>()
  for (const e of entities) {
    if (e.type === 'PRODUCT_DEFINITION_SHAPE') {
      const linkedId = extractRef(getNthParam(e.params, 2))
      if (byId.get(linkedId)?.type === 'PRODUCT_DEFINITION') pdToPds.set(linkedId, e.id)
    } else if (e.type === 'SHAPE_DEFINITION_REPRESENTATION') {
      const pdsId = extractRef(getNthParam(e.params, 0))
      const srId = extractRef(getNthParam(e.params, 1))
      if (pdsId >= 0 && srId >= 0) pdsToSr.set(pdsId, srId)
    }
  }

  // ── sr_id → absr_id + the SRR entity id ──────────────────────────────────
  const srToAbsr = new Map<number, number>()
  const srToSrr = new Map<number, number>()
  for (const e of entities) {
    if (e.type !== 'SHAPE_REPRESENTATION_RELATIONSHIP') continue
    const id2 = extractRef(getNthParam(e.params, 2))
    const id3 = extractRef(getNthParam(e.params, 3))
    const e3 = byId.get(id3), e2 = byId.get(id2)
    if (e3?.type === 'ADVANCED_BREP_SHAPE_REPRESENTATION') {
      srToAbsr.set(id2, id3); srToSrr.set(id2, e.id)
    } else if (e2?.type === 'ADVANCED_BREP_SHAPE_REPRESENTATION') {
      srToAbsr.set(id3, id2); srToSrr.set(id3, e.id)
    }
  }

  // Solid body entity types that can appear as items in an
  // ADVANCED_BREP_SHAPE_REPRESENTATION.  All of these must be carried over to
  // new child leaf products during decomposition — leaving any of them behind
  // means that solid disappears from the output file.
  const SOLID_BODY_TYPES = new Set([
    'MANIFOLD_SOLID_BREP',
    'BREP_WITH_VOIDS',
    'FACETED_BREP',
    'FACETED_BREP_SHELL',
  ])

  // ── absr_id → [solid_body_ids], solid_body_id → name ────────────────────
  const absrToMsbs = new Map<number, number[]>()
  const msbToName = new Map<number, string>()
  for (const e of entities) {
    if (SOLID_BODY_TYPES.has(e.type)) {
      const n = extractString(getNthParam(e.params, 0))
      msbToName.set(e.id, n || `Solid_${e.id}`)
    } else if (e.type === 'ADVANCED_BREP_SHAPE_REPRESENTATION') {
      const msbs = parseRefList(getNthParam(e.params, 1)).filter(
        (r) => SOLID_BODY_TYPES.has(byId.get(r)?.type ?? ''),
      )
      if (msbs.length > 0) absrToMsbs.set(e.id, msbs)
    }
  }

  // ── shared context entity ids ─────────────────────────────────────────────
  let productCtxId = -1, pdCtxId = -1
  for (const e of entities) {
    if (e.type === 'PRODUCT_CONTEXT') productCtxId = e.id
    else if (e.type === 'PRODUCT_DEFINITION_CONTEXT') pdCtxId = e.id
  }
  if (productCtxId < 0 || pdCtxId < 0) return []

  const endsecIdx = content.lastIndexOf('ENDSEC;')
  if (endsecIdx < 0) return []

  const patches: Patch[] = []
  const newLines: string[] = []

  // ── Walk every PRODUCT, decompose those with 2+ direct MSBs ───────────────
  for (const prod of entities) {
    if (prod.type !== 'PRODUCT') continue
    const pdId = prodToPd.get(prod.id)
    if (pdId === undefined) continue
    const pdsId = pdToPds.get(pdId)
    if (pdsId === undefined) continue
    const srId = pdsToSr.get(pdsId)
    if (srId === undefined) continue
    const absrId = srToAbsr.get(srId)
    if (absrId === undefined) continue
    const msbs = absrToMsbs.get(absrId)
    // Only decompose genuine multi-body products (2+ MSBs).
    // Single-body products must never be touched — decomposing them moves
    // geometry out of the original ABSR chain and importers that don't fully
    // resolve NAUO/CDSR will silently lose the solid.
    if (!msbs || msbs.length < 2) continue

    const srE = byId.get(srId)!
    const absrE = byId.get(absrId)!
    const ctxId = extractRef(getNthParam(srE.params, 2))
    if (ctxId < 0) continue

    // Clear MSBs from the parent ABSR so geometry is not rendered twice.
    // The parent ABSR is left as an empty-items node so importers that walk
    // the SR → SRR → ABSR chain still find a structurally valid (but empty)
    // representation — they simply won't draw anything from it.
    const absrNameP = getNthParam(absrE.params, 0)
    const absrCtxP = getNthParam(absrE.params, 2)
    patches.push({
      start: absrE.byteStart, end: absrE.byteEnd,
      text: `#${absrId}=ADVANCED_BREP_SHAPE_REPRESENTATION(${absrNameP},(),${absrCtxP});\n`,
    })

    // Create one leaf PRODUCT per MSB and wire it into this assembly via NAUO
    for (const msbId of msbs) {
      const solidName = msbToName.get(msbId)!
      const esc = escapeStepString(solidName)

      // Leaf part: local coordinate frame (identity — body coords are already
      // in the assembly's frame, so no transform is needed)
      const cpId = alloc(), d1Id = alloc(), d2Id = alloc(), axId = alloc()
      const nSrId = alloc(), nAbsrId = alloc(), nSrrId = alloc()
      const nProdId = alloc(), nPcatId = alloc(), nPdfId = alloc()
      const nPdId = alloc(), nPdsId = alloc(), nSdrId = alloc(), nDmId = alloc()
      // NAUO + identity transform
      const tCpId = alloc(), tD1Id = alloc(), tD2Id = alloc(), tAxId = alloc()
      const idtId = alloc(), rrId = alloc()
      const nauoId = alloc(), nauoPdsId = alloc(), cdsrId = alloc()

      // Part local frame
      newLines.push(`#${cpId}=CARTESIAN_POINT('',(0.,0.,0.));`)
      newLines.push(`#${d1Id}=DIRECTION('',(0.,0.,1.));`)
      newLines.push(`#${d2Id}=DIRECTION('',(1.,0.,0.));`)
      newLines.push(`#${axId}=AXIS2_PLACEMENT_3D('',#${cpId},#${d1Id},#${d2Id});`)
      // Part representations
      newLines.push(`#${nSrId}=SHAPE_REPRESENTATION('${esc}',(#${axId}),#${ctxId});`)
      newLines.push(`#${nAbsrId}=ADVANCED_BREP_SHAPE_REPRESENTATION('${esc}',(#${msbId}),#${ctxId});`)
      newLines.push(`#${nSrrId}=SHAPE_REPRESENTATION_RELATIONSHIP('','',#${nSrId},#${nAbsrId});`)
      // Part product hierarchy
      newLines.push(`#${nProdId}=PRODUCT('${esc}','${esc}','',(#${productCtxId}));`)
      newLines.push(`#${nPcatId}=PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${nProdId}));`)
      newLines.push(`#${nPdfId}=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',#${nProdId},.NOT_KNOWN.);`)
      newLines.push(`#${nPdId}=PRODUCT_DEFINITION('design','',#${nPdfId},#${pdCtxId});`)
      newLines.push(`#${nPdsId}=PRODUCT_DEFINITION_SHAPE('','',#${nPdId});`)
      newLines.push(`#${nSdrId}=SHAPE_DEFINITION_REPRESENTATION(#${nPdsId},#${nSrId});`)
      newLines.push(`#${nDmId}=DRAUGHTING_MODEL('',(),#${ctxId});`)
      // Identity transform: child frame → parent (assembly) frame
      newLines.push(`#${tCpId}=CARTESIAN_POINT('',(0.,0.,0.));`)
      newLines.push(`#${tD1Id}=DIRECTION('',(0.,0.,1.));`)
      newLines.push(`#${tD2Id}=DIRECTION('',(1.,0.,-0.));`)
      newLines.push(`#${tAxId}=AXIS2_PLACEMENT_3D('',#${tCpId},#${tD1Id},#${tD2Id});`)
      newLines.push(`#${idtId}=ITEM_DEFINED_TRANSFORMATION('','',#${tAxId},#${axId});`)
      newLines.push(
        `#${rrId}=(REPRESENTATION_RELATIONSHIP('','',#${nSrId},#${srId})` +
        `REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${idtId})` +
        `SHAPE_REPRESENTATION_RELATIONSHIP());`,
      )
      // NAUO wiring leaf part into its parent assembly
      newLines.push(`#${nauoId}=NEXT_ASSEMBLY_USAGE_OCCURRENCE('${esc}_inst','${esc}','${esc}',#${pdId},#${nPdId},$);`)
      newLines.push(`#${nauoPdsId}=PRODUCT_DEFINITION_SHAPE('','',#${nauoId});`)
      newLines.push(`#${cdsrId}=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#${rrId},#${nauoPdsId});`)
    }
  }

  // Insert all new entities just before ENDSEC
  if (newLines.length > 0) {
    patches.push({ start: endsecIdx, end: endsecIdx, text: newLines.join('\n') + '\n' })
  }

  return patches
}

// ---------------------------------------------------------------------------
// Fix 3: HOOPS Exchange compatibility
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
  decomposedProducts: number
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
  let decomposePatches: Patch[] = []
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

    decomposePatches = buildDecomposePatches(entities, content)
    // Count how many multi-body products were decomposed (each ABSR patch = 1 product)
    const decomposedCount = decomposePatches.filter(
      (p) => p.text.includes('ADVANCED_BREP_SHAPE_REPRESENTATION') && p.text.includes('()'),
    ).length
    if (decomposedCount > 0) {
      log.push(`Decomposed ${decomposedCount} multi-body product(s) into named leaf parts`)
    }
    patches.push(...decomposePatches)
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

  const decomposedCount = decomposePatches.filter(
    (p) => p.text.includes('ADVANCED_BREP_SHAPE_REPRESENTATION') && p.text.includes('()'),
  ).length

  const hadFixes =
    namePatches.length > 0 ||
    decomposePatches.length > 0 ||
    hoopsPatches.length > 0 ||
    axisPatches.length > 0
  const patched = hadFixes
    ? addRepairStamp(applyPatches(content, patches))
    : applyPatches(content, patches)

  return {
    content: patched,
    log,
    namesFlagged: namePatches.length,
    hoopsFixesApplied: hoopsPatches.filter((p) => p.text === '').length,
    axisSwapApplied: axisPatches.length > 0,
    decomposedProducts: decomposedCount,
  }
}
