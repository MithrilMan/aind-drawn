import * as THREE from 'three';

import type { CourseLayout } from './course.js';
import type { GrandstandExplorerSnapshot } from './grandstand-explorer.js';
import type { RaceSnapshot } from './race-model.js';
import { grandstandSurfaceAt, type RaceWorldLayout } from './race-world.js';

export type RaceCameraMode = 'follow' | 'full';

const EXPLORER_DEFAULT_PITCH = 0.52;
const EXPLORER_MIN_PITCH = 0.06;
const EXPLORER_MAX_PITCH = 1.16;
const EXPLORER_DEFAULT_DISTANCE = 7.4;
const EXPLORER_MIN_DISTANCE = 4.8;
const EXPLORER_MAX_DISTANCE = 12.4;
const EXPLORER_MOUSE_ROTATE_SENSITIVITY = 0.0055;
const EXPLORER_MOUSE_PITCH_SENSITIVITY = 0.0032;
const EXPLORER_TOUCH_ROTATE_SENSITIVITY = 0.011;
const EXPLORER_TOUCH_PITCH_SENSITIVITY = 0.006;
const EXPLORER_ZOOM_SENSITIVITY = 0.006;
const MENU_CHARACTER_SCREEN_OFFSET = 1.12;
const CINEMATIC_CLOSE_VIEW_SIZE = 7.2;
const EXPLORE_MINIMUM_VISIBLE_GROUND_Y = 0.04;
const EXPLORE_DRIVING_BASE_ZOOM_OUT = 2.8;
const EXPLORE_DRIVING_SPEED_ZOOM_OUT = 8.2;
const EXPLORE_DRIVING_REFERENCE_SPEED = 24;

export type GroundedOrthographicFraming = Readonly<{
  cameraY: number;
  cameraUpY: number;
  cameraForwardY: number;
  near: number;
  viewSize: number;
  minimumWorldY: number;
}>;

export function groundedOrthographicVerticalOffset(
  framing: GroundedOrthographicFraming,
): number {
  if (framing.cameraUpY <= 0.0001) return 0;
  const symmetricBottom = -framing.viewSize * 0.5;
  const requiredBottom = (
    framing.minimumWorldY
    - framing.cameraY
    - framing.cameraForwardY * framing.near
  ) / framing.cameraUpY;
  return Math.max(0, requiredBottom - symmetricBottom);
}

export function exploreDrivingViewSize(
  explorerDistance: number,
  drivingSpeed: number | null,
): number {
  const walkingViewSize = explorerDistance * 1.26;
  if (drivingSpeed === null) return walkingViewSize;
  const speedRatio = THREE.MathUtils.clamp(
    drivingSpeed / EXPLORE_DRIVING_REFERENCE_SPEED,
    0,
    1,
  );
  return walkingViewSize
    + EXPLORE_DRIVING_BASE_ZOOM_OUT
    + speedRatio * EXPLORE_DRIVING_SPEED_ZOOM_OUT;
}

type ExplorerPointer = {
  x: number;
  y: number;
};

export class RaceCameraController {
  private readonly target = new THREE.Vector3();
  private readonly explorerTarget = new THREE.Vector3();
  private readonly explorerDesiredPosition = new THREE.Vector3();
  private readonly cameraUpDirection = new THREE.Vector3();
  private readonly cameraForwardDirection = new THREE.Vector3();
  private viewSize = 18;
  private mode: RaceCameraMode = 'follow';
  private explorerYaw = 0;
  private explorerPitch = EXPLORER_DEFAULT_PITCH;
  private explorerDistance = EXPLORER_DEFAULT_DISTANCE;
  private explorerInitialized = false;
  private explorerActive = false;
  private menuInitialized = false;
  private menuActive = false;
  private readonly reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private explorerCanvas: HTMLCanvasElement | null = null;
  private readonly explorerPointers = new Map<number, ExplorerPointer>();
  private explorerPrimaryPointerId: number | null = null;
  private explorerPinchDistance = 0;
  private explorerDragging = false;

