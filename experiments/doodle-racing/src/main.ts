import type { MediumId } from '../../../src/index.js';
import { FrameRateMeter } from '@mithrilman/aind-game-runtime';
import {
  CONTROL_ACTION_IDS,
  toDriveInput,
  toExploreCameraInput,
  toExploreInput,
  type ControlSnapshot,
} from './game/controls.js';
import { createCourseLayout } from './game/course.js';
import {
  MENU_GAME_STATE,
  exploreGameState,
  pausedGameState,
  raceGameState,
  resolveGlobalControlCommand,
  type GlobalControlActionId,
  type PaperCircuitGameState,
} from './game/game-state.js';
import { ControlFocusNavigator } from './game/control-focus-navigator.js';
import { ControlHintPresenter } from './game/control-hint-presenter.js';
import { InputController } from './game/input-controller.js';
import type { ExploreEntrancePhase } from './game/explore-entrance.js';
import { MenuCharacterPreview } from './game/menu-character-preview.js';
import { MediumVehicleGallery } from './game/medium-vehicle-gallery.js';
import {
  isPaperCircuitMedium,
  nextPaperCircuitMedium,
  type PaperCircuitMediumId,
} from './game/drawing-medium.js';
import { MenuSettingsStore } from './game/menu-settings.js';
import { MusicController } from './game/music-controller.js';
import { createVehicleCollisionProfile } from './game/vehicle-collision-profile.js';
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
  PAPER_CIRCUIT_VEHICLES,
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
const menuMediumInputs = [...document.querySelectorAll<HTMLInputElement>('[data-menu-medium]')];
const mediumThumbnailImages = new Map<MediumId, HTMLImageElement>(
  [...document.querySelectorAll<HTMLImageElement>('[data-medium-thumbnail]')].map((image) => {
    const candidate = image.dataset.mediumThumbnail;
    if (candidate === undefined || !isPaperCircuitMedium(candidate)) {
      throw new Error(`Unknown medium thumbnail target: ${candidate ?? 'missing'}`);
    }
    return [candidate, image];
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
const openPauseButton = requireElement('[data-open-pause]', HTMLButtonElement);
const rendererError = requireElement('[data-renderer-error]', HTMLDialogElement);
const retryButton = requireElement('[data-retry]', HTMLButtonElement);
const soundToggleButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-sound-toggle]')];
const musicToggleButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-music-toggle]')];
const openAudioSettingsButtons = [
  ...document.querySelectorAll<HTMLButtonElement>('[data-open-audio-settings]'),
];
const audioSummaryElements = [...document.querySelectorAll<HTMLElement>('[data-audio-summary]')];
const audioSettingsDialog = requireElement('[data-audio-settings]', HTMLDialogElement);
const closeAudioSettingsButton = requireElement('[data-audio-settings-close]', HTMLButtonElement);
const musicVolumeInput = requireElement('[data-music-volume]', HTMLInputElement);
const musicVolumeOutput = requireElement('[data-music-volume-output]', HTMLOutputElement);
const sfxVolumeInput = requireElement('[data-sfx-volume]', HTMLInputElement);
const sfxVolumeOutput = requireElement('[data-sfx-volume-output]', HTMLOutputElement);
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
const closeVehicleButton = requireElement('[data-vehicle-close]', HTMLButtonElement);
const keepVehicleButton = requireElement('[data-vehicle-keep]', HTMLButtonElement);
const pauseMenu = requireElement('[data-pause-menu]', HTMLDialogElement);
const resumeButton = requireElement('[data-pause-resume]', HTMLButtonElement);
const pauseMainMenuButton = requireElement('[data-pause-main-menu]', HTMLButtonElement);
const pauseCameraButton = requireElement('[data-pause-camera]', HTMLButtonElement);
const pauseExploreCameraButton = requireElement('[data-pause-explore-camera]', HTMLButtonElement);
const pauseExploreRerollButton = requireElement('[data-pause-explore-reroll]', HTMLButtonElement);
const pauseMediumButton = requireElement('[data-pause-medium]', HTMLButtonElement);
const pauseDebugButton = requireElement('[data-pause-debug]', HTMLButtonElement);
const touchBackButton = requireElement('[data-touch-back]', HTMLButtonElement);
const touchPrimaryButton = requireElement('[data-touch-primary]', HTMLButtonElement);
const routeDebugLegend = requireElement('[data-route-debug-legend]', HTMLElement);
const debugPerformance = requireElement('[data-debug-performance]', HTMLOutputElement);
const debugFps = requireElement('[data-debug-fps]', HTMLElement);
const debugFrameTime = requireElement('[data-debug-frame-time]', HTMLElement);

const course = createCourseLayout();
const world = createRaceWorldLayout(course);
const simulation = new RaceSimulation(course, world);
const input = new InputController(shell, canvas);
const focusNavigator = new ControlFocusNavigator();
const controlHints = new ControlHintPresenter(shell);
const hud = new RaceHud(shell);
const frameRate = new FrameRateMeter();
const minimap = new RaceMinimap(course, minimapCanvas);
const menuSettings = new MenuSettingsStore();
const savedMenuSettings = menuSettings.load();
const sound = new SoundController();
sound.setEnabled(savedMenuSettings.sfx);
sound.setVolume(savedMenuSettings.sfxVolume);
const music = new MusicController();
music.setEnabled(savedMenuSettings.music);
music.setVolume(savedMenuSettings.musicVolume);
const engineSound = new RaceEngineAudioController();
engineSound.setEnabled(savedMenuSettings.sfx);
engineSound.setVolume(savedMenuSettings.sfxVolume);
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
let medium: PaperCircuitMediumId = savedMenuSettings.medium;
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
let pauseReturnMode: 'race' | 'explore' | null = null;
let restoreVehicleFocus = true;
let audioUnlocked = false;
let audioSettingsReturnSurface: 'menu' | 'pause' | null = null;
let audioSettingsOpener: HTMLButtonElement | null = null;
let rendererRecoveryPauseMode: 'race' | 'explore' | null = null;
let resumeRaceAfterRendererRecovery = false;
let suppressNextGlobalAction = false;

function playMenuClick(): void {
  sound.play('menu-click');
}

function unlockAudio(): void {
  audioUnlocked = true;
  sound.unlock();
  music.unlock();
  engineSound.unlock();
}

function persistMenuSettings(): void {
  menuSettings.save({
    medium,
    laps: selectedLapCount(),
    music: music.isEnabled,
    musicVolume: music.currentVolume,
    sfx: sound.isEnabled,
    sfxVolume: sound.currentVolume,
  });
}

function percentage(volume: number): number {
  return Math.round(volume * 100);
}

function renderAudioSettingsState(): void {
  const musicPercentage = percentage(music.currentVolume);
  const sfxPercentage = percentage(sound.currentVolume);
  musicVolumeInput.value = musicPercentage.toString();
  musicVolumeOutput.value = `${musicPercentage}%`;
  sfxVolumeInput.value = sfxPercentage.toString();
  sfxVolumeOutput.value = `${sfxPercentage}%`;
  const summary = `${music.isEnabled ? `Music ${musicPercentage}%` : 'Music off'} · ${
    sound.isEnabled ? `SFX ${sfxPercentage}%` : 'SFX off'
  }`;
  for (const element of audioSummaryElements) element.textContent = summary;
  for (const button of openAudioSettingsButtons) {
    button.setAttribute('aria-label', `Open audio settings. ${summary}.`);
  }
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
  renderAudioSettingsState();
}

function renderMusicState(): void {
  for (const button of musicToggleButtons) {
    button.textContent = music.isEnabled ? 'Music on' : 'Music off';
    button.setAttribute('aria-pressed', String(music.isEnabled));
    button.setAttribute(
      'aria-label',
      music.isEnabled ? 'Mute music' : 'Enable music',
    );
  }
  renderAudioSettingsState();
}

function openAudioSettings(opener: HTMLButtonElement): void {
  if (audioSettingsDialog.open || rendererError.open || vehicleSelector.open) return;
  playMenuClick();
  audioSettingsOpener = opener;
  audioSettingsReturnSurface = pauseMenu.open ? 'pause' : 'menu';
  if (pauseMenu.open) pauseMenu.close();
  audioSettingsDialog.showModal();
  focusNavigator.activate(
    audioSettingsDialog,
    musicToggleButtons[0] ?? closeAudioSettingsButton,
    !document.hidden,
  );
}

function closeAudioSettings(): void {
  if (!audioSettingsDialog.open) return;
  audioSettingsDialog.close();
  const returnSurface = audioSettingsReturnSurface;
  const opener = audioSettingsOpener;
  audioSettingsReturnSurface = null;
  audioSettingsOpener = null;
  if (returnSurface === 'pause' && pauseReturnMode !== null) {
    pauseMenu.showModal();
    const target = opener ?? resumeButton;
    if (!document.hidden) target.focus({ preventScroll: true });
    focusNavigator.activate(pauseMenu, target, !document.hidden);
  } else if (appMode === 'menu') {
    const target = opener ?? startRaceButton;
    if (!document.hidden) target.focus({ preventScroll: true });
    focusNavigator.activate(gameMenu, target, !document.hidden);
  } else {
    restoreGameplayFocus();
  }
}

function restoreGameplayFocus(): void {
  if (
    active
    && appMode !== 'menu'
    && !pauseMenu.open
    && !audioSettingsDialog.open
    && !vehicleSelector.open
    && !rendererError.open
  ) {
    canvas.focus({ preventScroll: true });
  }
}

function renderRouteDebugState(): void {
  const debugActive = routeDebugEnabled && appMode === 'race';
  routeDebugLegend.hidden = !debugActive;
  debugPerformance.hidden = !debugActive;
  pauseDebugButton.textContent = `Debug path: ${routeDebugEnabled ? 'On' : 'Off'}`;
}

function toggleRouteDebug(): void {
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
  restoreGameplayFocus();
}

function startRenderer(): void {
  try {
    if (vehicleSelector.open) closeVehicleSelector(false);
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
      Object.freeze({
        instanceId: 'paper-circuit:vehicle-configurator-preview',
        cacheCapacity: PAPER_CIRCUIT_VEHICLES.length,
      }),
    );
    vehicleInteractionPreview.prewarm(stage.vehicleInteractionPreviews());
    vehicleConfiguratorPreview.prewarm(stage.vehicleConfiguratorPreviews());
    stage.setCameraMode(cameraMode);
    stage.setMode(appMode);
    stage.setRouteDebugVisible(routeDebugEnabled);
    if (import.meta.env.DEV) {
      console.info('Paper Circuit render diagnostics', stage.diagnostics());
      console.info('Paper Circuit menu preview diagnostics', menuPreview.diagnostics());
    }
    if (rendererError.open) rendererError.close();
    const recoveryPauseMode = rendererRecoveryPauseMode;
    const shouldResumeRace = resumeRaceAfterRendererRecovery;
    rendererRecoveryPauseMode = null;
    resumeRaceAfterRendererRecovery = false;
    if (recoveryPauseMode !== null && appMode === recoveryPauseMode) openPauseMenu();
    else {
      if (shouldResumeRace && appMode === 'race') simulation.resume();
      activateCurrentFocusSurface();
      restoreGameplayFocus();
    }
  } catch (error) {
    stage?.dispose();
    stage = null;
    menuPreview?.dispose();
    menuPreview = null;
    vehicleInteractionPreview?.dispose();
    vehicleInteractionPreview = null;
    vehicleConfiguratorPreview?.dispose();
    vehicleConfiguratorPreview = null;
    showRendererError();
    hud.announce('The Doodle renderer failed to start. Retry is available.');
    console.error(error);
  }
}

