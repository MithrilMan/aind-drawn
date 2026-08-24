import { MEDIUM_IDS, type MediumId } from '../../../src/index.js';
import { createCourseLayout } from './game/course.js';
import { InputController } from './game/input-controller.js';
import { MenuCharacterPreview } from './game/menu-character-preview.js';
import { createVehicleCollisionProfile } from './game/obstacle-collision.js';
import { RaceHud } from './game/race-hud.js';
import {
  DEFAULT_RACE_LAPS,
  RACE_LAP_OPTIONS,
  RaceSimulation,
  type DriveInput,
  type RaceLapCount,
} from './game/race-model.js';
import {
  RaceStage,
  type ExploreStageInteraction,
  type RaceCameraMode,
} from './game/race-stage.js';
import { createRaceWorldLayout } from './game/race-world.js';
import { RaceEngineAudioController } from './game/race-engine-audio.js';
import { SoundController } from './game/sound-controller.js';
import { VehicleInteractionPreview } from './game/vehicle-interaction-preview.js';
import {
  DEFAULT_VEHICLE_SEEDS,
  createPaperCircuitVehicleIdentity,
  type PaperCircuitVehicleId,
  type VehicleSeedSelection,
  type VehicleSelectionSummary,
} from './game/vehicle-field.js';
import { revealApplication } from '../../shared/app-boot.js';
import './style.css';

function requireElement<T extends Element>(selector: string, constructor: abstract new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const shell = requireElement('[data-race-shell]', HTMLElement);
const viewport = requireElement('[data-viewport]', HTMLElement);
const canvas = requireElement('[data-race-canvas]', HTMLCanvasElement);
const menuPreviewViewport = requireElement('[data-menu-preview-viewport]', HTMLElement);
const menuPreviewCanvas = requireElement('[data-menu-preview-canvas]', HTMLCanvasElement);
const mediumSelect = requireElement('[data-medium]', HTMLSelectElement);
const menuMediumSelect = requireElement('[data-menu-medium]', HTMLSelectElement);
const lapsSelect = requireElement('[data-laps]', HTMLSelectElement);
const gameMenu = requireElement('[data-game-menu]', HTMLElement);
const startRaceButton = requireElement('[data-start-race]', HTMLButtonElement);
const exploreGrandstandButton = requireElement('[data-explore-grandstand]', HTMLButtonElement);
const menuCharacter = requireElement('[data-menu-character]', HTMLElement);
const menuCharacterStatus = requireElement('[data-menu-character-status]', HTMLElement);
const rerollMenuButton = requireElement('[data-reroll-menu]', HTMLButtonElement);
const exploreHud = requireElement('[data-explore-hud]', HTMLElement);
const exploreCharacter = requireElement('[data-explore-character]', HTMLElement);
const exploreStatus = requireElement('[data-explore-status]', HTMLElement);
const vehicleInteractionCallout = requireElement('[data-vehicle-interaction]', HTMLElement);
const vehicleInteractionAction = requireElement('[data-vehicle-interaction-action]', HTMLElement);
const vehicleInteractionViewport = requireElement(
  '[data-vehicle-interaction-viewport]',
  HTMLElement,
);
const vehicleInteractionCanvas = requireElement(
  '[data-vehicle-interaction-canvas]',
  HTMLCanvasElement,
);
const resetExploreCameraButton = requireElement('[data-reset-explore-camera]', HTMLButtonElement);
const rerollExploreButton = requireElement('[data-reroll-explore]', HTMLButtonElement);
const exitExploreButton = requireElement('[data-exit-explore]', HTMLButtonElement);
const cameraButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-camera]')];
const newRaceButton = requireElement('[data-new-race]', HTMLButtonElement);
const pauseButton = requireElement('[data-pause]', HTMLButtonElement);
const rendererError = requireElement('[data-renderer-error]', HTMLElement);
const retryButton = requireElement('[data-retry]', HTMLButtonElement);
const soundToggleButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-sound-toggle]')];
const vehicleSelector = requireElement('[data-vehicle-selector]', HTMLDialogElement);
const vehicleSelectorPreviewViewport = requireElement(
  '[data-vehicle-selector-preview-viewport]',
  HTMLElement,
);
const vehicleSelectorPreviewCanvas = requireElement(
  '[data-vehicle-selector-preview-canvas]',
  HTMLCanvasElement,
);
const vehicleName = requireElement('[data-vehicle-name]', HTMLElement);
const vehicleArchetype = requireElement('[data-vehicle-archetype]', HTMLElement);
const vehicleSpec = requireElement('[data-vehicle-spec]', HTMLElement);
const vehicleFeatures = requireElement('[data-vehicle-features]', HTMLElement);
const previousVehicleButton = requireElement('[data-vehicle-previous]', HTMLButtonElement);
const surpriseVehicleButton = requireElement('[data-vehicle-surprise]', HTMLButtonElement);
const nextVehicleButton = requireElement('[data-vehicle-next]', HTMLButtonElement);

