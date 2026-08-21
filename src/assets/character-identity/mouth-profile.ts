import type { Point } from '../../core/geometry.js';
import type {
  CharacterDentalStyle,
  CharacterIdentityRecipe,
  CharacterMouthStyle,
} from './recipe.js';
import type { CharacterExpression } from './expression-profile.js';

export type CharacterMouthLayerRole = 'ink' | 'interior' | 'tooth' | 'tongue';

export type CharacterMouthLayer = Readonly<{
  id: string;
  role: CharacterMouthLayerRole;
  /** Mouth-local head-radius units with positive Y pointing up. */
  outline: readonly Point[];
}>;

export type CharacterMouthStroke = Readonly<{
  id: string;
  /** Mouth-local head-radius units with positive Y pointing up. */
  points: readonly Point[];
}>;

export type CharacterMouthProfile = Readonly<{
  expression: CharacterExpression;
  layers: readonly CharacterMouthLayer[];
  strokes: readonly CharacterMouthStroke[];
}>;

function freezePoints(points: readonly Point[]): readonly Point[] {
  return Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)));
}

function layer(
  id: string,
  role: CharacterMouthLayerRole,
  outline: readonly Point[],
): CharacterMouthLayer {
  return Object.freeze({ id, role, outline: freezePoints(outline) });
}

function stroke(id: string, points: readonly Point[]): CharacterMouthStroke {
  return Object.freeze({ id, points: freezePoints(points) });
}

function ellipse(width: number, height: number, count = 24): readonly Point[] {
  return Array.from({ length: count }, (_, index): Point => {
    const angle = index / count * Math.PI * 2;
    return [Math.cos(angle) * width, Math.sin(angle) * height];
  });
}

function rectangle(width: number, height: number): readonly Point[] {
  return [[-width, -height], [width, -height], [width, height], [-width, height]];
}

function band(
  width: number,
  thickness: number,
  curve: (normalizedX: number) => number,
  count = 14,
): readonly Point[] {
  const edge = (index: number, sign: number): Point => {
    const x = -width + index / (count - 1) * width * 2;
    return [x, curve(x / width) + sign * thickness];
  };
  return [
    ...Array.from({ length: count }, (_, index) => edge(index, 1)),
    ...Array.from({ length: count }, (_, index) => edge(count - 1 - index, -1)),
  ];
}

function semanticCurve(style: CharacterMouthStyle, bend: number) {
  if (style === 'zigzag') {
    return (x: number): number => {
      const segment = Math.min(3, Math.floor((x + 1) * 2));
      const local = (x + 1) * 2 - segment;
      const from = segment % 2 === 0 ? bend : -bend;
      const to = -from;
      return from + (to - from) * local;
    };
  }
  if (style === 'cat') {
    return (x: number): number => bend * Math.sin(Math.abs(x) * Math.PI);
  }
  return (x: number): number => bend * (1 - x * x);
}

function dentalLayers(
  dental: CharacterDentalStyle,
  count: number,
  width: number,
  height: number,
): Readonly<{ layers: CharacterMouthLayer[]; strokes: CharacterMouthStroke[] }> {
  const layers: CharacterMouthLayer[] = [];
  const strokes: CharacterMouthStroke[] = [];
  if (dental === 'none') return { layers, strokes };
  if (dental === 'grit') {
    layers.push(layer('teeth', 'tooth', rectangle(width * 0.76, height * 0.56)));
    for (let index = 1; index < count; index += 1) {
      const x = -width * 0.72 + index / count * width * 1.44;
      strokes.push(stroke(`tooth-divider:${index}`, [[x, -height * 0.5], [x, height * 0.5]]));
    }
    strokes.push(stroke('tooth-split', [[-width * 0.72, 0], [width * 0.72, 0]]));
    return { layers, strokes };
  }
  if (dental === 'buck') {
    const toothWidth = width * 0.22;
    const toothHeight = Math.max(height * 0.72, width * 0.2);
    for (const side of [-1, 1]) {
      layers.push(layer(
        `buck:${side < 0 ? 'left' : 'right'}`,
        'tooth',
        rectangle(toothWidth, toothHeight).map(([x, y]) => [
          x + side * toothWidth * 1.04,
          y - toothHeight * 0.72,
        ] as const),
      ));
    }
    return { layers, strokes };
  }
  if (dental === 'fangs') {
    for (const side of [-1, 1]) {
      const center = side * width * 0.48;
      layers.push(layer(`fang:${side < 0 ? 'left' : 'right'}`, 'tooth', [
        [center - width * 0.13, height * 0.58],
        [center + width * 0.13, height * 0.58],
        [center, -height * 0.45],
      ]));
    }
    return { layers, strokes };
  }
  for (let index = 0; index < count; index += 1) {
    const amount = (index + 0.5) / count;
    const center = -width * 0.7 + amount * width * 1.4;
    layers.push(layer(`tooth:${index}`, 'tooth', [
      [center - width * 0.1, height * 0.62],
      [center + width * 0.1, height * 0.62],
      [center, height * 0.02],
    ]));
  }
  return { layers, strokes };
}

