import { chaikin, clamp, closePath, TAU, type MutablePoint, type Point } from '../../core/geometry.js';
import type { RgbColor, Sketch } from '../../core/sketch.js';
import { mediumById, type Medium } from '../../materials/medium.js';
import type { AssetBlueprint, Collider, LayerDefinition, Size2, Vector2 } from '../types.js';
import { buildPlantLayout, type PlantLayout } from './layout.js';
import type { PlantPlacement, PlantRecipe } from './recipe.js';

function canvasPoint(layout: PlantLayout, canvas: Size2, point: Vector2): MutablePoint {
  return [
    (point.x - layout.bounds.x) * layout.pixelsPerUnit,
    canvas.height - (point.y - layout.bounds.y) * layout.pixelsPerUnit,
  ];
}

function canvasPoints(
  layout: PlantLayout,
  canvas: Size2,
  points: readonly Vector2[],
): MutablePoint[] {
  return points.map((point) => canvasPoint(layout, canvas, point));
}

function fillOrganicShape(
  sketch: Sketch,
  medium: Medium,
  points: readonly Point[],
  color: RgbColor,
  linePressure: number,
  options: Readonly<{ gap?: number; edge?: number; scribble?: boolean }> = {},
): void {
  sketch.paperFill(points);
  medium.skin(sketch, points, color, {
    gap: options.gap ?? 7,
    scribble: options.scribble ?? false,
  });
  medium.edge(sketch, closePath(points), (options.edge ?? 3.4) * linePressure, {
    ghost: true,
    amplitude: 0.62,
  });
}

function drawMound(
  sketch: Sketch,
  recipe: PlantRecipe,
  layout: PlantLayout,
  canvas: Size2,
  medium: Medium,
): void {
  const center = canvasPoint(layout, canvas, {
    x: 0,
    y: recipe.mound.height * 0.44,
  });
  const mound = sketch.blobPoints(
    center[0],
    center[1],
    recipe.mound.radius * layout.pixelsPerUnit,
    recipe.mound.height * 0.56 * layout.pixelsPerUnit,
    0,
    0.4,
  );
  fillOrganicShape(sketch, medium, mound, recipe.palette.ground, recipe.linePressure, {
    gap: 8,
    edge: 3.8,
    scribble: true,
  });
  if (recipe.mound.bump) {
    const bump = sketch.blobPoints(
      center[0] + recipe.mound.bumpSide * recipe.mound.radius * layout.pixelsPerUnit,
      center[1] + recipe.mound.height * 0.08 * layout.pixelsPerUnit,
      recipe.mound.radius * recipe.mound.bumpScale * layout.pixelsPerUnit,
      recipe.mound.height * recipe.mound.bumpScale * layout.pixelsPerUnit,
      recipe.mound.bumpSide * 0.08,
      0.38,
    );
    fillOrganicShape(sketch, medium, bump, recipe.palette.ground, recipe.linePressure, {
      gap: 8,
      edge: 2.8,
    });
  }
}

function stemXAt(layout: PlantLayout, y: number): number {
  const height = layout.stem.crown.y - layout.stem.base.y;
  if (height <= 0) return layout.stem.base.x;
  return layout.stem.base.x + (layout.stem.crown.x - layout.stem.base.x)
    * clamp((y - layout.stem.base.y) / height, 0, 1);
}