  private readonly handleExplorerPointerDown = (event: PointerEvent): void => {
    if (!this.explorerActive || (event.pointerType === 'mouse' && event.button !== 0)) return;

    this.explorerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.explorerPrimaryPointerId ??= event.pointerId;
    this.explorerPinchDistance = this.explorerPointerDistance();
    this.explorerDragging = true;
    this.explorerCanvas?.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly handleExplorerPointerMove = (event: PointerEvent): void => {
    if (!this.explorerActive) return;
    const pointer = this.explorerPointers.get(event.pointerId);
    if (pointer === undefined) return;

    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.explorerPointers.size === 1 && event.pointerId === this.explorerPrimaryPointerId) {
      const rotateSensitivity = event.pointerType === 'mouse'
        ? EXPLORER_MOUSE_ROTATE_SENSITIVITY
        : EXPLORER_TOUCH_ROTATE_SENSITIVITY;
      const pitchSensitivity = event.pointerType === 'mouse'
        ? EXPLORER_MOUSE_PITCH_SENSITIVITY
        : EXPLORER_TOUCH_PITCH_SENSITIVITY;
      this.explorerYaw -= deltaX * rotateSensitivity;
      this.explorerPitch = THREE.MathUtils.clamp(
        this.explorerPitch + deltaY * pitchSensitivity,
        EXPLORER_MIN_PITCH,
        EXPLORER_MAX_PITCH,
      );
    } else if (this.explorerPointers.size >= 2) {
      const pinchDistance = this.explorerPointerDistance();
      if (this.explorerPinchDistance > 0) {
        this.explorerDistance = THREE.MathUtils.clamp(
          this.explorerDistance + (this.explorerPinchDistance - pinchDistance) * 0.018,
          EXPLORER_MIN_DISTANCE,
          EXPLORER_MAX_DISTANCE,
        );
      }
      this.explorerPinchDistance = pinchDistance;
    }

    event.preventDefault();
  };

  private readonly handleExplorerPointerUp = (event: PointerEvent): void => {
    this.explorerPointers.delete(event.pointerId);
    if (this.explorerPrimaryPointerId === event.pointerId) {
      this.explorerPrimaryPointerId = this.explorerPointers.keys().next().value ?? null;
    }
    this.explorerPinchDistance = this.explorerPointerDistance();
    if (this.explorerPointers.size === 0) {
      this.explorerPrimaryPointerId = null;
      this.explorerDragging = false;
    }
    try {
      this.explorerCanvas?.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may have released the pointer before the cleanup event.
    }
    event.preventDefault();
  };

  private readonly handleExplorerWheel = (event: WheelEvent): void => {
    if (!this.explorerActive) return;
    this.explorerDistance = THREE.MathUtils.clamp(
      this.explorerDistance + event.deltaY * EXPLORER_ZOOM_SENSITIVITY,
      EXPLORER_MIN_DISTANCE,
      EXPLORER_MAX_DISTANCE,
    );
    event.preventDefault();
  };

