import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  Notification,
  nativeImage,
  screen,
} from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import chokidar from 'chokidar'

// ---- Repair engine (pure TS, no native addon) ----------------------------
// Import via absolute path so electron-vite bundles them into main
import { analyseStepContent } from '../src/lib/stepAnalyse'
import { repairStepContent } from '../src/lib/stepRepair'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let tray: Tray | null = null
let popupWin: BrowserWindow | null = null
let watcher: ReturnType<typeof chokidar.watch> | null = null
let isWatching = false
let positionSaveTimer: ReturnType<typeof setTimeout> | null = null

const isMac = process.platform === 'darwin'

interface AppSettings {
  watchFolders: string[]
  fixNames: boolean
  fixHoopsCompat: boolean
  deleteOriginal: boolean
  launchAtLogin: boolean
  windowPosition?: { x: number; y: number }
}

interface FixResult {
  filepath: string
  name: string
  timestamp: number
  namesFlagged: number
  hoopsCompatFixes: number
  namesFFixed: number
  hoopsFixed: number
  hadIssues: boolean
}

const recentFixes: FixResult[] = []
const MAX_RECENT = 50

// Settings persisted to disk — path resolved lazily after app is ready
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings(): AppSettings {
  try {
    const raw = fsSync.readFileSync(getSettingsPath(), 'utf-8')
    return { fixNames: true, fixHoopsCompat: true, deleteOriginal: false, launchAtLogin: false, watchFolders: [], ...JSON.parse(raw) }
  } catch {
    return { watchFolders: [], fixNames: true, fixHoopsCompat: true, deleteOriginal: false, launchAtLogin: false }
  }
}

function saveSettings(s: AppSettings) {
  const sp = getSettingsPath()
  fsSync.mkdirSync(path.dirname(sp), { recursive: true })
  fsSync.writeFileSync(sp, JSON.stringify(s, null, 2))
}

let settings: AppSettings = { watchFolders: [], fixNames: true, fixHoopsCompat: true, deleteOriginal: false, launchAtLogin: false }

// Tracks files we just wrote so the watcher doesn't re-process them
const recentlyWritten = new Set<string>()

// ---------------------------------------------------------------------------
// File watcher
// ---------------------------------------------------------------------------

// Debounce map: filepath → timer
const debounceMap = new Map<string, ReturnType<typeof setTimeout>>()

async function processFile(filepath: string) {
  const name = path.basename(filepath)
  let content: string
  try {
    content = await fs.readFile(filepath, 'utf-8')
  } catch {
    return // file may have been moved/deleted; skip
  }

  const analysis = analyseStepContent(content)
  const { namesFlagged, hoopsCompatFixes } = analysis

  const result = repairStepContent(content, settings.fixNames, settings.fixHoopsCompat)
  const hadIssues = result.namesFlagged > 0 || result.hoopsFixesApplied > 0

  let outputPath = filepath
  if (hadIssues) {
    if (settings.deleteOriginal) {
      // Overwrite original in place — guard against watcher re-trigger
      recentlyWritten.add(filepath)
      await fs.writeFile(filepath, result.content, 'utf-8')
      setTimeout(() => recentlyWritten.delete(filepath), 3000)
    } else {
      const ext = path.extname(filepath)
      const base = filepath.slice(0, filepath.length - ext.length)
      outputPath = `${base}_fixed${ext}`
      await fs.writeFile(outputPath, result.content, 'utf-8')
    }
  }

  const fixResult: FixResult = {
    filepath: outputPath,
    name,
    timestamp: Date.now(),
    namesFlagged,
    hoopsCompatFixes,
    namesFFixed: result.namesFlagged,
    hoopsFixed: result.hoopsFixesApplied,
    hadIssues,
  }

  recentFixes.unshift(fixResult)
  if (recentFixes.length > MAX_RECENT) recentFixes.length = MAX_RECENT

  // Push update to renderer if open
  popupWin?.webContents.send('fix-applied', fixResult)

  // Native notification
  if (Notification.isSupported()) {
    const parts: string[] = []
    if (result.namesFlagged > 0) parts.push(`${result.namesFlagged} name(s) fixed`)
    if (result.hoopsFixesApplied > 0) parts.push('HOOPS compat applied')
    const body = hadIssues ? parts.join(', ') : 'No issues found'
    new Notification({ title: `StairRepair — ${name}`, body }).show()
  }
}

function onFileEvent(filepath: string) {
  // Ignore already-fixed output files to avoid infinite loops
  if (/_fixed\.(stp|step)$/i.test(filepath)) return
  // Ignore files we just wrote ourselves (prevents re-trigger when overwriting originals)
  if (recentlyWritten.has(filepath)) return

  // Debounce: wait 800ms after last event for the same file
  const existing = debounceMap.get(filepath)
  if (existing) clearTimeout(existing)
  debounceMap.set(
    filepath,
    setTimeout(() => {
      debounceMap.delete(filepath)
      processFile(filepath).catch(console.error)
    }, 800),
  )
}

