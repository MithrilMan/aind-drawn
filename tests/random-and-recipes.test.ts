import { describe, expect, it } from 'vitest';

import {
  Random,
  SeedTree,
  buildCharacterLayout,
  buildPlantLayout,
  buildSolidCharacterLayout,
  buildSolidFaceLayout,
  createCharacterIdentity,
  createCharacterBlueprint,
  createCharacterRecipe,
  createPlantBlueprint,
  createPlantRecipe,
  createPropBlueprint,
  createPropRecipe,
  createSceneryBlueprint,
  createSceneryRecipe,
  createRasterCharacterBlueprint,
  createRasterCharacterRecipe,
  createSolidCharacterFaceBlueprint,
  createSolidCharacterBlueprint,
  createSolidCharacterRecipe,
  createSolidFaceBlueprint,
  createSolidFaceRecipe,
} from '../src/index.js';

describe('deterministic generation', () => {
  it('repeats a random sequence for the same seed', () => {
    const left = new Random('stable-seed');
    const right = new Random('stable-seed');
    expect(Array.from({ length: 12 }, () => left.next()))
      .toEqual(Array.from({ length: 12 }, () => right.next()));
  });

  it('keeps namespace streams independent of evaluation order', () => {
    const firstTree = new SeedTree(4107);
    const characterFirst = firstTree.random('character');
    const characterValues = [characterFirst.next(), characterFirst.next(), characterFirst.next()];
    firstTree.random('building').next();

    const secondTree = new SeedTree(4107);
    secondTree.random('building').next();
    const characterSecond = secondTree.random('character');
    expect([characterSecond.next(), characterSecond.next(), characterSecond.next()])
      .toEqual(characterValues);
  });

  it('forks from the immutable seed rather than mutable draw state', () => {
    const before = new Random(77);
    const earlyFork = before.fork('eyes');
    before.next();
    before.next();
    const lateFork = before.fork('eyes');
    expect([lateFork.next(), lateFork.next()]).toEqual([earlyFork.next(), earlyFork.next()]);
  });

  it('persists complete recipes as stable JSON data', () => {
    const first = createCharacterRecipe(913, { species: 'cat', medium: 'watercolor' });
    const second = createCharacterRecipe(913, { species: 'cat', medium: 'watercolor' });
    expect(JSON.parse(JSON.stringify(first))).toEqual(second);
  });

  it('keeps plant identity independent from the selected drawing medium', () => {
    const graphite = createPlantRecipe(1771, { species: 'tree', medium: 'graphite' });
    const watercolor = createPlantRecipe(1771, { species: 'tree', medium: 'watercolor' });
    expect({ ...graphite, medium: 'watercolor' }).toEqual(watercolor);
    expect(JSON.parse(JSON.stringify(graphite))).toEqual(
      createPlantRecipe(1771, { species: 'tree', medium: 'graphite' }),
    );
  });

  it('persists solid faces as renderer-neutral deterministic data', () => {
    const first = createSolidFaceRecipe(707, { species: 'human', finish: 'ceramic' });
    const second = createSolidFaceRecipe(707, { species: 'human', finish: 'ceramic' });
    const blueprint = createSolidFaceBlueprint(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(second);
    expect(JSON.parse(JSON.stringify(blueprint))).toEqual(blueprint);
    expect(blueprint.representation).toBe('solid');
    expect(blueprint.parts.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'head', 'eye:left:white', 'eye:left:pupil', 'eye:right:white', 'eye:right:pupil', 'mouth',
    ]));
  });

  it('projects one character identity into raster and solid representations', () => {
    const identity = createCharacterIdentity(4107, { species: 'cat', shape: 'pear' });
    const rasterRecipe = createRasterCharacterRecipe(identity, { medium: 'graphite' });
    const solidRecipe = createSolidCharacterRecipe(identity, { finish: 'ceramic' });
    const raster = createRasterCharacterBlueprint(identity, { medium: 'graphite' });
    const solid = createSolidCharacterFaceBlueprint(identity, { finish: 'ceramic' });

    expect(rasterRecipe.identity).toBe(identity);
    expect(solidRecipe.identity).toBe(identity);
    expect(raster.seed).toBe(identity.seed);
    expect(solid.seed).toBe(identity.seed);
    expect(rasterRecipe.identity.palette).toEqual(solidRecipe.identity.palette);
    expect(rasterRecipe.identity.head).toEqual(solidRecipe.identity.head);
    expect(rasterRecipe.identity.eyes).toEqual(solidRecipe.identity.eyes);
    expect(rasterRecipe.identity.mouth).toEqual(solidRecipe.identity.mouth);
    expect(solid.parts.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'ear:left', 'ear:right', 'muzzle:left', 'muzzle:right', 'nose',
    ]));
    expect(createRasterCharacterRecipe(identity, { medium: 'watercolor' }).identity).toBe(identity);
    expect(createSolidCharacterRecipe(identity, { finish: 'metal' }).identity).toBe(identity);
    expect(JSON.parse(JSON.stringify(identity))).toEqual(
      createCharacterIdentity(4107, { species: 'cat', shape: 'pear' }),
    );
  });

  it('keeps compatibility factories semantically aligned for the same character seed', () => {
    const raster = createCharacterRecipe(8128, { species: 'cat', shape: 'wide' });
    const solid = createSolidFaceRecipe(8128, { species: 'cat', shape: 'wide' });

    expect(raster.identity).toEqual(solid.identity);
  });

  it('stores head proportions in the identity instead of representation adapters', () => {
    const identity = createCharacterIdentity(2718, { shape: 'wide' });
    const rasterLayout = buildCharacterLayout(createRasterCharacterRecipe(identity));
    const solidLayout = buildSolidFaceLayout(createSolidCharacterRecipe(identity));

    expect(rasterLayout.head.widthPixels / rasterLayout.head.heightPixels)
      .toBeCloseTo(solidLayout.shape.radii[0] / solidLayout.shape.radii[1]);
    expect(Object.isFrozen(identity.palette.skin)).toBe(true);
  });

  it('keeps authored eye and hair overrides inside the shared identity', () => {
    const identity = createCharacterIdentity(1618, {
      species: 'creature',
      eyeStyle: 'star',
      alternateEyeStyle: 'dot',
      hairStyle: 'bob',
      mouthStyle: 'open',
      outfitStyle: 'stripe',
    });

    expect(identity.eyes).toMatchObject({ style: 'star', alternateStyle: 'dot' });
    expect(identity.hair.style).toBe('bob');
    expect(identity.mouth.style).toBe('open');
    expect(identity.outfit.style).toBe('stripe');
    expect(createRasterCharacterRecipe(identity).identity).toBe(identity);
    expect(createSolidCharacterRecipe(identity).identity).toBe(identity);
  });

  it('applies identity overrides without rerolling unrelated measurements', () => {
    const generated = createCharacterIdentity(2048, { species: 'human' });
    const authored = createCharacterIdentity(2048, {
      species: 'human',
      shape: generated.head.shape === 'wide' ? 'tall' : 'wide',
      eyeStyle: generated.eyes.style === 'star' ? 'dot' : 'star',
      alternateEyeStyle: null,
      mouthStyle: generated.mouth.style === 'open' ? 'flat' : 'open',
      hairStyle: generated.hair.style === 'bob' ? 'fringe' : 'bob',
    });

    expect(authored.head).toMatchObject({
      wobble: generated.head.wobble,
      tilt: generated.head.tilt,
    });
    expect(authored.eyes).toMatchObject({
      spacing: generated.eyes.spacing,
      size: generated.eyes.size,
      verticalOffset: generated.eyes.verticalOffset,
      glint: generated.eyes.glint,
    });
    expect(authored.mouth).toMatchObject({
      width: generated.mouth.width,
      verticalOffset: generated.mouth.verticalOffset,
    });
    expect(authored.hair.height).toBe(generated.hair.height);
    expect(authored.body).toEqual(generated.body);
  });
});

