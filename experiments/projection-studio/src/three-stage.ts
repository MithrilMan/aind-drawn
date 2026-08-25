import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import {
  InkedSolidScenePass,
  SolidRig,
  SolidSurfaceResourceCache,
  createInkedSolidBlueprint,
  inkedSolidMediumDefaults,
  type InkedSolidStrokeDefinition,
  type InkedSolidSceneRegistration,
  type MediumId,
  type SolidAssetBlueprint,
  type SceneDirectionRecipe,
} from '../../../src/index.js';
import type {
  FamilyIdentity,
  FamilyDynamicState,
  StudioRuntimeAdapter,
  StudioSolidRuntimeFactory,
} from './family-catalog.js';

const MINIMUM_PITCH = -38;
const MAXIMUM_PITCH = 28;
const POINTER_YAW_SCALE = 0.34;
const POINTER_PITCH_SCALE = 0.24;
const TURNTABLE_DEGREES_PER_SECOND = 18;

type ViewChangeHandler = (yaw: number, pitch: number) => void;

export type ThreeRenderMode = 'doodle' | 'solid';

export class ThreeStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  private readonly environmentMap: THREE.Texture;
  private readonly surfaceCache: SolidSurfaceResourceCache;
  private readonly hemisphere = new THREE.HemisphereLight(0xfff4df, 0x475249, 1.8);
  private readonly keyLight = this.directionalLight(0xffddbc, 3.2, [4.5, 7, 6]);
  private readonly fillLight = this.directionalLight(0xb7cbd2, 1.35, [-5, 3, 2]);
  private readonly rimLight = this.directionalLight(0xf5d9b5, 1.1, [1, 4, -5]);
  private readonly groundMaterial = new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0 });
  private readonly ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    this.groundMaterial,
  );
  private readonly canvas: HTMLCanvasElement;
  private readonly viewport: HTMLElement;
  private readonly observer: ResizeObserver;
  private readonly onViewChange: ViewChangeHandler;
  private rig: SolidRig | null = null;
  private pass: InkedSolidScenePass | null = null;
  private inkRegistration: InkedSolidSceneRegistration | null = null;
  private runtime: StudioRuntimeAdapter | null = null;
  private solid: SolidAssetBlueprint | null = null;
  private strokes: readonly InkedSolidStrokeDefinition[] = [];
  private medium: MediumId = 'graphite';
  private lineBoil = true;
  private pointerId: number | null = null;
  private previousX = 0;
  private previousY = 0;
  private yaw = 28;
  private pitch = -4;
  private turntable = false;
  private renderMode: ThreeRenderMode = 'doodle';
  private solidFrameScale = 0.62;
  private strokeRevealElapsed = 2;
  private sceneDirection: SceneDirectionRecipe | null = null;

  public constructor(
    canvas: HTMLCanvasElement,
    viewport: HTMLElement,
    onViewChange: ViewChangeHandler,
  ) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.onViewChange = onViewChange;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const environment = new RoomEnvironment();
    const environmentGenerator = new THREE.PMREMGenerator(this.renderer);
    this.environmentMap = environmentGenerator.fromScene(environment, 0.04).texture;
    this.surfaceCache = new SolidSurfaceResourceCache({ environmentMap: this.environmentMap });
    environment.dispose();
    environmentGenerator.dispose();
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.hemisphere, this.keyLight, this.fillLight, this.rimLight, this.ground);
    this.camera.position.set(0, 1, 8);
    this.applyRenderMode();
    this.observer = new ResizeObserver(() => {
      this.resize();
    });
    this.observer.observe(viewport);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('keydown', this.handleKeyDown);
  }

  public setProjection(
    solid: SolidAssetBlueprint,
    strokes: readonly InkedSolidStrokeDefinition[],
    medium: MediumId,
    identity: FamilyIdentity,
    createRuntime: StudioSolidRuntimeFactory,
    solidFrameScale: number,
    autoGaze: boolean,
  ): void {
    this.inkRegistration?.dispose();
    this.rig?.root.removeFromParent();
    this.rig?.dispose();
    this.solid = solid;
    this.strokes = strokes;
    this.medium = medium;
    this.solidFrameScale = solidFrameScale;
    this.sceneDirection = solid.appearance.artDirection.scene;
    this.applySceneDirection(this.sceneDirection);
    this.ground.position.set(
      (solid.bounds.minimum[0] + solid.bounds.maximum[0]) * 0.5,
      solid.bounds.minimum[1] - 0.025,
      (solid.bounds.minimum[2] + solid.bounds.maximum[2]) * 0.5,
    );
    this.rig = new SolidRig(solid, { surfaceCache: this.surfaceCache });
    this.runtime = createRuntime(this.rig, identity, { autoGaze });
    this.applyView();
    this.scene.add(this.rig.root);
    this.rebuildInk();
    this.frame();
  }

  public setInteractionState(id: string, state: string): void {
    if (this.rig?.interactionIds.includes(id) === true) this.rig.setInteractionState(id, state);
  }

  public setLineBoil(enabled: boolean): void {
    if (enabled === this.lineBoil) return;
    this.lineBoil = enabled;
    this.rebuildInk();
  }

  public setView(yaw: number, pitch = this.pitch): void {
    this.yaw = THREE.MathUtils.euclideanModulo(yaw + 180, 360) - 180;
    this.pitch = THREE.MathUtils.clamp(pitch, MINIMUM_PITCH, MAXIMUM_PITCH);
    this.applyView();
    this.onViewChange(this.yaw, this.pitch);
  }

  public setTurntable(enabled: boolean): void {
    this.turntable = enabled;
  }

  public setRenderMode(mode: ThreeRenderMode): void {
    if (mode === this.renderMode) return;
    this.renderMode = mode;
    this.applyRenderMode();
  }

  public update(
    deltaSeconds: number,
    dynamicState: FamilyDynamicState,
    speed: number,
    elapsedSeconds: number,
  ): void {
    if (this.turntable) this.setView(this.yaw + TURNTABLE_DEGREES_PER_SECOND * deltaSeconds);
    this.runtime?.update({ deltaSeconds, elapsedSeconds, dynamicState, speed });
    if (this.renderMode === 'doodle') {
      this.strokeRevealElapsed = Math.min(1.6, this.strokeRevealElapsed + deltaSeconds);
      this.inkRegistration?.setStrokeReveal(this.strokeRevealElapsed / 1.6);
      this.pass?.render(this.scene, this.camera, elapsedSeconds);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('keydown', this.handleKeyDown);
    this.inkRegistration?.dispose();
    this.pass?.dispose();
    this.rig?.dispose();
    this.surfaceCache.dispose();
    this.ground.geometry.dispose();
    this.groundMaterial.dispose();
    this.environmentMap.dispose();
    this.renderer.dispose();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerId = event.pointerId;
    this.previousX = event.clientX;
    this.previousY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const yaw = this.yaw + (event.clientX - this.previousX) * POINTER_YAW_SCALE;
    const pitch = this.pitch + (event.clientY - this.previousY) * POINTER_PITCH_SCALE;
    this.previousX = event.clientX;
    this.previousY = event.clientY;
    this.setView(yaw, pitch);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const amount = event.shiftKey ? 10 : 3;
    if (event.key === 'ArrowLeft') this.setView(this.yaw - amount);
    else if (event.key === 'ArrowRight') this.setView(this.yaw + amount);
    else if (event.key === 'ArrowUp') this.setView(this.yaw, this.pitch - amount);
    else if (event.key === 'ArrowDown') this.setView(this.yaw, this.pitch + amount);
    else return;
    event.preventDefault();
  };

  private rebuildInk(): void {
    if (this.solid === null || this.rig === null) return;
    const defaults = inkedSolidMediumDefaults(this.medium);
    const blueprint = createInkedSolidBlueprint(this.solid, {
      medium: this.medium,
      contour: {
        jitter: this.lineBoil ? defaults.contour.jitter : 0,
        boilFramesPerSecond: this.lineBoil ? defaults.contour.boilFramesPerSecond : 0,
      },
      strokes: this.strokes,
    });
    this.inkRegistration?.dispose();
    this.pass?.dispose();
    this.pass = new InkedSolidScenePass(this.renderer, { paper: blueprint.paper });
    this.inkRegistration = this.pass.register({
      instanceId: this.rig.instanceId,
      blueprint,
      rig: this.rig,
    });
    this.strokeRevealElapsed = 0;
    this.inkRegistration.setStrokeReveal(0);
    this.resize();
  }

  private applyRenderMode(): void {
    const solid = this.renderMode === 'solid';
    this.renderer.toneMapping = solid
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = solid ? 1.08 : 1;
    this.ground.visible = solid;
    if (this.sceneDirection !== null) {
      const background = solid ? this.sceneDirection.backdrop : this.sceneDirection.paper;
      this.scene.background = new THREE.Color(
        background[0] / 255,
        background[1] / 255,
        background[2] / 255,
      );
    }
  }

  private applySceneDirection(direction: SceneDirectionRecipe): void {
    const color = (value: readonly [number, number, number]): THREE.Color => (
      new THREE.Color(value[0] / 255, value[1] / 255, value[2] / 255).convertSRGBToLinear()
    );
    this.keyLight.color.copy(color(direction.lighting.key));
    this.keyLight.intensity = direction.lighting.keyIntensity;
    this.fillLight.color.copy(color(direction.lighting.fill));
    this.fillLight.intensity = direction.lighting.fillIntensity;
    this.rimLight.intensity = direction.lighting.fillIntensity * 0.72;
    this.groundMaterial.color.copy(color(direction.ground));
    this.groundMaterial.needsUpdate = true;
    this.applyRenderMode();
  }

  private directionalLight(
    color: THREE.ColorRepresentation,
    intensity: number,
    position: readonly [number, number, number],
  ): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position);
    return light;
  }

  private applyView(): void {
    this.rig?.root.rotation.set(
      THREE.MathUtils.degToRad(this.pitch),
      THREE.MathUtils.degToRad(this.yaw),
      0,
    );
  }

  private resize(): void {
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    this.renderer.setSize(width, height, false);
    this.pass?.setSize(width, height, this.renderer.getPixelRatio());
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  private frame(): void {
    const bounds = this.solid?.bounds;
    if (bounds === undefined) return;
    const width = bounds.maximum[0] - bounds.minimum[0];
    const height = bounds.maximum[1] - bounds.minimum[1];
    const depth = bounds.maximum[2] - bounds.minimum[2];
    const centerX = (bounds.minimum[0] + bounds.maximum[0]) / 2;
    const centerY = (bounds.minimum[1] + bounds.maximum[1]) / 2;
    const verticalDistance = height * this.solidFrameScale
      / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const horizontalDistance = width * this.solidFrameScale
      / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
      / Math.max(0.5, this.camera.aspect);
    const distance = Math.max(verticalDistance, horizontalDistance, depth * 2.4, 2.5);
    this.camera.position.set(centerX, centerY + height * 0.02, distance);
    this.camera.lookAt(centerX, centerY, 0);
  }
}
