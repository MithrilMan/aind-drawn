import type { CharacterExpression } from '../identity/expression-profile.js';
import type { CharacterIdentityRecipe } from '../identity/recipe.js';
import {
  createCharacterTearProfile,
  type CharacterTearMotionId,
} from '../identity/tear-profile.js';
import type { CharacterFlowMotionSample } from './motion.js';

export function sampleCharacterFlows(
  identity: CharacterIdentityRecipe,
  expression: CharacterExpression,
  time: number,
): Readonly<Record<CharacterTearMotionId, CharacterFlowMotionSample>> {
  const flows = {} as Record<CharacterTearMotionId, CharacterFlowMotionSample>;
  const active = expression === 'crying';
  for (const side of ['left', 'right'] as const) {
    for (const component of createCharacterTearProfile(identity).components) {
      const id: CharacterTearMotionId = `tear:${side}:${component.id}`;
      const phase = component.phase + (side === 'left' ? 0 : 0.33);
      if (component.id === 'stream') {
        const wave = Math.sin(time * 4.4 + phase * Math.PI * 2);
        flows[id] = Object.freeze({
          id,
          active,
          progress: 0,
          scaleX: 1 + wave * component.pulse,
          scaleY: 1 - wave * component.pulse * 0.32,
        });
      } else {
        const progress = ((time * 0.86 + phase) % 1 + 1) % 1;
        flows[id] = Object.freeze({
          id,
          active,
          progress,
          scaleX: 1 + Math.sin(progress * Math.PI) * component.pulse,
          scaleY: 0.88 + progress * 0.2,
        });
      }
    }
  }
  return Object.freeze(flows);
}
