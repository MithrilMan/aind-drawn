type AudioFactory = (source: string) => HTMLAudioElement;

const MUSIC_SAMPLE_RATE = 16_000;
const MUSIC_SECONDS = 8;
const MUSIC_VOLUME = 0.12;
const PAUSED_MUSIC_VOLUME = 0.055;

function writeWaveHeader(view: DataView, sampleCount: number): void {
  const writeText = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, MUSIC_SAMPLE_RATE, true);
  view.setUint32(28, MUSIC_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
}

function triangle(phase: number): number {
  return 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
}

function synthesizedMusicSource(): string {
  const sampleCount = MUSIC_SAMPLE_RATE * MUSIC_SECONDS;
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  writeWaveHeader(view, sampleCount);
  const roots = [55, 65.406, 49, 73.416] as const;
  const melody = [2, 3, 4, 3, 5, 4, 3, 2, 1, 2, 4, 5, 3, 2, 1, 0] as const;
  const ratios = [1, 1.125, 1.25, 1.5, 1.667, 2] as const;
  let noiseState = 0x6d2b79f5;
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / MUSIC_SAMPLE_RATE;
    const beat = time * 2;
    const beatIndex = Math.floor(beat) % 16;
    const beatPhase = beat - Math.floor(beat);
    const root = roots[Math.floor(beatIndex / 4)] as number;
    const noteRatio = ratios[melody[beatIndex] as number] as number;
    const phraseFade = Math.min(1, time * 16, (MUSIC_SECONDS - time) * 16);
    const noteEnvelope = Math.min(1, beatPhase * 20) * Math.exp(-1.8 * beatPhase);
    const chordPhase = (beat % 4) / 4;
    const chordEnvelope = Math.min(1, chordPhase * 32, (1 - chordPhase) * 32);
    const pad = (
      Math.sin(Math.PI * 2 * root * 2 * time)
      + Math.sin(Math.PI * 2 * root * 2.5 * time) * 0.58
      + Math.sin(Math.PI * 2 * root * 3 * time) * 0.42
    ) * 0.075 * chordEnvelope;
    const bass = triangle(root * time) * 0.12 * noteEnvelope;
    const lead = triangle(root * noteRatio * 2 * time) * 0.09 * noteEnvelope;
    const kickTime = beatPhase * 0.5;
    const kick = Math.sin(Math.PI * 2 * (52 + 42 * Math.exp(-28 * kickTime)) * kickTime)
      * Math.exp(-15 * kickTime) * 0.24;
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >>> 17;
    noiseState ^= noiseState << 5;
    const noise = ((noiseState >>> 0) / 0xffff_ffff) * 2 - 1;
    const offBeat = (beat + 0.5) - Math.floor(beat + 0.5);
    const hat = noise * Math.exp(-52 * offBeat) * 0.035;
    const sample = Math.max(-1, Math.min(1, (pad + bass + lead + kick + hat) * phraseFade));
    view.setInt16(44 + index * 2, Math.round(sample * 32_767), true);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Lightweight, deterministic Paper Circuit score with an independent music mix. */
export class MusicController {
  private readonly clip: HTMLAudioElement;
  private unlocked = false;
  private enabled = true;
  private paused = false;

  public constructor(createAudio: AudioFactory = (source) => new Audio(source)) {
    this.clip = createAudio(synthesizedMusicSource());
    this.clip.loop = true;
    this.clip.preload = 'metadata';
    this.renderVolume();
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public unlock(): void {
    if (!this.unlocked) {
      this.unlocked = true;
      this.clip.preload = 'auto';
      this.clip.load();
    }
    if (this.enabled) void this.clip.play().catch(() => undefined);
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.clip.pause();
    else if (this.unlocked) void this.clip.play().catch(() => undefined);
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.renderVolume();
  }

  public dispose(): void {
    this.clip.pause();
    this.clip.currentTime = 0;
  }

  private renderVolume(): void {
    this.clip.volume = this.paused ? PAUSED_MUSIC_VOLUME : MUSIC_VOLUME;
  }
}
