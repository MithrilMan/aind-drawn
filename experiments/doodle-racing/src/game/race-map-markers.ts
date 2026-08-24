import * as THREE from 'three';

import type { RaceSnapshot } from './race-model.js';

type MarkerRecord = Readonly<{
  root: HTMLDivElement;
  place: HTMLSpanElement;
  name: HTMLSpanElement;
}>;

/** Keeps racers readable in the full-course presentation without changing the
 * shared medium compositor or replacing the authored vehicle geometry. */
export class RaceMapMarkers {
  private readonly root: HTMLDivElement;
  private readonly markers = new Map<string, MarkerRecord>();
  private readonly projected = new THREE.Vector3();

  public constructor(private readonly viewport: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'race-map-markers';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.hidden = true;
    viewport.append(this.root);
  }

  public update(
    snapshot: RaceSnapshot,
    camera: THREE.Camera,
    visible: boolean,
  ): void {
    this.root.hidden = !visible;
    if (!visible) return;

    camera.updateMatrixWorld(true);
    const ordered = [...snapshot.racers].sort((left, right) => right.raceScore - left.raceScore);
    const places = new Map(ordered.map((racer, index) => [racer.id, index + 1]));
    const { width, height } = this.viewport.getBoundingClientRect();
    for (const racer of snapshot.racers) {
      const marker = this.markerFor(racer.id);
      this.projected.set(racer.x, 0.95, racer.z).project(camera);
      const onScreen = this.projected.z >= -1 && this.projected.z <= 1
        && this.projected.x >= -1.08 && this.projected.x <= 1.08
        && this.projected.y >= -1.08 && this.projected.y <= 1.08;
      marker.root.hidden = !onScreen;
      if (!onScreen) continue;
      marker.root.style.transform = `translate3d(${(this.projected.x * 0.5 + 0.5) * width}px, ${(1 - (this.projected.y * 0.5 + 0.5)) * height}px, 0)`;
      marker.place.textContent = String(places.get(racer.id) ?? 0).padStart(2, '0');
      marker.name.textContent = racer.isPlayer ? 'YOU' : racer.name.toUpperCase();
      marker.root.classList.toggle('is-player', racer.isPlayer);
    }
  }

  public hide(): void {
    this.root.hidden = true;
  }

  public dispose(): void {
    this.root.remove();
    this.markers.clear();
  }

  private markerFor(id: string): MarkerRecord {
    const existing = this.markers.get(id);
    if (existing !== undefined) return existing;
    const root = document.createElement('div');
    root.className = `race-map-marker racer-${id}`;
    root.setAttribute('aria-hidden', 'true');
    const place = document.createElement('b');
    const name = document.createElement('span');
    root.append(place, name);
    this.root.append(root);
    const marker = Object.freeze({ root, place, name });
    this.markers.set(id, marker);
    return marker;
  }
}