function startWatcher() {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (settings.watchFolders.length === 0) return

  watcher = chokidar.watch(settings.watchFolders, {
    ignored: [
      /(^|[/\\])\./,          // dotfiles
      /_fixed\.(stp|step)$/i, // already-fixed output
    ],
    persistent: true,
    ignoreInitial: true,
    depth: 99,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })

  watcher.on('add', (fp) => { if (/\.(stp|step)$/i.test(fp)) onFileEvent(fp) })
  watcher.on('change', (fp) => { if (/\.(stp|step)$/i.test(fp)) onFileEvent(fp) })

  isWatching = true
  popupWin?.webContents.send('watch-status', { watching: true, folders: settings.watchFolders })
}

function stopWatcher() {
  if (watcher) { watcher.close(); watcher = null }
  isWatching = false
  popupWin?.webContents.send('watch-status', { watching: false, folders: settings.watchFolders })
}

// ---------------------------------------------------------------------------
// Tray popup window
// ---------------------------------------------------------------------------

function getIconPath() {
  // macOS: resources/tray-iconTemplate.png — 16x16 black strokes on transparent bg
  //        macOS auto-inverts to white on dark menu bars
  // Windows: resources/tray-icon.png — any colour, any reasonable size
  const name = isMac ? 'tray-iconTemplate.png' : 'tray-icon.png'
  return path.join(__dirname, '../../resources', name)
}

function createPopup() {
  popupWin = new BrowserWindow({
    width: 380,
    height: 640,
    minHeight: 400,
    minWidth: 320,
    show: false,
    frame: false,
    resizable: true,
    movable: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    popupWin.loadURL(process.env.ELECTRON_RENDERER_URL)
    if (process.env.NODE_ENV === 'development') popupWin.webContents.openDevTools({ mode: 'detach' })
  } else {
    popupWin.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Save position when user drags the window (debounced)
  popupWin.on('move', () => {
    if (positionSaveTimer) clearTimeout(positionSaveTimer)
    positionSaveTimer = setTimeout(() => {
      positionSaveTimer = null
      saveWindowPosition()
    }, 300)
  })

  // Hide on blur (click outside)
  popupWin.on('blur', () => {
    if (process.env.NODE_ENV !== 'development') {
      if (positionSaveTimer) {
        clearTimeout(positionSaveTimer)
        positionSaveTimer = null
      }
      saveWindowPosition()
      popupWin?.hide()
    }
  })

  popupWin.on('closed', () => {
    if (positionSaveTimer) clearTimeout(positionSaveTimer)
    positionSaveTimer = null
    popupWin = null
  })
}

function saveWindowPosition() {
  if (!popupWin || !popupWin.isVisible()) return
  const [x, y] = popupWin.getPosition()
  settings.windowPosition = { x, y }
  saveSettings(settings)
}

function positionPopup() {
  if (!popupWin || !tray) return
  const trayBounds = tray.getBounds()
  const winBounds = popupWin.getBounds()
  const displays = screen.getAllDisplays()

  let x: number
  let y: number

  const saved = settings.windowPosition
  if (saved) {
    // Check if saved position is on or near a visible display (use bounds for lenient check)
    const onDisplay = displays.some((d) => {
      const b = d.bounds
      const padding = 50
      return saved.x >= b.x - padding && saved.x < b.x + b.width + padding &&
             saved.y >= b.y - padding && saved.y < b.y + b.height + padding
    })
    if (onDisplay) {
      const display = screen.getDisplayNearestPoint({ x: saved.x, y: saved.y })
      const wa = display.workArea
      x = Math.max(wa.x, Math.min(saved.x, wa.x + wa.width - winBounds.width))
      y = Math.max(wa.y, Math.min(saved.y, wa.y + wa.height - winBounds.height))
    } else {
      ;({ x, y } = getTrayPosition(trayBounds, winBounds))
    }
  } else {
    ;({ x, y } = getTrayPosition(trayBounds, winBounds))
  }

  popupWin.setPosition(x, y, false)
}

function getTrayPosition(
  trayBounds: Electron.Rectangle,
  winBounds: Electron.Rectangle,
) {
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const workArea = display.workArea

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2)
  let y: number

  if (isMac) {
    y = Math.round(trayBounds.y + trayBounds.height + 4)
  } else {
    y = Math.round(trayBounds.y - winBounds.height - 4)
  }

  x = Math.max(workArea.x + 4, Math.min(x, workArea.x + workArea.width - winBounds.width - 4))
  y = Math.max(workArea.y + 4, Math.min(y, workArea.y + workArea.height - winBounds.height - 4))
  return { x, y }
}

function togglePopup() {
  if (!popupWin) return
  if (popupWin.isVisible()) {
    if (popupWin.isFocused()) {
      popupWin.hide()
    } else {
      popupWin.focus()
    }
  } else {
    positionPopup()
    popupWin.show()
    popupWin.focus()
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // Load settings now that app.getPath() is available
  settings = loadSettings()

  // Hide from Dock on macOS — tray-only app
  if (isMac) app.dock.hide()

  // Create tray
  // 32x32 PNG is the @2x Retina version — register it at scaleFactor 2 so macOS
  // renders it at 16pt (correct menu bar size) on Retina displays
  const iconPath = getIconPath()
  const raw = nativeImage.createFromPath(iconPath)
  const icon = nativeImage.createEmpty()
  icon.addRepresentation({ scaleFactor: 2.0, buffer: raw.toPNG(), width: 32, height: 32 })
  if (isMac) icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('StairRepair')

  if (isMac) {
    tray.on('click', togglePopup)
    tray.on('right-click', () => {
      tray?.popUpContextMenu(
        Menu.buildFromTemplate([
          { label: 'Open', click: togglePopup },
          { type: 'separator' },
          { label: 'Quit', click: () => app.quit() },
        ]),
      )
    })
  } else {
    // Windows: left-click opens popup, right-click shows context menu
    tray.on('click', togglePopup)
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open', click: togglePopup },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]),
    )
  }

  createPopup()

  // Auto-start watcher if folders are configured
  if (settings.watchFolders.length > 0) startWatcher()
})

