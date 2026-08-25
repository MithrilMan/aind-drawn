import * as THREE from 'three';

import {
  InkedSolidScenePass,
  SolidRig,
  applySolidCharacterMotion,
  applySolidVehicleMotion,
  createInkedSolidBlueprint,
  type InkedSolidSceneRegistration,
  type CharacterMotionSample,
  type VehicleMotionSample,
} from '../../../src/index.js';
import type { SpecimenProjection } from './specimen-projection.js';

export class DoodleSpecimenStage {
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly scene = new THREE.Scene();
  private family: SpecimenProjection['family'] = 'character';
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private framingRadius = 1;
  private readonly framingCenter = new THREE.Vector3();
  private pass: InkedSolidScenePass | null = null;
  private registration: InkedSolidSceneRegistration | null = null;
  private rig: SolidRig | null = null;

  public constructor(canvas: HTMLCanvasElement, private readonly viewport: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      canvas,
      powerPreference: 'low-power',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0xf5ecd8, 1);
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(viewport);
  }

  public setProjection(projection: SpecimenProjection): void {
    this.releaseProjection();
    this.family = projection.family;
    const inked = createInkedSolidBlueprint(projection.solid, {
      medium: projection.medium,
      strokes: projection.strokes,
    });
    this.rig = new SolidRig(projection.solid);
    this.scene.add(this.rig.root);
    this.pass = new InkedSolidScenePass(this.renderer, { paper: inked.paper });
    this.registration = this.pass.register({
      instanceId: this.rig.instanceId,
      blueprint: inked,
      rig: this.rig,
    });
    this.resize();
  }

  public render(elapsedSeconds: number): void {
    this.updateOrbit(elapsedSeconds);
    this.pass?.render(this.scene, this.camera, elapsedSeconds);
  }

  public applyCharacterMotion(sample: CharacterMotionSample): void {
    if (this.rig?.blueprint.family === 'character') {
      applySolidCharacterMotion(this.rig, sample);
    }
  }

  public applyVehicleMotion(sample: VehicleMotionSample): void {
    if (this.rig?.blueprint.family === 'vehicle') {
      applySolidVehicleMotion(this.rig, sample);
    }
  }

  public setInteractionStates(states: Readonly<Record<string, string>>): void {
    if (this.rig === null) return;
    for (const [id, state] of Object.entries(states)) {
      if (this.rig.interactionIds.includes(id)) this.rig.setInteractionState(id, state);
    }
  }

  public dispose(): void {
    this.resizeObserver.disconnect();
    this.releaseProjection();
    this.renderer.dispose();
  }

  private releaseProjection(): void {
    this.registration?.dispose();
    this.registration = null;
    this.pass?.dispose();
    this.pass = null;
    this.rig?.root.removeFromParent();
    this.rig?.dispose();
    this.rig = null;
  }

  private resize(): void {
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    const pixelRatio = this.renderer.getPixelRatio();
    this.renderer.setSize(width, height, false);
    this.pass?.setSize(width, height, pixelRatio);
    if (this.rig === null) return;

    this.rig.root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(this.rig.root);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    this.framingCenter.copy(sphere.center);
    this.framingRadius = Math.max(.1, sphere.radius);
    const aspect = width / height;
    const viewHeight = this.framingRadius * (this.family === 'character' ? 2.45 : 2.65);
    this.camera.left = -viewHeight * aspect / 2;
    this.camera.right = viewHeight * aspect / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.updateOrbit(0);
  }

  private updateOrbit(elapsedSeconds: number): void {
    if (this.rig === null) return;
    const phase = .54 + (this.reducedMotion ? 0 : elapsedSeconds * .24);
    const distance = this.framingRadius * 3.4;
    const elevation = this.family === 'character' ? .48 : .42;
    this.camera.position.set(
      this.framingCenter.x + Math.sin(phase) * distance,
      this.framingCenter.y + this.framingRadius * elevation,
      this.framingCenter.z + Math.cos(phase) * distance,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.framingCenter);
  }
}
