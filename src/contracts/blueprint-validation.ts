import type { AssetBlueprint } from './raster-asset.js';
import type { SolidAssetBlueprint } from './solid-asset.js';
import { MEDIUM_IDS } from '../materials/medium.js';
import { SOLID_DRAWING_APPLICATIONS, SOLID_FINISH_IDS } from '../materials/finish.js';
import { AssetValidationCollector, type ValidationPath } from '../validation/value-validator.js';

const UINT32_MAXIMUM = 4_294_967_295;
const TONE_STYLES = Object.freeze(['black', 'hatch', 'scribble', 'stipple', 'light'] as const);
const EPSILON = 1e-9;

type IndexedRecord = Readonly<{
  value: Record<string, unknown>;
  path: ValidationPath;
}>;

function validateHeader(
  record: Record<string, unknown>,
  representation: 'raster' | 'solid',
  collector: AssetValidationCollector,
): void {
  collector.literal(record.blueprintVersion, ['blueprintVersion'], 1);
  collector.string(record.family, ['family']);
  collector.literal(record.representation, ['representation'], representation);
  collector.string(record.assetId, ['assetId']);
  collector.number(record.seed, ['seed'], { integer: true, minimum: 0, maximum: UINT32_MAXIMUM });
}

function finiteTuple(
  value: unknown,
  path: ValidationPath,
  length: number,
  collector: AssetValidationCollector,
): readonly unknown[] {
  const tuple = collector.tuple(value, path, length);
  for (let index = 0; index < length; index += 1) {
    collector.number(tuple[index], [...path, index]);
  }
  return tuple;
}

function positiveTuple(
  value: unknown,
  path: ValidationPath,
  length: number,
  collector: AssetValidationCollector,
): readonly unknown[] {
  const tuple = collector.tuple(value, path, length);
  for (let index = 0; index < length; index += 1) {
    collector.number(tuple[index], [...path, index], { exclusiveMinimum: 0 });
  }
  return tuple;
}

function validateCapabilities(
  capabilities: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  if (capabilities === undefined) return;
  const entries = collector.array(capabilities, path);
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    const entryPath = [...path, index];
    const record = collector.object(entry, entryPath, ['id', 'data']);
    collector.string(record.id, [...entryPath, 'id']);
    collector.object(record.data, [...entryPath, 'data']);
    if (typeof record.id !== 'string') return;
    if (ids.has(record.id)) {
      collector.issue([...entryPath, 'id'], 'id.duplicate', `Duplicate capability ${record.id}`);
    }
    ids.add(record.id);
  });
}

function indexById(
  values: readonly unknown[],
  path: ValidationPath,
  label: string,
  collector: AssetValidationCollector,
): Map<string, IndexedRecord> {
  const result = new Map<string, IndexedRecord>();
  values.forEach((value, index) => {
    const entryPath = [...path, index];
    const record = collector.object(value, entryPath);
    collector.string(record.id, [...entryPath, 'id']);
    if (typeof record.id !== 'string' || record.id.trim().length === 0) return;
    if (result.has(record.id)) {
      collector.issue([...entryPath, 'id'], 'id.duplicate', `Duplicate ${label} ${record.id}`);
      return;
    }
    result.set(record.id, Object.freeze({ value: record, path: entryPath }));
  });
  return result;
}

function validateHierarchy(
  parents: ReadonlyMap<string, string | undefined>,
  paths: ReadonlyMap<string, ValidationPath>,
  label: string,
  parentField: string,
  collector: AssetValidationCollector,
): void {
  for (const [id, parent] of parents) {
    if (parent !== undefined && !parents.has(parent)) {
      collector.issue(
        [...(paths.get(id) ?? []), parentField],
        'reference.missing',
        `${label} ${id} references unknown parent ${parent}`,
      );
    }
  }
  for (const id of parents.keys()) {
    const ancestry = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && parents.has(current)) {
      if (ancestry.has(current)) {
        collector.issue(
          paths.get(id) ?? [],
          'hierarchy.cycle',
          `${label} hierarchy contains a cycle at ${current}`,
        );
        break;
      }
      ancestry.add(current);
      current = parents.get(current);
    }
  }
}

