import './solid-face.css';

import * as THREE from 'three';

import {
  InkedSolidPass,
  SolidCharacterAnimator,
  SolidRig,
  createCharacterIdentity,
  createInkedSolidBlueprint,
  createRasterCharacterBlueprint,
  createSolidCharacterBlueprint,
  type CharacterEyeStyle,
  type CharacterHairStyle,
  type CharacterHeadShape,
  type CharacterIdentitySpecies,
  type CharacterMotion,
  type CharacterPose,
  type SolidFaceExpression,
  type SolidFinishId,
} from '../../../src/index.js';
import { CharacterRasterPreview } from './character-raster-preview.js';

const root = document.querySelector<HTMLElement>('[data-solid-lab]');
const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
const viewport = document.querySelector<HTMLElement>('[data-viewport]');
if (root === null || canvas === null || viewport === null) throw new Error('Solid lab root is incomplete');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe7decd, 7, 12);
const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 30);
camera.position.set(0, 1.35, 5.6);
camera.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xfff8e8, 0x725f57, 2.1));
const key = new THREE.DirectionalLight(0xfff3db, 3.4);
key.position.set(3.2, 5.4, 4.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.1;
key.shadow.camera.far = 12;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7899a1, 1.15);
rim.position.set(-4, 2.5, -3);
scene.add(rim);

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xcabda6, roughness: 0.92 });
const floorGeometry = new THREE.CircleGeometry(3.1, 80);
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function requiredElement(selector: string): Element {
  const element = root?.querySelector(selector);
  if (element === null || element === undefined) throw new Error(`Missing solid lab control: ${selector}`);
  return element;
}

const seedInput = requiredElement('[name="seed"]') as HTMLInputElement;
const speciesInput = requiredElement('[name="species"]') as HTMLSelectElement;
const shapeInput = requiredElement('[name="shape"]') as HTMLSelectElement;
const eyeStyleInput = requiredElement('[name="eyeStyle"]') as HTMLSelectElement;
const hairStyleInput = requiredElement('[name="hairStyle"]') as HTMLSelectElement;
const finishInput = requiredElement('[name="finish"]') as HTMLSelectElement;
const renderStyleInput = requiredElement('[name="renderStyle"]') as HTMLSelectElement;
const lineWeightInput = requiredElement('[name="lineWeight"]') as HTMLSelectElement;
const hatchingInput = requiredElement('[name="hatching"]') as HTMLInputElement;
const lineBoilInput = requiredElement('[name="lineBoil"]') as HTMLInputElement;
const framingInput = requiredElement('[name="framing"]') as HTMLSelectElement;
const expressionInput = requiredElement('[name="expression"]') as HTMLSelectElement;
const autoGazeInput = requiredElement('[name="autoGaze"]') as HTMLInputElement;
const poseInput = requiredElement('[name="pose"]') as HTMLSelectElement;
const speedInput = requiredElement('[name="speed"]') as HTMLInputElement;
const facingInput = requiredElement('[name="facing"]') as HTMLSelectElement;
const motionToggle = requiredElement('[data-motion-toggle]') as HTMLButtonElement;
const motionRestart = requiredElement('[data-motion-restart]') as HTMLButtonElement;
const motionIcon = requiredElement('[data-motion-icon]') as HTMLElement;
const motionToggleLabel = requiredElement('[data-motion-toggle-label]') as HTMLElement;
const speedOutput = requiredElement('[data-speed-output]') as HTMLOutputElement;
const motionStatus = requiredElement('[data-motion-status]') as HTMLElement;
const motionStatusRow = requiredElement('[data-motion-status-row]') as HTMLElement;
const rasterCanvas = requiredElement('[data-raster-preview]') as HTMLCanvasElement;

let rig: SolidRig | null = null;
let inkedPass: InkedSolidPass | null = null;
let animator: SolidCharacterAnimator | null = null;
let rotationX = 0;
let rotationY = 0;
let motionPlaying = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rasterPreview = new CharacterRasterPreview(rasterCanvas);

function updateInkedRendering(): void {
  if (rig === null) return;
  const boil = lineBoilInput.checked;
  const blueprint = createInkedSolidBlueprint(rig.blueprint, {
    contour: {
      width: Number(lineWeightInput.value),
      jitter: boil ? 0.34 : 0,
      boilFramesPerSecond: boil ? 6 : 0,
    },
    hatching: hatchingInput.checked ? {
      jitter: boil ? 0.025 : 0,
      boilFramesPerSecond: boil ? 5 : 0,
    } : null,
  });
  if (inkedPass === null) inkedPass = new InkedSolidPass(renderer, blueprint);
  else inkedPass.setBlueprint(blueprint);
  inkedPass.setSize(
    Math.max(1, viewport?.clientWidth ?? 1),
    Math.max(1, viewport?.clientHeight ?? 1),
    renderer.getPixelRatio(),
  );
  const stats = root?.querySelector<HTMLElement>('[data-render-stats]');
  if (stats !== null && stats !== undefined) {
    const style = renderStyleInput.value === 'inked' ? 'inked-solid' : 'smooth solid';
    stats.textContent = `${rig.blueprint.parts.length} meshes / ${style}`;
  }
}