const course = createCourseLayout();
const world = createRaceWorldLayout(course);
const simulation = new RaceSimulation(course, world);
const input = new InputController(shell);
const hud = new RaceHud(shell);
const sound = new SoundController();
const engineSound = new RaceEngineAudioController();
const IDLE_INPUT: DriveInput = Object.freeze({
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  handbrake: false,
});
let stage: RaceStage | null = null;
let menuPreview: MenuCharacterPreview | null = null;
let vehicleInteractionPreview: VehicleInteractionPreview | null = null;
let vehicleConfiguratorPreview: VehicleInteractionPreview | null = null;
let medium: MediumId = 'oil';
let cameraMode: RaceCameraMode = 'follow';
let appMode: 'menu' | 'race' | 'explore' = 'menu';
let explorerSeed = createRandomSeed();
let menuPreviewElapsed = 0;
const MENU_CHARACTER_CHANGE_SECONDS = 10.8;
let previousTime = performance.now();
let animationFrame = 0;
let active = true;
let previousRacePhase = simulation.snapshot().phase;
let exploreEngineVehicleId: string | null = null;
let vehicleSeeds: VehicleSeedSelection = Object.freeze({ ...DEFAULT_VEHICLE_SEEDS });
let selectedVehicleId: PaperCircuitVehicleId | null = null;

function playMenuClick(): void {
  sound.play('menu-click');
}

function renderSoundState(): void {
  for (const button of soundToggleButtons) {
    button.textContent = sound.isEnabled ? 'SFX on' : 'SFX off';
    button.setAttribute('aria-pressed', String(sound.isEnabled));
    button.setAttribute(
      'aria-label',
      sound.isEnabled ? 'Mute sound effects' : 'Enable sound effects',
    );
  }
}

function startRenderer(): void {
  try {
    if (vehicleSelector.open) vehicleSelector.close();
    stage?.dispose();
    menuPreview?.dispose();
    vehicleInteractionPreview?.dispose();
    vehicleConfiguratorPreview?.dispose();
    stage = new RaceStage(
      canvas,
      viewport,
      course,
      world,
      medium,
      explorerSeed,
      vehicleSeeds,
      openVehicleSelector,
    );
    menuPreview = new MenuCharacterPreview(
      menuPreviewCanvas,
      menuPreviewViewport,
      world.grandstand,
      course,
      medium,
      explorerSeed,
    );
    vehicleInteractionPreview = new VehicleInteractionPreview(
      vehicleInteractionCanvas,
      vehicleInteractionViewport,
      medium,
    );
    vehicleConfiguratorPreview = new VehicleInteractionPreview(
      vehicleSelectorPreviewCanvas,
      vehicleSelectorPreviewViewport,
      medium,
      'paper-circuit:vehicle-configurator-preview',
    );
    stage.setCameraMode(cameraMode);
    stage.setMode(appMode);
    if (import.meta.env.DEV) {
      console.info('Paper Circuit render diagnostics', stage.diagnostics());
      console.info('Paper Circuit menu preview diagnostics', menuPreview.diagnostics());
    }
    rendererError.hidden = true;
  } catch (error) {
    if (appMode === 'race') simulation.pause();
    stage?.dispose();
    stage = null;
    menuPreview?.dispose();
    menuPreview = null;
    vehicleInteractionPreview?.dispose();
    vehicleInteractionPreview = null;
    vehicleConfiguratorPreview?.dispose();
    vehicleConfiguratorPreview = null;
    rendererError.hidden = false;
    hud.announce('The Doodle renderer failed to start. Retry is available.');
    console.error(error);
  }
}

