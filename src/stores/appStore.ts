import { create } from 'zustand'
import type { FixResult, ManualAnalysis, RepairOptions } from '../types'

interface AppState {
  // Settings / watcher state (loaded from main process)
  watchFolders: string[]
  watching: boolean
  options: RepairOptions
  launchAtLogin: boolean

  // Recent auto-fixes from watcher
  recentFixes: FixResult[]

  // Manual one-off fix state
  manualAnalysis: ManualAnalysis | null

  // Actions
  setWatchFolders: (folders: string[]) => void
  addWatchFolder: (folder: string) => void
  removeWatchFolder: (folder: string) => void
  setWatching: (v: boolean) => void
  setOptions: (opts: Partial<RepairOptions>) => void
  setLaunchAtLogin: (v: boolean) => void
  addRecentFix: (fix: FixResult) => void
  setRecentFixes: (fixes: FixResult[]) => void
  setManualAnalysis: (a: ManualAnalysis | null) => void
  updateManualAnalysis: (updates: Partial<ManualAnalysis>) => void
}

export const useAppStore = create<AppState>((set) => ({
  watchFolders: [],
  watching: false,
  options: { fixNames: true, fixHoopsCompat: true, deleteOriginal: false, axisSwap: 'none' as const },
  launchAtLogin: false,
  recentFixes: [],
  manualAnalysis: null,

  setWatchFolders: (folders) => set({ watchFolders: folders }),
  addWatchFolder: (folder) =>
    set((state) => ({
      watchFolders: state.watchFolders.includes(folder)
        ? state.watchFolders
        : [...state.watchFolders, folder],
    })),
  removeWatchFolder: (folder) =>
    set((state) => ({ watchFolders: state.watchFolders.filter((f) => f !== folder) })),
  setWatching: (v) => set({ watching: v }),
  setOptions: (opts) => set((state) => ({ options: { ...state.options, ...opts } })),
  setLaunchAtLogin: (v) => set({ launchAtLogin: v }),
  addRecentFix: (fix) =>
    set((state) => ({ recentFixes: [fix, ...state.recentFixes].slice(0, 50) })),
  setRecentFixes: (fixes) => set({ recentFixes: fixes }),
  setManualAnalysis: (a) => set({ manualAnalysis: a }),
  updateManualAnalysis: (updates) =>
    set((state) =>
      state.manualAnalysis ? { manualAnalysis: { ...state.manualAnalysis, ...updates } } : state,
    ),
}))