function showRendererError(): void {
  rendererRecoveryPauseMode = pauseReturnMode;
  resumeRaceAfterRendererRecovery = appMode === 'race' && pauseReturnMode === null;
  if (appMode === 'race') simulation.pause();
  if (vehicleSelector.open) closeVehicleSelector(false);
  if (pauseMenu.open) closePauseMenu(false);
  if (!rendererError.open) rendererError.showModal();
  focusNavigator.activate(rendererError, retryButton, !document.hidden);
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
  focusNavigator.activate(vehicleSelector, surpriseVehicleButton);
  hud.announce(`${selection.name}'s hood is open. Browse a procedural car build.`);
}

function closeVehicleSelector(restoreFocus = true): void {
  restoreVehicleFocus = restoreFocus;
  if (vehicleSelector.open) vehicleSelector.close();
  else {
    stage?.closeVehicleCustomizer();
    selectedVehicleId = null;
    if (restoreFocus) restoreGameplayFocus();
  }
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
    vehicleInteractionPreview?.prewarm(stage.vehicleInteractionPreviews());
    vehicleConfiguratorPreview?.prewarm(stage.vehicleConfiguratorPreviews());
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

function currentGameState(): PaperCircuitGameState {
  if (pauseReturnMode !== null) return pausedGameState(pauseReturnMode);
  if (appMode === 'menu') return MENU_GAME_STATE;
  if (appMode === 'race') return raceGameState(simulation.currentPhase);
  return stage?.gameState() ?? exploreGameState('unavailable');
}

function activateCurrentFocusSurface(focus = true): void {
  if (audioSettingsDialog.open) {
    focusNavigator.activate(
      audioSettingsDialog,
      musicToggleButtons[0] ?? closeAudioSettingsButton,
      focus,
    );
  } else if (rendererError.open) {
    focusNavigator.activate(rendererError, retryButton, focus);
  } else if (pauseMenu.open) {
    focusNavigator.activate(pauseMenu, resumeButton, focus);
  } else if (vehicleSelector.open) {
    focusNavigator.activate(vehicleSelector, surpriseVehicleButton, focus);
  } else if (appMode === 'menu') {
    focusNavigator.activate(gameMenu, startRaceButton, focus);
  } else {
    focusNavigator.reset();
  }
}

function renderPauseSettings(): void {
  pauseCameraButton.hidden = appMode !== 'race';
  pauseDebugButton.hidden = appMode !== 'race';
  pauseExploreCameraButton.hidden = appMode !== 'explore';
  pauseExploreRerollButton.hidden = appMode !== 'explore';
  pauseExploreCameraButton.disabled = !exploreControlsEnabled;
  pauseExploreRerollButton.disabled = !exploreControlsEnabled || exploreEngineVehicleId !== null;
  pauseCameraButton.textContent = `Camera: ${cameraMode === 'follow' ? 'Follow' : 'Aerial'}`;
  pauseMediumButton.textContent = `Medium: ${titleCase(medium)}`;
}

function openPauseMenu(): void {
  if (appMode === 'menu' || rendererError.open || pauseMenu.open || audioSettingsDialog.open) return;
  if (vehicleSelector.open) closeVehicleSelector(false);
  pauseReturnMode = appMode;
  if (appMode === 'race') simulation.pause();
  sound.syncDrift(false);
  sound.syncOffRoad(false);
  sound.syncCurbImpact(0);
  engineSound.setPaused(true);
  music.setPaused(true);
  shell.classList.add('is-paused');
  renderPauseSettings();
  pauseMenu.showModal();
  focusNavigator.activate(pauseMenu, resumeButton, !document.hidden);
  hud.announce('Game paused. Resume, adjust audio, or return to the main menu.');
}

function closePauseMenu(restoreFocus = true): void {
  if (pauseMenu.open) pauseMenu.close();
  if (pauseReturnMode === 'race') simulation.resume();
  pauseReturnMode = null;
  shell.classList.remove('is-paused');
  engineSound.setPaused(false);
  music.setPaused(false);
  if (restoreFocus) restoreGameplayFocus();
  else focusNavigator.reset();
}

function setCameraMode(mode: RaceCameraMode): void {
  cameraMode = mode;
  stage?.setCameraMode(cameraMode);
  renderPauseSettings();
  hud.announce(cameraMode === 'follow'
    ? 'Follow camera selected.'
    : 'Aerial driving camera selected.');
}

function useCameraAction(): void {
  if (appMode === 'race') {
    playMenuClick();
    setCameraMode(cameraMode === 'follow' ? 'aerial' : 'follow');
  } else if (appMode === 'explore') {
    resetExploreCamera();
  }
}

function cycleMedium(): void {
  const next = nextPaperCircuitMedium(medium);
  applyMedium(next, titleCase(next));
  renderPauseSettings();
}

function handleControlActions(controls: ControlSnapshot): boolean {
  if (rendererError.open) return false;
  if (suppressNextGlobalAction) {
    suppressNextGlobalAction = false;
    if (controls.actions.back.pressed || controls.actions.pause.pressed) return true;
  }
  if (audioSettingsDialog.open) {
    if (controls.actions.back.pressed || controls.actions.pause.pressed) {
      closeAudioSettings();
      return true;
    }
    return false;
  }
  const actions: readonly GlobalControlActionId[] = ['back', 'pause', 'camera', 'reroll'];
  const gameState = currentGameState();
  for (const action of actions) {
    if (!controls.actions[action].pressed) continue;
    const command = resolveGlobalControlCommand(gameState, action);
    if (command === 'resume') {
      closePauseMenu();
      return true;
    }
    if (command === 'pause') {
      openPauseMenu();
      return true;
    }
    if (command === 'close-overlay') {
      closeVehicleSelector();
      return true;
    }
    if (command === 'camera') {
      useCameraAction();
      return false;
    }
    if (command === 'reroll') {
      rerollExplorer();
      return false;
    }
  }
  return false;
}

function handleEscapeKey(event: KeyboardEvent): void {
  if (event.code !== 'Escape' || event.repeat || rendererError.open) return;
  if (audioSettingsDialog.open) {
    event.preventDefault();
    suppressNextGlobalAction = true;
    closeAudioSettings();
  } else if (pauseMenu.open) {
    event.preventDefault();
    suppressNextGlobalAction = true;
    closePauseMenu();
  } else if (vehicleSelector.open) {
    event.preventDefault();
    suppressNextGlobalAction = true;
    closeVehicleSelector();
  }
}

function frame(now: number): void {
  if (!active) return;
  const frameDelta = Math.max(0, (now - previousTime) / 1000);
  const delta = Math.min(0.05, frameDelta);
  previousTime = now;
  if (frameRate.sampleFrame(frameDelta)) {
    debugFps.textContent = Math.round(frameRate.framesPerSecond).toString();
    debugFrameTime.textContent = frameRate.frameTimeMilliseconds.toFixed(1);
  }
  try {
    const controls = input.snapshot();
    if (!audioUnlocked && CONTROL_ACTION_IDS.some((action) => controls.actions[action].pressed)) {
      unlockAudio();
    }
    controlHints.update(input.lastActiveDevice);
    const surfaceChanged = handleControlActions(controls);
    if (!surfaceChanged) focusNavigator.update(controls, delta);
    if (audioSettingsDialog.open || pauseMenu.open || rendererError.open) {
      animationFrame = requestAnimationFrame(frame);
      return;
    }
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
      stage?.render(snapshot, delta, toExploreInput(controls));
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
    stage?.dispose();
    stage = null;
    vehicleInteractionPreview?.show(null);
    vehicleInteractionCallout.hidden = true;
    showRendererError();
    hud.announce('The Doodle renderer stopped during the race. Retry is available.');
    console.error(error);
  }
  animationFrame = requestAnimationFrame(frame);
}

function setAppMode(mode: 'menu' | 'race' | 'explore'): void {
  if (mode !== 'menu' || appMode !== 'menu') menuPreviewElapsed = 0;
  appMode = mode;
  music.setScene(mode === 'race' ? 'off' : mode);
  if (mode !== 'explore' && vehicleSelector.open) closeVehicleSelector(false);
  if (mode !== 'explore') exploreEngineVehicleId = null;
  if (mode !== 'race') sound.syncDrift(false);
  if (mode !== 'race') sound.syncOffRoad(false);
  if (mode === 'menu') sound.syncCurbImpact(0);
  shell.classList.toggle('is-menu', mode === 'menu');
  shell.classList.toggle('is-race', mode === 'race');
  shell.classList.toggle('is-exploring', mode === 'explore');
  touchBackButton.textContent = mode === 'explore' ? 'Back' : 'Brake';
  touchBackButton.setAttribute('aria-label', mode === 'explore' ? 'Move backward' : 'Brake');
  touchPrimaryButton.dataset.control = mode === 'race' ? 'drift-drive' : 'primary';
  touchPrimaryButton.textContent = mode === 'explore' ? 'Jump' : 'Drift';
  touchPrimaryButton.setAttribute(
    'aria-label',
    mode === 'explore' ? 'Jump' : 'Drift while accelerating',
  );
  gameMenu.hidden = mode !== 'menu';
  openPauseButton.hidden = mode === 'menu';
  exploreHud.hidden = mode !== 'explore';
  exploreControlsEnabled = false;
  activateCurrentFocusSurface();
  if (mode !== 'explore') renderVehicleInteraction(null, 0);
  stage?.setMode(mode);
  renderRouteDebugState();
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
  if (pauseMenu.open) closePauseMenu(false);
  if (vehicleSelector.open) closeVehicleSelector(false);
  playMenuClick();
  simulation.openMenu();
  engineSound.stopRace();
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
    showRendererError();
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
    if (!stage.rerollExplorer(nextSeed)) return;
    explorerSeed = nextSeed;
  }
  sound.play('character-poof');
  hud.announce('A new random character is ready.');
  if (appMode === 'explore') restoreGameplayFocus();
}

