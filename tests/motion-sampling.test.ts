import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  SolidRig,
  SpriteRig,
  applyRasterCharacterMotion,
  applyRasterVehicleMotion,
  applySolidCharacterMotion,
  applySolidVehicleMotion,
  createCharacterIdentity,
  createCharacterMotionState,
  createRasterCharacterBlueprint,
  createRasterVehicleBlueprint,
  createRasterVehicleRecipe,
  createSolidCharacterBlueprint,
  createSolidVehicleBlueprint,
  createVehicleIdentity,
  createVehicleMotionState,
  sampleCharacterMotion,
  sampleVehicleMotion,
  setCharacterMotion,
  setVehicleMotion,
  type AssetBlueprint,
  type CanvasFactory,
  type CharacterIdentityRecipe,
} from '../src/index.js';

const inertCanvasFactory: CanvasFactory = (width, height) => ({
  canvas: { width, height } as HTMLCanvasElement,
  context: {} as CanvasRenderingContext2D,
});

function inertRasterCharacter(identity: CharacterIdentityRecipe): AssetBlueprint {
  const blueprint = createRasterCharacterBlueprint(identity);
  return Object.freeze({
    ...blueprint,
    layers: Object.freeze(blueprint.layers.map((layer) => Object.freeze({
      ...layer,
      draw: (): void => undefined,
    }))),
  });
}

function inertRasterVehicle(identity: ReturnType<typeof createVehicleIdentity>): AssetBlueprint {
  const blueprint = createRasterVehicleBlueprint(createRasterVehicleRecipe(identity));
  return Object.freeze({
    ...blueprint,
    layers: Object.freeze(blueprint.layers.map((layer) => Object.freeze({
      ...layer,
      draw: (): void => undefined,
    }))),
  });
}

