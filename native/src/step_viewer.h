/**
 * Step Viewer - STEP load, tessellation, mesh/edge extraction for CAD viewer
 * Adapted from hive step_loader. No HLR, single quality for display.
 */

#pragma once

#include <string>
#include <vector>
#include <map>
#include <memory>
#include <functional>

#include <TopoDS_Shape.hxx>
#include <TDocStd_Document.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XCAFDoc_ColorTool.hxx>

namespace StepFixerNative {

struct MeshData {
  std::vector<float> positions;
  std::vector<float> normals;
  std::vector<uint32_t> indices;
  float bbox_min[3];
  float bbox_max[3];
  int face_count;
  int triangle_count;
  std::vector<std::string> logs;
};

struct EdgeData {
  std::vector<float> positions;
  std::vector<uint32_t> indices;
  int edge_count;
};

struct PartNode {
  std::string id;
  std::string name;
  /** NAUO instance label name — the "real" name hidden in the broken STEP file.
   *  Non-empty only when name == "0" and a NEXT_ASSEMBLY_USAGE_OCCURRENCE instance
   *  label carried a different name. After repair this equals name. */
  std::string instanceName;
  std::string parentId;
  std::vector<std::string> childIds;
  bool hasColor;
  float color[3];
  std::string shapeType;
  bool isAssembly;
  uint32_t startVertex;
  uint32_t vertexCount;
  uint32_t startIndex;
  uint32_t indexCount;
  uint32_t startEdgePoint;
  uint32_t edgePointCount;
  uint32_t startEdgeIndex;
  uint32_t edgeIndexCount;
};

struct PartTreeData {
  std::vector<PartNode> parts;
  std::map<std::string, TopoDS_Shape> shapes;
};

/** Result of loading a STEP file for viewer */
struct LoadResult {
  std::string shape_id;
  MeshData mesh;
  EdgeData edges;
  PartTreeData part_tree;
};

class StepViewer {
public:
  StepViewer();
  ~StepViewer();

  using LogCallback = std::function<void(const std::string&)>;
  void SetLogCallback(LogCallback cb);

  /**
   * Load STEP file, tessellate, extract mesh + edges + part tree.
   * quality: "fast" | "standard" | "fine"
   */
  LoadResult LoadStepMesh(const std::string& filepath, const std::string& quality = "standard");

  /** Get raw shape by id (for repair pipeline) */
  TopoDS_Shape GetShape(const std::string& shape_id);

  /** Get XCAF document by shape id (for name_repair / shell_split) */
  Handle(TDocStd_Document) GetDocument(const std::string& shape_id);

private:
  struct Impl;
  std::unique_ptr<Impl> pImpl;
};

} // namespace StepFixerNative
