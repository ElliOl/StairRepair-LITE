# StepFixer — App Specification

A small Electron desktop app that repairs STEP files exported from Plasticity
(via HOOPS Exchange) so they import correctly into SolidWorks, Creo, Keyshot,
and other professional CAD tools.

---

## Problem Summary

Plasticity's HOOPS Exchange exporter produces STEP files with two distinct bugs:

| # | Bug | Symptom in other CAD tools |
|---|-----|----------------------------|
| 1 | `PRODUCT` entities have name `'0'` instead of the real part name | Parts appear as "0" or generic names in the feature tree |
| 2 | Geometrically disconnected face regions are packed into a single `CLOSED_SHELL` | Single Plasticity body imports as 2+ separate bodies |

Both bugs are fixable in post-processing without round-tripping through a full
CAD kernel modeler.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Electron Renderer (React + Tailwind)                   │
│  • Drag-drop file input                                 │
│  • Fix options UI (which fixes to apply)                │
│  • Progress log panel                                   │
│  • Save / batch output                                  │
└────────────────────────┬────────────────────────────────┘
                         │ IPC
┌────────────────────────▼────────────────────────────────┐
│  Electron Main Process                                  │
│  • File I/O                                             │
│  • IPC handlers                                         │
│  • Calls native addon                                   │
└────────────────────────┬────────────────────────────────┘
                         │ N-API
┌────────────────────────▼────────────────────────────────┐
│  Native C++ Addon (node-gyp / OpenCASCADE 7.8.1)        │
│  • Fix 1: Name repair  (XCAF / STEPCAFControl)          │
│  • Fix 2: Shell split  (TopoDS / BRep topology walk)    │
│  • Write repaired STEP (STEPCAFControl_Writer)          │
└─────────────────────────────────────────────────────────┘
```

The native addon can be copied directly from the Trace project and stripped
down — only the STEP read/write and topology analysis code is needed. No
tessellation, no HLR, no rendering.

---

## Fix 1 — Part Name Repair

### Root Cause

HOOPS Exchange writes all `PRODUCT` entities with `'0'` as the name:

```step
#127=PRODUCT('0','0','',(#27117));   ← should be 'MPJ1832-SLIDER'
```

The real names exist on `NEXT_ASSEMBLY_USAGE_OCCURRENCE` (NAUO) instance
labels, which OpenCASCADE's `STEPCAFControl_Reader` maps to XCAF instance
labels as `TDataStd_Name` attributes. Prototype (product definition) labels
get the useless `'0'` name.

### Fix Strategy

After reading the file into an XCAF document:

1. Walk all free shapes and their assembly components with `XCAFDoc_ShapeTool`
2. For each component label, read `TDataStd_Name` → this is the NAUO name
   (e.g. `T0009043`, `MPJ1832-SLIDER`)
3. For each referred (prototype) shape label, read its `TDataStd_Name` →
   if it is `"0"` or empty, overwrite it with the instance name
4. Write the repaired document back to STEP with `STEPCAFControl_Writer`

This is almost identical to the fix already applied in Trace's `part_tree.cpp`
but here it mutates the XCAF document and re-exports rather than just
correcting the in-memory display name.

### C++ Sketch

```cpp
void RepairNames(
    const Handle(TDocStd_Document)& doc,
    const Handle(XCAFDoc_ShapeTool)& shapeTool)
{
  TDF_LabelSequence freeShapes;
  shapeTool->GetFreeShapes(freeShapes);
  RepairNamesRecursive(freeShapes, shapeTool);
}

