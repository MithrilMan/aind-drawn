import type { Point } from '../core/geometry.js';
import type { Bounds3, Point3, SurfaceAnchor } from '../core/geometry3.js';
import type { Seed } from '../core/random.js';
import type { SolidMaterialSpec } from '../materials/finish.js';

export type SuperellipsoidGeometrySpec = Readonly<{
  type: 'superellipsoid';
  radii: Point3;
  exponent: number;
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

export type SolidGeometrySpec =
  | SuperellipsoidGeometrySpec
  | ExtrudedProfileGeometrySpec
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

export type SolidPartMotion = Readonly<{
  role: 'eye' | 'brow' | 'mouth' | 'fixed';
  side?: -1 | 1;
  gazeTravel?: readonly [x: number, y: number];
  blink?: Readonly<{
    kind: 'squash';
    minimumScaleY: number;
  }>;
}>;

export type SolidPartDefinition = Readonly<{
  id: string;
  node: string;
  order: number;
  geometry: SolidGeometrySpec;
  materialId: string;
  placement: SolidPlacement;
  motion: SolidPartMotion;
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

export type SolidAssetBlueprint = Readonly<{
  representation: 'solid';
  id: string;
  kind: string;
  seed: Seed;
  bounds: Bounds3;
  nodes: readonly SolidNodeDefinition[];
  parts: readonly SolidPartDefinition[];
  materials: readonly SolidMaterialSpec[];
  colliders: readonly Collider3[];
  sockets: SocketMap3;
}>;

export type SolidRecipeHeader = Readonly<{
  version: 1;
  seed: number;
}>;
