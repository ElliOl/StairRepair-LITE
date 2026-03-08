export interface FileEntry {
  filepath: string
  name: string
  status: 'idle' | 'analysing' | 'ready' | 'repairing' | 'done' | 'error'
  namesFlagged?: number
  shellsSplit?: number
  /** Faces not covered by HOOPS Exchange MDGPR — rewrite fixes Creo/Keyshot import */
  hoopsCompatFixes?: number
  error?: string
}

export interface RepairOptions {
  fixNames: boolean
  fixShells: boolean
  /** Rewrite STEP to strip HOOPS Exchange presentation layer (fixes Creo/Keyshot "2 sheets" issue) */
  fixHoopsCompat: boolean
}

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  bboxMin: [number, number, number]
  bboxMax: [number, number, number]
  faceCount: number
  triangleCount: number
}

export interface EdgeData {
  positions: Float32Array
  indices: Uint32Array
  edgeCount: number
}

export interface PartNode {
  id: string
  /** PRODUCT entity name as read from the STEP file — may be '0' for unrepaired
   *  Plasticity exports, mirroring exactly what Creo / KeyShot would display. */
  name: string
  /** NAUO instance-label name for this part — the "real" name hidden in the
   *  NEXT_ASSEMBLY_USAGE_OCCURRENCE lines of the broken file.  Non-empty only
   *  when the PRODUCT name is '0' and the NAUO label carries a different value.
   *  After repair the PRODUCT name is updated from this, so name === instanceName. */
  instanceName: string
  parentId: string | null
  children: string[]
  hasColor?: boolean
  color: [number, number, number] | null
  shapeType: string
  isAssembly: boolean
  startVertex: number
  vertexCount: number
  startIndex: number
  indexCount: number
  startEdgePoint: number
  edgePointCount: number
  startEdgeIndex: number
  edgeIndexCount: number
}

export interface ViewerModel {
  shapeId: string
  mesh: MeshData
  edges: EdgeData
  parts: PartNode[]
}

declare global {
  interface Window {
    electronAPI: {
      platform: string
      openFileDialog: () => Promise<string[]>
      showSaveDialog: (options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>
      writeFile: (filepath: string, content: Buffer) => Promise<boolean>
      analyseStep: (filepath: string, quality?: string) => Promise<{
        namesFlagged: number
        shellsSplit: number
        hoopsCompatFixes: number
        shapeId: string
        mesh: MeshData
        edges: EdgeData
        parts: PartNode[]
      }>
      repairStep: (filepath: string, outputPath: string, options: RepairOptions) => Promise<{
        success: boolean
        log: string[]
        shapeId: string
        mesh: MeshData
        edges: EdgeData
        parts: PartNode[]
      }>
      loadStepMesh: (filepath: string, quality?: string) => Promise<{ shapeId: string; mesh: MeshData; edges: EdgeData; parts: PartNode[] }>
      onBackendLog: (callback: (msg: string) => void) => () => void
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void
      windowIsMaximized: () => Promise<boolean>
    }
  }
}
