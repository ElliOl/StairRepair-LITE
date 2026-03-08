import * as React from 'react'
import { TabNav } from '@radix-ui/themes'
import { RepairTab } from './RepairTab'
import { ViewerTab } from './ViewerTab'

export function RightPanel() {
  const [activeTab, setActiveTab] = React.useState<'repair' | 'viewer'>('repair')
  return (
    <aside
      className="w-80 flex-none flex flex-col bg-background overflow-hidden"
      style={{ width: '320px' } as React.CSSProperties}
    >
      {/* Drag area that aligns with the FileHeader height on the left */}
      <div
        className="bg-background shrink-0"
        style={{ height: '32px', WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Tab nav — no border separator */}
      <div className="shrink-0 px-2 pt-1 pb-2">
        <TabNav.Root size="2">
          <TabNav.Link
            active={activeTab === 'repair'}
            onClick={() => setActiveTab('repair')}
          >
            Repair
          </TabNav.Link>
          <TabNav.Link
            active={activeTab === 'viewer'}
            onClick={() => setActiveTab('viewer')}
          >
            Viewer
          </TabNav.Link>
        </TabNav.Root>
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {activeTab === 'repair' && <RepairTab />}
        {activeTab === 'viewer' && <ViewerTab />}
      </div>
    </aside>
  )
}
