import type { CanvasFactory, DrawingCanvas, DrawingContext } from './canvas.js';
import { automaticCanvasFactory } from './canvas.js';
import {
  TAU,
  boundsOf,
  chaikin,
  clamp,
  resample,
  smoothStep,
  type MutablePoint,
  type Point,
} from './geometry.js';
import { Random, type Seed } from './random.js';
import {
  artRolesForPart,
  resolveDrawingIntent as resolveDirectedDrawingIntent,
  transformArtDirectionColor,
  type ArtRole,
  type AssetAppearance,
} from '../appearance/art-direction.js';
import type { DrawingIntent } from '../materials/drawing.js';

export type RgbColor = readonly [red: number, green: number, blue: number];

export const PAPER = '#f6f1e5';
export const PAPER_RGB: RgbColor = [246, 241, 229];
export const INK: RgbColor = [31, 29, 26];

export const SKIN_COLORS: readonly RgbColor[] = [
  [138, 93, 66],
  [164, 113, 79],
  [192, 138, 92],
  [176, 107, 62],
  [227, 201, 160],
  [217, 169, 143],
  [156, 136, 120],
  [221, 198, 135],
];

export const ACCENT_COLORS: readonly RgbColor[] = [
  [168, 72, 60],
  [86, 130, 120],
  [178, 134, 58],
];

export type StrokeOptions = Readonly<{
  alpha?: number;
  amplitude?: number;
  taper?: number;
  overshoot?: number;
  ghost?: boolean;
  wedge?: boolean;
}>;

export type WashOptions = Readonly<{
  layers?: number;
  alpha?: number;
  bleed?: number;
  rim?: boolean;
  blooms?: boolean;
}>;

export type OilOptions = Readonly<{
  alpha?: number;
  angle?: number;
  density?: number;
}>;

export type ChalkOptions = Readonly<{
  alpha?: number;
  density?: number;
}>;

export class Sketch {
  public readonly canvas: DrawingCanvas;
  public readonly context: DrawingContext;
  public readonly width: number;
  public readonly height: number;

  private baseInk: RgbColor = INK;
  private ink: RgbColor = INK;
  private paper: RgbColor = PAPER_RGB;
  private random: Random;
  private appearance: AssetAppearance | null = null;
  private artRoles: readonly ArtRole[] = Object.freeze([]);

  public constructor(
    width: number,
    height: number,
    seed: Seed,
    canvasFactory: CanvasFactory = automaticCanvasFactory,
  ) {
    const surface = canvasFactory(width, height);
    this.canvas = surface.canvas;
    this.context = surface.context;
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.random = new Random(seed);
  }

  public reseed(seed: Seed): void {
    this.random = new Random(seed);
  }

  public jitter(minimum: number, maximum: number): number {
    return this.random.float(minimum, maximum);
  }

  public integer(minimum: number, maximum: number): number {
    return this.random.integer(minimum, maximum);
  }

  public chance(probability: number): boolean {
    return this.random.chance(probability);
  }

  public pick<T>(values: readonly T[]): T {
    return this.random.pick(values);
  }

  public setInk(color: RgbColor | null): void {
    this.ink = color ?? this.baseInk;
  }

  public setBaseInk(color: RgbColor | null): void {
    this.baseInk = color ?? INK;
    this.ink = this.baseInk;
  }

  public setPaperColor(color: RgbColor | null): void {
    this.paper = color ?? PAPER_RGB;
  }

  public setAppearance(appearance: AssetAppearance, semanticPartId: string): void {
    this.appearance = appearance;
    this.artRoles = artRolesForPart(appearance, semanticPartId);
  }

  public resolveDrawingIntent(intent: DrawingIntent): DrawingIntent {
    if (this.appearance === null) return intent;
    return resolveDirectedDrawingIntent(intent, this.appearance.artDirection, this.artRoles);
  }

  public get markSpacingScale(): number {
    return this.appearance?.artDirection.drawing.markSpacingScale ?? 1;
  }

  public get contourScale(): number {
    return this.appearance?.artDirection.drawing.contourScale ?? 1;
  }

