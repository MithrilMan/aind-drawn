import * as THREE from 'three';

import { MEDIUM_IDS, clamp, type MediumId } from '../../../src/index.js';
import { createAssetIcon } from './asset-icon.js';
import {
  applyBuildingOption,
  BuildingInspector,
  type BuildingOptionProperty,
} from './building-inspector.js';
import { CATALOG, catalogEntry } from './catalog.js';
import {
  cloneDocument,
  createSceneObject,
  moveSceneObjectToLayer,
  nextAvailableOrdinal,
  parseSceneDocument,
  type AssetKind,
  type SceneDocument,
  type SceneObjectData,
} from './document.js';
import { DocumentHistory } from './history.js';
import { SceneObjectView } from './scene-object.js';
import { SelectionOverlay, type ResizeHandle } from './selection-overlay.js';

type Point = Readonly<{ x: number; y: number }>;

type ObjectTransform = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}>;

type Interaction =
  | Readonly<{ kind: 'move'; pointerId: number; startPointer: Point; start: ObjectTransform }>
  | Readonly<{ kind: 'resize'; pointerId: number; startPointer: Point; start: ObjectTransform; handle: ResizeHandle }>
  | Readonly<{ kind: 'rotate'; pointerId: number; startAngle: number; start: ObjectTransform }>
  | Readonly<{ kind: 'pan'; pointerId: number; startClient: Point; cameraX: number; cameraY: number }>;

type EditorElements = Readonly<{
  viewport: HTMLElement;
  selectionFrame: HTMLElement;
  catalog: HTMLElement;
  outliner: HTMLElement;
  inspectorEmpty: HTMLElement;
  inspectorForm: HTMLFormElement;
  status: HTMLElement;
  selectionStatus: HTMLElement;
  zoomStatus: HTMLElement;
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  fitView: HTMLButtonElement;
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
  duplicate: HTMLButtonElement;
  remove: HTMLButtonElement;
  regenerate: HTMLButtonElement;
  exportDocument: HTMLButtonElement;
  importInput: HTMLInputElement;
  newDocument: HTMLButtonElement;
  documentName: HTMLInputElement;
  snap: HTMLInputElement;
  gridSize: HTMLSelectElement;
  buildingOptions: HTMLElement;
  layerFront: HTMLButtonElement;
  layerForward: HTMLButtonElement;
  layerBackward: HTMLButtonElement;
  layerBack: HTMLButtonElement;
  layerPosition: HTMLSelectElement;
}>;

const VIEW_HEIGHT = 12;

