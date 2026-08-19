import * as THREE from 'three';

import { CharacterAnimator, SpriteRig, type AssetBlueprint } from '../../../src/index.js';
import { createObjectBlueprint } from './catalog.js';
import type { SceneObjectData } from './document.js';

export class SceneObjectView {
  public readonly container = new THREE.Group();
  public data: SceneObjectData;
  public blueprint: AssetBlueprint;

  private rig: SpriteRig;
  private animator: CharacterAnimator | null;
  private drawRank: number;

  public constructor(data: SceneObjectData, drawRank: number) {
    this.data = data;
    this.drawRank = drawRank;
    this.blueprint = createObjectBlueprint(data);
    this.rig = this.createRig();
    this.animator = this.createAnimator();
    this.container.name = `object:${data.id}`;
    this.container.add(this.rig.root);
    this.applyTransform();
  }

  public setDrawRank(drawRank: number): void {
    this.drawRank = drawRank;
    this.rig.setDrawRank(drawRank);
  }

  public applyTransform(): void {
    const bounds = this.blueprint.bounds;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    this.rig.root.position.set(-centerX, -centerY, 0);
    this.container.position.set(this.data.x, this.data.y, 0);
    this.container.rotation.z = this.data.rotation;
    this.container.scale.set(
      this.data.width / Math.max(bounds.width, 1e-6),
      this.data.height / Math.max(bounds.height, 1e-6),
      1,
    );
  }

  public rebuild(): void {
    const previous = this.rig;
    this.container.remove(previous.root);
    this.blueprint = createObjectBlueprint(this.data);
    this.rig = this.createRig();
    this.animator = this.createAnimator();
    this.container.add(this.rig.root);
    previous.dispose();
    this.applyTransform();
  }

  public update(elapsedSeconds: number, deltaSeconds: number): void {
    if (this.animator === null) {
      this.rig.updateBoil(elapsedSeconds);
    } else {
      this.animator.update(deltaSeconds);
    }
  }

  public contains(worldX: number, worldY: number): boolean {
    const cosine = Math.cos(-this.data.rotation);
    const sine = Math.sin(-this.data.rotation);
    const deltaX = worldX - this.data.x;
    const deltaY = worldY - this.data.y;
    const localX = deltaX * cosine - deltaY * sine;
    const localY = deltaX * sine + deltaY * cosine;
    return Math.abs(localX) <= this.data.width / 2
      && Math.abs(localY) <= this.data.height / 2;
  }

  public dispose(): void {
    this.container.removeFromParent();
    this.rig.dispose();
  }

  private createRig(): SpriteRig {
    const rig = new SpriteRig(this.blueprint, { boilFrames: 2, drawRank: this.drawRank });
    if (this.data.kind === 'building' && this.data.building !== null) {
      rig.setInteractionState('door', this.data.building.doorState);
    }
    return rig;
  }

  private createAnimator(): CharacterAnimator | null {
    return this.blueprint.kind === 'character' ? new CharacterAnimator(this.rig) : null;
  }
}
