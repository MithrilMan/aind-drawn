export type DrawingCanvas = HTMLCanvasElement | OffscreenCanvas;
export type DrawingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type DrawingSurface = Readonly<{
  canvas: DrawingCanvas;
  context: DrawingContext;
}>;

export type CanvasFactory = (width: number, height: number) => DrawingSurface;

function dimensions(width: number, height: number): readonly [number, number] {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight)) {
    throw new RangeError('canvas dimensions must be finite');
  }
  return [safeWidth, safeHeight];
}

export const browserCanvasFactory: CanvasFactory = (width, height) => {
  const [safeWidth, safeHeight] = dimensions(width, height);
  if (typeof document === 'undefined') {
    throw new Error('browserCanvasFactory requires a DOM document');
  }
  const canvas = document.createElement('canvas');
  canvas.width = safeWidth;
  canvas.height = safeHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    throw new Error('2D canvas context is unavailable');
  }
  return { canvas, context };
};

export const offscreenCanvasFactory: CanvasFactory = (width, height) => {
  const [safeWidth, safeHeight] = dimensions(width, height);
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('OffscreenCanvas is unavailable');
  }
  const canvas = new OffscreenCanvas(safeWidth, safeHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    throw new Error('2D offscreen canvas context is unavailable');
  }
  return { canvas, context };
};

export const automaticCanvasFactory: CanvasFactory = (width, height) => {
  if (typeof document !== 'undefined') {
    return browserCanvasFactory(width, height);
  }
  return offscreenCanvasFactory(width, height);
};
