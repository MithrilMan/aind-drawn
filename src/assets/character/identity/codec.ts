import { AssetValidationCollector } from '../../../validation/value-validator.js';
import {
  colorRecord,
  finishIdentity,
  validateColor,
  validateFiniteFields,
  validateIdentityRoot,
  validatePositiveFields,
} from '../../../codecs/identity-validation.js';
import type { CharacterIdentityRecipe } from './recipe.js';

const SPECIES = ['human', 'cat', 'nightmare', 'creature', 'robot'] as const;
const HEAD_SHAPES = ['round', 'square', 'pear', 'drop', 'lump', 'tall', 'wide'] as const;
const EYE_STYLES = ['saucer', 'dot', 'sleepy', 'void', 'star'] as const;
const MOUTH_STYLES = [
  'tiny', 'smile', 'frown', 'zigzag', 'open', 'flat', 'cat', 'grin', 'maw',
  'fangs', 'buckteeth', 'stitch',
] as const;
const DENTAL_STYLES = ['none', 'row', 'grit', 'fangs', 'buck'] as const;
const HAIR_STYLES = ['none', 'cap', 'bob', 'fringe', 'spikes', 'tuft', 'quiff', 'crown'] as const;
const OUTFIT_STYLES = ['plain', 'stripe', 'star', 'buttons'] as const;
const NOSE_STYLES = ['none', 'button', 'drop'] as const;
const EAR_STYLES = ['none', 'round', 'pointed'] as const;
const FACIAL_HAIR_STYLES = ['none', 'full-rounded'] as const;