describe('pure motion sampling', () => {
  it('returns equal immutable character samples for equal identity, state, and time', () => {
    const identity = createCharacterIdentity(6201);
    let state = createCharacterMotionState();
    state = setCharacterMotion(state, {
      pose: 'run', speed: 0.72, expression: 'happy', talking: true,
    }, 1.25);
    const first = sampleCharacterMotion(identity, state, 2.4);
    const second = sampleCharacterMotion(identity, state, 2.4);
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parts['arm:left'])).toBe(true);
  });

  it('matches direct seeking with repeated inspection and preserves transition anchors', () => {
    const identity = createCharacterIdentity(6202);
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    state = setCharacterMotion(state, { pose: 'walk', speed: 1 }, 0);
    let stepped = sampleCharacterMotion(identity, state, 0);
    for (let frame = 1; frame <= 60; frame += 1) {
      stepped = sampleCharacterMotion(identity, state, frame / 60);
    }
    expect(stepped).toEqual(sampleCharacterMotion(identity, state, 1));

    const beforeSwitch = sampleCharacterMotion(identity, state, 0.12);
    state = setCharacterMotion(state, { pose: 'sleep' }, 0.12);
    expect(sampleCharacterMotion(identity, state, 0.12).poseWeights)
      .toEqual(beforeSwitch.poseWeights);
    expect(setCharacterMotion(state, { pose: 'sleep' }, 0.3)).toBe(state);
    const settled = sampleCharacterMotion(identity, state, 0.6);
    expect(settled.poseWeights.sleep).toBeCloseTo(1);
    expect(settled.poseWeights.walk).toBeCloseTo(0);
  });

  it('samples a deterministic clownish Macarena with sequential arm gestures', () => {
    const identity = createCharacterIdentity(6210, { species: 'cat' });
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    state = setCharacterMotion(state, {
      pose: 'dance', speed: 0.9, expression: 'happy',
    }, 0);
    const firstTime = 1.2;
    const first = sampleCharacterMotion(identity, state, firstTime);
    const samples = Array.from({ length: 64 }, (_, index) => (
      sampleCharacterMotion(identity, state, firstTime + index * 0.08)
    ));
    const leftArmRolls = samples.map((sample) => sample.parts['arm:left'].roll);
    const rightArmRolls = samples.map((sample) => sample.parts['arm:right'].roll);

    expect(first.poseWeights.dance).toBeCloseTo(1);
    expect(Math.max(...leftArmRolls) - Math.min(...leftArmRolls)).toBeGreaterThan(1.2);
    expect(Math.max(...rightArmRolls) - Math.min(...rightArmRolls)).toBeGreaterThan(1.2);
    expect(samples.some((sample) => sample.parts['leg:left'].y > 0.07)).toBe(true);
    expect(samples.some((sample) => sample.parts['leg:right'].y > 0.07)).toBe(true);
    expect(samples.some((sample) => sample.parts.torso.x > 0.08)).toBe(true);
    expect(samples.some((sample) => sample.parts.torso.x < -0.08)).toBe(true);
    expect(first).toEqual(sampleCharacterMotion(identity, state, firstTime));
  });

  it('samples a projection-neutral cough with repeated body impulses and a covering arm', () => {
    const identity = createCharacterIdentity(6211);
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    state = setCharacterMotion(state, {
      pose: 'cough', expression: 'scared', talking: false,
    }, 0.4);
    const samples = Array.from({ length: 40 }, (_, index) => (
      sampleCharacterMotion(identity, state, 0.8 + index * 0.04)
    ));
    const impulses = samples.map((sample) => sample.parts.torso.swing);
    const peakGroups = impulses.reduce((count, impulse, index) => (
      impulse > 0.06 && (impulses[index - 1] ?? 0) <= 0.06 ? count + 1 : count
    ), 0);
    expect(samples.at(-1)?.poseWeights.cough).toBeCloseTo(1);
    expect(Math.min(...samples.map((sample) => sample.parts.head.y))).toBeLessThan(-0.08);
    expect(Math.max(...samples.map((sample) => sample.parts.torso.swing))).toBeGreaterThan(0.14);
    expect(Math.min(...samples.map((sample) => sample.parts['arm:left'].foreground)))
      .toBeGreaterThan(0.7);
    expect(samples.some((sample) => sample.face.mouth === 'open')).toBe(true);
    expect(samples.filter((sample) => sample.face.mouth === 'open').every(
      (sample) => sample.face.eyeState === 'closed'
        && sample.face.blink < 0.35
        && sample.face.mouthOpenness < 0.8,
    )).toBe(true);
    expect(peakGroups).toBe(3);
  });

  it('makes autonomic schedules seekable and explicitly disableable', () => {
    const identity = createCharacterIdentity(6203);
    const disabled = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    const enabled = createCharacterMotionState();
    const times = Array.from({ length: 241 }, (_, index) => index * 0.05);
    expect(times.every((time) => {
      const face = sampleCharacterMotion(identity, disabled, time).face;
      return face.blink === 1 && face.gaze.x === 0 && face.gaze.y === 0;
    })).toBe(true);
    expect(times.some((time) => sampleCharacterMotion(identity, enabled, time).face.blink < 1))
      .toBe(true);
    expect(times.some((time) => {
      const gaze = sampleCharacterMotion(identity, enabled, time).face.gaze;
      return gaze.x !== 0 || gaze.y !== 0;
    })).toBe(true);
  });

  it('applies one character sample twice without accumulating raster or solid transforms', () => {
    const identity = createCharacterIdentity(6204, { species: 'cat' });
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    state = setCharacterMotion(state, {
      pose: 'dance', speed: 0.8, expression: 'crying',
    }, 0);
    const sample = sampleCharacterMotion(identity, state, 0.47);
    const raster = new SpriteRig(inertRasterCharacter(identity), {
      boilFrames: 1,
      canvasFactory: inertCanvasFactory,
    });
    const solid = new SolidRig(createSolidCharacterBlueprint(identity));

    applyRasterCharacterMotion(raster, sample);
    raster.getBone('arm:left')?.updateMatrix();
    const rasterFirst = raster.getBone('arm:left')?.matrix.clone();
    applyRasterCharacterMotion(raster, sample);
    raster.getBone('arm:left')?.updateMatrix();
    expect(raster.getBone('arm:left')?.matrix.equals(rasterFirst ?? new THREE.Matrix4())).toBe(true);

    applySolidCharacterMotion(solid, sample);
    const solidFirst = solid.getNode('arm:left')?.quaternion.clone();
    const tearFirst = solid.getPart('tear:left:drop')?.position.clone();
    applySolidCharacterMotion(solid, sample);
    expect(solid.getNode('arm:left')?.quaternion.equals(
      solidFirst ?? new THREE.Quaternion(),
    )).toBe(true);
    expect(solid.getPart('tear:left:drop')?.position.equals(
      tearFirst ?? new THREE.Vector3(),
    )).toBe(true);
    raster.dispose();
    solid.dispose();
  });

  it('samples shared signed vehicle kinematics before either projection mutates', () => {
    const identity = createVehicleIdentity(6205, { archetype: 'coupe' });
    let state = createVehicleMotionState({
      travelDistance: 3.5, speed: 0.8, steering: 0.5, suspension: 0.6,
    });
    const sample = sampleVehicleMotion(identity, state, 1.2);
    expect(sample).toEqual(sampleVehicleMotion(identity, state, 1.2));
    expect(sample.wheelRotation).toBeCloseTo(-3.5 / identity.wheels.radius);
    expect(setVehicleMotion(state, {
      travelDistance: 3.5, speed: 0.8, steering: 0.5, suspension: 0.6,
    })).toBe(state);

    const raster = new SpriteRig(inertRasterVehicle(identity), {
      boilFrames: 1,
      canvasFactory: inertCanvasFactory,
    });
    const solid = new SolidRig(createSolidVehicleBlueprint(identity));
    applyRasterVehicleMotion(raster, sample);
    expect(raster.getBone('wheel:front')?.rotation.z).toBeCloseTo(sample.wheelRotation);
    applySolidVehicleMotion(solid, sample);
    const first = solid.getNode('wheel:front:left')?.quaternion.clone();
    applySolidVehicleMotion(solid, sample);
    expect(solid.getNode('wheel:front:left')?.quaternion.equals(
      first ?? new THREE.Quaternion(),
    )).toBe(true);

    state = setVehicleMotion(state, { travelDistance: -3.5, steering: 0.5 });
    expect(sampleVehicleMotion(identity, state, 1.2).wheelRotation)
      .toBeCloseTo(-sample.wheelRotation);
    raster.dispose();
    solid.dispose();
  });

  it('keeps semantic samplers free of renderer imports', () => {
    for (const file of [
      'src/assets/character/runtime/face-motion-sampler.ts',
      'src/assets/character/runtime/flow-motion-sampler.ts',
      'src/assets/character/runtime/motion-sampler.ts',
      'src/assets/character/runtime/motion-state.ts',
      'src/assets/vehicle/runtime/motion-sampler.ts',
      'src/assets/vehicle/runtime/motion.ts',
    ]) {
      const content = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(content, file).not.toMatch(/from ['"]three['"]/);
      expect(content, file).not.toMatch(/runtime\/(?:sprite|solid)-rig/);
      expect(content, file).not.toMatch(/assets\/[^/]+\/(?:raster|solid)\//);
    }
  });
});
