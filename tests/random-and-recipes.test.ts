import { describe, expect, it } from 'vitest';

import {
  CHARACTER_EXPRESSIONS,
  MEDIUM_IDS,
  Random,
  SeedTree,
  buildCharacterLayout,
  buildPlantLayout,
  buildSolidCharacterLayout,
  buildSolidFaceLayout,
  characterEyeCenterY,
  characterHeadShapeField,
  characterMouthCenterY,
  createBuildingIdentity,
  createCharacterEyeProfile,
  createCharacterHairProfile,
  createCharacterMouthProfile,
  createCharacterOutfitProfile,
  createCharacterIdentity,
  createCharacterBlueprint,
  createCharacterRecipe,
  createInkedSolidBlueprint,
  inkedSolidMediumDefaults,
  createPlantBlueprint,
  createPlantRecipe,
  createPlatformBlueprint,
  createPlatformRecipe,
  createPropBlueprint,
  createPropRecipe,
  createRasterBuildingBlueprint,
  createRasterBuildingRecipe,
  createRasterCharacterBlueprint,
  createRasterCharacterRecipe,
  createSolidCharacterFaceBlueprint,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
  createSolidCharacterRecipe,
  createSolidBuildingBlueprint,
  createSolidBuildingInkStrokes,
  createSolidBuildingRecipe,
  createSolidFaceBlueprint,
  createSolidFaceRecipe,
  pointOnSuperellipsoid,
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

  it('keeps seed convenience factories semantically aligned', () => {
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

  it('uses the same normalized head and feature geometry in raster and solid adapters', () => {
    const identity = createCharacterIdentity(2721, {
      shape: 'pear', eyeStyle: 'saucer', hairStyle: 'bob', mouthStyle: 'smile',
    });
    const raster = buildCharacterLayout(createRasterCharacterRecipe(identity));
    const solid = buildSolidFaceLayout(createSolidCharacterRecipe(identity));
    const field = characterHeadShapeField(identity.head);

    expect(solid.shape.exponent).toBe(field.exponent);
    expect(solid.shape.deformation).toEqual(field.deformation);
    expect(Math.abs(raster.eyes.left.x) * raster.pixelsPerUnit / (raster.head.widthPixels * 0.5))
      .toBeCloseTo(identity.eyes.spacing, 6);
    expect(Math.abs(solid.eyeAnchors[0].point[0]) / solid.shape.radii[0])
      .toBeCloseTo(identity.eyes.spacing, 5);
    expect((raster.eyes.left.y - raster.head.center.y) * raster.pixelsPerUnit
      / (raster.head.heightPixels * 0.5)).toBeCloseTo(characterEyeCenterY(identity), 6);
    expect(solid.eyeAnchors[0].point[1] / solid.shape.radii[1])
      .toBeCloseTo(characterEyeCenterY(identity), 5);
    expect((raster.mouth.y - raster.head.center.y) * raster.pixelsPerUnit
      / (raster.head.heightPixels * 0.5)).toBeCloseTo(characterMouthCenterY(identity), 6);
    expect(solid.mouthAnchor.point[1] / solid.shape.radii[1])
      .toBeCloseTo(characterMouthCenterY(identity), 5);
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
      mouthTeeth: generated.mouth.teeth === 'fangs' ? 'none' : 'fangs',
      mouthTongue: !generated.mouth.tongue,
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
      teeth: generated.mouth.teeth === 'fangs' ? 'none' : 'fangs',
      tongue: !generated.mouth.tongue,
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
    const surfaceAnchors = [
      layout.at(-0.36, 0.14 + recipe.identity.eyes.verticalOffset),
      layout.at(0.36, 0.14 + recipe.identity.eyes.verticalOffset),
      layout.at(0, -recipe.identity.mouth.verticalOffset * 0.68),
      layout.at(0, 0),
    ];
    for (const anchor of surfaceAnchors) {
      const point = anchor.point;
      const reprojected = pointOnSuperellipsoid(layout.shape, point).point;
      expect(reprojected[0]).toBeCloseTo(point[0], 6);
      expect(reprojected[1]).toBeCloseTo(point[1], 6);
      expect(reprojected[2]).toBeCloseTo(point[2], 6);
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
      'hair:fringe',
    ]));
    expect(ids).not.toContain('eye:right:white');

    const signatures = ['none', 'cap', 'bob', 'fringe', 'spikes', 'tuft', 'crown'].map(
      (hairStyle) => createSolidCharacterBlueprint(createCharacterIdentity(99, {
        hairStyle: hairStyle as typeof identity.hair.style,
      })).parts.filter(({ id }) => id.startsWith('hair:')).map(({ id }) => id).join('|'),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('projects a shared hairstyle as a raster silhouette and a head-conforming solid shell', () => {
    const identity = createCharacterIdentity(108, { hairStyle: 'bob' });
    const profile = createCharacterHairProfile(identity);
    const blueprint = createSolidCharacterBlueprint(identity);
    const head = blueprint.parts.find(({ id }) => id === 'head');
    const hair = blueprint.parts.find(({ id }) => id === 'hair:bob');
    expect(profile).not.toBeNull();
    expect(head?.geometry.type).toBe('superellipsoid');
    expect(profile?.spatial.kind).toBe('head-shell');
    expect(hair?.geometry.type).toBe('mesh');
    if (profile === null || head?.geometry.type !== 'superellipsoid'
      || hair?.geometry.type !== 'mesh') return;
    const zCoordinates = hair.geometry.vertices.map((vertex) => vertex[2]);
    expect(Math.min(...zCoordinates)).toBeLessThan(-head.geometry.radii[2]);
    expect(Math.max(...zCoordinates)).toBeGreaterThan(head.geometry.radii[2]);
    expect(profile.outline.length).toBeGreaterThan(3);
  });

  it('keeps eye proportions and semantic eyelids representation-neutral', () => {
    const identity = createCharacterIdentity(4_107);
    const rightStyle = identity.eyes.alternateStyle ?? identity.eyes.style;
    const profile = createCharacterEyeProfile(identity, rightStyle);
    const blueprint = createSolidCharacterBlueprint(identity);
    expect(profile.style).toBe('sleepy');
    expect(profile.strokes.map(({ id }) => id)).toContain('upper-lid');
    expect(blueprint.parts.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'eye:right:pupil', 'eye:right:upper-lid',
    ]));
    expect('pupilScale' in createSolidCharacterRecipe(identity).style).toBe(false);
  });

  it('projects one deterministic irregular outfit stripe in raster and solid space', () => {
    const identity = createCharacterIdentity(4_107);
    const profile = createCharacterOutfitProfile(identity);
    const stripe = profile.marks.find(({ id }) => id === 'stripe');
    const solid = createSolidCharacterBlueprint(identity);
    expect(profile.style).toBe('stripe');
    expect(profile.marks).toHaveLength(1);
    expect(stripe?.outline.length).toBeGreaterThan(8);
    expect(new Set(stripe?.outline.map(([, y]) => y.toFixed(4))).size).toBeGreaterThan(4);
    expect(solid.parts.filter(({ id }) => id.startsWith('outfit:stripe'))).toHaveLength(1);
  });

  it('never represents authored hair as a front extrusion', () => {
    for (const hairStyle of ['cap', 'bob', 'fringe', 'spikes', 'tuft', 'crown'] as const) {
      const identity = createCharacterIdentity(108, { hairStyle });
      const profile = createCharacterHairProfile(identity);
      const hair = createSolidCharacterBlueprint(identity).parts
        .find(({ id }) => id === `hair:${hairStyle}`);
      expect(profile?.spatial.kind).not.toBe('front-extrusion');
      expect(hair?.geometry.type).toBe('mesh');
    }
  });

  it('keeps the 4109 bob front edge clear of its generated eye field', () => {
    const identity = createCharacterIdentity(4_109);
    const profile = createCharacterHairProfile(identity);
    expect(profile?.spatial.kind).toBe('head-shell');
    if (profile?.spatial.kind !== 'head-shell') return;
    expect(profile.spatial.frontHairline)
      .toBeGreaterThan(characterEyeCenterY(identity) + identity.eyes.size * 0.13);
  });

  it('builds distinct mouth geometry for semantic styles and facial expressions', () => {
    const identity = createCharacterIdentity(109, {
      mouthStyle: 'maw',
      mouthTeeth: 'row',
      mouthTongue: true,
    });
    const blueprint = createSolidCharacterBlueprint(identity);
    const mouths = blueprint.parts.filter(({ motion }) => motion.role === 'mouth');
    expect(new Set(mouths.map(({ motion }) => motion.expression)))
      .toEqual(new Set(CHARACTER_EXPRESSIONS));
    expect(mouths.filter(({ visible }) => visible !== false).map(({ id }) => id))
      .toEqual(expect.arrayContaining([
        'mouth', 'mouth:interior', 'mouth:tooth:0', 'mouth:tongue',
      ]));

    const idle = createCharacterMouthProfile(identity.mouth);
    expect(idle.layers.map(({ role }) => role)).toEqual(expect.arrayContaining([
      'ink', 'interior', 'tooth', 'tongue',
    ]));
    expect(createCharacterMouthProfile(identity.mouth, 'angry').strokes.map(({ id }) => id))
      .toEqual(expect.arrayContaining(['tooth-split', 'tooth-divider:1']));
    expect(createCharacterMouthProfile(identity.mouth, 'happy').layers)
      .not.toEqual(createCharacterMouthProfile(identity.mouth, 'sad').layers);
  });

  it('provides gameplay geometry for props and platforms without reading pixels', () => {
    const crate = createPropBlueprint(createPropRecipe(5, { prop: 'crate' }));
    const platform = createPlatformBlueprint(createPlatformRecipe(6, {
      width: 4,
      height: 0.75,
    }));
    expect(crate.colliders).toHaveLength(1);
    expect(platform.colliders[0]).toMatchObject({ width: 4, height: 0.75 });
    expect(platform.sockets.top?.y).toBe(0.75);
    expect(() => createPlatformRecipe(6, { width: 0 })).toThrow(/width/i);
  });

  it('always exposes a stateful building door as gameplay metadata', () => {
    const identity = createBuildingIdentity(612, { balcony: true, chimney: true });
    const recipe = createRasterBuildingRecipe(identity);
    const building = createRasterBuildingBlueprint(recipe);
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
    const small = createBuildingIdentity(811, {
      archetype: 'townhouse', width: 3.8, height: 3.8, balcony: true,
    });
    const medium = createBuildingIdentity(811, {
      archetype: 'townhouse', width: 5.4, height: 5.8, balcony: true,
    });
    const wide = createBuildingIdentity(811, {
      archetype: 'townhouse', width: 12, height: 4, balcony: true,
    });
    expect(small.balconies).toHaveLength(1);
    expect(medium.balconies.length).toBeGreaterThan(1);
    expect(wide.balconies.length).toBeGreaterThan(medium.balconies.length);
    expect(createBuildingIdentity(811, {
      archetype: 'townhouse', width: 12, height: 4, balcony: true,
    }).balconies).toEqual(wide.balconies);
    for (const balcony of wide.balconies) {
      expect(balcony.floorFromGround).toBeGreaterThanOrEqual(1);
      expect(balcony.floorFromGround).toBeLessThan(wide.floors);
      expect(balcony.startColumn + balcony.columnSpan).toBeLessThanOrEqual(wide.columns);
    }
  });

  it('projects one building identity into raster and solid representations', () => {
    const identity = createBuildingIdentity(1440, {
      archetype: 'apartment', width: 8.4, height: 11.2,
      roof: 'flat', balcony: true, chimney: false,
    });
    const rasterRecipe = createRasterBuildingRecipe(identity, { medium: 'watercolor' });
    const solidRecipe = createSolidBuildingRecipe(identity, { finish: 'ceramic' });
    const raster = createRasterBuildingBlueprint(rasterRecipe);
    const solid = createSolidBuildingBlueprint(solidRecipe);

    expect(rasterRecipe.identity).toBe(identity);
    expect(solidRecipe.identity).toBe(identity);
    expect(raster.seed).toBe(identity.seed);
    expect(solid.seed).toBe(identity.seed);
    expect(solid.parts.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'building:shell', 'building:roof', 'door', 'balcony:0:floor',
    ]));
    expect(solid.interactions[0]).toMatchObject({
      id: 'door', sensorColliderId: 'door:sensor', activationSocketId: 'door:entry',
    });
    expect(JSON.parse(JSON.stringify(identity))).toEqual(identity);
    expect(JSON.parse(JSON.stringify(solid))).toEqual(solid);
  });

  it('adds one renderer-neutral ink policy to different solid asset families', () => {
    const characterSolid = createSolidCharacterBlueprint(createCharacterIdentity(304));
    const buildingSolid = createSolidBuildingBlueprint(createBuildingIdentity(304));
    const characterInk = createInkedSolidBlueprint(characterSolid, {
      medium: 'graphite',
      strokes: createSolidCharacterInkStrokes(characterSolid),
    });
    const buildingInk = createInkedSolidBlueprint(buildingSolid, {
      medium: 'graphite',
      strokes: createSolidBuildingInkStrokes(buildingSolid),
    });

    expect(characterInk.representation).toBe('inked-solid');
    expect(characterInk.solid).toBe(characterSolid);
    expect(buildingInk.solid).toBe(buildingSolid);
    expect(characterInk.contour).toEqual(buildingInk.contour);
    expect(characterInk.viewMarks.find(({ materialRole }) => materialRole === 'hair')?.style)
      .toBe('scribble');
    expect(characterInk.viewMarks.find(({ materialRole }) => materialRole === 'linework')?.style)
      .toBe('solid');
    expect(characterInk.viewMarks.find(({ materialRole }) => materialRole === 'eye-white')?.style)
      .toBe('none');
    const facadeTone = buildingSolid.materials.find(({ role }) => role === 'facade')?.drawing?.tone;
    expect(buildingInk.viewMarks.find(({ materialRole }) => materialRole === 'facade')?.style)
      .toBe(facadeTone === 'black' ? 'scribble' : facadeTone);
    expect(characterInk.deposition).toEqual(buildingInk.deposition);
    expect(characterInk.strokes.length).toBeGreaterThan(0);
    expect(buildingInk.strokes.length).toBeGreaterThan(0);
    expect(characterInk.strokes.every(({ partId }) => (
      characterSolid.parts.some(({ id }) => id === partId)
    ))).toBe(true);
    expect(buildingInk.strokes.some(({ id }) => id.startsWith('facade:floor-seam'))).toBe(true);
    expect(JSON.parse(JSON.stringify(characterInk))).toEqual(characterInk);
    expect(Object.isFrozen(characterInk)).toBe(true);
    expect(Object.isFrozen(characterInk.contour.color)).toBe(true);
  });

  it('preserves seeded tone hierarchy across raster and inked-solid projections', () => {
    const identity = createCharacterIdentity(4107);
    const raster = createRasterCharacterRecipe(identity, { medium: 'graphite' });
    const solid = createSolidCharacterBlueprint(identity);
    const inked = createInkedSolidBlueprint(solid, { medium: 'graphite' });
    const skin = solid.materials.find(({ id }) => id === 'skin');
    const hair = solid.materials.find(({ id }) => id === 'hair');
    const skinMark = inked.viewMarks.find(({ materialId }) => materialId === 'skin');
    const hairMark = inked.viewMarks.find(({ materialId }) => materialId === 'hair');
    const inkMark = inked.viewMarks.find(({ materialId }) => materialId === 'ink');
    const clothMark = inked.viewMarks.find(({ materialId }) => materialId === 'cloth');

    expect(raster.style).toMatchObject({ headTone: 'light', hairTone: 'black' });
    expect(skin?.color).toEqual(identity.palette.skin);
    expect(hair?.color).toEqual(identity.palette.hair);
    expect(skin?.drawing?.tone).toBe(raster.style.headTone);
    expect(hair?.drawing?.tone).toBe(raster.style.hairTone);
    expect(skinMark).toMatchObject({ style: 'hatch', strength: 0.4, coverage: 0.08 });
    expect(hairMark).toMatchObject({ style: 'scribble', strength: 0.72, coverage: 0.68 });
    expect(hairMark?.scale).toBeCloseTo((skinMark?.scale ?? 0) * 2.5);
    expect(clothMark).toMatchObject({ style: 'none', strength: 0, coverage: 0.03 });
    expect(inkMark).toMatchObject({ style: 'solid', strength: 0.92 });
    expect(inkMark?.coverage).toBeGreaterThan(0.9);
  });

  it('calibrates graphite mark density to the shared raster tone hierarchy', () => {
    const graphite = inkedSolidMediumDefaults('graphite');
    const light = graphite.viewMark('clothing', 'light');
    const hatch = graphite.viewMark('clothing', 'hatch');
    const scribble = graphite.viewMark('clothing', 'scribble');
    const stipple = graphite.viewMark('clothing', 'stipple');
    const black = graphite.viewMark('clothing', 'black');

    expect(light).toMatchObject({ style: 'none', strength: 0, coverage: 0.03 });
    expect(hatch).toMatchObject({ style: 'hatch', strength: 0.4, coverage: 0.06 });
    expect(scribble).toMatchObject({ style: 'scribble', strength: 0.42, coverage: 0.05 });
    expect(stipple).toMatchObject({ style: 'stipple', strength: 0.5, coverage: 0.04 });
    expect(black).toMatchObject({ style: 'scribble', strength: 0.72, coverage: 0.68 });
    expect(black.scale).toBeCloseTo(hatch.scale * 2.5);
    expect(black.lineWidth).toBeCloseTo(hatch.lineWidth * 2.6);
  });

  it('shares facade tone intent between raster and solid building materials', () => {
    const identity = createBuildingIdentity(1440);
    const raster = createRasterBuildingRecipe(identity, { medium: 'graphite' });
    const solid = createSolidBuildingBlueprint(identity);
    expect(solid.materials.find(({ id }) => id === 'wall')?.color)
      .toEqual(identity.palette.wall);
    expect(solid.materials.find(({ id }) => id === 'wall')?.drawing?.tone)
      .toBe(raster.style.tone);
  });

  it('projects every raster medium into a distinct volumetric drawing policy', () => {
    const identity = createCharacterIdentity(304);
    const solid = createSolidCharacterBlueprint(identity);
    const projections = MEDIUM_IDS.map((medium) => {
      const raster = createRasterCharacterBlueprint(identity, { medium });
      const inked = createInkedSolidBlueprint(solid, { medium });
      expect(raster.medium).toBe(medium);
      expect(inked.medium).toBe(medium);
      expect(inked.deposition.texture).toBe(medium);
      expect(inkedSolidMediumDefaults(medium)).toBe(inkedSolidMediumDefaults(medium));
      expect(Object.isFrozen(inkedSolidMediumDefaults(medium))).toBe(true);
      expect(Object.isFrozen(inkedSolidMediumDefaults(medium).contour.color)).toBe(true);
      return JSON.stringify({
        contour: inked.contour,
        deposition: inked.deposition,
        viewMarks: inked.viewMarks,
        paper: inked.paper,
      });
    });
    expect(new Set(projections).size).toBe(MEDIUM_IDS.length);
  });

  it('keeps oil pigment opaque while varying bristle character by authored tone', () => {
    const solid = createSolidCharacterBlueprint(createCharacterIdentity(4_103));
    const inked = createInkedSolidBlueprint(solid, { medium: 'oil' });
    const painted = inked.viewMarks.filter(({ materialRole }) => materialRole !== 'eye-white');
    expect(painted.every(({ coverage }) => coverage >= 0.62)).toBe(true);
    expect(inked.viewMarks.find(({ materialId }) => materialId === 'skin')?.coverage).toBe(0.95);
    expect(inked.contour.wander).toBeGreaterThan(0);
  });

  it('validates ink policies without mutating solid semantics', () => {
    const solid = createSolidBuildingBlueprint(createBuildingIdentity(902));
    const withoutViewMarks = createInkedSolidBlueprint(solid, {
      medium: 'graphite',
      contour: { width: 2.2, jitter: 0 },
      viewMarks: false,
    });
    expect(withoutViewMarks.viewMarks.every(({ style }) => style === 'none')).toBe(true);
    expect(withoutViewMarks.contour.width).toBe(2.2);
    expect(withoutViewMarks.solid.parts).toBe(solid.parts);
    expect(() => createInkedSolidBlueprint(solid, {
      medium: 'graphite', contour: { width: 0 },
    }))
      .toThrow(/width/i);
    expect(() => createInkedSolidBlueprint(solid, {
      medium: 'graphite', contour: { wander: -0.1 },
    })).toThrow(/wander/i);
    expect(() => createInkedSolidBlueprint(solid, {
      medium: 'graphite',
      viewMarks: { wall: { scale: 0 } },
    })).toThrow(/viewMarks\.wall\.scale/i);
    expect(() => createInkedSolidBlueprint(solid, {
      medium: 'graphite',
      viewMarks: { wall: { coverage: 1.01 } },
    })).toThrow(/viewMarks\.wall\.coverage/i);
    expect(() => createInkedSolidBlueprint(solid, {
      medium: 'graphite',
      viewMarks: { missing: { style: 'scribble' } },
    })).toThrow(/unknown material/i);
    expect(() => createInkedSolidBlueprint(solid, {
      medium: 'graphite',
      strokes: [{
        id: 'missing-owner', partId: 'missing', radius: 0.01,
        path: { type: 'part-local', points: [[0, 0, 0], [1, 0, 0]] },
      }],
    })).toThrow(/unknown part/i);
    expect(() => createInkedSolidBlueprint(solid, {
      medium: 'graphite',
      strokes: [{
        id: 'invalid-loop', partId: 'door', radius: 0.01, closed: true,
        path: { type: 'part-local', points: [[0, 0, 0], [1, 0, 0]] },
      }],
    })).toThrow(/at least three/i);
  });

  it('keeps doodle deposition and strokes independent from smooth physical finish', () => {
    const identity = createCharacterIdentity(321, { hairStyle: 'cap' });
    const matte = createSolidCharacterBlueprint(identity, { finish: 'matte' });
    const metal = createSolidCharacterBlueprint(identity, { finish: 'metal' });
    const matteInk = createInkedSolidBlueprint(matte, {
      medium: 'graphite',
      strokes: createSolidCharacterInkStrokes(matte),
    });
    const metalInk = createInkedSolidBlueprint(metal, {
      medium: 'graphite',
      strokes: createSolidCharacterInkStrokes(metal),
    });
    expect(matte.materials.some(({ finish }) => finish === 'matte')).toBe(true);
    expect(metal.materials.some(({ finish }) => finish === 'metal')).toBe(true);
    expect(matteInk.deposition).toEqual(metalInk.deposition);
    expect(matteInk.strokes).toEqual(metalInk.strokes);
  });

  it('gives building archetypes distinct structural casting', () => {
    const identities = ['cottage', 'townhouse', 'apartment', 'high-rise'].map(
      (archetype) => createBuildingIdentity(777, {
        archetype: archetype as 'cottage' | 'townhouse' | 'apartment' | 'high-rise',
      }),
    );
    expect(new Set(identities.map(({ archetype }) => archetype)).size).toBe(4);
    expect(identities[3]?.floors).toBeGreaterThan(identities[0]?.floors ?? 0);
    expect(identities[3]?.height).toBeGreaterThan(identities[0]?.height ?? 0);
    expect(identities[0]?.floors).toBeLessThanOrEqual(2);
    expect(identities[3]?.floors).toBeGreaterThanOrEqual(10);
    expect(identities.every(({ door }) => door.column >= 0)).toBe(true);
  });

  it('rejects invalid authored building dimensions at the identity boundary', () => {
    expect(() => createBuildingIdentity(777, { width: 0 })).toThrow(/width/i);
    expect(() => createBuildingIdentity(777, { height: Number.NaN })).toThrow(/height/i);
    expect(() => createBuildingIdentity(777, { depth: Number.POSITIVE_INFINITY }))
      .toThrow(/depth/i);
  });

  it('encodes crown topology as a closed volume around the head', () => {
    const identity = createCharacterIdentity(505, { hairStyle: 'crown' });
    const profile = createCharacterHairProfile(identity);
    const blueprint = createSolidCharacterBlueprint(identity);
    const crown = blueprint.parts.find(({ id }) => id === 'hair:crown');
    expect(profile?.spatial.kind).toBe('head-wrap');
    expect(crown?.geometry.type).toBe('mesh');
    if (crown?.geometry.type !== 'mesh') return;
    const zCoordinates = crown.geometry.vertices.map((vertex) => vertex[2]);
    expect(Math.min(...zCoordinates)).toBeLessThan(0);
    expect(Math.max(...zCoordinates)).toBeGreaterThan(0);
  });
});
