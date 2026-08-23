import type { Point } from '../core/geometry.js';
import type { Bounds3, Point3, RadialDeformation, SurfaceAnchor } from '../core/geometry3.js';
import type { SolidMaterialSpec } from '../materials/finish.js';
import type { AssetCapabilities } from './asset-capabilities.js';
import type { AssetBlueprintHeader } from './asset-envelope.js';

export type SuperellipsoidGeometrySpec = Readonly<{
  type: 'superellipsoid';
  radii: Point3;
  exponent: number;
  deformation?: RadialDeformation;
  widthSegments: number;
  heightSegments: number;
}>;

export type ExtrudedProfileGeometrySpec = Readonly<{
  type: 'extruded-profile';
  outline: readonly Point[];
  depth: number;
  bevel: number;
  curveSegments: number;
}>;

export type MeshGeometrySpec = Readonly<{
  type: 'mesh';
  vertices: readonly Point3[];
  faces: readonly (readonly number[])[];
  smooth: boolean;
}>;

export type BoxGeometrySpec = Readonly<{
  type: 'box';
  size: Point3;
  segments?: readonly [x: number, y: number, z: number];
}>;

export type SolidGeometrySpec =
  | SuperellipsoidGeometrySpec
  | ExtrudedProfileGeometrySpec
  | BoxGeometrySpec
  | MeshGeometrySpec;

export type SolidNodeDefinition = Readonly<{
  id: string;
  parentNode?: string;
  position: Point3;
}>;

export type SolidPlacement = Readonly<{
  position: Point3;
  surface?: SurfaceAnchor;
  /** Local Euler rotation applied after surface alignment, in XYZ order. */
  rotation?: Point3;
}>;

export type SolidPartDefinition = Readonly<{
  id: string;
  node: string;
  order: number;
  geometry: SolidGeometrySpec;
  materialId: string;
  placement: SolidPlacement;
  capabilities?: AssetCapabilities;
  visible?: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
}>;

export type BoxCollider3 = Readonly<{
  id: string;
  kind: 'solid' | 'sensor';
  shape: 'box';
  center: Point3;
  size: Point3;
}>;

export type Collider3 = BoxCollider3;
export type SocketMap3 = Readonly<Record<string, Point3>>;

export type SolidNodeState = Readonly<{
  translation?: Point3;
  rotation?: Point3;
  scale?: Point3;
}>;

export type SolidInteractionNodeBinding = Readonly<{
  nodeId: string;
  stateByInteractionState: Readonly<Record<string, SolidNodeState>>;
}>;

export type SolidInteractionDefinition = Readonly<{
  id: string;
  kind: 'toggle' | 'portal';
  sensorColliderId: string;
  activationSocketId: string;
  initialState: string;
  states: readonly string[];
  nodeBindings: readonly SolidInteractionNodeBinding[];
}>;

export type SolidAssetBlueprint<TFamily extends string = string> = AssetBlueprintHeader<
  TFamily,
  'solid'
> & Readonly<{
  bounds: Bounds3;
  nodes: readonly SolidNodeDefinition[];
  parts: readonly SolidPartDefinition[];
  materials: readonly SolidMaterialSpec[];
  colliders: readonly Collider3[];
  sockets: SocketMap3;
  interactions: readonly SolidInteractionDefinition[];
}>;
