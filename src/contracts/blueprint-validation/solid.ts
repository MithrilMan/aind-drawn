import type { SolidAssetBlueprint } from '../solid-asset.js';
import { SOLID_DRAWING_APPLICATIONS, SOLID_FINISH_IDS } from '../../materials/finish.js';
import { AssetValidationCollector, type ValidationPath } from '../../validation/value-validator.js';
import { validateSemanticManifest } from './manifest.js';
import {
  EPSILON,
  TONE_STYLES,
  finiteTuple,
  indexById,
  positiveTuple,
  validateCapabilities,
  validateExactInventory,
  validateHeader,
  validateHierarchy,
  validateInteractionSensors,
} from './shared.js';

function validateSolidBounds(value: unknown, collector: AssetValidationCollector): void {
  const bounds = collector.object(value, ['bounds'], ['minimum', 'maximum']);
  const minimum = finiteTuple(bounds.minimum, ['bounds', 'minimum'], 3, collector);
  const maximum = finiteTuple(bounds.maximum, ['bounds', 'maximum'], 3, collector);
  for (let axis = 0; axis < 3; axis += 1) {
    const low = minimum[axis];
    const high = maximum[axis];
    if (typeof low === 'number' && typeof high === 'number' && !(low < high)) {
      collector.issue(
        ['bounds', 'maximum', axis],
        'bounds.order',
        'Maximum must be greater than minimum',
      );
    }
  }
}

function triangleAreaSquared(
  first: readonly unknown[],
  second: readonly unknown[],
  third: readonly unknown[],
): number | null {
  if (![...first, ...second, ...third].every((value) => typeof value === 'number')) return null;
  const ax = (second[0] as number) - (first[0] as number);
  const ay = (second[1] as number) - (first[1] as number);
  const az = (second[2] as number) - (first[2] as number);
  const bx = (third[0] as number) - (first[0] as number);
  const by = (third[1] as number) - (first[1] as number);
  const bz = (third[2] as number) - (first[2] as number);
  const crossX = ay * bz - az * by;
  const crossY = az * bx - ax * bz;
  const crossZ = ax * by - ay * bx;
  return crossX * crossX + crossY * crossY + crossZ * crossZ;
}

