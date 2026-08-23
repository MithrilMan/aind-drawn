import {
  SEMANTIC_SPATIAL_KINDS,
  type AssetSemanticManifest,
} from '../asset-semantics.js';
import { AssetValidationCollector, type ValidationPath } from '../../validation/value-validator.js';
import { indexById, validateHierarchy } from './shared.js';

export type ManifestValidationIndex = Readonly<{
  partIds: ReadonlySet<string>;
  socketIds: ReadonlySet<string>;
  colliderIds: ReadonlySet<string>;
  interactionStates: ReadonlyMap<string, ReadonlySet<string>>;
}>;

export function validateSemanticManifest(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
  expectedFamily?: string,
): ManifestValidationIndex {
  const manifest = collector.object(value, path, [
    'family', 'parts', 'socketIds', 'colliderIds', 'interactions',
  ]);
  collector.string(manifest.family, [...path, 'family']);
  if (
    typeof manifest.family === 'string'
    && expectedFamily !== undefined
    && manifest.family !== expectedFamily
  ) {
    collector.issue(
      [...path, 'family'],
      'manifest.family',
      `Manifest family ${manifest.family} does not match blueprint family ${expectedFamily}`,
    );
  }

  const parts = collector.array(manifest.parts, [...path, 'parts']);
  if (parts.length === 0) {
    collector.issue([...path, 'parts'], 'array.non_empty', 'A semantic manifest requires parts');
  }
  const indexedParts = indexById(parts, [...path, 'parts'], 'semantic part', collector);
  const parents = new Map<string, string | undefined>();
  const partPaths = new Map<string, ValidationPath>();
  for (const [id, entry] of indexedParts) {
    const part = collector.object(entry.value, entry.path, ['id', 'parentId', 'spatial']);
    collector.oneOf(part.spatial, [...entry.path, 'spatial'], SEMANTIC_SPATIAL_KINDS);
    if ('parentId' in part) collector.string(part.parentId, [...entry.path, 'parentId']);
    parents.set(id, typeof part.parentId === 'string' ? part.parentId : undefined);
    partPaths.set(id, entry.path);
  }
  validateHierarchy(parents, partPaths, 'Semantic part', 'parentId', collector);

  const socketValues = collector.array(manifest.socketIds, [...path, 'socketIds']);
  collector.uniqueStrings(socketValues, [...path, 'socketIds']);
  const socketIds = new Set(socketValues.filter((id): id is string => typeof id === 'string'));
  const colliderValues = collector.array(manifest.colliderIds, [...path, 'colliderIds']);
  collector.uniqueStrings(colliderValues, [...path, 'colliderIds']);
  const colliderIds = new Set(colliderValues.filter((id): id is string => typeof id === 'string'));

  const interactions = collector.array(manifest.interactions, [...path, 'interactions']);
  const indexedInteractions = indexById(
    interactions,
    [...path, 'interactions'],
    'interaction',
    collector,
  );
  const interactionStates = new Map<string, ReadonlySet<string>>();
  for (const [id, entry] of indexedInteractions) {
    const interaction = collector.object(entry.value, entry.path, [
      'id', 'kind', 'initialState', 'states', 'sensorId', 'activationSocketId',
    ]);
    collector.oneOf(interaction.kind, [...entry.path, 'kind'], ['toggle', 'portal'] as const);
    const states = collector.array(interaction.states, [...entry.path, 'states']);
    if (states.length === 0) {
      collector.issue(
        [...entry.path, 'states'],
        'array.non_empty',
        'An interaction requires states',
      );
    }
    collector.uniqueStrings(states, [...entry.path, 'states']);
    const stateIds = new Set(states.filter((state): state is string => typeof state === 'string'));
    interactionStates.set(id, stateIds);
    collector.string(interaction.initialState, [...entry.path, 'initialState']);
    if (typeof interaction.initialState === 'string' && !stateIds.has(interaction.initialState)) {
      collector.issue(
        [...entry.path, 'initialState'],
        'reference.missing',
        'Initial state is not declared by the interaction',
      );
    }
    collector.string(interaction.sensorId, [...entry.path, 'sensorId']);
    if (typeof interaction.sensorId === 'string' && !colliderIds.has(interaction.sensorId)) {
      collector.issue(
        [...entry.path, 'sensorId'],
        'reference.missing',
        `Interaction sensor ${interaction.sensorId} is absent from the manifest collider inventory`,
      );
    }
    collector.string(interaction.activationSocketId, [...entry.path, 'activationSocketId']);
    if (
      typeof interaction.activationSocketId === 'string'
      && !socketIds.has(interaction.activationSocketId)
    ) {
      collector.issue(
        [...entry.path, 'activationSocketId'],
        'reference.missing',
        `Interaction socket ${interaction.activationSocketId} is absent from the manifest socket inventory`,
      );
    }
  }

  return Object.freeze({
    partIds: new Set(indexedParts.keys()),
    socketIds,
    colliderIds,
    interactionStates,
  });
}

export function validateAssetSemanticManifest<TFamily extends string>(
  manifest: AssetSemanticManifest<TFamily>,
): AssetSemanticManifest<TFamily>;
export function validateAssetSemanticManifest(manifest: unknown): AssetSemanticManifest;
export function validateAssetSemanticManifest(manifest: unknown): AssetSemanticManifest {
  const collector = new AssetValidationCollector();
  validateSemanticManifest(manifest, [], collector);
  collector.finish();
  return manifest as AssetSemanticManifest;
}
