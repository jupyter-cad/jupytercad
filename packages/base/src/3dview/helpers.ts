import { IParsedShape } from '@jupytercad/schema';
import * as THREE from 'three';
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree
} from 'three-mesh-bvh';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';

import { getCSSVariableColor } from '../tools';

export const DEFAULT_LINEWIDTH = 2;
export const SELECTED_LINEWIDTH = 6;

// Apply the BVH extension

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const DEFAULT_MESH_COLOR_CSS = '--jp-inverse-layout-color4';
export const DEFAULT_EDGE_COLOR_CSS = '--jp-inverse-layout-color2';
export const BOUNDING_BOX_COLOR_CSS = '--jp-brand-color0';
export const SELECTION_BOUNDING_BOX = 'selectionBoundingBox';

export const DEFAULT_MESH_COLOR = new THREE.Color(
  getCSSVariableColor(DEFAULT_MESH_COLOR_CSS)
);
export const DEFAULT_EDGE_COLOR = new THREE.Color(
  getCSSVariableColor(DEFAULT_EDGE_COLOR_CSS)
);
export const BOUNDING_BOX_COLOR = new THREE.Color(
  getCSSVariableColor(BOUNDING_BOX_COLOR_CSS)
);

export type BasicMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
>;

/**
 * The interface for a 3D pointer
 */
export interface IPointer {
  parent: BasicMesh;
  readonly mesh: BasicMesh;
}

/**
 * The result of mesh picking, contains the picked mesh and the 3D position of the pointer.
 */
export interface IPickedResult {
  mesh: BasicMesh;
  position: THREE.Vector3;
}

/**
 * The interface defining a mouse drag by its start and end position in pixels.
 */
export interface IMouseDrag {
  start: THREE.Vector2;
  end: THREE.Vector2;
}

export function projectVector(options: {
  vector: THREE.Vector3;
  camera: THREE.Camera;
  width: number;
  height: number;
}): THREE.Vector2 {
  const { vector, camera, width, height } = options;
  const copy = new THREE.Vector3().copy(vector);

  copy.project(camera);

  return new THREE.Vector2(
    (0.5 + copy.x / 2) * width,
    (0.5 - copy.y / 2) * height
  );
}

export function computeExplodedState(options: {
  mesh: BasicMesh;
  boundingGroup: THREE.Box3;
  factor: number;
}) {
  const { mesh, boundingGroup, factor } = options;
  const center = new THREE.Vector3();
  boundingGroup.getCenter(center);

  const oldGeometryCenter = new THREE.Vector3();
  mesh.geometry.boundingBox?.getCenter(oldGeometryCenter);

  const centerToMesh = new THREE.Vector3(
    oldGeometryCenter.x - center.x,
    oldGeometryCenter.y - center.y,
    oldGeometryCenter.z - center.z
  );
  const distance = centerToMesh.length() * factor;

  centerToMesh.normalize();

  const newGeometryCenter = new THREE.Vector3(
    oldGeometryCenter.x + distance * centerToMesh.x,
    oldGeometryCenter.y + distance * centerToMesh.y,
    oldGeometryCenter.z + distance * centerToMesh.z
  );

  return {
    oldGeometryCenter,
    newGeometryCenter,
    vector: centerToMesh,
    distance
  };
}

