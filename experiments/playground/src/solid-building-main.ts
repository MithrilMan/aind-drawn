import './solid-face.css';

import * as THREE from 'three';

import {
  InkedSolidPass,
  InkedSolidStrokeRig,
  SolidRig,
  createBuildingIdentity,
  createInkedSolidBlueprint,
  inkedSolidMediumDefaults,
  createRasterBuildingBlueprint,
  createRasterBuildingRecipe,
  createSolidBuildingBlueprint,
  createSolidBuildingInkStrokes,
  type AssetBlueprint,
  type BuildingArchetype,
  type MediumId,
  type RoofStyle,
  type SolidFinishId,
} from '../../../src/index.js';
import { BlueprintThumbnailRenderer } from './blueprint-thumbnail.js';

const root = document.querySelector<HTMLElement>('[data-building-lab]');
const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
const viewport = document.querySelector<HTMLElement>('[data-viewport]');
if (root === null || canvas === null || viewport === null) {
  throw new Error('Building lab root is incomplete');
}

function requiredElement(selector: string): Element {
  const element = root?.querySelector(selector);
  if (element === null || element === undefined) {
    throw new Error(`Missing building lab control: ${selector}`);
  }
  return element;
}

const seedInput = requiredElement('[name="seed"]') as HTMLInputElement;
const archetypeInput = requiredElement('[name="archetype"]') as HTMLSelectElement;
const widthInput = requiredElement('[name="width"]') as HTMLInputElement;
const heightInput = requiredElement('[name="height"]') as HTMLInputElement;
const roofInput = requiredElement('[name="roof"]') as HTMLSelectElement;
const finishInput = requiredElement('[name="finish"]') as HTMLSelectElement;
const renderStyleInput = requiredElement('[name="renderStyle"]') as HTMLSelectElement;
const mediumInput = requiredElement('[name="medium"]') as HTMLSelectElement;
const lineWeightInput = requiredElement('[name="lineWeight"]') as HTMLSelectElement;
const hatchingInput = requiredElement('[name="hatching"]') as HTMLInputElement;
const lineBoilInput = requiredElement('[name="lineBoil"]') as HTMLInputElement;
const doorStateInput = requiredElement('[name="doorState"]') as HTMLSelectElement;
const rasterImage = requiredElement('[data-raster-preview]') as HTMLImageElement;
const rasterMedium = requiredElement('[data-raster-medium]') as HTMLElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe7decd, 15, 34);
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 80);
scene.add(new THREE.HemisphereLight(0xfff8e8, 0x685d57, 2.25));
const key = new THREE.DirectionalLight(0xfff3db, 3.7);
key.position.set(7, 11, 8);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.1;
key.shadow.camera.far = 40;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7899a1, 1.2);
rim.position.set(-8, 6, -5);
scene.add(rim);

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xcabda6, roughness: 0.94 });
const floorGeometry = new THREE.CircleGeometry(14, 96);
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const thumbnailRenderer = new BlueprintThumbnailRenderer({ width: 220, height: 220 });
let rig: SolidRig | null = null;
let inkedPass: InkedSolidPass | null = null;
let strokeRig: InkedSolidStrokeRig | null = null;
let rasterBlueprint: AssetBlueprint | null = null;
let rotationX = -0.08;
let rotationY = -0.36;

function updateInkedRendering(): void {
  if (rig === null) return;
  const medium = mediumInput.value as MediumId;
  const defaults = inkedSolidMediumDefaults(medium);
  const boil = lineBoilInput.checked;
  hatchingInput.disabled = defaults.hatching === null;
  hatchingInput.closest('label')?.toggleAttribute('hidden', defaults.hatching === null);
  const blueprint = createInkedSolidBlueprint(rig.blueprint, {
    medium,
    contour: {
      width: defaults.contour.width * Number(lineWeightInput.value),
      jitter: boil ? defaults.contour.jitter : 0,
      boilFramesPerSecond: boil ? defaults.contour.boilFramesPerSecond : 0,
    },
    ...(hatchingInput.checked && defaults.hatching !== null ? {
      hatching: {
        jitter: boil ? defaults.hatching.jitter : 0,
        boilFramesPerSecond: boil ? defaults.hatching.boilFramesPerSecond : 0,
      },
    } : { hatching: null }),
    strokes: createSolidBuildingInkStrokes(rig.blueprint),
  });
  strokeRig?.dispose();
  if (inkedPass === null) inkedPass = new InkedSolidPass(renderer, blueprint);
  else inkedPass.setBlueprint(blueprint);
  strokeRig = new InkedSolidStrokeRig(blueprint, rig);
  const inked = renderStyleInput.value === 'inked';
  strokeRig.visible = inked;
  finishInput.disabled = inked;
  inkedPass.setSize(
    Math.max(1, viewport?.clientWidth ?? 1),
    Math.max(1, viewport?.clientHeight ?? 1),
    renderer.getPixelRatio(),
  );
  const stats = root?.querySelector<HTMLElement>('[data-render-stats]');
  if (stats !== null && stats !== undefined) {
    const style = inked
      ? `${blueprint.strokes.length} strokes / ${medium} doodle 3D`
      : 'smooth solid';
    stats.textContent = `${rig.blueprint.parts.length} meshes / ${style}`;
  }
}