function validateRasterBounds(value: unknown, collector: AssetValidationCollector): void {
  const bounds = collector.object(value, ['bounds'], ['x', 'y', 'width', 'height']);
  collector.number(bounds.x, ['bounds', 'x']);
  collector.number(bounds.y, ['bounds', 'y']);
  collector.number(bounds.width, ['bounds', 'width'], { exclusiveMinimum: 0 });
  collector.number(bounds.height, ['bounds', 'height'], { exclusiveMinimum: 0 });
}

function validateRasterLayers(
  value: unknown,
  collector: AssetValidationCollector,
): ReadonlyMap<string, ReadonlySet<string>> {
  const layers = collector.array(value, ['layers']);
  if (layers.length === 0) {
    collector.issue(['layers'], 'array.non_empty', 'A raster blueprint requires at least one layer');
  }
  const indexed = indexById(layers, ['layers'], 'layer', collector);
  const statesByLayer = new Map<string, ReadonlySet<string>>();
  const bones = new Map<string, Readonly<{
    parent: string | undefined;
    position: readonly unknown[];
    path: ValidationPath;
  }>>();

  layers.forEach((entry, index) => {
    const path = ['layers', index] as const;
    const layer = collector.object(entry, path);
    collector.string(layer.bone, [...path, 'bone']);
    if ('parentBone' in layer) collector.string(layer.parentBone, [...path, 'parentBone']);
    collector.number(layer.order, [...path, 'order']);
    collector.number(layer.depth, [...path, 'depth']);
    const canvas = collector.object(layer.canvas, [...path, 'canvas'], ['width', 'height']);
    collector.number(canvas.width, [...path, 'canvas', 'width'], { integer: true, exclusiveMinimum: 0 });
    collector.number(canvas.height, [...path, 'canvas', 'height'], { integer: true, exclusiveMinimum: 0 });
    const world = collector.object(layer.world, [...path, 'world'], ['width', 'height']);
    collector.number(world.width, [...path, 'world', 'width'], { exclusiveMinimum: 0 });
    collector.number(world.height, [...path, 'world', 'height'], { exclusiveMinimum: 0 });
    const position = collector.object(layer.position, [...path, 'position'], ['x', 'y']);
    collector.number(position.x, [...path, 'position', 'x']);
    collector.number(position.y, [...path, 'position', 'y']);
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
      statesByLayer.set(layer.id, new Set(states.filter((state): state is string => typeof state === 'string')));
    }
    if (typeof layer.bone === 'string' && layer.bone.trim().length > 0) {
      const parent = typeof layer.parentBone === 'string' ? layer.parentBone : undefined;
      const currentPosition = [position.x, position.y] as const;
      const existing = bones.get(layer.bone);
      if (existing === undefined) {
        bones.set(layer.bone, Object.freeze({ parent, position: currentPosition, path }));
      } else if (
        existing.parent !== parent
        || existing.position[0] !== currentPosition[0]
        || existing.position[1] !== currentPosition[1]
      ) {
        collector.issue([...path, 'bone'], 'bone.conflict', `Bone ${layer.bone} has conflicting anchors`);
      }
    }
  });

  const boneParents = new Map<string, string | undefined>();
  const bonePaths = new Map<string, ValidationPath>();
  for (const [id, bone] of bones) {
    boneParents.set(id, bone.parent);
    bonePaths.set(id, bone.path);
  }
  validateHierarchy(boneParents, bonePaths, 'Bone', 'parentBone', collector);
  void indexed;
  return statesByLayer;
}