function drawStem(
  sketch: Sketch,
  recipe: PlantRecipe,
  layout: PlantLayout,
  canvas: Size2,
  medium: Medium,
): void {
  if (recipe.stem.style === 'none') return;
  const base = layout.stem.base;
  const crown = layout.stem.crown;
  const bottomRadius = recipe.stem.radius;
  const topRadius = bottomRadius * (recipe.stem.style === 'trunk' ? 0.54 : 0.82);
  const middleY = base.y + recipe.stem.height * 0.52;
  const middleX = stemXAt(layout, middleY);
  const points = chaikin(canvasPoints(layout, canvas, [
    { x: base.x - bottomRadius, y: base.y },
    { x: middleX - bottomRadius * 0.9, y: middleY },
    { x: crown.x - topRadius, y: crown.y },
    { x: crown.x + topRadius, y: crown.y },
    { x: middleX + bottomRadius * 0.96, y: middleY },
    { x: base.x + bottomRadius, y: base.y },
  ]), true, 2);
  fillOrganicShape(sketch, medium, points, recipe.palette.stem, recipe.linePressure, {
    gap: recipe.stem.style === 'trunk' ? 8 : 6,
    edge: recipe.stem.style === 'trunk' ? 3.8 : 2.7,
  });
  if (recipe.stem.style === 'trunk') {
    const vein = canvasPoints(layout, canvas, [
      { x: -bottomRadius * 0.25, y: base.y + recipe.stem.height * 0.08 },
      { x: middleX + bottomRadius * 0.12, y: middleY },
      { x: crown.x - topRadius * 0.15, y: crown.y - recipe.stem.height * 0.08 },
    ]);
    sketch.stroke(vein, 1.4 * recipe.linePressure, { alpha: 0.34, taper: 0.38 });
  }
}

function leafShape(
  layout: PlantLayout,
  canvas: Size2,
  base: Vector2,
  tip: Vector2,
  width: number,
  curl: number,
): MutablePoint[] {
  const deltaX = tip.x - base.x;
  const deltaY = tip.y - base.y;
  const length = Math.max(0.001, Math.hypot(deltaX, deltaY));
  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  const center = {
    x: base.x + deltaX * 0.52 + normalX * curl * width,
    y: base.y + deltaY * 0.52 + normalY * curl * width,
  };
  return chaikin(canvasPoints(layout, canvas, [
    base,
    { x: center.x + normalX * width, y: center.y + normalY * width },
    tip,
    { x: center.x - normalX * width, y: center.y - normalY * width },
  ]), true, 2);
}

function drawLeaf(
  sketch: Sketch,
  recipe: PlantRecipe,
  layout: PlantLayout,
  canvas: Size2,
  medium: Medium,
  base: Vector2,
  tip: Vector2,
  width: number,
  placement: PlantPlacement,
  index: number,
): void {
  const points = leafShape(layout, canvas, base, tip, width, placement.curl);
  const color = index % 3 === 0 ? recipe.palette.leafShadow : recipe.palette.leaf;
  fillOrganicShape(sketch, medium, points, color, recipe.linePressure, {
    gap: 6,
    edge: 2.4,
  });
  sketch.stroke([
    canvasPoint(layout, canvas, base),
    canvasPoint(layout, canvas, tip),
  ], 1.05 * recipe.linePressure, { alpha: 0.34, taper: 0.65 });
}

