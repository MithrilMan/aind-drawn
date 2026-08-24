import { MEDIUM_IDS, type MediumId } from '../../../src/index.js';
import { createCourseLayout } from './game/course.js';
import { InputController } from './game/input-controller.js';
import { RaceHud } from './game/race-hud.js';
import { RaceSimulation } from './game/race-model.js';
import { RaceStage, type RaceCameraMode } from './game/race-stage.js';
import { createRaceWorldLayout } from './game/race-world.js';
import './style.css';

function requireElement<T extends Element>(selector: string, constructor: abstract new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const shell = requireElement('[data-race-shell]', HTMLElement);
const viewport = requireElement('[data-viewport]', HTMLElement);
const canvas = requireElement('[data-race-canvas]', HTMLCanvasElement);
const mediumSelect = requireElement('[data-medium]', HTMLSelectElement);
const cameraButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-camera]')];
const newRaceButton = requireElement('[data-new-race]', HTMLButtonElement);
const pauseButton = requireElement('[data-pause]', HTMLButtonElement);
const rendererError = requireElement('[data-renderer-error]', HTMLElement);
const retryButton = requireElement('[data-retry]', HTMLButtonElement);

const course = createCourseLayout();
const world = createRaceWorldLayout(course);
const simulation = new RaceSimulation(course, world);
const input = new InputController(shell);
const hud = new RaceHud(shell);
let stage: RaceStage | null = null;
let medium: MediumId = 'oil';
let cameraMode: RaceCameraMode = 'follow';
let previousTime = performance.now();
let animationFrame = 0;
let active = true;

function startRenderer(): void {
  try {
    stage?.dispose();
    stage = new RaceStage(canvas, viewport, course, world, medium);
    stage.setCameraMode(cameraMode);
    rendererError.hidden = true;
  } catch (error) {
    stage = null;
    rendererError.hidden = false;
    hud.announce('The Doodle renderer failed to start. Retry is available.');
    console.error(error);
  }
}

function frame(now: number): void {
  if (!active) return;
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000));
  previousTime = now;
  try {
    const snapshot = simulation.update(delta, input.snapshot());
    hud.render(snapshot);
    stage?.render(snapshot, delta);
  } catch (error) {
    stage?.dispose();
    stage = null;
    rendererError.hidden = false;
    hud.announce('The Doodle renderer stopped during the race. Retry is available.');
    console.error(error);
  }
  animationFrame = requestAnimationFrame(frame);
}

function dispose(): void {
  if (!active) return;
  active = false;
  cancelAnimationFrame(animationFrame);
  input.dispose();
  stage?.dispose();
  stage = null;
}

mediumSelect.addEventListener('change', () => {
  const selected = mediumSelect.value as MediumId;
  if (!MEDIUM_IDS.includes(selected)) return;
  medium = selected;
  stage?.setMedium(medium);
  hud.announce(`${mediumSelect.selectedOptions[0]?.textContent ?? 'Drawing'} medium applied.`);
  canvas.focus({ preventScroll: true });
});

for (const button of cameraButtons) {
  button.addEventListener('click', () => {
    cameraMode = button.dataset.camera === 'full' ? 'full' : 'follow';
    for (const candidate of cameraButtons) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    }
    stage?.setCameraMode(cameraMode);
    hud.announce(cameraMode === 'follow' ? 'Follow camera selected.' : 'Full course map selected.');
    canvas.focus({ preventScroll: true });
  });
}

newRaceButton.addEventListener('click', () => {
  simulation.reset();
  canvas.focus({ preventScroll: true });
});

pauseButton.addEventListener('click', () => {
  simulation.togglePause();
  canvas.focus({ preventScroll: true });
});

window.addEventListener('keydown', (event) => {
  const editable = event.target instanceof HTMLInputElement
    || event.target instanceof HTMLSelectElement
    || event.target instanceof HTMLTextAreaElement;
  if (event.key.toLowerCase() !== 'p' || editable) return;
  simulation.togglePause();
  event.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) simulation.pause();
});

retryButton.addEventListener('click', startRenderer);
window.addEventListener('beforeunload', dispose);
if (import.meta.hot !== undefined) import.meta.hot.dispose(dispose);

startRenderer();
hud.render(simulation.snapshot());
animationFrame = requestAnimationFrame(frame);