/** Decodes an untrusted JSON value into a detached, deeply immutable character identity. */
export function decodeCharacterIdentity(input: unknown): CharacterIdentityRecipe {
  const collector = new AssetValidationCollector();
  const root = validateIdentityRoot(input, 'character', [
    'species', 'palette', 'head', 'eyes', 'brows', 'ears', 'nose', 'mouth', 'hair',
    'facialHair', 'accessories', 'body', 'outfit', 'tail',
  ], collector);
  collector.oneOf(root.species, ['species'], SPECIES);

  colorRecord(root.palette, ['palette'], [
    'skin', 'cloth', 'hair', 'accent', 'ink', 'sclera', 'tear', 'skinAccent',
  ], collector);

  const head = collector.object(root.head, ['head'], [
    'shape', 'width', 'height', 'wobble', 'tilt', 'phase',
  ]);
  collector.oneOf(head.shape, ['head', 'shape'], HEAD_SHAPES);
  validatePositiveFields(head, ['head'], ['width', 'height'], collector);
  collector.number(head.wobble, ['head', 'wobble'], { minimum: 0 });
  validateFiniteFields(head, ['head'], ['tilt', 'phase'], collector);

  const eyes = collector.object(root.eyes, ['eyes'], [
    'style', 'alternateStyle', 'spacing', 'size', 'verticalOffset', 'glint',
  ]);
  collector.oneOf(eyes.style, ['eyes', 'style'], EYE_STYLES);
  if (eyes.alternateStyle !== null) {
    collector.oneOf(eyes.alternateStyle, ['eyes', 'alternateStyle'], EYE_STYLES);
  }
  collector.number(eyes.spacing, ['eyes', 'spacing'], { exclusiveMinimum: 0, maximum: 1 });
  collector.number(eyes.size, ['eyes', 'size'], { exclusiveMinimum: 0 });
  collector.number(eyes.verticalOffset, ['eyes', 'verticalOffset']);
  collector.boolean(eyes.glint, ['eyes', 'glint']);

  const brows = collector.object(root.brows, ['brows'], ['present', 'lift', 'tilt']);
  collector.boolean(brows.present, ['brows', 'present']);
  validateFiniteFields(brows, ['brows'], ['lift', 'tilt'], collector);

  const ears = collector.object(root.ears, ['ears'], ['style', 'size']);
  collector.oneOf(ears.style, ['ears', 'style'], EAR_STYLES);
  collector.number(ears.size, ['ears', 'size'], { exclusiveMinimum: 0 });

  const nose = collector.object(root.nose, ['nose'], ['present', 'style', 'size', 'length']);
  collector.boolean(nose.present, ['nose', 'present']);
  collector.oneOf(nose.style, ['nose', 'style'], NOSE_STYLES);
  validatePositiveFields(nose, ['nose'], ['size', 'length'], collector);
  if (typeof nose.present === 'boolean' && typeof nose.style === 'string') {
    if (nose.present !== (nose.style !== 'none')) {
      collector.issue(['nose', 'present'], 'identity.invariant', 'Nose presence must match its style');
    }
  }

  const mouth = collector.object(root.mouth, ['mouth'], [
    'style', 'width', 'verticalOffset', 'teeth', 'toothCount', 'tongue',
  ]);
  collector.oneOf(mouth.style, ['mouth', 'style'], MOUTH_STYLES);
  collector.number(mouth.width, ['mouth', 'width'], { exclusiveMinimum: 0, maximum: 1 });
  collector.number(mouth.verticalOffset, ['mouth', 'verticalOffset'], { minimum: 0, maximum: 1 });
  collector.oneOf(mouth.teeth, ['mouth', 'teeth'], DENTAL_STYLES);
  collector.number(mouth.toothCount, ['mouth', 'toothCount'], { integer: true, minimum: 0 });
  collector.boolean(mouth.tongue, ['mouth', 'tongue']);

  const hair = collector.object(root.hair, ['hair'], ['style', 'height']);
  collector.oneOf(hair.style, ['hair', 'style'], HAIR_STYLES);
  collector.number(hair.height, ['hair', 'height'], { minimum: 0 });

  const facialHair = collector.object(root.facialHair, ['facialHair'], [
    'style', 'width', 'length', 'bulk',
  ]);
  collector.oneOf(facialHair.style, ['facialHair', 'style'], FACIAL_HAIR_STYLES);
  validatePositiveFields(facialHair, ['facialHair'], ['width', 'length', 'bulk'], collector);

  const accessories = collector.array(root.accessories, ['accessories']);
  const accessoryKinds = new Set<string>();
  accessories.forEach((value, index) => {
    const path = ['accessories', index] as const;
    const accessory = collector.object(value, path, [
      'kind', 'style', 'color', 'lensWidth', 'lensHeight', 'bridgeWidth',
      'frameThickness', 'verticalOffset', 'spatial',
    ]);
    collector.literal(accessory.kind, [...path, 'kind'], 'eyewear');
    collector.literal(accessory.style, [...path, 'style'], 'heavy-square');
    validateColor(accessory.color, [...path, 'color'], collector);
    validatePositiveFields(accessory, path, [
      'lensWidth', 'lensHeight', 'bridgeWidth', 'frameThickness',
    ], collector);
    collector.number(accessory.verticalOffset, [...path, 'verticalOffset']);
    const spatial = collector.object(accessory.spatial, [...path, 'spatial'], [
      'kind', 'host', 'rearReach',
    ]);
    collector.literal(spatial.kind, [...path, 'spatial', 'kind'], 'wrap');
    collector.literal(spatial.host, [...path, 'spatial', 'host'], 'head');
    collector.number(spatial.rearReach, [...path, 'spatial', 'rearReach'], {
      exclusiveMinimum: 0,
    });
    if (typeof accessory.kind === 'string') {
      if (accessoryKinds.has(accessory.kind)) {
        collector.issue([...path, 'kind'], 'id.duplicate', `Duplicate accessory ${accessory.kind}`);
      }
      accessoryKinds.add(accessory.kind);
    }
  });

  const body = collector.object(root.body, ['body'], [
    'width', 'height', 'armLength', 'legLength', 'stance',
  ]);
  validatePositiveFields(body, ['body'], [
    'width', 'height', 'armLength', 'legLength', 'stance',
  ], collector);

  const outfit = collector.object(root.outfit, ['outfit'], ['style', 'scale']);
  collector.oneOf(outfit.style, ['outfit', 'style'], OUTFIT_STYLES);
  collector.number(outfit.scale, ['outfit', 'scale'], { exclusiveMinimum: 0 });

  const tail = collector.object(root.tail, ['tail'], ['present', 'length', 'curl']);
  collector.boolean(tail.present, ['tail', 'present']);
  collector.number(tail.length, ['tail', 'length'], { exclusiveMinimum: 0 });
  collector.number(tail.curl, ['tail', 'curl']);

  return finishIdentity(input, collector) as unknown as CharacterIdentityRecipe;
}
