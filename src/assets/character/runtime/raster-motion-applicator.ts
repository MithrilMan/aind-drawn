import type { BonePose, SpriteRig } from '../../../runtime/sprite-rig.js';
import { characterFlowOf } from '../raster/capabilities.js';
import type {
  CharacterMotionPartId,
  CharacterMotionSample,
  CharacterPartMotionSample,
} from './motion.js';

function faceUnit(rig: SpriteRig): number {
  const headLayer = rig.blueprint.layers.find(({ id }) => id === 'head');
  return (headLayer?.world.height ?? rig.blueprint.bounds.height) * 0.25;
}

function poseFor(
  id: string,
  part: CharacterPartMotionSample,
  sample: CharacterMotionSample,
  unit: number,
): BonePose {
  let x = part.x;
  let y = part.y;
  let rotation = part.swing + part.roll;
  let scaleX = part.scaleX;
  let scaleY = part.scaleY;
  if (id === 'head') {
    x += sample.face.gaze.x * 0.025;
    rotation -= sample.face.gaze.x * 0.075;
  } else if (id === 'eye:left' || id === 'eye:right') {
    scaleX *= sample.face.eyeScale;
    scaleY *= sample.face.eyeScale * sample.face.eyeOpenness;
  } else if (id === 'brow:left' || id === 'brow:right') {
    const side = id === 'brow:left' ? -1 : 1;
    y += sample.face.browLift * unit;
    rotation -= sample.face.browInnerRaise * side;
  }
  return { x, y, rotation, scaleX, scaleY };
}

function setLayerStateIfPresent(rig: SpriteRig, id: string, state: string): void {
  if (rig.layerIds.includes(id)) rig.setLayerState(id, state);
}

/** Applies one immutable semantic sample without retaining projection time. */
export function applyRasterCharacterMotion(
  rig: SpriteRig,
  sample: CharacterMotionSample,
): void {
  if (rig.blueprint.family !== 'character') {
    throw new TypeError('Raster character motion requires a character rig');
  }
  rig.resetPose();
  const unit = faceUnit(rig);
  for (const [id, part] of Object.entries(sample.parts) as readonly [
    CharacterMotionPartId,
    CharacterPartMotionSample,
  ][]) {
    if (rig.getBone(id) !== null) rig.setBonePose(id, poseFor(id, part, sample, unit));
  }
  for (const side of ['left', 'right'] as const) {
    const eyeId = `eye:${side}` as const;
    if (rig.getBone(eyeId) !== null) {
      rig.setBonePose(eyeId, poseFor(eyeId, {
        x: 0, y: 0, swing: 0, roll: 0, foreground: 0, scaleX: 1, scaleY: 1,
      }, sample, unit));
    }
    const browId = `brow:${side}` as const;
    if (rig.getBone(browId) !== null) {
      rig.setBonePose(browId, poseFor(browId, {
        x: 0, y: 0, swing: 0, roll: 0, foreground: 0, scaleX: 1, scaleY: 1,
      }, sample, unit));
    }
  }
  setLayerStateIfPresent(rig, 'eye:left', sample.face.eyeState);
  setLayerStateIfPresent(rig, 'eye:right', sample.face.eyeState);
  setLayerStateIfPresent(rig, 'mouth', sample.face.mouth);
  for (const layer of rig.blueprint.layers) {
    const binding = characterFlowOf(layer);
    if (binding === undefined) continue;
    const flow = sample.flows[binding.sampleId];
    rig.setLayerState(layer.id, flow.active ? binding.activationState : 'idle');
    rig.setBonePose(layer.bone, {
      x: binding.attachment === 'free' ? binding.travel.x * flow.progress : 0,
      y: binding.attachment === 'free' ? binding.travel.y * flow.progress : 0,
      scaleX: flow.scaleX,
      scaleY: flow.scaleY,
    });
  }
  rig.root.scale.x = sample.command.facing;
  rig.setPlaybackTime(sample.time);
}
