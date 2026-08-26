import * as THREE from 'three';
import { SpatialHash2D } from '@mithrilman/aind-game-runtime';

import type {
  InkedSolidSceneDiagnostics,
  MediumId,
  Point3,
} from '../../../../src/index.js';
import type { ExploreCameraInput } from './controls.js';
import { nearestCoursePoint, type CourseLayout } from './course.js';
import { CrowdField } from './characters/grandstand/crowd-field.js';
import type { CrowdSeparationAgent } from './characters/shared/crowd-steering.js';
import { DoodleScene, type DoodleRenderStats } from './doodle-scene.js';
import { DriftEffects } from './drift-effects.js';
import { ExploreDriveController } from './explore-drive.js';
import {
  ExploreEntranceDirector,
  type ExploreEntrancePhase,
} from './explore-entrance.js';
import { ExploreVehicleEntryDirector } from './explore-vehicle-entry.js';
import { exploreGameState, type ExploreGameState } from './game-state.js';
import {
  GrandstandExplorer,
  type GrandstandExplorerSnapshot,
} from './characters/explorer/grandstand-explorer.js';
import {
  RaceCameraController,
  type ExplorerCameraView,
  type RaceCameraMode,
} from './race-camera.js';
import { localPreviewCameraOffsetDirection } from './preview-camera.js';
import type { ExploreInput, RaceSnapshot } from './race-model.js';
import {
  FINISH_RUNNER_CONTROL_DELAY_SECONDS,
  FINISH_TOSS_SECONDS,
  finishPursuitStartsAt,
  finishResultsReady,
} from './race-results.js';
import { RouteDebugOverlay } from './route-debug-overlay.js';
import { GRANDSTAND_ROW_SPACING, type RaceWorldLayout } from './race-world.js';
import { SceneryField } from './scenery-field.js';
import { SmokeBurst } from './smoke-burst.js';
import { StartMarshal } from './characters/marshal/start-marshal.js';
import { TracksideCrowdField } from './characters/trackside/trackside-crowd-field.js';
import {
  groundCollidersFor,
  type GroundCollider,
} from './solid-ground-collision.js';
import {
  DEFAULT_VEHICLE_SEEDS,
  VehicleField,
  type ExploreVehicleInteraction,
  type ExploreVehicleEntry,
  type PaperCircuitVehicleId,
  type VehicleInteractionPreviewSource,
  type VehicleSeedSelection,
  type VehicleSelectionSummary,
} from './vehicle-field.js';

export type { RaceCameraMode } from './race-camera.js';
export type RaceStageMode = 'menu' | 'race' | 'explore';

const EXPLORE_IDLE_INPUT: ExploreInput = Object.freeze({
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  handbrake: false,
});
const interactionCameraForward = new THREE.Vector3();

export type ExploreStageSnapshot = Readonly<{
  explorer: GrandstandExplorerSnapshot;
  drivingRacer: RaceSnapshot['racers'][number] | null;
  drivingOffRoad: boolean;
  interaction: ExploreStageInteraction | null;
  entrancePhase: ExploreEntrancePhase | null;
  controlsEnabled: boolean;
}>;

export type ExploreStageInteraction = Readonly<{
  action: string;
  preview: VehicleInteractionPreviewSource;
  cameraOffsetDirection: Point3;
}>;

type PendingExplorerChange = Readonly<{
  seed: number;
  snapshot: Readonly<Pick<GrandstandExplorerSnapshot, 'x' | 'y' | 'z' | 'heading'>>;
}>;

type ActiveExploreVehicleEntry = {
  director: ExploreVehicleEntryDirector;
  cameraView: ExplorerCameraView;
  doorOpened: boolean;
};

export class RaceStage {
  private readonly doodle: DoodleScene;
  private readonly scenery: SceneryField;
  private readonly vehicles: VehicleField;
  private crowd: CrowdField;
  private tracksideCrowd: TracksideCrowdField;
  private readonly finishCrowdSeparation = new SpatialHash2D<CrowdSeparationAgent>(1);
  private finishCrowdAgents: readonly CrowdSeparationAgent[] = Object.freeze([]);
  private readonly startMarshal: StartMarshal;
  private readonly effects: DriftEffects;
  private readonly routeDebug: RouteDebugOverlay;
  private readonly smoke: SmokeBurst;
  private readonly camera: RaceCameraController;
  private readonly exploreDrive: ExploreDriveController;
  private readonly staticExploreColliders: readonly GroundCollider[];
  private explorer: GrandstandExplorer;
  private readonly course: CourseLayout;
  private readonly world: RaceWorldLayout;
  private readonly onVehicleHoodSelected: (selection: VehicleSelectionSummary) => void;
  private mode: RaceStageMode = 'menu';
  private routeDebugVisible = false;
  private customizingVehicleId: PaperCircuitVehicleId | null = null;
  private exploreInteractLatch = false;
  private exploreEntrance: ExploreEntranceDirector | null = null;
  private exploreVehicleEntry: ActiveExploreVehicleEntry | null = null;
  private exploreVehicleEntryCount = 0;
  private pendingExplorerChange: PendingExplorerChange | null = null;
  private activeDoor: Readonly<{
    vehicleId: string;
    side: 'left' | 'right';
    remaining: number;
  }> | null = null;
  private finishCelebrationStartedAt: number | null = null;
  private finishRunnerStartedAt = 0;
  private finishRunnerActive = false;
  private finishCaughtAt: number | null = null;
  private finishCatchPoint: Readonly<{ x: number; z: number; heading: number }> | null = null;
  private finishResultsAvailable = false;

