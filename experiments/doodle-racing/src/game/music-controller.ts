type AudioFactory = (source: string) => HTMLAudioElement;

export type MusicScene = 'menu' | 'explore' | 'off';

type AudibleMusicScene = Exclude<MusicScene, 'off'>;

const MUSIC_SOURCES: Readonly<Record<AudibleMusicScene, string>> = Object.freeze({
  menu: new URL('../assets/audio/main-song.opus', import.meta.url).href,
  explore: new URL('../assets/audio/explore-song.opus', import.meta.url).href,
});
const MUSIC_VOLUMES: Readonly<Record<AudibleMusicScene, number>> = Object.freeze({
  menu: 0.32,
  explore: 0.32,
});
const PAUSED_MUSIC_VOLUME = 0.055;

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

/** Bundled Paper Circuit score with scene-aware playback and an independent music mix. */
export class MusicController {
  private readonly clips: Readonly<Record<AudibleMusicScene, HTMLAudioElement>>;
  private readonly loadedScenes = new Set<AudibleMusicScene>();
  private unlocked = false;
  private enabled = true;
  private paused = false;
  private scene: MusicScene = 'menu';
  private volume = 1;

  public constructor(createAudio: AudioFactory = (source) => new Audio(source)) {
    this.clips = Object.freeze({
      menu: createAudio(MUSIC_SOURCES.menu),
      explore: createAudio(MUSIC_SOURCES.explore),
    });
    for (const clip of Object.values(this.clips)) {
      clip.loop = true;
      clip.preload = 'metadata';
    }
    this.renderVolume();
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public get currentVolume(): number {
    return this.volume;
  }

  public unlock(): void {
    this.unlocked = true;
    this.playActiveScene();
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.pauseAll();
    else this.playActiveScene();
  }

  public setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    this.pauseAll();
    this.scene = scene;
    this.playActiveScene();
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
    this.pauseAll();
    for (const clip of Object.values(this.clips)) clip.currentTime = 0;
  }

  private playActiveScene(): void {
    if (!this.enabled || !this.unlocked || this.scene === 'off') return;
    const clip = this.clips[this.scene];
    if (!this.loadedScenes.has(this.scene)) {
      this.loadedScenes.add(this.scene);
      clip.preload = 'auto';
      clip.load();
    }
    void clip.play().catch(() => undefined);
  }

  private pauseAll(): void {
    for (const clip of Object.values(this.clips)) clip.pause();
  }

  private renderVolume(): void {
    for (const scene of Object.keys(this.clips) as AudibleMusicScene[]) {
      this.clips[scene].volume = this.volume * (
        this.paused ? PAUSED_MUSIC_VOLUME : MUSIC_VOLUMES[scene]
      );
    }
  }
}
