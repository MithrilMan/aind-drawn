import './solid-face.css';

import * as THREE from 'three';

import {
  SolidCharacterAnimator,
  SolidRig,
  createCharacterIdentity,
  createRasterCharacterBlueprint,
  createSolidCharacterBlueprint,
  type CharacterEyeStyle,
  type CharacterHairStyle,
  type CharacterHeadShape,
  type CharacterIdentitySpecies,
  type AssetBlueprint,
  type SolidFaceExpression,
  type SolidFinishId,
} from '../../../src/index.js';
import { BlueprintThumbnailRenderer } from './blueprint-thumbnail.js';

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
const framingInput = requiredElement('[name="framing"]') as HTMLSelectElement;
const expressionInput = requiredElement('[name="expression"]') as HTMLSelectElement;
const autoGazeInput = requiredElement('[name="autoGaze"]') as HTMLInputElement;

let rig: SolidRig | null = null;
let animator: SolidCharacterAnimator | null = null;
let rasterBlueprint: AssetBlueprint | null = null;
let rotationX = 0;
let rotationY = 0;
const thumbnailRenderer = new BlueprintThumbnailRenderer({ width: 180, height: 180 });

function updateRasterPreview(): void {
  if (rasterBlueprint === null) return;
  const preview = requiredElement('[data-raster-preview]') as HTMLImageElement;
  preview.src = thumbnailRenderer.render(rasterBlueprint, {
    layerStates: { mouth: expressionInput.value },
  });
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
  const stats = root?.querySelector<HTMLElement>('[data-render-stats]');
  if (stats !== null && stats !== undefined) stats.textContent = `${blueprint.parts.length} meshes / live transforms`;
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
  rasterBlueprint = createRasterCharacterBlueprint(identity, { medium: 'graphite' });
  updateRasterPreview();
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
}

for (const input of [
  seedInput, speciesInput, shapeInput, eyeStyleInput, hairStyleInput, finishInput,
]) {
  input.addEventListener('change', rebuild);
}
framingInput.addEventListener('change', frameCharacter);
expressionInput.addEventListener('change', () => {
  animator?.setExpression(expressionInput.value as SolidFaceExpression);
  updateRasterPreview();
});
autoGazeInput.addEventListener('change', rebuild);
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
  animator?.update(deltaSeconds);
  renderer.render(scene, camera);
}

function dispose(): void {
  cancelAnimationFrame(frame);
  observer.disconnect();
  rig?.dispose();
  thumbnailRenderer.dispose();
  floorGeometry.dispose();
  floorMaterial.dispose();
  renderer.dispose();
}

window.addEventListener('pagehide', dispose, { once: true });
rebuild();
frame = requestAnimationFrame(animate);

if (import.meta.hot !== undefined) import.meta.hot.dispose(dispose);
