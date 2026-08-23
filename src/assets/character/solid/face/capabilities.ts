import type { Point3 } from '../../../../core/geometry3.js';
import type { CharacterExpression } from '../../identity/expression-profile.js';
import type { CharacterTearMotionId } from '../../identity/tear-profile.js';
import { createAssetCapability, readAssetCapability, type AssetCapability } from '../../../../contracts/asset-capabilities.js';
import type { SolidPartDefinition } from '../../../../contracts/solid-asset.js';

const SOLID_FACE_CAPABILITY = 'aind.solid-face.motion/v1';

export type SolidFaceMotionCapability =
  | Readonly<{
    kind: 'eye';
    side: -1 | 1;
    gazeTravel: readonly [x: number, y: number];
    blink: Readonly<{ minimumScaleY: number }>;
  }>
  | Readonly<{ kind: 'brow'; side: -1 | 1 }>
  | Readonly<{ kind: 'mouth'; expression: CharacterExpression }>
  | Readonly<{
    kind: 'flow-effect';
    sampleId: CharacterTearMotionId;
    attachment: 'source' | 'free';
    activationState: string;
    travel: Point3;
  }>;

export function solidFaceMotionCapability(
  data: SolidFaceMotionCapability,
): AssetCapability {
  return createAssetCapability(SOLID_FACE_CAPABILITY, data);
}

export function solidFaceMotionOf(
  part: SolidPartDefinition,
): SolidFaceMotionCapability | undefined {
  return readAssetCapability<SolidFaceMotionCapability>(
    part.capabilities,
    SOLID_FACE_CAPABILITY,
    (data) => data as SolidFaceMotionCapability,
  );
}
