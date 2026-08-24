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
  type VehicleIdentityRecipe,
  type VehicleMotionState,
} from '../../../../src/index.js';
import type { DoodleSceneAsset } from './doodle-scene.js';
import type { RacerSnapshot } from './race-model.js';

type VehicleRenderAsset = {
  identity: VehicleIdentityRecipe;
  solid: SolidAssetBlueprint<'vehicle'>;
  rig: SolidRig;
  motion: VehicleMotionState;
};

const VEHICLE_RECIPES = Object.freeze([
  Object.freeze({ id: 'you', seed: 4115, archetype: 'coupe' as const }),
  Object.freeze({ id: 'mica', seed: 4879, archetype: 'city' as const }),
  Object.freeze({ id: 'rook', seed: 4107, archetype: 'sedan' as const }),
  Object.freeze({ id: 'pip', seed: 4129, archetype: 'pickup' as const }),
]);

export class VehicleField {
  private readonly vehicles = new Map<string, VehicleRenderAsset>();

  public constructor() {
    for (const recipe of VEHICLE_RECIPES) {
      const identity = createVehicleIdentity(recipe.seed, {
        archetype: recipe.archetype,
        roofRack: false,
        spoiler: false,
      });
      const solid = createSolidVehicleBlueprint(identity, { finish: 'matte' });
      const rig = new SolidRig(solid, { instanceId: `paper-circuit:${recipe.id}` });
      this.vehicles.set(recipe.id, {
        identity,
        solid,
        rig,
        motion: createVehicleMotionState(),
      });
    }
  }

  public doodleAssets(): readonly DoodleSceneAsset[] {
    return Object.freeze([...this.vehicles.values()].map(({ solid, rig }) => Object.freeze({
      solid,
      rig,
      strokes: createSolidVehicleInkStrokes(solid),
    })));
  }

  public update(racers: readonly RacerSnapshot[], elapsedSeconds: number): void {
    for (const racer of racers) {
      const asset = this.vehicles.get(racer.id);
      if (asset === undefined) continue;
      const halfAngle = racer.heading * 0.5;
      asset.rig.setWorldPose(Object.freeze({
        position: Object.freeze([racer.x, 0.15, racer.z] as const),
        rotation: Object.freeze([0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] as const),
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
      const driftLean = Math.max(-0.14, Math.min(0.14, racer.slipAngle * 0.18));
      asset.rig.root.rotation.z = driftLean;
    }
  }

  public dispose(): void {
    for (const { rig } of this.vehicles.values()) rig.dispose();
    this.vehicles.clear();
  }
}
