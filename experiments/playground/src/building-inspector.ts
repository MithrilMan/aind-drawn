import type { Bounds, SceneryRecipe } from '../../../src/index.js';
import { createBuildingRecipe, createObjectBlueprint } from './catalog.js';
import type { SceneObjectData } from './document.js';
import { BlueprintThumbnailRenderer } from './blueprint-thumbnail.js';

export type BuildingOptionProperty =
  | 'buildingRoof'
  | 'buildingDoorStyle'
  | 'buildingBalcony'
  | 'buildingChimney'
  | 'buildingDoorState';

type Variant = Readonly<{ value: string; label: string }>;
type VariantGroup = Readonly<{
  property: BuildingOptionProperty;
  label: string;
  variants: readonly Variant[];
}>;

type FeaturePreview = Readonly<{
  layerIds: readonly string[];
  frameBounds: Bounds;
}>;

const GROUPS: readonly VariantGroup[] = Object.freeze([
  {
    property: 'buildingRoof',
    label: 'Roof',
    variants: Object.freeze([
      { value: 'seeded', label: 'Seeded' },
      { value: 'flat', label: 'Flat' },
      { value: 'gable', label: 'Gable' },
      { value: 'crooked', label: 'Crooked' },
      { value: 'shed', label: 'Shed' },
      { value: 'mansard', label: 'Mansard' },
    ]),
  },
  {
    property: 'buildingDoorStyle',
    label: 'Door',
    variants: Object.freeze([
      { value: 'seeded', label: 'Seeded' },
      { value: 'arched', label: 'Arched' },
      { value: 'panel', label: 'Panel' },
      { value: 'plank', label: 'Plank' },
    ]),
  },
  {
    property: 'buildingBalcony',
    label: 'Balconies',
    variants: Object.freeze([
      { value: 'seeded', label: 'Seeded' },
      { value: 'present', label: 'On' },
      { value: 'absent', label: 'Off' },
    ]),
  },
  {
    property: 'buildingChimney',
    label: 'Chimney',
    variants: Object.freeze([
      { value: 'seeded', label: 'Seeded' },
      { value: 'present', label: 'On' },
      { value: 'absent', label: 'Off' },
    ]),
  },
  {
    property: 'buildingDoorState',
    label: 'Door state',
    variants: Object.freeze([
      { value: 'closed', label: 'Closed' },
      { value: 'open', label: 'Open' },
    ]),
  },
]);

function selectedValue(data: SceneObjectData, property: BuildingOptionProperty): string {
  const building = data.building;
  if (building === null) return '';
  if (property === 'buildingRoof') return building.roof ?? 'seeded';
  if (property === 'buildingDoorStyle') return building.doorStyle ?? 'seeded';
  if (property === 'buildingBalcony') return building.balcony === null ? 'seeded' : building.balcony ? 'present' : 'absent';
  if (property === 'buildingChimney') return building.chimney === null ? 'seeded' : building.chimney ? 'present' : 'absent';
  return building.doorState;
}

function featurePreview(
  data: SceneObjectData,
  recipe: SceneryRecipe,
  property: BuildingOptionProperty,
): FeaturePreview {
  const width = data.width;
  const height = data.height;
  const cellWidth = width / recipe.columns;
  if (property === 'buildingRoof') {
    const featureHeight = Math.max(1.05, Math.min(1.75, height * 0.32));
    return {
      layerIds: Object.freeze(['building:roof']),
      frameBounds: Object.freeze({
        x: -width / 2 - 0.16,
        y: height - featureHeight,
        width: width + 0.32,
        height: featureHeight + 0.12,
      }),
    };
  }
  if (property === 'buildingDoorStyle' || property === 'buildingDoorState') {
    const centerX = -width / 2 + cellWidth * (recipe.door.column + 0.5);
    return {
      layerIds: Object.freeze(['door']),
      frameBounds: Object.freeze({
        x: centerX - Math.max(0.65, cellWidth * 0.55),
        y: -0.08,
        width: Math.max(1.3, cellWidth * 1.1),
        height: Math.max(1.35, Math.min(2.1, height / recipe.floors * 1.35)),
      }),
    };
  }
  if (property === 'buildingChimney') {
    const centerX = recipe.chimney.side === 'left' ? -width * 0.28 : width * 0.28;
    const featureWidth = Math.max(0.72, Math.min(0.98, width * 0.18));
    const featureHeight = Math.max(0.9, Math.min(1.3, height * 0.23));
    return {
      layerIds: Object.freeze(['building:chimney']),
      frameBounds: Object.freeze({
        x: centerX - featureWidth / 2,
        y: height - featureHeight,
        width: featureWidth,
        height: featureHeight + 0.12,
      }),
    };
  }
  return {
    layerIds: Object.freeze(['building:balconies']),
    frameBounds: Object.freeze({
      x: -width / 2 - 0.12,
      y: Math.max(0.25, height * 0.12),
      width: width + 0.24,
      height: Math.max(1.4, height * 0.76),
    }),
  };
}

