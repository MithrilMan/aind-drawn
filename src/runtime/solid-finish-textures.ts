import * as THREE from 'three';

export type SolidFinishTextureProfile = 'pearl' | 'wood' | 'wool' | 'resin' | 'crazed';

export type SolidFinishTextureBundle = Readonly<{
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  iridescenceThicknessMap?: THREE.Texture;
  normalScale?: readonly [x: number, y: number];
}>;

type Repeat = readonly [x: number, y: number];

function fract(value: number): number {
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function scalarTexture(
  field: Float32Array,
  width: number,
  height: number,
  name: string,
  repeat: Repeat,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < field.length; index += 1) {
    const value = Math.round(Math.max(0, Math.min(1, field[index] ?? 0)) * 255);
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return dataTexture(data, width, height, name, repeat);
}

function normalTexture(
  field: Float32Array,
  width: number,
  height: number,
  strength: number,
  name: string,
  repeat: Repeat,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  const at = (x: number, y: number): number => (
    field[((y + height) % height) * width + ((x + width) % width)] ?? 0
  );
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const offset = (y * width + x) * 4;
      data[offset] = Math.round((-dx / length * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((-dy / length * 0.5 + 0.5) * 255);
      data[offset + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      data[offset + 3] = 255;
    }
  }
  return dataTexture(data, width, height, name, repeat);
}

function dataTexture(
  data: Uint8Array,
  width: number,
  height: number,
  name: string,
  repeat: Repeat,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = name;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function distanceToSegment(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const denominator = abx * abx + aby * aby;
  const t = denominator === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / denominator));
  return Math.hypot(x - (ax + abx * t), y - (ay + aby * t));
}

function knitHeight(width: number, height: number): Float32Array {
  const field = new Float32Array(width * height);
  const stitches = 8;
  for (let y = 0; y < height; y += 1) {
    const cellY = fract(y / height * stitches);
    for (let x = 0; x < width; x += 1) {
      const cellX = fract(x / width * stitches);
      let distance = Number.POSITIVE_INFINITY;
      for (let row = -1; row <= 1; row += 1) {
        const sampleY = cellY + row;
        distance = Math.min(
          distance,
          distanceToSegment(cellX, sampleY, 0.5, 0.72, 0.02, -0.38),
          distanceToSegment(cellX, sampleY, 0.5, 0.72, 0.98, -0.38),
        );
      }
      const yarn = 1 - smoothstep(0.08, 0.19, distance);
      const twist = 0.86 + Math.sin((cellY + cellX * 0.24) * Math.PI * 12) * 0.14;
      field[y * width + x] = yarn * twist;
    }
  }
  return field;
}

function woodHeight(width: number, height: number): Float32Array {
  const field = new Float32Array(width * height);
  const bands = [
    [-0.72, 2],
    [0.38, 3],
    [-0.24, 5],
    [0.18, 6],
    [-0.11, 4],
  ] as const;
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const wobble = Math.sin(u * Math.PI * 2) * 0.045
        + Math.sin(u * Math.PI * 4 + 1.1) * 0.022;
      let band = (v + wobble) * 9;
      for (const [amplitude, frequency] of bands) {
        band += amplitude * 1.6 * Math.sin((v + wobble) * Math.PI * 2 * frequency);
      }
      const phase = fract(band);
      field[y * width + x] = Math.pow(1 - Math.abs(phase * 2 - 1), 2.4);
    }
  }
  return field;
}

function pearlThickness(width: number, height: number): Float32Array {
  const field = new Float32Array(width * height);
  const tau = Math.PI * 2;
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      field[y * width + x] = Math.max(0, Math.min(1, 0.5 + 0.5 * (
        0.52 * Math.sin(tau * (u + v) + 0.7)
        + 0.3 * Math.sin(tau * (2 * u - v) + 2.4)
        + 0.18 * Math.sin(tau * (u - 3 * v) + 4.1)
      )));
    }
  }
  return field;
}

function layerHeight(width: number, height: number): Float32Array {
  const field = new Float32Array(width * height);
  const layers = 42;
  for (let y = 0; y < height; y += 1) {
    const bead = Math.pow(Math.sin(fract(y / height * layers) * Math.PI), 0.55);
    for (let x = 0; x < width; x += 1) field[y * width + x] = bead;
  }
  return field;
}

function hash2(x: number, y: number, salt: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43_758.545_312_3);
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function crazedHeight(width: number, height: number): Float32Array {
  const field = new Float32Array(width * height);
  const cells = 9;
  for (let y = 0; y < height; y += 1) {
    const gridY = y / height * cells;
    const baseY = Math.floor(gridY);
    for (let x = 0; x < width; x += 1) {
      const gridX = x / width * cells;
      const baseX = Math.floor(gridX);
      let nearest = Number.POSITIVE_INFINITY;
      let second = Number.POSITIVE_INFINITY;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const cellX = baseX + ox;
          const cellY = baseY + oy;
          const wrappedX = modulo(cellX, cells);
          const wrappedY = modulo(cellY, cells);
          const pointX = cellX + 0.12 + hash2(wrappedX, wrappedY, 1) * 0.76;
          const pointY = cellY + 0.12 + hash2(wrappedX, wrappedY, 2) * 0.76;
          const distance = (gridX - pointX) ** 2 + (gridY - pointY) ** 2;
          if (distance < nearest) {
            second = nearest;
            nearest = distance;
          } else if (distance < second) {
            second = distance;
          }
        }
      }
      const edgeDistance = Math.sqrt(second) - Math.sqrt(nearest);
      const crack = 1 - smoothstep(0.025, 0.085, edgeDistance);
      field[y * width + x] = 1 - crack * 0.88;
    }
  }
  return field;
}

export function createSolidFinishTextureBundle(
  profile: SolidFinishTextureProfile,
): SolidFinishTextureBundle {
  if (profile === 'pearl') {
    const size = 192;
    return Object.freeze({
      iridescenceThicknessMap: scalarTexture(
        pearlThickness(size, size), size, size, 'aind:pearl-thickness', [1, 1],
      ),
    });
  }
  if (profile === 'wood') {
    const width = 96;
    const height = 384;
    const heightField = woodHeight(width, height);
    const roughness = new Float32Array(heightField.length);
    for (let index = 0; index < heightField.length; index += 1) {
      roughness[index] = 1 - (heightField[index] ?? 0) * 0.42;
    }
    return Object.freeze({
      normalMap: normalTexture(
        heightField, width, height, 1.5, 'aind:wood-normal', [1, 2],
      ),
      roughnessMap: scalarTexture(
        roughness, width, height, 'aind:wood-roughness', [1, 2],
      ),
      normalScale: [0.35, 0.35] as const,
    });
  }
  if (profile === 'wool') {
    const size = 192;
    return Object.freeze({
      normalMap: normalTexture(
        knitHeight(size, size), size, size, 2.8, 'aind:wool-normal', [3, 1.5],
      ),
      normalScale: [1, 1] as const,
    });
  }
  if (profile === 'resin') {
    const width = 8;
    const height = 256;
    return Object.freeze({
      normalMap: normalTexture(
        layerHeight(width, height), width, height, 1.1, 'aind:resin-layers', [1, 8],
      ),
      normalScale: [0.7, 0.7] as const,
    });
  }
  const size = 192;
  return Object.freeze({
    normalMap: normalTexture(
      crazedHeight(size, size), size, size, 2.6, 'aind:crazed-normal', [2, 1],
    ),
    normalScale: [0.45, 0.45] as const,
  });
}
