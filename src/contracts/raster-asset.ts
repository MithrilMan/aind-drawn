import type { Bounds, Point } from '../core/geometry.js';
import type { Sketch } from '../core/sketch.js';
import type { MediumId } from '../materials/medium.js';
import type { AssetCapabilities } from './asset-capabilities.js';
import type { AssetBlueprintHeader } from './asset-envelope.js';

export type Vector2 = Readonly<{ x: number; y: number }>;
export type Size2 = Readonly<{ width: number; height: number }>;
export type Pivot = readonly [x: number, y: number];

export type Pose2 = Readonly<{
  position: Vector2;
  rotation: number;
}>;

export type RasterBoneDefinition = Readonly<{
  id: string;
  parentBone?: string;
  restPose: Pose2;
}>;

type RasterColliderHeader = Readonly<{
  id: string;
  kind: 'solid' | 'sensor';
  bone: string;
  localPose: Pose2;
}>;

export type RectangleCollider = RasterColliderHeader & Readonly<{
  shape: 'rectangle';
  size: Size2;
}>;

export type CircleCollider = RasterColliderHeader & Readonly<{
  shape: 'circle';
  radius: number;
}>;

export type CapsuleCollider = RasterColliderHeader & Readonly<{
  shape: 'capsule';
  radius: number;
  length: number;
  axis: 'x' | 'y';
}>;

export type PolygonCollider = RasterColliderHeader & Readonly<{
  shape: 'polygon';
  points: readonly Point[];
}>;

export type RasterColliderDefinition =
  | RectangleCollider
  | CircleCollider
  | CapsuleCollider
  | PolygonCollider;

export type RasterSocketDefinition = Readonly<{
  id: string;
  bone: string;
  localPose: Pose2;
}>;

/** Column-major affine matrix matching Three.js Matrix3 element order. */
export type AffineTransform2 = readonly [
  m11: number, m12: number, m13: number,
  m21: number, m22: number, m23: number,
  m31: number, m32: number, m33: number,
];

export type ColliderShape2 = Readonly<{
  definition: RasterColliderDefinition;
  worldTransform: AffineTransform2;
}>;

export type LayerDrawContext = Readonly<{
  sketch: Sketch;
  state: string;
  frame: number;
}>;

export type LayerDefinition = Readonly<{
  id: string;
  bone: string;
  parentBone?: string;
  order: number;
  depth: number;
  canvas: Size2;
  world: Size2;
  pivot: Pivot;
  states: readonly string[];
  capabilities?: AssetCapabilities;
  draw: (context: LayerDrawContext) => void;
}>;

export type InteractionLayerBinding = Readonly<{
  layerId: string;
  stateByInteractionState: Readonly<Record<string, string>>;
}>;

/**
 * Declarative bridge between an asset's visual states and a game runtime.
 * Sensors describe where interaction is possible, sockets describe where an
 * actor should stand or be transferred, and bindings keep rendering generic.
 */
export type InteractionDefinition = Readonly<{
  id: string;
  kind: 'toggle' | 'portal';
  sensorColliderId: string;
  activationSocketId: string;
  initialState: string;
  states: readonly string[];
  layerBindings: readonly InteractionLayerBinding[];
}>;

export type AssetBlueprint<TFamily extends string = string> = AssetBlueprintHeader<
  TFamily,
  'raster'
> & Readonly<{
  medium: MediumId;
  bounds: Bounds;
  bones: readonly RasterBoneDefinition[];
  layers: readonly LayerDefinition[];
  colliders: readonly RasterColliderDefinition[];
  sockets: readonly RasterSocketDefinition[];
  interactions: readonly InteractionDefinition[];
}>;