  public get paperColor(): RgbColor {
    return this.paper;
  }

  public inkAlpha(alpha: number): string {
    return this.formatColor(this.ink, alpha);
  }

  public paperAlpha(alpha: number): string {
    return this.formatColor(this.paper, alpha);
  }

  public colorAlpha(color: RgbColor, alpha: number): string {
    const directed = this.appearance === null
      ? color
      : transformArtDirectionColor(color, this.appearance.artDirection, this.artRoles);
    return this.formatColor(directed, alpha);
  }

  private formatColor(color: RgbColor, alpha: number): string {
    return `rgba(${color[0]},${color[1]},${color[2]},${clamp(alpha, 0, 1)})`;
  }

  public mixColor(color: RgbColor, factor: number): RgbColor {
    return color.map((channel) => Math.round(clamp(channel * factor, 0, 255))) as unknown as RgbColor;
  }

  public polygon(points: readonly Point[], close = true): void {
    if (points.length === 0) {
      return;
    }
    const first = points[0] as Point;
    this.context.beginPath();
    this.context.moveTo(first[0], first[1]);
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index] as Point;
      this.context.lineTo(point[0], point[1]);
    }
    if (close) {
      this.context.closePath();
    }
  }

  public blobPoints(
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    rotation = this.jitter(0, TAU),
    wobble = 1,
  ): MutablePoint[] {
    const phase = this.jitter(0, 7);
    const count = 16;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const points: MutablePoint[] = [];

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * TAU;
      const modulation = 1 + (
        0.17 * Math.sin(angle * 2 + phase)
        + 0.1 * Math.sin(angle * 5 + phase * 2.3)
      ) * wobble;
      const x = Math.cos(angle) * radiusX * modulation;
      const y = Math.sin(angle) * radiusY * modulation;
      points.push([
        centerX + x * cosine - y * sine,
        centerY + x * sine + y * cosine,
      ]);
    }
    return chaikin(points, true, 1);
  }

  public wobblyEllipse(
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
  ): void {
    const phase = this.jitter(0, 7);
    const count = 18;
    this.context.beginPath();
    for (let index = 0; index <= count; index += 1) {
      const angle = (index / count) * TAU;
      const modulation = 1
        + 0.05 * Math.sin(angle * 3 + phase)
        + 0.03 * Math.sin(angle * 7 + phase * 2);
      const x = centerX + Math.cos(angle) * radiusX * modulation + this.jitter(-0.3, 0.3);
      const y = centerY + Math.sin(angle) * radiusY * modulation + this.jitter(-0.3, 0.3);
      if (index === 0) {
        this.context.moveTo(x, y);
      } else {
        this.context.lineTo(x, y);
      }
    }
    this.context.closePath();
  }

  public stroke(points: readonly Point[], width: number, options: StrokeOptions = {}): void {
    if (points.length < 2 || width <= 0) {
      return;
    }

    const alpha = options.alpha ?? this.jitter(0.68, 0.97);
    const amplitude = options.amplitude ?? width * 0.5 + 0.9;
    const taper = options.taper ?? 0.22;
    const prepared = this.withOvershoot(points, options.overshoot ?? 0);
    const sampled = resample(prepared, Math.max(2.2, width * 0.9));

    if (sampled.length < 3) {
      this.context.strokeStyle = this.inkAlpha(alpha);
      this.context.lineWidth = width;
      this.context.lineCap = 'round';
      this.polygon(prepared, false);
      this.context.stroke();
      return;
    }

    const phases = [
      this.jitter(0, 7),
      this.jitter(0, 7),
      this.jitter(0, 7),
      this.jitter(0, 7),
    ] as const;
    const frequencies = [this.jitter(1.5, 3.5), this.jitter(5, 9), this.jitter(11, 17)] as const;
    const left: MutablePoint[] = [];
    const right: MutablePoint[] = [];
    const samples: (readonly [number, number, number, number, number])[] = [];
    const finalIndex = sampled.length - 1;

    for (let index = 0; index < sampled.length; index += 1) {
      const amount = index / finalIndex;
      const previous = sampled[Math.max(0, index - 1)] as Point;
      const next = sampled[Math.min(finalIndex, index + 1)] as Point;
      const current = sampled[index] as Point;
      let normalX = -(next[1] - previous[1]);
      let normalY = next[0] - previous[0];
      const magnitude = Math.hypot(normalX, normalY) || 1;
      normalX /= magnitude;
      normalY /= magnitude;

      const offset = amplitude * (
        0.55 * Math.sin(amount * frequencies[0] * 2 + phases[0])
        + 0.3 * Math.sin(amount * frequencies[1] + phases[1])
        + 0.15 * Math.sin(amount * frequencies[2] + phases[2])
      );
      const x = current[0] + normalX * offset + this.jitter(-0.35, 0.35);
      const y = current[1] + normalY * offset + this.jitter(-0.35, 0.35);
      const endFactor = options.wedge
        ? 0.25 + 0.95 * amount
        : 0.3 + 0.7 * smoothStep(Math.min(amount, 1 - amount) / taper);
      const widthNoise = 1
        + 0.38 * Math.sin(amount * 7.3 + phases[3])
        + 0.14 * Math.sin(amount * 19 + phases[1]);
      const halfWidth = Math.max(0.28, width * 0.5 * endFactor * widthNoise * this.jitter(0.88, 1.14));

      left.push([x + normalX * halfWidth, y + normalY * halfWidth]);
      right.push([x - normalX * halfWidth, y - normalY * halfWidth]);
      samples.push([x, y, normalX, normalY, halfWidth]);
    }

    const leftFirst = left[0] as Point;
    this.context.beginPath();
    this.context.moveTo(leftFirst[0], leftFirst[1]);
    for (let index = 1; index < left.length; index += 1) {
      const point = left[index] as Point;
      this.context.lineTo(point[0], point[1]);
    }
    for (let index = right.length - 1; index >= 0; index -= 1) {
      const point = right[index] as Point;
      this.context.lineTo(point[0], point[1]);
    }
    this.context.closePath();
    this.context.fillStyle = this.inkAlpha(alpha * 0.62);
    this.context.fill();

    if (width >= 1.2) {
      this.granulateStroke(samples, alpha);
    }

    if (options.ghost === true && this.chance(0.6)) {
      this.stroke(points, width * 0.45, {
        alpha: alpha * 0.2,
        amplitude: amplitude * 1.9,
        taper,
      });
    }
  }

  public brokenStroke(points: readonly Point[], width: number, options: StrokeOptions = {}): void {
    if (points.length < 10) {
      this.stroke(points, width, options);
      return;
    }
    const segments = this.integer(2, 3);
    for (let segment = 0; segment < segments; segment += 1) {
      const start = Math.max(0, Math.floor((points.length * segment) / segments - points.length * 0.05));
      const end = Math.min(
        points.length,
        Math.floor((points.length * (segment + 1)) / segments + points.length * 0.09),
      );
      const overshoot = segment === 0 || segment === segments - 1
        ? options.overshoot
        : width * this.jitter(0, 2);
      this.stroke(points.slice(start, end), width * this.jitter(0.6, 1.3), {
        ...options,
        alpha: (options.alpha ?? this.jitter(0.68, 0.97)) * this.jitter(0.75, 1.05),
        ...(overshoot === undefined ? {} : { overshoot }),
      });
    }
  }

  public line(points: readonly Point[], width: number, alpha: number, color?: string): void {
    if (points.length < 2) {
      return;
    }
    const sampled = resample(points, 3);
    const phase1 = this.jitter(0, 7);
    const phase2 = this.jitter(0, 7);
    const frequency = this.jitter(4, 9);
    this.context.beginPath();
    let lifted = false;
    const finalIndex = sampled.length - 1;

    for (let index = 0; index < sampled.length; index += 1) {
      const amount = index / Math.max(1, finalIndex);
      const previous = sampled[Math.max(0, index - 1)] as Point;
      const next = sampled[Math.min(finalIndex, index + 1)] as Point;
      const current = sampled[index] as Point;
      const normalX = -(next[1] - previous[1]);
      const normalY = next[0] - previous[0];
      const magnitude = Math.hypot(normalX, normalY) || 1;
      const offset = (width * 0.55 + 0.5) * (
        0.6 * Math.sin(amount * frequency + phase1)
        + 0.4 * Math.sin(amount * frequency * 2.7 + phase2)
      );
      const x = current[0] + (normalX / magnitude) * offset + this.jitter(-0.45, 0.45);
      const y = current[1] + (normalY / magnitude) * offset + this.jitter(-0.45, 0.45);
      if (index === 0 || lifted) {
        this.context.moveTo(x, y);
      } else {
        this.context.lineTo(x, y);
      }
      lifted = this.chance(0.035);
    }

    this.context.strokeStyle = color ?? this.inkAlpha(alpha);
    this.context.lineWidth = width * this.jitter(0.75, 1.3);
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    this.context.stroke();
  }

  public hatch(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    angle: number,
    count: number,
    alpha: number,
    lineWidth = 1.1,
  ): void {
    const perpendicularX = Math.cos(angle + Math.PI / 2);
    const perpendicularY = Math.sin(angle + Math.PI / 2);
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    for (let index = 0; index < count; index += 1) {
      const amount = (index / Math.max(1, count - 1) - 0.5) * width;
      const lengthJitter = this.jitter(0.75, 1.2);
      const offset = this.jitter(-0.1, 0.1) * height;
      this.line([
        [centerX + perpendicularX * amount - directionX * height * 0.5 * lengthJitter + offset * directionX,
          centerY + perpendicularY * amount - directionY * height * 0.5 * lengthJitter + offset * directionY],
        [centerX + perpendicularX * amount + directionX * height * 0.5 * lengthJitter + offset * directionX,
          centerY + perpendicularY * amount + directionY * height * 0.5 * lengthJitter + offset * directionY],
      ], lineWidth, alpha * this.jitter(0.6, 1.15));
    }
  }

  public hatchFill(
    points: readonly Point[],
    spacing: number,
    angle: number,
    alpha: number,
    lineWidth = 1.1,
  ): void {
    if (points.length < 3 || spacing <= 0) {
      return;
    }
    const bounds = boundsOf(points);
    const diagonal = Math.hypot(bounds.width, bounds.height);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const perpendicularX = Math.cos(angle + Math.PI / 2);
    const perpendicularY = Math.sin(angle + Math.PI / 2);
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const count = Math.ceil(diagonal / spacing);

    this.context.save();
    this.polygon(points);
    this.context.clip();
    for (let index = -count; index <= count; index += 1) {
      const amount = index * spacing + this.jitter(-0.2, 0.2) * spacing;
      this.line([
        [centerX + perpendicularX * amount - directionX * diagonal * 0.6,
          centerY + perpendicularY * amount - directionY * diagonal * 0.6],
        [centerX + perpendicularX * amount + directionX * diagonal * 0.6,
          centerY + perpendicularY * amount + directionY * diagonal * 0.6],
      ], lineWidth, alpha * this.jitter(0.6, 1.1));
    }
    this.context.restore();
  }

  public stippleFill(points: readonly Point[], spacing: number, alpha: number): void {
    if (points.length < 3 || spacing <= 0) {
      return;
    }
    const bounds = boundsOf(points);
    const count = Math.max(0, Math.round((bounds.width * bounds.height) / (spacing * spacing)));
    this.context.save();
    this.polygon(points);
    this.context.clip();
    for (let index = 0; index < count; index += 1) {
      const size = this.jitter(0.8, 1.8);
      this.context.fillStyle = this.inkAlpha(alpha * this.jitter(0.5, 1.2));
      this.context.fillRect(
        this.jitter(bounds.x, bounds.x + bounds.width),
        this.jitter(bounds.y, bounds.y + bounds.height),
        size,
        size,
      );
    }
    this.context.restore();
  }

  public scribbleFill(points: readonly Point[], spacing: number, alpha: number): void {
    if (points.length < 3 || spacing <= 0) {
      return;
    }
    const bounds = boundsOf(points);
    this.context.save();
    this.polygon(points);
    this.context.clip();
    const slope = this.jitter(-0.25, 0.25);
    for (
      let y = bounds.y - spacing;
      y < bounds.y + bounds.height + spacing;
      y += spacing * this.jitter(0.8, 1.2)
    ) {
      const line: MutablePoint[] = [];
      const phase = this.jitter(0, 7);
      for (let x = bounds.x; x <= bounds.x + bounds.width; x += 5) {
        line.push([
          x,
          y + (x - bounds.x) * slope + Math.sin(x * 0.55 + phase) * spacing * 0.42 + this.jitter(-1, 1),
        ]);
      }
      this.line(line, 1, alpha * this.jitter(0.6, 1.05));
    }
    this.context.restore();
  }

  public pencilFill(points: readonly Point[], darkness: number): void {
    if (points.length < 3) {
      return;
    }
    const bounds = boundsOf(points);
    this.context.save();
    this.polygon(points);
    this.context.clip();
    this.context.fillStyle = this.inkAlpha(darkness * 0.48);
    this.context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

    for (let pass = 0; pass < 2; pass += 1) {
      const slope = this.jitter(-0.5, 0.5);
      const spacing = this.jitter(2.6, 3.8);
      for (
        let y = bounds.y - spacing;
        y < bounds.y + bounds.height + spacing;
        y += spacing * this.jitter(0.8, 1.25)
      ) {
        const line: MutablePoint[] = [];
        const phase = this.jitter(0, 7);
        for (let x = bounds.x; x <= bounds.x + bounds.width; x += 5) {
          line.push([
            x,
            y + (x - bounds.x) * slope + Math.sin(x * 0.5 + phase) * spacing * 0.4 + this.jitter(-1, 1),
          ]);
        }
        this.line(line, this.jitter(1.4, 2.2), darkness * this.jitter(0.42, 0.62));
      }
    }
    this.context.restore();
  }

  public inkFill(points: readonly Point[], alpha: number): void {
    this.polygon(points);
    this.context.fillStyle = this.inkAlpha(alpha);
    this.context.fill();
  }

  public paperFill(points: readonly Point[]): void {
    this.polygon(points);
    this.context.fillStyle = this.paperAlpha(1);
    this.context.fill();
  }

  public offsetShape(
    points: readonly Point[],
    scale: number,
    deltaX: number,
    deltaY: number,
    wobble = 0,
  ): MutablePoint[] {
    if (points.length === 0) {
      return [];
    }
    let centerX = 0;
    let centerY = 0;
    for (const point of points) {
      centerX += point[0];
      centerY += point[1];
    }
    centerX /= points.length;
    centerY /= points.length;
    return points.map(([x, y]) => [
      centerX + (x - centerX) * scale + deltaX + (wobble === 0 ? 0 : this.jitter(-wobble, wobble)),
      centerY + (y - centerY) * scale + deltaY + (wobble === 0 ? 0 : this.jitter(-wobble, wobble)),
    ]);
  }

  public washFill(points: readonly Point[], color: RgbColor, options: WashOptions = {}): void {
    const layers = options.layers ?? 3;
    const alpha = options.alpha ?? 0.17;
    const bleed = options.bleed ?? 1;
    for (let layer = 0; layer < layers; layer += 1) {
      const shape = this.offsetShape(
        points,
        1 + layer * 0.018 * bleed,
        this.jitter(-2.2, 2.2) * bleed,
        this.jitter(-2.2, 2.2) * bleed,
        1.5 * bleed,
      );
      this.polygon(shape);
      this.context.fillStyle = this.colorAlpha(this.mixColor(color, 1 - layer * 0.06), alpha);
      this.context.fill();
      if ((options.rim ?? true) && layer === layers - 1) {
        this.context.save();
        this.polygon(shape);
        this.context.clip();
        this.context.strokeStyle = this.colorAlpha(this.mixColor(color, 0.82), alpha * 1.5);
        this.context.lineWidth = this.jitter(2.5, 5);
        this.context.lineJoin = 'round';
        this.polygon(this.offsetShape(shape, 1, 0, 0, 1.2));
        this.context.stroke();
        this.context.restore();
      }
    }

    if (options.blooms ?? true) {
      const bounds = boundsOf(points);
      this.context.save();
      this.polygon(this.offsetShape(points, 1.03, 0, 0, 2));
      this.context.clip();
      for (let index = 0; index < this.integer(1, 3); index += 1) {
        const bloom = this.blobPoints(
          this.jitter(bounds.x, bounds.x + bounds.width),
          this.jitter(bounds.y, bounds.y + bounds.height),
          bounds.width * this.jitter(0.12, 0.3),
          bounds.height * this.jitter(0.12, 0.3),
        );
        this.polygon(bloom);
        this.context.fillStyle = this.paperAlpha(this.jitter(0.12, 0.26));
        this.context.fill();
      }
      this.context.restore();
    }
  }

  public oilFill(points: readonly Point[], color: RgbColor, options: OilOptions = {}): void {
    const bounds = boundsOf(points);
    const alpha = options.alpha ?? 1;
    const density = options.density ?? 1;
    this.context.save();
    this.polygon(this.offsetShape(points, 1.02, 0, 0, 1.5));
    this.context.clip();
    this.polygon(this.offsetShape(points, 1.05, 0, 0));
    this.context.fillStyle = this.colorAlpha(this.mixColor(color, 0.9), alpha * 0.95);
    this.context.fill();

    const angle = options.angle ?? this.jitter(-1.3, -0.5);
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const perpendicularX = -directionY;
    const perpendicularY = directionX;
    const diagonal = Math.hypot(bounds.width, bounds.height);
    const brushWidth = Math.max(3.5, diagonal * 0.085);
    const step = (brushWidth * 0.62) / density;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    for (let offset = -diagonal * 0.6; offset <= diagonal * 0.6; offset += step * this.jitter(0.8, 1.2)) {
      const baseX = centerX + perpendicularX * offset;
      const baseY = centerY + perpendicularY * offset;
      const start = this.jitter(-0.55, 0.15) * diagonal;
      const length = diagonal * this.jitter(0.22, 0.55);
      this.daub(
        baseX + directionX * start,
        baseY + directionY * start,
        baseX + directionX * (start + length),
        baseY + directionY * (start + length),
        brushWidth * this.jitter(0.8, 1.25),
        this.mixColor(color, this.jitter(0.82, 1.18)),
        alpha,
      );
    }
    this.context.restore();
  }

  public chalkFill(points: readonly Point[], color: RgbColor, options: ChalkOptions = {}): void {
    const alpha = options.alpha ?? 0.5;
    const density = options.density ?? 1;
    const bounds = boundsOf(points);
    this.context.save();
    this.polygon(points);
    this.context.clip();
    this.context.fillStyle = this.colorAlpha(color, alpha * 0.38);
    this.context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    const count = Math.min(1_400, Math.round((bounds.width * bounds.height * 0.04) * density));
    for (let index = 0; index < count; index += 1) {
      const size = this.jitter(1, 3.2);
      this.context.fillStyle = this.colorAlpha(
        this.mixColor(color, this.jitter(0.85, 1.15)),
        this.jitter(0.05, 0.3) * alpha * 2,
      );
      this.context.fillRect(
        this.jitter(bounds.x, bounds.x + bounds.width),
        this.jitter(bounds.y, bounds.y + bounds.height),
        size,
        size * this.jitter(0.6, 1.4),
      );
    }
    this.context.restore();
  }

  public markerFill(points: readonly Point[], color: RgbColor, alpha = 0.3): void {
    const bounds = boundsOf(points);
    this.context.save();
    this.polygon(this.offsetShape(points, 1.01, this.jitter(-2, 2), this.jitter(-2, 2)));
    this.context.clip();
    const angle = this.jitter(-0.35, 0.35) + (this.chance(0.5) ? 0 : Math.PI / 2);
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const perpendicularX = -directionY;
    const perpendicularY = directionX;
    const diagonal = Math.hypot(bounds.width, bounds.height);
    const width = Math.max(6, diagonal * 0.16);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    this.context.lineCap = 'square';
    for (let offset = -diagonal * 0.6; offset <= diagonal * 0.6; offset += width * this.jitter(0.72, 0.95)) {
      const baseX = centerX + perpendicularX * offset;
      const baseY = centerY + perpendicularY * offset;
      this.context.beginPath();
      this.context.moveTo(baseX - directionX * diagonal * 0.7, baseY - directionY * diagonal * 0.7);
      this.context.lineTo(baseX + directionX * diagonal * 0.7, baseY + directionY * diagonal * 0.7);
      this.context.strokeStyle = this.colorAlpha(color, alpha * this.jitter(0.8, 1.15));
      this.context.lineWidth = width;
      this.context.stroke();
    }
    this.context.restore();
  }

  private withOvershoot(points: readonly Point[], overshoot: number): MutablePoint[] {
    const prepared = points.map<MutablePoint>(([x, y]) => [x, y]);
    if (overshoot <= 0 || prepared.length < 2) {
      return prepared;
    }
    const first = prepared[0] as MutablePoint;
    const second = prepared[1] as Point;
    const firstDistance = Math.hypot(second[0] - first[0], second[1] - first[1]) || 1;
    const firstVeer = overshoot * this.jitter(-0.5, 0.5);
    first[0] -= ((second[0] - first[0]) / firstDistance) * overshoot
      + ((second[1] - first[1]) / firstDistance) * firstVeer;
    first[1] -= ((second[1] - first[1]) / firstDistance) * overshoot
      - ((second[0] - first[0]) / firstDistance) * firstVeer;

    const lastIndex = prepared.length - 1;
    const last = prepared[lastIndex] as MutablePoint;
    const penultimate = prepared[lastIndex - 1] as Point;
    const originalLastX = last[0];
    const originalLastY = last[1];
    const lastDistance = Math.hypot(originalLastX - penultimate[0], originalLastY - penultimate[1]) || 1;
    const lastVeer = overshoot * this.jitter(-0.5, 0.5);
    last[0] = originalLastX + ((originalLastX - penultimate[0]) / lastDistance) * overshoot
      - ((originalLastY - penultimate[1]) / lastDistance) * lastVeer;
    last[1] = originalLastY + ((originalLastY - penultimate[1]) / lastDistance) * overshoot
      + ((originalLastX - penultimate[0]) / lastDistance) * lastVeer;
    return prepared;
  }

  private granulateStroke(
    samples: readonly (readonly [number, number, number, number, number])[],
    alpha: number,
  ): void {
    for (const [x, y, normalX, normalY, halfWidth] of samples) {
      const density = Math.min(4, Math.max(1, Math.round(halfWidth * 1.5)));
      for (let index = 0; index < density; index += 1) {
        if (this.chance(0.3)) {
          continue;
        }
        const amount = this.jitter(-1.05, 1.05);
        const size = this.jitter(0.7, 1.5) + (halfWidth > 2 ? 0.4 : 0);
        this.context.fillStyle = this.inkAlpha(alpha * this.jitter(0.2, 0.55));
        this.context.fillRect(
          x + normalX * halfWidth * amount + this.jitter(-0.7, 0.7) - size / 2,
          y + normalY * halfWidth * amount + this.jitter(-0.7, 0.7) - size / 2,
          size,
          size,
        );
      }
      if (this.chance(0.45)) {
        const amount = (this.chance(0.5) ? 1 : -1) * this.jitter(0.8, 1.15);
        const size = this.jitter(0.9, 2);
        this.context.fillStyle = this.paperAlpha(this.jitter(0.4, 0.8));
        this.context.fillRect(
          x + normalX * halfWidth * amount - size / 2,
          y + normalY * halfWidth * amount - size / 2,
          size,
          size,
        );
      }
    }
  }

  private daub(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    width: number,
    color: RgbColor,
    alpha: number,
  ): void {
    const middleX = (startX + endX) / 2 + this.jitter(-1, 1);
    const middleY = (startY + endY) / 2 + this.jitter(-1, 1);
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.quadraticCurveTo(middleX, middleY, endX, endY);
    this.context.strokeStyle = this.colorAlpha(color, alpha);
    this.context.lineWidth = width;
    this.context.lineCap = 'round';
    this.context.stroke();
  }
}
