import type { TreeNode } from '../lib/stepTree'

export type { TreeNode }

export type AxisSwap = 'none' | 'zUpToYUp' | 'yUpToZUp'

export interface RepairOptions {
  fixNames: boolean
  fixHoopsCompat: boolean
  deleteOriginal: boolean
  axisSwap: AxisSwap
}

export interface AppSettings {
  watchFolders: string[]
  fixNames: boolean
  fixHoopsCompat: boolean
  deleteOriginal: boolean
  axisSwap: AxisSwap
  launchAtLogin: boolean
}

export interface FixResult {
  filepath: string
  name: string
  timestamp: number
  namesFlagged: number
  hoopsCompatFixes: number
  namesFFixed: number
  hoopsFixed: number
  hadIssues: boolean
}

export interface ManualAnalysis {
  filepath: string
  namesFlagged: number
  hoopsCompatFixes: number
  tree: TreeNode[]
  status: 'idle' | 'analysing' | 'ready' | 'repairing' | 'done' | 'error'
  error?: string
  outputPath?: string
  log?: string[]
}

declare global {
  interface Window {
    electronAPI: {
      platform: string
      getSettings: () => Promise<AppSettings & { watching: boolean; recentFixes: FixResult[] }>
      setSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>
      addWatchFolder: () => Promise<string | null>
      removeWatchFolder: (folder: string) => Promise<string[]>
      toggleWatching: (on: boolean) => Promise<boolean>
      getRecentFixes: () => Promise<FixResult[]>
      pickFile: () => Promise<string | null>
      analyseFile: (filepath: string) => Promise<{ namesFlagged: number; hoopsCompatFixes: number; tree: TreeNode[] }>
      repairFile: (filepath: string, fixNames: boolean, fixHoopsCompat: boolean, axisSwap: AxisSwap) => Promise<{
        success: boolean
        outputPath: string
        log: string[]
        namesFFixed: number
        hoopsFixed: number
      }>
      onFixApplied: (callback: (result: FixResult) => void) => () => void
      onWatchStatus: (callback: (status: { watching: boolean; folders: string[] }) => void) => () => void
      windowClose: () => void
      quitApp: () => void
    }
  }
}
