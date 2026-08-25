import {
  createRasterBuildingBlueprint,
  createRasterBuildingRecipe,
  createRasterCharacterBlueprint,
  createRasterVehicleBlueprint,
  createRasterVehicleRecipe,
  installRasterWorkerHost,
  type RasterWorkerHost,
} from '../../../src/index.js';
import type { StudioRasterWorkerPayload } from './family-catalog.js';

const host = self as unknown as RasterWorkerHost;

installRasterWorkerHost<StudioRasterWorkerPayload>(host, ({ identity, medium, artDirection }) => {
  if (identity.family === 'character') {
    return createRasterCharacterBlueprint(identity, { medium, artDirection });
  }
  if (identity.family === 'building') {
    return createRasterBuildingBlueprint(createRasterBuildingRecipe(identity, {
      medium,
      artDirection,
    }));
  }
  return createRasterVehicleBlueprint(createRasterVehicleRecipe(identity, {
    medium,
    side: 'right',
    artDirection,
  }));
});
