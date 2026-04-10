import * as React from 'react'
import { Separator } from '@radix-ui/react-separator'
import { TrayHeader } from './components/TrayHeader'
import { WatchFolders } from './components/WatchFolders'
import { OptionsPanel } from './components/OptionsPanel'
import { RecentFixes } from './components/RecentFixes'
import { ManualFix } from './components/ManualFix'
import { useAppStore } from './stores/appStore'
import type { FixResult } from './types'

export default function App() {
  const setWatchFolders = useAppStore((s) => s.setWatchFolders)
  const setWatching = useAppStore((s) => s.setWatching)
  const setOptions = useAppStore((s) => s.setOptions)
  const setLaunchAtLogin = useAppStore((s) => s.setLaunchAtLogin)
  const setRecentFixes = useAppStore((s) => s.setRecentFixes)
  const addRecentFix = useAppStore((s) => s.addRecentFix)

  // Load initial settings from main process
  React.useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      setWatchFolders(s.watchFolders)
      setWatching(s.watching)
      setOptions({ fixNames: s.fixNames, fixHoopsCompat: s.fixHoopsCompat, deleteOriginal: s.deleteOriginal ?? false })
      setLaunchAtLogin(s.launchAtLogin)
      setRecentFixes(s.recentFixes ?? [])
    })
  }, [setWatchFolders, setWatching, setOptions, setLaunchAtLogin, setRecentFixes])

  // Listen for live updates from the file watcher
  React.useEffect(() => {
    const cleanFix = window.electronAPI.onFixApplied((result: FixResult) => {
      addRecentFix(result)
    })
    const cleanStatus = window.electronAPI.onWatchStatus(({ watching, folders }) => {
      setWatching(watching)
      setWatchFolders(folders)
    })
    return () => { cleanFix(); cleanStatus() }
  }, [addRecentFix, setWatching, setWatchFolders])

  const handleQuit = () => window.electronAPI.quitApp()

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden text-text">
      <TrayHeader />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">

          <ManualFix />

          <Separator className="bg-border h-px" />

          <WatchFolders />

          <Separator className="bg-border h-px" />

          <OptionsPanel />

          <Separator className="bg-border h-px" />

          <RecentFixes />

        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between">
        <span className="text-xs text-text-muted select-none">v{__APP_VERSION__}</span>
        <button
          type="button"
          className="text-xs text-text-muted hover:text-text transition-colors"
          onClick={handleQuit}
        >
          Quit
        </button>
      </div>
    </div>
  )
}
