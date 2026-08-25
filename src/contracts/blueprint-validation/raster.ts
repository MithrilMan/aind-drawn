import type { AssetBlueprint } from '../raster-asset.js';
import { MEDIUM_IDS } from '../../materials/medium.js';
import { AssetValidationCollector, type ValidationPath } from '../../validation/value-validator.js';
import { validateSemanticManifest } from './manifest.js';
import {
  EPSILON,
  finiteTuple,
  indexById,
  validateCapabilities,
  validateAppearance,
  validateExactInventory,
  validateHeader,
  validateHierarchy,
  validateInteractionSensors,
} from './shared.js';

function validateRasterBounds(value: unknown, collector: AssetValidationCollector): void {
  const bounds = collector.object(value, ['bounds'], ['x', 'y', 'width', 'height']);
  collector.number(bounds.x, ['bounds', 'x']);
  collector.number(bounds.y, ['bounds', 'y']);
  collector.number(bounds.width, ['bounds', 'width'], { exclusiveMinimum: 0 });
  collector.number(bounds.height, ['bounds', 'height'], { exclusiveMinimum: 0 });
}

function validatePose2(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  const pose = collector.object(value, path, ['position', 'rotation']);
  const position = collector.object(pose.position, [...path, 'position'], ['x', 'y']);
  collector.number(position.x, [...path, 'position', 'x']);
  collector.number(position.y, [...path, 'position', 'y']);
  collector.number(pose.rotation, [...path, 'rotation']);
}

function validateRasterBones(
  value: unknown,
  collector: AssetValidationCollector,
): ReadonlySet<string> {
  const bones = collector.array(value, ['bones']);
  if (bones.length === 0) {
    collector.issue(['bones'], 'array.non_empty', 'A raster blueprint requires at least one bone');
  }
  const indexed = indexById(bones, ['bones'], 'bone', collector);
  const parents = new Map<string, string | undefined>();
  const paths = new Map<string, ValidationPath>();
  for (const [id, entry] of indexed) {
    const bone = collector.object(entry.value, entry.path, ['id', 'parentBone', 'restPose']);
    if ('parentBone' in bone) collector.string(bone.parentBone, [...entry.path, 'parentBone']);
    validatePose2(bone.restPose, [...entry.path, 'restPose'], collector);
    parents.set(id, typeof bone.parentBone === 'string' ? bone.parentBone : undefined);
    paths.set(id, entry.path);
  }
  validateHierarchy(parents, paths, 'Bone', 'parentBone', collector);
  return new Set(indexed.keys());
}

function validateRasterLayers(
  value: unknown,
  bones: ReadonlySet<string>,
  semanticParts: ReadonlySet<string>,
  collector: AssetValidationCollector,
): ReadonlyMap<string, ReadonlySet<string>> {
  const layers = collector.array(value, ['layers']);
  if (layers.length === 0) {
    collector.issue(['layers'], 'array.non_empty', 'A raster blueprint requires at least one layer');
  }
  indexById(layers, ['layers'], 'layer', collector);
  const statesByLayer = new Map<string, ReadonlySet<string>>();

  layers.forEach((entry, index) => {
    const path = ['layers', index] as const;
    const layer = collector.object(entry, path, [
      'id', 'semanticPartId', 'bone', 'order', 'depth', 'canvas', 'world', 'pivot', 'states',
      'capabilities', 'draw',
    ]);
    collector.string(layer.semanticPartId, [...path, 'semanticPartId']);
    if (typeof layer.semanticPartId === 'string' && !semanticParts.has(layer.semanticPartId)) {
      collector.issue(
        [...path, 'semanticPartId'],
        'reference.missing',
        `Unknown semantic part ${layer.semanticPartId}`,
      );
    }
    collector.string(layer.bone, [...path, 'bone']);
    if (typeof layer.bone === 'string' && !bones.has(layer.bone)) {
      collector.issue([...path, 'bone'], 'reference.missing', `Unknown bone ${layer.bone}`);
    }
    collector.number(layer.order, [...path, 'order']);
    collector.number(layer.depth, [...path, 'depth']);
    const canvas = collector.object(layer.canvas, [...path, 'canvas'], ['width', 'height']);
    collector.number(canvas.width, [...path, 'canvas', 'width'], {
      integer: true,
      exclusiveMinimum: 0,
    });
    collector.number(canvas.height, [...path, 'canvas', 'height'], {
      integer: true,
      exclusiveMinimum: 0,
    });
    const world = collector.object(layer.world, [...path, 'world'], ['width', 'height']);
    collector.number(world.width, [...path, 'world', 'width'], { exclusiveMinimum: 0 });
    collector.number(world.height, [...path, 'world', 'height'], { exclusiveMinimum: 0 });
    finiteTuple(layer.pivot, [...path, 'pivot'], 2, collector);
    const states = collector.array(layer.states, [...path, 'states']);
    if (states.length === 0) {
      collector.issue([...path, 'states'], 'array.non_empty', 'A layer requires at least one state');
    }
    collector.uniqueStrings(states, [...path, 'states']);
    if (typeof layer.draw !== 'function') {
      collector.issue([...path, 'draw'], 'type.function', 'Expected a layer draw function');
    }
    validateCapabilities(layer.capabilities, [...path, 'capabilities'], collector);

    if (typeof layer.id === 'string') {
      statesByLayer.set(
        layer.id,
        new Set(states.filter((state): state is string => typeof state === 'string')),
      );
    }
  });
  return statesByLayer;
}

