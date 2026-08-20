import './character-compare.css';

import * as THREE from 'three';

import {
  InkedSolidPass,
  InkedSolidStrokeRig,
  SolidCharacterAnimator,
  SolidRig,
  createCharacterDrawingStyle,
  createCharacterIdentity,
  createInkedSolidBlueprint,
  createRasterCharacterBlueprint,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
  type MediumId,
} from '../../../src/index.js';
import { CharacterRasterPreview } from './character-raster-preview.js';

function comparisonRoot(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-comparison-lab]');
  if (element === null) throw new Error('Representation comparison lab is incomplete');
  return element;
}

const root = comparisonRoot();

function required(selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`Missing comparison control: ${selector}`);
  return element;
}

const rasterCanvas = required('[data-raster-canvas]') as HTMLCanvasElement;
const solidCanvas = required('[data-solid-canvas]') as HTMLCanvasElement;
const solidViewport = required('[data-solid-viewport]');

const seedInput = required('[name="seed"]') as HTMLInputElement;
const mediumInput = required('[name="medium"]') as HTMLSelectElement;
const status = required('[data-status]');
const rasterPreview = new CharacterRasterPreview(rasterCanvas);
const renderer = new THREE.WebGLRenderer({ canvas: solidCanvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 20);
camera.position.set(0, 1, 7);
camera.lookAt(0, 1, 0);

let rig: SolidRig | null = null;
let pass: InkedSolidPass | null = null;
let strokes: InkedSolidStrokeRig | null = null;
let animator: SolidCharacterAnimator | null = null;

function setText(selector: string, value: string): void {
  required(selector).textContent = value;
}

function frameSolid(): void {
  const blueprint = rig?.blueprint;
  if (blueprint === undefined) return;
  const width = blueprint.bounds.maximum[0] - blueprint.bounds.minimum[0];
  const height = blueprint.bounds.maximum[1] - blueprint.bounds.minimum[1];
  const aspect = Math.max(0.2, solidViewport.clientWidth / Math.max(1, solidViewport.clientHeight));
  const verticalHalf = Math.max(height * 0.58, width * 0.58 / aspect);
  const centerX = (blueprint.bounds.minimum[0] + blueprint.bounds.maximum[0]) * 0.5;
  const centerY = (blueprint.bounds.minimum[1] + blueprint.bounds.maximum[1]) * 0.5;
  camera.left = -verticalHalf * aspect;
  camera.right = verticalHalf * aspect;
  camera.top = verticalHalf;
  camera.bottom = -verticalHalf;
  camera.position.set(centerX, centerY, 7);
  camera.lookAt(centerX, centerY, 0);
  camera.updateProjectionMatrix();
}

function render(): void {
  if (pass !== null) pass.render(scene, camera, 0);
}

function rebuild(): void {
  strokes?.dispose();
  strokes = null;
  rig?.root.removeFromParent();
  rig?.dispose();
  const seed = Number(seedInput.value) || 0;
  const medium = mediumInput.value as MediumId;
  const identity = createCharacterIdentity(seed);
  const raster = createRasterCharacterBlueprint(identity, { medium });
  const solid = createSolidCharacterBlueprint(identity);
  const inked = createInkedSolidBlueprint(solid, {
    medium,
    contour: { jitter: 0, boilFramesPerSecond: 0 },
    strokes: createSolidCharacterInkStrokes(solid),
  });

  rasterPreview.setBlueprint(raster, { autoGaze: false });
  rasterPreview.settle({ pose: 'idle', speed: 0, facing: 1 });
  rig = new SolidRig(solid);
  scene.add(rig.root);
  animator = new SolidCharacterAnimator(rig, { autoGaze: false });
  animator.update(0, { pose: 'idle', speed: 0, facing: 1 });
  pass?.dispose();
  pass = new InkedSolidPass(renderer, inked);
  strokes = new InkedSolidStrokeRig(inked, rig);
  frameSolid();
  pass.setSize(solidViewport.clientWidth, solidViewport.clientHeight, renderer.getPixelRatio());
  render();

  const drawing = createCharacterDrawingStyle(identity);
  setText('[data-identity-seed]', String(identity.seed));
  setText('[data-identity-eyes]', `${identity.eyes.style}${
    identity.eyes.alternateStyle === null ? '' : ` → ${identity.eyes.alternateStyle}`
  }`);
  setText('[data-identity-brows]', identity.brows.present ? 'present' : 'absent');
  setText('[data-identity-hair]', identity.hair.style);
  setText('[data-identity-outfit]', identity.outfit.style);
  setText('[data-identity-tones]', `${drawing.headTone} / ${drawing.hairTone} / ${drawing.bodyTone}`);
  const palette = required('[data-palette]');
  palette.replaceChildren(...Object.entries(identity.palette).slice(0, 4).map(([name, color]) => {
    const swatch = document.createElement('span');
    swatch.className = 'palette-swatch';
    swatch.style.backgroundColor = `rgb(${color.join(' ')})`;
    swatch.title = `${name}: rgb(${color.join(', ')})`;
    swatch.setAttribute('aria-label', swatch.title);
    return swatch;
  }));
  status.textContent = `${seed} · ${medium} · ${solid.parts.length} semantic meshes`;
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
    button.setAttribute('aria-pressed', String(button.dataset.preset === `${seed}:${medium}`));
  }
}

for (const input of [seedInput, mediumInput]) input.addEventListener('change', rebuild);
for (const button of root.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
  button.addEventListener('click', () => {
    const [seed, medium] = button.dataset.preset?.split(':') ?? [];
    if (seed === undefined || medium === undefined) return;
    seedInput.value = seed;
    mediumInput.value = medium;
    rebuild();
  });
}

const observer = new ResizeObserver(() => {
  const width = Math.max(1, solidViewport.clientWidth);
  const height = Math.max(1, solidViewport.clientHeight);
  renderer.setSize(width, height, false);
  pass?.setSize(width, height, renderer.getPixelRatio());
  frameSolid();
  render();
});
observer.observe(solidViewport);

function dispose(): void {
  observer.disconnect();
  strokes?.dispose();
  pass?.dispose();
  rig?.dispose();
  rasterPreview.dispose();
  renderer.dispose();
}

window.addEventListener('pagehide', dispose, { once: true });
rebuild();
if (import.meta.hot !== undefined) import.meta.hot.dispose(dispose);
