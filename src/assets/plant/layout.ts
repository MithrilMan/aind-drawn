import type { Bounds } from '../../core/geometry.js';
import type { SocketMap, Vector2 } from '../types.js';
import type { PlantRecipe } from './recipe.js';

export type PlantLayout = Readonly<{
  pixelsPerUnit: number;
  bounds: Bounds;
  mound: Readonly<{
    radius: number;
    height: number;
  }>;
  stem: Readonly<{
    base: Vector2;
    crown: Vector2;
    radius: number;
  }>;
  leaves: Readonly<{
    anchorY: number;
    halfWidth: number;
    topY: number;
  }>;
  bloom: Readonly<{
    center: Vector2;
    radius: number;
    topY: number;
  }>;
  sockets: SocketMap;
}>;

const PIXELS_PER_UNIT = 112;

function leafEnvelope(recipe: PlantRecipe, rootY: number, crownY: number) {
  const size = recipe.leaves.size;
  if (recipe.leaves.style === 'tuft') {
    return {
      anchorY: rootY,
      halfWidth: recipe.mound.radius + size * 0.5,
      topY: rootY + size * 1.75,
    };
  }
  if (recipe.leaves.style === 'crown') {
    return {
      anchorY: crownY,
      halfWidth: Math.max(recipe.stem.radius * 2.1, size * 1.42),
      topY: crownY + size * 1.28,
    };
  }
  if (recipe.leaves.style === 'sprig') {
    return {
      anchorY: rootY + recipe.stem.height * 0.46,
      halfWidth: size * 0.76,
      topY: Math.max(crownY, rootY + recipe.stem.height * 0.72 + size * 0.48),
    };
  }
  return {
    anchorY: rootY + Math.max(0.18, recipe.stem.height * 0.2),
    halfWidth: size * 1.06,
    topY: rootY + Math.max(0.18, recipe.stem.height * 0.2) + size * 0.88,
  };
}

function bloomEnvelope(recipe: PlantRecipe, rootY: number, crown: Vector2) {
  const size = recipe.bloom.size;
  if (recipe.bloom.style === 'none') {
    return { center: crown, radius: 0, topY: crown.y };
  }
  if (recipe.bloom.style === 'seedhead') {
    const center = Object.freeze({ x: crown.x, y: rootY + size * 1.18 });
    return { center, radius: size * 0.25, topY: rootY + size * 1.7 };
  }
  if (recipe.bloom.style === 'blossom') {
    const center = Object.freeze({ x: crown.x, y: crown.y + recipe.leaves.size * 0.46 });
    return { center, radius: recipe.leaves.size * 1.25, topY: crown.y + recipe.leaves.size * 1.18 };
  }
  const radius = recipe.bloom.style === 'daisy' ? size * 0.54 : size * 0.42;
  const center = Object.freeze({ x: crown.x, y: crown.y + radius * 0.15 });
  return { center, radius, topY: center.y + radius };
}

export function buildPlantLayout(recipe: PlantRecipe): PlantLayout {
  const rootY = recipe.mound.height * 0.88;
  const crown = Object.freeze({
    x: recipe.stem.lean * recipe.stem.height,
    y: rootY + recipe.stem.height,
  });
  const leaves = Object.freeze(leafEnvelope(recipe, rootY, crown.y));
  const bloom = Object.freeze(bloomEnvelope(recipe, rootY, crown));
  const moundHalfWidth = recipe.mound.radius * (
    recipe.mound.bump ? 1 + Math.abs(recipe.mound.bumpSide) * recipe.mound.bumpScale : 1
  );
  const stemHalfWidth = Math.abs(crown.x) + recipe.stem.radius * 1.2;
  const leafHalfWidth = Math.abs(crown.x) + leaves.halfWidth;
  const bloomHalfWidth = Math.abs(bloom.center.x) + bloom.radius;
  const halfWidth = Math.max(moundHalfWidth, stemHalfWidth, leafHalfWidth, bloomHalfWidth, 0.25);
  const topY = Math.max(recipe.mound.height, crown.y, leaves.topY, bloom.topY, 0.25);
  const padding = 0.09;
  const bounds = Object.freeze({
    x: -halfWidth - padding,
    y: 0,
    width: (halfWidth + padding) * 2,
    height: topY + padding,
  });
  const sockets = Object.freeze({
    base: Object.freeze({ x: 0, y: 0 }),
    root: Object.freeze({ x: 0, y: rootY }),
    crown,
    bloom: bloom.center,
    top: Object.freeze({ x: bloom.center.x, y: topY }),
  });

  return Object.freeze({
    pixelsPerUnit: PIXELS_PER_UNIT,
    bounds,
    mound: Object.freeze({ radius: recipe.mound.radius, height: recipe.mound.height }),
    stem: Object.freeze({
      base: sockets.root,
      crown,
      radius: recipe.stem.radius,
    }),
    leaves,
    bloom,
    sockets,
  });
}