function constructedMaw(
  expression: CharacterExpression,
  width: number,
  height: number,
  dental: CharacterDentalStyle,
  toothCount: number,
  tongue: boolean,
): CharacterMouthProfile {
  const layers: CharacterMouthLayer[] = [
    layer('lip', 'ink', ellipse(width, height)),
    layer('interior', 'interior', ellipse(width * 0.84, height * 0.76)),
  ];
  const teeth = dentalLayers(dental, toothCount, width, height);
  layers.push(...teeth.layers);
  if (tongue && dental !== 'grit') {
    layers.push(layer(
      'tongue',
      'tongue',
      ellipse(width * 0.34, height * 0.3).map(([x, y]) => [x, y - height * 0.45] as const),
    ));
  }
  return Object.freeze({
    expression,
    layers: Object.freeze(layers),
    strokes: Object.freeze(teeth.strokes),
  });
}

export function createCharacterMouthProfile(
  mouth: CharacterIdentityRecipe['mouth'],
  expression: CharacterExpression = 'idle',
): CharacterMouthProfile {
  const baseWidth = mouth.width * (mouth.style === 'tiny' ? 0.58 : 1);
  if (expression === 'angry') {
    return constructedMaw(expression, baseWidth * 0.94, Math.max(0.055, baseWidth * 0.2), 'grit', 4, false);
  }
  if (expression === 'scared' || expression === 'surprised') {
    const factor = expression === 'scared' ? 0.52 : 0.68;
    return constructedMaw(expression, baseWidth * factor, Math.max(0.11, baseWidth * 0.48), 'none', 0, false);
  }
  if (expression === 'crying') {
    return constructedMaw(expression, baseWidth * 1.08, Math.max(0.09, baseWidth * 0.34), 'none', 0, false);
  }
  if (expression === 'sleeping') {
    const width = baseWidth * 0.34;
    const outline = band(width, Math.max(0.016, width * 0.09), semanticCurve('flat', 0));
    return Object.freeze({
      expression,
      layers: Object.freeze([layer('lip', 'ink', outline)]),
      strokes: Object.freeze([]),
    });
  }

  const width = baseWidth * (expression === 'happy' ? 1.12 : 1);
  const open = mouth.style === 'open' || mouth.style === 'maw' || mouth.style === 'grin';
  if (open) {
    const dental = mouth.style === 'grin' ? 'grit'
      : mouth.style === 'maw' && mouth.teeth === 'none' ? 'row' : mouth.teeth;
    return constructedMaw(
      expression,
      width,
      Math.max(0.09, width * (mouth.style === 'grin' ? 0.28 : 0.42)),
      dental,
      mouth.toothCount,
      mouth.tongue,
    );
  }

  const bend = expression === 'happy' ? -width * 0.34
    : expression === 'sad' ? width * 0.34
      : mouth.style === 'smile' || mouth.style === 'cat' ? -width * 0.25
        : mouth.style === 'frown' ? width * 0.25
          : mouth.style === 'zigzag' ? width * 0.16 : 0;
  const style = expression === 'idle' ? mouth.style : 'flat';
  const outline = band(width, Math.max(0.018, width * 0.075), semanticCurve(style, bend));
  const layers = [layer('lip', 'ink', outline)];
  const strokes: CharacterMouthStroke[] = [];

  if (mouth.style === 'stitch') {
    const count = Math.max(3, mouth.toothCount);
    for (let index = 0; index < count; index += 1) {
      const x = -width * 0.72 + (index + 0.5) / count * width * 1.44;
      strokes.push(stroke(`stitch:${index}`, [
        [x - width * 0.05, -width * 0.12],
        [x + width * 0.05, width * 0.12],
      ]));
    }
  } else {
    const teeth = dentalLayers(mouth.teeth, mouth.toothCount, width, Math.max(0.08, width * 0.3));
    layers.push(...teeth.layers);
    strokes.push(...teeth.strokes);
  }

  return Object.freeze({
    expression,
    layers: Object.freeze(layers),
    strokes: Object.freeze(strokes),
  });
}