  public constructor(
    canvas: HTMLCanvasElement,
    viewport: HTMLElement,
    course: CourseLayout,
    world: RaceWorldLayout,
    medium: MediumId,
    explorerSeed = 15823,
    vehicleSeeds: VehicleSeedSelection = DEFAULT_VEHICLE_SEEDS,
    onVehicleHoodSelected: (selection: VehicleSelectionSummary) => void = () => undefined,
  ) {
    this.course = course;
    this.world = world;
    this.onVehicleHoodSelected = onVehicleHoodSelected;
    this.doodle = new DoodleScene(canvas, viewport, medium);
    this.scenery = new SceneryField(course, world);
    this.vehicles = new VehicleField(vehicleSeeds);
    this.crowd = new CrowdField(world);
    this.tracksideCrowd = new TracksideCrowdField(course, world);
    this.refreshFinishCrowdAgents();
    this.startMarshal = new StartMarshal(course);
    this.effects = new DriftEffects(course);
    this.routeDebug = new RouteDebugOverlay(course);
    this.smoke = new SmokeBurst();
    this.explorer = new GrandstandExplorer(world.grandstand, course, explorerSeed);
    this.exploreDrive = new ExploreDriveController(
      course,
      world,
      (vehicleId) => this.vehicles.collisionProfile(vehicleId),
    );
    this.vehicles.update(this.exploreDrive.frame().racers, 0);
    this.staticExploreColliders = groundCollidersFor(this.scenery.collisionRigs());
    this.configureExplorerPreview(this.explorer);
    this.doodle.setAssets(this.sceneAssets());
    this.camera = new RaceCameraController(
      this.doodle.camera,
      course,
      world,
      () => this.doodle.viewportSize(),
    );
    this.setMode('menu');
  }

  public setMedium(medium: MediumId): void {
    this.doodle.setMedium(medium);
  }

  public rerollCrowd(seed: number): void {
    const previous = this.crowd;
    const previousTrackside = this.tracksideCrowd;
    const replacement = new CrowdField(this.world, seed);
    const tracksideReplacement = new TracksideCrowdField(this.course, this.world, seed);
    replacement.setVisible(this.mode !== 'menu');
    tracksideReplacement.setVisible(this.mode !== 'menu');
    this.crowd = replacement;
    this.tracksideCrowd = tracksideReplacement;
    this.refreshFinishCrowdAgents();
    this.doodle.setAssets(this.sceneAssets());
    previous.dispose();
    previousTrackside.dispose();
  }

  public diagnostics(): InkedSolidSceneDiagnostics | null {
    return this.doodle.diagnostics();
  }

  public setRenderingSuspended(suspended: boolean): void {
    this.doodle.setSuspended(suspended);
  }

  public renderStats(): DoodleRenderStats {
    return this.doodle.renderStats();
  }

  public gameState(): ExploreGameState {
    if (this.mode !== 'explore') {
      throw new Error('Explore game state is only available while the stage is exploring');
    }
    const activeVehicleId = this.exploreDrive.drivenVehicleId;
    if (this.exploreEntrance !== null) return exploreGameState('entrance');
    if (this.exploreVehicleEntry !== null) return exploreGameState('vehicle-entry');
    if (this.customizingVehicleId !== null) {
      return exploreGameState('vehicle-customizer', this.customizingVehicleId);
    }
    if (activeVehicleId !== null) return exploreGameState('driving', activeVehicleId);
    return exploreGameState('on-foot');
  }

  public setCameraMode(mode: RaceCameraMode): void {
    this.camera.setMode(mode);
  }

  public setRouteDebugVisible(visible: boolean): void {
    if (visible === this.routeDebugVisible) return;
    this.routeDebugVisible = visible;
    this.doodle.setAssets(this.sceneAssets());
  }

