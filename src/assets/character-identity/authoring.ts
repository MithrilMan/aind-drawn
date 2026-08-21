import {
  validateAssetFamilyAuthoringSchema,
  type AssetAuthoringChoiceParameter,
  type AssetAuthoringValue,
  type AssetFamilyAuthoringSchema,
} from '../../authoring/family-schema.js';

function choice(
  id: string,
  label: string,
  defaultValue: AssetAuthoringValue,
  values: readonly (readonly [AssetAuthoringValue, string])[],
  rasterLayerIds?: readonly string[],
  description?: string,
  rasterLayerStates?: Readonly<Record<string, string>>,
): AssetAuthoringChoiceParameter {
  return Object.freeze({
    id,
    label,
    kind: 'choice',
    defaultValue,
    ...(description === undefined ? {} : { description }),
    ...(rasterLayerIds === undefined ? {} : {
      preview: Object.freeze({
        rasterLayerIds: Object.freeze([...rasterLayerIds]),
        ...(rasterLayerStates === undefined ? {} : { rasterLayerStates }),
      }),
    }),
    options: Object.freeze(values.map(([value, optionLabel]) => Object.freeze({
      value,
      label: optionLabel,
    }))),
  });
}

const generated = [null, 'From seed'] as const;

export const CHARACTER_AUTHORING_SCHEMA: AssetFamilyAuthoringSchema =
  validateAssetFamilyAuthoringSchema(Object.freeze({
    id: 'character',
    label: 'Character',
    description: 'Choose the features that define this character in every projection.',
    parameters: Object.freeze([
      choice('species', 'Character type', 'human', [
        ['human', 'Person'], ['cat', 'Cat'], ['creature', 'Creature'],
        ['nightmare', 'Nightmare'], ['robot', 'Robot'],
      ], undefined, 'The broad character family. It changes the available visual language.'),
      choice('shape', 'Head', null, [
        generated, ['round', 'Round'], ['square', 'Square'], ['pear', 'Pear'],
        ['drop', 'Drop'], ['lump', 'Lumpy'], ['tall', 'Tall'], ['wide', 'Wide'],
      ], ['head'], 'The silhouette shared by the flat drawing and the volume.'),
      choice('eyeStyle', 'Eyes', null, [
        generated, ['saucer', 'Saucer'], ['dot', 'Dot'], ['sleepy', 'Sleepy'],
        ['void', 'Void'], ['star', 'Star'],
      ], ['eye:left', 'eye:right'], 'Eye construction stays synchronized across expressions.'),
      choice('hairStyle', 'Hair', null, [
        generated, ['none', 'None'], ['cap', 'Cap'], ['bob', 'Bob'],
        ['fringe', 'Fringe'], ['spikes', 'Spikes'], ['tuft', 'Tuft'], ['crown', 'Crown'],
      ], ['hair'], 'Hair is authored as topology, not pasted onto the front of the head.'),
      choice('mouthStyle', 'Mouth', null, [
        generated, ['tiny', 'Tiny'], ['smile', 'Smile'], ['frown', 'Frown'],
        ['zigzag', 'Zigzag'], ['open', 'Open'], ['flat', 'Flat'], ['cat', 'Cat'],
        ['grin', 'Grin'], ['maw', 'Maw'], ['fangs', 'Fangs'],
        ['buckteeth', 'Buck teeth'], ['stitch', 'Stitched'],
      ], ['mouth'], 'The authored mouth is then reshaped by the selected expression.', { mouth: 'idle' }),
      choice('mouthTeeth', 'Teeth', null, [
        generated, ['none', 'None'], ['row', 'Row'], ['grit', 'Grit'],
        ['fangs', 'Fangs'], ['buck', 'Buck teeth'],
      ], ['mouth'], 'Dental details belong to identity and remain available to expressions.', { mouth: 'happy' }),
      choice('mouthTongue', 'Tongue', null, [
        generated, [false, 'Off'], [true, 'On'],
      ], ['mouth'], 'Tongue visibility follows mouths and expressions that open.', { mouth: 'surprised' }),
      choice('outfitStyle', 'Outfit', null, [
        generated, ['plain', 'Plain'], ['stripe', 'Stripe'], ['star', 'Star'], ['buttons', 'Buttons'],
      ], ['outfit'], 'One graphic motif, redrawn in both projections.'),
    ]),
  }));