static void RepairNamesRecursive(
    const TDF_LabelSequence& labels,
    const Handle(XCAFDoc_ShapeTool)& shapeTool)
{
  for (auto& label : labels) {
    if (!shapeTool->IsAssembly(label)) continue;

    TDF_LabelSequence components;
    shapeTool->GetComponents(label, components);

    for (auto& compLabel : components) {
      // Read instance name (NAUO → meaningful)
      std::string instanceName = ReadName(compLabel);

      TDF_Label refLabel;
      if (shapeTool->GetReferredShape(compLabel, refLabel)) {
        std::string refName = ReadName(refLabel);

        // Overwrite only if prototype name is generic
        if (refName.empty() || refName == "0") {
          TDataStd_Name::Set(refLabel,
              TCollection_ExtendedString(instanceName.c_str()));
        }

        // Recurse
        TDF_LabelSequence children;
        shapeTool->GetComponents(refLabel, children);
        RepairNamesRecursive(children, shapeTool);
      }
    }
  }
}
```

---

## Fix 2 — Disconnected Shell Split

### Root Cause

When a Plasticity body is derived from a partial assembly deletion, the
resulting solid can contain two (or more) geometrically disconnected groups of
faces bundled into a single `CLOSED_SHELL` / `MANIFOLD_SOLID_BREP`. The shell
regions share no edges or vertices — there is literal empty space between them.

SolidWorks, Creo, and Keyshot validate shell connectivity on import and split
them; OpenCASCADE accepts the invalid shell as-is.

### Fix Strategy

For each `MANIFOLD_SOLID_BREP` in the document:

1. Get its `CLOSED_SHELL` → collect all `ADVANCED_FACE` entities
2. Build a face adjacency graph: two faces are adjacent if they share an
   `EDGE_CURVE` (accessed via `TopExp_Explorer` over edges, then checking
   which faces each edge belongs to using `TopTools_IndexedDataMapOfShapeListOfShape`)
3. Run BFS/DFS to find connected components
4. If only one component → nothing to do
5. If multiple components → for each component:
   - Create a new `TopoDS_Shell` from those faces
   - Create a new `TopoDS_Solid` from that shell (`BRep_Builder::MakeSolid`)
   - Add it to the XCAF document as a separate shape under the same parent label
6. Remove the original invalid solid from the document
7. Write repaired STEP

### C++ Sketch

```cpp
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <BRep_Builder.hxx>
#include <TopoDS_Shell.hxx>
#include <TopoDS_Solid.hxx>
#include <BRepCheck_Analyzer.hxx>

std::vector<TopoDS_Solid> SplitDisconnectedShells(const TopoDS_Solid& solid)
{
  // Build edge → face map
  TopTools_IndexedDataMapOfShapeListOfShape edgeFaceMap;
  TopExp::MapShapesAndAncestors(solid, TopAbs_EDGE, TopAbs_FACE, edgeFaceMap);

  // Collect all faces
  TopTools_IndexedMapOfShape faceMap;
  TopExp::MapShapes(solid, TopAbs_FACE, faceMap);

  int n = faceMap.Extent();
  std::vector<int> component(n + 1, -1);
  int numComponents = 0;

  // BFS over face adjacency
  for (int start = 1; start <= n; start++) {
    if (component[start] != -1) continue;
    component[start] = numComponents;
    std::queue<int> queue;
    queue.push(start);
    while (!queue.empty()) {
      int fi = queue.front(); queue.pop();
      const TopoDS_Face& face = TopoDS::Face(faceMap(fi));
      for (TopExp_Explorer eExp(face, TopAbs_EDGE); eExp.More(); eExp.Next()) {
        const TopTools_ListOfShape& adjFaces =
            edgeFaceMap.FindFromKey(eExp.Current());
        for (auto it = adjFaces.begin(); it != adjFaces.end(); ++it) {
          int adj = faceMap.FindIndex(*it);
          if (component[adj] == -1) {
            component[adj] = numComponents;
            queue.push(adj);
          }
        }
      }
    }
    numComponents++;
  }

  if (numComponents == 1) return { solid };  // Already valid

  // Build one solid per component
  BRep_Builder builder;
  std::vector<TopoDS_Solid> results(numComponents);
  std::vector<TopoDS_Shell> shells(numComponents);
  for (int c = 0; c < numComponents; c++) {
    builder.MakeSolid(results[c]);
    builder.MakeShell(shells[c]);
  }
  for (int fi = 1; fi <= n; fi++) {
    builder.Add(shells[component[fi]],
                TopoDS::Face(faceMap(fi)));
  }
  for (int c = 0; c < numComponents; c++) {
    builder.Add(results[c], shells[c]);
  }
  return results;
}
```

---

## Native Addon API

Expose two IPC-callable functions from the addon:

```typescript
// Analyse a file — returns what would be changed without writing
analyseStep(filepath: string): Promise<{
  namesFlagged: number;      // PRODUCT entities with '0' names
  shellsSplit: number;       // Disconnected shells that would be split
  assembliesFlattened: number; // Redundant wrapper levels (optional fix)
}>

