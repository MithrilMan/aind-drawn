import type { SolidPartDefinition } from '../../../contracts/solid-asset.js';
import type { SolidRig } from '../../../runtime/solid-rig.js';
import { solidFaceMotionOf } from '../solid/face/capabilities.js';
import type {
  CharacterMotionPartId,
  CharacterMotionSample,
  CharacterPartMotionSample,
} from './motion.js';

const BODY_NODE_IDS: readonly CharacterMotionPartId[] = [
  'torso', 'head', 'arm:left', 'arm:right', 'leg:left', 'leg:right', 'tail',
];

function faceUnit(rig: SolidRig): number {
  const head = rig.blueprint.parts.find(({ id }) => id === 'head');
  if (head?.geometry.type === 'superellipsoid') return head.geometry.radii[1];
  return (rig.blueprint.bounds.maximum[1] - rig.blueprint.bounds.minimum[1]) * 0.5;
}

function applyBodyPart(
  rig: SolidRig,
  id: CharacterMotionPartId,
  motion: CharacterPartMotionSample,
): void {
  const node = rig.getNode(id);
  if (node === null) return;
  node.position.x += motion.x;
  node.position.y += motion.y;
  node.scale.x *= motion.scaleX;
  node.scale.y *= motion.scaleY;
  node.rotateX(motion.swing - motion.foreground);
  node.rotateZ(motion.roll + motion.swing * 0.12);
}

function applyFacePart(
  rig: SolidRig,
  definition: SolidPartDefinition,
  sample: CharacterMotionSample,
  unit: number,
): void {
  const binding = solidFaceMotionOf(definition);
  if (binding === undefined) return;
  const part = rig.getPart(definition.id);
  if (part === null) return;
  rig.resetPartPose(definition.id);
  if (binding.kind === 'eye') {
    const winkAmount = sample.face.wink === (binding.side < 0 ? 'left' : 'right') ? 0.08 : 1;
    part.translateX(sample.face.gaze.x * binding.gazeTravel[0] * sample.face.blink);
    part.translateY(sample.face.gaze.y * binding.gazeTravel[1] * sample.face.blink);
    part.scale.x *= sample.face.eyeScale;
    part.scale.y *= sample.face.eyeScale
      * sample.face.eyeOpenness
      * winkAmount
      * Math.max(binding.blink.minimumScaleY, sample.face.blink);
  } else if (binding.kind === 'brow') {
    part.translateX(sample.face.gaze.x * unit * 0.04);
    part.translateY(sample.face.gaze.y * unit * 0.035 + sample.face.browLift * unit);
    part.rotateZ(-sample.face.browInnerRaise * binding.side);
  } else if (binding.kind === 'mouth') {
    part.translateX(sample.face.gaze.x * sample.face.gaze.headFollow * unit * 0.04);
    part.translateY(sample.face.gaze.y * sample.face.gaze.headFollow * unit * 0.025);
    part.scale.y *= sample.face.mouthOpenness;
    part.visible = binding.expression === sample.face.mouth;
  } else {
    const flow = sample.flows[binding.sampleId];
    part.visible = flow.active;
    if (!flow.active) return;
    if (binding.attachment === 'free') {
      part.translateX(binding.travel[0] * flow.progress);
      part.translateY(binding.travel[1] * flow.progress);
      part.translateZ(binding.travel[2] * flow.progress);
    }
    part.scale.x *= flow.scaleX;
    part.scale.y *= flow.scaleY;
  }
}

/** Applies one immutable semantic sample from authored rest transforms. */
export function applySolidCharacterMotion(
  rig: SolidRig,
  sample: CharacterMotionSample,
): void {
  if (rig.blueprint.family !== 'character' || rig.getNode('head') === null) {
    throw new TypeError('Solid character motion requires a character rig with a head node');
  }
  for (const id of BODY_NODE_IDS) {
    if (rig.getNode(id) !== null) rig.resetNodePose(id);
  }
  for (const id of BODY_NODE_IDS) applyBodyPart(rig, id, sample.parts[id]);
  const unit = faceUnit(rig);
  const head = rig.getNode('head');
  if (head !== null) {
    head.position.x += sample.face.gaze.x * sample.face.gaze.headFollow * unit * 0.08;
    head.position.y += sample.face.gaze.y * sample.face.gaze.headFollow * unit * 0.055;
    head.rotateX(-sample.face.gaze.y * sample.face.gaze.headFollow * 0.16);
    head.rotateY(sample.face.gaze.x * sample.face.gaze.headFollow * 0.26);
    head.rotateZ(-sample.face.gaze.x * sample.face.gaze.headFollow * 0.05);
  }
  for (const definition of rig.blueprint.parts) applyFacePart(rig, definition, sample, unit);
  rig.root.scale.x = sample.command.facing;
  rig.setPlaybackTime(sample.time);
}
