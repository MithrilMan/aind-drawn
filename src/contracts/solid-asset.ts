import type { Point } from '../core/geometry.js';
import type { Bounds3, Point3, RadialDeformation, SurfaceAnchor } from '../core/geometry3.js';
import type { SemanticSurfaceSpec } from '../materials/surface.js';
import type { AssetCapabilities } from './asset-capabilities.js';
import type { AssetBlueprintHeader } from './asset-envelope.js';
import type { AssetSemanticManifest } from './asset-semantics.js';

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

export type Quaternion = readonly [x: number, y: number, z: number, w: number];

export type Pose3 = Readonly<{
  position: Point3;
  rotation: Quaternion;
}>;

export type SolidNodeDefinition = Readonly<{
  id: string;
  parentNode?: string;
  restPose: Pose3;
  /** Optional authored scale used for fitted mounts and reusable equipment. */
  restScale?: Point3;
}>;

export type SolidPlacement = Readonly<{
  position: Point3;
  surface?: SurfaceAnchor;
  /** Local Euler rotation applied after surface alignment, in XYZ order. */
  rotation?: Point3;
}>;

export type SolidPartDefinition = Readonly<{
  id: string;
  semanticPartId: string;
  node: string;
  order: number;
  geometry: SolidGeometrySpec;
  surfaceId: string;
  placement: SolidPlacement;
  capabilities?: AssetCapabilities;
  visible?: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
}>;

type SolidColliderHeader = Readonly<{
  id: string;
  kind: 'solid' | 'sensor';
  node: string;
  localPose: Pose3;
}>;

export type BoxCollider3 = SolidColliderHeader & Readonly<{
  shape: 'box';
  size: Point3;
}>;

export type SphereCollider3 = SolidColliderHeader & Readonly<{
  shape: 'sphere';
  radius: number;
}>;

export type CapsuleCollider3 = SolidColliderHeader & Readonly<{
  shape: 'capsule';
  radius: number;
  length: number;
  axis: 'x' | 'y' | 'z';
}>;

export type SolidColliderDefinition = BoxCollider3 | SphereCollider3 | CapsuleCollider3;

export type SolidSocketDefinition = Readonly<{
  id: string;
  node: string;
  localPose: Pose3;
}>;

/** Column-major affine matrix matching Three.js Matrix4 element order. */
export type AffineTransform3 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export type ColliderShape3 = Readonly<{
  definition: SolidColliderDefinition;
  worldTransform: AffineTransform3;
}>;

export type SolidNodeState = Readonly<{
  translation?: Point3;
  rotation?: Point3;
  scale?: Point3;
}>;

export type SolidInteractionNodeBinding = Readonly<{
  nodeId: string;
  stateByInteractionState: Readonly<Record<string, SolidNodeState>>;
}>;

export type SolidInteractionBinding = Readonly<{
  interactionId: string;
  nodes: readonly SolidInteractionNodeBinding[];
}>;

export type SolidContainmentPartVariant = Readonly<{
  sourcePartId: string;
  /** Omitted when the source lies completely outside the containment volume. */
  containedPartId?: string;
}>;

/**
 * A precompiled geometry swap used when an equipped container constrains
 * selected host parts. Both variants remain in the immutable blueprint;
 * runtime state only selects which one is visible.
 */
export type SolidContainmentDefinition = Readonly<{
  id: string;
  variants: readonly SolidContainmentPartVariant[];
}>;

export type SolidAssetBlueprint<TFamily extends string = string> = AssetBlueprintHeader<
  TFamily,
  'solid'
> & Readonly<{
  bounds: Bounds3;
  manifest: AssetSemanticManifest<TFamily>;
  nodes: readonly SolidNodeDefinition[];
  parts: readonly SolidPartDefinition[];
  surfaces: readonly SemanticSurfaceSpec[];
  colliders: readonly SolidColliderDefinition[];
  sockets: readonly SolidSocketDefinition[];
  interactionBindings: readonly SolidInteractionBinding[];
  containments?: readonly SolidContainmentDefinition[];
}>;