function validateRasterColliders(
  value: unknown,
  collector: AssetValidationCollector,
): ReadonlyMap<string, string> {
  const colliders = collector.array(value, ['colliders']);
  const indexed = indexById(colliders, ['colliders'], 'collider', collector);
  const kinds = new Map<string, string>();
  colliders.forEach((entry, index) => {
    const path = ['colliders', index] as const;
    const collider = collector.object(entry, path);
    collector.oneOf(collider.kind, [...path, 'kind'], ['solid', 'sensor'] as const);
    collector.oneOf(collider.shape, [...path, 'shape'], ['rectangle', 'polygon'] as const);
    if (typeof collider.id === 'string' && typeof collider.kind === 'string') {
      kinds.set(collider.id, collider.kind);
    }
    if (collider.shape === 'rectangle') {
      collector.number(collider.x, [...path, 'x']);
      collector.number(collider.y, [...path, 'y']);
      collector.number(collider.width, [...path, 'width'], { exclusiveMinimum: 0 });
      collector.number(collider.height, [...path, 'height'], { exclusiveMinimum: 0 });
      return;
    }
    if (collider.shape === 'polygon') {
      const points = collector.array(collider.points, [...path, 'points']);
      if (points.length < 3) {
        collector.issue([...path, 'points'], 'geometry.minimum_points', 'A polygon requires at least three points');
      }
      let area = 0;
      points.forEach((point, pointIndex) => {
        finiteTuple(point, [...path, 'points', pointIndex], 2, collector);
        const next = points[(pointIndex + 1) % points.length];
        if (
          Array.isArray(point) && Array.isArray(next)
          && typeof point[0] === 'number' && typeof point[1] === 'number'
          && typeof next[0] === 'number' && typeof next[1] === 'number'
        ) {
          area += point[0] * next[1] - next[0] * point[1];
        }
      });
      if (points.length >= 3 && Math.abs(area) <= EPSILON) {
        collector.issue([...path, 'points'], 'geometry.degenerate', 'Polygon area must be non-zero');
      }
    }
  });
  void indexed;
  return kinds;
}

function validateSockets(
  value: unknown,
  path: ValidationPath,
  dimensions: 2 | 3,
  collector: AssetValidationCollector,
): ReadonlySet<string> {
  const sockets = collector.object(value, path);
  const ids = new Set<string>();
  for (const [id, point] of Object.entries(sockets)) {
    collector.string(id, [...path, id]);
    if (dimensions === 2) {
      const vector = collector.object(point, [...path, id], ['x', 'y']);
      collector.number(vector.x, [...path, id, 'x']);
      collector.number(vector.y, [...path, id, 'y']);
    } else {
      finiteTuple(point, [...path, id], dimensions, collector);
    }
    ids.add(id);
  }
  return ids;
}