// Apply selected fixes and write output
repairStep(filepath: string, outputPath: string, options: {
  fixNames: boolean;
  fixShells: boolean;
}): Promise<{
  success: boolean;
  log: string[];
}>
```

---

## UI

Single-window Electron app, dark theme matching Trace.

```
┌─────────────────────────────────────────────────────────────┐
│  StepFixer                                              – □ ✕│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │  Drop .stp / .step files here  or  Browse           │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│   ── Options ──────────────────────────────────────────    │
│   ☑  Fix part names (PRODUCT entities)                      │
│   ☑  Split disconnected shells                              │
│   ☐  Flatten redundant assembly wrappers  (optional)        │
│                                                             │
│   ── Files ────────────────────────────────────────────    │
│   testslider copy.stp    ● 2 names, 1 shell    [Fix] [✕]   │
│   test slider3.stp       ● 0 names, 1 shell    [Fix] [✕]   │
│                                                             │
│   [Fix All]                              Output: same folder│
│                                                             │
│   ── Log ──────────────────────────────────────────────    │
│   [14:22:01] testslider copy.stp → repaired in 340ms        │
│   [14:22:01]   Names fixed: 4                               │
│   [14:22:01]   Shells split: 0                              │
└─────────────────────────────────────────────────────────────┘
```

Output files are written as `<original-name>_fixed.stp` next to the original
by default, with an option to choose a custom output folder.

---

## Repo Structure

```
step-fixer/
├── electron/
│   ├── main.ts          — BrowserWindow, IPC handlers, file I/O
│   └── preload.ts       — contextBridge IPC bridge
├── src/
│   ├── App.tsx          — root component
│   ├── components/
│   │   ├── DropZone.tsx
│   │   ├── FileList.tsx
│   │   ├── OptionsPanel.tsx
│   │   └── LogPanel.tsx
│   └── main.tsx
├── native/
│   ├── src/
│   │   ├── addon.cpp    — N-API bindings (analyseStep, repairStep)
│   │   ├── name_repair.cpp / .h
│   │   └── shell_split.cpp / .h
│   ├── binding.gyp
│   └── package.json
├── package.json
├── vite.config.ts
├── electron-builder.yml
└── README.md
```

---

## Bootstrap Plan

1. **Copy native scaffold** from Trace's `native-backend/` — keep `binding.gyp`,
   `deps/` (OCCT), and `node_modules/`. Delete `step_loader`, `part_tree`,
   `hlr` source. Replace with `name_repair` and `shell_split`.
2. **Scaffold Electron + Vite** — `npm create @quick-start/electron` or copy
   Trace's `electron/`, `src/`, `vite.config.ts`, `package.json` and strip
   out all Trace-specific code.
3. **Implement `name_repair.cpp`** — read with `STEPCAFControl_Reader`, walk
   XCAF labels, fix names, write with `STEPCAFControl_Writer`.
4. **Implement `shell_split.cpp`** — BFS connectivity check per solid, split
   if needed, update XCAF document, write.
5. **Wire IPC** — `analyseStep` and `repairStep` in `addon.cpp` → `main.ts`
   IPC handlers → renderer calls.
6. **Build UI** — DropZone → FileList with per-file analysis badges → Fix
   button → LogPanel.
7. **Test** against `testslider copy.stp` and `test slider3.stp`.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `electron` | Desktop shell |
| `electron-vite` | Build tooling |
| `react` + `react-dom` | UI |
| `tailwindcss` | Styling |
| `node-gyp` | Native addon build |
| `OpenCASCADE 7.8.1` | Copy dylibs/headers from Trace's `native-backend/deps/` |
| `lucide-react` | Icons |

No new CAD libraries needed — everything re-uses the OCC installation already
on your machine from the Trace project.
