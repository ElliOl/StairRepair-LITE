/**
 * Pure-TypeScript STEP file entity parser.
 * Port of the C++ CollectEntities and parameter helpers in native/src/step_text_patch.cpp.
 * No OCCT, no native addon — operates directly on the raw file text.
 */

export interface StepEntity {
  id: number
  type: string       // e.g. "PRODUCT", "ADVANCED_FACE"
  params: string     // raw text inside the outermost () of the entity
  byteStart: number  // offset of '#' in the file content
  byteEnd: number    // offset after the trailing newline
}

// ---------------------------------------------------------------------------
// Entity collector
// ---------------------------------------------------------------------------

export function collectEntities(content: string): StepEntity[] {
  const entities: StepEntity[] = []

  // Locate DATA section
  let pos = content.indexOf('\nDATA;')
  if (pos === -1) pos = content.indexOf('DATA;')
  if (pos === -1) return entities
  pos = content.indexOf(';', pos) + 1

  const dataEnd = content.indexOf('\nENDSEC;', pos)
  const end = dataEnd === -1 ? content.length : dataEnd

  while (pos < end) {
    if (content[pos] !== '#') { pos++; continue }

    const numStart = pos + 1
    let numEnd = numStart
    while (numEnd < end && content[numEnd] >= '0' && content[numEnd] <= '9') numEnd++
    if (numEnd === numStart || numEnd >= end || content[numEnd] !== '=') { pos++; continue }

    const id = parseInt(content.slice(numStart, numEnd), 10)
    const byteStart = pos
    let cur = numEnd + 1 // after '='

    // Parse type name up to '('
    let type = ''
    if (cur < end && content[cur] !== '(') {
      const typeStart = cur
      while (cur < end && content[cur] !== '(' && content[cur] !== ';' && content[cur] !== '\n') cur++
      type = content.slice(typeStart, cur)
    }

    // Advance to opening '('
    while (cur < end && content[cur] !== '(') cur++
    if (cur >= end) { pos = cur; continue }
    cur++ // consume '('

    // Collect params up to the matching ')'
    const paramsStart = cur
    let depth = 1
    let inStr = false
    while (cur < end && depth > 0) {
      const c = content[cur]
      if (inStr) {
        if (c === "'") {
          if (cur + 1 < end && content[cur + 1] === "'") cur++ // '' escape
          else inStr = false
        }
      } else {
        if (c === "'") inStr = true
        else if (c === '(') depth++
        else if (c === ')') { depth--; if (depth === 0) break }
      }
      cur++
    }
    const params = content.slice(paramsStart, cur)
    cur++ // consume closing ')'

    // Skip to ';'
    while (cur < end && content[cur] !== ';') cur++
    if (cur < end) cur++ // consume ';'
    // Include trailing newline so the patch range covers the full line
    if (cur < content.length && content[cur] === '\r') cur++
    if (cur < content.length && content[cur] === '\n') cur++

    entities.push({ id, type, params, byteStart, byteEnd: cur })
    pos = cur
  }

  return entities
}

// ---------------------------------------------------------------------------
// Parameter helpers
// ---------------------------------------------------------------------------

/** Return the Nth top-level parameter (0-indexed) from a STEP params string. */
export function getNthParam(params: string, n: number): string {
  let depth = 0
  let count = 0
  let inStr = false
  let start = 0

  // Skip leading whitespace
  while (start < params.length && ' \t\r\n'.includes(params[start])) start++

  for (let i = start; i < params.length; i++) {
    const c = params[i]
    if (inStr) {
      if (c === "'") {
        if (i + 1 < params.length && params[i + 1] === "'") i++
        else inStr = false
      }
      continue
    }
    if (c === "'") inStr = true
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0 && c === ',') {
      if (count === n) return params.slice(start, i).trim()
      count++
      start = i + 1
      while (start < params.length && ' \t\r\n'.includes(params[start])) start++
      i = start - 1
    }
  }
  if (count === n) return params.slice(start).trim()
  return ''
}

/** Return raw params text from after the Nth comma to the end. */
export function getParamsFrom(params: string, startN: number): string {
  let depth = 0
  let count = 0
  let inStr = false
  for (let i = 0; i < params.length; i++) {
    const c = params[i]
    if (inStr) {
      if (c === "'") { if (i + 1 < params.length && params[i + 1] === "'") i++; else inStr = false }
      continue
    }
    if (c === "'") inStr = true
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0 && c === ',') {
      count++
      if (count === startN) return params.slice(i + 1)
    }
  }
  return ''
}

/** Extract the string value from a STEP single-quoted param (handles '' escaping). */
export function extractString(param: string): string {
  const s = param.indexOf("'")
  if (s === -1) return ''
  let result = ''
  for (let i = s + 1; i < param.length; i++) {
    if (param[i] === "'") {
      if (i + 1 < param.length && param[i + 1] === "'") { result += "'"; i++ }
      else break
    } else {
      result += param[i]
    }
  }
  return result
}

/** Extract the entity reference number from a "#NNN" token. */
export function extractRef(param: string): number {
  const pos = param.indexOf('#')
  if (pos === -1) return -1
  let id = 0
  for (let i = pos + 1; i < param.length; i++) {
    const c = param.charCodeAt(i)
    if (c >= 48 && c <= 57) id = id * 10 + (c - 48)
    else break
  }
  return id
}

/** Collect all #NNN reference integers from a string. */
export function parseRefList(s: string): number[] {
  const refs: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '#') continue
    let id = 0
    let j = i + 1
    while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) {
      id = id * 10 + (s.charCodeAt(j) - 48)
      j++
    }
    if (j > i + 1) { refs.push(id); i = j - 1 }
  }
  return refs
}

/** Escape a name for use as a STEP string literal (' → ''). */
export function escapeStepString(s: string): string {
  return s.replace(/'/g, "''")
}

/** True if name looks like a file path (NAUO sometimes carries the embedding file's name). */
export function looksLikeFilePath(name: string): boolean {
  if (name.length < 5) return false
  const lo = name.toLowerCase()
  return lo.endsWith('.stp') || lo.endsWith('.step') || lo.endsWith('.p21') || lo.endsWith('.p21e')
}
