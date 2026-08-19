import { cloneDocument, type SceneDocument } from './document.js';

export class DocumentHistory {
  private snapshots: SceneDocument[] = [];
  private cursor = -1;

  public reset(document: SceneDocument): void {
    this.snapshots = [cloneDocument(document)];
    this.cursor = 0;
  }

  public commit(document: SceneDocument): void {
    const snapshot = cloneDocument(document);
    const current = this.snapshots[this.cursor];
    if (current !== undefined && JSON.stringify(current) === JSON.stringify(snapshot)) {
      return;
    }
    this.snapshots.splice(this.cursor + 1);
    this.snapshots.push(snapshot);
    this.cursor = this.snapshots.length - 1;
    if (this.snapshots.length > 80) {
      this.snapshots.shift();
      this.cursor -= 1;
    }
  }

  public get canUndo(): boolean {
    return this.cursor > 0;
  }

  public get canRedo(): boolean {
    return this.cursor >= 0 && this.cursor < this.snapshots.length - 1;
  }

  public undo(): SceneDocument | null {
    if (!this.canUndo) return null;
    this.cursor -= 1;
    const snapshot = this.snapshots[this.cursor];
    return snapshot === undefined ? null : cloneDocument(snapshot);
  }

  public redo(): SceneDocument | null {
    if (!this.canRedo) return null;
    this.cursor += 1;
    const snapshot = this.snapshots[this.cursor];
    return snapshot === undefined ? null : cloneDocument(snapshot);
  }
}
