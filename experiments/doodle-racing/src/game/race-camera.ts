import * as THREE from 'three';

import type { ExploreCameraInput } from './controls.js';
import type { CourseLayout } from './course.js';
import type { ExploreEntranceFrame } from './explore-entrance.js';
import type { ExploreVehicleEntryFrame } from './explore-vehicle-entry.js';
import type { GrandstandExplorerSnapshot } from './characters/explorer/grandstand-explorer.js';
import type { RaceSnapshot } from './race-model.js';
import { grandstandSurfaceAt, type RaceWorldLayout } from './race-world.js';

export type RaceCameraMode = 'follow' | 'aerial';

const EXPLORER_DEFAULT_PITCH = 0.52;
const EXPLORER_MIN_PITCH = 0.06;
const EXPLORER_MAX_PITCH = 1.16;
const EXPLORER_DEFAULT_DISTANCE = 7.4;
const EXPLORER_MIN_DISTANCE = 4.8;
const EXPLORER_MAX_DISTANCE = 12.4;
const EXPLORER_ANALOG_YAW_SPEED = 2.2;
const EXPLORER_ANALOG_PITCH_SPEED = 1.5;
const EXPLORER_ANALOG_ZOOM_SPEED = 4.8;
const FOLLOW_DEFAULT_VIEW_SIZE = 18.5;
const FOLLOW_MOBILE_MIN_HORIZONTAL_VIEW_SIZE = 13;
const FOLLOW_MAX_BASE_VIEW_SIZE = 28.5;
const FOLLOW_CAMERA_OFFSET_X = -10.8;
const FOLLOW_CAMERA_OFFSET_Y = 17.5;
const FOLLOW_CAMERA_OFFSET_Z = 13.6;
const MENU_CHARACTER_SCREEN_OFFSET = 1.12;
const CINEMATIC_CLOSE_VIEW_SIZE = 7.2;
const EXPLORE_MINIMUM_VISIBLE_GROUND_Y = 0.04;
const EXPLORE_DRIVING_BASE_ZOOM_OUT = 2.8;
const EXPLORE_DRIVING_SPEED_ZOOM_OUT = 8.2;
const EXPLORE_DRIVING_REFERENCE_SPEED = 24;
const EXPLORE_VIEW_SIZE_SCALE = 1.26;
const AERIAL_MINIMUM_VIEW_SIZE = 52;
const AERIAL_SPEED_VIEW_SIZE = 8;
const AERIAL_REFERENCE_SPEED = 29;
const AERIAL_CAMERA_HEIGHT = 70;
const FINISH_ESCAPE_HANDOFF_SECONDS = 0.46;
const FINISH_ESCAPE_VIEW_SIZE = 8.2;
const FINISH_ESCAPE_CAMERA_RESPONSE = 12;

export type GroundedOrthographicFraming = Readonly<{
  cameraY: number;
  cameraUpY: number;
  cameraForwardY: number;
  near: number;
  viewSize: number;
  minimumWorldY: number;
}>;

