import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { useAppStore } from '../stores/appStore'
import type { AxisSwap } from '../types'

function OptionRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer group">
      <div className="flex flex-col gap-0.5 pt-0.5">
        <span className="text-sm text-text leading-tight">{label}</span>
        {description && (
          <span className="text-[10px] text-text-muted leading-tight">{description}</span>
        )}
      </div>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative shrink-0 h-5 w-9 cursor-pointer rounded-full outline-none transition-colors bg-surface-hover data-[state=checked]:bg-accent"
      >
        <SwitchPrimitive.Thumb className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0.5" />
      </SwitchPrimitive.Root>
    </label>
  )
}

const AXIS_SEGMENTS: { value: AxisSwap; label: string }[] = [
  { value: 'none',      label: 'None' },
  { value: 'zUpToYUp', label: 'Z → Y' },
  { value: 'yUpToZUp', label: 'Y → Z' },
]

function AxisSwapControl({
  value,
  onChange,
}: {
  value: AxisSwap
  onChange: (v: AxisSwap) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5 pt-0.5">
        <span className="text-sm text-text leading-tight">Axis orientation</span>
        <span className="text-[10px] text-text-muted leading-tight">
          Swap world-up axis
        </span>
      </div>
      <div className="flex rounded-full bg-surface-hover p-0.5 gap-0.5 w-36 shrink-0">
        {AXIS_SEGMENTS.map((seg) => {
          const active = value === seg.value
          return (
            <button
              key={seg.value}
              type="button"
              onClick={() => onChange(seg.value)}
              className={[
                'flex-1 text-[11px] font-medium py-1 rounded-full transition-colors select-none',
                active
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-text',
              ].join(' ')}
            >
              {seg.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function OptionsPanel({ onSettingsChange }: { onSettingsChange?: () => void }) {
  const { options, setOptions } = useAppStore()

  const update = (updates: Partial<typeof options>) => {
    setOptions(updates)
    window.electronAPI.setSettings(updates).catch(console.error)
    onSettingsChange?.()
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Options</p>
      <div className="space-y-2">
        <AxisSwapControl
          value={options.axisSwap}
          onChange={(v) => update({ axisSwap: v })}
        />
        <OptionRow
          label="Fix part names"
          description="Restore unnamed PRODUCT entities"
          checked={options.fixNames}
          onCheckedChange={(v) => update({ fixNames: v })}
        />
        <OptionRow
          label="Fix HOOPS Exchange compat"
          description="Remove per-face color overrides"
          checked={options.fixHoopsCompat}
          onCheckedChange={(v) => update({ fixHoopsCompat: v })}
        />
        <OptionRow
          label="Replace original file"
          description="Overwrite in place, no _fixed copy"
          checked={options.deleteOriginal}
          onCheckedChange={(v) => update({ deleteOriginal: v })}
        />
      </div>
    </div>
  )
}
