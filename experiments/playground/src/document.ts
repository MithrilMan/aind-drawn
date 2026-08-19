import {
  MEDIUM_IDS,
  type DoorStyle,
  type MediumId,
  type RoofStyle,
} from '../../../src/index.js';

export const ASSET_KINDS = [
  'character:human',
  'character:cat',
  'character:nightmare',
  'building',
  'platform',
  'plant:grass',
  'plant:plant',
  'plant:tree',
  'plant:flower',
  'plant:wildcard',
  'crate',
  'lantern',
  'sign',
  'shrub',
] as const;

export type AssetKind = typeof ASSET_KINDS[number];

export type BuildingSettings = {
  roof: RoofStyle | null;
  balcony: boolean | null;
  chimney: boolean | null;
  doorStyle: DoorStyle | null;
  doorState: 'closed' | 'open';
};

export type SceneObjectData = {
  id: string;
  name: string;
  kind: AssetKind;
  seed: number;
  medium: MediumId;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  building: BuildingSettings | null;
};

export type SceneDocument = {
  version: 1;
  name: string;
  objects: SceneObjectData[];
};

const DEFAULT_SIZE: Readonly<Record<AssetKind, Readonly<{ width: number; height: number }>>> = {
  'character:human': { width: 1.45, height: 2.45 },
  'character:cat': { width: 1.55, height: 2.3 },
  'character:nightmare': { width: 1.75, height: 2.65 },
  building: { width: 5, height: 5.4 },
  platform: { width: 4, height: 0.75 },
  'plant:grass': { width: 1.7, height: 1.25 },
  'plant:plant': { width: 1.55, height: 2.05 },
  'plant:tree': { width: 3.4, height: 5.1 },
  'plant:flower': { width: 1.2, height: 2.25 },
  'plant:wildcard': { width: 1.8, height: 2.2 },
  crate: { width: 1.15, height: 1.05 },
  lantern: { width: 0.72, height: 1.08 },
  sign: { width: 1.42, height: 1.76 },
  shrub: { width: 1.58, height: 1.18 },
};

const LABELS: Readonly<Record<AssetKind, string>> = {
  'character:human': 'Character',
  'character:cat': 'Cat',
  'character:nightmare': 'Creature',
  building: 'House',
  platform: 'Platform',
  'plant:grass': 'Grass',
  'plant:plant': 'Houseplant',
  'plant:tree': 'Tree',
  'plant:flower': 'Flower',
  'plant:wildcard': 'Wild plant',
  crate: 'Crate',
  lantern: 'Lantern',
  sign: 'Sign',
  shrub: 'Shrub',
};

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === 'string' && ASSET_KINDS.includes(value as AssetKind);
}

function isMedium(value: unknown): value is MediumId {
  return typeof value === 'string' && MEDIUM_IDS.includes(value as MediumId);
}

function isRoofStyle(value: unknown): value is RoofStyle {
  return value === 'flat'
    || value === 'gable'
    || value === 'crooked'
    || value === 'shed'
    || value === 'mansard';
}

function isDoorStyle(value: unknown): value is DoorStyle {
  return value === 'arched' || value === 'panel' || value === 'plank';
}

export function defaultBuildingSettings(): BuildingSettings {
  return {
    roof: null,
    balcony: null,
    chimney: null,
    doorStyle: null,
    doorState: 'closed',
  };
}

function parseBuildingSettings(value: unknown, objectIndex: number): BuildingSettings {
  if (value === undefined) return defaultBuildingSettings();
  if (!isRecord(value)) {
    throw new TypeError(`House ${objectIndex + 1} has invalid settings.`);
  }
  const { roof, balcony, chimney, doorStyle, doorState } = value;
  if (
    (roof !== null && !isRoofStyle(roof))
    || (balcony !== null && typeof balcony !== 'boolean')
    || (chimney !== null && typeof chimney !== 'boolean')
    || (doorStyle !== null && !isDoorStyle(doorStyle))
    || (doorState !== 'closed' && doorState !== 'open')
  ) {
    throw new TypeError(`House ${objectIndex + 1} has invalid settings.`);
  }
  return { roof, balcony, chimney, doorStyle, doorState };
}

export function defaultSize(kind: AssetKind): Readonly<{ width: number; height: number }> {
  return DEFAULT_SIZE[kind];
}