  public get finishResultsReady(): boolean {
    return this.finishResultsAvailable;
  }

  public prepareRaceStart(): void {
    this.effects.reset();
    this.resetFinishCelebration();
  }

  public setMode(mode: RaceStageMode): void {
    const routeDebugWasRegistered = this.routeDebugVisible && this.mode === 'race';
    const enteringExplore = mode === 'explore' && this.mode !== 'explore';
    const leavingExplore = mode !== 'explore' && this.mode === 'explore';
    if (leavingExplore) {
      this.closeActiveDoor();
      this.closeVehicleCustomizer();
      this.exploreEntrance = null;
      this.exploreVehicleEntry = null;
      this.smoke.cancel();
    }
    if (enteringExplore || leavingExplore) this.exploreInteractLatch = false;
    this.mode = mode;
    if (enteringExplore) {
      this.exploreVehicleEntry = null;
      this.exploreVehicleEntryCount = 0;
      this.exploreDrive.reset();
      this.effects.reset();
      this.vehicles.update(this.exploreDrive.frame().racers, 0);
      this.camera.resetExplorer();
    }
    this.crowd.setCelebrating(false, 0);
    this.vehicles.setVisible(mode === 'race' || mode === 'explore');
    this.effects.setVisible(mode === 'race' || mode === 'explore');
    this.scenery.setVisible(true);
    this.crowd.setVisible(mode !== 'menu');
    this.tracksideCrowd.setVisible(mode !== 'menu');
    this.startMarshal.setVisible(mode !== 'menu');
    this.explorer.setPreviewMode(mode === 'menu');
    this.camera.setMenuActive(mode === 'menu');
    if (mode !== 'explore') this.explorer.reset();
    if (mode === 'menu') this.explorer.setPreviewMode(true);
    if (enteringExplore) this.startExplorerEntrance();
    this.explorer.setVisible(
      mode === 'explore' && (this.exploreEntrance?.snapshot().actorVisible ?? true),
    );
    this.camera.setExplorerActive(mode === 'explore' && this.exploreEntrance === null);
    const routeDebugIsRegistered = this.routeDebugVisible && this.mode === 'race';
    if (routeDebugWasRegistered !== routeDebugIsRegistered) {
      this.doodle.setAssets(this.sceneAssets());
    }
  }

  public rerollExplorer(seed: number): boolean {
    if (this.gameState().activity !== 'on-foot') return false;
    if (this.pendingExplorerChange !== null) {
      this.pendingExplorerChange = Object.freeze({
        ...this.pendingExplorerChange,
        seed,
      });
      return true;
    }
    const snapshot = this.explorer.snapshot();
    this.pendingExplorerChange = Object.freeze({
      seed,
      snapshot: Object.freeze({
        x: snapshot.x,
        y: snapshot.y,
        z: snapshot.z,
        heading: snapshot.heading,
      }),
    });
    this.smoke.trigger(snapshot, seed);
    return true;
  }

  public setExplorerSeed(seed: number): void {
    if (this.explorer.identity.seed === seed) return;
    const snapshot = this.explorer.snapshot();
    this.pendingExplorerChange = null;
    this.smoke.cancel();
    this.replaceExplorer(Object.freeze({
      seed,
      snapshot: Object.freeze({
        x: snapshot.x,
        y: snapshot.y,
        z: snapshot.z,
        heading: snapshot.heading,
      }),
    }));
  }

  public resetExplorerCamera(): boolean {
    if (this.exploreEntrance !== null) return false;
    this.camera.resetExplorer();
    return true;
  }

  public vehicleConfiguratorPreview(
    vehicleId: PaperCircuitVehicleId,
  ): VehicleInteractionPreviewSource {
    if (this.customizingVehicleId !== vehicleId) {
      throw new Error(`Vehicle ${vehicleId} is not open in the hood configurator`);
    }
    return this.vehicles.configuratorPreview(vehicleId);
  }

  public vehicleInteractionPreviews(): readonly VehicleInteractionPreviewSource[] {
    return this.vehicles.interactionPreviews();
  }

  public vehicleConfiguratorPreviews(): readonly VehicleInteractionPreviewSource[] {
    return this.vehicles.configuratorPreviews();
  }

  public reseedVehicle(
    vehicleId: PaperCircuitVehicleId,
    seed: number,
  ): VehicleSelectionSummary {
    if (this.customizingVehicleId !== vehicleId) {
      throw new Error(`Vehicle ${vehicleId} is not open in the hood configurator`);
    }
    const replacement = this.vehicles.replaceVehicle(vehicleId, seed);
    this.exploreDrive.setCollisionProfile(
      vehicleId,
      this.vehicles.collisionProfile(vehicleId),
    );
    this.vehicles.update(this.exploreDrive.frame().racers, this.explorer.snapshot().elapsed);
    this.vehicles.setHoodOpen(vehicleId, true);
    this.doodle.setAssets(this.sceneAssets());
    replacement.previousRig.dispose();
    return replacement.selection;
  }

