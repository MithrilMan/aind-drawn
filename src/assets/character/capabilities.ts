import { createAssetCapability, readAssetCapability, type AssetCapability } from '../capabilities.js';
import type { LayerDefinition, Vector2 } from '../types.js';

const CHARACTER_FLOW_CAPABILITY = 'aind.character.flow/v1';

export type CharacterFlowCapability = Readonly<{
  /** Source remains attached; free components travel and restart cyclically. */
  attachment: 'source' | 'free';
  /** Layer state that enables this effect in the character runtime. */
  activationState: string;
  phase: number;
  travel: Vector2;
  pulse: number;
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