export function buildShape(options: {
  objName: string;
  data: IParsedShape;
  clippingPlanes: THREE.Plane[];
  isSolid: boolean;
  isWireframe: boolean;
  objColor?: THREE.Color | string | number;
}): {
  meshGroup: THREE.Group;
  mainMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edgesMeshes: LineSegments2[];
} | null {
  const { objName, data, isSolid, isWireframe, clippingPlanes, objColor } =
    options;
  const { faceList, edgeList, jcObject } = data;

  const vertices: Array<number> = [];
  const triangles: Array<number> = [];
  const placement = data?.jcObject?.parameters?.Placement;
  const objPosition = placement.Position;

  const angle = placement.Angle;
  const axis = placement.Axis;

  const angleRad = angle / 57.2958;

  const halfAngle = angleRad / 2;
  const sinHalfAngle = Math.sin(halfAngle);

  const objQuaternion = new THREE.Quaternion(
    axis[0] * sinHalfAngle,
    axis[1] * sinHalfAngle,
    axis[2] * sinHalfAngle,
    Math.cos(halfAngle)
  );
  const inverseQuaternion = objQuaternion.clone().invert();

  let vInd = 0;
  if (faceList.length === 0 && edgeList.length === 0) {
    return null;
  }
  for (const face of faceList) {
    const vertexCoorLength = face.vertexCoord.length;
    for (let ii = 0; ii < vertexCoorLength; ii += 3) {
      const vertex = new THREE.Vector3(
        face.vertexCoord[ii],
        face.vertexCoord[ii + 1],
        face.vertexCoord[ii + 2]
      );
      vertex.applyQuaternion(inverseQuaternion);

      vertices.push(vertex.x, vertex.y, vertex.z);
    }

    const triIndexesLength = face.triIndexes.length;
    for (let i = 0; i < triIndexesLength; i += 3) {
      triangles.push(
        face.triIndexes[i + 0] + vInd,
        face.triIndexes[i + 1] + vInd,
        face.triIndexes[i + 2] + vInd
      );
    }

    vInd += vertexCoorLength / 3;
  }

  const color = objColor || DEFAULT_MESH_COLOR;
  const visible = jcObject.visible;

  // Compile the connected vertices and faces into a model
  // And add to the scene
  // We need one material per-mesh because we will set the uniform color independently later
  // it's too bad Three.js does not easily allow setting uniforms independently per-mesh
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    wireframe: isWireframe,
    flatShading: false,
    clippingPlanes,
    metalness: 0.5,
    roughness: 0.5
  });

  const geometry = new THREE.BufferGeometry();

  geometry.setIndex(triangles);
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  if (vertices.length > 0) {
    geometry.computeBoundsTree();
  }

  const meshGroup = new THREE.Group();
  meshGroup.name = `${objName}-group`;
  meshGroup.visible = visible;
  geometry.translate(-objPosition[0], -objPosition[1], -objPosition[2]);

  // We only build the stencil logic for solid meshes
  if (isSolid) {
    const baseMat = new THREE.MeshBasicMaterial();
    baseMat.depthWrite = false;
    baseMat.depthTest = false;
    baseMat.colorWrite = false;
    baseMat.stencilWrite = true;
    baseMat.stencilFunc = THREE.AlwaysStencilFunc;

    // back faces
    const mat0 = baseMat.clone();
    mat0.side = THREE.BackSide;
    mat0.clippingPlanes = clippingPlanes;
    mat0.stencilFail = THREE.IncrementWrapStencilOp;
    mat0.stencilZFail = THREE.IncrementWrapStencilOp;
    mat0.stencilZPass = THREE.IncrementWrapStencilOp;
    const backFaces = new THREE.Mesh(geometry, mat0);
    backFaces.name = `${objName}-back`;
    meshGroup.add(backFaces);

    // front faces
    const mat1 = baseMat.clone();
    mat1.side = THREE.FrontSide;
    mat1.clippingPlanes = clippingPlanes;
    mat1.stencilFail = THREE.DecrementWrapStencilOp;
    mat1.stencilZFail = THREE.DecrementWrapStencilOp;
    mat1.stencilZPass = THREE.DecrementWrapStencilOp;
    const frontFaces = new THREE.Mesh(geometry, mat1);
    frontFaces.name = `${objName}-front`;
    meshGroup.add(frontFaces);
  } else {
    material.side = THREE.DoubleSide;
  }

  const mainMesh = new THREE.Mesh(geometry, material);
  mainMesh.name = objName;
  mainMesh.userData = {
    type: 'shape'
  };

  let edgeIdx = 0;
  const edgesMeshes: LineSegments2[] = [];
  for (const edge of edgeList) {
    const edgeMaterial = new LineMaterial({
      linewidth: DEFAULT_LINEWIDTH,
      color: new THREE.Color(DEFAULT_EDGE_COLOR).getHex(),
      clippingPlanes,
      // Depth offset so that lines are most always on top of faces
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    });

    const transformedVertices: number[] = [];
    for (let i = 0; i < edge.vertexCoord.length; i += 3) {
      const vertex = new THREE.Vector3(
        edge.vertexCoord[i],
        edge.vertexCoord[i + 1],
        edge.vertexCoord[i + 2]
      );

      vertex.applyQuaternion(inverseQuaternion);

      vertex.sub(
        new THREE.Vector3(objPosition[0], objPosition[1], objPosition[2])
      );

      transformedVertices.push(vertex.x, vertex.y, vertex.z);
    }

    const edgeGeometry = new LineGeometry();
    edgeGeometry.setPositions(transformedVertices);
    const edgesMesh = new LineSegments2(edgeGeometry, edgeMaterial);
    edgesMesh.name = `edge-${objName}-${edgeIdx}`;
    edgesMesh.userData = {
      type: 'edge',
      edgeIndex: edgeIdx,
      parent: objName
    };

    edgesMeshes.push(edgesMesh);
    meshGroup.add(edgesMesh);
    edgeIdx++;
  }

  const bbox = new THREE.Box3().setFromObject(mainMesh);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  const boundingBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
    new THREE.LineBasicMaterial({ color: BOUNDING_BOX_COLOR, depthTest: false })
  );
  boundingBox.position.copy(center);
  boundingBox.visible = false;
  boundingBox.name = SELECTION_BOUNDING_BOX;
  meshGroup.add(boundingBox);

  meshGroup.add(mainMesh);

  meshGroup.position.copy(
    new THREE.Vector3(objPosition[0], objPosition[1], objPosition[2])
  );
  meshGroup.applyQuaternion(objQuaternion);

  return { meshGroup, mainMesh, edgesMeshes };
}
