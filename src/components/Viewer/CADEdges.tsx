import * as React from 'react'
import * as THREE from 'three'
import type { EdgeData } from '../../types'

const EDGE_COLOR = new THREE.Color(0.3, 0.3, 0.32)

interface CADEdgesProps {
  edges: EdgeData
}

export function CADEdges({ edges }: CADEdgesProps) {
  const geometry = React.useMemo(() => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(edges.positions, 3))
    const lineIndices: number[] = []
    for (let i = 0; i < edges.indices.length; i += 2) {
      const startIdx = edges.indices[i]
      const pointCount = edges.indices[i + 1]
      for (let j = 0; j < pointCount - 1; j++) {
        lineIndices.push(startIdx + j)
        lineIndices.push(startIdx + j + 1)
      }
    }
    geom.setIndex(lineIndices)
    return geom
  }, [edges])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={EDGE_COLOR} />
    </lineSegments>
  )
}