function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
  constructor: new (...arguments_: never[]) => T,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing or invalid editor element: ${selector}`);
  }
  return element;
}

function transformOf(data: SceneObjectData): ObjectTransform {
  return {
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    rotation: data.rotation,
  };
}

function createGrid(spacing: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'editor-grid';
  const range = 80;
  const lineCount = Math.ceil(range / spacing);
  const minor: number[] = [];
  const major: number[] = [];
  for (let index = -lineCount; index <= lineCount; index += 1) {
    const coordinate = index * spacing;
    const target = index % 5 === 0 ? major : minor;
    target.push(-range, coordinate, -5, range, coordinate, -5);
    target.push(coordinate, -range, -5, coordinate, range, -5);
  }
  const addLines = (positions: readonly number[], color: number, opacity: number): void => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = -50000;
    group.add(lines);
  };
  addLines(minor, 0x766d5f, 0.1);
  addLines(major, 0x5b554c, 0.22);
  return group;
}

function isGridLine(
  object: THREE.Object3D,
): object is THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  return object.type === 'LineSegments';
}

function downloadJson(document: SceneDocument): void {
  const blob = new Blob([`${JSON.stringify(document, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `${document.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'level'}.aind.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export class PlaygroundEditor {
  private readonly root: HTMLElement;
  private readonly elements: EditorElements;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly overlay: SelectionOverlay;
  private readonly buildingInspector: BuildingInspector;
  private readonly history = new DocumentHistory();
  private readonly eventController = new AbortController();
  private readonly views = new Map<string, SceneObjectView>();
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private grid = createGrid(0.5);
  private document: SceneDocument;
  private selectedId: string | null = null;
  private interaction: Interaction | null = null;
  private frameRequest = 0;
  private previousTime = 0;
  private elapsed = 0;
  private nextOrdinal = 10;

  public constructor(root: HTMLElement, initialDocument: SceneDocument) {
    this.root = root;
    this.elements = this.collectElements();
    this.document = cloneDocument(initialDocument);
    this.selectedId = this.document.objects.find(({ kind }) => kind === 'building')?.id
      ?? this.document.objects[0]?.id
      ?? null;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'editor-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.elements.viewport.prepend(this.renderer.domElement);
    this.overlay = new SelectionOverlay(this.elements.selectionFrame);
    this.buildingInspector = new BuildingInspector(
      this.elements.buildingOptions,
      (property, value): void => { this.buildingOptionChanged(property, value); },
    );
    this.camera.position.set(0, 3.5, 20);
    this.camera.lookAt(0, 3.5, 0);
    this.scene.add(this.grid);
    this.renderCatalog();
    this.rebuildScene();
    this.history.reset(this.document);
    this.bindEvents();
    this.resizeObserver = new ResizeObserver((): void => { this.resize(); });
    this.resizeObserver.observe(this.elements.viewport);
    this.resize();
    this.fitScene(false);
    this.frameRequest = requestAnimationFrame((time): void => { this.frame(time); });
    this.announce('Atelier ready. Select an object or add one from the library.');
  }

  public dispose(): void {
    cancelAnimationFrame(this.frameRequest);
    this.eventController.abort();
    this.resizeObserver.disconnect();
    this.buildingInspector.dispose();
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
    this.disposeGrid();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private collectElements(): EditorElements {
    return {
      viewport: requiredElement(this.root, '[data-viewport]', HTMLElement),
      selectionFrame: requiredElement(this.root, '[data-selection-frame]', HTMLElement),
      catalog: requiredElement(this.root, '[data-catalog]', HTMLElement),
      outliner: requiredElement(this.root, '[data-outliner]', HTMLElement),
      inspectorEmpty: requiredElement(this.root, '[data-inspector-empty]', HTMLElement),
      inspectorForm: requiredElement(this.root, '[data-inspector-form]', HTMLFormElement),
      status: requiredElement(this.root, '[data-status]', HTMLElement),
      selectionStatus: requiredElement(this.root, '[data-selection-status]', HTMLElement),
      zoomStatus: requiredElement(this.root, '[data-zoom-status]', HTMLElement),
      zoomIn: requiredElement(this.root, '[data-zoom-in]', HTMLButtonElement),
      zoomOut: requiredElement(this.root, '[data-zoom-out]', HTMLButtonElement),
      fitView: requiredElement(this.root, '[data-fit-view]', HTMLButtonElement),
      undo: requiredElement(this.root, '[data-undo]', HTMLButtonElement),
      redo: requiredElement(this.root, '[data-redo]', HTMLButtonElement),
      duplicate: requiredElement(this.root, '[data-duplicate]', HTMLButtonElement),
      remove: requiredElement(this.root, '[data-delete]', HTMLButtonElement),
      regenerate: requiredElement(this.root, '[data-regenerate]', HTMLButtonElement),
      exportDocument: requiredElement(this.root, '[data-export]', HTMLButtonElement),
      importInput: requiredElement(this.root, '[data-import]', HTMLInputElement),
      newDocument: requiredElement(this.root, '[data-new]', HTMLButtonElement),
      documentName: requiredElement(this.root, '[data-document-name]', HTMLInputElement),
      snap: requiredElement(this.root, '[data-snap]', HTMLInputElement),
      gridSize: requiredElement(this.root, '[data-grid-size]', HTMLSelectElement),
      buildingOptions: requiredElement(this.root, '[data-building-options]', HTMLElement),
      layerFront: requiredElement(this.root, '[data-layer-front]', HTMLButtonElement),
      layerForward: requiredElement(this.root, '[data-layer-forward]', HTMLButtonElement),
      layerBackward: requiredElement(this.root, '[data-layer-backward]', HTMLButtonElement),
      layerBack: requiredElement(this.root, '[data-layer-back]', HTMLButtonElement),
      layerPosition: requiredElement(this.root, '[data-layer-position]', HTMLSelectElement),
    };
  }

  private bindEvents(): void {
    const signal = this.eventController.signal;
    this.elements.catalog.addEventListener('click', (event): void => {
      const button = event.target instanceof HTMLElement
        ? event.target.closest<HTMLButtonElement>('[data-add-kind]')
        : null;
      const kind = button?.dataset.addKind as AssetKind | undefined;
      if (kind !== undefined) this.addObject(kind);
    }, { signal });
    this.elements.outliner.addEventListener('click', (event): void => {
      const button = event.target instanceof HTMLElement
        ? event.target.closest<HTMLButtonElement>('[data-select-id]')
        : null;
      if (button?.dataset.selectId !== undefined) this.select(button.dataset.selectId);
    }, { signal });
    this.elements.viewport.addEventListener('pointerdown', (event): void => { this.pointerDown(event); }, { signal });
    this.elements.selectionFrame.addEventListener('pointerdown', (event): void => { this.handleDown(event); }, { signal });
    window.addEventListener('pointermove', (event): void => { this.pointerMove(event); }, { signal });
    window.addEventListener('pointerup', (event): void => { this.pointerUp(event); }, { signal });
    window.addEventListener('pointercancel', (event): void => { this.cancelInteraction(event.pointerId); }, { signal });
    window.addEventListener('blur', (): void => { this.cancelInteraction(); }, { signal });
    this.elements.viewport.addEventListener('wheel', (event): void => { this.wheel(event); }, { passive: false, signal });
    this.elements.zoomIn.addEventListener('click', (): void => { this.adjustZoom(1.25); }, { signal });
    this.elements.zoomOut.addEventListener('click', (): void => { this.adjustZoom(0.8); }, { signal });
    this.elements.fitView.addEventListener('click', (): void => { this.fitScene(); }, { signal });
    this.elements.viewport.addEventListener('keydown', (event): void => { this.keyDown(event); }, { signal });
    this.elements.undo.addEventListener('click', (): void => { this.undo(); }, { signal });
    this.elements.redo.addEventListener('click', (): void => { this.redo(); }, { signal });
    this.elements.duplicate.addEventListener('click', (): void => { this.duplicateSelected(); }, { signal });
    this.elements.remove.addEventListener('click', (): void => { this.deleteSelected(); }, { signal });
    this.elements.regenerate.addEventListener('click', (): void => { this.regenerateSelected(); }, { signal });
    this.elements.exportDocument.addEventListener('click', (): void => { downloadJson(this.document); }, { signal });
    this.elements.importInput.addEventListener('change', (): void => {
      void this.importDocument();
    }, { signal });
    this.elements.newDocument.addEventListener('click', (): void => { this.newDocument(); }, { signal });
    this.elements.documentName.addEventListener('change', (): void => {
      this.document.name = this.elements.documentName.value.trim() || 'Untitled';
      this.commit('Level name updated.');
    }, { signal });
    this.elements.gridSize.addEventListener('change', (): void => { this.rebuildGrid(); }, { signal });
    this.elements.layerFront.addEventListener('click', (): void => {
      this.moveSelectedToLayer(this.document.objects.length - 1);
    }, { signal });
    this.elements.layerForward.addEventListener('click', (): void => {
      this.moveSelectedByLayer(1);
    }, { signal });
    this.elements.layerBackward.addEventListener('click', (): void => {
      this.moveSelectedByLayer(-1);
    }, { signal });
    this.elements.layerBack.addEventListener('click', (): void => {
      this.moveSelectedToLayer(0);
    }, { signal });
    this.elements.layerPosition.addEventListener('change', (): void => {
      this.moveSelectedToLayer(Number(this.elements.layerPosition.value));
    }, { signal });
    this.elements.inspectorForm.addEventListener('change', (event): void => { this.inspectorChanged(event); }, { signal });
  }

  private renderCatalog(): void {
    this.elements.catalog.replaceChildren();
    for (const category of ['Characters', 'Structures', 'Props'] as const) {
      const section = window.document.createElement('section');
      const heading = window.document.createElement('h3');
      heading.textContent = category;
      section.append(heading);
      const grid = window.document.createElement('div');
      grid.className = 'catalog-grid';
      for (const entry of CATALOG.filter((candidate) => candidate.category === category)) {
        const button = window.document.createElement('button');
        button.type = 'button';
        button.className = 'asset-button';
        button.dataset.addKind = entry.kind;
        const label = window.document.createElement('span');
        label.textContent = entry.label;
        button.append(createAssetIcon(entry.kind), label);
        button.setAttribute('aria-label', `Add ${entry.label}`);
        grid.append(button);
      }
      section.append(grid);
      this.elements.catalog.append(section);
    }
  }

  private rebuildScene(): void {
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
    for (const [index, data] of this.document.objects.entries()) {
      const view = new SceneObjectView(data, 10 + index);
      this.views.set(data.id, view);
      this.scene.add(view.container);
    }
    if (this.selectedId !== null && !this.views.has(this.selectedId)) this.selectedId = null;
    this.elements.documentName.value = this.document.name;
    this.renderOutliner();
    this.refreshInspector();
    this.updateHistoryControls();
  }

  private renderOutliner(): void {
    this.elements.outliner.replaceChildren();
    if (this.document.objects.length === 0) {
      const empty = window.document.createElement('p');
      empty.className = 'empty-copy';
      empty.textContent = 'The scene is empty.';
      this.elements.outliner.append(empty);
      return;
    }
    for (const data of [...this.document.objects].reverse()) {
      const button = window.document.createElement('button');
      button.type = 'button';
      button.className = 'outliner-row';
      button.dataset.selectId = data.id;
      button.dataset.selected = String(data.id === this.selectedId);
      const entry = catalogEntry(data.kind);
      const copy = window.document.createElement('span');
      copy.className = 'outliner-copy';
      const name = window.document.createElement('span');
      name.textContent = data.name;
      const kind = window.document.createElement('small');
      kind.textContent = entry.label;
      copy.append(name, kind);
      const layerIndex = this.document.objects.indexOf(data);
      const depth = window.document.createElement('small');
      depth.className = 'layer-depth';
      depth.textContent = layerIndex === this.document.objects.length - 1
        ? 'Front'
        : layerIndex === 0 ? 'Back' : `L${layerIndex + 1}`;
      button.append(createAssetIcon(data.kind), copy, depth);
      this.elements.outliner.append(button);
    }
  }

  private refreshInspector(): void {
    const selected = this.selectedData();
    this.elements.inspectorEmpty.hidden = selected !== null;
    this.elements.inspectorForm.hidden = selected === null;
    this.elements.duplicate.disabled = selected === null;
    this.elements.remove.disabled = selected === null;
    this.elements.regenerate.disabled = selected === null;
    this.updateLayerControls();
    this.elements.selectionStatus.textContent = selected === null ? 'No selection' : selected.name;
    if (selected === null) {
      this.elements.buildingOptions.replaceChildren();
      this.elements.layerPosition.replaceChildren();
      this.updateOverlay();
      return;
    }
    const setValue = (property: string, value: string): void => {
      const input = this.elements.inspectorForm.elements.namedItem(property);
      if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) input.value = value;
    };
    setValue('name', selected.name);
    setValue('seed', String(selected.seed));
    setValue('medium', selected.medium);
    setValue('x', selected.x.toFixed(2));
    setValue('y', selected.y.toFixed(2));
    setValue('width', selected.width.toFixed(2));
    setValue('height', selected.height.toFixed(2));
    setValue('rotation', (selected.rotation * 180 / Math.PI).toFixed(1));
    this.renderLayerPosition(selected.id);
    const buildingFields = requiredElement(
      this.elements.inspectorForm,
      '[data-building-fields]',
      HTMLElement,
    );
    buildingFields.hidden = selected.kind !== 'building';
    this.buildingInspector.render(selected);
    this.updateOverlay();
  }

  private inspectorChanged(event: Event): void {
    const selected = this.selectedData();
    const view = this.selectedView();
    if (selected === null || view === null || !(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) {
      return;
    }
    const property = event.target.name;
    const numeric = Number(event.target.value);
    let rebuild = false;
    if (property === 'name') selected.name = event.target.value.trim() || catalogEntry(selected.kind).label;
    else if (property === 'seed' && Number.isFinite(numeric)) { selected.seed = Math.trunc(numeric); rebuild = true; }
    else if (property === 'medium' && MEDIUM_IDS.includes(event.target.value as MediumId)) { selected.medium = event.target.value as MediumId; rebuild = true; }
    else if (property === 'x' && Number.isFinite(numeric)) selected.x = this.snap(numeric);
    else if (property === 'y' && Number.isFinite(numeric)) selected.y = this.snap(numeric);
    else if (property === 'width' && Number.isFinite(numeric)) { selected.width = Math.max(catalogEntry(selected.kind).minimumWidth, numeric); rebuild = catalogEntry(selected.kind).semanticResize; }
    else if (property === 'height' && Number.isFinite(numeric)) { selected.height = Math.max(catalogEntry(selected.kind).minimumHeight, numeric); rebuild = catalogEntry(selected.kind).semanticResize; }
    else if (property === 'rotation' && Number.isFinite(numeric)) selected.rotation = numeric * Math.PI / 180;
    if (rebuild) view.rebuild(); else view.applyTransform();
    this.commit(`${selected.name} updated.`);
    this.renderOutliner();
    this.refreshInspector();
  }

  private buildingOptionChanged(property: BuildingOptionProperty, value: string): void {
    const selected = this.selectedData();
    const view = this.selectedView();
    if (selected?.kind !== 'building' || selected.building === null || view === null) return;
    applyBuildingOption(selected, property, value);
    view.rebuild();
    this.commit(`${selected.name} ${property.replace('building', '').toLowerCase()} updated.`);
    this.refreshInspector();
  }

  private renderLayerPosition(selectedId: string): void {
    this.elements.layerPosition.replaceChildren();
    const count = this.document.objects.length;
    const selectedIndex = this.document.objects.findIndex(({ id }) => id === selectedId);
    for (let index = count - 1; index >= 0; index -= 1) {
      const option = window.document.createElement('option');
      option.value = String(index);
      option.textContent = index === count - 1
        ? `${index + 1} — Front`
        : index === 0 ? '1 — Back' : `${index + 1}`;
      option.selected = index === selectedIndex;
      this.elements.layerPosition.append(option);
    }
  }

  private updateLayerControls(): void {
    const selectedIndex = this.selectedId === null
      ? -1
      : this.document.objects.findIndex(({ id }) => id === this.selectedId);
    const frontIndex = this.document.objects.length - 1;
    const cannotMoveForward = selectedIndex < 0 || selectedIndex >= frontIndex;
    const cannotMoveBackward = selectedIndex <= 0;
    this.elements.layerFront.disabled = cannotMoveForward;
    this.elements.layerForward.disabled = cannotMoveForward;
    this.elements.layerBackward.disabled = cannotMoveBackward;
    this.elements.layerBack.disabled = cannotMoveBackward;
    this.elements.layerPosition.disabled = selectedIndex < 0 || this.document.objects.length < 2;
  }

  private moveSelectedByLayer(offset: -1 | 1): void {
    if (this.selectedId === null) return;
    const current = this.document.objects.findIndex(({ id }) => id === this.selectedId);
    if (current < 0) return;
    this.moveSelectedToLayer(current + offset);
  }

  private moveSelectedToLayer(targetIndex: number): void {
    if (this.selectedId === null || !Number.isFinite(targetIndex)) return;
    const currentIndex = this.document.objects.findIndex(({ id }) => id === this.selectedId);
    const nextIndex = clamp(Math.trunc(targetIndex), 0, this.document.objects.length - 1);
    if (currentIndex < 0 || nextIndex === currentIndex) return;
    const selected = this.document.objects[currentIndex];
    if (selected === undefined || !moveSceneObjectToLayer(this.document.objects, selected.id, nextIndex)) return;
    this.rerankViews();
    this.commit(`${selected.name} moved to drawing layer ${nextIndex + 1}.`);
    this.renderOutliner();
    this.refreshInspector();
  }

  private addObject(kind: AssetKind): void {
    const ordinal = nextAvailableOrdinal(this.document.objects, kind, this.nextOrdinal);
    const data = createSceneObject(kind, ordinal, { x: this.snap(this.camera.position.x), y: this.snap(this.camera.position.y) });
    this.nextOrdinal = ordinal + 1;
    this.document.objects.push(data);
    const view = new SceneObjectView(data, 10 + this.document.objects.length - 1);
    this.views.set(data.id, view);
    this.scene.add(view.container);
    this.selectedId = data.id;
    this.commit(`${data.name} added.`);
    this.renderOutliner();
    this.refreshInspector();
    this.elements.viewport.focus();
  }

  private select(id: string | null): void {
    this.selectedId = id !== null && this.views.has(id) ? id : null;
    this.renderOutliner();
    this.refreshInspector();
  }

  private pointerDown(event: PointerEvent): void {
    if (event.target !== this.renderer.domElement && event.target !== this.elements.viewport) return;
    this.elements.viewport.focus({ preventScroll: true });
    if (event.button === 1 || (event.button === 0 && event.altKey)) {
      event.preventDefault();
      this.interaction = {
        kind: 'pan',
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        cameraX: this.camera.position.x,
        cameraY: this.camera.position.y,
      };
      return;
    }
    if (event.button !== 0) return;
    const world = this.screenToWorld(event.clientX, event.clientY);
    const hit = [...this.document.objects].reverse().find((data) => this.views.get(data.id)?.contains(world.x, world.y) === true);
    if (hit === undefined) {
      this.select(null);
      return;
    }
    this.select(hit.id);
    this.interaction = {
      kind: 'move',
      pointerId: event.pointerId,
      startPointer: world,
      start: transformOf(hit),
    };
    event.preventDefault();
  }

  private handleDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const selected = this.selectedData();
    if (selected === null) return;
    const handle = this.overlay.resizeHandleFrom(event.target);
    const world = this.screenToWorld(event.clientX, event.clientY);
    if (handle !== null) {
      this.interaction = { kind: 'resize', pointerId: event.pointerId, startPointer: world, start: transformOf(selected), handle };
    } else if (this.overlay.isRotationHandle(event.target)) {
      this.interaction = {
        kind: 'rotate',
        pointerId: event.pointerId,
        startAngle: Math.atan2(world.y - selected.y, world.x - selected.x),
        start: transformOf(selected),
      };
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private pointerMove(event: PointerEvent): void {
    const interaction = this.interaction;
    if (interaction?.pointerId !== event.pointerId) return;
    if (interaction.kind === 'pan') {
      const rect = this.elements.viewport.getBoundingClientRect();
      const visibleWidth = (this.camera.right - this.camera.left) / this.camera.zoom;
      const visibleHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
      this.camera.position.x = interaction.cameraX - (event.clientX - interaction.startClient.x) / rect.width * visibleWidth;
      this.camera.position.y = interaction.cameraY + (event.clientY - interaction.startClient.y) / rect.height * visibleHeight;
      this.camera.updateMatrixWorld();
      this.updateOverlay();
      return;
    }
    const selected = this.selectedData();
    const view = this.selectedView();
    if (selected === null || view === null) return;
    const world = this.screenToWorld(event.clientX, event.clientY);
    if (interaction.kind === 'move') {
      selected.x = this.snap(interaction.start.x + world.x - interaction.startPointer.x);
      selected.y = this.snap(interaction.start.y + world.y - interaction.startPointer.y);
    } else if (interaction.kind === 'rotate') {
      const angle = Math.atan2(world.y - interaction.start.y, world.x - interaction.start.x);
      const raw = interaction.start.rotation + angle - interaction.startAngle;
      selected.rotation = event.shiftKey ? Math.round(raw / (Math.PI / 12)) * Math.PI / 12 : raw;
    } else {
      this.applyResize(selected, interaction, world);
    }
    view.applyTransform();
    this.updateOverlay();
    this.refreshLiveInspector(selected);
    event.preventDefault();
  }

  private pointerUp(event: PointerEvent): void {
    const interaction = this.interaction;
    if (interaction?.pointerId !== event.pointerId) return;
    this.interaction = null;
    const selected = this.selectedData();
    const view = this.selectedView();
    if (selected !== null && view !== null && interaction.kind !== 'pan') {
      if (interaction.kind === 'resize' && catalogEntry(selected.kind).semanticResize) view.rebuild();
      this.commit(`${selected.name} transformed.`);
      this.refreshInspector();
    }
  }

  private cancelInteraction(pointerId?: number): void {
    const interaction = this.interaction;
    if (interaction === null || (pointerId !== undefined && interaction.pointerId !== pointerId)) return;
    this.interaction = null;
    if (interaction.kind === 'pan') return;
    const selected = this.selectedData();
    const view = this.selectedView();
    if (selected === null || view === null) return;
    Object.assign(selected, interaction.start);
    view.applyTransform();
    this.refreshInspector();
    this.announce('Transform cancelled.');
  }

  private applyResize(
    selected: SceneObjectData,
    interaction: Extract<Interaction, { kind: 'resize' }>,
    world: Point,
  ): void {
    const deltaX = world.x - interaction.startPointer.x;
    const deltaY = world.y - interaction.startPointer.y;
    const cosine = Math.cos(-interaction.start.rotation);
    const sine = Math.sin(-interaction.start.rotation);
    const localX = deltaX * cosine - deltaY * sine;
    const localY = deltaX * sine + deltaY * cosine;
    const entry = catalogEntry(selected.kind);
    const rawWidth = interaction.handle.x === 0
      ? interaction.start.width
      : interaction.start.width + localX * interaction.handle.x;
    const rawHeight = interaction.handle.y === 0
      ? interaction.start.height
      : interaction.start.height + localY * interaction.handle.y;
    selected.width = interaction.handle.x === 0 ? interaction.start.width : Math.max(entry.minimumWidth, this.snapSize(rawWidth));
    selected.height = interaction.handle.y === 0 ? interaction.start.height : Math.max(entry.minimumHeight, this.snapSize(rawHeight));
    const shiftLocalX = (selected.width - interaction.start.width) * interaction.handle.x / 2;
    const shiftLocalY = (selected.height - interaction.start.height) * interaction.handle.y / 2;
    const rotationCosine = Math.cos(interaction.start.rotation);
    const rotationSine = Math.sin(interaction.start.rotation);
    selected.x = interaction.start.x + shiftLocalX * rotationCosine - shiftLocalY * rotationSine;
    selected.y = interaction.start.y + shiftLocalX * rotationSine + shiftLocalY * rotationCosine;
  }

  private wheel(event: WheelEvent): void {
    event.preventDefault();
    const before = this.screenToWorld(event.clientX, event.clientY);
    this.setZoom(this.camera.zoom * Math.exp(-event.deltaY * 0.0012));
    const after = this.screenToWorld(event.clientX, event.clientY);
    this.camera.position.x += before.x - after.x;
    this.camera.position.y += before.y - after.y;
    this.camera.updateMatrixWorld();
    this.updateOverlay();
  }

  private adjustZoom(factor: number): void {
    this.setZoom(this.camera.zoom * factor);
    this.updateOverlay();
  }

  private setZoom(value: number): void {
    this.camera.zoom = clamp(value, 0.35, 4.5);
    this.camera.updateProjectionMatrix();
    this.elements.zoomStatus.textContent = `${Math.round(this.camera.zoom * 100)}%`;
  }

  private fitScene(announce = true): void {
    if (this.document.objects.length === 0) {
      this.camera.position.set(0, 3.5, 20);
      this.setZoom(1);
      this.camera.updateMatrixWorld();
      this.updateOverlay();
      if (announce) this.announce('View reset.');
      return;
    }
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.POSITIVE_INFINITY;
    let top = Number.NEGATIVE_INFINITY;
    for (const object of this.document.objects) {
      const cosine = Math.abs(Math.cos(object.rotation));
      const sine = Math.abs(Math.sin(object.rotation));
      const halfWidth = (object.width * cosine + object.height * sine) / 2;
      const halfHeight = (object.width * sine + object.height * cosine) / 2;
      left = Math.min(left, object.x - halfWidth);
      right = Math.max(right, object.x + halfWidth);
      bottom = Math.min(bottom, object.y - halfHeight);
      top = Math.max(top, object.y + halfHeight);
    }
    const contentWidth = Math.max(0.1, right - left);
    const contentHeight = Math.max(0.1, top - bottom);
    const baseWidth = this.camera.right - this.camera.left;
    this.camera.position.x = (left + right) / 2;
    this.camera.position.y = (bottom + top) / 2;
    this.setZoom(Math.min(baseWidth / contentWidth, VIEW_HEIGHT / contentHeight) * 0.86);
    this.camera.updateMatrixWorld();
    this.updateOverlay();
    if (announce) this.announce('Scene fitted to the drawing board.');
  }

  private keyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.ctrlKey && event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (event.ctrlKey && event.code === 'KeyY') { event.preventDefault(); this.redo(); return; }
    if (event.ctrlKey && event.code === 'KeyD') { event.preventDefault(); this.duplicateSelected(); return; }
    if (event.code === 'Delete' || event.code === 'Backspace') { event.preventDefault(); this.deleteSelected(); return; }
    if (event.code === 'Escape') { this.select(null); return; }
    const selected = this.selectedData();
    const view = this.selectedView();
    if (selected === null || view === null) return;
    const amount = event.shiftKey ? this.gridStep() : 0.1;
    if (event.code === 'ArrowLeft') selected.x -= amount;
    else if (event.code === 'ArrowRight') selected.x += amount;
    else if (event.code === 'ArrowUp') selected.y += amount;
    else if (event.code === 'ArrowDown') selected.y -= amount;
    else return;
    event.preventDefault();
    selected.x = this.snap(selected.x);
    selected.y = this.snap(selected.y);
    view.applyTransform();
    this.commit(`${selected.name} moved.`);
    this.refreshInspector();
  }

  private duplicateSelected(): void {
    const selected = this.selectedData();
    if (selected === null) return;
    const copy = structuredClone(selected);
    const ordinal = nextAvailableOrdinal(this.document.objects, selected.kind, this.nextOrdinal);
    copy.id = `${selected.kind.replace(':', '-')}-${ordinal}`;
    copy.name = `${selected.name} copy`;
    copy.seed += 1;
    copy.x += this.gridStep();
    copy.y += this.gridStep();
    this.nextOrdinal = ordinal + 1;
    this.document.objects.push(copy);
    const view = new SceneObjectView(copy, 10 + this.document.objects.length - 1);
    this.views.set(copy.id, view);
    this.scene.add(view.container);
    this.selectedId = copy.id;
    this.commit(`${copy.name} duplicated.`);
    this.renderOutliner();
    this.refreshInspector();
  }

  private deleteSelected(): void {
    const selected = this.selectedData();
    if (selected === null) return;
    this.views.get(selected.id)?.dispose();
    this.views.delete(selected.id);
    this.document.objects = this.document.objects.filter((object) => object.id !== selected.id);
    this.selectedId = null;
    this.rerankViews();
    this.commit(`${selected.name} deleted.`);
    this.renderOutliner();
    this.refreshInspector();
  }

  private regenerateSelected(): void {
    const selected = this.selectedData();
    const view = this.selectedView();
    if (selected === null || view === null) return;
    selected.seed += 1;
    view.rebuild();
    this.commit(`${selected.name} regenerated with seed ${selected.seed}.`);
    this.refreshInspector();
  }

  private undo(): void {
    const previous = this.history.undo();
    if (previous === null) return;
    this.document = previous;
    this.rebuildScene();
    this.announce('Last change undone.');
  }

  private redo(): void {
    const next = this.history.redo();
    if (next === null) return;
    this.document = next;
    this.rebuildScene();
    this.announce('Change restored.');
  }

  private newDocument(): void {
    this.document = { version: 1, name: 'Untitled', objects: [] };
    this.selectedId = null;
    this.history.commit(this.document);
    this.rebuildScene();
    this.announce('New empty level created.');
  }

  private async importDocument(): Promise<void> {
    const file = this.elements.importInput.files?.[0];
    this.elements.importInput.value = '';
    if (file === undefined) return;
    try {
      this.document = parseSceneDocument(await file.text());
      this.selectedId = null;
      this.history.reset(this.document);
      this.rebuildScene();
      this.announce(`Level “${this.document.name}” imported.`);
    } catch (error) {
      this.announce(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  private commit(message: string): void {
    this.history.commit(this.document);
    this.updateHistoryControls();
    this.announce(message);
  }

  private updateHistoryControls(): void {
    this.elements.undo.disabled = !this.history.canUndo;
    this.elements.redo.disabled = !this.history.canRedo;
  }

  private selectedData(): SceneObjectData | null {
    if (this.selectedId === null) return null;
    return this.document.objects.find((object) => object.id === this.selectedId) ?? null;
  }

  private selectedView(): SceneObjectView | null {
    return this.selectedId === null ? null : this.views.get(this.selectedId) ?? null;
  }

  private refreshLiveInspector(selected: SceneObjectData): void {
    const setValue = (property: string, value: string): void => {
      const input = this.elements.inspectorForm.elements.namedItem(property);
      if (input instanceof HTMLInputElement) input.value = value;
    };
    setValue('x', selected.x.toFixed(2));
    setValue('y', selected.y.toFixed(2));
    setValue('width', selected.width.toFixed(2));
    setValue('height', selected.height.toFixed(2));
    setValue('rotation', (selected.rotation * 180 / Math.PI).toFixed(1));
  }

  private updateOverlay(): void {
    const rect = this.elements.viewport.getBoundingClientRect();
    this.overlay.update(this.selectedData(), this.camera, rect.width, rect.height);
  }

  private screenToWorld(clientX: number, clientY: number): Point {
    const rect = this.elements.viewport.getBoundingClientRect();
    const point = new THREE.Vector3(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
      0,
    ).unproject(this.camera);
    return { x: point.x, y: point.y };
  }

  private gridStep(): number {
    const value = Number(this.elements.gridSize.value);
    return Number.isFinite(value) && value > 0 ? value : 0.5;
  }

  private snap(value: number): number {
    return this.elements.snap.checked ? Math.round(value / this.gridStep()) * this.gridStep() : value;
  }

  private snapSize(value: number): number {
    return this.elements.snap.checked ? Math.max(this.gridStep(), Math.round(value / this.gridStep()) * this.gridStep()) : value;
  }

  private rebuildGrid(): void {
    this.disposeGrid();
    this.grid = createGrid(this.gridStep());
    this.scene.add(this.grid);
    this.announce(`Grid set to ${this.gridStep()} units.`);
  }

  private disposeGrid(): void {
    this.grid.removeFromParent();
    for (const child of this.grid.children) {
      if (isGridLine(child)) {
        child.geometry.dispose();
        child.material.dispose();
      }
    }
  }

  private rerankViews(): void {
    for (const [index, object] of this.document.objects.entries()) this.views.get(object.id)?.setDrawRank(10 + index);
  }

  private resize(): void {
    const width = Math.max(1, this.elements.viewport.clientWidth);
    const height = Math.max(1, this.elements.viewport.clientHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.camera.left = -VIEW_HEIGHT * aspect / 2;
    this.camera.right = VIEW_HEIGHT * aspect / 2;
    this.camera.top = VIEW_HEIGHT / 2;
    this.camera.bottom = -VIEW_HEIGHT / 2;
    this.camera.updateProjectionMatrix();
    this.updateOverlay();
  }

  private frame(timeMilliseconds: number): void {
    const time = timeMilliseconds / 1000;
    const delta = this.previousTime === 0 ? 0 : clamp(time - this.previousTime, 0, 0.1);
    this.previousTime = time;
    this.elapsed += delta;
    if (!this.reducedMotion.matches) {
      for (const view of this.views.values()) view.update(this.elapsed, delta);
    }
    this.renderer.render(this.scene, this.camera);
    this.frameRequest = requestAnimationFrame((next): void => { this.frame(next); });
  }

  private announce(message: string): void {
    this.elements.status.textContent = message;
  }
}
