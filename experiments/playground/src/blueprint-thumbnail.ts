import * as THREE from 'three';

import { SpriteRig, type AssetBlueprint, type Bounds } from '../../../src/index.js';

export type BlueprintThumbnailOptions = Readonly<{
  interactionStates?: Readonly<Record<string, string>>;
  layerIds?: readonly string[];
  frameBounds?: Bounds;
}>;

export type BlueprintThumbnailRendererOptions = Readonly<{
  width?: number;
  height?: number;
}>;

const THUMBNAIL_WIDTH = 112;
const THUMBNAIL_HEIGHT = 76;
const FRAME_PADDING = 1.14;

/** Renders library blueprints into compact inspector previews with one shared WebGL context. */
export class BlueprintThumbnailRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly width: number;
  private readonly height: number;

  public constructor(options: BlueprintThumbnailRendererOptions = {}) {
    this.width = Math.max(32, Math.floor(options.width ?? THUMBNAIL_WIDTH));
    this.height = Math.max(32, Math.floor(options.height ?? THUMBNAIL_HEIGHT));
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.position.z = 20;
  }

  public render(blueprint: AssetBlueprint, options: BlueprintThumbnailOptions = {}): string {
    const renderBlueprint = this.filteredBlueprint(blueprint, options.layerIds);
    const rig = new SpriteRig(renderBlueprint, {
      boilFrames: 1,
      drawRank: 0,
      textureAnisotropy: 1,
    });
    for (const [interactionId, state] of Object.entries(options.interactionStates ?? {})) {
      if (rig.interactionIds.includes(interactionId)) rig.setInteractionState(interactionId, state);
    }

    const bounds = options.frameBounds ?? blueprint.bounds;
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

  private filteredBlueprint(
    blueprint: AssetBlueprint,
    layerIds: readonly string[] | undefined,
  ): AssetBlueprint {
    if (layerIds === undefined) return blueprint;
    const selected = new Set(layerIds);
    const layers = blueprint.layers.filter(({ id }) => selected.has(id));
    const interactions = blueprint.interactions.filter(({ layerBindings }) => (
      layerBindings.every(({ layerId }) => selected.has(layerId))
    ));
    return Object.freeze({
      ...blueprint,
      layers: Object.freeze(layers),
      interactions: Object.freeze(interactions),
    });
  }
}
