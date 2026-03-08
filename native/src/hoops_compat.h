/**
 * HOOPS Exchange STEP compatibility detection and repair.
 *
 * HOOPS Exchange writes a MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION (MDGPR)
 * that only covers a subset of faces. Some STEP readers (Creo, Keyshot) misinterpret this
 * partial coverage as a second geometric body, causing the part to import as "2 sheets".
 *
 * The repair removes per-face color overrides from the XCAF document before writing so that
 * no partial MDGPR is emitted — only the solid-level styled item (if any) is kept.
 */

#pragma once
#include <string>
#include <TDocStd_Document.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XCAFDoc_ColorTool.hxx>

namespace StepFixerNative {

/**
 * Scan a STEP file for HOOPS Exchange MDGPR partial face coverage.
 *
 * Returns the number of ADVANCED_FACE entities NOT represented in the
 * MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION.
 *
 * Returns 0  → not from HOOPS Exchange, or MDGPR covers all faces (no issue).
 * Returns >0 → that many faces are absent from the MDGPR; a rewrite is needed.
 */
int CountHoopsCompatFixes(const std::string& filepath);

/**
 * Remove per-face color overrides from the XCAF document.
 *
 * OpenCASCADE preserves face-level OVER_RIDING_STYLED_ITEM colors when reading HOOPS
 * Exchange files and re-emits them on write, recreating the same partial MDGPR.
 * This function unsets those face-level colors so the writer produces either a
 * fully-consistent MDGPR (all faces styled) or none at all.
 */
void StripPerFaceColors(
    const Handle(TDocStd_Document)& doc,
    const Handle(XCAFDoc_ShapeTool)& shapeTool,
    const Handle(XCAFDoc_ColorTool)& colorTool);

} // namespace StepFixerNative