function resetExploreCamera(): void {
  if (appMode !== 'explore') return;
  if (stage?.resetExplorerCamera() !== true) {
    hud.announce('Camera control unlocks when the entrance is complete.');
    return;
  }
  playMenuClick();
  hud.announce('Explore camera reset.');
  restoreGameplayFocus();
}

function dispose(): void {
  if (!active) return;
  active = false;
  window.removeEventListener('keydown', handleEscapeKey, { capture: true });
  if (vehicleSelector.open) vehicleSelector.close();
  if (pauseMenu.open) pauseMenu.close();
  if (audioSettingsDialog.open) audioSettingsDialog.close();
  if (rendererError.open) rendererError.close();
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
  music.dispose();
  engineSound.dispose();
}

function applyMedium(selected: string, label: string): void {
  if (!isPaperCircuitMedium(selected)) return;
  medium = selected;
  playMenuClick();
  for (const input of menuMediumInputs) input.checked = input.value === medium;
  try {
    stage?.setMedium(medium);
    menuPreview?.setMedium(medium);
    vehicleInteractionPreview?.setMedium(medium);
    vehicleConfiguratorPreview?.setMedium(medium);
  } catch (error) {
    showRendererError();
    hud.announce('The selected drawing medium failed to rebuild. Retry is available.');
    console.error(error);
    return;
  }
  hud.announce(`${label} medium applied.`);
  persistMenuSettings();
  restoreGameplayFocus();
}

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
    persistMenuSettings();
    hud.announce(`${selectedLapCount()} lap race selected.`);
  });
}

