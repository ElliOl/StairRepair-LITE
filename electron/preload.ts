import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (updates: Record<string, unknown>) => ipcRenderer.invoke('set-settings', updates),

  // Folder management
  addWatchFolder: () => ipcRenderer.invoke('add-watch-folder'),
  removeWatchFolder: (folder: string) => ipcRenderer.invoke('remove-watch-folder', folder),

  // Watcher control
  toggleWatching: (on: boolean) => ipcRenderer.invoke('toggle-watching', on),

  // Recent fixes
  getRecentFixes: () => ipcRenderer.invoke('get-recent-fixes'),

  // Manual fix
  pickFile: () => ipcRenderer.invoke('pick-file'),
  analyseFile: (filepath: string) => ipcRenderer.invoke('analyse-file', filepath),
  repairFile: (filepath: string, fixNames: boolean, fixHoopsCompat: boolean) =>
    ipcRenderer.invoke('repair-file', filepath, fixNames, fixHoopsCompat),

  // Events from main → renderer
  onFixApplied: (callback: (result: unknown) => void) => {
    const listener = (_: unknown, result: unknown) => callback(result)
    ipcRenderer.on('fix-applied', listener)
    return () => ipcRenderer.removeListener('fix-applied', listener)
  },
  onWatchStatus: (callback: (status: { watching: boolean; folders: string[] }) => void) => {
    const listener = (_: unknown, status: { watching: boolean; folders: string[] }) => callback(status)
    ipcRenderer.on('watch-status', listener)
    return () => ipcRenderer.removeListener('watch-status', listener)
  },

  // Window controls
  windowClose: () => ipcRenderer.invoke('window-close'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
})
