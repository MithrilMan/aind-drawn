export type AssetAuthoringValue = string | number | boolean | null;

export type AssetAuthoringOption = Readonly<{
  value: AssetAuthoringValue;
  label: string;
}>;

export type AssetAuthoringPreview = Readonly<{
  rasterLayerIds?: readonly string[];
  rasterLayerStates?: Readonly<Record<string, string>>;
}>;

type AssetAuthoringParameterBase = Readonly<{
  id: string;
  label: string;
  defaultValue: AssetAuthoringValue;
  description?: string;
  preview?: AssetAuthoringPreview;
}>;

export type AssetAuthoringChoiceParameter = AssetAuthoringParameterBase & Readonly<{
  kind: 'choice';
  options: readonly AssetAuthoringOption[];
}>;

export type AssetAuthoringRangeParameter = AssetAuthoringParameterBase & Readonly<{
  kind: 'range';
  minimum: number;
  maximum: number;
  step: number;
}>;

export type AssetAuthoringToggleParameter = AssetAuthoringParameterBase & Readonly<{
  kind: 'toggle';
  offLabel: string;
  onLabel: string;
}>;

export type AssetAuthoringParameter =
  | AssetAuthoringChoiceParameter
  | AssetAuthoringRangeParameter
  | AssetAuthoringToggleParameter;

/**
 * User-facing authoring metadata for one procedural family.
 *
 * A blueprint is generated output and cannot honestly describe which identity
 * choices are safe to edit. Families publish this small schema next to their
 * recipe adapter; editor shells can then stay generic without reflecting over
 * renderer internals.
 */
export type AssetFamilyAuthoringSchema = Readonly<{
  id: string;
  label: string;
  description: string;
  parameters: readonly AssetAuthoringParameter[];
}>;

function valueKey(value: AssetAuthoringValue): string {
  return `${typeof value}:${String(value)}`;
}

export function validateAssetFamilyAuthoringSchema(
  schema: AssetFamilyAuthoringSchema,
): AssetFamilyAuthoringSchema {
  if (schema.id.trim().length === 0) throw new TypeError('Asset family schema id cannot be empty');
  if (schema.label.trim().length === 0) {
    throw new TypeError(`Asset family ${schema.id} label cannot be empty`);
  }
  if (schema.parameters.length === 0) {
    throw new RangeError(`Asset family ${schema.id} must expose at least one authoring parameter`);
  }

  const parameterIds = new Set<string>();
  for (const parameter of schema.parameters) {
    if (parameterIds.has(parameter.id)) {
      throw new Error(`Asset family ${schema.id} repeats parameter ${parameter.id}`);
    }
    parameterIds.add(parameter.id);
    if (parameter.label.trim().length === 0) {
      throw new TypeError(`Asset authoring parameter ${parameter.id} label cannot be empty`);
    }

    if (parameter.kind === 'choice') {
      if (parameter.options.length === 0) {
        throw new RangeError(`Choice parameter ${parameter.id} must expose at least one option`);
      }
      const optionValues = new Set<string>();
      for (const option of parameter.options) {
        const key = valueKey(option.value);
        if (optionValues.has(key)) {
          throw new Error(`Choice parameter ${parameter.id} repeats option ${String(option.value)}`);
        }
        optionValues.add(key);
        if (option.label.trim().length === 0) {
          throw new TypeError(`Choice parameter ${parameter.id} has an empty option label`);
        }
      }
      if (!optionValues.has(valueKey(parameter.defaultValue))) {
        throw new RangeError(`Choice parameter ${parameter.id} default is not an option`);
      }
    } else if (parameter.kind === 'range') {
      if (typeof parameter.defaultValue !== 'number') {
        throw new TypeError(`Range parameter ${parameter.id} default must be numeric`);
      }
      if (!(parameter.minimum < parameter.maximum)) {
        throw new RangeError(`Range parameter ${parameter.id} minimum must be below maximum`);
      }
      if (!(parameter.step > 0) || !Number.isFinite(parameter.step)) {
        throw new RangeError(`Range parameter ${parameter.id} step must be positive and finite`);
      }
      if (parameter.defaultValue < parameter.minimum || parameter.defaultValue > parameter.maximum) {
        throw new RangeError(`Range parameter ${parameter.id} default is outside its range`);
      }
    } else {
      if (typeof parameter.defaultValue !== 'boolean') {
        throw new TypeError(`Toggle parameter ${parameter.id} default must be boolean`);
      }
      if (parameter.offLabel.trim().length === 0 || parameter.onLabel.trim().length === 0) {
        throw new TypeError(`Toggle parameter ${parameter.id} labels cannot be empty`);
      }
    }
  }

  return schema;
}

export function createDefaultAssetAuthoringValues(
  schema: AssetFamilyAuthoringSchema,
): Readonly<Record<string, AssetAuthoringValue>> {
  validateAssetFamilyAuthoringSchema(schema);
  return Object.freeze(Object.fromEntries(
    schema.parameters.map(({ id, defaultValue }) => [id, defaultValue]),
  ));
}