function createRandomSeed(): number {
  const randomValues = new Uint32Array(1);
  globalThis.crypto.getRandomValues(randomValues);
  return randomValues[0] ?? 0;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderVehicleSelection(selection: VehicleSelectionSummary): void {
  vehicleName.textContent = selection.name === 'You' ? 'your car' : `${selection.name}'s car`;
  vehicleArchetype.textContent = titleCase(selection.archetype);
  vehicleSpec.textContent = `${selection.doors} doors · ${titleCase(selection.wheelStyle)} wheels`;
  vehicleFeatures.textContent = selection.features.length === 0
    ? 'No extra hardware'
    : selection.features.map(titleCase).join(' · ');
}

function openVehicleSelector(selection: VehicleSelectionSummary): void {
  if (appMode !== 'explore') {
    stage?.closeVehicleCustomizer();
    return;
  }
  selectedVehicleId = selection.vehicleId;
  renderVehicleSelection(selection);
  playMenuClick();
  if (!vehicleSelector.open) vehicleSelector.showModal();
  vehicleConfiguratorPreview?.show(
    stage?.vehicleConfiguratorPreview(selection.vehicleId) ?? null,
  );
  surpriseVehicleButton.focus({ preventScroll: true });
  hud.announce(`${selection.name}'s hood is open. Browse a procedural car build.`);
}

function applyVehicleSeed(seed: number): void {
  const vehicleId = selectedVehicleId;
  if (vehicleId === null || stage === null) return;
  try {
    const selection = stage.reseedVehicle(vehicleId, seed);
    vehicleSeeds = Object.freeze({ ...vehicleSeeds, [vehicleId]: seed });
    simulation.setCollisionProfile(
      vehicleId,
      createVehicleCollisionProfile(createPaperCircuitVehicleIdentity(vehicleId, seed)),
    );
    renderVehicleSelection(selection);
    vehicleConfiguratorPreview?.show(stage.vehicleConfiguratorPreview(vehicleId));
    playMenuClick();
    hud.announce(`${selection.name}'s ${selection.archetype} build is ready to inspect.`);
  } catch (error) {
    hud.announce('That car build could not be generated. The current car is still selected.');
    console.error(error);
  }
}

function adjacentVehicleSeed(direction: -1 | 1): void {
  const vehicleId = selectedVehicleId;
  if (vehicleId === null) return;
  applyVehicleSeed((vehicleSeeds[vehicleId] + direction) >>> 0);
}

function renderVehicleInteraction(
  interaction: ExploreStageInteraction | null,
  deltaSeconds: number,
): void {
  vehicleInteractionCallout.hidden = interaction === null;
  vehicleInteractionPreview?.show(interaction?.preview ?? null);
  if (interaction === null) return;
  vehicleInteractionAction.textContent = interaction.action;
  vehicleInteractionPreview?.render(deltaSeconds);
}

function frame(now: number): void {
  if (!active) return;
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000));
  previousTime = now;
  try {
    if (appMode === 'explore') {
      const exploreFrame = stage?.renderExplorer(input.snapshot(), delta);
      sound.syncDrift(exploreFrame?.drivingRacer?.drifting === true);
      sound.syncOffRoad(exploreFrame?.drivingOffRoad === true && (exploreFrame.drivingRacer?.speed ?? 0) > 3);
      sound.syncCurbImpact(exploreFrame?.drivingRacer?.curbImpact ?? 0);
      if (exploreFrame !== undefined) {
        const { explorer, drivingRacer, interaction } = exploreFrame;
        renderVehicleInteraction(interaction, delta);
        if (drivingRacer !== null) {
          if (exploreEngineVehicleId !== drivingRacer.id) {
            exploreEngineVehicleId = drivingRacer.id;
            engineSound.startFreeDrive(drivingRacer.id);
          }
          engineSound.syncFreeDrive(drivingRacer, input.snapshot(), delta);
          exploreCharacter.textContent = `Stolen ${drivingRacer.name}`;
          exploreStatus.textContent = `driving · ${Math.round(drivingRacer.speed * 6.2)} km/h`;
        } else {
          if (exploreEngineVehicleId !== null) {
            exploreEngineVehicleId = null;
            engineSound.stopRace();
          }
          exploreCharacter.textContent = `Random ${explorer.species}`;
          const surface = explorer.row < 0 ? 'ground' : `row ${explorer.row + 1}`;
          const action = explorer.pose === 'run' ? 'running' : explorer.pose;
          exploreStatus.textContent = `${action} · ${surface}`;
        }
      }
    } else {
      const driveInput = appMode === 'race' ? input.snapshot() : IDLE_INPUT;
      renderVehicleInteraction(null, delta);
      const snapshot = simulation.update(delta, driveInput);
      if (snapshot.phase !== previousRacePhase) {
        if (snapshot.phase === 'running') sound.play('race-go');
        else if (snapshot.phase === 'finished') sound.play('crowd-applause');
        previousRacePhase = snapshot.phase;
      }
      sound.syncDrift(appMode === 'race' && snapshot.phase === 'running' && snapshot.drifting);
      sound.syncOffRoad(appMode === 'race' && snapshot.phase === 'running' && snapshot.offRoad);
      sound.syncCurbImpact(
        appMode === 'race' && snapshot.phase === 'running'
          ? snapshot.racers.find(({ isPlayer }) => isPlayer)?.curbImpact ?? 0
          : 0,
      );
      engineSound.sync(snapshot, driveInput, delta);
      hud.render(snapshot);
      stage?.render(snapshot, delta);
      const preview = appMode === 'menu' ? menuPreview?.render(delta) : null;
      if (appMode === 'menu' && preview !== null && preview !== undefined) {
        menuCharacter.textContent = `Random ${preview.species}`;
        menuCharacterStatus.textContent = preview.pose === 'airborne'
          ? 'Jumping'
          : preview.pose === 'play' ? 'Celebrating'
            : preview.pose === 'dance' ? 'Dancing'
              : preview.pose === 'run' ? 'Running' : 'In motion';
        menuPreviewElapsed += delta;
        if (menuPreviewElapsed >= MENU_CHARACTER_CHANGE_SECONDS && stage !== null) {
          menuPreviewElapsed = 0;
          rerollExplorer(false);
        }
      }
    }
    if (vehicleSelector.open) vehicleConfiguratorPreview?.render(delta);
  } catch (error) {
    if (appMode === 'race') simulation.pause();
    stage?.dispose();
    stage = null;
    vehicleInteractionPreview?.show(null);
    vehicleInteractionCallout.hidden = true;
    rendererError.hidden = false;
    hud.announce('The Doodle renderer stopped during the race. Retry is available.');
    console.error(error);
  }
  animationFrame = requestAnimationFrame(frame);
}

