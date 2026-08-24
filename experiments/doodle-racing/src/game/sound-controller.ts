export type SoundEffectId =
  | 'menu-click'
  | 'drift-skid'
  | 'offroad-loop'
  | 'character-poof'
  | 'curb-hit'
  | 'race-go'
  | 'crowd-applause';

type SoundOptions = Readonly<{
  volume?: number;
}>;

type AudioFactory = (source: string) => HTMLAudioElement;

const SOUND_EFFECT_IDS: readonly SoundEffectId[] = Object.freeze([
  'menu-click',
  'drift-skid',
  'offroad-loop',
  'character-poof',
  'curb-hit',
  'race-go',
  'crowd-applause',
]);

const CORE_SOUND_EFFECT_IDS: readonly SoundEffectId[] = Object.freeze([
  'menu-click',
  'character-poof',
  'curb-hit',
  'race-go',
]);

function synthesizedCurbHitSource(): string {
  const sampleRate = 16_000;
  const sampleCount = Math.round(sampleRate * 0.32);
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  let noiseState = 0x4f1bbcdc;
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >>> 17;
    noiseState ^= noiseState << 5;
    const noise = ((noiseState >>> 0) / 0xffff_ffff) * 2 - 1;
    const suspension = Math.sin(Math.PI * 2 * (82 * time - 46 * time * time))
      * Math.exp(-14 * time) * 0.72;
    const metal = (
      Math.sin(Math.PI * 2 * 1_180 * time) * 0.18
      + Math.sin(Math.PI * 2 * 1_730 * time) * 0.1
      + noise * 0.22
    ) * Math.exp(-27 * time);
    const tail = Math.sin(Math.PI * 2 * 47 * time) * Math.exp(-9 * time) * 0.18;
    const sample = Math.max(-1, Math.min(1, suspension + metal + tail));
    view.setInt16(44 + index * 2, Math.round(sample * 32_767), true);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const SOUND_SOURCES: Readonly<Record<SoundEffectId, string>> = Object.freeze({
  'menu-click': new URL('../assets/audio/menu-click.wav', import.meta.url).href,
  'drift-skid': new URL('../assets/audio/drift-skid.wav', import.meta.url).href,
  'offroad-loop': new URL('../assets/audio/offroad-loop.opus', import.meta.url).href,
  'character-poof': new URL('../assets/audio/character-poof.wav', import.meta.url).href,
  'curb-hit': synthesizedCurbHitSource(),
  'race-go': new URL('../assets/audio/race-go.wav', import.meta.url).href,
  'crowd-applause': new URL('../assets/audio/crowd-applause.wav', import.meta.url).href,
});

const SOUND_VOLUMES: Readonly<Record<SoundEffectId, number>> = Object.freeze({
  'menu-click': 0.24,
  'drift-skid': 0.22,
  'offroad-loop': 0.17,
  'character-poof': 0.42,
  'curb-hit': 0.48,
  'race-go': 0.48,
  'crowd-applause': 0.3,
});

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

export class SoundController {
  private readonly clips: ReadonlyMap<SoundEffectId, HTMLAudioElement>;
  private unlocked = false;
  private enabled = true;
  private driftActive = false;
  private offRoadActive = false;
  private curbImpactActive = false;

  public constructor(
    createAudio: AudioFactory = (source) => new Audio(source),
  ) {
    this.clips = new Map(SOUND_EFFECT_IDS.map((id) => {
      const clip = createAudio(SOUND_SOURCES[id]);
      clip.preload = 'metadata';
      clip.volume = SOUND_VOLUMES[id];
      return [id, clip] as const;
    }));
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const id of CORE_SOUND_EFFECT_IDS) {
      const clip = this.clips.get(id);
      if (clip === undefined) continue;
      clip.preload = 'auto';
      clip.load();
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.driftActive = false;
      this.offRoadActive = false;
      this.curbImpactActive = false;
      for (const clip of this.clips.values()) this.stopClip(clip);
    }
  }

  public play(effect: SoundEffectId, options: SoundOptions = {}): void {
    if (!this.enabled) return;
    const clip = this.clips.get(effect);
    if (clip === undefined) return;
    clip.loop = false;
    clip.volume = clampVolume(options.volume ?? SOUND_VOLUMES[effect]);
    this.stopClip(clip);
    void clip.play().catch(() => undefined);
  }

  public syncDrift(active: boolean): void {
    if (active === this.driftActive) return;
    this.driftActive = active;
    const clip = this.clips.get('drift-skid');
    if (clip === undefined) return;
    if (active && this.enabled) {
      this.stopClip(clip);
      clip.loop = true;
      clip.volume = SOUND_VOLUMES['drift-skid'];
      void clip.play().catch(() => undefined);
    } else {
      this.stopClip(clip);
    }
  }

  public syncOffRoad(active: boolean): void {
    if (active === this.offRoadActive) return;
    this.offRoadActive = active;
    const clip = this.clips.get('offroad-loop');
    if (clip === undefined) return;
    if (active && this.enabled) {
      this.stopClip(clip);
      clip.loop = true;
      clip.volume = SOUND_VOLUMES['offroad-loop'];
      void clip.play().catch(() => undefined);
    } else {
      this.stopClip(clip);
    }
  }

  public syncCurbImpact(strength: number): void {
    const active = strength > 0.12;
    if (!active) {
      this.curbImpactActive = false;
      return;
    }
    if (this.curbImpactActive) return;
    this.curbImpactActive = true;
    this.play('curb-hit', {
      volume: SOUND_VOLUMES['curb-hit'] * (0.72 + Math.min(1, strength) * 0.28),
    });
  }

  public dispose(): void {
    for (const clip of this.clips.values()) this.stopClip(clip);
  }

  private stopClip(clip: HTMLAudioElement): void {
    clip.pause();
    clip.currentTime = 0;
    clip.loop = false;
  }
}
