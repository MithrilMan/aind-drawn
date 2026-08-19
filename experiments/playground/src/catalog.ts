import {
  createCharacterBlueprint,
  createCharacterRecipe,
  createPropBlueprint,
  createPropRecipe,
  createSceneryBlueprint,
  createSceneryRecipe,
  type AssetBlueprint,
  type CharacterSpecies,
  type PropKind,
  type SceneryRecipe,
} from '../../../src/index.js';
import type { AssetKind, SceneObjectData } from './document.js';

export type CatalogEntry = Readonly<{
  kind: AssetKind;
  label: string;
  category: 'Characters' | 'Structures' | 'Props';
  semanticResize: boolean;
  minimumWidth: number;
  minimumHeight: number;
}>;

export const CATALOG: readonly CatalogEntry[] = Object.freeze([
  { kind: 'character:human', label: 'Character', category: 'Characters', semanticResize: false, minimumWidth: 0.55, minimumHeight: 0.85 },
  { kind: 'character:cat', label: 'Cat', category: 'Characters', semanticResize: false, minimumWidth: 0.55, minimumHeight: 0.85 },
  { kind: 'character:nightmare', label: 'Creature', category: 'Characters', semanticResize: false, minimumWidth: 0.55, minimumHeight: 0.85 },
  { kind: 'building', label: 'House', category: 'Structures', semanticResize: true, minimumWidth: 2.2, minimumHeight: 2.4 },
  { kind: 'platform', label: 'Platform', category: 'Structures', semanticResize: true, minimumWidth: 0.8, minimumHeight: 0.3 },
  { kind: 'crate', label: 'Crate', category: 'Props', semanticResize: false, minimumWidth: 0.35, minimumHeight: 0.35 },
  { kind: 'lantern', label: 'Lantern', category: 'Props', semanticResize: false, minimumWidth: 0.28, minimumHeight: 0.4 },
  { kind: 'sign', label: 'Sign', category: 'Props', semanticResize: false, minimumWidth: 0.45, minimumHeight: 0.6 },
  { kind: 'shrub', label: 'Shrub', category: 'Props', semanticResize: false, minimumWidth: 0.5, minimumHeight: 0.35 },
]);

export function catalogEntry(kind: AssetKind): CatalogEntry {
  const entry = CATALOG.find((candidate) => candidate.kind === kind);
  if (entry === undefined) {
    throw new Error(`Unregistered asset: ${kind}`);
  }
  return entry;
}

function speciesFor(kind: AssetKind): CharacterSpecies | null {
  if (kind === 'character:human') return 'human';
  if (kind === 'character:cat') return 'cat';
  if (kind === 'character:nightmare') return 'nightmare';
  return null;
}

function propFor(kind: AssetKind): PropKind | null {
  if (kind === 'crate' || kind === 'lantern' || kind === 'sign' || kind === 'shrub') {
    return kind;
  }
  return null;
}

export function createObjectBlueprint(data: SceneObjectData): AssetBlueprint {
  const species = speciesFor(data.kind);
  if (species !== null) {
    return createCharacterBlueprint(createCharacterRecipe(data.seed, {
      species,
      medium: data.medium,
    }));
  }
  const prop = propFor(data.kind);
  if (prop !== null) {
    return createPropBlueprint(createPropRecipe(data.seed, {
      prop,
      medium: data.medium,
    }));
  }
  if (data.kind !== 'building' && data.kind !== 'platform') {
    throw new Error(`Unsupported catalog asset: ${data.kind}`);
  }
  const sceneryOptions = {
    scenery: data.kind,
    medium: data.medium,
    width: data.width,
    height: data.height,
  } as const;
  if (data.kind === 'building' && data.building !== null) {
    return createSceneryBlueprint(createBuildingRecipe(data));
  }
  return createSceneryBlueprint(createSceneryRecipe(data.seed, sceneryOptions));
}

export function createBuildingRecipe(data: SceneObjectData): SceneryRecipe {
  if (data.kind !== 'building' || data.building === null) {
    throw new TypeError('A building scene object is required.');
  }
  const { roof, doorStyle, balcony, chimney } = data.building;
  return createSceneryRecipe(data.seed, {
    scenery: 'building',
    medium: data.medium,
    width: data.width,
    height: data.height,
    ...(roof === null ? {} : { roof }),
    ...(doorStyle === null ? {} : { doorStyle }),
    ...(balcony === null ? {} : { balcony }),
    ...(chimney === null ? {} : { chimney }),
  });
}
