import './style.css';

import { createInitialDocument } from './document.js';
import { PlaygroundEditor } from './editor.js';

const root = document.querySelector<HTMLElement>('[data-editor-root]');
if (root === null) {
  throw new Error('Editor root not found');
}

const editor = new PlaygroundEditor(root, createInitialDocument());

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose((): void => { editor.dispose(); });
}
