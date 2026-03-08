/**
 * Fix 1: Part name repair — copy NAUO instance names to prototype labels with "0"
 */

#pragma once

#include <TDocStd_Document.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <Standard_TypeDef.hxx>
#include <unordered_map>
#include <string>

namespace StepFixerNative {

/**
 * Repair PRODUCT names in XCAF document.
 *
 * For each prototype label whose PRODUCT name is "0" or empty, copy the
 * NAUO instance name.  If a brepNameMap is supplied (TShape address →
 * MSB entity name), and the prototype's solid has a non-trivial MSB name,
 * that name is preferred over the NAUO name.  This ensures Plasticity body
 * names (e.g. "Solid 262.001") are preserved even when the NAUO carries a
 * file-reference string (e.g. "test slider3.stp").
 */
void RepairNames(
  const Handle(TDocStd_Document)& doc,
  const Handle(XCAFDoc_ShapeTool)& shapeTool,
  const std::unordered_map<Standard_Address, std::string>& brepNameMap = {});

/** Count how many prototype labels would be repaired (name is "0" or empty and instance has a name). */
int CountNamesToRepair(
  const Handle(TDocStd_Document)& doc,
  const Handle(XCAFDoc_ShapeTool)& shapeTool);

} // namespace StepFixerNative
