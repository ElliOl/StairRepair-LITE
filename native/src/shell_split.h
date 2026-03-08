/**
 * Fix 2: Disconnected shell split — split solids whose faces form multiple connected components
 */

#pragma once

#include <vector>
#include <TopoDS_Solid.hxx>
#include <TopoDS_Shape.hxx>
#include <TDocStd_Document.hxx>
#include <XCAFDoc_ShapeTool.hxx>

namespace StepFixerNative {

/** Split a solid into one solid per connected face component. Returns single solid if already connected. */
std::vector<TopoDS_Solid> SplitDisconnectedShells(const TopoDS_Solid& solid);

/** Walk XCAF document and replace any solid with disconnected shells by a compound of split solids. */
void SplitDisconnectedShellsInDocument(
  const Handle(TDocStd_Document)& doc,
  const Handle(XCAFDoc_ShapeTool)& shapeTool);

/** Count how many solids in the document have multiple connected face components (would be split). */
int CountSolidsToSplit(
  const Handle(TDocStd_Document)& doc,
  const Handle(XCAFDoc_ShapeTool)& shapeTool);

} // namespace StepFixerNative
