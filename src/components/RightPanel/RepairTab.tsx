import * as React from 'react'
import { DropZone } from './DropZone'
import { OptionsPanel } from './OptionsPanel'
import { FileList } from './FileList'
import { LogPanel } from './LogPanel'
import { useAppStore } from '../../stores/appStore'
import { useRepairActions } from '../../hooks/useRepairActions'
import { Separator } from '@radix-ui/react-separator'

export function RepairTab() {
  const files = useAppStore((s) => s.files)
  const options = useAppStore((s) => s.options)
  const addFiles = useAppStore((s) => s.addFiles)
  const { analyseFile, handleBrowse, handleRepairAll } = useRepairActions()

  const onDrop = React.useCallback(
    (paths: string[]) => {
      addFiles(paths)
      paths.forEach((p) => analyseFile(p))
    },
    [addFiles, analyseFile],
  )

  const readyFiles = files.filter((f) => f.status === 'ready')
  const canFixAll = readyFiles.length > 0

  return (
    <div className="flex flex-col gap-0 p-4">
      <DropZone onBrowse={handleBrowse} onDrop={onDrop} />

      <div className="mt-4">
        <OptionsPanel />
      </div>

      {files.length > 0 && (
        <>
          <div className="my-4">
            <Separator className="border-border" />
          </div>
          <FileList />
          {canFixAll && (
            <button
              type="button"
              className="btn btn-accent w-full mt-3"
              onClick={() => handleRepairAll(readyFiles, options)}
            >
              Fix All ({readyFiles.length})
            </button>
          )}
        </>
      )}

      <div className="mt-4">
        <LogPanel />
      </div>
    </div>
  )
}