function setAppMode(mode: 'menu' | 'race' | 'explore'): void {
  if (mode !== 'menu' || appMode !== 'menu') menuPreviewElapsed = 0;
  appMode = mode;
  if (mode !== 'explore' && vehicleSelector.open) vehicleSelector.close();
  if (mode !== 'explore') exploreEngineVehicleId = null;
  if (mode !== 'race') sound.syncDrift(false);
  if (mode !== 'race') sound.syncOffRoad(false);
  if (mode === 'menu') sound.syncCurbImpact(0);
  shell.classList.toggle('is-menu', mode === 'menu');
  shell.classList.toggle('is-race', mode === 'race');
  shell.classList.toggle('is-exploring', mode === 'explore');
  gameMenu.hidden = mode !== 'menu';
  exploreHud.hidden = mode !== 'explore';
  if (mode !== 'explore') renderVehicleInteraction(null, 0);
  stage?.setMode(mode);
}

function selectedLapCount(): RaceLapCount {
  const laps = Number(lapsSelect.value);
  return RACE_LAP_OPTIONS.includes(laps as RaceLapCount)
    ? laps as RaceLapCount
    : DEFAULT_RACE_LAPS;
}

function openMenu(): void {
  playMenuClick();
  simulation.openMenu();
  engineSound.stopRace();
  lapsSelect.value = DEFAULT_RACE_LAPS.toString();
  setAppMode('menu');
  hud.announce('Race setup ready. Choose your medium and lap count.');
}