startRaceButton.addEventListener('click', startRace);
exploreGrandstandButton.addEventListener('click', startExplorer);
rerollMenuButton.addEventListener('click', () => {
  rerollExplorer();
});
openPauseButton.addEventListener('click', openPauseMenu);
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
closeVehicleButton.addEventListener('click', () => {
  closeVehicleSelector();
});
keepVehicleButton.addEventListener('click', () => {
  closeVehicleSelector();
});
vehicleSelector.addEventListener('cancel', (event) => {
  event.preventDefault();
  suppressNextGlobalAction = true;
  closeVehicleSelector();
});
vehicleSelector.addEventListener('close', () => {
  vehicleConfiguratorPreview?.show(null);
  stage?.closeVehicleCustomizer();
  selectedVehicleId = null;
  if (active && appMode === 'explore') {
    hud.announce('Car build kept for the next race.');
    if (restoreVehicleFocus) restoreGameplayFocus();
  }
  restoreVehicleFocus = true;
});

resumeButton.addEventListener('click', () => {
  closePauseMenu();
});
pauseMainMenuButton.addEventListener('click', openMenu);
pauseCameraButton.addEventListener('click', () => {
  playMenuClick();
  setCameraMode(cameraMode === 'follow' ? 'aerial' : 'follow');
});
pauseExploreCameraButton.addEventListener('click', () => {
  resetExploreCamera();
  renderPauseSettings();
});
pauseExploreRerollButton.addEventListener('click', () => {
  rerollExplorer();
  renderPauseSettings();
});
pauseMediumButton.addEventListener('click', cycleMedium);
pauseDebugButton.addEventListener('click', toggleRouteDebug);
pauseMenu.addEventListener('cancel', (event) => {
  event.preventDefault();
  suppressNextGlobalAction = true;
  closePauseMenu();
});
audioSettingsDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  suppressNextGlobalAction = true;
  closeAudioSettings();
});
rendererError.addEventListener('cancel', (event) => {
  event.preventDefault();
});