function validateRasterColliders(
  value: unknown,
  bones: ReadonlySet<string>,
  collector: AssetValidationCollector,
): ReadonlyMap<string, string> {
  const colliders = collector.array(value, ['colliders']);
  indexById(colliders, ['colliders'], 'collider', collector);
  const kinds = new Map<string, string>();
  colliders.forEach((entry, index) => {
    const path = ['colliders', index] as const;
    const collider = collector.object(entry, path);
    collector.oneOf(collider.kind, [...path, 'kind'], ['solid', 'sensor'] as const);
    collector.oneOf(
      collider.shape,
      [...path, 'shape'],
      ['rectangle', 'circle', 'capsule', 'polygon'] as const,
    );
    collector.string(collider.bone, [...path, 'bone']);
    if (typeof collider.bone === 'string' && !bones.has(collider.bone)) {
      collector.issue([...path, 'bone'], 'reference.missing', `Unknown bone ${collider.bone}`);
    }
    validatePose2(collider.localPose, [...path, 'localPose'], collector);
    if (typeof collider.id === 'string' && typeof collider.kind === 'string') {
      kinds.set(collider.id, collider.kind);
    }
    if (collider.shape === 'rectangle') {
      collector.object(entry, path, ['id', 'kind', 'shape', 'bone', 'localPose', 'size']);
      const size = collector.object(collider.size, [...path, 'size'], ['width', 'height']);
      collector.number(size.width, [...path, 'size', 'width'], { exclusiveMinimum: 0 });
      collector.number(size.height, [...path, 'size', 'height'], { exclusiveMinimum: 0 });
      return;
    }
    if (collider.shape === 'circle') {
      collector.object(entry, path, ['id', 'kind', 'shape', 'bone', 'localPose', 'radius']);
      collector.number(collider.radius, [...path, 'radius'], { exclusiveMinimum: 0 });
      return;
    }
    if (collider.shape === 'capsule') {
      collector.object(entry, path, [
        'id', 'kind', 'shape', 'bone', 'localPose', 'radius', 'length', 'axis',
      ]);
      collector.number(collider.radius, [...path, 'radius'], { exclusiveMinimum: 0 });
      collector.number(collider.length, [...path, 'length'], { minimum: 0 });
      collector.oneOf(collider.axis, [...path, 'axis'], ['x', 'y'] as const);
      return;
    }
    if (collider.shape === 'polygon') {
      collector.object(entry, path, ['id', 'kind', 'shape', 'bone', 'localPose', 'points']);
      const points = collector.array(collider.points, [...path, 'points']);
      if (points.length < 3) {
        collector.issue(
          [...path, 'points'],
          'geometry.minimum_points',
          'A polygon requires at least three points',
        );
      }
      let area = 0;
      points.forEach((point, pointIndex) => {
        finiteTuple(point, [...path, 'points', pointIndex], 2, collector);
        const next = points[(pointIndex + 1) % points.length];
        if (
          Array.isArray(point)
          && Array.isArray(next)
          && typeof point[0] === 'number'
          && typeof point[1] === 'number'
          && typeof next[0] === 'number'
          && typeof next[1] === 'number'
        ) {
          area += point[0] * next[1] - next[0] * point[1];
        }
      });
      if (points.length >= 3 && Math.abs(area) <= EPSILON) {
        collector.issue(
          [...path, 'points'],
          'geometry.degenerate',
          'Polygon area must be non-zero',
        );
      }
    }
  });
  return kinds;
}

function validateRasterSockets(
  value: unknown,
  path: ValidationPath,
  bones: ReadonlySet<string>,
  collector: AssetValidationCollector,
): ReadonlySet<string> {
  const sockets = collector.array(value, path);
  const indexed = indexById(sockets, path, 'socket', collector);
  for (const entry of indexed.values()) {
    const socket = collector.object(entry.value, entry.path, ['id', 'bone', 'localPose']);
    collector.string(socket.bone, [...entry.path, 'bone']);
    if (typeof socket.bone === 'string' && !bones.has(socket.bone)) {
      collector.issue([...entry.path, 'bone'], 'reference.missing', `Unknown bone ${socket.bone}`);
    }
    validatePose2(socket.localPose, [...entry.path, 'localPose'], collector);
  }
  return new Set(indexed.keys());
}

