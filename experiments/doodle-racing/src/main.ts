import { MEDIUM_IDS, type MediumId } from '../../../src/index.js';
import {
  toDriveInput,
  toExploreCameraInput,
  toExploreInput,
  type ControlSnapshot,
} from './game/controls.js';
import { createCourseLayout } from './game/course.js';
import { InputController } from './game/input-controller.js';
import type { ExploreEntrancePhase } from './game/explore-entrance.js';
import { MenuCharacterPreview } from './game/menu-character-preview.js';
import { MediumVehicleGallery } from './game/medium-vehicle-gallery.js';
import { createVehicleCollisionProfile } from './game/obstacle-collision.js';
import { RaceHud } from './game/race-hud.js';
import { RaceMinimap } from './game/race-minimap.js';
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
const minimapCanvas = requireElement('[data-race-minimap]', HTMLCanvasElement);
const menuPreviewViewport = requireElement('[data-menu-preview-viewport]', HTMLElement);
const menuPreviewCanvas = requireElement('[data-menu-preview-canvas]', HTMLCanvasElement);
const mediumThumbnailViewport = requireElement('[data-medium-thumbnail-viewport]', HTMLElement);
const mediumThumbnailCanvas = requireElement('[data-medium-thumbnail-canvas]', HTMLCanvasElement);
const mediumSelect = requireElement('[data-medium]', HTMLSelectElement);
const menuMediumInputs = [...document.querySelectorAll<HTMLInputElement>('[data-menu-medium]')];
const mediumThumbnailImages = new Map<MediumId, HTMLImageElement>(
  [...document.querySelectorAll<HTMLImageElement>('[data-medium-thumbnail]')].map((image) => {
    const candidate = image.dataset.mediumThumbnail;
    if (!MEDIUM_IDS.includes(candidate as MediumId)) {
      throw new Error(`Unknown medium thumbnail target: ${candidate ?? 'missing'}`);
    }
    return [candidate as MediumId, image];
  }),
);
const lapInputs = [...document.querySelectorAll<HTMLInputElement>('[data-laps]')];
const gameMenu = requireElement('[data-game-menu]', HTMLElement);
const startRaceButton = requireElement('[data-start-race]', HTMLButtonElement);
const startRaceDetail = requireElement('[data-start-race-detail]', HTMLElement);
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
const touchBackButton = requireElement('[data-touch-back]', HTMLButtonElement);
const touchPrimaryButton = requireElement('[data-touch-primary]', HTMLButtonElement);
const routeDebugButton = requireElement('[data-route-debug]', HTMLButtonElement);
const routeDebugLegend = requireElement('[data-route-debug-legend]', HTMLElement);

const course = createCourseLayout();
const world = createRaceWorldLayout(course);
const simulation = new RaceSimulation(course, world);
const input = new InputController(shell, canvas);
const hud = new RaceHud(shell);
const minimap = new RaceMinimap(course, minimapCanvas);
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
let mediumGallery: MediumVehicleGallery | null = null;
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
let exploreControlsEnabled = false;
let vehicleSeeds: VehicleSeedSelection = Object.freeze({ ...DEFAULT_VEHICLE_SEEDS });
let selectedVehicleId: PaperCircuitVehicleId | null = null;
let routeDebugEnabled = false;

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

function renderRouteDebugState(): void {
  routeDebugButton.setAttribute('aria-pressed', String(routeDebugEnabled));
  routeDebugButton.textContent = routeDebugEnabled ? 'Hide debug' : 'Debug path';
  routeDebugLegend.hidden = !routeDebugEnabled;
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
    if (mediumGallery === null) {
      mediumGallery = new MediumVehicleGallery(
        mediumThumbnailCanvas,
        mediumThumbnailViewport,
        mediumThumbnailImages,
      );
      void mediumGallery.render().catch((error: unknown) => {
        mediumGallery = null;
        console.error('Paper Circuit medium gallery failed to render', error);
      });
    }
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
    stage.setRouteDebugVisible(routeDebugEnabled);
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
  vehicleInteractionPreview?.show(
    interaction?.preview ?? null,
    interaction?.cameraOffsetDirection,
  );
  if (interaction === null) return;
  vehicleInteractionAction.textContent = interaction.action;
  vehicleInteractionPreview?.render(deltaSeconds, interaction.cameraOffsetDirection);
}