export type ExplorerCameraView = Readonly<{
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  viewSize: number;
  yaw: number;
  pitch: number;
  distance: number;
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
  const walkingViewSize = explorerDistance * EXPLORE_VIEW_SIZE_SCALE;
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

export function aerialRaceViewSize(speed: number): number {
  const speedRatio = THREE.MathUtils.clamp(speed / AERIAL_REFERENCE_SPEED, 0, 1);
  return AERIAL_MINIMUM_VIEW_SIZE + speedRatio * AERIAL_SPEED_VIEW_SIZE;
}

export function followRaceBaseViewSize(viewportWidth: number, viewportHeight: number): number {
  const aspect = Math.max(0.25, viewportWidth / Math.max(1, viewportHeight));
  return THREE.MathUtils.clamp(
    FOLLOW_MOBILE_MIN_HORIZONTAL_VIEW_SIZE / aspect,
    FOLLOW_DEFAULT_VIEW_SIZE,
    FOLLOW_MAX_BASE_VIEW_SIZE,
  );
}

export class RaceCameraController {
  private readonly target = new THREE.Vector3();
  private readonly explorerTarget = new THREE.Vector3();
  private readonly explorerDesiredPosition = new THREE.Vector3();
  private readonly cameraUpDirection = new THREE.Vector3();
  private readonly cameraForwardDirection = new THREE.Vector3();
  private readonly finishEscapeStartPosition = new THREE.Vector3();
  private readonly finishEscapeStartTarget = new THREE.Vector3();
  private finishEscapeStartViewSize = FOLLOW_DEFAULT_VIEW_SIZE;
  private viewSize = 18;
  private mode: RaceCameraMode = 'follow';
  private aerialInitialized = false;
  private explorerYaw = 0;
  private explorerPitch = EXPLORER_DEFAULT_PITCH;
  private explorerDistance = EXPLORER_DEFAULT_DISTANCE;
  private explorerInitialized = false;
  private explorerActive = false;
  private menuInitialized = false;
  private menuActive = false;
  private readonly reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  public constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly course: CourseLayout,
    private readonly world: RaceWorldLayout,
    private readonly viewportSize: () => Readonly<{ width: number; height: number }>,
  ) {}

  public setMode(mode: RaceCameraMode): void {
    if (mode === 'aerial' && this.mode !== 'aerial') this.aerialInitialized = false;
    this.mode = mode;
  }

  public setExplorerActive(active: boolean): void {
    this.explorerActive = active;
  }

  public applyExplorerInput(input: ExploreCameraInput, deltaSeconds: number): void {
    if (!this.explorerActive) return;
    const delta = THREE.MathUtils.clamp(deltaSeconds, 0, 0.05);
    const orbitX = input.orbitX.behavior === 'delta'
      ? input.orbitX.value
      : input.orbitX.value * EXPLORER_ANALOG_YAW_SPEED * delta;
    const orbitY = input.orbitY.behavior === 'delta'
      ? input.orbitY.value
      : input.orbitY.value * EXPLORER_ANALOG_PITCH_SPEED * delta;
    const zoom = input.zoom.behavior === 'delta'
      ? input.zoom.value
      : input.zoom.value * EXPLORER_ANALOG_ZOOM_SPEED * delta;
    this.explorerYaw -= orbitX;
    this.explorerPitch = THREE.MathUtils.clamp(
      this.explorerPitch + orbitY,
      EXPLORER_MIN_PITCH,
      EXPLORER_MAX_PITCH,
    );
    this.explorerDistance = THREE.MathUtils.clamp(
      this.explorerDistance + zoom,
      EXPLORER_MIN_DISTANCE,
      EXPLORER_MAX_DISTANCE,
    );
  }

  public setMenuActive(active: boolean): void {
    if (active && !this.menuActive) this.menuInitialized = false;
    this.menuActive = active;
  }

  public resetExplorer(): void {
    this.explorerInitialized = false;
  }

  public captureExplorerView(): ExplorerCameraView {
    return Object.freeze({
      position: Object.freeze([
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z,
      ] as const),
      target: Object.freeze([this.target.x, this.target.y, this.target.z] as const),
      viewSize: this.viewSize,
      yaw: this.explorerYaw,
      pitch: this.explorerPitch,
      distance: this.explorerDistance,
    });
  }

  public resetMenu(): void {
    this.menuInitialized = false;
  }

  public dispose(): void {
    this.explorerActive = false;
    this.menuActive = false;
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
    const speedRatio = THREE.MathUtils.clamp(player.speed / 29, 0, 1);
    const velocityLead = player.speed * 0.085;
    // Slip is the angle between the authored nose and the actual velocity. Looking down the
    // trajectory keeps the road readable while the car rotates expressively inside the frame.
    const trajectoryHeading = player.heading - player.slipAngle;
    if (this.mode === 'aerial') {
      this.updateAerial(player, trajectoryHeading, deltaSeconds);
      return;
    }
    const desiredTarget = new THREE.Vector3(
      player.x + Math.cos(trajectoryHeading) * velocityLead,
      0.25 + player.elevation * 0.72,
      player.z - Math.sin(trajectoryHeading) * velocityLead,
    );
    this.target.lerp(desiredTarget, 1 - Math.exp(-7.2 * deltaSeconds));
    const { width, height } = this.viewportSize();
    this.viewSize = THREE.MathUtils.lerp(
      this.viewSize,
      followRaceBaseViewSize(width, height)
        + speedRatio * 6.2
        + snapshot.boostIntensity * 1.35
        + (player.airborne ? 0.55 : 0),
      1 - Math.exp(-4 * deltaSeconds),
    );

    const shake = snapshot.impact * 0.6;
    const shakeX = Math.sin(elapsedSeconds * 47) * shake;
    const shakeZ = Math.cos(elapsedSeconds * 53) * shake;
    const offset = new THREE.Vector3(
      FOLLOW_CAMERA_OFFSET_X + shakeX,
      FOLLOW_CAMERA_OFFSET_Y + player.elevation * 0.22,
      FOLLOW_CAMERA_OFFSET_Z + shakeZ,
    );
    this.camera.position.copy(this.target).add(offset);
    const handlingRoll = this.reducedMotion
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

  public beginFinishEscape(): void {
    this.finishEscapeStartPosition.copy(this.camera.position);
    this.finishEscapeStartTarget.copy(this.target);
    this.finishEscapeStartViewSize = this.viewSize;
  }

  public updateFinishEscape(
    snapshot: GrandstandExplorerSnapshot,
    elapsedSeconds: number,
    deltaSeconds: number,
  ): void {
    const forwardX = Math.sin(snapshot.heading);
    const forwardZ = Math.cos(snapshot.heading);
    const rightX = Math.cos(snapshot.heading);
    const rightZ = -Math.sin(snapshot.heading);
    const chasePosition = this.explorerDesiredPosition.set(
      snapshot.x - forwardX * 4.8 + rightX * 1.45,
      snapshot.y + 3.05,
      snapshot.z - forwardZ * 4.8 + rightZ * 1.45,
    );
    const chaseTarget = this.explorerTarget.set(
      snapshot.x + forwardX * 1.35,
      snapshot.y + 0.82,
      snapshot.z + forwardZ * 1.35,
    );
    const handoff = this.reducedMotion
      ? 1
      : THREE.MathUtils.smoothstep(elapsedSeconds, 0, FINISH_ESCAPE_HANDOFF_SECONDS);
    if (handoff < 1) {
      this.camera.position.copy(this.finishEscapeStartPosition).lerp(chasePosition, handoff);
      this.target.copy(this.finishEscapeStartTarget).lerp(chaseTarget, handoff);
      this.viewSize = THREE.MathUtils.lerp(
        this.finishEscapeStartViewSize,
        FINISH_ESCAPE_VIEW_SIZE,
        handoff,
      );
    } else {
      const response = 1 - Math.exp(-FINISH_ESCAPE_CAMERA_RESPONSE * deltaSeconds);
      this.camera.position.lerp(chasePosition, response);
      this.target.lerp(chaseTarget, response);
      this.viewSize = THREE.MathUtils.lerp(this.viewSize, FINISH_ESCAPE_VIEW_SIZE, response);
    }
    this.orientCamera(0);
    this.updateProjection();
  }

  public updateWinnerToss(
    snapshot: GrandstandExplorerSnapshot,
    elapsedSeconds: number,
    deltaSeconds: number,
  ): void {
    const orbit = elapsedSeconds * 0.58 - 0.75;
    const actorTarget = new THREE.Vector3(snapshot.x, snapshot.y + 0.92, snapshot.z);
    const desiredPosition = actorTarget.clone().add(new THREE.Vector3(
      Math.sin(orbit) * 4.65,
      2.45 + Math.sin(elapsedSeconds * 0.9) * 0.2,
      Math.cos(orbit) * 4.65,
    ));
    this.target.lerp(actorTarget, 1 - Math.exp(-10 * deltaSeconds));
    this.camera.position.lerp(desiredPosition, 1 - Math.exp(-7.4 * deltaSeconds));
    this.viewSize = THREE.MathUtils.lerp(
      this.viewSize,
      6.35,
      1 - Math.exp(-6.8 * deltaSeconds),
    );
    this.orientCamera(
      this.reducedMotion ? 0 : Math.sin(elapsedSeconds * 2.4) * 0.018,
    );
    this.updateProjection();
  }

  public updateExplorerEntrance(
    snapshot: GrandstandExplorerSnapshot,
    frame: ExploreEntranceFrame,
  ): void {
    const spawn = this.world.explorerSpawn;
    const destination = spawn.approach[spawn.approach.length - 1];
    if (destination === undefined) {
      throw new Error(`Explore spawn ${spawn.id} has no approach destination`);
    }
    const forward = new THREE.Vector3(
      destination.x - spawn.x,
      0,
      destination.z - spawn.z,
    );
    if (forward.lengthSq() <= 1e-8) {
      forward.set(Math.sin(spawn.heading), 0, Math.cos(spawn.heading));
    } else {
      forward.normalize();
    }
    const cinematicFront = new THREE.Vector3(
      Math.sin(spawn.heading),
      0,
      Math.cos(spawn.heading),
    );
    const side = new THREE.Vector3(cinematicFront.z, 0, -cinematicFront.x);
    const actorTarget = new THREE.Vector3(snapshot.x, snapshot.y + 1.02, snapshot.z);
    const destinationTarget = new THREE.Vector3(
      destination.x,
      destination.y + 1.02,
      destination.z,
    );
    const compositionTarget = actorTarget.clone().lerp(
      destinationTarget,
      0.32 * (1 - frame.approachProgress),
    );
    const courseCentre = new THREE.Vector3(
      (this.course.bounds.minimumX + this.course.bounds.maximumX) * 0.5,
      0,
      (this.course.bounds.minimumZ + this.course.bounds.maximumZ) * 0.5,
    );
    const towardCourse = courseCentre.sub(compositionTarget).setY(0);
    if (side.dot(towardCourse) > 0) side.negate();
    const closeSweep = 0.42;
    const closeCamera = actorTarget.clone()
      .addScaledVector(cinematicFront, 3.55)
      .addScaledVector(side, closeSweep)
      .add(new THREE.Vector3(0, 0.42, 0));
    const openingCamera = actorTarget.clone()
      .addScaledVector(cinematicFront, 7.4)
      .addScaledVector(side, 4.6)
      .add(new THREE.Vector3(0, 8.2, 0));
    const descent = frame.phase === 'materializing'
      ? THREE.MathUtils.smoothstep(frame.phaseProgress, 0.08, 1)
      : 1;
    const performingCamera = openingCamera.lerp(closeCamera, descent);
    const trackingCamera = compositionTarget.clone()
      .addScaledVector(forward, 2.1)
      .addScaledVector(side, 5.4)
      .add(new THREE.Vector3(0, 5.1, 0));
    const actionBlend = frame.phase === 'celebrating'
      ? THREE.MathUtils.smoothstep(frame.phaseProgress, 0.48, 1)
      : frame.phase === 'approaching' || frame.phase === 'complete' ? 1 : 0;
    const cinematicCamera = performingCamera.lerp(trackingCamera, actionBlend);
    const cinematicTarget = actorTarget.clone().lerp(compositionTarget, actionBlend);

    this.explorerYaw = snapshot.heading + Math.PI - 0.42;
    this.explorerPitch = EXPLORER_DEFAULT_PITCH;
    this.explorerDistance = EXPLORER_DEFAULT_DISTANCE;
    this.explorerTarget.copy(actorTarget);
    const horizontalDistance = Math.cos(this.explorerPitch) * this.explorerDistance;
    this.explorerDesiredPosition.set(
      actorTarget.x + Math.sin(this.explorerYaw) * horizontalDistance,
      actorTarget.y + Math.sin(this.explorerPitch) * this.explorerDistance,
      actorTarget.z + Math.cos(this.explorerYaw) * horizontalDistance,
    );
    const handoff = THREE.MathUtils.smoothstep(frame.approachProgress, 0.68, 1);
    this.target.copy(cinematicTarget).lerp(actorTarget, handoff);
    this.camera.position.copy(cinematicCamera).lerp(this.explorerDesiredPosition, handoff);
    this.viewSize = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(11.5, 5.4, descent), 10.2, actionBlend),
      exploreDrivingViewSize(this.explorerDistance, null),
      handoff,
    );
    this.orientCamera(0);
    this.updateProjection(this.explorerGroundProjectionOffset());
    if (frame.controlsEnabled) this.explorerInitialized = true;
  }

  public updateExplorerVehicleEntry(
    snapshot: GrandstandExplorerSnapshot,
    frame: ExploreVehicleEntryFrame,
    previousView: ExplorerCameraView,
  ): void {
    const actorTarget = new THREE.Vector3(snapshot.x, snapshot.y + 1.22, snapshot.z);
    const front = new THREE.Vector3(
      Math.sin(frame.cameraHeading),
      0,
      Math.cos(frame.cameraHeading),
    );
    const side = new THREE.Vector3(front.z, 0, -front.x);
    const closeTarget = actorTarget.clone().add(new THREE.Vector3(0, 0.08, 0));
    const closeCamera = closeTarget.clone()
      .addScaledVector(front, 3.05)
      .addScaledVector(side, 0.34)
      .add(new THREE.Vector3(0, 0.66, 0));
    const closeAmount = frame.cameraCloseAmount * (1 - frame.cameraReturnAmount);
    this.target.set(...previousView.target).lerp(closeTarget, closeAmount);
    this.camera.position.set(...previousView.position).lerp(closeCamera, closeAmount);
    this.viewSize = THREE.MathUtils.lerp(previousView.viewSize, 4.45, closeAmount);
    this.explorerYaw = previousView.yaw;
    this.explorerPitch = previousView.pitch;
    this.explorerDistance = previousView.distance;
    this.explorerInitialized = true;
    this.orientCamera(this.reducedMotion ? 0 : Math.sin(frame.progress * Math.PI) * 0.018 * closeAmount);
    this.updateProjection();
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
    const followCamera = followTarget.clone().add(new THREE.Vector3(
      FOLLOW_CAMERA_OFFSET_X,
      FOLLOW_CAMERA_OFFSET_Y,
      FOLLOW_CAMERA_OFFSET_Z,
    ));
    this.target.copy(standTarget).lerp(followTarget, exit);
    this.camera.position.copy(standCamera).lerp(followCamera, exit);
    this.viewSize = THREE.MathUtils.lerp(CINEMATIC_CLOSE_VIEW_SIZE, FOLLOW_DEFAULT_VIEW_SIZE, exit);
    this.orientCamera(Math.sin(progress * Math.PI * 2) * 0.055 * (1 - exit));
    this.updateProjection();
  }

  private updateFinish(snapshot: RaceSnapshot): void {
    const player = snapshot.racers.find(({ isPlayer }) => isPlayer);
    if (player === undefined) return;
    const progress = THREE.MathUtils.clamp(snapshot.finishCinematicProgress, 0, 1);
    const arrival = THREE.MathUtils.smoothstep(progress, 0, 0.07);
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
    const startCamera = startTarget.clone().add(new THREE.Vector3(
      FOLLOW_CAMERA_OFFSET_X,
      FOLLOW_CAMERA_OFFSET_Y,
      FOLLOW_CAMERA_OFFSET_Z,
    ));
    this.target.copy(startTarget).lerp(crowdTarget, arrival);
    this.camera.position.copy(startCamera).lerp(crowdCamera, arrival);
    const closeView = THREE.MathUtils.lerp(
      FOLLOW_DEFAULT_VIEW_SIZE + speedRatio * 6.2,
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

  private updateAerial(
    player: RaceSnapshot['racers'][number],
    trajectoryHeading: number,
    deltaSeconds: number,
  ): void {
    const velocityLead = player.speed * 0.12;
    const desiredTarget = new THREE.Vector3(
      player.x + Math.cos(trajectoryHeading) * velocityLead,
      0.25 + player.elevation * 0.72,
      player.z - Math.sin(trajectoryHeading) * velocityLead,
    );
    const desiredViewSize = aerialRaceViewSize(player.speed);
    if (!this.aerialInitialized) {
      this.target.copy(desiredTarget);
      this.viewSize = desiredViewSize;
      this.aerialInitialized = true;
    } else {
      this.target.lerp(desiredTarget, 1 - Math.exp(-6.2 * deltaSeconds));
      this.viewSize = THREE.MathUtils.lerp(
        this.viewSize,
        desiredViewSize,
        1 - Math.exp(-3.5 * deltaSeconds),
      );
    }
    this.camera.position.set(
      this.target.x,
      this.target.y + AERIAL_CAMERA_HEIGHT,
      this.target.z,
    );
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(this.target);
    this.updateProjection();
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

}
