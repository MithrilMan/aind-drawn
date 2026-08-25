import * as THREE from 'three';

import {
  SolidRig,
  applySolidVehicleMotion,
  createSolidVehicleBlueprint,
  createSolidVehicleInkStrokes,
  createVehicleIdentity,
  createVehicleMotionState,
  sampleVehicleMotion,
  setVehicleMotion,
  type SolidAssetBlueprint,
  type Quaternion,
  type VehicleIdentityRecipe,
  type VehicleMotionState,
} from '../../../../src/index.js';
import type { DoodleSceneAsset } from './doodle-scene.js';
import type { VehicleEffectSource } from './drift-effects.js';
import {
  createVehicleCollisionProfile,
  type VehicleCollisionProfile,
} from './obstacle-collision.js';
import type { RacerSnapshot } from './race-model.js';
const yawQuaternion = new THREE.Quaternion();
const pitchQuaternion = new THREE.Quaternion();
const worldQuaternion = new THREE.Quaternion();
const pitchAxis = new THREE.Vector3(0, 0, 1);
const HOOD_ACTIVATION_RADIUS = 1.18;
const DOOR_ACTIVATION_RADIUS = 1.02;

export type VehicleInteractionPreviewSource = Readonly<{
  key: string;
  interactionId: 'hood' | 'door:left' | 'door:right';
  interactionState: 'closed' | 'open';
  solid: SolidAssetBlueprint<'vehicle'>;
  strokes: ReturnType<typeof createSolidVehicleInkStrokes>;
  partIds: readonly string[];
}>;

type VehicleRenderAsset = {
  identity: VehicleIdentityRecipe;
  solid: SolidAssetBlueprint<'vehicle'>;
  rig: SolidRig;
  strokes: ReturnType<typeof createSolidVehicleInkStrokes>;
  motion: VehicleMotionState;
  previews: Readonly<{
    hood: VehicleInteractionPreviewSource;
    'door:left': VehicleInteractionPreviewSource;
    'door:right': VehicleInteractionPreviewSource;
    configurator: VehicleInteractionPreviewSource;
  }>;
};

export const PAPER_CIRCUIT_VEHICLES = Object.freeze([
  Object.freeze({ id: 'you', name: 'You', seed: 4115, archetype: 'coupe' as const }),
  Object.freeze({ id: 'mica', name: 'Mica', seed: 4879, archetype: 'city' as const }),
  Object.freeze({ id: 'rook', name: 'Rook', seed: 4107, archetype: 'sedan' as const }),
  Object.freeze({ id: 'pip', name: 'Pip', seed: 4129, archetype: 'pickup' as const }),
]);

export type PaperCircuitVehicleId = typeof PAPER_CIRCUIT_VEHICLES[number]['id'];

export type VehicleSeedSelection = Readonly<Record<PaperCircuitVehicleId, number>>;

export const DEFAULT_VEHICLE_SEEDS: VehicleSeedSelection = Object.freeze(
  Object.fromEntries(PAPER_CIRCUIT_VEHICLES.map(({ id, seed }) => [id, seed])) as Record<
    PaperCircuitVehicleId,
    number
  >,
);

export function createPaperCircuitVehicleIdentity(
  vehicleId: PaperCircuitVehicleId,
  seed: number,
): VehicleIdentityRecipe {
  const recipe = PAPER_CIRCUIT_VEHICLES.find(({ id }) => id === vehicleId);
  if (recipe === undefined) throw new Error(`Missing Paper Circuit vehicle recipe: ${vehicleId}`);
  return seed === recipe.seed
    ? createVehicleIdentity(seed, {
      archetype: recipe.archetype,
      roofRack: false,
      spoiler: false,
    })
    : createVehicleIdentity(seed);
}

export type VehicleSelectionSummary = Readonly<{
  vehicleId: PaperCircuitVehicleId;
  name: string;
  archetype: VehicleIdentityRecipe['archetype'];
  doors: VehicleIdentityRecipe['doors']['count'];
  wheelStyle: VehicleIdentityRecipe['wheels']['style'];
  features: readonly string[];
}>;

export type VehicleReplacement = Readonly<{
  previousRig: SolidRig;
  selection: VehicleSelectionSummary;
}>;

