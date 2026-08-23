import type { AssetBlueprint } from '../raster-asset.js';
import type { SolidAssetBlueprint } from '../solid-asset.js';
import { AssetValidationCollector, type ValidationPath } from '../../validation/value-validator.js';
import { validateRasterAssetBlueprint } from './raster.js';
import { validateSolidAssetBlueprint } from './solid.js';

function compareSemanticIds(
  rasterIds: readonly string[],
  solidIds: readonly string[],
  path: ValidationPath,
  label: string,
  collector: AssetValidationCollector,
): void {
  const raster = new Set(rasterIds);
  const solid = new Set(solidIds);
  for (const id of raster) {
    if (!solid.has(id)) {
      collector.issue(path, 'parity.missing', `Solid manifest is missing ${label} ${id}`);
    }
  }
  for (const id of solid) {
    if (!raster.has(id)) {
      collector.issue(path, 'parity.missing', `Raster manifest is missing ${label} ${id}`);
    }
  }
}

/**
 * Verifies that two projections of one authored asset expose one semantic
 * contract. Geometry is intentionally ignored; semantic ownership and runtime
 * integration points are not.
 */
export function validateAssetBlueprintParity(
  raster: AssetBlueprint,
  solid: SolidAssetBlueprint,
): void {
  validateRasterAssetBlueprint(raster);
  validateSolidAssetBlueprint(solid);
  const collector = new AssetValidationCollector();
  if (raster.family !== solid.family) {
    collector.issue(['family'], 'parity.family', 'Raster and solid families differ');
  }
  if (raster.assetId !== solid.assetId) {
    collector.issue(['assetId'], 'parity.asset', 'Raster and solid asset IDs differ');
  }
  if (raster.manifest.family !== solid.manifest.family) {
    collector.issue(
      ['manifest', 'family'],
      'parity.family',
      'Semantic manifest families differ',
    );
  }

  compareSemanticIds(
    raster.manifest.socketIds,
    solid.manifest.socketIds,
    ['manifest', 'socketIds'],
    'socket',
    collector,
  );
  compareSemanticIds(
    raster.manifest.colliderIds,
    solid.manifest.colliderIds,
    ['manifest', 'colliderIds'],
    'collider',
    collector,
  );

  const rasterParts = new Map(raster.manifest.parts.map((part) => [part.id, part]));
  const solidParts = new Map(solid.manifest.parts.map((part) => [part.id, part]));
  compareSemanticIds(
    [...rasterParts.keys()],
    [...solidParts.keys()],
    ['manifest', 'parts'],
    'semantic part',
    collector,
  );
  for (const [id, rasterPart] of rasterParts) {
    const solidPart = solidParts.get(id);
    if (
      solidPart !== undefined
      && (
        rasterPart.parentId !== solidPart.parentId
        || rasterPart.spatial !== solidPart.spatial
      )
    ) {
      collector.issue(
        ['manifest', 'parts'],
        'parity.definition',
        `Semantic part ${id} differs between projections`,
      );
    }
  }

  const rasterInteractions = new Map(
    raster.manifest.interactions.map((interaction) => [interaction.id, interaction]),
  );
  const solidInteractions = new Map(
    solid.manifest.interactions.map((interaction) => [interaction.id, interaction]),
  );
  compareSemanticIds(
    [...rasterInteractions.keys()],
    [...solidInteractions.keys()],
    ['manifest', 'interactions'],
    'interaction',
    collector,
  );
  for (const [id, rasterInteraction] of rasterInteractions) {
    const solidInteraction = solidInteractions.get(id);
    if (
      solidInteraction !== undefined
      && (
        rasterInteraction.kind !== solidInteraction.kind
        || rasterInteraction.initialState !== solidInteraction.initialState
        || rasterInteraction.sensorId !== solidInteraction.sensorId
        || rasterInteraction.activationSocketId !== solidInteraction.activationSocketId
        || rasterInteraction.states.length !== solidInteraction.states.length
        || rasterInteraction.states.some(
          (state, index) => solidInteraction.states[index] !== state,
        )
      )
    ) {
      collector.issue(
        ['manifest', 'interactions'],
        'parity.definition',
        `Interaction ${id} differs between projections`,
      );
    }
  }
  collector.finish();
}
