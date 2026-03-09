# StairRepair Lite

Electron tray app that repairs STEP files exported from Plasticity (via HOOPS Exchange) so they import correctly into SolidWorks, Creo, Keyshot, and other professional CAD tools.

**Lite** = pure TypeScript, no native addons. No OpenCASCADE or C++ build required. No CAD viewer.

## Fixes

1. **Part name repair** — PRODUCT entities with name `'0'` are replaced with the real part name from NAUO instance labels and the MSB chain.
2. **HOOPS Exchange compatibility** — Per-face color overrides that cause partial MDGPR coverage are stripped; CAD readers (Creo, SolidWorks, Keyshot, etc.) otherwise misinterpret this as a second geometric body and import the part as "2 sheets".

## What Lite does *not* do

- **Disconnected shell split** — Splitting solids with multiple disconnected face regions requires OpenCASCADE. Use the full StepFixer build for that.

## How it works

- **Watch folders** — Add folders to watch; new or changed `.stp`/`.step` files are auto-repaired and saved as `*_fixed.stp`.
- **Manual fix** — Browse and fix individual STEP files on demand.
- **Tray-only** — Lives in the menu bar (macOS) or system tray (Windows). Click to open; click again when focused to close.

## Requirements

- Node.js 18+
- macOS 10.15+ or Windows

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
npm run dist   # or npm run pack for unpacked app
```

## Project structure

- `electron/` — Main process, tray, file watcher, IPC
- `src/` — React UI, stores, repair engine
- `src/lib/` — Pure TS: `stepParser`, `stepAnalyse`, `stepRepair`, `stepTree` (no native deps)

## License

MIT