function validateRasterInteractions(
  value: unknown,
  layers: ReadonlyMap<string, ReadonlySet<string>>,
  colliderKinds: ReadonlyMap<string, string>,
  sockets: ReadonlySet<string>,
  collector: AssetValidationCollector,
): void {
  const interactions = collector.array(value, ['interactions']);
  indexById(interactions, ['interactions'], 'interaction', collector);
  interactions.forEach((entry, index) => {
    const path = ['interactions', index] as const;
    const interaction = collector.object(entry, path);
    collector.oneOf(interaction.kind, [...path, 'kind'], ['toggle', 'portal'] as const);
    collector.string(interaction.sensorColliderId, [...path, 'sensorColliderId']);
    collector.string(interaction.activationSocketId, [...path, 'activationSocketId']);
    const states = collector.array(interaction.states, [...path, 'states']);
    if (states.length === 0) {
      collector.issue([...path, 'states'], 'array.non_empty', 'An interaction requires at least one state');
    }
    collector.uniqueStrings(states, [...path, 'states']);
    const stateIds = new Set(states.filter((state): state is string => typeof state === 'string'));
    collector.string(interaction.initialState, [...path, 'initialState']);
    if (typeof interaction.initialState === 'string' && !stateIds.has(interaction.initialState)) {
      collector.issue([...path, 'initialState'], 'reference.missing', 'Initial state is not declared by the interaction');
    }
    if (
      typeof interaction.sensorColliderId === 'string'
      && colliderKinds.get(interaction.sensorColliderId) !== 'sensor'
    ) {
      collector.issue([...path, 'sensorColliderId'], 'reference.sensor', 'Expected a sensor collider reference');
    }
    if (
      typeof interaction.activationSocketId === 'string'
      && !sockets.has(interaction.activationSocketId)
    ) {
      collector.issue([...path, 'activationSocketId'], 'reference.missing', 'Activation socket does not exist');
    }
    const bindings = collector.array(interaction.layerBindings, [...path, 'layerBindings']);
    const boundLayers = new Set<string>();
    bindings.forEach((entryBinding, bindingIndex) => {
      const bindingPath = [...path, 'layerBindings', bindingIndex];
      const binding = collector.object(entryBinding, bindingPath);
      collector.string(binding.layerId, [...bindingPath, 'layerId']);
      if (typeof binding.layerId === 'string') {
        if (boundLayers.has(binding.layerId)) {
          collector.issue([...bindingPath, 'layerId'], 'id.duplicate', `Layer ${binding.layerId} is bound more than once`);
        }
        boundLayers.add(binding.layerId);
      }
      const layerStates = typeof binding.layerId === 'string' ? layers.get(binding.layerId) : undefined;
      if (typeof binding.layerId === 'string' && layerStates === undefined) {
        collector.issue([...bindingPath, 'layerId'], 'reference.missing', 'Bound layer does not exist');
      }
      const stateMap = collector.object(
        binding.stateByInteractionState,
        [...bindingPath, 'stateByInteractionState'],
      );
      for (const state of stateIds) {
        const layerState = stateMap[state];
        collector.string(layerState, [...bindingPath, 'stateByInteractionState', state]);
        if (typeof layerState === 'string' && layerStates !== undefined && !layerStates.has(layerState)) {
          collector.issue(
            [...bindingPath, 'stateByInteractionState', state],
            'reference.missing',
            `Layer state ${layerState} does not exist`,
          );
        }
      }
      for (const state of Object.keys(stateMap)) {
        if (!stateIds.has(state)) {
          collector.issue(
            [...bindingPath, 'stateByInteractionState', state],
            'object.unknown_key',
            `State ${state} is not declared by the interaction`,
          );
        }
      }
    });
  });
}

export function validateRasterAssetBlueprint<TFamily extends string>(
  blueprint: AssetBlueprint<TFamily>,
): AssetBlueprint<TFamily>;
export function validateRasterAssetBlueprint(blueprint: unknown): AssetBlueprint;
export function validateRasterAssetBlueprint(blueprint: unknown): AssetBlueprint {
  const collector = new AssetValidationCollector();
  const root = collector.object(blueprint, []);
  validateHeader(root, 'raster', collector);
  collector.oneOf(root.medium, ['medium'], MEDIUM_IDS);
  validateRasterBounds(root.bounds, collector);
  const layers = validateRasterLayers(root.layers, collector);
  const colliderKinds = validateRasterColliders(root.colliders, collector);
  const sockets = validateSockets(root.sockets, ['sockets'], 2, collector);
  validateRasterInteractions(root.interactions, layers, colliderKinds, sockets, collector);
  collector.finish();
  return blueprint as AssetBlueprint;
}

