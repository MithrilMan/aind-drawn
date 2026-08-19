import type { AssetKind } from './document.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type SvgAttributes = Readonly<Record<string, string | number>>;

function svgNode<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: SvgAttributes,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NAMESPACE, name);
  for (const [attribute, value] of Object.entries(attributes)) {
    node.setAttribute(attribute, String(value));
  }
  return node;
}

function add(parent: SVGElement, ...children: readonly SVGElement[]): void {
  parent.append(...children);
}

function drawCharacter(icon: SVGSVGElement, kind: AssetKind): void {
  if (kind === 'character:cat') {
    add(icon,
      svgNode('path', { d: 'M21 19 17 8l11 6M43 19 47 8 36 14' }),
      svgNode('path', { d: 'M18 23c1-10 27-12 29 0 2 10-3 17-14 17S16 33 18 23Z', class: 'paper-fill' }),
      svgNode('path', { d: 'M25 26h.2M39 26h.2M30 31l2 2 2-2M22 32 11 29M22 35 10 37M42 32l11-3M42 35l12 2' }),
      svgNode('path', { d: 'M25 41c-3 2-5 6-5 9M39 41c3 2 5 6 5 9M20 48h7M37 48h7M44 43c9 0 11-7 6-10' }),
    );
    return;
  }
  if (kind === 'character:nightmare') {
    add(icon,
      svgNode('path', { d: 'M20 19c-3-9 4-15 13-13 12-3 18 7 13 17 4 7 0 17-9 18-8 6-20 0-18-10-5-3-4-9 1-12Z', class: 'accent-fill' }),
      svgNode('path', { d: 'm23 14-7-8M42 14l7-9M24 26c2-5 5-5 7 0M36 25c3-5 6-4 7 1M27 34c4 3 8 3 12-1' }),
      svgNode('path', { d: 'M24 41 20 50M38 42l5 8M19 48h8M38 48h9' }),
    );
    return;
  }
  add(icon,
    svgNode('path', { d: 'M22 18c1-9 19-13 24-3 5 11-2 21-12 22-11 1-18-8-12-19Z', class: 'paper-fill' }),
    svgNode('path', { d: 'M23 16c4-8 16-10 21-3M27 24h.2M39 23h.2M30 30c3 2 6 2 9-1' }),
    svgNode('path', { d: 'M27 38c-4 2-6 6-6 12M39 37c4 2 6 7 6 13M27 41v9M38 40v10M18 49h9M38 49h10' }),
  );
}

function drawBuilding(icon: SVGSVGElement): void {
  add(icon,
    svgNode('path', { d: 'M9 47V23l23-16 23 16v24Z', class: 'paper-fill' }),
    svgNode('path', { d: 'm6 24 26-18 26 18M17 26h10v9H17zM38 26h10v9H38zM27 47V37h10v10M43 12V5h6v12' }),
  );
}

function drawPlatform(icon: SVGSVGElement): void {
  add(icon,
    svgNode('path', { d: 'm6 26 4-8 46 1 2 9-5 12H12Z', class: 'paper-fill' }),
    svgNode('path', { d: 'M9 27c12-2 31 2 48 0M20 29l-3 9M34 29v10M49 29l3 9' }),
  );
}

function drawPlant(icon: SVGSVGElement, kind: AssetKind): void {
  if (kind === 'plant:tree') {
    add(icon,
      svgNode('path', { d: 'M28 48c2-10 1-19 4-29M39 48c-2-11-1-20-5-29' }),
      svgNode('path', { d: 'M10 23c-2-8 7-13 13-9 2-10 16-11 20-3 10-3 16 8 10 15 4 8-6 14-13 10-5 8-17 6-18-1-9 3-17-5-12-12Z', class: 'accent-fill' }),
      svgNode('path', { d: 'M21 50h25' }),
    );
    return;
  }
  if (kind === 'plant:grass') {
    add(icon,
      svgNode('path', { d: 'M9 47c8-8 37-8 46 0M17 43 11 18M22 42l1-31M28 42 35 15M34 42l13-22M40 43l12-10' }),
    );
    return;
  }
  if (kind === 'plant:flower') {
    add(icon,
      svgNode('path', { d: 'M31 47c1-13 2-22 1-31M31 31c-9-8-15-3-13 3 5 3 9 1 13-3ZM33 37c8-8 14-4 13 2-5 3-9 1-13-2Z' }),
      svgNode('path', { d: 'M32 15c-10 2-12-9-4-11 3-8 12-4 10 2 9 3 4 12-3 9-1 3-3 3-3 0Z', class: 'accent-fill' }),
      svgNode('path', { d: 'M14 49h36' }),
    );
    return;
  }
  add(icon,
    svgNode('path', { d: 'M13 47c5-7 33-8 39 0M31 43V21M31 29c-8-13-18-8-16-1 6 5 11 3 16 1ZM33 24c8-13 18-8 16-1-6 5-11 3-16 1ZM32 36c-7-8-13-4-12 2 5 2 8 1 12-2ZM33 34c6-7 12-4 11 1-4 3-7 2-11-1Z', class: 'accent-fill' }),
  );
}

function drawProp(icon: SVGSVGElement, kind: AssetKind): void {
  if (kind === 'crate') {
    add(icon,
      svgNode('rect', { x: 12, y: 10, width: 40, height: 38, rx: 1, class: 'paper-fill' }),
      svgNode('path', { d: 'm15 13 34 32M49 13 15 45M12 19h40M12 40h40' }),
    );
  } else if (kind === 'lantern') {
    add(icon,
      svgNode('path', { d: 'M24 15c0-11 17-11 17 0M22 19h21M24 22l-3 22h25l-4-22Z', class: 'paper-fill' }),
      svgNode('path', { d: 'M29 24 27 40M37 24l3 16M21 44h25M28 47h12M30 36c1-6 7-6 8 0' }),
    );
  } else if (kind === 'sign') {
    add(icon,
      svgNode('path', { d: 'M9 13h43l5 10-7 9H9Z', class: 'paper-fill' }),
      svgNode('path', { d: 'M31 32v19M24 50h14M17 22h27M42 17l5 5-5 5' }),
    );
  } else {
    add(icon,
      svgNode('path', { d: 'M8 43c-1-8 4-12 10-11-2-8 8-13 14-7 5-9 17-4 16 4 9-1 12 8 6 14Z', class: 'accent-fill' }),
      svgNode('path', { d: 'M11 42c9-3 28 3 44 0M23 39l-3-10M35 40l1-16M47 40l4-9' }),
    );
  }
}

export function createAssetIcon(kind: AssetKind): SVGSVGElement {
  const icon = svgNode('svg', {
    viewBox: '0 0 64 54',
    class: 'asset-icon',
    role: 'presentation',
    focusable: 'false',
    'aria-hidden': 'true',
  });
  if (kind.startsWith('character:')) drawCharacter(icon, kind);
  else if (kind === 'building') drawBuilding(icon);
  else if (kind === 'platform') drawPlatform(icon);
  else if (kind.startsWith('plant:')) drawPlant(icon, kind);
  else drawProp(icon, kind);
  return icon;
}