  public closeVehicleCustomizer(): void {
    const vehicleId = this.customizingVehicleId;
    if (vehicleId === null) return;
    this.vehicles.setHoodOpen(vehicleId, false);
    this.customizingVehicleId = null;
    this.camera.setExplorerActive(this.mode === 'explore' && this.exploreEntrance === null);
  }

  public render(
    snapshot: RaceSnapshot,
    deltaSeconds: number,
    finishInput: ExploreInput = EXPLORE_IDLE_INPUT,
  ): GrandstandExplorerSnapshot | null {
    this.smoke.update(deltaSeconds);
    this.completePendingExplorerChange();
    if (this.mode === 'menu') {
      const preview = this.explorer.updatePreview(deltaSeconds);
      this.camera.updateMenu(preview, deltaSeconds);
      this.doodle.render(preview.elapsed);
      return preview;
    }
    const effectSources = this.vehicles.update(snapshot.racers, snapshot.presentationTime);
    this.effects.update(effectSources, deltaSeconds, snapshot.phase === 'running');
    this.startMarshal.update(snapshot);
    if (snapshot.phase === 'finished') {
      return this.renderFinishCelebration(snapshot, finishInput, deltaSeconds);
    }
    this.crowd.setCelebrating(false, snapshot.presentationTime);
    this.crowd.update(snapshot.presentationTime);
    this.tracksideCrowd.update(
      snapshot.presentationTime,
      deltaSeconds,
      snapshot.racers,
    );
    this.camera.update(snapshot, deltaSeconds, snapshot.presentationTime);
    if (this.routeDebugVisible && this.mode === 'race') {
      this.routeDebug.update(snapshot.routeCoverageWords);
    }
    this.doodle.render(snapshot.presentationTime);
    return null;
  }

