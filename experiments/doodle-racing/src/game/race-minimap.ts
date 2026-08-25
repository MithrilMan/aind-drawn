import type { CourseBounds, CourseLayout } from './course.js';
import type { RaceSnapshot, RacerSnapshot } from './race-model.js';

export type MinimapViewport = Readonly<{
  scale: number;
  offsetX: number;
  offsetY: number;
}>;

export type MinimapPoint = Readonly<{
  x: number;
  y: number;
}>;

const MAXIMUM_PIXEL_RATIO = 2;
const DEFAULT_PADDING = 10;

export function createMinimapViewport(
  bounds: CourseBounds,
  width: number,
  height: number,
  padding = DEFAULT_PADDING,
): MinimapViewport {
  if (width <= padding * 2 || height <= padding * 2) {
    throw new RangeError('Minimap viewport must be larger than its padding');
  }
  const worldWidth = bounds.maximumX - bounds.minimumX;
  const worldHeight = bounds.maximumZ - bounds.minimumZ;
  if (worldWidth <= 0 || worldHeight <= 0) {
    throw new RangeError('Minimap course bounds must have positive dimensions');
  }
  const scale = Math.min(
    (width - padding * 2) / worldWidth,
    (height - padding * 2) / worldHeight,
  );
  return Object.freeze({
    scale,
    offsetX: (width - worldWidth * scale) / 2 - bounds.minimumX * scale,
    offsetY: (height - worldHeight * scale) / 2 - bounds.minimumZ * scale,
  });
}

export function projectMinimapPoint(
  viewport: MinimapViewport,
  x: number,
  z: number,
): MinimapPoint {
  return Object.freeze({
    x: viewport.offsetX + x * viewport.scale,
    y: viewport.offsetY + z * viewport.scale,
  });
}

export class RaceMinimap {
  private readonly context: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private pixelRatio = 0;
  private viewport: MinimapViewport | null = null;
  private coursePath: Path2D | null = null;
  private startLine: Path2D | null = null;

  public constructor(
    private readonly course: CourseLayout,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Canvas 2D is unavailable for the race minimap');
    this.context = context;
  }

  public render(snapshot: RaceSnapshot): void {
    if (!this.resize()) return;
    const viewport = this.viewport;
    if (viewport === null) return;
    const context = this.context;
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    this.drawCourse(viewport);
    this.drawStartLine();
    for (const racer of snapshot.racers) {
      if (!racer.isPlayer) this.drawOpponent(viewport, racer);
    }
    const player = snapshot.racers.find(({ isPlayer }) => isPlayer);
    if (player !== undefined) this.drawPlayer(viewport, player);
  }

  private resize(): boolean {
    const width = Math.round(this.canvas.clientWidth);
    const height = Math.round(this.canvas.clientHeight);
    if (width <= 0 || height <= 0) return false;
    const pixelRatio = Math.min(MAXIMUM_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
    if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) return true;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.viewport = createMinimapViewport(this.course.bounds, width, height);
    this.rebuildStaticGeometry(this.viewport);
    return true;
  }

  private rebuildStaticGeometry(viewport: MinimapViewport): void {
    const first = this.course.samples[0];
    if (first === undefined) return;
    const coursePath = new Path2D();
    coursePath.moveTo(
      viewport.offsetX + first.x * viewport.scale,
      viewport.offsetY + first.z * viewport.scale,
    );
    for (let index = 1; index < this.course.samples.length; index += 1) {
      const sample = this.course.samples[index];
      if (sample === undefined) continue;
      coursePath.lineTo(
        viewport.offsetX + sample.x * viewport.scale,
        viewport.offsetY + sample.z * viewport.scale,
      );
    }
    coursePath.closePath();
    this.coursePath = coursePath;

    const halfWidth = this.course.trackWidth * 0.58;
    const startLine = new Path2D();
    startLine.moveTo(
      viewport.offsetX + (first.x + first.normalX * halfWidth) * viewport.scale,
      viewport.offsetY + (first.z + first.normalZ * halfWidth) * viewport.scale,
    );
    startLine.lineTo(
      viewport.offsetX + (first.x - first.normalX * halfWidth) * viewport.scale,
      viewport.offsetY + (first.z - first.normalZ * halfWidth) * viewport.scale,
    );
    this.startLine = startLine;
  }

  private drawCourse(viewport: MinimapViewport): void {
    const context = this.context;
    if (this.coursePath === null) return;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const roadWidth = Math.max(3, this.course.trackWidth * viewport.scale);
    context.strokeStyle = '#101210';
    context.lineWidth = roadWidth + 3;
    context.stroke(this.coursePath);
    context.strokeStyle = '#77776d';
    context.lineWidth = roadWidth;
    context.stroke(this.coursePath);
    context.setLineDash([2, 4]);
    context.strokeStyle = 'rgba(241, 229, 200, .32)';
    context.lineWidth = 1;
    context.stroke(this.coursePath);
    context.restore();
  }

  private drawStartLine(): void {
    if (this.startLine === null) return;
    this.context.save();
    this.context.strokeStyle = '#ef7351';
    this.context.lineWidth = 2;
    this.context.stroke(this.startLine);
    this.context.restore();
  }

  private drawOpponent(viewport: MinimapViewport, racer: RacerSnapshot): void {
    const x = viewport.offsetX + racer.x * viewport.scale;
    const y = viewport.offsetY + racer.z * viewport.scale;
    const context = this.context;
    context.save();
    context.beginPath();
    context.arc(x, y, 3.2, 0, Math.PI * 2);
    context.fillStyle = '#c7bda5';
    context.fill();
    context.strokeStyle = '#171918';
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  }

  private drawPlayer(viewport: MinimapViewport, racer: RacerSnapshot): void {
    const x = viewport.offsetX + racer.x * viewport.scale;
    const y = viewport.offsetY + racer.z * viewport.scale;
    const context = this.context;
    context.save();
    context.translate(x, y);
    context.rotate(-racer.heading);
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-4.5, 4.2);
    context.lineTo(-2.5, 0);
    context.lineTo(-4.5, -4.2);
    context.closePath();
    context.fillStyle = '#ef7351';
    context.fill();
    context.strokeStyle = '#171918';
    context.lineWidth = 1.8;
    context.stroke();
    context.restore();
  }
}
