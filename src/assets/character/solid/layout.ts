import type { Bounds3, Point3 } from '../../../core/geometry3.js';
import type { SolidNodeDefinition, SocketMap3 } from '../../../contracts/solid-asset.js';
import { buildSolidFaceLayout, type SolidFaceLayout } from './face/layout.js';
import type { SolidCharacterRecipe } from './recipe.js';

export type SolidCharacterLayout = Readonly<{
  face: SolidFaceLayout;
  torso: Readonly<{
    width: number;
    height: number;
    depth: number;
    center: Point3;
  }>;
  limbs: Readonly<{
    armLength: number;
    armRadius: number;
    legLength: number;
    legRadius: number;
    shoulderX: number;
    hipX: number;
  }>;
  headCenter: Point3;
  nodes: readonly SolidNodeDefinition[];
  bounds: Bounds3;
  sockets: SocketMap3;
}>;

function point(x: number, y: number, z = 0): Point3 {
  return Object.freeze([x, y, z] as const);
}

export function buildSolidCharacterLayout(recipe: SolidCharacterRecipe): SolidCharacterLayout {
  const identity = recipe.identity;
  const face = buildSolidFaceLayout(recipe);
  const headRadiusX = face.shape.radii[0];
  const headRadiusY = face.shape.radii[1];
  const headRadiusZ = face.shape.radii[2];
  const torsoWidth = identity.body.width;
  const torsoHeight = identity.body.height;
  const torsoDepth = Math.max(0.16, Math.min(headRadiusZ * 0.72, torsoWidth * 0.42));
  const armLength = identity.body.armLength;
  const legLength = identity.body.legLength;
  const armRadius = Math.max(0.045, torsoWidth * (identity.species === 'cat' ? 0.095 : 0.075));
  const legRadius = Math.max(0.055, torsoWidth * (identity.species === 'cat' ? 0.11 : 0.09));
  const shoulderX = torsoWidth * 0.46;
  const hipX = torsoWidth * identity.body.stance;
  const headCenterY = legLength + torsoHeight + identity.head.height * 0.27;
  const headForward = torsoDepth * 0.32;
  const headCenter = point(0, headCenterY, headForward);
  const torsoCenter = point(0, legLength + torsoHeight * 0.5);
  const handY = legLength + torsoHeight * 0.76 - armLength;
  const maximumHairY = identity.hair.style === 'none'
    ? headCenterY + headRadiusY
    : headCenterY + headRadiusY * (1.32 + identity.hair.height * 0.32);
  const bodyHalfWidth = Math.max(
    headRadiusX,
    torsoWidth * 0.5,
    shoulderX + armRadius * 1.6,
  );
  const tailReach = identity.tail.present
    ? torsoWidth * 0.38 + identity.tail.length
    : bodyHalfWidth;
  const minimumX = -bodyHalfWidth * 1.08;
  const maximumX = Math.max(bodyHalfWidth * 1.08, tailReach);
  const maximumY = Math.max(maximumHairY, headCenterY + headRadiusY * 1.08);
  const maximumZ = Math.max(
    headForward + headRadiusZ,
    torsoDepth,
    armRadius,
    legRadius,
  ) * 1.12;

  const nodes: SolidNodeDefinition[] = [
    Object.freeze({ id: 'root', position: point(0, 0) }),
    Object.freeze({ id: 'torso', parentNode: 'root', position: point(0, legLength) }),
    Object.freeze({ id: 'leg:left', parentNode: 'root', position: point(-hipX, legLength) }),
    Object.freeze({ id: 'leg:right', parentNode: 'root', position: point(hipX, legLength) }),
    Object.freeze({
      id: 'arm:left', parentNode: 'torso',
      position: point(-shoulderX, torsoHeight * 0.76),
    }),
    Object.freeze({
      id: 'arm:right', parentNode: 'torso',
      position: point(shoulderX, torsoHeight * 0.76),
    }),
    Object.freeze({
      id: 'head', parentNode: 'torso',
      position: point(0, torsoHeight + identity.head.height * 0.27, headForward),
    }),
  ];
  if (identity.tail.present) {
    nodes.push(Object.freeze({
      id: 'tail', parentNode: 'torso',
      position: point(torsoWidth * 0.38, torsoHeight * 0.28, -torsoDepth * 0.22),
    }));
  }

  return Object.freeze({
    face,
    torso: Object.freeze({
      width: torsoWidth,
      height: torsoHeight,
      depth: torsoDepth,
      center: torsoCenter,
    }),
    limbs: Object.freeze({
      armLength,
      armRadius,
      legLength,
      legRadius,
      shoulderX,
      hipX,
    }),
    headCenter,
    nodes: Object.freeze(nodes),
    bounds: Object.freeze({
      minimum: point(minimumX, 0, -maximumZ),
      maximum: point(maximumX, maximumY, maximumZ),
    }),
    sockets: Object.freeze({
      feet: point(0, 0),
      head: headCenter,
      crown: point(0, headCenterY + headRadiusY, headForward),
      face: point(0, headCenterY, headForward + headRadiusZ),
      'hand:left': point(-shoulderX, handY, 0),
      'hand:right': point(shoulderX, handY, 0),
      tail: point(torsoWidth * 0.38, legLength + torsoHeight * 0.28, -torsoDepth * 0.22),
    }),
  });
}
