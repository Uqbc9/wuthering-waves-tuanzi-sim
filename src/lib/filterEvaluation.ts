import type { FirstFinishSnapshot } from "../types";

export const DEFAULT_FIRST_FINISH_TAIL_THRESHOLD = 26;

export function parseFirstFinishTailThreshold(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(0, Math.trunc(numeric))
    : DEFAULT_FIRST_FINISH_TAIL_THRESHOLD;
}

export function matchesFirstFinishTailFilter(
  snapshot: FirstFinishSnapshot | null | undefined,
  threshold: number,
): boolean {
  return Boolean(snapshot && snapshot.last_racer_position > threshold);
}