export function applyBuildingOption(
  data: SceneObjectData,
  property: BuildingOptionProperty,
  value: string,
): void {
  const building = data.building;
  if (building === null) return;
  if (property === 'buildingRoof') {
    if (value === 'seeded' || value === 'flat' || value === 'gable' || value === 'crooked' || value === 'shed' || value === 'mansard') {
      building.roof = value === 'seeded' ? null : value;
    }
  } else if (property === 'buildingDoorStyle') {
    if (value === 'seeded' || value === 'arched' || value === 'panel' || value === 'plank') {
      building.doorStyle = value === 'seeded' ? null : value;
    }
  } else if (property === 'buildingBalcony' || property === 'buildingChimney') {
    if (value === 'seeded' || value === 'present' || value === 'absent') {
      building[property === 'buildingBalcony' ? 'balcony' : 'chimney'] = value === 'seeded'
        ? null
        : value === 'present';
    }
  } else if (value === 'closed' || value === 'open') {
    building.doorState = value;
  }
}

export class BuildingInspector {
  private readonly root: HTMLElement;
  private readonly thumbnailRenderer = new BlueprintThumbnailRenderer();
  private readonly thumbnailCache = new Map<string, string>();
  private readonly onChange: (property: BuildingOptionProperty, value: string) => void;

  public constructor(
    root: HTMLElement,
    onChange: (property: BuildingOptionProperty, value: string) => void,
  ) {
    this.root = root;
    this.onChange = onChange;
  }

  public render(data: SceneObjectData): void {
    this.root.replaceChildren();
    if (data.kind !== 'building' || data.building === null) return;

    for (const group of GROUPS) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'variant-group';
      const legend = document.createElement('legend');
      legend.textContent = group.label;
      const options = document.createElement('div');
      options.className = 'variant-options';
      options.dataset.variantCount = String(group.variants.length);
      const current = selectedValue(data, group.property);
      for (const variant of group.variants) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'variant-button';
        button.dataset.selected = String(current === variant.value);
        button.setAttribute('aria-pressed', String(current === variant.value));
        button.setAttribute('aria-label', `${group.label}: ${variant.label}`);
        const image = document.createElement('img');
        image.alt = '';
        image.src = this.thumbnail(data, group.property, variant.value);
        const label = document.createElement('span');
        label.textContent = variant.label;
        button.append(image, label);
        button.addEventListener('click', (): void => {
          this.onChange(group.property, variant.value);
        });
        options.append(button);
      }
      fieldset.append(legend, options);
      this.root.append(fieldset);
    }
  }

  public dispose(): void {
    this.thumbnailRenderer.dispose();
    this.thumbnailCache.clear();
  }

  private thumbnail(
    source: SceneObjectData,
    property: BuildingOptionProperty,
    value: string,
  ): string {
    const data = structuredClone(source);
    applyBuildingOption(data, property, value);
    const recipe = createBuildingRecipe(data);
    const preview = featurePreview(data, recipe, property);
    const key = JSON.stringify({
      property,
      seed: data.seed,
      medium: data.medium,
      width: data.width,
      height: data.height,
      building: data.building,
    });
    const cached = this.thumbnailCache.get(key);
    if (cached !== undefined) return cached;
    const result = this.thumbnailRenderer.render(createObjectBlueprint(data), {
      interactionStates: { door: data.building?.doorState ?? 'closed' },
      layerIds: preview.layerIds,
      frameBounds: preview.frameBounds,
    });
    this.thumbnailCache.set(key, result);
    return result;
  }
}