  public renderExplorer(
    input: ExploreInput,
    cameraInput: ExploreCameraInput,
    deltaSeconds: number,
  ): ExploreStageSnapshot {
    this.smoke.update(deltaSeconds);
    this.completePendingExplorerChange();
    if (this.exploreEntrance !== null) {
      return this.renderExplorerEntrance(deltaSeconds);
    }
    if (this.exploreVehicleEntry !== null) {
      return this.renderExplorerVehicleEntry(input, deltaSeconds);
    }
    const interactRequested = input.interact === true;
    const interactPressed = interactRequested && !this.exploreInteractLatch;
    this.exploreInteractLatch = interactRequested;
    const beforeDrive = this.exploreDrive.frame();
    this.vehicles.update(beforeDrive.racers, this.explorer.snapshot().elapsed);
    const vehicleColliders = groundCollidersFor(
      this.vehicles.collisionRigs(beforeDrive.activeVehicleId),
    ).filter(({ id }) => id === 'vehicle:body');
    const effectiveInput = this.customizingVehicleId === null ? input : EXPLORE_IDLE_INPUT;
    const explorer = this.explorer.update(
      deltaSeconds,
      this.pendingExplorerChange === null && !beforeDrive.activeVehicleId
        ? effectiveInput
        : EXPLORE_IDLE_INPUT,
      Object.freeze([...this.staticExploreColliders, ...vehicleColliders]),
    );
    const nearbyInteraction = beforeDrive.activeVehicleId === null
      && this.customizingVehicleId === null
      ? this.vehicles.nearestInteraction(explorer.x, explorer.z)
      : null;
    if (nearbyInteraction?.kind === 'hood' && interactPressed) {
      this.openVehicleCustomizer(nearbyInteraction.vehicleId);
    }
    const nearbyEntry = nearbyInteraction?.kind === 'door'
      ? Object.freeze({
        vehicleId: nearbyInteraction.vehicleId,
        side: nearbyInteraction.side,
        distance: nearbyInteraction.distance,
      })
      : null;
    if (nearbyEntry !== null && interactPressed) {
      const target = this.vehicles.entryPosition(nearbyEntry.vehicleId, nearbyEntry.side);
      const driver = this.vehicles.driverPosition(nearbyEntry.vehicleId);
      const vehicle = beforeDrive.racers.find(({ id }) => id === nearbyEntry.vehicleId);
      if (target !== null && driver !== null && vehicle !== undefined) {
        this.startExplorerVehicleEntry(nearbyEntry, explorer, target, driver, vehicle);
        return this.renderExplorerVehicleEntry(input, 0);
      }
    }
    const driveInput = this.customizingVehicleId !== null
      ? EXPLORE_IDLE_INPUT
      : nearbyInteraction?.kind === 'hood' && effectiveInput.interact === true
        ? Object.freeze({ ...effectiveInput, interact: false })
        : effectiveInput;
    const drive = this.exploreDrive.update(deltaSeconds, driveInput, nearbyEntry);
    const effectSources = this.vehicles.update(drive.racers, explorer.elapsed);
    if (drive.entered !== null) {
      this.openVehicleDoor(drive.entered.vehicleId, drive.entered.side);
    }
    if (drive.exited !== null) {
      this.openVehicleDoor(drive.exited.vehicleId, drive.exited.side);
      const exit = this.vehicles.entryPosition(drive.exited.vehicleId, drive.exited.side);
      const vehicle = drive.racers.find(({ id }) => id === drive.exited?.vehicleId);
      if (exit !== null && vehicle !== undefined) {
        this.explorer.placeAt(Object.freeze({
          x: exit.x,
          y: Math.max(0, exit.y),
          z: exit.z,
          heading: vehicle.heading + Math.PI * 0.5,
        }));
        this.explorer.stowHelmetInBackpack();
      }
    }
    this.updateActiveDoor(deltaSeconds);
    this.explorer.setVisible(drive.activeRacer === null);
    this.effects.update(effectSources, deltaSeconds, drive.activeRacer !== null);
    this.crowd.update(explorer.elapsed);
    this.tracksideCrowd.update(explorer.elapsed, deltaSeconds, drive.racers);
    this.startMarshal.updateIdle(explorer.elapsed);
    const cameraSubject = drive.activeRacer === null
      ? this.explorer.snapshot()
      : Object.freeze({
        ...explorer,
        x: drive.activeRacer.x,
        y: 0.15 + drive.activeRacer.elevation,
        z: drive.activeRacer.z,
        heading: drive.activeRacer.heading + Math.PI * 0.5,
        speed: Math.min(1, drive.activeRacer.speed / 24),
        pose: 'sit' as const,
      });
    this.camera.applyExplorerInput(cameraInput, deltaSeconds);
    this.camera.updateExplorer(
      cameraSubject,
      deltaSeconds,
      drive.activeRacer === null,
      drive.activeRacer?.speed ?? null,
    );
    this.doodle.render(explorer.elapsed);
    const interaction = this.customizingVehicleId !== null
      ? null
      : this.exploreInteraction(drive, nearbyInteraction);
    return Object.freeze({
      explorer: this.explorer.snapshot(),
      drivingRacer: drive.activeRacer,
      drivingOffRoad: drive.activeRacer !== null && nearestCoursePoint(
        this.course,
        drive.activeRacer.x,
        drive.activeRacer.z,
      ).distanceFromCentre > this.course.trackWidth * 0.5 - 0.34,
      interaction,
      entrancePhase: null,
      controlsEnabled: true,
    });
  }

  public dispose(): void {
    this.closeVehicleCustomizer();
    this.camera.dispose();
    this.doodle.dispose();
    this.explorer.dispose();
    this.smoke.dispose();
    this.effects.dispose();
    this.routeDebug.dispose();
    this.crowd.dispose();
    this.tracksideCrowd.dispose();
    this.startMarshal.dispose();
    this.vehicles.dispose();
    this.scenery.dispose();
  }

  private sceneAssets() {
    return Object.freeze([
      ...this.scenery.doodleAssets(),
      ...(this.routeDebugVisible && this.mode === 'race'
        ? [this.routeDebug.doodleAsset()]
        : []),
      this.effects.doodleAsset(),
      ...this.vehicles.doodleAssets(),
      ...this.crowd.doodleAssets(),
      ...this.tracksideCrowd.doodleAssets(),
      ...this.startMarshal.doodleAssets(),
      ...this.explorer.doodleAssets(),
      this.smoke.doodleAsset(),
    ]);
  }

  private configureExplorerPreview(explorer: GrandstandExplorer): void {
    const stand = this.world.grandstand;
    const previewAway = (stand.rows - 1) * GRANDSTAND_ROW_SPACING + 3.4;
    explorer.setPreviewTransform(Object.freeze({
      x: stand.x + Math.sin(stand.heading) * previewAway,
      y: 0.04,
      z: stand.z + Math.cos(stand.heading) * previewAway,
    }), stand.heading);
  }

  private startExplorerEntrance(): void {
    const entrance = new ExploreEntranceDirector(this.world.explorerSpawn);
    const frame = entrance.snapshot();
    this.exploreEntrance = entrance;
    this.explorer.updateCinematic(0, frame);
    this.explorer.setVisible(frame.actorVisible);
    this.smoke.cancel();
    this.smoke.trigger(frame, this.explorer.identity.seed);
  }