function updateRasterPreview(): void {
  if (rasterBlueprint === null) return;
  rasterImage.src = thumbnailRenderer.render(rasterBlueprint, {
    interactionStates: { door: doorStateInput.value },
  });
}

function frameBuilding(): void {
  const bounds = rig?.blueprint.bounds;
  if (bounds === undefined) return;
  const width = bounds.maximum[0] - bounds.minimum[0];
  const height = bounds.maximum[1] - bounds.minimum[1];
  const depth = bounds.maximum[2] - bounds.minimum[2];
  const centerY = (bounds.minimum[1] + bounds.maximum[1]) * 0.5;
  const verticalDistance = height * 0.58 / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const horizontalDistance = width * 0.58
    / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
    / Math.max(0.5, camera.aspect);
  const distance = Math.max(verticalDistance, horizontalDistance, depth * 2.2) * 1.16;
  camera.position.set(0, centerY + height * 0.04, distance);
  camera.lookAt(0, centerY, 0);
}

function updateContract(): void {
  const blueprint = rig?.blueprint;
  if (blueprint === undefined) return;
  const values: Readonly<Record<string, number>> = {
    '[data-node-count]': blueprint.nodes.length,
    '[data-part-count]': blueprint.parts.length,
    '[data-interaction-count]': blueprint.interactions.length,
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
  strokeRig?.dispose();
  strokeRig = null;
  rig?.root.removeFromParent();
  rig?.dispose();
  const identity = createBuildingIdentity(Number(seedInput.value) || 0, {
    archetype: archetypeInput.value as BuildingArchetype,
    width: Number(widthInput.value),
    height: Number(heightInput.value),
    ...(roofInput.value === '' ? {} : { roof: roofInput.value as RoofStyle }),
  });
  rasterBlueprint = createRasterBuildingBlueprint(createRasterBuildingRecipe(identity, {
    medium: mediumInput.value as MediumId,
  }));
  rasterMedium.textContent = `${mediumInput.selectedOptions[0]?.textContent ?? 'Medium'} / same medium and identity`;
  rasterImage.alt = `${mediumInput.selectedOptions[0]?.textContent ?? 'Hand-drawn'} rendering of the same generated building identity`;
  rig = new SolidRig(createSolidBuildingBlueprint(identity, {
    finish: finishInput.value as SolidFinishId,
  }));
  rig.root.rotation.set(rotationX, rotationY, 0);
  rig.setInteractionState('door', doorStateInput.value);
  scene.add(rig.root);
  const identityValues: Readonly<Record<string, string>> = {
    '[data-identity-seed]': String(identity.seed),
    '[data-identity-type]': identity.archetype,
    '[data-identity-grid]': `${identity.floors} / ${identity.columns}`,
    '[data-identity-depth]': identity.depth.toFixed(2),
  };
  for (const [selector, value] of Object.entries(identityValues)) {
    const target = root?.querySelector<HTMLElement>(selector);
    if (target !== null && target !== undefined) target.textContent = value;
  }
  updateRasterPreview();
  updateContract();
  frameBuilding();
}

for (const input of [
  seedInput, archetypeInput, widthInput, heightInput, roofInput, finishInput, mediumInput,
]) {
  input.addEventListener('change', rebuild);
}
for (const input of [
  renderStyleInput, lineWeightInput, hatchingInput, lineBoilInput,
]) {
  input.addEventListener('change', updateInkedRendering);
}
doorStateInput.addEventListener('change', () => {
  rig?.setInteractionState('door', doorStateInput.value);
  updateRasterPreview();
});
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
  rotationX = THREE.MathUtils.clamp(rotationX + (event.clientY - previousY) * 0.006, -0.55, 0.35);
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
  frameBuilding();
});
observer.observe(viewport);

let frame = 0;
function animate(time: number): void {
  frame = requestAnimationFrame(animate);
  if (renderStyleInput.value === 'inked' && inkedPass !== null) {
    inkedPass.render(scene, camera, time / 1000);
  } else {
    renderer.render(scene, camera);
  }
}

function dispose(): void {
  cancelAnimationFrame(frame);
  observer.disconnect();
  strokeRig?.dispose();
  inkedPass?.dispose();
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