function exploreEntranceStatus(phase: ExploreEntrancePhase): string {
  switch (phase) {
    case 'materializing': return 'appearing in smoke';
    case 'coughing': return 'coughing through the smoke';
    case 'discovering': return 'taking in the circuit';
    case 'celebrating': return 'excited to explore';
    case 'approaching': return 'running to the grandstand';
    case 'complete': return 'ready';
  }
}

function handleControlActions(controls: ControlSnapshot): void {
  if (controls.actions.menu.pressed && appMode !== 'menu') {
    openMenu();
    return;
  }
  if (controls.actions.pause.pressed && appMode === 'race') simulation.togglePause();
  if (controls.actions['reset-camera'].pressed && appMode === 'explore') resetExploreCamera();
  if (controls.actions.reroll.pressed && (appMode === 'explore' || appMode === 'menu')) {
    rerollExplorer();
  }
}

function frame(now: number): void {
  if (!active) return;
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000));
  previousTime = now;
  try {
    const controls = input.snapshot();
    handleControlActions(controls);
    if (appMode === 'explore') {
      const exploreInput = toExploreInput(controls);
      const exploreFrame = stage?.renderExplorer(
        exploreInput,
        toExploreCameraInput(controls),
        delta,
      );
      sound.syncDrift(exploreFrame?.drivingRacer?.drifting === true);
      sound.syncOffRoad(exploreFrame?.drivingOffRoad === true && (exploreFrame.drivingRacer?.speed ?? 0) > 3);
      sound.syncCurbImpact(exploreFrame?.drivingRacer?.curbImpact ?? 0);
      if (exploreFrame !== undefined) {
        const {
          explorer,
          drivingRacer,
          interaction,
          entrancePhase,
          controlsEnabled,
        } = exploreFrame;
        resetExploreCameraButton.disabled = !controlsEnabled;
        rerollExploreButton.disabled = !controlsEnabled;
        if (controlsEnabled && !exploreControlsEnabled) {
          hud.announce('You have control. Explore the grandstand or approach a car.');
          canvas.focus({ preventScroll: true });
        }
        exploreControlsEnabled = controlsEnabled;
        renderVehicleInteraction(interaction, delta);
        if (drivingRacer !== null) {
          if (exploreEngineVehicleId !== drivingRacer.id) {
            exploreEngineVehicleId = drivingRacer.id;
            engineSound.startFreeDrive(drivingRacer.id);
          }
          engineSound.syncFreeDrive(drivingRacer, exploreInput, delta);
          exploreCharacter.textContent = `Stolen ${drivingRacer.name}`;
          exploreStatus.textContent = `driving · ${Math.round(drivingRacer.speed * 6.2)} km/h`;
        } else {
          if (exploreEngineVehicleId !== null) {
            exploreEngineVehicleId = null;
            engineSound.stopRace();
          }
          if (!controlsEnabled && entrancePhase !== null) {
            exploreCharacter.textContent = 'New arrival';
            exploreStatus.textContent = exploreEntranceStatus(entrancePhase);
          } else {
            exploreCharacter.textContent = 'Random person';
            const surface = explorer.row < 0 ? 'ground' : `row ${explorer.row + 1}`;
            const action = explorer.pose === 'run' ? 'running' : explorer.pose;
            exploreStatus.textContent = `${action} · ${surface}`;
          }
        }
      }
    } else {
      const driveInput = appMode === 'race' ? toDriveInput(controls) : IDLE_INPUT;
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
      minimap.render(snapshot);
      stage?.render(snapshot, delta);
      const preview = appMode === 'menu' ? menuPreview?.render(delta) : null;
      if (appMode === 'menu' && preview !== null && preview !== undefined) {
        menuCharacter.textContent = 'Random person';
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
  touchBackButton.textContent = mode === 'explore' ? 'Back' : 'Brake';
  touchBackButton.setAttribute('aria-label', mode === 'explore' ? 'Move backward' : 'Brake');
  touchPrimaryButton.textContent = mode === 'explore' ? 'Jump' : 'Drift';
  touchPrimaryButton.setAttribute('aria-label', mode === 'explore' ? 'Jump' : 'Drift');
  gameMenu.hidden = mode !== 'menu';
  exploreHud.hidden = mode !== 'explore';
  exploreControlsEnabled = false;
  resetExploreCameraButton.disabled = mode === 'explore';
  rerollExploreButton.disabled = mode === 'explore';
  if (mode !== 'explore') renderVehicleInteraction(null, 0);
  stage?.setMode(mode);
}

function selectedLapCount(): RaceLapCount {
  const laps = Number(lapInputs.find(({ checked }) => checked)?.value);
  return RACE_LAP_OPTIONS.includes(laps as RaceLapCount)
    ? laps as RaceLapCount
    : DEFAULT_RACE_LAPS;
}

function renderLapSelection(): void {
  startRaceDetail.textContent = `Lights out / ${selectedLapCount()} laps`;
}

function openMenu(): void {
  playMenuClick();
  simulation.openMenu();
  engineSound.stopRace();
  for (const input of lapInputs) input.checked = input.value === DEFAULT_RACE_LAPS.toString();
  renderLapSelection();
  setAppMode('menu');
  hud.announce('Race setup ready. Choose your medium and lap count.');
}

function startRace(): void {
  playMenuClick();
  const laps = selectedLapCount();
  try {
    stage?.rerollCrowd(createRandomSeed());
  } catch (error) {
    rendererError.hidden = false;
    hud.announce('The crowd failed to rebuild. Retry is available.');
    console.error(error);
    return;
  }
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
  sound.play('character-poof');
  hud.announce('A new explorer is arriving at the circuit.');
  canvas.focus({ preventScroll: true });
}

function rerollExplorer(playSound = true): void {
  if (stage === null) return;
  if (playSound) playMenuClick();
  if (appMode === 'menu') menuPreviewElapsed = 0;
  const nextSeed = createRandomSeed();
  if (appMode === 'menu') {
    explorerSeed = nextSeed;
    menuPreview?.reroll(explorerSeed);
  } else if (appMode === 'explore') {
    if (!stage.rerollExplorer(nextSeed)) {
      hud.announce('Wait until the explorer has arrived before changing character.');
      return;
    }
    explorerSeed = nextSeed;
  }
  sound.play('character-poof');
  hud.announce('A new random character is ready.');
  if (appMode === 'explore') canvas.focus({ preventScroll: true });
}

function resetExploreCamera(): void {
  if (appMode !== 'explore') return;
  if (stage?.resetExplorerCamera() !== true) {
    hud.announce('Camera control unlocks when the entrance is complete.');
    return;
  }
  playMenuClick();
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
  mediumGallery?.dispose();
  mediumGallery = null;
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
  for (const input of menuMediumInputs) input.checked = input.value === medium;
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
  if (appMode !== 'menu') canvas.focus({ preventScroll: true });
}

mediumSelect.addEventListener('change', () => {
  applyMedium(mediumSelect.value, mediumSelect.selectedOptions[0]?.textContent ?? 'Drawing');
});

for (const input of menuMediumInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    const label = input.closest('label')?.querySelector(':scope > span:last-child')?.textContent
      ?? 'Drawing';
    applyMedium(input.value, label);
  });
}

