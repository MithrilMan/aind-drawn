import type { ControlActionId } from './controls.js';
import type { RacePhase } from './race-model.js';

export type ExploreGameActivity =
  | 'unavailable'
  | 'entrance'
  | 'vehicle-entry'
  | 'on-foot'
  | 'driving'
  | 'vehicle-customizer';

export type ExploreGameState = Readonly<{
  mode: 'explore';
  activity: ExploreGameActivity;
  activeVehicleId: string | null;
}>;

export type PaperCircuitGameState =
  | Readonly<{ mode: 'menu' }>
  | Readonly<{ mode: 'race'; phase: RacePhase }>
  | ExploreGameState
  | Readonly<{ mode: 'paused'; returnMode: 'race' | 'explore' }>;

export type GlobalControlActionId = Extract<
  ControlActionId,
  'back' | 'pause' | 'camera' | 'reroll'
>;

export type GlobalControlCommand =
  | 'none'
  | 'resume'
  | 'pause'
  | 'close-overlay'
  | 'camera'
  | 'reroll';

export const MENU_GAME_STATE: PaperCircuitGameState = Object.freeze({ mode: 'menu' });

export function raceGameState(phase: RacePhase): PaperCircuitGameState {
  return Object.freeze({ mode: 'race', phase });
}

export function exploreGameState(
  activity: ExploreGameActivity,
  activeVehicleId: string | null = null,
): ExploreGameState {
  return Object.freeze({ mode: 'explore', activity, activeVehicleId });
}

export function pausedGameState(
  returnMode: 'race' | 'explore',
): PaperCircuitGameState {
  return Object.freeze({ mode: 'paused', returnMode });
}

/** Resolves abstract actions to context-owned commands without inspecting a physical device. */
export function resolveGlobalControlCommand(
  state: PaperCircuitGameState,
  action: GlobalControlActionId,
): GlobalControlCommand {
  if (state.mode === 'paused') {
    return action === 'back' || action === 'pause' ? 'resume' : 'none';
  }
  if (state.mode === 'menu') return action === 'reroll' ? 'reroll' : 'none';
  if (state.mode === 'race') {
    if (action === 'pause') return 'pause';
    return action === 'camera' ? 'camera' : 'none';
  }
  if (state.activity === 'vehicle-customizer') {
    if (action === 'back') return 'close-overlay';
    return action === 'pause' ? 'pause' : 'none';
  }
  if (action === 'pause') return 'pause';
  if (action === 'camera' && (state.activity === 'on-foot' || state.activity === 'driving')) {
    return 'camera';
  }
  return action === 'reroll' && state.activity === 'on-foot' ? 'reroll' : 'none';
}