function validateSolidBounds(value: unknown, collector: AssetValidationCollector): void {
  const bounds = collector.object(value, ['bounds'], ['minimum', 'maximum']);
  const minimum = finiteTuple(bounds.minimum, ['bounds', 'minimum'], 3, collector);
  const maximum = finiteTuple(bounds.maximum, ['bounds', 'maximum'], 3, collector);
  for (let axis = 0; axis < 3; axis += 1) {
    const low = minimum[axis];
    const high = maximum[axis];
    if (typeof low === 'number' && typeof high === 'number' && !(low < high)) {
      collector.issue(['bounds', 'maximum', axis], 'bounds.order', 'Maximum must be greater than minimum');
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
        collector.number(segment, [...path, 'segments', index], { integer: true, minimum: 1 });
      });
    }
    return;
  }
  if (geometry.type === 'superellipsoid') {
    positiveTuple(geometry.radii, [...path, 'radii'], 3, collector);
    collector.number(geometry.exponent, [...path, 'exponent'], { minimum: 1 });
    collector.number(geometry.widthSegments, [...path, 'widthSegments'], { integer: true, minimum: 3 });
    collector.number(geometry.heightSegments, [...path, 'heightSegments'], { integer: true, minimum: 2 });
    if ('deformation' in geometry) {
      const deformation = collector.object(geometry.deformation, [...path, 'deformation'], [
        'verticalTaper', 'equatorBulge', 'lobeAmplitude', 'lobeCount', 'lobePhase',
      ]);
      collector.number(deformation.verticalTaper, [...path, 'deformation', 'verticalTaper']);
      collector.number(deformation.equatorBulge, [...path, 'deformation', 'equatorBulge']);
      collector.number(deformation.lobeAmplitude, [...path, 'deformation', 'lobeAmplitude']);
      collector.number(deformation.lobeCount, [...path, 'deformation', 'lobeCount'], {
        integer: true, minimum: 1,
      });
      collector.number(deformation.lobePhase, [...path, 'deformation', 'lobePhase']);
    }
    return;
  }
  if (geometry.type === 'extruded-profile') {
    const outline = collector.array(geometry.outline, [...path, 'outline']);
    if (outline.length < 3) {
      collector.issue([...path, 'outline'], 'geometry.minimum_points', 'An extruded profile requires at least three points');
    }
    let area = 0;
    outline.forEach((point, index) => {
      finiteTuple(point, [...path, 'outline', index], 2, collector);
      const next = outline[(index + 1) % outline.length];
      if (
        Array.isArray(point) && Array.isArray(next)
        && typeof point[0] === 'number' && typeof point[1] === 'number'
        && typeof next[0] === 'number' && typeof next[1] === 'number'
      ) {
        area += point[0] * next[1] - next[0] * point[1];
      }
    });
    if (outline.length >= 3 && Math.abs(area) <= EPSILON) {
      collector.issue([...path, 'outline'], 'geometry.degenerate', 'Extruded outline area must be non-zero');
    }
    collector.number(geometry.depth, [...path, 'depth'], { exclusiveMinimum: 0 });
    collector.number(geometry.bevel, [...path, 'bevel'], { minimum: 0 });
    collector.number(geometry.curveSegments, [...path, 'curveSegments'], { integer: true, minimum: 1 });
    if (
      typeof geometry.depth === 'number' && Number.isFinite(geometry.depth)
      && typeof geometry.bevel === 'number' && Number.isFinite(geometry.bevel)
      && geometry.bevel > geometry.depth * 0.5
    ) {
      collector.issue([...path, 'bevel'], 'value.maximum', 'Bevel cannot exceed half the extrusion depth');
    }
    return;
  }
  if (geometry.type === 'mesh') {
    const vertices = collector.array(geometry.vertices, [...path, 'vertices']);
    if (vertices.length < 3) {
      collector.issue([...path, 'vertices'], 'geometry.minimum_points', 'A mesh requires at least three vertices');
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
        collector.issue(facePath, 'geometry.minimum_points', 'A mesh face requires at least three vertices');
      }
      face.forEach((vertexIndex, index) => {
        collector.number(vertexIndex, [...facePath, index], {
          integer: true, minimum: 0, maximum: Math.max(0, vertices.length - 1),
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
          typeof secondIndex !== 'number' || !Number.isInteger(secondIndex)
          || typeof thirdIndex !== 'number' || !Number.isInteger(thirdIndex)
        ) continue;
        const second = validatedVertices[secondIndex];
        const third = validatedVertices[thirdIndex];
        if (second === undefined || third === undefined) continue;
        const areaSquared = triangleAreaSquared(first, second, third);
        if (areaSquared !== null && areaSquared <= EPSILON) {
          collector.issue(facePath, 'geometry.degenerate', 'Mesh faces cannot contain degenerate triangles');
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
    collector.issue(['materials'], 'array.non_empty', 'A solid blueprint requires at least one material');
  }
  const indexed = indexById(materials, ['materials'], 'material', collector);
  materials.forEach((entry, index) => {
    const path = ['materials', index] as const;
    const material = collector.object(entry, path);
    const color = collector.tuple(material.color, [...path, 'color'], 3);
    color.forEach((channel, channelIndex) => {
      collector.number(channel, [...path, 'color', channelIndex], {
        integer: true, minimum: 0, maximum: 255,
      });
    });
    collector.oneOf(material.finish, [...path, 'finish'], SOLID_FINISH_IDS);
    const drawing = collector.object(material.drawing, [...path, 'drawing'], ['application', 'tone']);
    collector.oneOf(drawing.application, [...path, 'drawing', 'application'], SOLID_DRAWING_APPLICATIONS);
    collector.oneOf(drawing.tone, [...path, 'drawing', 'tone'], TONE_STYLES);
    for (const key of ['roughness', 'metalness', 'clearcoat'] as const) {
      if (key in material) collector.number(material[key], [...path, key], { minimum: 0, maximum: 1 });
    }
  });
  return new Set(indexed.keys());
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
    const node = entry.value;
    finiteTuple(node.position, [...entry.path, 'position'], 3, collector);
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
    collector.string(part.node, [...path, 'node']);
    if (typeof part.node === 'string' && !nodes.has(part.node)) {
      collector.issue([...path, 'node'], 'reference.missing', `Unknown node ${part.node}`);
    }
    collector.number(part.order, [...path, 'order']);
    validateSolidGeometry(part.geometry, [...path, 'geometry'], collector);
    collector.string(part.materialId, [...path, 'materialId']);
    if (typeof part.materialId === 'string' && !materials.has(part.materialId)) {
      collector.issue([...path, 'materialId'], 'reference.missing', `Unknown material ${part.materialId}`);
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
  collector: AssetValidationCollector,
): ReadonlyMap<string, string> {
  const colliders = collector.array(value, ['colliders']);
  const indexed = indexById(colliders, ['colliders'], 'collider', collector);
  const kinds = new Map<string, string>();
  for (const [id, entry] of indexed) {
    const collider = entry.value;
    collector.oneOf(collider.kind, [...entry.path, 'kind'], ['solid', 'sensor'] as const);
    collector.literal(collider.shape, [...entry.path, 'shape'], 'box');
    finiteTuple(collider.center, [...entry.path, 'center'], 3, collector);
    positiveTuple(collider.size, [...entry.path, 'size'], 3, collector);
    if (typeof collider.kind === 'string') kinds.set(id, collider.kind);
  }
  return kinds;
}

function validateNodeState(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  const state = collector.object(value, path, ['translation', 'rotation', 'scale']);
  if ('translation' in state) finiteTuple(state.translation, [...path, 'translation'], 3, collector);
  if ('rotation' in state) finiteTuple(state.rotation, [...path, 'rotation'], 3, collector);
  if ('scale' in state) positiveTuple(state.scale, [...path, 'scale'], 3, collector);
}

function validateSolidInteractions(
  value: unknown,
  nodes: ReadonlySet<string>,
  colliderKinds: ReadonlyMap<string, string>,
  sockets: ReadonlySet<string>,
  collector: AssetValidationCollector,
): void {
  const interactions = collector.array(value, ['interactions']);
  indexById(interactions, ['interactions'], 'interaction', collector);
  interactions.forEach((entry, index) => {
    const path = ['interactions', index] as const;
    const interaction = collector.object(entry, path);
    collector.oneOf(interaction.kind, [...path, 'kind'], ['toggle', 'portal'] as const);
    collector.string(interaction.sensorColliderId, [...path, 'sensorColliderId']);
    collector.string(interaction.activationSocketId, [...path, 'activationSocketId']);
    const states = collector.array(interaction.states, [...path, 'states']);
    if (states.length === 0) {
      collector.issue([...path, 'states'], 'array.non_empty', 'An interaction requires at least one state');
    }
    collector.uniqueStrings(states, [...path, 'states']);
    const stateIds = new Set(states.filter((state): state is string => typeof state === 'string'));
    collector.string(interaction.initialState, [...path, 'initialState']);
    if (typeof interaction.initialState === 'string' && !stateIds.has(interaction.initialState)) {
      collector.issue([...path, 'initialState'], 'reference.missing', 'Initial state is not declared by the interaction');
    }
    if (
      typeof interaction.sensorColliderId === 'string'
      && colliderKinds.get(interaction.sensorColliderId) !== 'sensor'
    ) {
      collector.issue([...path, 'sensorColliderId'], 'reference.sensor', 'Expected a sensor collider reference');
    }
    if (
      typeof interaction.activationSocketId === 'string'
      && !sockets.has(interaction.activationSocketId)
    ) {
      collector.issue([...path, 'activationSocketId'], 'reference.missing', 'Activation socket does not exist');
    }
    const bindings = collector.array(interaction.nodeBindings, [...path, 'nodeBindings']);
    const boundNodes = new Set<string>();
    bindings.forEach((bindingEntry, bindingIndex) => {
      const bindingPath = [...path, 'nodeBindings', bindingIndex];
      const binding = collector.object(bindingEntry, bindingPath);
      collector.string(binding.nodeId, [...bindingPath, 'nodeId']);
      if (typeof binding.nodeId === 'string') {
        if (boundNodes.has(binding.nodeId)) {
          collector.issue([...bindingPath, 'nodeId'], 'id.duplicate', `Node ${binding.nodeId} is bound more than once`);
        }
        boundNodes.add(binding.nodeId);
        if (!nodes.has(binding.nodeId)) {
          collector.issue([...bindingPath, 'nodeId'], 'reference.missing', `Unknown node ${binding.nodeId}`);
        }
      }
      const stateMap = collector.object(
        binding.stateByInteractionState,
        [...bindingPath, 'stateByInteractionState'],
      );
      for (const state of stateIds) {
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
        if (!stateIds.has(state)) {
          collector.issue(
            [...bindingPath, 'stateByInteractionState', state],
            'object.unknown_key',
            `State ${state} is not declared by the interaction`,
          );
        }
      }
    });
  });
}

export function validateSolidAssetBlueprint<TFamily extends string>(
  blueprint: SolidAssetBlueprint<TFamily>,
): SolidAssetBlueprint<TFamily>;
export function validateSolidAssetBlueprint(blueprint: unknown): SolidAssetBlueprint;
export function validateSolidAssetBlueprint(blueprint: unknown): SolidAssetBlueprint {
  const collector = new AssetValidationCollector();
  const root = collector.object(blueprint, []);
  validateHeader(root, 'solid', collector);
  validateSolidBounds(root.bounds, collector);
  const materials = validateSolidMaterials(root.materials, collector);
  const nodes = validateSolidNodes(root.nodes, collector);
  validateSolidParts(root.parts, nodes, materials, collector);
  const colliderKinds = validateSolidColliders(root.colliders, collector);
  const sockets = validateSockets(root.sockets, ['sockets'], 3, collector);
  validateSolidInteractions(root.interactions, nodes, colliderKinds, sockets, collector);
  collector.finish();
  return blueprint as SolidAssetBlueprint;
}