for (const input of lapInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    playMenuClick();
    renderLapSelection();
    hud.announce(`${selectedLapCount()} lap race selected.`);
  });
}

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
    if (appMode !== 'menu') canvas.focus({ preventScroll: true });
  });
}
renderSoundState();

routeDebugButton.addEventListener('click', () => {
  if (appMode !== 'race') return;
  playMenuClick();
  routeDebugEnabled = !routeDebugEnabled;
  stage?.setRouteDebugVisible(routeDebugEnabled);
  renderRouteDebugState();
  hud.announce(
    routeDebugEnabled
      ? 'Route debug enabled. Amber is valid road; green is covered this lap.'
      : 'Route debug hidden.',
  );
  canvas.focus({ preventScroll: true });
});
renderRouteDebugState();

/* Keep the old direct selector out of the state machine: the menu is the
 * authoritative start surface, while the in-race selector remains a quick
 * medium switch for an already-running session. */
if (mediumSelect.value !== medium) {
  mediumSelect.value = medium;
}
for (const input of menuMediumInputs) input.checked = input.value === medium;
renderLapSelection();

/* Camera and pause controls only affect an active race. */
for (const button of cameraButtons) {
  button.addEventListener('click', () => {
    if (appMode !== 'race') return;
    playMenuClick();
    cameraMode = button.dataset.camera === 'aerial' ? 'aerial' : 'follow';
    for (const candidate of cameraButtons) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    }
    stage?.setCameraMode(cameraMode);
    hud.announce(cameraMode === 'follow'
      ? 'Follow camera selected.'
      : 'Aerial driving camera selected.');
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
minimap.render(simulation.snapshot());
animationFrame = requestAnimationFrame(frame);
requestAnimationFrame(() => {
  revealApplication(shell);
});