function startRace(): void {
  playMenuClick();
  const laps = selectedLapCount();
  simulation.start({ laps });
  engineSound.startRace();
  setAppMode('race');
  hud.announce(`Race configured for ${laps} laps.`);
  canvas.focus({ preventScroll: true });
}

function startExplorer(): void {
  playMenuClick();
  simulation.openMenu();
  engineSound.stopRace();
  if (menuPreview !== null) {
    explorerSeed = menuPreview.currentSeed;
    stage?.setExplorerSeed(explorerSeed);
  }
  setAppMode('explore');
  hud.announce('Grandstand exploration started. Press E at a door to drive, or in front of a hood to customize.');
  canvas.focus({ preventScroll: true });
}

function rerollExplorer(playSound = true): void {
  if (stage === null) return;
  if (playSound) playMenuClick();
  if (appMode === 'menu') menuPreviewElapsed = 0;
  explorerSeed = createRandomSeed();
  if (appMode === 'menu') menuPreview?.reroll(explorerSeed);
  else stage.rerollExplorer(explorerSeed);
  sound.play('character-poof');
  hud.announce('A new random character is ready.');
  if (appMode === 'explore') canvas.focus({ preventScroll: true });
}

function resetExploreCamera(): void {
  if (appMode !== 'explore') return;
  playMenuClick();
  stage?.resetExplorerCamera();
  hud.announce('Explore camera reset.');
  canvas.focus({ preventScroll: true });
}

function dispose(): void {
  if (!active) return;
  active = false;
  if (vehicleSelector.open) vehicleSelector.close();
  cancelAnimationFrame(animationFrame);
  input.dispose();
  stage?.dispose();
  stage = null;
  menuPreview?.dispose();
  menuPreview = null;
  vehicleInteractionPreview?.dispose();
  vehicleInteractionPreview = null;
  vehicleConfiguratorPreview?.dispose();
  vehicleConfiguratorPreview = null;
  sound.dispose();
  engineSound.dispose();
}

function applyMedium(selected: string, label: string): void {
  if (!MEDIUM_IDS.includes(selected as MediumId)) return;
  medium = selected as MediumId;
  playMenuClick();
  mediumSelect.value = medium;
  menuMediumSelect.value = medium;
  try {
    stage?.setMedium(medium);
    menuPreview?.setMedium(medium);
    vehicleInteractionPreview?.setMedium(medium);
    vehicleConfiguratorPreview?.setMedium(medium);
  } catch (error) {
    if (appMode === 'race') simulation.pause();
    rendererError.hidden = false;
    hud.announce('The selected drawing medium failed to rebuild. Retry is available.');
    console.error(error);
    return;
  }
  hud.announce(`${label} medium applied.`);
  canvas.focus({ preventScroll: true });
}

mediumSelect.addEventListener('change', () => {
  applyMedium(mediumSelect.value, mediumSelect.selectedOptions[0]?.textContent ?? 'Drawing');
});

menuMediumSelect.addEventListener('change', () => {
  applyMedium(menuMediumSelect.value, menuMediumSelect.selectedOptions[0]?.textContent ?? 'Drawing');
});

