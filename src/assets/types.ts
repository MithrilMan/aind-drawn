import type { Bounds, Point } from '../core/geometry.js';
import type { Seed } from '../core/random.js';
import type { Sketch } from '../core/sketch.js';
import type { MediumId } from '../materials/medium.js';
import type { AssetCapabilities } from './capabilities.js';

export type Vector2 = Readonly<{ x: number; y: number }>;
export type Size2 = Readonly<{ width: number; height: number }>;
export type Pivot = readonly [x: number, y: number];

export type RectangleCollider = Readonly<{
  id: string;
  kind: 'solid' | 'sensor';
  shape: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type PolygonCollider = Readonly<{
  id: string;
  kind: 'solid' | 'sensor';
  shape: 'polygon';
  points: readonly Point[];
}>;

export type Collider = RectangleCollider | PolygonCollider;

export type SocketMap = Readonly<Record<string, Vector2>>;

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
  position: Vector2;
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

export type AssetBlueprint = Readonly<{
  id: string;
  kind: string;
  seed: Seed;
  medium: MediumId;
  bounds: Bounds;
  layers: readonly LayerDefinition[];
  colliders: readonly Collider[];
  sockets: SocketMap;
  interactions: readonly InteractionDefinition[];
}>;

export type RecipeHeader = Readonly<{
  version: 1;
  seed: number;
  medium: MediumId;
}>;
