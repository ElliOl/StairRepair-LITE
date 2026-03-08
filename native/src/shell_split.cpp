/**
 * Fix 2: Disconnected shell split implementation
 *
 * Splits solids whose faces form multiple connected components (via edge adjacency BFS).
 * This fixes Plasticity STEP exports where unconnected face groups land in one solid,
 * causing SolidWorks / Creo to report broken topology.
 */

#include "shell_split.h"
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListOfShape.hxx>
#include <BRep_Builder.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Shell.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Iterator.hxx>
#include <TopoDS_Solid.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TDF_Label.hxx>
#include <TDF_LabelSequence.hxx>
#include <queue>

namespace StepFixerNative {

std::vector<TopoDS_Solid> SplitDisconnectedShells(const TopoDS_Solid& solid) {
  // Map every edge in the solid to the faces that share it.
  TopTools_IndexedDataMapOfShapeListOfShape edgeFaceMap;
  TopExp::MapShapesAndAncestors(solid, TopAbs_EDGE, TopAbs_FACE, edgeFaceMap);

  // Index all faces in the solid.
  TopTools_IndexedMapOfShape faceMap;
  TopExp::MapShapes(solid, TopAbs_FACE, faceMap);

  int n = faceMap.Extent();
  if (n == 0) {
    return { solid };
  }

  // BFS to find connected face components via shared edges.
  std::vector<int> component(n + 1, -1);
  int numComponents = 0;

  for (int start = 1; start <= n; start++) {
    if (component[start] != -1) continue;
    component[start] = numComponents;
    std::queue<int> q;
    q.push(start);
    while (!q.empty()) {
      int fi = q.front();
      q.pop();
      const TopoDS_Face& face = TopoDS::Face(faceMap(fi));
      for (TopExp_Explorer eExp(face, TopAbs_EDGE); eExp.More(); eExp.Next()) {
        const TopoDS_Shape& edge = eExp.Current();
        // Guard: degenerate / seam edges may not appear in the adjacency map.
        if (!edgeFaceMap.Contains(edge)) continue;
        const TopTools_ListOfShape& adjFaces = edgeFaceMap.FindFromKey(edge);
        for (TopTools_ListOfShape::Iterator it(adjFaces); it.More(); it.Next()) {
          int adj = faceMap.FindIndex(it.Value());
          if (adj >= 1 && component[adj] == -1) {
            component[adj] = numComponents;
            q.push(adj);
          }
        }
      }
    }
    numComponents++;
  }

  // Already one connected body — nothing to do.
  if (numComponents <= 1) {
    return { solid };
  }

  // Build one solid per connected component.
  BRep_Builder builder;
  std::vector<TopoDS_Solid> results(numComponents);
  std::vector<TopoDS_Shell> shells(numComponents);
  for (int c = 0; c < numComponents; c++) {
    builder.MakeSolid(results[c]);
    builder.MakeShell(shells[c]);
  }
  for (int fi = 1; fi <= n; fi++) {
    int c = component[fi];
    builder.Add(shells[c], TopoDS::Face(faceMap(fi)));
  }
  for (int c = 0; c < numComponents; c++) {
    shells[c].Closed(Standard_True);
    builder.Add(results[c], shells[c]);
  }
  return results;
}

/**
 * Walk a shape recursively. When a SOLID with multiple connected components is
 * found, it is replaced by its split solids (flattened, not nested in a sub-compound).
 * Returns true if any solid was split.
 */
static bool SplitSolidsInShape(const TopoDS_Shape& shape, TopoDS_Shape& outShape) {
  if (shape.IsNull()) {
    outShape = shape;
    return false;
  }

  if (shape.ShapeType() == TopAbs_SOLID) {
    std::vector<TopoDS_Solid> split = SplitDisconnectedShells(TopoDS::Solid(shape));
    if (split.size() > 1) {
      BRep_Builder builder;
      TopoDS_Compound compound;
      builder.MakeCompound(compound);
      for (const auto& s : split) builder.Add(compound, s);
      outShape = compound;
      return true;
    }
    outShape = shape;
    return false;
  }

  if (shape.ShapeType() == TopAbs_COMPOUND ||
      shape.ShapeType() == TopAbs_COMPSOLID) {
    BRep_Builder builder;
    TopoDS_Compound out;
    builder.MakeCompound(out);
    bool changed = false;
    for (TopoDS_Iterator it(shape); it.More(); it.Next()) {
      TopoDS_Shape sub;
      bool subChanged = SplitSolidsInShape(it.Value(), sub);
      if (subChanged) {
        changed = true;
        // If a solid was split into a compound, flatten its children directly.
        if (sub.ShapeType() == TopAbs_COMPOUND) {
          for (TopoDS_Iterator cit(sub); cit.More(); cit.Next())
            builder.Add(out, cit.Value());
        } else {
          builder.Add(out, sub);
        }
      } else {
        builder.Add(out, it.Value());
      }
    }
    if (changed) {
      outShape = out;
      return true;
    }
    outShape = shape;
    return false;
  }

  outShape = shape;
  return false;
}

static void SplitSolidsRecursive(
  const TDF_Label& label,
  const Handle(XCAFDoc_ShapeTool)& shapeTool)
{
  if (shapeTool->IsAssembly(label)) {
    // For assembly labels, only recurse into referenced shapes — do not modify
    // the assembly label itself (that would corrupt the XCAF component structure).
    TDF_LabelSequence components;
    shapeTool->GetComponents(label, components);
    for (int i = 1; i <= components.Length(); i++) {
      TDF_Label refLabel;
      if (shapeTool->GetReferredShape(components.Value(i), refLabel))
        SplitSolidsRecursive(refLabel, shapeTool);
    }
  } else {
    TopoDS_Shape shape = shapeTool->GetShape(label);
    if (shape.IsNull()) return;
    TopoDS_Shape newShape;
    if (SplitSolidsInShape(shape, newShape))
      shapeTool->SetShape(label, newShape);
  }
}

void SplitDisconnectedShellsInDocument(
  const Handle(TDocStd_Document)& doc,
  const Handle(XCAFDoc_ShapeTool)& shapeTool)
{
  TDF_LabelSequence freeShapes;
  shapeTool->GetFreeShapes(freeShapes);
  for (int i = 1; i <= freeShapes.Length(); i++)
    SplitSolidsRecursive(freeShapes.Value(i), shapeTool);
}

// ---- Count helpers ---------------------------------------------------------

static int CountSolidsToSplitInShape(const TopoDS_Shape& shape) {
  if (shape.IsNull()) return 0;
  if (shape.ShapeType() == TopAbs_SOLID) {
    std::vector<TopoDS_Solid> split = SplitDisconnectedShells(TopoDS::Solid(shape));
    return split.size() > 1 ? 1 : 0;
  }
  if (shape.ShapeType() == TopAbs_COMPOUND ||
      shape.ShapeType() == TopAbs_COMPSOLID) {
    int count = 0;
    for (TopoDS_Iterator it(shape); it.More(); it.Next())
      count += CountSolidsToSplitInShape(it.Value());
    return count;
  }
  return 0;
}

static int CountSolidsToSplitRecursive(
  const TDF_Label& label,
  const Handle(XCAFDoc_ShapeTool)& shapeTool)
{
  if (shapeTool->IsAssembly(label)) {
    int count = 0;
    TDF_LabelSequence components;
    shapeTool->GetComponents(label, components);
    for (int i = 1; i <= components.Length(); i++) {
      TDF_Label refLabel;
      if (shapeTool->GetReferredShape(components.Value(i), refLabel))
        count += CountSolidsToSplitRecursive(refLabel, shapeTool);
    }
    return count;
  }
  TopoDS_Shape shape = shapeTool->GetShape(label);
  return CountSolidsToSplitInShape(shape);
}

int CountSolidsToSplit(
  const Handle(TDocStd_Document)& doc,
  const Handle(XCAFDoc_ShapeTool)& shapeTool)
{
  TDF_LabelSequence freeShapes;
  shapeTool->GetFreeShapes(freeShapes);
  int count = 0;
  for (int i = 1; i <= freeShapes.Length(); i++)
    count += CountSolidsToSplitRecursive(freeShapes.Value(i), shapeTool);
  return count;
}

} // namespace StepFixerNative
