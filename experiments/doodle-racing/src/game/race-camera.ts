import * as THREE from 'three';

import type { CourseLayout } from './course.js';
import type { RaceSnapshot } from './race-model.js';
import type { RaceWorldLayout } from './race-world.js';

export type RaceCameraMode = 'follow' | 'full';

export class RaceCameraController {
  private readonly target = new THREE.Vector3();
  private viewSize = 18;
  private mode: RaceCameraMode = 'follow';

  public constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly course: CourseLayout,
    private readonly world: RaceWorldLayout,
    private readonly viewportSize: () => Readonly<{ width: number; height: number }>,
  ) {}

  public setMode(mode: RaceCameraMode): void {
    this.mode = mode;
  }

  public update(snapshot: RaceSnapshot, deltaSeconds: number, elapsedSeconds: number): void {
    const player = snapshot.racers.find(({ isPlayer }) => isPlayer);
    if (player === undefined) return;
    if (snapshot.introProgress < 1) {
      this.updateIntro(snapshot);
      return;
    }
    if (snapshot.phase === 'finished') {
      this.updateFinish(snapshot);
      return;
    }
    const fullCourse = this.mode === 'full';
    const speedRatio = THREE.MathUtils.clamp(player.speed / 29, 0, 1);
    const velocityLead = player.speed * 0.085;
    const desiredTarget = fullCourse
      ? new THREE.Vector3(
        (this.course.bounds.minimumX + this.course.bounds.maximumX) * 0.5,
        0,
        (this.course.bounds.minimumZ + this.course.bounds.maximumZ) * 0.5,
      )
      : new THREE.Vector3(
        player.x + Math.cos(player.heading) * velocityLead,
        0.25,
        player.z - Math.sin(player.heading) * velocityLead,
      );
    this.target.lerp(desiredTarget, fullCourse ? 1 : 1 - Math.exp(-7.2 * deltaSeconds));
    this.viewSize = fullCourse
      ? this.fullCourseViewSize()
      : THREE.MathUtils.lerp(this.viewSize, 16.5 + speedRatio * 6.2, 1 - Math.exp(-4 * deltaSeconds));

    const shake = fullCourse ? 0 : snapshot.impact * 0.6;
    const shakeX = Math.sin(elapsedSeconds * 47) * shake;
    const shakeZ = Math.cos(elapsedSeconds * 53) * shake;
    const offset = fullCourse
      ? new THREE.Vector3(-31, 44, 36)
      : new THREE.Vector3(-10.8 + shakeX, 17.5, 13.6 + shakeZ);
    this.camera.position.copy(this.target).add(offset);
    this.orientCamera(0);
    this.updateProjection();
  }

  private updateIntro(snapshot: RaceSnapshot): void {
    const player = snapshot.racers.find(({ isPlayer }) => isPlayer);
    if (player === undefined) return;
    const progress = THREE.MathUtils.clamp(snapshot.introProgress, 0, 1);
    const sweep = THREE.MathUtils.smoothstep(progress, 0, 0.7);
    const exit = THREE.MathUtils.smoothstep(progress, 0.7, 1);
    const stand = this.world.grandstand;
    const along = new THREE.Vector3(Math.cos(stand.heading), 0, -Math.sin(stand.heading));
    const front = new THREE.Vector3(Math.sin(stand.heading), 0, Math.cos(stand.heading));
    const standTarget = new THREE.Vector3(stand.x, 1.36, stand.z)
      .addScaledVector(along, THREE.MathUtils.lerp(-stand.length * 0.42, stand.length * 0.42, sweep))
      .addScaledVector(front, 0.3);
    const standCamera = standTarget.clone()
      .addScaledVector(front, 3.25)
      .addScaledVector(along, -0.55)
      .add(new THREE.Vector3(0, 1.48 + Math.sin(progress * Math.PI) * 0.28, 0));
    const followTarget = new THREE.Vector3(player.x, 0.25, player.z);
    const followCamera = followTarget.clone().add(new THREE.Vector3(-10.8, 17.5, 13.6));
    this.target.copy(standTarget).lerp(followTarget, exit);
    this.camera.position.copy(standCamera).lerp(followCamera, exit);
    this.viewSize = THREE.MathUtils.lerp(4.9, 16.5, exit);
    this.orientCamera(Math.sin(progress * Math.PI * 2) * 0.055 * (1 - exit));
    this.updateProjection();
  }

  private updateFinish(snapshot: RaceSnapshot): void {
    const player = snapshot.racers.find(({ isPlayer }) => isPlayer);
    if (player === undefined) return;
    const progress = THREE.MathUtils.clamp(snapshot.finishCinematicProgress, 0, 1);
    const arrival = THREE.MathUtils.smoothstep(progress, 0, 0.2);
    const sweep = THREE.MathUtils.smoothstep(progress, 0.08, 0.74);
    const pullBack = THREE.MathUtils.smoothstep(progress, 0.72, 1);
    const stand = this.world.grandstand;
    const along = new THREE.Vector3(Math.cos(stand.heading), 0, -Math.sin(stand.heading));
    const front = new THREE.Vector3(Math.sin(stand.heading), 0, Math.cos(stand.heading));

    const closeTarget = new THREE.Vector3(stand.x, 1.38, stand.z)
      .addScaledVector(along, THREE.MathUtils.lerp(-stand.length * 0.45, stand.length * 0.34, sweep))
      .addScaledVector(front, 0.28);
    const closeCamera = closeTarget.clone()
      .addScaledVector(front, 3.05)
      .addScaledVector(along, -0.5)
      .add(new THREE.Vector3(0, 1.55 + Math.sin(sweep * Math.PI) * 0.3, 0));
    const wideTarget = new THREE.Vector3(stand.x, 1.35, stand.z);
    const wideCamera = wideTarget.clone()
      .addScaledVector(front, 9.5)
      .addScaledVector(along, 2.2)
      .add(new THREE.Vector3(0, 7.2, 0));
    const crowdTarget = closeTarget.clone().lerp(wideTarget, pullBack);
    const crowdCamera = closeCamera.clone().lerp(wideCamera, pullBack);

    const speedRatio = THREE.MathUtils.clamp(player.speed / 31, 0, 1);
    const startTarget = new THREE.Vector3(player.x, 0.25, player.z);
    const startCamera = startTarget.clone().add(new THREE.Vector3(-10.8, 17.5, 13.6));
    this.target.copy(startTarget).lerp(crowdTarget, arrival);
    this.camera.position.copy(startCamera).lerp(crowdCamera, arrival);
    const closeView = THREE.MathUtils.lerp(16.5 + speedRatio * 6.2, 4.8, arrival);
    this.viewSize = THREE.MathUtils.lerp(closeView, 13.8, pullBack);
    const roll = Math.sin(progress * Math.PI * 2.5) * 0.08 * arrival * (1 - pullBack);
    this.orientCamera(roll);
    this.updateProjection();
  }

  private orientCamera(roll: number): void {
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    if (roll !== 0) this.camera.rotateZ(roll);
  }

  public updateProjection(): void {
    const { width, height } = this.viewportSize();
    const aspect = width / height;
    this.camera.left = -this.viewSize * aspect * 0.5;
    this.camera.right = this.viewSize * aspect * 0.5;
    this.camera.top = this.viewSize * 0.5;
    this.camera.bottom = -this.viewSize * 0.5;
    this.camera.updateProjectionMatrix();
  }

  private fullCourseViewSize(): number {
    const width = this.course.bounds.maximumX - this.course.bounds.minimumX;
    const depth = this.course.bounds.maximumZ - this.course.bounds.minimumZ;
    const viewport = this.viewportSize();
    const aspect = Math.max(0.4, viewport.width / viewport.height);
    return Math.max(depth, width / aspect) * 1.05;
  }
}