  private renderExplorerEntrance(deltaSeconds: number): ExploreStageSnapshot {
    const entrance = this.exploreEntrance;
    if (entrance === null) {
      throw new Error('Explore entrance is not active');
    }
    const frame = entrance.update(deltaSeconds);
    const explorer = this.explorer.updateCinematic(deltaSeconds, frame);
    this.explorer.setVisible(frame.actorVisible);
    const effectSources = this.vehicles.update(this.exploreDrive.frame().racers, explorer.elapsed);
    this.effects.update(effectSources, deltaSeconds, false);
    this.crowd.update(explorer.elapsed);
    this.tracksideCrowd.update(
      explorer.elapsed,
      deltaSeconds,
      this.exploreDrive.frame().racers,
    );
    this.startMarshal.updateIdle(explorer.elapsed);
    this.camera.updateExplorerEntrance(explorer, frame);
    this.doodle.render(explorer.elapsed);
    if (frame.controlsEnabled) {
      this.exploreEntrance = null;
      this.explorer.setVisible(true);
      this.camera.setExplorerActive(this.customizingVehicleId === null);
    }
    return Object.freeze({
      explorer,
      drivingRacer: null,
      drivingOffRoad: false,
      interaction: null,
      entrancePhase: frame.phase,
      controlsEnabled: frame.controlsEnabled,
    });
  }

  private startExplorerVehicleEntry(
    entry: ExploreVehicleEntry,
    explorer: GrandstandExplorerSnapshot,
    target: Readonly<{ x: number; y: number; z: number }>,
    driver: Readonly<{ x: number; y: number; z: number }>,
    vehicle: Readonly<{ x: number; z: number; heading: number }>,
  ): void {
    this.closeActiveDoor();
    this.exploreVehicleEntry = {
      director: new ExploreVehicleEntryDirector(
        entry,
        explorer,
        target,
        driver,
        vehicle,
        this.exploreVehicleEntryCount,
      ),
      cameraView: this.camera.captureExplorerView(),
      doorOpened: false,
    };
    this.exploreVehicleEntryCount += 1;
    this.camera.setExplorerActive(false);
  }

  private renderExplorerVehicleEntry(
    input: ExploreInput,
    deltaSeconds: number,
  ): ExploreStageSnapshot {
    const active = this.exploreVehicleEntry;
    if (active === null) throw new Error('Explore vehicle entry is not active');
    this.exploreInteractLatch = input.interact === true;
    const frame = active.director.update(deltaSeconds);
    const explorer = this.explorer.updateCinematic(deltaSeconds, frame);
    if (frame.doorOpen && !active.doorOpened) {
      this.openVehicleDoor(active.director.entry.vehicleId, active.director.entry.side, 1.3);
      active.doorOpened = true;
    }

    let drive = this.exploreDrive.frame();
    if (frame.complete) {
      drive = this.exploreDrive.update(
        0,
        Object.freeze({ ...EXPLORE_IDLE_INPUT, interact: true }),
        active.director.entry,
      );
      this.openVehicleDoor(active.director.entry.vehicleId, active.director.entry.side);
    }
    const effectSources = this.vehicles.update(drive.racers, explorer.elapsed);
    this.explorer.setVisible(frame.actorVisible);
    this.effects.update(effectSources, deltaSeconds, false);
    this.crowd.update(explorer.elapsed);
    this.tracksideCrowd.update(explorer.elapsed, deltaSeconds, drive.racers);
    this.startMarshal.updateIdle(explorer.elapsed);
    this.camera.updateExplorerVehicleEntry(explorer, frame, active.cameraView);
    this.doodle.render(explorer.elapsed);
    if (frame.complete) {
      this.exploreVehicleEntry = null;
      this.camera.setExplorerActive(true);
    }
    return Object.freeze({
      explorer,
      drivingRacer: drive.activeRacer,
      drivingOffRoad: false,
      interaction: null,
      entrancePhase: null,
      controlsEnabled: false,
    });
  }