function currentMotion(): CharacterMotion {
  return {
    pose: poseInput.value as CharacterPose,
    speed: Number(speedInput.value),
    facing: Number(facingInput.value) as -1 | 1,
  };
}

function updateMotionControls(): void {
  const isGait = poseInput.value === 'walk' || poseInput.value === 'run';
  const intensity = Math.round(Number(speedInput.value) * 100);
  speedInput.disabled = !isGait;
  speedOutput.value = `${intensity}%`;
  motionToggle.setAttribute('aria-pressed', String(!motionPlaying));
  motionIcon.textContent = motionPlaying ? 'Ⅱ' : '▶';
  motionToggleLabel.textContent = motionPlaying ? 'Pause' : 'Resume';
  motionStatus.textContent = `${poseInput.selectedOptions[0]?.textContent ?? 'Pose'}${
    isGait ? ` · ${intensity}%` : ''
  } · ${motionPlaying ? 'live' : 'paused'}`;
  motionStatusRow.classList.toggle('is-paused', !motionPlaying);
}

function frameCharacter(): void {
  const blueprint = rig?.blueprint;
  if (blueprint === undefined) return;
  const faceMode = framingInput.value === 'face';
  const head = blueprint.parts.find((part) => part.id === 'head');
  const headRadii = head?.geometry.type === 'superellipsoid'
    ? head.geometry.radii
    : [0.5, 0.5, 0.5] as const;
  const centerY = faceMode
    ? blueprint.sockets.head?.[1] ?? 1
    : (blueprint.bounds.minimum[1] + blueprint.bounds.maximum[1]) * 0.5;
  const halfHeight = faceMode
    ? headRadii[1] * 1.55
    : (blueprint.bounds.maximum[1] - blueprint.bounds.minimum[1]) * 0.58;
  const halfWidth = faceMode
    ? headRadii[0] * 1.55
    : (blueprint.bounds.maximum[0] - blueprint.bounds.minimum[0]) * 0.58;
  const verticalDistance = halfHeight / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const horizontalDistance = halfWidth
    / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
    / Math.max(0.5, camera.aspect);
  const distance = Math.max(verticalDistance, horizontalDistance) * 1.12;
  camera.position.set(0, centerY, distance);
  camera.lookAt(0, centerY, 0);
  rasterPreview.frame(faceMode ? 'face' : 'full');
}

function updateContract(): void {
  const blueprint = rig?.blueprint;
  if (blueprint === undefined) return;
  const values: Readonly<Record<string, number>> = {
    '[data-node-count]': blueprint.nodes.length,
    '[data-part-count]': blueprint.parts.length,
    '[data-material-count]': blueprint.materials.length,
    '[data-collider-count]': blueprint.colliders.length,
  };
  for (const [selector, value] of Object.entries(values)) {
    const target = root?.querySelector<HTMLElement>(selector);
    if (target !== null && target !== undefined) target.textContent = String(value);
  }
  const list = root?.querySelector<HTMLOListElement>('[data-part-list]');
  if (list !== null && list !== undefined) {
    list.replaceChildren(...blueprint.parts.map((part) => {
      const item = document.createElement('li');
      item.textContent = part.id;
      return item;
    }));
  }
  updateInkedRendering();
}