function validateSolidGeometry(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  const geometry = collector.object(value, path);
  collector.oneOf(
    geometry.type,
    [...path, 'type'],
    ['superellipsoid', 'extruded-profile', 'box', 'mesh'] as const,
  );
  if (geometry.type === 'box') {
    positiveTuple(geometry.size, [...path, 'size'], 3, collector);
    if ('segments' in geometry) {
      const segments = collector.tuple(geometry.segments, [...path, 'segments'], 3);
      segments.forEach((segment, index) => {
        collector.number(segment, [...path, 'segments', index], {
          integer: true,
          minimum: 1,
        });
      });
    }
    return;
  }
  if (geometry.type === 'superellipsoid') {
    positiveTuple(geometry.radii, [...path, 'radii'], 3, collector);
    collector.number(geometry.exponent, [...path, 'exponent'], { minimum: 1 });
    collector.number(geometry.widthSegments, [...path, 'widthSegments'], {
      integer: true,
      minimum: 3,
    });
    collector.number(geometry.heightSegments, [...path, 'heightSegments'], {
      integer: true,
      minimum: 2,
    });
    if ('deformation' in geometry) {
      const deformation = collector.object(geometry.deformation, [...path, 'deformation'], [
        'verticalTaper', 'equatorBulge', 'lobeAmplitude', 'lobeCount', 'lobePhase',
      ]);
      collector.number(deformation.verticalTaper, [...path, 'deformation', 'verticalTaper']);
      collector.number(deformation.equatorBulge, [...path, 'deformation', 'equatorBulge']);
      collector.number(deformation.lobeAmplitude, [...path, 'deformation', 'lobeAmplitude']);
      collector.number(deformation.lobeCount, [...path, 'deformation', 'lobeCount'], {
        integer: true,
        minimum: 1,
      });
      collector.number(deformation.lobePhase, [...path, 'deformation', 'lobePhase']);
    }
    return;
  }
  if (geometry.type === 'extruded-profile') {
    const outline = collector.array(geometry.outline, [...path, 'outline']);
    if (outline.length < 3) {
      collector.issue(
        [...path, 'outline'],
        'geometry.minimum_points',
        'An extruded profile requires at least three points',
      );
    }
    let area = 0;
    outline.forEach((point, index) => {
      finiteTuple(point, [...path, 'outline', index], 2, collector);
      const next = outline[(index + 1) % outline.length];
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
    if (outline.length >= 3 && Math.abs(area) <= EPSILON) {
      collector.issue(
        [...path, 'outline'],
        'geometry.degenerate',
        'Extruded outline area must be non-zero',
      );
    }
    collector.number(geometry.depth, [...path, 'depth'], { exclusiveMinimum: 0 });
    collector.number(geometry.bevel, [...path, 'bevel'], { minimum: 0 });
    collector.number(geometry.curveSegments, [...path, 'curveSegments'], {
      integer: true,
      minimum: 1,
    });
    if (
      typeof geometry.depth === 'number'
      && Number.isFinite(geometry.depth)
      && typeof geometry.bevel === 'number'
      && Number.isFinite(geometry.bevel)
      && geometry.bevel > geometry.depth * 0.5
    ) {
      collector.issue(
        [...path, 'bevel'],
        'value.maximum',
        'Bevel cannot exceed half the extrusion depth',
      );
    }
    return;
  }
  if (geometry.type === 'mesh') {
    const vertices = collector.array(geometry.vertices, [...path, 'vertices']);
    if (vertices.length < 3) {
      collector.issue(
        [...path, 'vertices'],
        'geometry.minimum_points',
        'A mesh requires at least three vertices',
      );
    }
    const validatedVertices = vertices.map((vertex, index) => (
      finiteTuple(vertex, [...path, 'vertices', index], 3, collector)
    ));
    const faces = collector.array(geometry.faces, [...path, 'faces']);
    if (faces.length === 0) {
      collector.issue([...path, 'faces'], 'array.non_empty', 'A mesh requires at least one face');
    }
    faces.forEach((faceValue, faceIndex) => {
      const facePath = [...path, 'faces', faceIndex];
      const face = collector.array(faceValue, facePath);
      if (face.length < 3) {
        collector.issue(
          facePath,
          'geometry.minimum_points',
          'A mesh face requires at least three vertices',
        );
      }
      face.forEach((vertexIndex, index) => {
        collector.number(vertexIndex, [...facePath, index], {
          integer: true,
          minimum: 0,
          maximum: Math.max(0, vertices.length - 1),
        });
      });
      const firstIndex = face[0];
      if (typeof firstIndex !== 'number' || !Number.isInteger(firstIndex)) return;
      const first = validatedVertices[firstIndex];
      if (first === undefined) return;
      for (let index = 1; index < face.length - 1; index += 1) {
        const secondIndex = face[index];
        const thirdIndex = face[index + 1];
        if (
          typeof secondIndex !== 'number'
          || !Number.isInteger(secondIndex)
          || typeof thirdIndex !== 'number'
          || !Number.isInteger(thirdIndex)
        ) continue;
        const second = validatedVertices[secondIndex];
        const third = validatedVertices[thirdIndex];
        if (second === undefined || third === undefined) continue;
        const areaSquared = triangleAreaSquared(first, second, third);
        if (areaSquared !== null && areaSquared <= EPSILON) {
          collector.issue(
            facePath,
            'geometry.degenerate',
            'Mesh faces cannot contain degenerate triangles',
          );
          break;
        }
      }
    });
    collector.boolean(geometry.smooth, [...path, 'smooth']);
  }
}

function validateSolidMaterials(
  value: unknown,
  collector: AssetValidationCollector,
): ReadonlySet<string> {
  const materials = collector.array(value, ['materials']);
  if (materials.length === 0) {
    collector.issue(
      ['materials'],
      'array.non_empty',
      'A solid blueprint requires at least one material',
    );
  }
  const indexed = indexById(materials, ['materials'], 'material', collector);
  materials.forEach((entry, index) => {
    const path = ['materials', index] as const;
    const material = collector.object(entry, path);
    const color = collector.tuple(material.color, [...path, 'color'], 3);
    color.forEach((channel, channelIndex) => {
      collector.number(channel, [...path, 'color', channelIndex], {
        integer: true,
        minimum: 0,
        maximum: 255,
      });
    });
    collector.oneOf(material.finish, [...path, 'finish'], SOLID_FINISH_IDS);
    const drawing = collector.object(
      material.drawing,
      [...path, 'drawing'],
      ['application', 'tone'],
    );
    collector.oneOf(
      drawing.application,
      [...path, 'drawing', 'application'],
      SOLID_DRAWING_APPLICATIONS,
    );
    collector.oneOf(drawing.tone, [...path, 'drawing', 'tone'], TONE_STYLES);
    for (const key of ['roughness', 'metalness', 'clearcoat'] as const) {
      if (key in material) {
        collector.number(material[key], [...path, key], { minimum: 0, maximum: 1 });
      }
    }
  });
  return new Set(indexed.keys());
}

function validatePose3(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  const pose = collector.object(value, path, ['position', 'rotation']);
  finiteTuple(pose.position, [...path, 'position'], 3, collector);
  const rotation = finiteTuple(pose.rotation, [...path, 'rotation'], 4, collector);
  if (rotation.every((coordinate) => typeof coordinate === 'number')) {
    const length = Math.hypot(...rotation as number[]);
    if (Math.abs(length - 1) > 1e-5) {
      collector.issue(
        [...path, 'rotation'],
        'quaternion.unit',
        'Quaternion must have unit length',
      );
    }
  }
}

function validateSolidNodes(
  value: unknown,
  collector: AssetValidationCollector,
): ReadonlySet<string> {
  const nodes = collector.array(value, ['nodes']);
  if (nodes.length === 0) {
    collector.issue(['nodes'], 'array.non_empty', 'A solid blueprint requires at least one node');
  }
  const indexed = indexById(nodes, ['nodes'], 'node', collector);
  const parents = new Map<string, string | undefined>();
  const paths = new Map<string, ValidationPath>();
  for (const [id, entry] of indexed) {
    const node = collector.object(entry.value, entry.path, ['id', 'parentNode', 'restPose']);
    validatePose3(node.restPose, [...entry.path, 'restPose'], collector);
    if ('parentNode' in node) collector.string(node.parentNode, [...entry.path, 'parentNode']);
    parents.set(id, typeof node.parentNode === 'string' ? node.parentNode : undefined);
    paths.set(id, entry.path);
  }
  validateHierarchy(parents, paths, 'Node', 'parentNode', collector);
  return new Set(indexed.keys());
}

function validateSurfaceAnchor(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  const anchor = collector.object(value, path, ['point', 'normal', 'roll']);
  finiteTuple(anchor.point, [...path, 'point'], 3, collector);
  const normal = finiteTuple(anchor.normal, [...path, 'normal'], 3, collector);
  collector.number(anchor.roll, [...path, 'roll']);
  if (normal.every((coordinate) => typeof coordinate === 'number')) {
    const length = Math.hypot(...normal);
    if (Math.abs(length - 1) > 1e-4) {
      collector.issue([...path, 'normal'], 'vector.unit', 'Surface normal must have unit length');
    }
  }
}

function validateSolidParts(
  value: unknown,
  nodes: ReadonlySet<string>,
  materials: ReadonlySet<string>,
  semanticParts: ReadonlySet<string>,
  collector: AssetValidationCollector,
): void {
  const parts = collector.array(value, ['parts']);
  if (parts.length === 0) {
    collector.issue(['parts'], 'array.non_empty', 'A solid blueprint requires at least one part');
  }
  indexById(parts, ['parts'], 'part', collector);
  parts.forEach((entry, index) => {
    const path = ['parts', index] as const;
    const part = collector.object(entry, path);
    collector.string(part.semanticPartId, [...path, 'semanticPartId']);
    if (typeof part.semanticPartId === 'string' && !semanticParts.has(part.semanticPartId)) {
      collector.issue(
        [...path, 'semanticPartId'],
        'reference.missing',
        `Unknown semantic part ${part.semanticPartId}`,
      );
    }
    collector.string(part.node, [...path, 'node']);
    if (typeof part.node === 'string' && !nodes.has(part.node)) {
      collector.issue([...path, 'node'], 'reference.missing', `Unknown node ${part.node}`);
    }
    collector.number(part.order, [...path, 'order']);
    validateSolidGeometry(part.geometry, [...path, 'geometry'], collector);
    collector.string(part.materialId, [...path, 'materialId']);
    if (typeof part.materialId === 'string' && !materials.has(part.materialId)) {
      collector.issue(
        [...path, 'materialId'],
        'reference.missing',
        `Unknown material ${part.materialId}`,
      );
    }
    const placement = collector.object(part.placement, [...path, 'placement']);
    finiteTuple(placement.position, [...path, 'placement', 'position'], 3, collector);
    if ('rotation' in placement) {
      finiteTuple(placement.rotation, [...path, 'placement', 'rotation'], 3, collector);
    }
    if ('surface' in placement) {
      validateSurfaceAnchor(placement.surface, [...path, 'placement', 'surface'], collector);
    }
    if ('visible' in part) collector.boolean(part.visible, [...path, 'visible']);
    collector.boolean(part.castShadow, [...path, 'castShadow']);
    collector.boolean(part.receiveShadow, [...path, 'receiveShadow']);
    validateCapabilities(part.capabilities, [...path, 'capabilities'], collector);
  });
}

function validateSolidColliders(
  value: unknown,
  nodes: ReadonlySet<string>,
  collector: AssetValidationCollector,
): ReadonlyMap<string, string> {
  const colliders = collector.array(value, ['colliders']);
  const indexed = indexById(colliders, ['colliders'], 'collider', collector);
  const kinds = new Map<string, string>();
  for (const [id, entry] of indexed) {
    const collider = entry.value;
    collector.oneOf(collider.kind, [...entry.path, 'kind'], ['solid', 'sensor'] as const);
    collector.oneOf(collider.shape, [...entry.path, 'shape'], ['box', 'sphere', 'capsule'] as const);
    collector.string(collider.node, [...entry.path, 'node']);
    if (typeof collider.node === 'string' && !nodes.has(collider.node)) {
      collector.issue([...entry.path, 'node'], 'reference.missing', `Unknown node ${collider.node}`);
    }
    validatePose3(collider.localPose, [...entry.path, 'localPose'], collector);
    if (collider.shape === 'box') {
      collector.object(entry.value, entry.path, [
        'id', 'kind', 'shape', 'node', 'localPose', 'size',
      ]);
      positiveTuple(collider.size, [...entry.path, 'size'], 3, collector);
    } else if (collider.shape === 'sphere') {
      collector.object(entry.value, entry.path, [
        'id', 'kind', 'shape', 'node', 'localPose', 'radius',
      ]);
      collector.number(collider.radius, [...entry.path, 'radius'], { exclusiveMinimum: 0 });
    } else if (collider.shape === 'capsule') {
      collector.object(entry.value, entry.path, [
        'id', 'kind', 'shape', 'node', 'localPose', 'radius', 'length', 'axis',
      ]);
      collector.number(collider.radius, [...entry.path, 'radius'], { exclusiveMinimum: 0 });
      collector.number(collider.length, [...entry.path, 'length'], { minimum: 0 });
      collector.oneOf(collider.axis, [...entry.path, 'axis'], ['x', 'y', 'z'] as const);
    }
    if (typeof collider.kind === 'string') kinds.set(id, collider.kind);
  }
  return kinds;
}

function validateSolidSockets(
  value: unknown,
  nodes: ReadonlySet<string>,
  collector: AssetValidationCollector,
): ReadonlySet<string> {
  const sockets = collector.array(value, ['sockets']);
  const indexed = indexById(sockets, ['sockets'], 'socket', collector);
  for (const entry of indexed.values()) {
    const socket = collector.object(entry.value, entry.path, ['id', 'node', 'localPose']);
    collector.string(socket.node, [...entry.path, 'node']);
    if (typeof socket.node === 'string' && !nodes.has(socket.node)) {
      collector.issue([...entry.path, 'node'], 'reference.missing', `Unknown node ${socket.node}`);
    }
    validatePose3(socket.localPose, [...entry.path, 'localPose'], collector);
  }
  return new Set(indexed.keys());
}

function validateNodeState(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  const state = collector.object(value, path, ['translation', 'rotation', 'scale']);
  if ('translation' in state) {
    finiteTuple(state.translation, [...path, 'translation'], 3, collector);
  }
  if ('rotation' in state) finiteTuple(state.rotation, [...path, 'rotation'], 3, collector);
  if ('scale' in state) positiveTuple(state.scale, [...path, 'scale'], 3, collector);
}

function validateSolidInteractionBindings(
  value: unknown,
  nodes: ReadonlySet<string>,
  interactions: ReadonlyMap<string, ReadonlySet<string>>,
  collector: AssetValidationCollector,
): void {
  const bindings = collector.array(value, ['interactionBindings']);
  const seenInteractions = new Set<string>();
  bindings.forEach((entry, index) => {
    const path = ['interactionBindings', index] as const;
    const projection = collector.object(entry, path, ['interactionId', 'nodes']);
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
    const nodeBindings = collector.array(projection.nodes, [...path, 'nodes']);
    if (nodeBindings.length === 0) {
      collector.issue(
        [...path, 'nodes'],
        'array.non_empty',
        'A solid interaction requires node bindings',
      );
    }
    const boundNodes = new Set<string>();
    nodeBindings.forEach((bindingEntry, bindingIndex) => {
      const bindingPath = [...path, 'nodes', bindingIndex];
      const binding = collector.object(bindingEntry, bindingPath);
      collector.string(binding.nodeId, [...bindingPath, 'nodeId']);
      if (typeof binding.nodeId === 'string') {
        if (boundNodes.has(binding.nodeId)) {
          collector.issue(
            [...bindingPath, 'nodeId'],
            'id.duplicate',
            `Node ${binding.nodeId} is bound more than once`,
          );
        }
        boundNodes.add(binding.nodeId);
        if (!nodes.has(binding.nodeId)) {
          collector.issue(
            [...bindingPath, 'nodeId'],
            'reference.missing',
            `Unknown node ${binding.nodeId}`,
          );
        }
      }
      const stateMap = collector.object(
        binding.stateByInteractionState,
        [...bindingPath, 'stateByInteractionState'],
      );
      for (const state of stateIds ?? []) {
        if (!(state in stateMap)) {
          collector.issue(
            [...bindingPath, 'stateByInteractionState', state],
            'reference.missing',
            `Missing transform for state ${state}`,
          );
          continue;
        }
        validateNodeState(
          stateMap[state],
          [...bindingPath, 'stateByInteractionState', state],
          collector,
        );
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
        `Missing solid binding for interaction ${id}`,
      );
    }
  }
}

export function validateSolidAssetBlueprint<TFamily extends string>(
  blueprint: SolidAssetBlueprint<TFamily>,
): SolidAssetBlueprint<TFamily>;
export function validateSolidAssetBlueprint(blueprint: unknown): SolidAssetBlueprint;
export function validateSolidAssetBlueprint(blueprint: unknown): SolidAssetBlueprint {
  const collector = new AssetValidationCollector();
  const root = collector.object(blueprint, [], [
    'blueprintVersion', 'family', 'representation', 'assetId', 'seed', 'manifest',
    'bounds', 'nodes', 'parts', 'materials', 'colliders', 'sockets', 'interactionBindings',
  ]);
  validateHeader(root, 'solid', collector);
  const manifest = validateSemanticManifest(
    root.manifest,
    ['manifest'],
    collector,
    typeof root.family === 'string' ? root.family : undefined,
  );
  validateSolidBounds(root.bounds, collector);
  const materials = validateSolidMaterials(root.materials, collector);
  const nodes = validateSolidNodes(root.nodes, collector);
  validateSolidParts(root.parts, nodes, materials, manifest.partIds, collector);
  const colliderKinds = validateSolidColliders(root.colliders, nodes, collector);
  const sockets = validateSolidSockets(root.sockets, nodes, collector);
  validateExactInventory(
    new Set(colliderKinds.keys()),
    manifest.colliderIds,
    ['colliders'],
    'collider',
    collector,
  );
  validateExactInventory(sockets, manifest.socketIds, ['sockets'], 'socket', collector);
  validateInteractionSensors(root.manifest, colliderKinds, collector);
  validateSolidInteractionBindings(
    root.interactionBindings,
    nodes,
    manifest.interactionStates,
    collector,
  );
  collector.finish();
  return blueprint as SolidAssetBlueprint;
}