  private renderFinishCelebration(
    snapshot: RaceSnapshot,
    input: ExploreInput,
    deltaSeconds: number,
  ): GrandstandExplorerSnapshot | null {
    const player = snapshot.racers.find(({ isPlayer }) => isPlayer);
    if (player === undefined) return null;
    if (this.finishCelebrationStartedAt === null) {
      this.finishCelebrationStartedAt = snapshot.presentationTime;
      this.crowd.setCelebrating(false, snapshot.presentationTime);
    }
    const finishElapsed = snapshot.presentationTime - this.finishCelebrationStartedAt;
    if (!this.finishRunnerActive && finishElapsed >= 1.25 && player.speed <= 8) {
      const sideX = Math.sin(player.heading);
      const sideZ = Math.cos(player.heading);
      this.explorer.placeAt(Object.freeze({
        x: player.x + sideX * 1.18,
        y: 0,
        z: player.z + sideZ * 1.18,
        heading: Math.atan2(sideX, sideZ),
      }));
      this.explorer.stowHelmetInBackpack();
      this.explorer.setVisible(true);
      this.finishRunnerActive = true;
      this.finishRunnerStartedAt = snapshot.presentationTime;
      const pursuitStartsAt = finishPursuitStartsAt(this.finishRunnerStartedAt);
      this.crowd.beginInvasion(pursuitStartsAt);
      this.tracksideCrowd.beginInvasion(pursuitStartsAt);
      this.camera.beginFinishEscape();
    }

    let runner = this.finishRunnerActive ? this.explorer.snapshot() : null;
    if (runner !== null && this.finishCaughtAt === null) {
      const vehicleColliders = groundCollidersFor(this.vehicles.collisionRigs())
        .filter(({ id }) => id === 'vehicle:body');
      runner = this.explorer.update(
        deltaSeconds,
        snapshot.presentationTime - this.finishRunnerStartedAt
          >= FINISH_RUNNER_CONTROL_DELAY_SECONDS
          ? input
          : EXPLORE_IDLE_INPUT,
        Object.freeze([...this.staticExploreColliders, ...vehicleColliders]),
      );
    } else if (runner !== null && this.finishCaughtAt !== null) {
      const caughtElapsed = snapshot.presentationTime - this.finishCaughtAt;
      const catchPoint = this.finishCatchPoint;
      if (catchPoint === null) throw new Error('Finish catch has no authored point');
      const tossWindow = Math.min(1, caughtElapsed / FINISH_TOSS_SECONDS);
      const tossHeight = Math.abs(Math.sin(caughtElapsed * Math.PI * 0.92))
        * 2.25
        * (1 - Math.max(0, tossWindow - 0.8) / 0.2);
      runner = this.explorer.updateCinematic(deltaSeconds, Object.freeze({
        x: catchPoint.x,
        y: 0.22 + tossHeight,
        z: catchPoint.z,
        heading: catchPoint.heading + Math.sin(caughtElapsed * 1.7) * 0.22,
        pose: tossHeight > 0.34 ? 'airborne' : 'play',
        expression: caughtElapsed < 0.55 ? 'scared' : 'happy',
        helmetCarryAmount: 0,
      }));
    }

    const target = runner ?? Object.freeze({ x: player.x, z: player.z });
    const caught = this.finishCaughtAt !== null;
    const movingHazards = this.finishRunnerActive
      ? snapshot.racers.filter(({ isPlayer }) => !isPlayer)
      : snapshot.racers;
    if (this.finishRunnerActive) {
      this.finishCrowdSeparation.rebuild(this.finishCrowdAgents);
      this.crowd.updateInvasion(
        snapshot.presentationTime,
        deltaSeconds,
        target,
        movingHazards,
        caught,
        this.finishCrowdSeparation,
      );
      this.tracksideCrowd.update(
        snapshot.presentationTime,
        deltaSeconds,
        movingHazards,
        target,
        caught,
        this.finishCrowdSeparation,
      );
    } else {
      this.crowd.update(snapshot.presentationTime);
      this.tracksideCrowd.update(snapshot.presentationTime, deltaSeconds, movingHazards);
    }
    if (
      runner !== null
      && this.finishCaughtAt === null
      && snapshot.presentationTime >= finishPursuitStartsAt(this.finishRunnerStartedAt)
      && Math.min(
        this.crowd.nearestDistanceTo(runner.x, runner.z),
        this.tracksideCrowd.nearestDistanceTo(runner.x, runner.z),
      ) <= 0.9
    ) {
      this.finishCaughtAt = snapshot.presentationTime;
      this.finishCatchPoint = Object.freeze({
        x: runner.x,
        z: runner.z,
        heading: runner.heading,
      });
    }

    this.finishResultsAvailable = finishResultsReady(
      this.finishCaughtAt === null ? null : snapshot.presentationTime - this.finishCaughtAt,
    );

    if (runner === null) {
      this.camera.update(snapshot, deltaSeconds, snapshot.presentationTime);
    } else if (this.finishCaughtAt === null) {
      this.camera.updateFinishEscape(
        runner,
        snapshot.presentationTime - this.finishRunnerStartedAt,
        deltaSeconds,
      );
    } else {
      this.camera.updateWinnerToss(
        runner,
        snapshot.presentationTime - this.finishCaughtAt,
        deltaSeconds,
      );
    }
    this.doodle.render(snapshot.presentationTime);
    return runner;
  }

