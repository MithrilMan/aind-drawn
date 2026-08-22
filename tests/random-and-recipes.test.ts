import { describe, expect, it } from 'vitest';

import {
  CHARACTER_AUTHORING_SCHEMA,
  CHARACTER_EXPRESSIONS,
  MEDIUM_IDS,
  Random,
  SeedTree,
  buildCharacterLayout,
  buildSolidCharacterLayout,
  buildSolidFaceLayout,
  characterEyeRadius,
  characterEyeCenterY,
  characterHeadRadius2d,
  characterHeadShapeField,
  characterMouthCenterY,
  createBuildingFacadeGeometry,
  createBuildingIdentity,
  createCharacterEyeProfile,
  createCharacterEyewearProfile,
  createCharacterExpressionProfile,
  createCharacterFacialHairProfile,
  createCharacterHairProfile,
  createCharacterMouthProfile,
  createCharacterOutfitProfile,
  createCharacterNoseProfile,
  createCharacterRoundEarProfile,
  createCharacterIdentity,
  createCharacterBlueprint,
  createCharacterRecipe,
  createInkedSolidBlueprint,
  inkedSolidMediumDefaults,
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
  solidFaceMotionOf,
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
    const mouths = blueprint.parts.filter((part) => solidFaceMotionOf(part)?.kind === 'mouth');
    expect(new Set(mouths.map((part) => {
      const motion = solidFaceMotionOf(part);
      return motion?.kind === 'mouth' ? motion.expression : null;
    })))
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
      .toEqual(expect.arrayContaining(['tooth-divider:1', 'tooth-divider:3']));
    expect(createCharacterMouthProfile(identity.mouth, 'crying').layers[0]?.id).toBe('wail');
    expect(createCharacterMouthProfile(identity.mouth, 'sleeping').layers[0]?.id).toBe('slack');
    expect(createCharacterMouthProfile(identity.mouth, 'happy').layers)
      .not.toEqual(createCharacterMouthProfile(identity.mouth, 'sad').layers);
  });

  it('defines eyebrow intent in face-relative semantics instead of renderer signs', () => {
    const angry = createCharacterExpressionProfile('angry');
    const sad = createCharacterExpressionProfile('sad');
    expect(angry.brows.innerRaise).toBeLessThan(0);
    expect(sad.brows.innerRaise).toBeGreaterThan(0);
    expect(angry.brows.lift).toBeGreaterThanOrEqual(0);
    expect(angry.eyes.openness).toBeLessThan(sad.eyes.openness);
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
    const facade = createBuildingFacadeGeometry(identity);
    const rasterRecipe = createRasterBuildingRecipe(identity, { medium: 'watercolor' });
    const solidRecipe = createSolidBuildingRecipe(identity, { finish: 'ceramic' });
    const raster = createRasterBuildingBlueprint(rasterRecipe);
    const solid = createSolidBuildingBlueprint(solidRecipe);

    expect(rasterRecipe.identity).toBe(identity);
    expect(solidRecipe.identity).toBe(identity);
    expect(raster.seed).toBe(identity.seed);
    expect(solid.seed).toBe(identity.seed);
    expect(solid.parts.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'building:shell', 'building:roof', 'door:opening', 'door', 'balcony:0:floor',
    ]));
    expect(solid.parts.find(({ id }) => id === 'building:shell')?.geometry.type).toBe('mesh');
    expect(solid.parts.find(({ id }) => id === 'door:opening')?.materialId).toBe('interior');
    const roof = solid.parts.find(({ id }) => id === 'building:roof');
    if (roof?.geometry.type !== 'mesh') throw new TypeError('Expected a mesh roof');
    expect(roof.geometry.vertices
      .slice(0, facade.roofProfile.length)
      .map(([x, y]) => [x, y]))
      .toEqual(facade.roofProfile);
    for (const facadeWindow of facade.windows) {
      const window = solid.parts.find(({ id }) => id === facadeWindow.id);
      if (window?.geometry.type !== 'extruded-profile') {
        throw new TypeError(`Expected an extruded window for ${facadeWindow.id}`);
      }
      expect(window.geometry.outline).toEqual(facadeWindow.profile);
      expect(window.placement.position[0]).toBeCloseTo(facadeWindow.center[0]);
      expect(window.placement.position[1]).toBeCloseTo(facadeWindow.center[1]);
      expect(window.materialId).toBe(facadeWindow.lit ? 'glass:lit' : 'glass:dark');
    }
    const door = solid.parts.find(({ id }) => id === 'door');
    if (door?.geometry.type !== 'extruded-profile') {
      throw new TypeError('Expected an extruded building door');
    }
    expect(door.geometry.outline).toEqual(facade.door.profile);
    expect(facade.wallHeight + facade.roofRise).toBeCloseTo(identity.height);
    expect(raster.sockets['door:entry']?.x).toBeCloseTo(facade.door.centerX);
    expect(solid.sockets['door:entry']?.[0]).toBeCloseTo(facade.door.centerX);
    expect(solid.interactions[0]).toMatchObject({
      id: 'door', sensorColliderId: 'door:sensor', activationSocketId: 'door:entry',
    });
    const openRotation = solid.interactions[0]
      ?.nodeBindings[0]?.stateByInteractionState.open?.rotation?.[1] ?? 0;
    expect(Math.abs(openRotation)).toBeCloseTo(identity.door.openingAngle);
    expect(Math.sign(openRotation)).toBe(identity.door.hinge === 'left' ? -1 : 1);
    expect(JSON.parse(JSON.stringify(identity))).toEqual(identity);
    expect(JSON.parse(JSON.stringify(solid))).toEqual(solid);
  });

  it('adds one renderer-neutral ink policy to different solid asset families', () => {
    const characterSolid = createSolidCharacterBlueprint(createCharacterIdentity(304, {
      hairStyle: 'cap',
    }));
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
    expect(characterInk.viewMarks.find(({ materialId }) => materialId === 'hair')?.style)
      .toBe('scribble');
    expect(characterInk.viewMarks.find(({ application }) => application === 'ink')?.style)
      .toBe('solid');
    expect(characterInk.viewMarks.find(({ application }) => application === 'paper')?.style)
      .toBe('none');
    const facadeTone = buildingSolid.materials.find(({ id }) => id === 'wall')?.drawing.tone;
    expect(buildingInk.viewMarks.find(({ materialId }) => materialId === 'wall')?.style)
      .toBe(facadeTone === 'black' ? 'scribble' : facadeTone);
    expect(characterInk.deposition).toEqual(buildingInk.deposition);
    expect(characterInk.strokes.length).toBeGreaterThan(0);
    expect(buildingInk.strokes.length).toBeGreaterThan(0);
    expect(characterInk.strokes.every(({ partId }) => (
      characterSolid.parts.some(({ id }) => id === partId)
    ))).toBe(true);
    expect(buildingInk.strokes.every(({ id, partId }) => (
      id.endsWith(':mullion') && partId.startsWith('window:')
    ))).toBe(true);
    expect(buildingInk.strokes.some(({ id }) => (
      /floor-seam|pencil-mark|roof:front-seam|door:inset-line/u.test(id)
    ))).toBe(false);
    expect(JSON.parse(JSON.stringify(characterInk))).toEqual(characterInk);
    expect(Object.isFrozen(characterInk)).toBe(true);
    expect(Object.isFrozen(characterInk.contour.color)).toBe(true);
  });

  it('does not invent adapter-only facial marks for saucer eyes', () => {
    const identity = createCharacterIdentity(4104);
    const raster = createRasterCharacterBlueprint(identity, { medium: 'graphite' });
    const solid = createSolidCharacterBlueprint(identity);
    const strokes = createSolidCharacterInkStrokes(solid);

    expect(identity.eyes.style).toBe('saucer');
    expect(raster.layers.some(({ id }) => id.startsWith('face:cheek:'))).toBe(false);
    expect(strokes.some(({ id }) => id.startsWith('face:cheek:'))).toBe(false);
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
    expect(skin?.drawing.tone).toBe(raster.style.headTone);
    expect(hair?.drawing.tone).toBe(raster.style.hairTone);
    expect(skinMark).toMatchObject({ style: 'hatch', strength: 0.4, coverage: 0.08 });
    expect(hairMark).toMatchObject({ style: 'scribble', strength: 0.72, coverage: 0.68 });
    expect(hairMark?.scale).toBeCloseTo((skinMark?.scale ?? 0) * 2.5);
    expect(clothMark).toMatchObject({ style: 'none', strength: 0, coverage: 0.03 });
    expect(inkMark).toMatchObject({ style: 'solid', strength: 0.92 });
    expect(inkMark?.coverage).toBeGreaterThan(0.9);
  });

  it('calibrates graphite mark density to the shared raster tone hierarchy', () => {
    const graphite = inkedSolidMediumDefaults('graphite');
    const light = graphite.viewMark({ application: 'pigment', tone: 'light' });
    const hatch = graphite.viewMark({ application: 'pigment', tone: 'hatch' });
    const scribble = graphite.viewMark({ application: 'pigment', tone: 'scribble' });
    const stipple = graphite.viewMark({ application: 'pigment', tone: 'stipple' });
    const black = graphite.viewMark({ application: 'pigment', tone: 'black' });

    expect(light).toMatchObject({ style: 'none', strength: 0, coverage: 0.03 });
    expect(hatch).toMatchObject({ style: 'hatch', strength: 0.4, coverage: 0.06 });
    expect(scribble).toMatchObject({ style: 'scribble', strength: 0.42, coverage: 0.05 });
    expect(stipple).toMatchObject({ style: 'stipple', strength: 0.5, coverage: 0.04 });
    expect(black).toMatchObject({ style: 'scribble', strength: 0.72, coverage: 0.68 });
    expect(black.scale).toBeCloseTo(hatch.scale * 2.5);
    expect(black.lineWidth).toBeCloseTo(hatch.lineWidth * 2.6);
    expect(graphite.deposition.planeSeparationStrength).toBeGreaterThan(0.4);
  });

  it('shares facade tone intent between raster and solid building materials', () => {
    const identity = createBuildingIdentity(1440);
    const raster = createRasterBuildingRecipe(identity, { medium: 'graphite' });
    const solid = createSolidBuildingBlueprint(identity);
    expect(solid.materials.find(({ id }) => id === 'wall')?.color)
      .toEqual(identity.palette.wall);
    expect(solid.materials.find(({ id }) => id === 'wall')?.drawing.tone)
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
    const painted = inked.viewMarks.filter(({ application }) => application !== 'paper');
    expect(painted.every(({ coverage }) => coverage >= 0.62)).toBe(true);
    expect(inked.viewMarks.find(({ materialId }) => materialId === 'skin')?.coverage).toBe(0.98);
    expect(inked.contour.wander).toBeGreaterThan(0);
  });

  it('keeps oil, charcoal, and marker inside their raster mark vocabularies', () => {
    const tones = ['black', 'hatch', 'scribble', 'stipple', 'light'] as const;
    const oil = inkedSolidMediumDefaults('oil');
    const charcoal = inkedSolidMediumDefaults('chalk');
    const marker = inkedSolidMediumDefaults('marker');
    for (const tone of tones) {
      expect(oil.viewMark({ application: 'pigment', tone }).style).toBe('bristle');
      expect(charcoal.viewMark({ application: 'pigment', tone }).style).toBe('stipple');
      expect(marker.viewMark({ application: 'pigment', tone }).style).toBe('marker');
    }
    expect(marker.viewMark({ application: 'pigment', tone: 'hatch' }).lineWidth)
      .toBeGreaterThan(0.2);
    expect(charcoal.viewMark({ application: 'tint', tone: 'hatch' }).style).not.toBe('hatch');
  });

  it('projects ink and watercolour as deposited filler rather than invented shading bands', () => {
    const ink = inkedSolidMediumDefaults('ink');
    const inkBlack = ink.viewMark({ application: 'pigment', tone: 'black' });
    const inkLight = ink.viewMark({ application: 'pigment', tone: 'light' });
    expect(inkBlack).toMatchObject({ style: 'hatch', strength: 0.2, coverage: 0.9 });
    expect(inkLight.style).toBe('none');
    expect(inkLight.coverage).toBeCloseTo(0.16 + 0.34 * 0.74);

    const watercolour = inkedSolidMediumDefaults('watercolor');
    const watercolourBlack = watercolour.viewMark({ application: 'pigment', tone: 'black' });
    const watercolourLight = watercolour.viewMark({ application: 'pigment', tone: 'light' });
    expect(watercolourBlack.style).toBe('none');
    expect(watercolourLight.style).toBe('none');
    expect(watercolourBlack.coverage).toBeGreaterThan(watercolourLight.coverage);
    expect(watercolour.viewMark({ application: 'ink', tone: 'black' }).style).toBe('solid');
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
    for (const identity of identities) {
      const facade = createBuildingFacadeGeometry(identity);
      const solid = createSolidBuildingBlueprint(identity);
      const roof = solid.parts.find(({ id }) => id === 'building:roof');
      if (roof?.geometry.type !== 'mesh') throw new TypeError('Expected a mesh roof');
      expect(facade.windows).toHaveLength(
        identity.floors * identity.columns - 1,
      );
      expect(roof.geometry.vertices
        .slice(0, facade.roofProfile.length)
        .map(([x, y]) => [x, y]))
        .toEqual(facade.roofProfile);
      expect(facade.wallProfile[2]?.[1]).toBeCloseTo(facade.wallHeight);
      expect(facade.wallHeight + facade.roofRise).toBeCloseTo(identity.height);
    }
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

  it('persists typed accessories independently from anatomy measurements', () => {
    const generated = createCharacterIdentity(8801, { species: 'human' });
    const authored = createCharacterIdentity(8801, {
      species: 'human',
      eyewearStyle: 'heavy-square',
      facialHairStyle: 'full-rounded',
      noseStyle: 'drop',
      earStyle: 'round',
      hairStyle: 'quiff',
    });
    expect(authored.accessories).toHaveLength(1);
    expect(authored.accessories[0]).toMatchObject({
      kind: 'eyewear',
      style: 'heavy-square',
      spatial: { kind: 'wrap', host: 'head' },
    });
    expect(authored.head).toEqual(generated.head);
    expect(authored.eyes).toEqual(generated.eyes);
    expect(authored.body).toEqual(generated.body);
    expect(JSON.parse(JSON.stringify(authored))).toEqual(createCharacterIdentity(8801, {
      species: 'human',
      eyewearStyle: 'heavy-square',
      facialHairStyle: 'full-rounded',
      noseStyle: 'drop',
      earStyle: 'round',
      hairStyle: 'quiff',
    }));
  });

  it('projects the reference face traits through raster, smooth solid, and doodle', () => {
    const identity = createCharacterIdentity(4104, {
      species: 'human',
      shape: 'tall',
      eyeStyle: 'saucer',
      alternateEyeStyle: null,
      mouthStyle: 'frown',
      hairStyle: 'quiff',
      facialHairStyle: 'full-rounded',
      eyewearStyle: 'heavy-square',
      noseStyle: 'drop',
      earStyle: 'round',
      outfitStyle: 'buttons',
    });
    const raster = createRasterCharacterBlueprint(identity);
    const solid = createSolidCharacterBlueprint(identity, { finish: 'skin' });
    const faceLayout = buildSolidFaceLayout(createSolidCharacterRecipe(identity, {
      finish: 'skin',
    }));
    const rasterIds = raster.layers.map(({ id }) => id);
    const solidIds = solid.parts.map(({ id }) => id);
    expect(rasterIds).toEqual(expect.arrayContaining([
      'ears', 'nose', 'hair', 'accessory:eyewear',
      'facial-hair:beard', 'facial-hair:opening',
    ]));
    expect(solidIds).toEqual(expect.arrayContaining([
      'ear:left', 'ear:right', 'nose', 'hair:quiff',
      'facial-hair:beard',
      'accessory:eyewear:rim:left', 'accessory:eyewear:bridge',
      'accessory:eyewear:temple:left', 'accessory:eyewear:temple:right',
    ]));
    const rim = solid.parts.find(({ id }) => id === 'accessory:eyewear:rim:left');
    const temple = solid.parts.find(({ id }) => id === 'accessory:eyewear:temple:left');
    const beard = solid.parts.find(({ id }) => id === 'facial-hair:beard');
    const mouth = solid.parts.find(({ id }) => id === 'mouth');
    expect(rim?.geometry.type).toBe('mesh');
    expect(temple?.geometry.type).toBe('box');
    expect(beard?.geometry.type).toBe('mesh');
    expect(solid.parts.some(({ id }) => id === 'facial-hair:opening')).toBe(false);
    expect(mouth?.placement.position).toEqual(faceLayout.mouthAnchor.point);
    if (temple?.geometry.type === 'box') {
      expect(temple.placement.position[2] - temple.geometry.size[2] * 0.5).toBeLessThan(0);
    }
    expect(solid.materials.find(({ id }) => id === 'facial-hair')).toMatchObject({
      finish: 'wool', drawing: { application: 'pigment' },
    });
    expect(solid.materials.find(({ id }) => id === 'accessory:eyewear')).toMatchObject({
      finish: 'rubber', drawing: { application: 'ink', tone: 'black' },
    });
    expect(() => createInkedSolidBlueprint(solid, {
      medium: 'graphite',
      strokes: createSolidCharacterInkStrokes(solid),
    })).not.toThrow();
    expect(createCharacterEyewearProfile(identity)?.spatial.kind).toBe('wrap');
    expect(createCharacterFacialHairProfile(identity)?.components.map(
      ({ spatial }) => spatial.kind,
    )).toEqual([]);
    expect(createCharacterFacialHairProfile(identity)?.beard.spatial.kind).toBe('volume-ring');
    expect(createCharacterFacialHairProfile(identity)?.opening.spatial.kind).toBe('aperture');
  });

  it('keeps long beards wider than tall and their mouth aperture inside the head', () => {
    for (const seed of [4126, 4129, 4138, 4147]) {
      const identity = createCharacterIdentity(seed, { facialHairStyle: 'full-rounded' });
      const profile = createCharacterFacialHairProfile(identity);
      expect(profile).not.toBeNull();
      if (profile === null) continue;
      const xs = profile.beard.outline.map(([x]) => x);
      const ys = profile.beard.outline.map(([, y]) => y);
      const aspect = (Math.max(...ys) - Math.min(...ys))
        / (Math.max(...xs) - Math.min(...xs));
      const lowerFaceY = -characterHeadRadius2d(identity.head, -Math.PI / 2);
      const openingBottom = profile.opening.spatial.center[1]
        - profile.opening.spatial.radii[1];
      expect(aspect).toBeLessThan(0.9);
      expect(openingBottom).toBeGreaterThan(lowerFaceY);

      const solid = createSolidCharacterBlueprint(identity);
      const headNode = solid.nodes.find(({ id }) => id === 'head');
      expect(headNode?.position[2]).toBeGreaterThan(0);
    }
  });

  it('hangs long beards ahead of the torso instead of inflating them into it', () => {
    for (const seed of [4125, 4129]) {
      const identity = createCharacterIdentity(seed, { facialHairStyle: 'full-rounded' });
      const profile = createCharacterFacialHairProfile(identity);
      const solid = createSolidCharacterBlueprint(identity);
      const layout = buildSolidCharacterLayout(createSolidCharacterRecipe(identity));
      const beard = solid.parts.find(({ id }) => id === 'facial-hair:beard');
      const headNode = solid.nodes.find(({ id }) => id === 'head');
      expect(profile).not.toBeNull();
      if (profile === null || beard?.geometry.type !== 'mesh' || headNode === undefined) continue;
      const bottomIndex = profile.beard.outline.reduce((lowest, point, index, points) => (
        point[1] < (points[lowest]?.[1] ?? Number.POSITIVE_INFINITY) ? index : lowest
      ), 0);
      const bottom = beard.geometry.vertices[bottomIndex];
      expect((bottom?.[2] ?? 0) + headNode.position[2] - layout.torso.depth)
        .toBeGreaterThan(0.18);
    }
  });

  it('shares round-ear, eye, and nose dimensions across face projections', () => {
    const identity = createCharacterIdentity(4149, {
      earStyle: 'round',
      noseStyle: 'drop',
    });
    const solid = createSolidCharacterBlueprint(identity);
    const faceLayout = buildSolidFaceLayout(createSolidCharacterRecipe(identity));
    const earProfile = createCharacterRoundEarProfile(identity);
    const noseProfile = createCharacterNoseProfile(identity);
    const ear = solid.parts.find(({ id }) => id === 'ear:left');
    const nose = solid.parts.find(({ id }) => id === 'nose');
    expect(faceLayout.eyeRadius).toBeCloseTo(characterEyeRadius(identity));
    expect(earProfile).not.toBeNull();
    expect(noseProfile).not.toBeNull();
    if (ear?.geometry.type === 'superellipsoid' && earProfile !== null) {
      expect(ear.geometry.radii.slice(0, 2)).toEqual(earProfile.radii);
    }
    if (nose?.geometry.type === 'superellipsoid' && noseProfile !== null) {
      expect(nose.geometry.radii.slice(0, 2)).toEqual(noseProfile.radii);
    }
  });

  it('keeps 4152 eye relief compact and embeds the glint in the pupil surface', () => {
    const identity = createCharacterIdentity(4152);
    const solid = createSolidCharacterBlueprint(identity);
    const faceLayout = buildSolidFaceLayout(createSolidCharacterRecipe(identity));
    const sclera = solid.parts.find(({ id }) => id === 'eye:left:white');
    const pupil = solid.parts.find(({ id }) => id === 'eye:left:pupil');
    const glint = solid.parts.find(({ id }) => id === 'eye:left:glint');
    expect(sclera?.geometry.type).toBe('superellipsoid');
    expect(glint).toBeDefined();
    if (sclera?.geometry.type === 'superellipsoid') {
      expect(sclera.geometry.radii[2] / sclera.geometry.radii[0]).toBeLessThan(0.4);
    }
    const normal = pupil?.placement.surface?.normal;
    if (pupil === undefined || glint === undefined || normal === undefined) return;
    const delta = glint.placement.position.map((value, index) => (
      value - (pupil.placement.position[index] ?? 0)
    ));
    const relief = delta.reduce((sum, value, index) => (
      sum + value * (normal[index] ?? 0)
    ), 0);
    expect(relief).toBeGreaterThan(0);
    expect(relief).toBeLessThan(faceLayout.eyeRadius * 0.03);
  });

  it('exposes face accessories through family-driven authoring controls', () => {
    const ids = CHARACTER_AUTHORING_SCHEMA.parameters.map(({ id }) => id);
    expect(ids).toEqual(expect.arrayContaining([
      'earStyle', 'noseStyle', 'facialHairStyle', 'eyewearStyle',
    ]));
  });
});
