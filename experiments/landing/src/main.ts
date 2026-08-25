import { DoodleSpecimenStage } from './doodle-specimen-stage.js';
import { RasterSpecimenStage } from './raster-specimen-stage.js';
import {
  createSpecimenProjection,
  sampleSpecimenCharacterMotion,
  sampleSpecimenVehicleInteractions,
  sampleSpecimenVehicleMotion,
  type SpecimenFamily,
  type SpecimenMedium,
  type SpecimenProjection,
} from './specimen-projection.js';
import './style.css';

function requiredMatch(selector: string): Element {
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`Missing landing element: ${selector}`);
  return element;
}

function isFamily(value: string | undefined): value is SpecimenFamily {
  return value === 'character' || value === 'vehicle';
}

function isMedium(value: string | undefined): value is SpecimenMedium {
  return value === 'graphite' || value === 'oil';
}

const year = document.querySelector<HTMLElement>('[data-current-year]');
if (year) year.textContent = String(new Date().getFullYear());

const familyButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-specimen-family]')];
const mediumButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-specimen-medium]')];
const comparisonControls = [...document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-comparison-control]')];
const comparison = requiredMatch('[data-specimen-comparison]') as HTMLElement;
const comparisonRange = requiredMatch('[data-comparison-range]') as HTMLInputElement;
const familyReadout = requiredMatch('[data-specimen-family-readout]') as HTMLElement;
const mediumReadout = requiredMatch('[data-specimen-medium-readout]') as HTMLElement;
const rasterLabel = requiredMatch('[data-raster-label]') as HTMLElement;
const doodleLabel = requiredMatch('[data-doodle-label]') as HTMLElement;
const projectionCache = new Map<string, SpecimenProjection>();
let family: SpecimenFamily = 'character';
let medium: SpecimenMedium = 'graphite';
let rasterStage: RasterSpecimenStage | null = null;
let doodleStage: DoodleSpecimenStage | null = null;
let animationFrame = 0;
let elapsedSeconds = 0;

function projection(): SpecimenProjection {
  const key = `${family}:${medium}`;
  const existing = projectionCache.get(key);
  if (existing !== undefined) return existing;
  const created = createSpecimenProjection(family, medium);
  projectionCache.set(key, created);
  return created;
}

function updateComparisonRange(): void {
  const amount = Number(comparisonRange.value);
  comparison.style.setProperty('--comparison-split', `${amount}%`);
  comparisonRange.setAttribute(
    'aria-valuetext',
    `${amount}% Drawn 2D, ${100 - amount}% Doodle 3D`,
  );
}

function updateControls(): void {
  for (const button of familyButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.specimenFamily === family));
  }
  for (const button of mediumButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.specimenMedium === medium));
  }
  const mediumName = medium === 'graphite' ? 'Graphite' : 'Oil';
  familyReadout.textContent = family === 'character' ? 'CHR / 4104' : 'VEH / 8417';
  mediumReadout.textContent = `MEDIUM / ${mediumName.toUpperCase()}`;
  rasterLabel.textContent = `${mediumName} 2D`;
  doodleLabel.textContent = `${mediumName} Doodle 3D`;
  comparison.dataset.family = family;
  comparison.dataset.medium = medium;
}

function applyProjection(): void {
  const next = projection();
  comparison.setAttribute('aria-busy', 'true');
  rasterStage?.setBlueprint(next.raster);
  doodleStage?.setProjection(next);
  updateControls();
  applySpecimenMotion();
  rasterStage?.render(elapsedSeconds);
  doodleStage?.render(elapsedSeconds);
  comparison.setAttribute('aria-busy', 'false');
}

function applySpecimenMotion(): void {
  const sampleTime = Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0
    ? elapsedSeconds
    : 0;
  if (family === 'character') {
    const sample = sampleSpecimenCharacterMotion(sampleTime);
    rasterStage?.applyCharacterMotion(sample);
    doodleStage?.applyCharacterMotion(sample);
    familyReadout.textContent = 'CHR / 4104 · DANCE';
    return;
  }
  const sample = sampleSpecimenVehicleMotion(sampleTime);
  const cue = sampleSpecimenVehicleInteractions(sampleTime);
  rasterStage?.applyVehicleMotion(sample);
  doodleStage?.applyVehicleMotion(sample);
  rasterStage?.setInteractionStates(cue.states);
  doodleStage?.setInteractionStates(cue.states);
  familyReadout.textContent = `VEH / 8417 · ${cue.label}`;
}

for (const button of familyButtons) {
  button.addEventListener('click', () => {
    const next = button.dataset.specimenFamily;
    if (!isFamily(next) || next === family) return;
    family = next;
    applyProjection();
  });
}

for (const button of mediumButtons) {
  button.addEventListener('click', () => {
    const next = button.dataset.specimenMedium;
    if (!isMedium(next) || next === medium) return;
    medium = next;
    applyProjection();
  });
}

comparisonRange.addEventListener('input', updateComparisonRange);
updateComparisonRange();

try {
  const viewport = requiredMatch('[data-specimen-viewport]') as HTMLElement;
  rasterStage = new RasterSpecimenStage(
    requiredMatch('[data-raster-canvas]') as HTMLCanvasElement,
    viewport,
  );
  doodleStage = new DoodleSpecimenStage(
    requiredMatch('[data-doodle-canvas]') as HTMLCanvasElement,
    viewport,
  );
  applyProjection();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previousTime = performance.now();
  const render = (time: number): void => {
    const currentTime = Number.isFinite(time) ? time : performance.now();
    const deltaSeconds = Math.max(0, Math.min(.05, (currentTime - previousTime) / 1000));
    elapsedSeconds += deltaSeconds;
    previousTime = currentTime;
    applySpecimenMotion();
    rasterStage?.render(elapsedSeconds);
    doodleStage?.render(elapsedSeconds);
    if (!reducedMotion) animationFrame = requestAnimationFrame(render);
  };
  animationFrame = requestAnimationFrame(render);
} catch (error) {
  console.error('The live projection comparison could not be rendered.', error);
  const fallback = document.querySelector<HTMLElement>('[data-specimen-fallback]');
  if (fallback) fallback.hidden = false;
  for (const control of comparisonControls) control.disabled = true;
  comparison.setAttribute('aria-busy', 'false');
}

window.addEventListener('pagehide', () => {
  cancelAnimationFrame(animationFrame);
  rasterStage?.dispose();
  doodleStage?.dispose();
}, { once: true });
