import * as React from 'react'
import { FolderOpen, Plus, X, Play, Pause } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import * as Tooltip from '@radix-ui/react-tooltip'

export function WatchFolders() {
  const watchFolders = useAppStore((s) => s.watchFolders)
  const watching = useAppStore((s) => s.watching)
  const setWatching = useAppStore((s) => s.setWatching)
  const removeWatchFolder = useAppStore((s) => s.removeWatchFolder)
  const setWatchFolders = useAppStore((s) => s.setWatchFolders)

  const handleAddFolder = async () => {
    const folder = await window.electronAPI.addWatchFolder()
    if (folder) {
      setWatchFolders([...watchFolders, folder].filter((f, i, a) => a.indexOf(f) === i))
    }
  }

  const handleRemoveFolder = async (folder: string) => {
    const updated = await window.electronAPI.removeWatchFolder(folder)
    setWatchFolders(updated)
  }

  const handleToggleWatching = async () => {
    const next = !watching
    await window.electronAPI.toggleWatching(next)
    setWatching(next)
  }

  const displayPath = (p: string) => {
    const home = window.electronAPI.platform === 'win32'
      ? process.env.USERPROFILE ?? ''
      : (p.startsWith('/Users/') ? p.replace(/^\/Users\/[^/]+/, '~') : p)
    return home || p
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Watched Folders
        </p>
        <div className="flex items-center gap-1.5">
          {watchFolders.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-muted hover:text-text"
              onClick={handleToggleWatching}
              title={watching ? 'Pause watching' : 'Start watching'}
            >
              {watching ? (
                <><Pause className="w-3 h-3" /> Pause</>
              ) : (
                <><Play className="w-3 h-3" /> Watch</>
              )}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-muted hover:text-text"
            onClick={handleAddFolder}
            title="Add folder"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </div>

      {watchFolders.length === 0 ? (
        <button
          type="button"
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md border border-dashed border-border hover:border-accent text-text-muted hover:text-text transition-colors text-sm"
          onClick={handleAddFolder}
        >
          <FolderOpen className="w-4 h-4" />
          Add a folder to watch
        </button>
      ) : (
        <div className="space-y-1">
          {watchFolders.map((folder) => (
            <div
              key={folder}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-elevated border border-border group"
            >
              <FolderOpen className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <Tooltip.Provider delayDuration={600}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <span className="text-xs text-text font-mono flex-1 truncate cursor-default">
                      {displayPath(folder)}
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-surface-elevated border border-border text-text text-xs px-2 py-1 rounded shadow-lg max-w-xs break-all"
                      sideOffset={4}
                    >
                      {folder}
                      <Tooltip.Arrow className="fill-border" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-all"
                onClick={() => handleRemoveFolder(folder)}
                aria-label="Remove folder"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <p className="text-[10px] text-text-muted pl-0.5">
            Subfolders included · fixes written as <span className="font-mono">_fixed.stp</span>
          </p>
        </div>
      )}

      {watchFolders.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              watching ? 'bg-green-500 animate-pulse' : 'bg-text-muted'
            }`}
          />
          <span className="text-xs text-text-muted">
            {watching ? `Watching ${watchFolders.length} folder${watchFolders.length > 1 ? 's' : ''}` : 'Paused'}
          </span>
        </div>
      )}
    </div>
  )
}
