import type { AssetExtensionHost } from '../../../extensions/contracts.js';

export const CHARACTER_EXTENSION_HOST: AssetExtensionHost<'character'> = Object.freeze({
  family: 'character',
  slots: Object.freeze([
    Object.freeze({
      id: 'headwear',
      cardinality: 'one',
      semanticParentId: 'head',
      raster: Object.freeze({ ownerBone: 'head', baseOrder: 20 }),
      solid: Object.freeze({ ownerNode: 'head', baseOrder: 40 }),
    }),
  ]),
});
