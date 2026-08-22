import {
  validateAssetFamilyAuthoringSchema,
  type AssetAuthoringChoiceParameter,
  type AssetAuthoringValue,
  type AssetFamilyAuthoringSchema,
} from '../../../authoring/family-schema.js';

function choice(
  id: string,
  label: string,
  values: readonly (readonly [AssetAuthoringValue, string])[],
  rasterLayerIds?: readonly string[],
  description?: string,
): AssetAuthoringChoiceParameter {
  return Object.freeze({
    id,
    label,
    kind: 'choice',
    defaultValue: null,
    ...(description === undefined ? {} : { description }),
    ...(rasterLayerIds === undefined ? {} : {
      preview: Object.freeze({ rasterLayerIds: Object.freeze([...rasterLayerIds]) }),
    }),
    options: Object.freeze(values.map(([value, optionLabel]) => Object.freeze({
      value,
      label: optionLabel,
    }))),
  });
}

const generated = [null, 'From seed'] as const;

export const BUILDING_AUTHORING_SCHEMA: AssetFamilyAuthoringSchema =
  validateAssetFamilyAuthoringSchema(Object.freeze({
    id: 'building',
    label: 'Building',
    description: 'Shape the architecture while both projections preserve the same structure.',
    parameters: Object.freeze([
      choice('archetype', 'Building type', [
        generated, ['cottage', 'Cottage'], ['townhouse', 'Townhouse'],
        ['apartment', 'Apartment'], ['high-rise', 'High-rise'],
      ], undefined, 'The archetype sets the useful range of floors, bays, roofs, and features.'),
      choice('roof', 'Roof', [
        generated, ['flat', 'Flat'], ['gable', 'Gable'], ['crooked', 'Crooked'],
        ['shed', 'Shed'], ['mansard', 'Mansard'],
      ], ['building:roof'], 'Only the roof is shown here; the full building updates in both views.'),
      choice('doorStyle', 'Door', [
        generated, ['arched', 'Arched'], ['panel', 'Panel'], ['plank', 'Plank'],
      ], ['door'], 'Every building keeps a door and its openable interaction.'),
      choice('balcony', 'Balconies', [
        generated, [true, 'On'], [false, 'Off'],
      ], ['building:balconies'], 'Larger buildings may generate several balconies across their façade.'),
      choice('chimney', 'Chimney', [
        generated, [true, 'On'], [false, 'Off'],
      ], ['building:chimney'], 'A semantic roof feature with real depth in Doodle 3D.'),
    ]),
  }));