export type ExploreVehicleEntry = Readonly<{
  vehicleId: PaperCircuitVehicleId;
  side: 'left' | 'right';
  distance: number;
}>;

export type ExploreVehicleInteraction = Readonly<{
  vehicleId: PaperCircuitVehicleId;
  name: string;
  distance: number;
  preview: VehicleInteractionPreviewSource;
}> & (
  | Readonly<{ kind: 'hood' }>
  | Readonly<{ kind: 'door'; side: 'left' | 'right' }>
);

export class VehicleField {
  private readonly vehicles = new Map<PaperCircuitVehicleId, VehicleRenderAsset>();

  public constructor(seeds: VehicleSeedSelection = DEFAULT_VEHICLE_SEEDS) {
    for (const recipe of PAPER_CIRCUIT_VEHICLES) {
      const seed = seeds[recipe.id];
      const identity = createPaperCircuitVehicleIdentity(recipe.id, seed);
      this.vehicles.set(recipe.id, this.createRenderAsset(recipe.id, identity));
    }
  }

  public doodleAssets(): readonly DoodleSceneAsset[] {
    return Object.freeze([...this.vehicles.values()].map(({ solid, rig, strokes }) => Object.freeze({
      solid,
      rig,
      strokes,
    })));
  }

  public update(
    racers: readonly RacerSnapshot[],
    elapsedSeconds: number,
  ): readonly VehicleEffectSource[] {
    const effectSources: VehicleEffectSource[] = [];
    for (const racer of racers) {
      const asset = this.vehicles.get(racer.id as PaperCircuitVehicleId);
      if (asset === undefined) continue;
      const halfAngle = racer.heading * 0.5;
      const driftLean = Math.max(-0.14, Math.min(0.14, racer.slipAngle * 0.18));
      yawQuaternion.set(0, Math.sin(halfAngle), 0, Math.cos(halfAngle));
      pitchQuaternion.setFromAxisAngle(pitchAxis, racer.pitch);
      worldQuaternion.copy(yawQuaternion).multiply(pitchQuaternion);
      // The root owns world translation, yaw, and terrain pitch. Vehicles are authored with
      // front +X, up +Y and right +Z, so a drift lean belongs on the chassis'
      // local X axis; mutating root.rotation.z pitched the whole car into the
      // track and made the failure look like a disappearing car.
      asset.rig.setWorldPose(Object.freeze({
        position: Object.freeze([racer.x, 0.15 + racer.elevation, racer.z] as const),
        rotation: Object.freeze([
          worldQuaternion.x,
          worldQuaternion.y,
          worldQuaternion.z,
          worldQuaternion.w,
        ] as const),
      }));
      asset.motion = setVehicleMotion(asset.motion, {
        travelDistance: racer.travelDistance,
        speed: racer.speed,
        steering: racer.steering,
        suspension: 0.52 + racer.impact * 0.35,
      });
      applySolidVehicleMotion(
        asset.rig,
        sampleVehicleMotion(asset.identity, asset.motion, elapsedSeconds),
      );
      const chassis = asset.rig.getNode('chassis');
      if (chassis !== null) chassis.rotation.x = driftLean;
      asset.rig.root.updateWorldMatrix(true, true);
      const rearLeft = asset.rig.getNode('wheel:rear:left');
      const rearRight = asset.rig.getNode('wheel:rear:right');
      if (rearLeft === null || rearRight === null) {
        throw new Error(`Vehicle ${racer.id} requires both authored rear wheel nodes`);
      }
      const leftMatrix = rearLeft.matrixWorld.elements;
      const rightMatrix = rearRight.matrixWorld.elements;
      effectSources.push(Object.freeze({
        id: racer.id,
        x: racer.x,
        z: racer.z,
        speed: racer.speed,
        drifting: racer.drifting,
        slipAngle: racer.slipAngle,
        impact: racer.impact,
        rearLeft: Object.freeze({ x: leftMatrix[12], z: leftMatrix[14] }),
        rearRight: Object.freeze({ x: rightMatrix[12], z: rightMatrix[14] }),
      }));
    }
    return Object.freeze(effectSources);
  }

  public setVisible(visible: boolean): void {
    for (const { rig } of this.vehicles.values()) rig.root.visible = visible;
  }

