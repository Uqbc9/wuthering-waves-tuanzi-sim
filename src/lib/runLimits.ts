export const DEFAULT_SIMULATION_RUNS = 30_000;
export const SIMULATION_RUN_STEP = 1_000;

export function clampSimulationRuns(value: unknown, fallback = DEFAULT_SIMULATION_RUNS): number {
  const numeric = Number(value);
  const fallbackValue =
    Number.isFinite(fallback) && Number(fallback) > 0 ? Math.trunc(Number(fallback)) : DEFAULT_SIMULATION_RUNS;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackValue;
  }
  return Math.trunc(numeric);
}
