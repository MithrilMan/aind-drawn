export const CHARACTER_POSES = [
  'idle',
  'walk',
  'run',
  'airborne',
  'sit',
  'sleep',
  'play',
] as const;

export type CharacterPose = typeof CHARACTER_POSES[number];

export type CharacterMotion = Readonly<{
  /** High-level authored pose blended with autonomous motion. */
  pose?: CharacterPose;
  speed?: number;
  facing?: -1 | 1;
  talking?: boolean;
}>;
