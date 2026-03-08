/**
 * Fix 1: Part name repair implementation
 */

#include "name_repair.h"
#include <TDataStd_Name.hxx>
#include <TDF_Label.hxx>
#include <TDF_LabelSequence.hxx>
#include <TCollection_ExtendedString.hxx>
#include <TCollection_AsciiString.hxx>
#include <TopoDS_Shape.hxx>

namespace StepFixerNative {

static std::string ReadName(const TDF_Label& label) {
  Handle(TDataStd_Name) nameAttr;
  if (!label.FindAttribute(TDataStd_Name::GetID(), nameAttr))
    return "";
  TCollection_AsciiString ascii(nameAttr->Get());
  return std::string(ascii.ToCString());
}

static void RepairNamesRecursive(
  const TDF_LabelSequence& labels,
  const Handle(XCAFDoc_ShapeTool)& shapeTool,
  const std::unordered_map<Standard_Address, std::string>& brepNameMap)
{
  for (int i = 1; i <= labels.Length(); i++) {
    TDF_Label label = labels.Value(i);
    if (!shapeTool->IsAssembly(label))
      continue;

    TDF_LabelSequence components;
    shapeTool->GetComponents(label, components);

    for (int j = 1; j <= components.Length(); j++) {
      TDF_Label compLabel = components.Value(j);
      std::string instanceName = ReadName(compLabel);

      TDF_Label refLabel;
      if (shapeTool->GetReferredShape(compLabel, refLabel)) {
        std::string refName = ReadName(refLabel);
        if (refName.empty() || refName == "0") {
          // Prefer the Plasticity MSB body name (e.g. "Solid 262.001") when
          // available.  The NAUO instance name is used as a fallback — it is
          // correct for typical single-file exports but may be a file-path
          // (e.g. "test slider3.stp") when one Plasticity file embeds another.
          std::string newName = instanceName;
          if (!brepNameMap.empty()) {
            TopoDS_Shape refShape = shapeTool->GetShape(refLabel);
            if (!refShape.IsNull()) {
              Standard_Address addr = (Standard_Address)refShape.TShape().get();
              auto it = brepNameMap.find(addr);
              if (it != brepNameMap.end() && !it->second.empty() && it->second != "0")
                newName = it->second;
            }
          }
          TDataStd_Name::Set(refLabel, TCollection_ExtendedString(newName.c_str()));
        }
        TDF_LabelSequence children;
        shapeTool->GetComponents(refLabel, children);
        RepairNamesRecursive(children, shapeTool, brepNameMap);
      }
    }
  }
}

void RepairNames(
  const Handle(TDocStd_Document)& doc,
  const Handle(XCAFDoc_ShapeTool)& shapeTool,
  const std::unordered_map<Standard_Address, std::string>& brepNameMap)
{
  TDF_LabelSequence freeShapes;
  shapeTool->GetFreeShapes(freeShapes);
  RepairNamesRecursive(freeShapes, shapeTool, brepNameMap);
}

static int CountNamesToRepairRecursive(const TDF_LabelSequence& labels, const Handle(XCAFDoc_ShapeTool)& shapeTool) {
  int count = 0;
  for (int i = 1; i <= labels.Length(); i++) {
    TDF_Label label = labels.Value(i);
    if (!shapeTool->IsAssembly(label)) continue;
    TDF_LabelSequence components;
    shapeTool->GetComponents(label, components);
    for (int j = 1; j <= components.Length(); j++) {
      TDF_Label compLabel = components.Value(j);
      std::string instanceName = ReadName(compLabel);
      TDF_Label refLabel;
      if (shapeTool->GetReferredShape(compLabel, refLabel)) {
        std::string refName = ReadName(refLabel);
        if ((refName.empty() || refName == "0") && !instanceName.empty())
          count++;
        TDF_LabelSequence children;
        shapeTool->GetComponents(refLabel, children);
        count += CountNamesToRepairRecursive(children, shapeTool);
      }
    }
  }
  return count;
}

int CountNamesToRepair(
  const Handle(TDocStd_Document)& doc,
  const Handle(XCAFDoc_ShapeTool)& shapeTool)
{
  TDF_LabelSequence freeShapes;
  shapeTool->GetFreeShapes(freeShapes);
  return CountNamesToRepairRecursive(freeShapes, shapeTool);
}

} // namespace StepFixerNative