describe('asset contracts', () => {
  it('derives character collider and sockets from the same layout', () => {
    const recipe = createCharacterRecipe(22);
    const layout = buildCharacterLayout(recipe);
    const blueprint = createCharacterBlueprint(recipe);
    const body = blueprint.colliders[0];
    expect(body?.shape).toBe('rectangle');
    expect(blueprint.sockets.feet).toEqual({ x: 0, y: 0 });
    expect(blueprint.sockets.head).toEqual(layout.sockets.head);
    expect(blueprint.bounds.height).toBeGreaterThan(1.5);
  });

  it('parents face details to the head bone', () => {
    const blueprint = createCharacterBlueprint(createCharacterRecipe(144));
    const eye = blueprint.layers.find((layer) => layer.id === 'eye:left');
    const mouth = blueprint.layers.find((layer) => layer.id === 'mouth');
    expect(eye?.parentBone).toBe('head');
    expect(mouth?.parentBone).toBe('head');
  });

  it('models cats as a distinct layered silhouette rather than a human with ears', () => {
    const cat = createCharacterBlueprint(createCharacterRecipe(144, { species: 'cat' }));
    const human = createCharacterBlueprint(createCharacterRecipe(144, { species: 'human' }));
    expect(cat.layers.map(({ id }) => id)).toEqual(expect.arrayContaining(['tail', 'muzzle']));
    expect(human.layers.map(({ id }) => id)).not.toEqual(expect.arrayContaining(['tail', 'muzzle']));
    expect(cat.sockets.tail).toBeDefined();
    const tail = cat.layers.find(({ id }) => id === 'tail');
    expect(tail?.parentBone).toBe('torso');
    expect(tail?.pivot[1]).toBeCloseTo(1 - 116 / 150);
  });

  it('keeps outfit identity separate and gives humanoids visible authored clothing', () => {
    const recipe = createCharacterRecipe(501, { species: 'human' });
    const human = createCharacterBlueprint(recipe);
    const cat = createCharacterBlueprint(createCharacterRecipe(501, { species: 'cat' }));
    const distance = Math.hypot(
      recipe.identity.palette.skin[0] - recipe.identity.palette.cloth[0],
      recipe.identity.palette.skin[1] - recipe.identity.palette.cloth[1],
      recipe.identity.palette.skin[2] - recipe.identity.palette.cloth[2],
    );
    expect(distance).toBeGreaterThan(35);
    expect(human.layers.find(({ id }) => id === 'outfit')?.parentBone).toBe('torso');
    expect(cat.layers.find(({ id }) => id === 'outfit')).toBeUndefined();
  });

  it('derives multipart plant layers, anchors, bounds, and tree collision from one layout', () => {
    const recipe = createPlantRecipe(90210, { species: 'tree' });
    const layout = buildPlantLayout(recipe);
    const blueprint = createPlantBlueprint(recipe);
    expect(blueprint.layers.map(({ id }) => id)).toEqual(['mound', 'stem', 'leaves', 'bloom']);
    expect(blueprint.sockets.root).toEqual(layout.stem.base);
    expect(blueprint.sockets.crown).toEqual(layout.stem.crown);
    expect(blueprint.colliders).toEqual([
      expect.objectContaining({ id: 'stem', kind: 'solid', height: recipe.stem.height }),
    ]);
    expect(layout.bounds.y).toBe(0);
    expect(layout.sockets.top?.y).toBeLessThanOrEqual(layout.bounds.height);

    const grass = createPlantBlueprint(createPlantRecipe(90210, { species: 'grass' }));
    expect(grass.colliders).toHaveLength(0);
    expect(grass.sockets.root).toBeDefined();
  });

  it('places solid face features on the same analytic surface used by geometry', () => {
    const recipe = createSolidFaceRecipe(911, { shape: 'block' });
    const layout = buildSolidFaceLayout(recipe);
    const [radiusX, radiusY, radiusZ] = layout.shape.radii;
    const surfaceAnchors = [
      layout.at(-0.36, 0.14 + recipe.identity.eyes.verticalOffset),
      layout.at(0.36, 0.14 + recipe.identity.eyes.verticalOffset),
      layout.at(0, -recipe.identity.mouth.verticalOffset * 0.68),
      layout.at(0, 0),
    ];
    for (const anchor of surfaceAnchors) {
      const point = anchor.point;
      const value = Math.pow(Math.abs(point[0] / radiusX), layout.shape.exponent)
        + Math.pow(Math.abs(point[1] / radiusY), layout.shape.exponent)
        + Math.pow(Math.abs(point[2] / radiusZ), layout.shape.exponent);
      expect(value).toBeCloseTo(1);
      expect(Math.hypot(...anchor.normal)).toBeCloseTo(1);
    }
    const blueprint = createSolidFaceBlueprint(recipe);
    expect(blueprint.colliders[0]).toMatchObject({ shape: 'box', center: layout.center });
    expect(blueprint.sockets.face).toBeDefined();
  });

  it('builds a complete solid character from semantic nodes and one body layout', () => {
    const identity = createCharacterIdentity(4107, {
      species: 'cat', hairStyle: 'none', eyeStyle: 'saucer', alternateEyeStyle: null,
    });
    const recipe = createSolidCharacterRecipe(identity, { finish: 'matte' });
    const layout = buildSolidCharacterLayout(recipe);
    const blueprint = createSolidCharacterBlueprint(recipe);

    expect(blueprint.kind).toBe('solid-character');
    expect(blueprint.nodes.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'root', 'torso', 'head', 'arm:left', 'arm:right',
      'leg:left', 'leg:right', 'tail',
    ]));
    expect(blueprint.parts.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'body:torso', 'arm:left', 'arm:right', 'hand:left', 'hand:right',
      'leg:left', 'leg:right', 'foot:left', 'foot:right', 'head',
      'ear:left', 'ear:right', 'muzzle:left', 'muzzle:right', 'tail:0',
    ]));
    expect(blueprint.sockets).toEqual(layout.sockets);
    expect(blueprint.colliders.map(({ id }) => id)).toEqual(['body', 'head']);
    expect(JSON.parse(JSON.stringify(blueprint))).toEqual(blueprint);
  });

  it('maps asymmetric eyes and every hair family without collapsing variants', () => {
    const identity = createCharacterIdentity(99, {
      species: 'creature',
      eyeStyle: 'star',
      alternateEyeStyle: 'dot',
      hairStyle: 'fringe',
    });
    const blueprint = createSolidCharacterBlueprint(identity);
    const ids = blueprint.parts.map(({ id }) => id);
    expect(ids).toEqual(expect.arrayContaining([
      'eye:left:star', 'eye:right:pupil',
      'hair:cap', 'hair:fringe:0',
    ]));
    expect(ids).not.toContain('eye:right:white');

    const signatures = ['none', 'cap', 'bob', 'fringe', 'spikes', 'tuft', 'crown'].map(
      (hairStyle) => createSolidCharacterBlueprint(createCharacterIdentity(99, {
        hairStyle: hairStyle as typeof identity.hair.style,
      })).parts.filter(({ id }) => id.startsWith('hair:')).map(({ id }) => id).join('|'),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('provides gameplay geometry for props and scenery without reading pixels', () => {
    const crate = createPropBlueprint(createPropRecipe(5, { prop: 'crate' }));
    const platform = createSceneryBlueprint(createSceneryRecipe(6, {
      scenery: 'platform',
      width: 4,
      height: 0.75,
    }));
    expect(crate.colliders).toHaveLength(1);
    expect(platform.colliders[0]).toMatchObject({ width: 4, height: 0.75 });
    expect(platform.sockets.top?.y).toBe(0.75);
  });

  it('always exposes a stateful building door as gameplay metadata', () => {
    const recipe = createSceneryRecipe(612, { scenery: 'building', balcony: true, chimney: true });
    const building = createSceneryBlueprint(recipe);
    expect(building.layers.find(({ id }) => id === 'door')?.states).toEqual(['closed', 'open']);
    expect(building.colliders).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'door:sensor', kind: 'sensor' }),
    ]));
    expect(building.sockets['door:entry']).toBeDefined();
    expect(building.interactions[0]).toMatchObject({
      id: 'door',
      kind: 'portal',
      initialState: 'closed',
    });
  });

  it('scales deterministic balcony count and placement with building dimensions', () => {
    const small = createSceneryRecipe(811, {
      scenery: 'building', width: 3.8, height: 3.8, balcony: true,
    });
    const medium = createSceneryRecipe(811, {
      scenery: 'building', width: 5.4, height: 5.8, balcony: true,
    });
    const wide = createSceneryRecipe(811, {
      scenery: 'building', width: 12, height: 4, balcony: true,
    });
    expect(small.balconies).toHaveLength(1);
    expect(medium.balconies.length).toBeGreaterThan(1);
    expect(wide.balconies.length).toBeGreaterThan(medium.balconies.length);
    expect(createSceneryRecipe(811, {
      scenery: 'building', width: 12, height: 4, balcony: true,
    }).balconies).toEqual(wide.balconies);
    for (const balcony of wide.balconies) {
      expect(balcony.floorFromGround).toBeGreaterThanOrEqual(1);
      expect(balcony.floorFromGround).toBeLessThan(wide.floors);
      expect(balcony.startColumn + balcony.columnSpan).toBeLessThanOrEqual(wide.columns);
    }
  });
});
