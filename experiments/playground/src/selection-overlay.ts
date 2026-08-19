import * as THREE from 'three';

import type { SceneObjectData } from './document.js';

export type ResizeAxis = -1 | 0 | 1;
export type ResizeHandle = Readonly<{ x: ResizeAxis; y: ResizeAxis }>;

function project(
  x: number,
  y: number,
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
): Readonly<{ x: number; y: number }> {
  const point = new THREE.Vector3(x, y, 0).project(camera);
  return {
    x: (point.x * 0.5 + 0.5) * width,
    y: (-point.y * 0.5 + 0.5) * height,
  };
}

export class SelectionOverlay {
  public readonly element: HTMLElement;

  public constructor(element: HTMLElement) {
    this.element = element;
  }

  public update(
    data: SceneObjectData | null,
    camera: THREE.OrthographicCamera,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    if (data === null || viewportWidth <= 0 || viewportHeight <= 0) {
      this.element.hidden = true;
      return;
    }
    const center = project(data.x, data.y, camera, viewportWidth, viewportHeight);
    const horizontal = project(data.x + data.width / 2, data.y, camera, viewportWidth, viewportHeight);
    const vertical = project(data.x, data.y + data.height / 2, camera, viewportWidth, viewportHeight);
    this.element.hidden = false;
    this.element.style.left = `${center.x}px`;
    this.element.style.top = `${center.y}px`;
    this.element.style.width = `${Math.max(12, Math.abs(horizontal.x - center.x) * 2)}px`;
    this.element.style.height = `${Math.max(12, Math.abs(vertical.y - center.y) * 2)}px`;
    this.element.style.transform = `translate(-50%, -50%) rotate(${-data.rotation}rad)`;
  }

  public resizeHandleFrom(target: EventTarget | null): ResizeHandle | null {
    if (!(target instanceof HTMLElement)) return null;
    const handle = target.closest<HTMLElement>('[data-resize-handle]');
    const value = handle?.dataset.resizeHandle;
    if (value === undefined) return null;
    const [xText, yText] = value.split(',');
    const x = Number(xText);
    const y = Number(yText);
    if ((x !== -1 && x !== 0 && x !== 1) || (y !== -1 && y !== 0 && y !== 1)) {
      return null;
    }
    return { x, y };
  }

  public isRotationHandle(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest('[data-rotation-handle]') !== null;
  }
}
