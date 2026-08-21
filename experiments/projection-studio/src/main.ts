import './style.css';

import {
  SOLID_FINISH_CATALOG,
  type AssetAuthoringValue,
  type MediumId,
  type SolidFinishId,
} from '../../../src/index.js';
import { BlueprintPreviewRenderer } from './blueprint-preview.js';
import { ThreeStage, type ThreeRenderMode } from './three-stage.js';
import {
  STUDIO_FAMILIES,
  studioFamilyById,
  updateCustomization,
  type FamilyCustomization,
  type FamilyDynamicState,
  type StudioFamilyDefinition,
  type StudioFamilyId,
} from './family-catalog.js';
import { FamilyCustomizer } from './family-customizer.js';
import { RasterStage } from './raster-stage.js';

const root = document.querySelector<HTMLElement>('[data-studio]');
if (root === null) throw new Error('Projection Studio root is missing');

type ElementConstructor<T extends Element> = abstract new (...arguments_: never[]) => T;

function required<T extends Element>(selector: string, constructor: ElementConstructor<T>): T {
  const element = root?.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Projection Studio is missing ${selector}`);
  }
  return element;
}

const rasterCanvas = required('[data-raster-canvas]', HTMLCanvasElement);
const rasterViewport = required('[data-raster-viewport]', HTMLElement);
const solidCanvas = required('[data-solid-canvas]', HTMLCanvasElement);
const solidViewport = required('[data-solid-viewport]', HTMLElement);
const seedInput = required('[data-seed]', HTMLInputElement);
const mediumInput = required('[data-medium]', HTMLSelectElement);
const finishInput = required('[data-finish]', HTMLSelectElement);
const speedInput = required('[data-speed]', HTMLInputElement);
const speedOutput = required('[data-speed-output]', HTMLOutputElement);
const yawInput = required('[data-yaw]', HTMLInputElement);
const yawOutput = required('[data-yaw-output]', HTMLOutputElement);
const autoGazeInput = required('[data-auto-gaze]', HTMLInputElement);
const lineBoilInput = required('[data-line-boil]', HTMLInputElement);
const playButton = required('[data-play]', HTMLButtonElement);
const pauseButton = required('[data-pause]', HTMLButtonElement);
const turntableButton = required('[data-turntable]', HTMLButtonElement);
const viewOptionRow = required('[data-view-option-row]', HTMLElement);
const familyPicker = required('[data-family-picker]', HTMLElement);
const familyOptions = required('[data-family-options]', HTMLElement);
const familyTriggerPreview = required('[data-family-trigger-preview]', HTMLImageElement);
const familyTriggerLabel = required('[data-family-trigger-label]', HTMLElement);
const familyTriggerDescription = required('[data-family-trigger-description]', HTMLElement);
const rendererError = required('[data-renderer-error]', HTMLElement);
const playbackControls = required('[data-playback-controls]', HTMLElement);
const familyDynamics = required('[data-family-dynamics]', HTMLElement);
const customizer = new FamilyCustomizer(
  required('[data-parameter-tabs]', HTMLElement),
  required('[data-parameter-editor]', HTMLElement),
  handleCustomizationChange,
);
const familyPreviewRenderer = new BlueprintPreviewRenderer(208, 168);
const rasterStage = new RasterStage(rasterCanvas, rasterViewport);

let familyId: StudioFamilyId = 'character';
let seed = 4104;
let medium: MediumId = 'graphite';
let speed = 0.7;
let playing = true;
let turntable = false;
let yaw = 28;
let pitch = -4;
let elapsedSeconds = 0;
let lastFrameTime = performance.now();
let animationFrame = 0;
let activeWorkspace: 'animate' | 'customize' = 'animate';
let customizerDirty = true;
let renderMode: ThreeRenderMode = 'doodle';
let threeStage: ThreeStage | null = null;
const customizationByFamily = new Map<StudioFamilyId, FamilyCustomization>(
  STUDIO_FAMILIES.map((family) => [family.id, family.defaultCustomization]),
);
const finishByFamily = new Map<StudioFamilyId, SolidFinishId>(
  STUDIO_FAMILIES.map((family) => [family.id, family.defaultFinish]),
);
const dynamicStateByFamily = new Map<StudioFamilyId, FamilyDynamicState>(
  STUDIO_FAMILIES.map((family) => [family.id, family.defaultDynamicState]),
);
const familyPreviewCache = new Map<string, string>();

finishInput.replaceChildren(...SOLID_FINISH_CATALOG.map((finish) => {
  const option = document.createElement('option');
  option.value = finish.id;
  option.textContent = finish.label;
  return option;
}));

function currentFamily(): StudioFamilyDefinition {
  return studioFamilyById(familyId);
}

function currentCustomization(): FamilyCustomization {
  const customization = customizationByFamily.get(familyId);
  if (customization === undefined) throw new Error(`Missing customization for ${familyId}`);
  return customization;
}

function currentFinish(): SolidFinishId {
  return finishByFamily.get(familyId) ?? currentFamily().defaultFinish;
}

finishInput.value = currentFinish();

function currentDynamicState(): FamilyDynamicState {
  return dynamicStateByFamily.get(familyId) ?? currentFamily().defaultDynamicState;
}

function setDynamicValue(controlId: string, value: string): void {
  dynamicStateByFamily.set(familyId, Object.freeze({
    ...currentDynamicState(),
    [controlId]: value,
  }));
  applyInteractionStates();
  renderDynamicControls();
}

function handleCustomizationChange(parameterId: string, value: AssetAuthoringValue): void {
  customizationByFamily.set(
    familyId,
    updateCustomization(currentCustomization(), parameterId, value),
  );
  rebuildProjection();
}

function createThreeStage(): void {
  threeStage?.dispose();
  try {
    threeStage = new ThreeStage(solidCanvas, solidViewport, (nextYaw, nextPitch) => {
      yaw = nextYaw;
      pitch = nextPitch;
      yawInput.value = String(Math.round(yaw));
      yawOutput.value = `${Math.round(yaw)}°`;
    });
    threeStage.setRenderMode(renderMode);
    rendererError.hidden = true;
    required('[data-sync-status]', HTMLElement).textContent = '2D and 3D stay in sync';
  } catch (error: unknown) {
    threeStage = null;
    rendererError.hidden = false;
    required('[data-sync-status]', HTMLElement).textContent = '2D is ready — retry the 3D view';
    console.error('3D renderer failed to start', error);
  }
}

function rebuildProjection(): void {
  const family = currentFamily();
  const projection = family.createProjection(seed, medium, currentCustomization(), currentFinish());
  rasterStage.setBlueprint(
    projection.raster,
    family.createRasterRuntime,
    autoGazeInput.checked,
  );
  if (threeStage !== null) {
    threeStage.setProjection(
      projection.solid,
      projection.strokes,
      medium,
      family.createSolidRuntime,
      family.solidFrameScale,
      autoGazeInput.checked,
    );
    threeStage.setView(yaw, pitch);
    threeStage.setTurntable(turntable);
    threeStage.setLineBoil(lineBoilInput.checked);
    threeStage.setRenderMode(renderMode);
  }
  applyInteractionStates();
  customizerDirty = true;
  if (activeWorkspace === 'customize') renderCustomizer();
  renderFamilyPicker();
  updateSummary();
}

function applyInteractionStates(): void {
  const state = currentDynamicState();
  for (const control of currentFamily().dynamicControls) {
    if (control.kind !== 'interaction' || control.interactionId === undefined) continue;
    const value = state[control.id] ?? control.options[0]?.value;
    if (value === undefined) continue;
    rasterStage.setInteractionState(control.interactionId, value);
    threeStage?.setInteractionState(control.interactionId, value);
  }
}

function renderCustomizer(): void {
  customizer.render(currentFamily(), seed, medium, currentCustomization());
  customizerDirty = false;
}

function familyPreview(family: StudioFamilyDefinition): string {
  const customization = customizationByFamily.get(family.id) ?? family.defaultCustomization;
  const key = JSON.stringify({ family: family.id, seed, medium, customization });
  const cached = familyPreviewCache.get(key);
  if (cached !== undefined) return cached;
  const finish = finishByFamily.get(family.id) ?? family.defaultFinish;
  const projection = family.createProjection(seed, medium, customization, finish);
  const result = familyPreviewRenderer.render(projection.raster);
  familyPreviewCache.set(key, result);
  return result;
}

function renderFamilyPicker(): void {
  const family = currentFamily();
  const currentPreview = familyPreview(family);
  familyTriggerPreview.src = currentPreview;
  familyTriggerLabel.textContent = family.label;
  familyTriggerDescription.textContent = family.description;
  familyOptions.setAttribute('role', 'radiogroup');
  familyOptions.setAttribute('aria-label', 'Asset families');
  const buttons = STUDIO_FAMILIES.map((candidate) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'family-option';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(candidate.id === familyId));
    const image = document.createElement('img');
    image.alt = '';
    image.src = familyPreview(candidate);
    const copy = document.createElement('span');
    const label = document.createElement('strong');
    label.textContent = candidate.label;
    const description = document.createElement('small');
    description.textContent = candidate.description;
    copy.append(label, description);
    button.append(image, copy);
    button.addEventListener('click', () => {
      setFamily(candidate.id);
      familyPicker.hidePopover();
    });
    return button;
  });
  familyOptions.replaceChildren(...buttons);
}

function setFamily(nextFamilyId: StudioFamilyId): void {
  if (nextFamilyId === familyId) return;
  familyId = nextFamilyId;
  const family = currentFamily();
  yaw = family.initialYaw;
  pitch = family.initialPitch;
  finishInput.value = currentFinish();
  yawInput.value = String(yaw);
  yawOutput.value = `${yaw}°`;
  turntable = false;
  turntableButton.setAttribute('aria-pressed', 'false');
  turntableButton.classList.remove('active');
  threeStage?.setTurntable(false);
  renderFamilyControls();
  rebuildProjection();
}

function renderThreeModeControls(): void {
  for (const button of root?.querySelectorAll<HTMLButtonElement>('[data-render-mode]') ?? []) {
    button.setAttribute('aria-pressed', String(button.dataset.renderMode === renderMode));
  }
  for (const element of root?.querySelectorAll<HTMLElement>('[data-doodle-control]') ?? []) {
    element.hidden = renderMode !== 'doodle';
  }
  for (const element of root?.querySelectorAll<HTMLElement>('[data-solid-control]') ?? []) {
    element.hidden = renderMode !== 'solid';
  }
  const optionLabels = [...viewOptionRow.querySelectorAll<HTMLElement>('label')];
  viewOptionRow.hidden = optionLabels.every((element) => element.hidden);
}

function setRenderMode(next: ThreeRenderMode): void {
  renderMode = next;
  threeStage?.setRenderMode(renderMode);
  renderThreeModeControls();
  updateSummary();
}

function renderFamilyControls(): void {
  const family = currentFamily();
  playbackControls.hidden = !family.playback;
  required('[data-lively-gaze-control]', HTMLElement).hidden = !family.livelyGaze;
  required('[data-raster-view-title]', HTMLElement).textContent = family.rasterViewTitle;
  rasterCanvas.setAttribute('aria-label', family.rasterAriaLabel);
  required('[data-workspace-note]', HTMLElement).textContent = family.workspaceNote;
  renderThreeModeControls();
  renderDynamicControls();
}

function renderDynamicControls(): void {
  const state = currentDynamicState();
  const sections = currentFamily().dynamicControls.map((control) => {
    const section = document.createElement('section');
    section.className = 'control-group';
    const heading = document.createElement('h3');
    heading.textContent = control.label;
    const choices = document.createElement('div');
    choices.className = 'choice-row';
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', control.label);
    const current = state[control.id] ?? control.options[0]?.value;
    for (const option of control.options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.setAttribute('aria-pressed', String(option.value === current));
      button.addEventListener('click', () => {
        setDynamicValue(control.id, option.value);
      });
      choices.append(button);
    }
    section.append(heading, choices);
    return section;
  });
  familyDynamics.replaceChildren(...sections);
}

function updateSummary(): void {
  required('[data-turntable-status]', HTMLElement).textContent = turntable
    ? 'Turning gently'
    : 'Turntable off';
}

function setPlaying(next: boolean): void {
  playing = next;
  playButton.classList.toggle('active', playing);
  playButton.setAttribute('aria-pressed', String(playing));
  pauseButton.classList.toggle('active', !playing);
  pauseButton.setAttribute('aria-pressed', String(!playing));
}

function switchWorkspace(next: 'animate' | 'customize'): void {
  activeWorkspace = next;
  for (const tab of root?.querySelectorAll<HTMLButtonElement>('[data-workspace-tab]') ?? []) {
    tab.setAttribute('aria-selected', String(tab.dataset.workspaceTab === next));
  }
  for (const panel of root?.querySelectorAll<HTMLElement>('[data-workspace-panel]') ?? []) {
    panel.hidden = panel.dataset.workspacePanel !== next;
  }
  if (next === 'customize' && customizerDirty) renderCustomizer();
}

for (const tab of root.querySelectorAll<HTMLButtonElement>('[data-workspace-tab]')) {
  tab.addEventListener('click', () => {
    switchWorkspace(tab.dataset.workspaceTab === 'customize' ? 'customize' : 'animate');
  });
}

seedInput.addEventListener('change', () => {
  seed = Number(seedInput.value) || 0;
  seedInput.value = String(seed);
  rebuildProjection();
});

mediumInput.addEventListener('change', () => {
  medium = mediumInput.value as MediumId;
  rebuildProjection();
});

finishInput.addEventListener('change', () => {
  finishByFamily.set(familyId, finishInput.value as SolidFinishId);
  rebuildProjection();
});

required('[data-reroll]', HTMLButtonElement).addEventListener('click', () => {
  seed = (seed + 1) >>> 0;
  seedInput.value = String(seed);
  rebuildProjection();
});

playButton.addEventListener('click', () => {
  setPlaying(true);
});
pauseButton.addEventListener('click', () => {
  setPlaying(false);
});
required('[data-restart]', HTMLButtonElement).addEventListener('click', () => {
  elapsedSeconds = 0;
  rebuildProjection();
  setPlaying(true);
});

speedInput.addEventListener('input', () => {
  speed = Number(speedInput.value);
  speedOutput.value = `${Math.round(speed * 100)}%`;
});

yawInput.addEventListener('input', () => {
  yaw = Number(yawInput.value);
  yawOutput.value = `${Math.round(yaw)}°`;
  threeStage?.setView(yaw, pitch);
});

turntableButton.addEventListener('click', () => {
  turntable = !turntable;
  turntableButton.setAttribute('aria-pressed', String(turntable));
  turntableButton.classList.toggle('active', turntable);
  threeStage?.setTurntable(turntable);
  updateSummary();
});

required('[data-reset-view]', HTMLButtonElement).addEventListener('click', () => {
  yaw = 0;
  pitch = 0;
  threeStage?.setView(yaw, pitch);
});

autoGazeInput.addEventListener('change', rebuildProjection);
lineBoilInput.addEventListener('change', () => threeStage?.setLineBoil(lineBoilInput.checked));
for (const button of root.querySelectorAll<HTMLButtonElement>('[data-render-mode]')) {
  button.addEventListener('click', () => {
    setRenderMode(button.dataset.renderMode === 'solid' ? 'solid' : 'doodle');
  });
}
required('[data-retry-3d]', HTMLButtonElement).addEventListener('click', () => {
  createThreeStage();
  rebuildProjection();
});

function animate(now: number): void {
  animationFrame = requestAnimationFrame(animate);
  const rawDelta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  const delta = playing ? rawDelta : 0;
  if (playing) elapsedSeconds += delta;
  const dynamicState = currentDynamicState();
  rasterStage.update(delta, elapsedSeconds, dynamicState, speed);
  threeStage?.update(delta, dynamicState, speed, elapsedSeconds);
}

function dispose(): void {
  cancelAnimationFrame(animationFrame);
  customizer.dispose();
  familyPreviewRenderer.dispose();
  rasterStage.dispose();
  threeStage?.dispose();
}

window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot !== undefined) import.meta.hot.dispose(dispose);

createThreeStage();
renderFamilyControls();
rebuildProjection();
animationFrame = requestAnimationFrame(animate);