function validateRasterInteractionBindings(
  value: unknown,
  layers: ReadonlyMap<string, ReadonlySet<string>>,
  interactions: ReadonlyMap<string, ReadonlySet<string>>,
  collector: AssetValidationCollector,
): void {
  const bindings = collector.array(value, ['interactionBindings']);
  const seenInteractions = new Set<string>();
  bindings.forEach((entry, index) => {
    const path = ['interactionBindings', index] as const;
    const projection = collector.object(entry, path, ['interactionId', 'layers']);
    collector.string(projection.interactionId, [...path, 'interactionId']);
    const stateIds = typeof projection.interactionId === 'string'
      ? interactions.get(projection.interactionId)
      : undefined;
    if (typeof projection.interactionId === 'string') {
      if (seenInteractions.has(projection.interactionId)) {
        collector.issue(
          [...path, 'interactionId'],
          'id.duplicate',
          `Interaction ${projection.interactionId} is bound more than once`,
        );
      }
      seenInteractions.add(projection.interactionId);
      if (stateIds === undefined) {
        collector.issue(
          [...path, 'interactionId'],
          'reference.missing',
          `Unknown interaction ${projection.interactionId}`,
        );
      }
    }
    const layerBindings = collector.array(projection.layers, [...path, 'layers']);
    if (layerBindings.length === 0) {
      collector.issue(
        [...path, 'layers'],
        'array.non_empty',
        'A raster interaction requires layer bindings',
      );
    }
    const boundLayers = new Set<string>();
    layerBindings.forEach((entryBinding, bindingIndex) => {
      const bindingPath = [...path, 'layers', bindingIndex];
      const binding = collector.object(entryBinding, bindingPath);
      collector.string(binding.layerId, [...bindingPath, 'layerId']);
      if (typeof binding.layerId === 'string') {
        if (boundLayers.has(binding.layerId)) {
          collector.issue(
            [...bindingPath, 'layerId'],
            'id.duplicate',
            `Layer ${binding.layerId} is bound more than once`,
          );
        }
        boundLayers.add(binding.layerId);
      }
      const layerStates = typeof binding.layerId === 'string'
        ? layers.get(binding.layerId)
        : undefined;
      if (typeof binding.layerId === 'string' && layerStates === undefined) {
        collector.issue(
          [...bindingPath, 'layerId'],
          'reference.missing',
          'Bound layer does not exist',
        );
      }
      const stateMap = collector.object(
        binding.stateByInteractionState,
        [...bindingPath, 'stateByInteractionState'],
      );
      for (const state of stateIds ?? []) {
        const layerState = stateMap[state];
        collector.string(layerState, [...bindingPath, 'stateByInteractionState', state]);
        if (
          typeof layerState === 'string'
          && layerStates !== undefined
          && !layerStates.has(layerState)
        ) {
          collector.issue(
            [...bindingPath, 'stateByInteractionState', state],
            'reference.missing',
            `Layer state ${layerState} does not exist`,
          );
        }
      }
      for (const state of Object.keys(stateMap)) {
        if (stateIds !== undefined && !stateIds.has(state)) {
          collector.issue(
            [...bindingPath, 'stateByInteractionState', state],
            'object.unknown_key',
            `State ${state} is not declared by the interaction`,
          );
        }
      }
    });
  });
  for (const id of interactions.keys()) {
    if (!seenInteractions.has(id)) {
      collector.issue(
        ['interactionBindings'],
        'manifest.binding_missing',
        `Missing raster binding for interaction ${id}`,
      );
    }
  }
}

export function validateRasterAssetBlueprint<TFamily extends string>(
  blueprint: AssetBlueprint<TFamily>,
): AssetBlueprint<TFamily>;
export function validateRasterAssetBlueprint(blueprint: unknown): AssetBlueprint;
export function validateRasterAssetBlueprint(blueprint: unknown): AssetBlueprint {
  const collector = new AssetValidationCollector();
  const root = collector.object(blueprint, [], [
    'blueprintVersion', 'family', 'representation', 'assetId', 'seed', 'appearance', 'medium',
    'manifest', 'bounds', 'bones', 'layers', 'colliders', 'sockets', 'interactionBindings',
  ]);
  validateHeader(root, 'raster', collector);
  const manifest = validateSemanticManifest(
    root.manifest,
    ['manifest'],
    collector,
    typeof root.family === 'string' ? root.family : undefined,
  );
  validateAppearance(root.appearance, manifest.partIds, collector);
  collector.oneOf(root.medium, ['medium'], MEDIUM_IDS);
  validateRasterBounds(root.bounds, collector);
  const bones = validateRasterBones(root.bones, collector);
  const layers = validateRasterLayers(root.layers, bones, manifest.partIds, collector);
  const colliderKinds = validateRasterColliders(root.colliders, bones, collector);
  const sockets = validateRasterSockets(root.sockets, ['sockets'], bones, collector);
  validateExactInventory(
    new Set(colliderKinds.keys()),
    manifest.colliderIds,
    ['colliders'],
    'collider',
    collector,
  );
  validateExactInventory(sockets, manifest.socketIds, ['sockets'], 'socket', collector);
  validateInteractionSensors(root.manifest, colliderKinds, collector);
  validateRasterInteractionBindings(
    root.interactionBindings,
    layers,
    manifest.interactionStates,
    collector,
  );
  collector.finish();
  return blueprint as AssetBlueprint;
}