  public collisionRigs(excludedVehicleId: string | null = null): readonly SolidRig[] {
    return Object.freeze([...this.vehicles.entries()]
      .filter(([id]) => id !== excludedVehicleId)
      .map(([, { rig }]) => rig));
  }

  public collisionProfile(vehicleId: string): VehicleCollisionProfile {
    const asset = this.vehicles.get(vehicleId as PaperCircuitVehicleId);
    if (asset === undefined) throw new Error(`Unknown Paper Circuit vehicle: ${vehicleId}`);
    return createVehicleCollisionProfile(asset.identity);
  }

  public worldRotation(vehicleId: string): Quaternion {
    const asset = this.vehicles.get(vehicleId as PaperCircuitVehicleId);
    if (asset === undefined) throw new Error(`Unknown Paper Circuit vehicle: ${vehicleId}`);
    asset.rig.root.updateWorldMatrix(true, false);
    const rotation = asset.rig.root.getWorldQuaternion(new THREE.Quaternion());
    return Object.freeze([rotation.x, rotation.y, rotation.z, rotation.w] as const);
  }

  public nearestEntry(x: number, z: number): ExploreVehicleEntry | null {
    const interaction = this.nearestInteraction(x, z);
    if (interaction?.kind !== 'door') return null;
    return Object.freeze({
      vehicleId: interaction.vehicleId,
      side: interaction.side,
      distance: interaction.distance,
    });
  }

  public nearestInteraction(x: number, z: number): ExploreVehicleInteraction | null {
    let nearest: ExploreVehicleInteraction | null = null;
    let nearestScore = Number.POSITIVE_INFINITY;
    for (const [vehicleId, asset] of this.vehicles) {
      const name = this.vehicleName(vehicleId);
      const hoodPose = asset.rig.getSocketWorldPose('hood:service');
      if (hoodPose !== null) {
        const distance = Math.hypot(x - hoodPose.position[0], z - hoodPose.position[2]);
        const score = distance / HOOD_ACTIVATION_RADIUS;
        if (score <= 1 && score < nearestScore) {
          nearestScore = score;
          nearest = Object.freeze({
            kind: 'hood',
            vehicleId,
            name,
            distance,
            preview: asset.previews.hood,
          });
        }
      }
      for (const side of ['left', 'right'] as const) {
        const entryPose = asset.rig.getSocketWorldPose(`entry:${side}`);
        if (entryPose === null) continue;
        const distance = Math.hypot(x - entryPose.position[0], z - entryPose.position[2]);
        const score = distance / DOOR_ACTIVATION_RADIUS;
        if (score > 1 || score >= nearestScore) continue;
        nearestScore = score;
        nearest = Object.freeze({
          kind: 'door',
          side,
          vehicleId,
          name,
          distance,
          preview: asset.previews[`door:${side}`],
        });
      }
    }
    return nearest;
  }

  public setDoorOpen(vehicleId: string, side: 'left' | 'right', open: boolean): void {
    const asset = this.vehicles.get(vehicleId as PaperCircuitVehicleId);
    if (asset === undefined) return;
    asset.rig.setInteractionState(`door:${side}`, open ? 'open' : 'closed');
  }

  public setHoodOpen(vehicleId: PaperCircuitVehicleId, open: boolean): void {
    this.vehicles.get(vehicleId)?.rig.setInteractionState('hood', open ? 'open' : 'closed');
  }

  public interactionPreview(
    vehicleId: string,
    interactionId: VehicleInteractionPreviewSource['interactionId'],
  ): VehicleInteractionPreviewSource {
    const asset = this.vehicles.get(vehicleId as PaperCircuitVehicleId);
    if (asset === undefined) throw new Error(`Unknown Paper Circuit vehicle: ${vehicleId}`);
    return asset.previews[interactionId];
  }

  public configuratorPreview(vehicleId: PaperCircuitVehicleId): VehicleInteractionPreviewSource {
    const asset = this.vehicles.get(vehicleId);
    if (asset === undefined) throw new Error(`Unknown Paper Circuit vehicle: ${vehicleId}`);
    return asset.previews.configurator;
  }