shell.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true, once: true });
window.addEventListener('keydown', handleEscapeKey, { capture: true });
for (const button of soundToggleButtons) {
  button.addEventListener('click', () => {
    if (sound.isEnabled) sound.play('menu-click');
    sound.unlock();
    const enabled = sound.toggle();
    engineSound.setEnabled(enabled);
    persistMenuSettings();
    renderSoundState();
  });
}
renderSoundState();
for (const button of musicToggleButtons) {
  button.addEventListener('click', () => {
    playMenuClick();
    music.unlock();
    music.toggle();
    persistMenuSettings();
    renderMusicState();
  });
}
renderMusicState();

for (const button of openAudioSettingsButtons) {
  button.addEventListener('click', () => {
    openAudioSettings(button);
  });
}
closeAudioSettingsButton.addEventListener('click', closeAudioSettings);
musicVolumeInput.addEventListener('input', () => {
  music.setVolume(Number(musicVolumeInput.value) / 100);
  persistMenuSettings();
  renderAudioSettingsState();
});
sfxVolumeInput.addEventListener('input', () => {
  const volume = Number(sfxVolumeInput.value) / 100;
  sound.setVolume(volume);
  engineSound.setVolume(volume);
  persistMenuSettings();
  renderAudioSettingsState();
});

renderRouteDebugState();

for (const input of menuMediumInputs) input.checked = input.value === medium;
for (const input of lapInputs) input.checked = input.value === savedMenuSettings.laps.toString();
renderLapSelection();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) openPauseMenu();
  else if (pauseMenu.open) focusNavigator.activate(pauseMenu, resumeButton);
});

retryButton.addEventListener('click', () => {
  playMenuClick();
  startRenderer();
});
window.addEventListener('beforeunload', dispose);
if (import.meta.hot !== undefined) import.meta.hot.dispose(dispose);

startRenderer();
setAppMode('menu');
controlHints.update(input.lastActiveDevice);
hud.render(simulation.snapshot());
minimap.render(simulation.snapshot());
animationFrame = requestAnimationFrame(frame);
requestAnimationFrame(() => {
  revealApplication(shell);
});
