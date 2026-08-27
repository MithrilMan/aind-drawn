import {
  DEFAULT_PAPER_CIRCUIT_RENDER_STYLE,
  isPaperCircuitRenderStyle,
  type PaperCircuitRenderStyleId,
} from './render-style.js';
import {
  DEFAULT_RACE_LAPS,
  RACE_LAP_OPTIONS,
  type RaceLapCount,
} from './race-model.js';

export type MenuSettings = Readonly<{
  renderStyle: PaperCircuitRenderStyleId;
  laps: RaceLapCount;
  music: boolean;
  musicVolume: number;
  sfx: boolean;
  sfxVolume: number;
}>;

type MenuSettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const DEFAULT_MENU_SETTINGS: MenuSettings = Object.freeze({
  renderStyle: DEFAULT_PAPER_CIRCUIT_RENDER_STYLE,
  laps: DEFAULT_RACE_LAPS,
  music: true,
  musicVolume: 1,
  sfx: true,
  sfxVolume: 1,
});

export const MENU_SETTINGS_STORAGE_KEY = 'paper-circuit.menu.v1';

function browserStorage(): MenuSettingsStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

export function normalizeAudioVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function menuSettingsFrom(value: unknown): MenuSettings {
  if (!isRecord(value)) return DEFAULT_MENU_SETTINGS;
  const renderStyleCandidate = value.renderStyle ?? value.medium;
  const renderStyle = typeof renderStyleCandidate === 'string'
    && isPaperCircuitRenderStyle(renderStyleCandidate)
    ? renderStyleCandidate
    : DEFAULT_MENU_SETTINGS.renderStyle;
  const laps = typeof value.laps === 'number'
    && RACE_LAP_OPTIONS.includes(value.laps as RaceLapCount)
    ? value.laps as RaceLapCount
    : DEFAULT_MENU_SETTINGS.laps;
  return Object.freeze({
    renderStyle,
    laps,
    music: typeof value.music === 'boolean' ? value.music : DEFAULT_MENU_SETTINGS.music,
    musicVolume: typeof value.musicVolume === 'number'
      ? normalizeAudioVolume(value.musicVolume)
      : DEFAULT_MENU_SETTINGS.musicVolume,
    sfx: typeof value.sfx === 'boolean' ? value.sfx : DEFAULT_MENU_SETTINGS.sfx,
    sfxVolume: typeof value.sfxVolume === 'number'
      ? normalizeAudioVolume(value.sfxVolume)
      : DEFAULT_MENU_SETTINGS.sfxVolume,
  });
}

/** Persists the complete initial-menu configuration behind a failure-safe storage boundary. */
export class MenuSettingsStore {
  public constructor(
    private readonly storage: MenuSettingsStorage | null = browserStorage(),
  ) {}

  public load(): MenuSettings {
    try {
      const serialized = this.storage?.getItem(MENU_SETTINGS_STORAGE_KEY);
      return serialized === null || serialized === undefined
        ? DEFAULT_MENU_SETTINGS
        : menuSettingsFrom(JSON.parse(serialized) as unknown);
    } catch {
      return DEFAULT_MENU_SETTINGS;
    }
  }

  public save(settings: MenuSettings): void {
    try {
      this.storage?.setItem(MENU_SETTINGS_STORAGE_KEY, JSON.stringify(menuSettingsFrom(settings)));
    } catch {
      // Menu choices remain session-local when storage is unavailable.
    }
  }
}
