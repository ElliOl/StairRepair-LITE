import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  showSaveDialog: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('show-save-dialog', options),
  writeFile: (filepath: string, content: Buffer) => ipcRenderer.invoke('write-file', filepath, content),

  analyseStep: (filepath: string, quality?: string) => ipcRenderer.invoke('analyse-step', filepath, quality),
  repairStep: (filepath: string, outputPath: string, options: { fixNames: boolean; fixShells: boolean; fixHoopsCompat: boolean }) =>
    ipcRenderer.invoke('repair-step', filepath, outputPath, options),
  loadStepMesh: (filepath: string, quality?: string) => ipcRenderer.invoke('load-step-mesh', filepath, quality),

  onBackendLog: (callback: (msg: string) => void) => {
    const listener = (_: unknown, msg: string) => callback(msg)
    ipcRenderer.on('backend-log', listener)
    return () => ipcRenderer.removeListener('backend-log', listener)
  },

  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
})