function drawLeaves(
  sketch: Sketch,
  recipe: PlantRecipe,
  layout: PlantLayout,
  canvas: Size2,
  medium: Medium,
): void {
  const ordered = [...recipe.leaves.placements].sort(
    (left, right) => Math.sin(left.angle) - Math.sin(right.angle),
  );
  if (recipe.leaves.style === 'crown') {
    const radius = layout.leaves.halfWidth * 0.72;
    ordered.forEach((placement, index) => {
      const x = layout.stem.crown.x
        + Math.cos(placement.angle) * radius * placement.radial * 0.62;
      const y = layout.stem.crown.y
        + recipe.leaves.size * (0.3 + placement.rise * 0.52);
      const center = canvasPoint(layout, canvas, { x, y });
      const size = recipe.leaves.size * placement.scale;
      const blob = sketch.blobPoints(
        center[0],
        center[1],
        size * 0.62 * layout.pixelsPerUnit,
        size * 0.54 * layout.pixelsPerUnit,
        placement.angle * 0.06,
        0.52,
      );
      fillOrganicShape(
        sketch,
        medium,
        blob,
        index % 3 === 0 ? recipe.palette.leafShadow : recipe.palette.leaf,
        recipe.linePressure,
        { gap: 8, edge: 3.1, scribble: true },
      );
    });
    return;
  }

  ordered.forEach((placement, index) => {
    const side = Math.cos(placement.angle);
    const depthScale = 0.76 + Math.sin(placement.angle) * 0.14;
    const length = recipe.leaves.size * placement.scale;
    if (recipe.leaves.style === 'tuft') {
      const base = {
        x: side * recipe.mound.radius * placement.radial * 0.48,
        y: layout.stem.base.y,
      };
      const tip = {
        x: base.x + side * length * recipe.leaves.lean,
        y: base.y + length * (1.18 + placement.rise * 0.34),
      };
      const path = canvasPoints(layout, canvas, [
        base,
        {
          x: base.x + side * length * (recipe.leaves.lean * 0.38 + placement.curl * 0.1),
          y: base.y + (tip.y - base.y) * 0.55,
        },
        tip,
      ]);
      sketch.setInk(index % 3 === 0 ? recipe.palette.leafShadow : recipe.palette.leaf);
      sketch.stroke(path, Math.max(2, length * layout.pixelsPerUnit * 0.045), {
        alpha: index % 3 === 0 ? 0.62 : 0.78,
        ghost: true,
        taper: 0.82,
        amplitude: 0.48,
      });
      sketch.setInk(null);
      return;
    }

    const baseY = recipe.leaves.style === 'sprig'
      ? layout.stem.base.y + recipe.stem.height * (0.28 + placement.rise * 0.38)
      : layout.leaves.anchorY;
    const base = { x: stemXAt(layout, baseY), y: baseY };
    const tip = {
      x: base.x + side * length * (recipe.leaves.style === 'sprig' ? 0.66 : 0.9),
      y: base.y + length * (recipe.leaves.style === 'sprig'
        ? 0.28 + placement.rise * 0.18
        : 0.26 + Math.abs(Math.sin(placement.angle)) * 0.24),
    };
    drawLeaf(
      sketch,
      recipe,
      layout,
      canvas,
      medium,
      base,
      tip,
      length * (recipe.leaves.style === 'sprig' ? 0.14 : 0.22) * depthScale,
      placement,
      index,
    );
  });
}

function drawBloom(
  sketch: Sketch,
  recipe: PlantRecipe,
  layout: PlantLayout,
  canvas: Size2,
  medium: Medium,
): void {
  if (recipe.bloom.style === 'none') return;
  const center = layout.bloom.center;
  const centerCanvas = canvasPoint(layout, canvas, center);
  if (recipe.bloom.style === 'ball') {
    const ball = sketch.blobPoints(
      centerCanvas[0],
      centerCanvas[1],
      layout.bloom.radius * layout.pixelsPerUnit,
      layout.bloom.radius * 0.84 * layout.pixelsPerUnit,
      0,
      0.46,
    );
    fillOrganicShape(sketch, medium, ball, recipe.palette.bloom, recipe.linePressure, {
      gap: 6,
      edge: 3,
      scribble: true,
    });
    return;
  }
  if (recipe.bloom.style === 'blossom') {
    for (const [index, placement] of recipe.bloom.placements.entries()) {
      const radius = recipe.leaves.size * (0.48 + placement.radial * 0.52);
      const blossomCenter = canvasPoint(layout, canvas, {
        x: center.x + Math.cos(placement.angle) * radius,
        y: center.y + placement.rise * recipe.leaves.size * 0.52,
      });
      const blossom = sketch.blobPoints(
        blossomCenter[0],
        blossomCenter[1],
        recipe.bloom.size * placement.scale * 8,
        recipe.bloom.size * placement.scale * 7,
        placement.angle,
        0.38,
      );
      fillOrganicShape(
        sketch,
        medium,
        blossom,
        index % 3 === 0 ? recipe.palette.bloomCenter : recipe.palette.bloom,
        recipe.linePressure,
        { gap: 5, edge: 1.5 },
      );
    }
    return;
  }
  if (recipe.bloom.style === 'seedhead') {
    for (const [index, placement] of recipe.bloom.placements.entries()) {
      const base = layout.stem.base;
      const tip = {
        x: center.x + Math.cos(placement.angle) * recipe.bloom.size * 0.22,
        y: center.y + placement.scale * recipe.bloom.size * 0.34,
      };
      sketch.stroke(canvasPoints(layout, canvas, [base, tip]), 1.7 * recipe.linePressure, {
        alpha: 0.68,
        taper: 0.72,
      });
      const head = sketch.blobPoints(
        canvasPoint(layout, canvas, tip)[0],
        canvasPoint(layout, canvas, tip)[1],
        4 + placement.scale * 2,
        10 + placement.scale * 3,
        index * 0.2,
        0.35,
      );
      fillOrganicShape(sketch, medium, head, recipe.palette.leafShadow, recipe.linePressure, {
        gap: 4,
        edge: 1.5,
      });
    }
    return;
  }

  for (let index = 0; index < recipe.bloom.petals; index += 1) {
    const angle = index / recipe.bloom.petals * TAU;
    const petalLength = recipe.bloom.size * 0.48;
    const tip = {
      x: center.x + Math.cos(angle) * petalLength,
      y: center.y + Math.sin(angle) * petalLength,
    };
    const petal = leafShape(
      layout,
      canvas,
      center,
      tip,
      recipe.bloom.size * 0.13,
      0.08,
    );
    fillOrganicShape(sketch, medium, petal, recipe.palette.bloom, recipe.linePressure, {
      gap: 5,
      edge: 1.9,
    });
  }
  const disc = sketch.blobPoints(
    centerCanvas[0],
    centerCanvas[1],
    recipe.bloom.size * 0.15 * layout.pixelsPerUnit,
    recipe.bloom.size * 0.13 * layout.pixelsPerUnit,
    0,
    0.34,
  );
  fillOrganicShape(sketch, medium, disc, recipe.palette.bloomCenter, recipe.linePressure, {
    gap: 4,
    edge: 2.2,
  });
}