  public selection(vehicleId: PaperCircuitVehicleId): VehicleSelectionSummary {
    const asset = this.vehicles.get(vehicleId);
    if (asset === undefined) throw new Error(`Unknown Paper Circuit vehicle: ${vehicleId}`);
    const recipe = PAPER_CIRCUIT_VEHICLES.find(({ id }) => id === vehicleId);
    if (recipe === undefined) throw new Error(`Missing Paper Circuit vehicle recipe: ${vehicleId}`);
    const features = [
      asset.identity.details.roofRack ? 'roof rack' : null,
      asset.identity.details.spoiler ? 'spoiler' : null,
      asset.identity.details.towHitch ? 'tow hitch' : null,
      asset.identity.details.spareWheel ? 'spare wheel' : null,
    ].filter((feature): feature is string => feature !== null);
    return Object.freeze({
      vehicleId,
      name: recipe.name,
      archetype: asset.identity.archetype,
      doors: asset.identity.doors.count,
      wheelStyle: asset.identity.wheels.style,
      features: Object.freeze(features),
    });
  }

  public replaceVehicle(vehicleId: PaperCircuitVehicleId, seed: number): VehicleReplacement {
    const previous = this.vehicles.get(vehicleId);
    if (previous === undefined) throw new Error(`Unknown Paper Circuit vehicle: ${vehicleId}`);
    const next = this.createRenderAsset(
      vehicleId,
      createPaperCircuitVehicleIdentity(vehicleId, seed),
    );
    next.rig.setWorldPose(previous.rig.getInstanceState().transform);
    next.rig.root.visible = previous.rig.root.visible;
    next.motion = previous.motion;
    this.vehicles.set(vehicleId, next);
    return Object.freeze({
      previousRig: previous.rig,
      selection: this.selection(vehicleId),
    });
  }

  public entryPosition(
    vehicleId: string,
    side: 'left' | 'right',
  ): Readonly<{ x: number; y: number; z: number }> | null {
    const pose = this.vehicles.get(vehicleId as PaperCircuitVehicleId)
      ?.rig.getSocketWorldPose(`entry:${side}`);
    if (pose === null || pose === undefined) return null;
    return Object.freeze({ x: pose.position[0], y: pose.position[1], z: pose.position[2] });
  }

  public dispose(): void {
    for (const { rig } of this.vehicles.values()) rig.dispose();
    this.vehicles.clear();
  }

  private createRenderAsset(
    vehicleId: PaperCircuitVehicleId,
    identity: VehicleIdentityRecipe,
  ): VehicleRenderAsset {
    const solid = createSolidVehicleBlueprint(identity, {
      artDirection: 'storybook',
      physical: Object.freeze({ finish: 'matte' }),
    });
    const strokes = createSolidVehicleInkStrokes(solid);
    const preview = (
      key: string,
      interactionId: VehicleInteractionPreviewSource['interactionId'],
      interactionState: VehicleInteractionPreviewSource['interactionState'],
      partIds: readonly string[],
    ): VehicleInteractionPreviewSource => Object.freeze({
      key: `${solid.assetId}:${key}`,
      interactionId,
      interactionState,
      solid,
      strokes,
      partIds: Object.freeze([...partIds]),
    });
    return {
      identity,
      solid,
      rig: new SolidRig(solid, { instanceId: `paper-circuit:${vehicleId}` }),
      strokes,
      motion: createVehicleMotionState(),
      previews: Object.freeze({
        hood: preview('hood', 'hood', 'closed', ['hood']),
        'door:left': preview(
          'door:left',
          'door:left',
          'closed',
          solid.parts.filter(({ node }) => node === 'door:left').map(({ id }) => id),
        ),
        'door:right': preview(
          'door:right',
          'door:right',
          'closed',
          solid.parts.filter(({ node }) => node === 'door:right').map(({ id }) => id),
        ),
        configurator: preview(
          'configurator',
          'hood',
          'open',
          solid.parts.map(({ id }) => id),
        ),
      }),
    };
  }

  private vehicleName(vehicleId: PaperCircuitVehicleId): string {
    const recipe = PAPER_CIRCUIT_VEHICLES.find(({ id }) => id === vehicleId);
    if (recipe === undefined) throw new Error(`Missing Paper Circuit vehicle recipe: ${vehicleId}`);
    return recipe.name;
  }
}
