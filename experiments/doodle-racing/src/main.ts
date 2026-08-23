import {
  MEDIUM_IDS,
  type MediumId,
} from '../../../src/index.js';
import { createCourseLayout } from './game/course.js';
import { InputController } from './game/input-controller.js';
import { RaceSimulation, type RaceSnapshot } from './game/race-model.js';
import { RaceStage, type RaceCameraMode } from './game/race-stage.js';
import './style.css';

function requireElement(selector: string): Element {
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function ordinal(value: number): string {
  if (value === 1) return '1st';
  if (value === 2) return '2nd';
  if (value === 3) return '3rd';
  return `${value}th`;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remaining = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${remaining}`;
}

const shell = requireElement('[data-race-shell]') as HTMLElement;
const viewport = requireElement('[data-viewport]') as HTMLElement;
const canvas = requireElement('[data-race-canvas]') as HTMLCanvasElement;
const mediumSelect = requireElement('[data-medium]') as HTMLSelectElement;
const cameraButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-camera]')];
const newRaceButton = requireElement('[data-new-race]') as HTMLButtonElement;
const pauseButton = requireElement('[data-pause]') as HTMLButtonElement;
const lapOutput = requireElement('[data-lap]') as HTMLElement;
const positionOutput = requireElement('[data-position]') as HTMLElement;
const timeOutput = requireElement('[data-time]') as HTMLElement;
const runningOrder = requireElement('[data-running-order]') as HTMLOListElement;
const countdown = requireElement('[data-countdown]') as HTMLElement;
const liveStatus = requireElement('[data-live-status]') as HTMLElement;
const rendererError = requireElement('[data-renderer-error]') as HTMLElement;
const retryButton = requireElement('[data-retry]') as HTMLButtonElement;

const course = createCourseLayout();
const simulation = new RaceSimulation(course);
const input = new InputController(shell);
let stage: RaceStage | null = null;
let medium: MediumId = 'oil';
let cameraMode: RaceCameraMode = 'follow';
let previousTime = performance.now();
let previousPhase = simulation.snapshot().phase;
let previousOffRoad = false;
let previousCountdown = -1;
let previousOrder = '';
let animationFrame = 0;
let active = true;

function startRenderer(): void {
  try {
    stage?.dispose();
    stage = new RaceStage(canvas, viewport, course, medium);
    stage.setCameraMode(cameraMode);
    rendererError.hidden = true;
    canvas.focus({ preventScroll: true });
  } catch (error) {
    stage = null;
    rendererError.hidden = false;
    console.error(error);
  }
}

function renderRunningOrder(snapshot: RaceSnapshot): void {
  const ordered = [...snapshot.racers].sort((left, right) => right.raceScore - left.raceScore);
  const key = ordered.map(({ id, lap }) => `${id}:${lap}`).join(':');
  if (key === previousOrder) return;
  previousOrder = key;
  runningOrder.replaceChildren(...ordered.map((racer, index) => {
    const item = document.createElement('li');
    item.dataset.racer = racer.id;
    if (racer.isPlayer) item.classList.add('player-row');
    const place = document.createElement('span');
    place.className = 'order-position';
    place.textContent = (index + 1).toString().padStart(2, '0');
    const marker = document.createElement('span');
    marker.className = 'racer-marker';
    marker.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong');
    name.textContent = racer.name;
    const lap = document.createElement('small');
    lap.textContent = racer.lap >= snapshot.totalLaps
      ? 'FIN'
      : `L${Math.min(snapshot.totalLaps, racer.lap + 1)}`;
    item.append(place, marker, name, lap);
    return item;
  }));
}

function updateStatus(snapshot: RaceSnapshot): void {
  const count = Math.ceil(snapshot.countdown);
  if (snapshot.phase === 'countdown') {
    countdown.hidden = false;
    countdown.textContent = count.toString();
    if (count !== previousCountdown) liveStatus.textContent = `Race starts in ${count}.`;
    previousCountdown = count;
  } else if (snapshot.phase === 'paused') {
    countdown.hidden = false;
    countdown.textContent = 'PAUSED';
  } else if (snapshot.phase === 'finished') {
    countdown.hidden = false;
    countdown.textContent = ordinal(snapshot.playerPosition).toUpperCase();
  } else {
    countdown.hidden = true;
  }

  if (snapshot.phase !== previousPhase) {
    if (snapshot.phase === 'running') liveStatus.textContent = 'Go. The race is running.';
    else if (snapshot.phase === 'paused') liveStatus.textContent = 'Race paused.';
    else if (snapshot.phase === 'finished') {
      liveStatus.textContent = `Finished ${ordinal(snapshot.playerPosition)} in ${formatTime(snapshot.elapsed)}.`;
    }
    previousPhase = snapshot.phase;
  } else if (snapshot.phase === 'running' && snapshot.offRoad !== previousOffRoad) {
    liveStatus.textContent = snapshot.offRoad
      ? 'Off the painted track. Grip is reduced.'
      : 'Back on the painted track.';
  }
  previousOffRoad = snapshot.offRoad;
  pauseButton.textContent = snapshot.phase === 'paused' ? 'Resume race' : 'Pause race';
  pauseButton.setAttribute('aria-pressed', String(snapshot.phase === 'paused'));
}

function updateInterface(snapshot: RaceSnapshot): void {
  lapOutput.textContent = snapshot.playerLap.toString();
  positionOutput.textContent = ordinal(snapshot.playerPosition);
  timeOutput.textContent = formatTime(snapshot.elapsed);
  renderRunningOrder(snapshot);
  updateStatus(snapshot);
  shell.classList.toggle('off-road', snapshot.offRoad);
}

function frame(now: number): void {
  if (!active) return;
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000));
  previousTime = now;
  const snapshot = simulation.update(delta, input.snapshot());
  updateInterface(snapshot);
  stage?.render(snapshot, delta, now / 1000);
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
  liveStatus.textContent = `${mediumSelect.selectedOptions[0]?.textContent ?? 'Drawing'} medium applied.`;
});

for (const button of cameraButtons) {
  button.addEventListener('click', () => {
    cameraMode = button.dataset.camera === 'full' ? 'full' : 'follow';
    for (const candidate of cameraButtons) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    }
    stage?.setCameraMode(cameraMode);
    liveStatus.textContent = cameraMode === 'follow'
      ? 'Follow camera selected.'
      : 'Full course camera selected.';
  });
}

newRaceButton.addEventListener('click', () => {
  simulation.reset();
  previousOrder = '';
  previousCountdown = -1;
  canvas.focus({ preventScroll: true });
});

pauseButton.addEventListener('click', () => {
  simulation.togglePause();
  canvas.focus({ preventScroll: true });
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'p' || event.target instanceof HTMLSelectElement) return;
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
updateInterface(simulation.snapshot());
animationFrame = requestAnimationFrame(frame);