  private resetFinishCelebration(): void {
    this.finishCelebrationStartedAt = null;
    this.finishRunnerStartedAt = 0;
    this.finishRunnerActive = false;
    this.finishCaughtAt = null;
    this.finishCatchPoint = null;
    this.finishResultsAvailable = false;
  }

  private refreshFinishCrowdAgents(): void {
    this.finishCrowdAgents = Object.freeze([
      ...this.crowd.invasionAgents(),
      ...this.tracksideCrowd.invasionAgents(),
    ]);
  }

  private completePendingExplorerChange(): void {
    const pending = this.pendingExplorerChange;
    if (pending === null || !this.smoke.isCovered) return;

    this.replaceExplorer(pending);
    this.pendingExplorerChange = null;
  }

  private replaceExplorer(pending: PendingExplorerChange): void {

    const previousExplorer = this.explorer;
    const nextExplorer = new GrandstandExplorer(this.world.grandstand, this.course, pending.seed);
    this.configureExplorerPreview(nextExplorer);
    if (this.mode === 'explore') nextExplorer.placeAt(pending.snapshot);
    this.explorer = nextExplorer;
    this.doodle.setAssets(this.sceneAssets());
    previousExplorer.dispose();
    this.explorer.setPreviewMode(this.mode === 'menu');
    this.explorer.setVisible(this.mode === 'explore');
  }

  private openVehicleDoor(
    vehicleId: string,
    side: 'left' | 'right',
    duration = 0.62,
  ): void {
    this.closeActiveDoor();
    this.vehicles.setDoorOpen(vehicleId, side, true);
    this.activeDoor = Object.freeze({ vehicleId, side, remaining: duration });
  }

  private updateActiveDoor(deltaSeconds: number): void {
    const activeDoor = this.activeDoor;
    if (activeDoor === null) return;
    const remaining = activeDoor.remaining - deltaSeconds;
    if (remaining <= 0) {
      this.closeActiveDoor();
      return;
    }
    this.activeDoor = Object.freeze({ ...activeDoor, remaining });
  }

  private closeActiveDoor(): void {
    const activeDoor = this.activeDoor;
    if (activeDoor === null) return;
    this.vehicles.setDoorOpen(activeDoor.vehicleId, activeDoor.side, false);
    this.activeDoor = null;
  }

  private openVehicleCustomizer(vehicleId: PaperCircuitVehicleId): void {
    this.closeActiveDoor();
    this.customizingVehicleId = vehicleId;
    this.vehicles.setHoodOpen(vehicleId, true);
    this.camera.setExplorerActive(false);
    this.onVehicleHoodSelected(this.vehicles.selection(vehicleId));
  }

  private exploreInteraction(
    drive: ReturnType<ExploreDriveController['frame']>,
    nearby: ExploreVehicleInteraction | null,
  ): ExploreStageInteraction | null {
    if (
      drive.activeVehicleId !== null
      && drive.activeRacer !== null
      && drive.activeSide !== null
      && drive.activeRacer.speed <= 1.2
    ) {
      return Object.freeze({
        action: drive.activeRacer.name === 'You'
          ? 'Exit your car'
          : `Exit ${drive.activeRacer.name}'s car`,
        preview: this.vehicles.interactionPreview(
          drive.activeVehicleId,
          `door:${drive.activeSide}`,
        ),
        cameraOffsetDirection: this.interactionCameraOffsetDirection(drive.activeVehicleId),
      });
    }
    if (drive.activeVehicleId !== null || nearby === null) return null;
    if (nearby.kind === 'hood') {
      return Object.freeze({
        action: nearby.name === 'You'
          ? 'Customize your car'
          : `Customize ${nearby.name}'s car`,
        preview: nearby.preview,
        cameraOffsetDirection: this.interactionCameraOffsetDirection(nearby.vehicleId),
      });
    }
    return Object.freeze({
      action: nearby.name === 'You' ? 'Drive your car' : `Steal ${nearby.name}'s car`,
      preview: nearby.preview,
      cameraOffsetDirection: this.interactionCameraOffsetDirection(nearby.vehicleId),
    });
  }

  private interactionCameraOffsetDirection(vehicleId: string): Point3 {
    this.doodle.camera.getWorldDirection(interactionCameraForward);
    return localPreviewCameraOffsetDirection(
      Object.freeze([
        interactionCameraForward.x,
        interactionCameraForward.y,
        interactionCameraForward.z,
      ] as const),
      this.vehicles.worldRotation(vehicleId),
    );
  }
}
