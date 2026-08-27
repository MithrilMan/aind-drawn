import * as THREE from 'three';

function createTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
    count: 4,
  });
  for (const texture of target.textures) {
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  }
  const [albedo, mark, anchor, normal] = target.textures;
  if (albedo === undefined || mark === undefined || anchor === undefined || normal === undefined) {
    target.dispose();
    throw new Error('Inked-solid MRT requires four color attachments');
  }
  albedo.name = 'inked-solid:albedo';
  mark.name = 'inked-solid:mark';
  anchor.name = 'inked-solid:anchor';
  normal.name = 'inked-solid:normal';
  mark.type = THREE.HalfFloatType;
  anchor.type = THREE.HalfFloatType;
  return target;
}

export class InkedSolidRenderTargets {
  public readonly depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  public readonly target = createTarget(1, 1);
  public readonly albedo: THREE.Texture;
  public readonly mark: THREE.Texture;
  public readonly anchor: THREE.Texture;
  public readonly normal: THREE.Texture;

  public constructor() {
    const [albedo, mark, anchor, normal] = this.target.textures;
    if (albedo === undefined || mark === undefined || anchor === undefined || normal === undefined) {
      throw new Error('Inked-solid MRT requires four color attachments');
    }
    this.albedo = albedo;
    this.mark = mark;
    this.anchor = anchor;
    this.normal = normal;
    this.depth.format = THREE.DepthFormat;
    this.target.depthTexture = this.depth;
  }

  public setSize(width: number, height: number, pixelRatio: number): void {
    const targetWidth = Math.max(1, Math.round(width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(height * pixelRatio));
    this.target.setSize(targetWidth, targetHeight);
  }

  public dispose(): void {
    this.target.dispose();
  }
}