// Keep app running even if all windows are closed (tray-only)
app.on('window-all-closed', () => {
  // Do NOT quit — we live in the tray
})

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('get-settings', () => ({
  ...settings,
  watching: isWatching,
  recentFixes,
}))

ipcMain.handle('set-settings', (_event, updates: Partial<AppSettings>) => {
  const prevPosition = settings.windowPosition
  settings = { ...settings, ...updates }
  if (!('windowPosition' in updates) && prevPosition) settings.windowPosition = prevPosition
  saveSettings(settings)

  if ('launchAtLogin' in updates) {
    app.setLoginItemSettings({ openAtLogin: !!updates.launchAtLogin })
  }

  return settings
})

ipcMain.handle('add-watch-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    message: 'Choose a folder to watch for STEP files',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const folder = result.filePaths[0]
  if (!settings.watchFolders.includes(folder)) {
    settings.watchFolders = [...settings.watchFolders, folder]
    saveSettings(settings)
    if (isWatching) startWatcher() // restart with updated list
  }
  return folder
})

ipcMain.handle('remove-watch-folder', (_event, folder: string) => {
  settings.watchFolders = settings.watchFolders.filter((f) => f !== folder)
  saveSettings(settings)
  if (isWatching) {
    if (settings.watchFolders.length === 0) stopWatcher()
    else startWatcher()
  }
  return settings.watchFolders
})

ipcMain.handle('toggle-watching', (_event, on: boolean) => {
  if (on) startWatcher()
  else stopWatcher()
  return isWatching
})

ipcMain.handle('get-recent-fixes', () => recentFixes)

ipcMain.handle('pick-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'STEP Files', extensions: ['stp', 'step'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('analyse-file', async (_event, filepath: string) => {
  const content = await fs.readFile(filepath, 'utf-8')
  return analyseStepContent(content)
})

ipcMain.handle('repair-file', async (
  _event,
  filepath: string,
  fixNames: boolean,
  fixHoopsCompat: boolean,
) => {
  const content = await fs.readFile(filepath, 'utf-8')
  const result = repairStepContent(content, fixNames, fixHoopsCompat)

  let outputPath: string
  if (settings.deleteOriginal) {
    outputPath = filepath
    recentlyWritten.add(filepath)
    await fs.writeFile(filepath, result.content, 'utf-8')
    setTimeout(() => recentlyWritten.delete(filepath), 3000)
  } else {
    const ext = path.extname(filepath)
    const base = filepath.slice(0, filepath.length - ext.length)
    outputPath = `${base}_fixed${ext}`
    await fs.writeFile(outputPath, result.content, 'utf-8')
  }

  return {
    success: true,
    outputPath,
    log: result.log,
    namesFFixed: result.namesFlagged,
    hoopsFixed: result.hoopsFixesApplied,
  }
})

ipcMain.handle('window-close', () => {
  saveWindowPosition()
  popupWin?.hide()
})
ipcMain.handle('quit-app', () => app.quit())