startRaceButton.addEventListener('click', startRace);
exploreGrandstandButton.addEventListener('click', startExplorer);
resetExploreCameraButton.addEventListener('click', resetExploreCamera);
rerollExploreButton.addEventListener('click', () => {
  rerollExplorer();
});
rerollMenuButton.addEventListener('click', () => {
  rerollExplorer();
});
exitExploreButton.addEventListener('click', openMenu);
previousVehicleButton.addEventListener('click', () => {
  adjacentVehicleSeed(-1);
});
nextVehicleButton.addEventListener('click', () => {
  adjacentVehicleSeed(1);
});
surpriseVehicleButton.addEventListener('click', () => {
  const vehicleId = selectedVehicleId;
  if (vehicleId === null) return;
  let seed = createRandomSeed();
  if (seed === vehicleSeeds[vehicleId]) seed = (seed + 1) >>> 0;
  applyVehicleSeed(seed);
});
vehicleSelector.addEventListener('close', () => {
  vehicleConfiguratorPreview?.show(null);
  stage?.closeVehicleCustomizer();
  selectedVehicleId = null;
  if (active && appMode === 'explore') {
    hud.announce('Car build kept for the next race.');
    canvas.focus({ preventScroll: true });
  }
});

shell.addEventListener('pointerdown', () => {
  sound.unlock();
  engineSound.unlock();
}, { capture: true });
window.addEventListener('keydown', () => {
  sound.unlock();
  engineSound.unlock();
}, { capture: true, once: true });
for (const button of soundToggleButtons) {
  button.addEventListener('click', () => {
    if (sound.isEnabled) sound.play('menu-click');
    sound.unlock();
    const enabled = sound.toggle();
    engineSound.setEnabled(enabled);
    renderSoundState();
  });
}
renderSoundState();

/* Keep the old direct selector out of the state machine: the menu is the
 * authoritative start surface, while the in-race selector remains a quick
 * medium switch for an already-running session. */
if (mediumSelect.value !== medium) {
  mediumSelect.value = medium;
  menuMediumSelect.value = medium;
}

/* Camera and pause controls only affect an active race. */
for (const button of cameraButtons) {
  button.addEventListener('click', () => {
    if (appMode !== 'race') return;
    playMenuClick();
    cameraMode = button.dataset.camera === 'full' ? 'full' : 'follow';
    for (const candidate of cameraButtons) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    }
    stage?.setCameraMode(cameraMode);
    hud.announce(cameraMode === 'follow' ? 'Follow camera selected.' : 'Full course map selected.');
    canvas.focus({ preventScroll: true });
  });
}

newRaceButton.addEventListener('click', openMenu);

pauseButton.addEventListener('click', () => {
  if (appMode !== 'race') return;
  playMenuClick();
  simulation.togglePause();
  canvas.focus({ preventScroll: true });
});

window.addEventListener('keydown', (event) => {
  const editable = event.target instanceof HTMLInputElement
    || event.target instanceof HTMLSelectElement
    || event.target instanceof HTMLTextAreaElement;
  if (editable) return;
  const key = event.key.toLowerCase();
  if ((key === 'escape' || key === 'm') && appMode !== 'menu') {
    openMenu();
    event.preventDefault();
    return;
  }
  if (key === 'r' && appMode === 'explore') {
    resetExploreCamera();
    event.preventDefault();
    return;
  }
  if (key === 'n' && (appMode === 'explore' || appMode === 'menu')) {
    rerollExplorer();
    event.preventDefault();
    return;
  }
  if (key !== 'p' || appMode !== 'race') return;
  simulation.togglePause();
  event.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && appMode === 'race') simulation.pause();
});

retryButton.addEventListener('click', () => {
  playMenuClick();
  startRenderer();
});
window.addEventListener('beforeunload', dispose);
if (import.meta.hot !== undefined) import.meta.hot.dispose(dispose);

startRenderer();
setAppMode('menu');
hud.render(simulation.snapshot());
animationFrame = requestAnimationFrame(frame);
requestAnimationFrame(() => {
  revealApplication(shell);
});
