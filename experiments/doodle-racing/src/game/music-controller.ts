type AudioFactory = (source: string) => HTMLAudioElement;

const MUSIC_SOURCE = new URL('../assets/audio/main-song.opus', import.meta.url).href;
const MUSIC_VOLUME = 0.32;
const PAUSED_MUSIC_VOLUME = 0.055;

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

/** Bundled Paper Circuit score with an independent music mix. */
export class MusicController {
  private readonly clip: HTMLAudioElement;
  private unlocked = false;
  private enabled = true;
  private paused = false;
  private menuActive = true;
  private volume = 1;

  public constructor(createAudio: AudioFactory = (source) => new Audio(source)) {
    this.clip = createAudio(MUSIC_SOURCE);
    this.clip.loop = true;
    this.clip.preload = 'metadata';
    this.renderVolume();
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public get currentVolume(): number {
    return this.volume;
  }

  public unlock(): void {
    if (!this.unlocked) {
      this.unlocked = true;
      this.clip.preload = 'auto';
      this.clip.load();
    }
    if (this.enabled && this.menuActive) void this.clip.play().catch(() => undefined);
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.clip.pause();
    else if (this.unlocked && this.menuActive) void this.clip.play().catch(() => undefined);
  }

  public setMenuActive(active: boolean): void {
    if (active === this.menuActive) return;
    this.menuActive = active;
    if (!active) this.clip.pause();
    else if (this.enabled && this.unlocked) void this.clip.play().catch(() => undefined);
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.renderVolume();
  }

  public setVolume(volume: number): void {
    this.volume = clampVolume(volume);
    this.renderVolume();
  }

  public dispose(): void {
    this.clip.pause();
    this.clip.currentTime = 0;
  }

  private renderVolume(): void {
    this.clip.volume = this.volume * (this.paused ? PAUSED_MUSIC_VOLUME : MUSIC_VOLUME);
  }
}
