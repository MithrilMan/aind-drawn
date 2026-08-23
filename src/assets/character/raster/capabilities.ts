import { createAssetCapability, readAssetCapability, type AssetCapability } from '../../../contracts/asset-capabilities.js';
import type { LayerDefinition, Vector2 } from '../../../contracts/raster-asset.js';
import type { CharacterTearMotionId } from '../identity/tear-profile.js';

const CHARACTER_FLOW_CAPABILITY = 'aind.character.flow/v1';

export type CharacterFlowCapability = Readonly<{
  sampleId: CharacterTearMotionId;
  /** Source remains attached; free components travel and restart cyclically. */
  attachment: 'source' | 'free';
  /** Layer state that enables this effect in the character runtime. */
  activationState: string;
  travel: Vector2;
}>;

export function characterFlowCapability(
  data: CharacterFlowCapability,
): AssetCapability {
  return createAssetCapability(CHARACTER_FLOW_CAPABILITY, data);
}

export function characterFlowOf(
  layer: LayerDefinition,
): CharacterFlowCapability | undefined {
  return readAssetCapability<CharacterFlowCapability>(
    layer.capabilities,
    CHARACTER_FLOW_CAPABILITY,
    (data) => data as CharacterFlowCapability,
  );
}
