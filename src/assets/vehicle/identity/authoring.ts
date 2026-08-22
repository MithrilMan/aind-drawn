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

export const VEHICLE_AUTHORING_SCHEMA: AssetFamilyAuthoringSchema =
  validateAssetFamilyAuthoringSchema(Object.freeze({
    id: 'vehicle',
    label: 'Vehicle',
    description: 'Shape one vehicle identity while every drawing keeps its body, moving parts, and useful anchors.',
    parameters: Object.freeze([
      choice('archetype', 'Vehicle type', [
        generated, ['city', 'City car'], ['coupe', 'Coupé'], ['sedan', 'Sedan'],
        ['van', 'Van'], ['pickup', 'Pickup'],
      ], undefined, 'The body type changes proportions, cabin, carrying space, and useful defaults.'),
      choice('wheelStyle', 'Wheels', [
        generated, ['steel', 'Steel'], ['hubcap', 'Hubcap'], ['sport', 'Sport'],
      ], ['wheel:rear', 'wheel:front'], 'Wheels remain separately articulated in every projection.'),
      choice('doorCount', 'Doors', [generated, [2, 'Two'], [4, 'Four']], ['door:right']),
      choice('roofRack', 'Roof rack', [generated, [true, 'On'], [false, 'Off']], ['detail:roof-rack']),
      choice('spoiler', 'Spoiler', [generated, [true, 'On'], [false, 'Off']], ['detail:spoiler']),
    ]),
  }));