  public constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly course: CourseLayout,
    private readonly world: RaceWorldLayout,
    private readonly viewportSize: () => Readonly<{ width: number; height: number }>,
  ) {}

  public setMode(mode: RaceCameraMode): void {
    this.mode = mode;
  }

  public attachExplorerInput(canvas: HTMLCanvasElement): void {
    if (this.explorerCanvas === canvas) return;
    this.detachExplorerInput();
    this.explorerCanvas = canvas;
    canvas.addEventListener('pointerdown', this.handleExplorerPointerDown);
    canvas.addEventListener('pointermove', this.handleExplorerPointerMove);
    canvas.addEventListener('pointerup', this.handleExplorerPointerUp);
    canvas.addEventListener('pointercancel', this.handleExplorerPointerUp);
    canvas.addEventListener('lostpointercapture', this.handleExplorerPointerUp);
    canvas.addEventListener('wheel', this.handleExplorerWheel, { passive: false });
  }

  public detachExplorerInput(): void {
    const canvas = this.explorerCanvas;
    if (canvas === null) return;
    canvas.removeEventListener('pointerdown', this.handleExplorerPointerDown);
    canvas.removeEventListener('pointermove', this.handleExplorerPointerMove);
    canvas.removeEventListener('pointerup', this.handleExplorerPointerUp);
    canvas.removeEventListener('pointercancel', this.handleExplorerPointerUp);
    canvas.removeEventListener('lostpointercapture', this.handleExplorerPointerUp);
    canvas.removeEventListener('wheel', this.handleExplorerWheel);
    this.explorerCanvas = null;
    this.clearExplorerPointers();
  }

  public setExplorerActive(active: boolean): void {
    if (active && !this.explorerActive) this.explorerInitialized = false;
    this.explorerActive = active;
    if (!active) this.clearExplorerPointers();
    this.explorerCanvas?.classList.toggle('is-explore-camera-dragging', active && this.explorerDragging);
  }

  public setMenuActive(active: boolean): void {
    if (active && !this.menuActive) this.menuInitialized = false;
    this.menuActive = active;
  }

  public resetExplorer(): void {
    this.explorerInitialized = false;
  }

  public resetMenu(): void {
    this.menuInitialized = false;
  }

  public dispose(): void {
    this.detachExplorerInput();
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
    // Slip is the angle between the authored nose and the actual velocity. Looking down the
    // trajectory keeps the road readable while the car rotates expressively inside the frame.
    const trajectoryHeading = player.heading - player.slipAngle;
    const desiredTarget = fullCourse
      ? new THREE.Vector3(
        (this.course.bounds.minimumX + this.course.bounds.maximumX) * 0.5,
        0,
        (this.course.bounds.minimumZ + this.course.bounds.maximumZ) * 0.5,
      )
      : new THREE.Vector3(
        player.x + Math.cos(trajectoryHeading) * velocityLead,
        0.25,
        player.z - Math.sin(trajectoryHeading) * velocityLead,
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
    const handlingRoll = fullCourse || this.reducedMotion
      ? 0
      : THREE.MathUtils.clamp(player.steering * 0.014 + player.slipAngle * 0.052, -0.04, 0.04);
    this.orientCamera(handlingRoll);
    this.updateProjection();
  }

  public updateExplorer(
    snapshot: GrandstandExplorerSnapshot,
    deltaSeconds: number,
    avoidGrandstand = true,
    drivingSpeed: number | null = null,
  ): void {
    if (!this.explorerInitialized) {
      this.explorerYaw = snapshot.heading + Math.PI - 0.42;
      this.explorerPitch = EXPLORER_DEFAULT_PITCH;
      this.explorerDistance = EXPLORER_DEFAULT_DISTANCE;
      this.explorerInitialized = true;
    }

    this.explorerTarget.set(snapshot.x, snapshot.y + 1.02, snapshot.z);
    const horizontalDistance = Math.cos(this.explorerPitch) * this.explorerDistance;
    this.explorerDesiredPosition.set(
      this.explorerTarget.x + Math.sin(this.explorerYaw) * horizontalDistance,
      this.explorerTarget.y + Math.sin(this.explorerPitch) * this.explorerDistance,
      this.explorerTarget.z + Math.cos(this.explorerYaw) * horizontalDistance,
    );
    if (avoidGrandstand) this.keepExplorerCameraAboveStand(snapshot);
    this.target.lerp(this.explorerTarget, 1 - Math.exp(-8.5 * deltaSeconds));
    this.camera.position.lerp(
      this.explorerDesiredPosition,
      1 - Math.exp(-8.5 * deltaSeconds),
    );
    this.viewSize = THREE.MathUtils.lerp(
      this.viewSize,
      exploreDrivingViewSize(this.explorerDistance, drivingSpeed),
      1 - Math.exp(-6.5 * deltaSeconds),
    );
    this.orientCamera(0);
    this.updateProjection(this.explorerGroundProjectionOffset());
  }

  public updateMenu(snapshot: GrandstandExplorerSnapshot, deltaSeconds: number): void {
    const target = new THREE.Vector3(snapshot.x, snapshot.y + 1.02, snapshot.z);
    const frontX = Math.sin(snapshot.heading);
    const frontZ = Math.cos(snapshot.heading);
    const sideX = Math.cos(snapshot.heading);
    const sideZ = -Math.sin(snapshot.heading);
    const cameraOffset = new THREE.Vector3(
      frontX * 4.8 + sideX * 1.25,
      2.15,
      frontZ * 4.8 + sideZ * 1.25,
    );
    const viewDirection = cameraOffset.clone().negate().normalize();
    const screenRight = viewDirection.cross(new THREE.Vector3(0, 1, 0)).normalize();
    const compositionTarget = target.clone().addScaledVector(screenRight, -MENU_CHARACTER_SCREEN_OFFSET);
    const desiredPosition = compositionTarget.clone().add(cameraOffset);
    if (!this.menuInitialized) {
      this.target.copy(compositionTarget);
      this.camera.position.copy(desiredPosition);
      this.menuInitialized = true;
    } else {
      this.target.lerp(compositionTarget, 1 - Math.exp(-5.5 * deltaSeconds));
      this.camera.position.lerp(desiredPosition, 1 - Math.exp(-5.5 * deltaSeconds));
    }
    this.viewSize = THREE.MathUtils.lerp(
      this.viewSize,
      6.8,
      1 - Math.exp(-5.5 * deltaSeconds),
    );
    this.orientCamera(0);
    this.updateProjection();
  }

  private explorerPointerDistance(): number {
    const pointers = [...this.explorerPointers.values()];
    if (pointers.length < 2) return 0;
    const first = pointers[0] as ExplorerPointer;
    const second = pointers[1] as ExplorerPointer;
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  private clearExplorerPointers(): void {
    this.explorerPointers.clear();
    this.explorerPrimaryPointerId = null;
    this.explorerPinchDistance = 0;
    this.explorerDragging = false;
    this.explorerCanvas?.classList.remove('is-explore-camera-dragging');
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
      .addScaledVector(along, THREE.MathUtils.lerp(-stand.length * 0.32, stand.length * 0.32, sweep))
      .addScaledVector(front, 0.3);
    const standCamera = standTarget.clone()
      .addScaledVector(front, 3.25)
      .addScaledVector(along, -0.55)
      .add(new THREE.Vector3(0, 1.48 + Math.sin(progress * Math.PI) * 0.28, 0));
    const followTarget = new THREE.Vector3(player.x, 0.25, player.z);
    const followCamera = followTarget.clone().add(new THREE.Vector3(-10.8, 17.5, 13.6));
    this.target.copy(standTarget).lerp(followTarget, exit);
    this.camera.position.copy(standCamera).lerp(followCamera, exit);
    this.viewSize = THREE.MathUtils.lerp(CINEMATIC_CLOSE_VIEW_SIZE, 16.5, exit);
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
      .addScaledVector(along, THREE.MathUtils.lerp(-stand.length * 0.32, stand.length * 0.28, sweep))
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
    const closeView = THREE.MathUtils.lerp(
      16.5 + speedRatio * 6.2,
      CINEMATIC_CLOSE_VIEW_SIZE,
      arrival,
    );
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

  private keepExplorerCameraAboveStand(snapshot: GrandstandExplorerSnapshot): void {
    const stand = this.world.grandstand;
    const deltaX = this.explorerDesiredPosition.x - stand.x;
    const deltaZ = this.explorerDesiredPosition.z - stand.z;
    const cameraAlong = deltaX * Math.cos(stand.heading) + deltaZ * -Math.sin(stand.heading);
    const cameraAway = deltaX * Math.sin(stand.heading) + deltaZ * Math.cos(stand.heading);
    const support = grandstandSurfaceAt(stand, cameraAway, cameraAlong);
    const minimumHeight = support.height + 0.38;
    if (this.explorerDesiredPosition.y < minimumHeight) {
      this.explorerDesiredPosition.y = minimumHeight;
    }
    // Keep the target above the nearest authored step as well. This avoids
    // framing a character through the opaque riser when the orbit is low.
    const targetSupport = grandstandSurfaceAt(stand, snapshot.away, snapshot.along);
    this.explorerTarget.y = Math.max(this.explorerTarget.y, targetSupport.height + 0.82);
  }

  public updateProjection(verticalOffset = 0): void {
    const { width, height } = this.viewportSize();
    const aspect = width / height;
    this.camera.left = -this.viewSize * aspect * 0.5;
    this.camera.right = this.viewSize * aspect * 0.5;
    this.camera.top = this.viewSize * 0.5 + verticalOffset;
    this.camera.bottom = -this.viewSize * 0.5 + verticalOffset;
    this.camera.updateProjectionMatrix();
  }

  private explorerGroundProjectionOffset(): number {
    this.cameraUpDirection.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.cameraForwardDirection.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return groundedOrthographicVerticalOffset({
      cameraY: this.camera.position.y,
      cameraUpY: this.cameraUpDirection.y,
      cameraForwardY: this.cameraForwardDirection.y,
      near: this.camera.near,
      viewSize: this.viewSize,
      minimumWorldY: EXPLORE_MINIMUM_VISIBLE_GROUND_Y,
    });
  }

  private fullCourseViewSize(): number {
    const width = this.course.bounds.maximumX - this.course.bounds.minimumX;
    const depth = this.course.bounds.maximumZ - this.course.bounds.minimumZ;
    const viewport = this.viewportSize();
    const aspect = Math.max(0.4, viewport.width / viewport.height);
    return Math.max(depth, width / aspect) * 1.05;
  }
}
