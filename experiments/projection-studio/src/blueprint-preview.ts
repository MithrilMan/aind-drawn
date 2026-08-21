import * as THREE from 'three';

import {
  SpriteRig,
  type AssetBlueprint,
  type Bounds,
  type LayerDefinition,
  type Vector2,
} from '../../../src/index.js';

export type BlueprintPreviewOptions = Readonly<{
  interactionStates?: Readonly<Record<string, string>>;
  layerStates?: Readonly<Record<string, string>>;
  layerIds?: readonly string[];
}>;

type BoneDefinition = Readonly<{
  position: Vector2;
  parentBone: string | null;
  layer: LayerDefinition;
}>;

const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 132;
const FRAME_PADDING = 1.18;

function boneDefinitions(blueprint: AssetBlueprint): ReadonlyMap<string, BoneDefinition> {
  const definitions = new Map<string, BoneDefinition>();
  for (const layer of blueprint.layers) {
    if (definitions.has(layer.bone)) continue;
    definitions.set(layer.bone, Object.freeze({
      position: layer.position,
      parentBone: layer.parentBone ?? null,
      layer,
    }));
  }
  return definitions;
}

function boneWorldPosition(
  bone: string,
  definitions: ReadonlyMap<string, BoneDefinition>,
  cache: Map<string, Vector2>,
  ancestry: ReadonlySet<string> = new Set(),
): Vector2 {
  const existing = cache.get(bone);
  if (existing !== undefined) return existing;
  const definition = definitions.get(bone);
  if (definition === undefined) throw new Error(`Missing preview bone definition: ${bone}`);
  if (ancestry.has(bone)) throw new Error(`Preview bone hierarchy contains a cycle at ${bone}`);
  const parent = definition.parentBone === null
    ? Object.freeze({ x: 0, y: 0 })
    : boneWorldPosition(
      definition.parentBone,
      definitions,
      cache,
      new Set([...ancestry, bone]),
    );
  const result = Object.freeze({
    x: parent.x + definition.position.x,
    y: parent.y + definition.position.y,
  });
  cache.set(bone, result);
  return result;
}

function selectedBounds(blueprint: AssetBlueprint, layerIds: readonly string[]): Bounds {
  const selected = new Set(layerIds);
  const layers = blueprint.layers.filter(({ id }) => selected.has(id));
  if (layers.length === 0) return blueprint.bounds;
  const definitions = boneDefinitions(blueprint);
  const cache = new Map<string, Vector2>();
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;

  for (const layer of layers) {
    const origin = boneWorldPosition(layer.bone, definitions, cache);
    const left = origin.x - layer.pivot[0] * layer.world.width;
    const bottom = origin.y - layer.pivot[1] * layer.world.height;
    minimumX = Math.min(minimumX, left);
    minimumY = Math.min(minimumY, bottom);
    maximumX = Math.max(maximumX, left + layer.world.width);
    maximumY = Math.max(maximumY, bottom + layer.world.height);
  }

  return Object.freeze({
    x: minimumX,
    y: minimumY,
    width: Math.max(0.08, maximumX - minimumX),
    height: Math.max(0.08, maximumY - minimumY),
  });
}

function anchorLayer(layer: LayerDefinition): LayerDefinition {
  return Object.freeze({
    ...layer,
    id: `preview-anchor:${layer.bone}`,
    canvas: Object.freeze({ width: 1, height: 1 }),
    world: Object.freeze({ width: 0.001, height: 0.001 }),
    states: Object.freeze(['idle']),
    draw: (): void => undefined,
  });
}

function filteredBlueprint(
  blueprint: AssetBlueprint,
  layerIds: readonly string[] | undefined,
): AssetBlueprint {
  if (layerIds === undefined) return blueprint;
  const selectedIds = new Set(layerIds);
  const selectedLayers = blueprint.layers.filter(({ id }) => selectedIds.has(id));
  const definitions = boneDefinitions(blueprint);
  const includedBones = new Set(selectedLayers.map(({ bone }) => bone));
  const anchors = new Map<string, LayerDefinition>();

  const includeAncestors = (bone: string): void => {
    const definition = definitions.get(bone);
    const parentBone = definition?.parentBone;
    if (parentBone === null || parentBone === undefined || includedBones.has(parentBone)) return;
    const parent = definitions.get(parentBone);
    if (parent === undefined) throw new Error(`Missing preview parent bone: ${parentBone}`);
    includedBones.add(parentBone);
    anchors.set(parentBone, anchorLayer(parent.layer));
    includeAncestors(parentBone);
  };
  for (const layer of selectedLayers) includeAncestors(layer.bone);

  const layers = Object.freeze([...anchors.values(), ...selectedLayers]);
  const interactions = Object.freeze(blueprint.interactions.filter(({ layerBindings }) => (
    layerBindings.every(({ layerId }) => selectedIds.has(layerId))
  )));
  return Object.freeze({ ...blueprint, layers, interactions });
}

/** Renders focused selector previews through the same public raster pipeline as the live asset. */
export class BlueprintPreviewRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly width: number;
  private readonly height: number;

  public constructor(width = PREVIEW_WIDTH, height = PREVIEW_HEIGHT) {
    this.width = width;
    this.height = height;
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(width, height, false);
    this.camera.position.z = 20;
  }

  public render(blueprint: AssetBlueprint, options: BlueprintPreviewOptions = {}): string {
    const renderBlueprint = filteredBlueprint(blueprint, options.layerIds);
    const rig = new SpriteRig(renderBlueprint, {
      boilFrames: 1,
      drawRank: 0,
      textureAnisotropy: 1,
    });
    for (const [interactionId, state] of Object.entries(options.interactionStates ?? {})) {
      if (rig.interactionIds.includes(interactionId)) rig.setInteractionState(interactionId, state);
    }
    for (const [layerId, state] of Object.entries(options.layerStates ?? {})) {
      if (rig.layerIds.includes(layerId)) rig.setLayerState(layerId, state);
    }

    const bounds = options.layerIds === undefined
      ? blueprint.bounds
      : selectedBounds(blueprint, options.layerIds);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    rig.root.position.set(-centerX, -centerY, 0);
    this.scene.add(rig.root);

    const aspect = this.width / this.height;
    const viewHeight = Math.max(
      bounds.height * FRAME_PADDING,
      bounds.width * FRAME_PADDING / aspect,
      0.1,
    );
    this.camera.left = -viewHeight * aspect / 2;
    this.camera.right = viewHeight * aspect / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const result = this.renderer.domElement.toDataURL('image/png');

    this.scene.remove(rig.root);
    rig.dispose();
    return result;
  }

  public dispose(): void {
    this.renderer.dispose();
  }
}
