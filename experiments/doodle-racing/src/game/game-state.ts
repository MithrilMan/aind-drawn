import type { ControlActionId } from './controls.js';
import type { RacePhase } from './race-model.js';

export type ExploreGameActivity =
  | 'unavailable'
  | 'entrance'
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
  | ExploreGameState;

export type GlobalControlActionId = Extract<
  ControlActionId,
  'menu' | 'pause' | 'reset-camera' | 'reroll'
>;

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

/** Product policy over controller-agnostic action IDs. */
export function allowsGlobalControlAction(
  state: PaperCircuitGameState,
  action: GlobalControlActionId,
): boolean {
  if (action === 'menu') return state.mode !== 'menu';
  if (state.mode === 'menu') return action === 'reroll';
  if (state.mode === 'race') return action === 'pause';
  if (action === 'reset-camera') {
    return state.activity === 'on-foot' || state.activity === 'driving';
  }
  return action === 'reroll' && state.activity === 'on-foot';
}