function plantLayer(
  id: string,
  order: number,
  layout: PlantLayout,
  canvas: Size2,
  draw: LayerDefinition['draw'],
): LayerDefinition {
  return Object.freeze({
    id,
    bone: id,
    order,
    depth: order * 0.08,
    canvas,
    world: Object.freeze({ width: layout.bounds.width, height: layout.bounds.height }),
    position: Object.freeze({
      x: layout.bounds.x + layout.bounds.width / 2,
      y: layout.bounds.y,
    }),
    pivot: [0.5, 0] as const,
    states: Object.freeze(['idle']),
    draw,
  });
}

function plantColliders(recipe: PlantRecipe, layout: PlantLayout): readonly Collider[] {
  if (recipe.stem.style !== 'trunk') return Object.freeze([]);
  const minimumX = Math.min(layout.stem.base.x, layout.stem.crown.x) - recipe.stem.radius * 0.78;
  const maximumX = Math.max(layout.stem.base.x, layout.stem.crown.x) + recipe.stem.radius * 0.78;
  return Object.freeze([Object.freeze({
    id: 'stem',
    kind: 'solid',
    shape: 'rectangle',
    x: minimumX,
    y: layout.stem.base.y,
    width: maximumX - minimumX,
    height: recipe.stem.height,
  })]);
}

export function createPlantBlueprint(recipe: PlantRecipe): AssetBlueprint {
  const layout = buildPlantLayout(recipe);
  const medium = mediumById(recipe.medium);
  const canvas = Object.freeze({
    width: Math.max(1, Math.ceil(layout.bounds.width * layout.pixelsPerUnit)),
    height: Math.max(1, Math.ceil(layout.bounds.height * layout.pixelsPerUnit)),
  });
  const layers = Object.freeze([
    plantLayer('mound', 0, layout, canvas, ({ sketch }) => {
      drawMound(sketch, recipe, layout, canvas, medium);
    }),
    plantLayer('stem', 1, layout, canvas, ({ sketch }) => {
      drawStem(sketch, recipe, layout, canvas, medium);
    }),
    plantLayer('leaves', 2, layout, canvas, ({ sketch }) => {
      drawLeaves(sketch, recipe, layout, canvas, medium);
    }),
    plantLayer('bloom', 3, layout, canvas, ({ sketch }) => {
      drawBloom(sketch, recipe, layout, canvas, medium);
    }),
  ]);

  return Object.freeze({
    id: `plant:${recipe.species}:${recipe.seed}`,
    kind: `plant:${recipe.species}`,
    seed: recipe.seed,
    medium: recipe.medium,
    bounds: layout.bounds,
    layers,
    colliders: plantColliders(recipe, layout),
    sockets: layout.sockets,
    interactions: Object.freeze([]),
  });
}