export function createSceneObject(
  kind: AssetKind,
  ordinal: number,
  position: Readonly<{ x: number; y: number }> = { x: 0, y: 0 },
): SceneObjectData {
  const size = defaultSize(kind);
  return {
    id: `${kind.replace(':', '-')}-${ordinal}`,
    name: `${LABELS[kind]} ${ordinal}`,
    kind,
    seed: 4107 + ordinal * 97,
    medium: 'graphite',
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    rotation: 0,
    building: kind === 'building' ? defaultBuildingSettings() : null,
  };
}

export function nextAvailableOrdinal(
  objects: readonly Pick<SceneObjectData, 'id'>[],
  kind: AssetKind,
  startingAt: number,
): number {
  let ordinal = Number.isFinite(startingAt) ? Math.max(1, Math.trunc(startingAt)) : 1;
  const prefix = `${kind.replace(':', '-')}-`;
  while (objects.some((object) => object.id === `${prefix}${ordinal}`)) {
    ordinal += 1;
  }
  return ordinal;
}

/** Reorders the canonical back-to-front painter stack in place. */
export function moveSceneObjectToLayer(
  objects: SceneObjectData[],
  objectId: string,
  requestedIndex: number,
): boolean {
  const currentIndex = objects.findIndex(({ id }) => id === objectId);
  if (currentIndex < 0 || !Number.isFinite(requestedIndex) || objects.length < 2) return false;
  const targetIndex = Math.max(0, Math.min(objects.length - 1, Math.trunc(requestedIndex)));
  if (targetIndex === currentIndex) return false;
  const [object] = objects.splice(currentIndex, 1);
  if (object === undefined) return false;
  objects.splice(targetIndex, 0, object);
  return true;
}

export function cloneDocument(document: SceneDocument): SceneDocument {
  return structuredClone(document);
}

export function createInitialDocument(): SceneDocument {
  const house = createSceneObject('building', 1, { x: -2.2, y: 3.2 });
  house.width = 5.4;
  house.height = 5.8;
  house.building = {
    roof: 'mansard',
    balcony: true,
    chimney: true,
    doorStyle: 'arched',
    doorState: 'closed',
  };
  const character = createSceneObject('character:human', 2, { x: 2.1, y: 1.45 });
  const lantern = createSceneObject('lantern', 3, { x: 3.45, y: 0.65 });
  const platform = createSceneObject('platform', 4, { x: 1.7, y: 0.38 });
  const flower = createSceneObject('plant:flower', 5, { x: 0.85, y: 1.12 });
  platform.width = 5.6;
  return {
    version: 1,
    name: 'Untitled sketch',
    objects: [house, platform, character, flower, lantern],
  };
}

export function parseSceneDocument(json: string): SceneDocument {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || value.version !== 1 || typeof value.name !== 'string') {
    throw new TypeError('This is not an aind-drawn level document version 1.');
  }
  const objects = value.objects;
  if (!Array.isArray(objects)) {
    throw new TypeError('The document does not contain a valid object list.');
  }
  const ids = new Set<string>();
  const parsedObjects = objects.map((candidate, index): SceneObjectData => {
    if (!isRecord(candidate)) {
      throw new TypeError(`Object ${index + 1} is invalid.`);
    }
    const { id, name, kind, medium, seed, x, y, width, height, rotation } = candidate;
    if (
      typeof id !== 'string'
      || id.length === 0
      || ids.has(id)
      || typeof name !== 'string'
      || !isAssetKind(kind)
      || !isMedium(medium)
      || !finiteNumber(seed)
      || !finiteNumber(x)
      || !finiteNumber(y)
      || !finiteNumber(width)
      || !finiteNumber(height)
      || !finiteNumber(rotation)
      || width <= 0
      || height <= 0
    ) {
      throw new TypeError(`Object ${index + 1} is invalid or duplicated.`);
    }
    ids.add(id);
    return {
      id,
      name,
      kind,
      medium,
      seed: Math.trunc(seed),
      x,
      y,
      width,
      height,
      rotation,
      building: kind === 'building'
        ? parseBuildingSettings(candidate.building, index)
        : null,
    };
  });
  return { version: 1, name: value.name, objects: parsedObjects };
}
