import {
  type AssetAuthoringParameter,
  type AssetAuthoringValue,
  type MediumId,
} from '../../../src/index.js';
import { BlueprintPreviewRenderer } from './blueprint-preview.js';
import {
  type FamilyCustomization,
  type StudioFamilyDefinition,
  updateCustomization,
} from './family-catalog.js';

type CustomizationChangeHandler = (
  parameterId: string,
  value: AssetAuthoringValue,
) => void;

function valueKey(value: AssetAuthoringValue): string {
  return `${typeof value}:${String(value)}`;
}

export class FamilyCustomizer {
  private readonly tabs: HTMLElement;
  private readonly editor: HTMLElement;
  private readonly title: HTMLElement;
  private readonly description: HTMLElement;
  private readonly variants: HTMLElement;
  private readonly previewRenderer = new BlueprintPreviewRenderer();
  private readonly onChange: CustomizationChangeHandler;
  private readonly activeParameterByFamily = new Map<string, string>();
  private readonly previewCache = new Map<string, string>();
  private renderToken = 0;
  private family: StudioFamilyDefinition | null = null;
  private seed = 0;
  private medium: MediumId = 'graphite';
  private customization: FamilyCustomization = Object.freeze({});

  public constructor(
    tabs: HTMLElement,
    editor: HTMLElement,
    onChange: CustomizationChangeHandler,
  ) {
    this.tabs = tabs;
    this.editor = editor;
    this.onChange = onChange;
    this.title = this.required('[data-parameter-title]');
    this.description = this.required('[data-parameter-description]');
    this.variants = this.required('[data-variant-options]');
  }

  public render(
    family: StudioFamilyDefinition,
    seed: number,
    medium: MediumId,
    customization: FamilyCustomization,
  ): void {
    const familyChanged = this.family?.id !== family.id;
    this.family = family;
    this.seed = seed;
    this.medium = medium;
    this.customization = customization;
    if (familyChanged) this.tabs.scrollTop = 0;
    const remembered = this.activeParameterByFamily.get(family.id);
    const activeId = family.authoring.parameters.some(({ id }) => id === remembered)
      ? remembered
      : family.authoring.parameters[0]?.id;
    if (activeId === undefined) throw new Error(`Family ${family.id} has no authoring parameters`);
    this.activeParameterByFamily.set(family.id, activeId);
    this.renderTabs(activeId);
    this.renderParameter(activeId);
  }

  public dispose(): void {
    this.renderToken += 1;
    this.previewRenderer.dispose();
    this.previewCache.clear();
  }

  private renderTabs(activeId: string): void {
    const family = this.family;
    if (family === null) return;
    const buttons = family.authoring.parameters.map((parameter) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = parameter.label;
      button.setAttribute('aria-current', String(parameter.id === activeId));
      button.addEventListener('click', () => {
        this.activeParameterByFamily.set(family.id, parameter.id);
        this.renderTabs(parameter.id);
        this.renderParameter(parameter.id);
      });
      return button;
    });
    this.tabs.replaceChildren(...buttons);
  }

  private renderParameter(parameterId: string): void {
    const family = this.family;
    if (family === null) return;
    const parameter = family.authoring.parameters.find(({ id }) => id === parameterId);
    if (parameter === undefined) throw new Error(`Unknown authoring parameter: ${parameterId}`);
    this.renderToken += 1;
    this.title.textContent = parameter.label;
    this.description.textContent = parameter.description
      ?? 'Each option redraws both views from the same identity.';
    if (parameter.kind === 'choice') this.renderChoices(parameter);
    else if (parameter.kind === 'range') this.renderRange(parameter);
    else this.renderToggle(parameter);
  }

  private renderChoices(parameter: Extract<AssetAuthoringParameter, { kind: 'choice' }>): void {
    const family = this.family;
    if (family === null) return;
    const current = this.customization[parameter.id] ?? null;
    const token = this.renderToken;
    const previews: (() => void)[] = [];
    const buttons = parameter.options.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'variant-button';
      button.setAttribute('aria-pressed', String(valueKey(current) === valueKey(option.value)));
      button.setAttribute('aria-label', `${parameter.label}: ${option.label}`);
      const image = document.createElement('img');
      image.alt = '';
      const label = document.createElement('span');
      label.textContent = option.label;
      button.append(image, label);
      button.addEventListener('click', () => {
        this.onChange(parameter.id, option.value);
      });
      previews.push(() => {
        if (token !== this.renderToken) return;
        image.src = this.previewFor(parameter, option.value);
      });
      return button;
    });
    this.variants.className = 'variant-options';
    this.variants.replaceChildren(...buttons);
    this.schedulePreviews(previews, token);
  }

  private renderRange(parameter: Extract<AssetAuthoringParameter, { kind: 'range' }>): void {
    const current = this.customization[parameter.id];
    const numericValue = typeof current === 'number' ? current : parameter.minimum;
    const wrapper = document.createElement('label');
    wrapper.className = 'parameter-range-editor';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(parameter.minimum);
    input.max = String(parameter.maximum);
    input.step = String(parameter.step);
    input.value = String(numericValue);
    const output = document.createElement('output');
    output.textContent = String(numericValue);
    input.addEventListener('input', () => {
      output.textContent = input.value;
      this.onChange(parameter.id, Number(input.value));
    });
    wrapper.append(input, output);
    this.variants.className = 'variant-options';
    this.variants.replaceChildren(wrapper);
  }

  private renderToggle(parameter: Extract<AssetAuthoringParameter, { kind: 'toggle' }>): void {
    const options = [
      { value: false, label: parameter.offLabel },
      { value: true, label: parameter.onLabel },
    ];
    const current = this.customization[parameter.id] === true;
    const buttons = options.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'control-button';
      button.textContent = option.label;
      button.setAttribute('aria-pressed', String(current === option.value));
      button.addEventListener('click', () => {
        this.onChange(parameter.id, option.value);
      });
      return button;
    });
    this.variants.className = 'variant-options toggle-variants';
    this.variants.replaceChildren(...buttons);
  }

  private previewFor(parameter: AssetAuthoringParameter, value: AssetAuthoringValue): string {
    const family = this.family;
    if (family === null) return '';
    const next = updateCustomization(this.customization, parameter.id, value);
    const key = JSON.stringify({
      family: family.id,
      seed: this.seed,
      medium: this.medium,
      customization: next,
      parameter: parameter.id,
    });
    const cached = this.previewCache.get(key);
    if (cached !== undefined) return cached;
    const projection = family.createProjection(
      this.seed,
      this.medium,
      next,
      family.defaultFinish,
    );
    const result = this.previewRenderer.render(projection.raster, {
      ...(parameter.preview?.rasterLayerIds === undefined
        ? {} : { layerIds: parameter.preview.rasterLayerIds }),
      ...(parameter.preview?.rasterLayerStates === undefined
        ? {} : { layerStates: parameter.preview.rasterLayerStates }),
    });
    this.previewCache.set(key, result);
    return result;
  }

  private schedulePreviews(tasks: readonly (() => void)[], token: number): void {
    const pending = [...tasks];
    const run = (): void => {
      if (token !== this.renderToken) return;
      pending.shift()?.();
      if (pending.length > 0) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }

  private required(selector: string): HTMLElement {
    const element = this.editor.querySelector<HTMLElement>(selector);
    if (element === null) throw new Error(`Customizer is missing ${selector}`);
    return element;
  }
}
