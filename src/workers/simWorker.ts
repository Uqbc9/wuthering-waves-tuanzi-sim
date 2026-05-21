import { configWithTrack, defaultConfig } from "../config";
import { DEFAULT_FIRST_FINISH_TAIL_THRESHOLD } from "../lib/filterEvaluation";
import { clampSimulationRuns } from "../lib/runLimits";
import {
  simulateManualRace,
  traceManualRacePool,
  traceManualRacePoolByFirstFinishTail,
} from "../lib/sim";
import { buildRacePlaybackData } from "../lib/visual";
import type { ManualRaceSetup, RacePlaybackData, SimulationResult } from "../types";

type SimulateRequest = {
  id: string;
  type?: "simulate";
  trackId?: string;
  runs: number;
  seed: number | null;
  traceSamples: number;
  filterTailThreshold?: number;
  manualSetup: ManualRaceSetup;
};

type FilterPlaybackRequest = {
  id: string;
  type: "filtered_playback";
  trackId?: string;
  seed: number | null;
  traceSamples: number;
  filterTailThreshold?: number;
  manualSetup: ManualRaceSetup;
};

type WorkerRequest = SimulateRequest | FilterPlaybackRequest;

type WorkerResponse =
  | { id: string; type: "progress"; completedRuns: number; totalRuns: number }
  | {
      id: string;
      type: "done";
      result: SimulationResult;
      playback: RacePlaybackData;
      filteredPlayback: RacePlaybackData | null;
    }
  | { id: string; type: "filtered_playback_done"; filteredPlayback: RacePlaybackData | null }
  | { id: string; type: "error"; message: string };

const post = (message: WorkerResponse) => {
  self.postMessage(message);
};

function buildFilteredPlayback(
  trackId: string | null | undefined,
  manualSetup: ManualRaceSetup,
  traceSamples: number,
  seed: number | null,
  filterTailThreshold = DEFAULT_FIRST_FINISH_TAIL_THRESHOLD,
): RacePlaybackData | null {
  const config = configWithTrack(defaultConfig, trackId);
  const traces = traceManualRacePoolByFirstFinishTail(
    config,
    manualSetup,
    traceSamples,
    filterTailThreshold,
    seed,
  );
  return traces.length > 0 ? buildRacePlaybackData(config, traces[0], traces) : null;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, manualSetup, seed, traceSamples, trackId } = event.data;
  try {
    if (event.data.type === "filtered_playback") {
      post({
        id,
        type: "filtered_playback_done",
        filteredPlayback: buildFilteredPlayback(
          trackId,
          manualSetup,
          traceSamples,
          seed,
          event.data.filterTailThreshold,
        ),
      });
      return;
    }

    const { runs } = event.data;
    const safeRuns = clampSimulationRuns(runs);
    const config = configWithTrack(defaultConfig, trackId);
    const result = simulateManualRace(config, manualSetup, safeRuns, seed, (completedRuns, totalRuns) => {
      post({ id, type: "progress", completedRuns, totalRuns });
    });
    const traces = traceManualRacePool(config, manualSetup, traceSamples, seed);
    const playback = buildRacePlaybackData(config, traces[0], traces);
    const filteredPlayback = buildFilteredPlayback(
      trackId,
      manualSetup,
      traceSamples,
      seed,
      event.data.filterTailThreshold,
    );
    post({ id, type: "done", result, playback, filteredPlayback });
  } catch (error) {
    post({
      id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
