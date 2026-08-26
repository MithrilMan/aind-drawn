import {
  SeedTree,
  normalizeSeed,
  type AssetIdentityEnvelope,
  type CharacterIdentityRecipe,
  type JsonObject,
  type Point3,
  type RgbColor,
} from '../../../../../src/index.js';

export const PAPER_CIRCUIT_BACKPACK_FAMILY = 'paper-circuit-backpack';

export type PaperCircuitBackpackStyle = 'rally-pack' | 'roll-top' | 'courier';

export type PaperCircuitBackpackIdentity = AssetIdentityEnvelope<
  typeof PAPER_CIRCUIT_BACKPACK_FAMILY
> & JsonObject & Readonly<{
  style: PaperCircuitBackpackStyle;
  dimensions: Readonly<{
    radii: Point3;
    exponent: number;
  }>;
  pocket: Readonly<{
    present: boolean;
    widthRatio: number;
    heightRatio: number;
  }>;
  hardware: Readonly<{
    buckleCount: 1 | 2;
    handle: boolean;
  }>;
  palette: Readonly<{
    fabric: RgbColor;
    accent: RgbColor;
    hardware: RgbColor;
  }>;
}>;

export type PaperCircuitBackpackOptions = Readonly<{
  style?: PaperCircuitBackpackStyle;
}>;

const HARDWARE_COLOR = Object.freeze([63, 62, 58] as const);

export function createPaperCircuitBackpackIdentity(
  person: CharacterIdentityRecipe,
  options: PaperCircuitBackpackOptions = {},
): PaperCircuitBackpackIdentity {
  const seed = normalizeSeed(person.seed);
  const random = new SeedTree(seed).random(`${PAPER_CIRCUIT_BACKPACK_FAMILY}:identity`);
  const style = options.style ?? random.pick<PaperCircuitBackpackStyle>([
    'rally-pack', 'roll-top', 'courier',
  ]);
  const dimensions = style === 'roll-top'
    ? Object.freeze({ radii: Object.freeze([0.35, 0.5, 0.31] as Point3), exponent: 3.55 })
    : style === 'courier'
      ? Object.freeze({ radii: Object.freeze([0.43, 0.36, 0.27] as Point3), exponent: 4.35 })
      : Object.freeze({ radii: Object.freeze([0.38, 0.45, 0.3] as Point3), exponent: 3.05 });
  return Object.freeze({
    schemaVersion: 1,
    family: PAPER_CIRCUIT_BACKPACK_FAMILY,
    seed,
    style,
    dimensions,
    pocket: Object.freeze({
      present: style !== 'roll-top' || random.chance(0.55),
      widthRatio: random.float(0.68, 0.84),
      heightRatio: random.float(0.26, 0.36),
    }),
    hardware: Object.freeze({
      buckleCount: style === 'courier' || random.chance(0.48) ? 1 : 2,
      handle: style !== 'courier' || random.chance(0.62),
    }),
    palette: Object.freeze({
      fabric: person.palette.cloth,
      accent: person.palette.accent,
      hardware: HARDWARE_COLOR,
    }),
  });
}
