export const FINISH_RUNNER_CONTROL_DELAY_SECONDS = 0.82;
export const FINISH_ESCAPE_HEAD_START_SECONDS = 2;
export const FINISH_TOSS_SECONDS = 3.35;

export function finishPursuitStartsAt(runnerStartedAt: number): number {
  return runnerStartedAt
    + FINISH_RUNNER_CONTROL_DELAY_SECONDS
    + FINISH_ESCAPE_HEAD_START_SECONDS;
}

export function finishResultsReady(caughtElapsedSeconds: number | null): boolean {
  return caughtElapsedSeconds !== null && caughtElapsedSeconds >= FINISH_TOSS_SECONDS;
}

export function shouldOpenFinishResults(
  phase: string,
  celebrationReady: boolean,
): boolean {
  return phase === 'finished' && celebrationReady;
}

export function formatRaceResultTime(seconds: number): string {
  const totalTenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(totalTenths / 600).toString().padStart(2, '0');
  const remaining = ((totalTenths % 600) / 10).toFixed(1).padStart(4, '0');
  return `${minutes}:${remaining}`;
}