function rebuild(): void {
  rig?.root.removeFromParent();
  rig?.dispose();
  const identity = createCharacterIdentity(Number(seedInput.value) || 0, {
    species: speciesInput.value as CharacterIdentitySpecies,
    shape: shapeInput.value as CharacterHeadShape,
    ...(eyeStyleInput.value === '' ? {} : {
      eyeStyle: eyeStyleInput.value as CharacterEyeStyle,
      alternateEyeStyle: null,
    }),
    ...(hairStyleInput.value === '' ? {} : {
      hairStyle: hairStyleInput.value as CharacterHairStyle,
    }),
  });
  rig = new SolidRig(createSolidCharacterBlueprint(identity, {
    finish: finishInput.value as SolidFinishId,
  }));
  rig.root.rotation.set(rotationX, rotationY, 0);
  scene.add(rig.root);
  animator = new SolidCharacterAnimator(rig, { autoGaze: autoGazeInput.checked });
  animator.setExpression(expressionInput.value as SolidFaceExpression);
  rasterPreview.setBlueprint(
    createRasterCharacterBlueprint(identity, { medium: 'graphite' }),
    { autoGaze: autoGazeInput.checked },
  );
  rasterPreview.setExpression(expressionInput.value as SolidFaceExpression);
  const identityValues: Readonly<Record<string, string>> = {
    '[data-identity-seed]': String(identity.seed),
    '[data-identity-species]': identity.species,
    '[data-identity-features]': `${identity.head.shape} / ${identity.eyes.style}${
      identity.eyes.alternateStyle === null ? '' : `→${identity.eyes.alternateStyle}`
    } / ${identity.hair.style}`,
  };
  for (const [selector, value] of Object.entries(identityValues)) {
    const target = root?.querySelector<HTMLElement>(selector);
    if (target !== null && target !== undefined) target.textContent = value;
  }
  updateContract();
  frameCharacter();
  animator.update(0, currentMotion());
  if (motionPlaying) rasterPreview.update(0, currentMotion());
  else rasterPreview.settle(currentMotion());
}

for (const input of [
  seedInput, speciesInput, shapeInput, eyeStyleInput, hairStyleInput, finishInput,
]) {
  input.addEventListener('change', rebuild);
}
for (const input of [renderStyleInput, lineWeightInput, hatchingInput, lineBoilInput]) {
  input.addEventListener('change', updateInkedRendering);
}
framingInput.addEventListener('change', frameCharacter);
expressionInput.addEventListener('change', () => {
  animator?.setExpression(expressionInput.value as SolidFaceExpression);
  rasterPreview.setExpression(expressionInput.value as SolidFaceExpression);
  animator?.update(0, currentMotion());
  rasterPreview.update(0, currentMotion());
});
autoGazeInput.addEventListener('change', rebuild);
poseInput.addEventListener('change', () => {
  updateMotionControls();
  animator?.update(0, currentMotion());
  if (motionPlaying) rasterPreview.update(0, currentMotion());
  else rasterPreview.settle(currentMotion());
});
speedInput.addEventListener('input', () => {
  updateMotionControls();
  animator?.update(0, currentMotion());
  rasterPreview.update(0, currentMotion());
});
facingInput.addEventListener('change', () => {
  animator?.update(0, currentMotion());
  rasterPreview.update(0, currentMotion());
});
motionToggle.addEventListener('click', () => {
  motionPlaying = !motionPlaying;
  updateMotionControls();
});
motionRestart.addEventListener('click', rebuild);
root.querySelector('[data-reroll]')?.addEventListener('click', () => {
  seedInput.value = String((Number(seedInput.value) + 1) >>> 0);
  rebuild();
});

let pointerId: number | null = null;
let previousX = 0;
let previousY = 0;
canvas.addEventListener('pointerdown', (event) => {
  pointerId = event.pointerId;
  previousX = event.clientX;
  previousY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (pointerId !== event.pointerId || rig === null) return;
  rotationY += (event.clientX - previousX) * 0.008;
  rotationX = THREE.MathUtils.clamp(rotationX + (event.clientY - previousY) * 0.006, -0.45, 0.45);
  previousX = event.clientX;
  previousY = event.clientY;
  rig.root.rotation.set(rotationX, rotationY, 0);
});
canvas.addEventListener('pointerup', (event) => {
  if (pointerId === event.pointerId) pointerId = null;
});

const observer = new ResizeObserver(() => {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  inkedPass?.setSize(width, height, renderer.getPixelRatio());
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  frameCharacter();
});
observer.observe(viewport);

let frame = 0;
let previousTime: number | null = null;
function animate(time: number): void {
  frame = requestAnimationFrame(animate);
  const deltaSeconds = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05);
  previousTime = time;
  const motion = currentMotion();
  const animationDelta = motionPlaying ? deltaSeconds : 0;
  animator?.update(animationDelta, motion);
  rasterPreview.update(animationDelta, motion);
  if (renderStyleInput.value === 'inked' && inkedPass !== null) {
    inkedPass.render(scene, camera, time / 1000);
  } else {
    renderer.render(scene, camera);
  }
}

function dispose(): void {
  cancelAnimationFrame(frame);
  observer.disconnect();
  rig?.dispose();
  inkedPass?.dispose();
  rasterPreview.dispose();
  floorGeometry.dispose();
  floorMaterial.dispose();
  renderer.dispose();
}

window.addEventListener('pagehide', dispose, { once: true });
updateMotionControls();
rebuild();
frame = requestAnimationFrame(animate);

if (import.meta.hot !== undefined) import.meta.hot.dispose(dispose);
