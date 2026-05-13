import { defaultConfig } from "../config";
import { clampSimulationRuns } from "../lib/runLimits";
import { simulateManualRace, traceManualRacePool } from "../lib/sim";
import { buildRacePlaybackData } from "../lib/visual";
import type { ManualRaceSetup, RacePlaybackData, SimulationResult } from "../types";

type WorkerRequest = {
  id: string;
  runs: number;
  seed: number | null;
  traceSamples: number;
  manualSetup: ManualRaceSetup;
};

type WorkerResponse =
  | { id: string; type: "progress"; completedRuns: number; totalRuns: number }
  | {
      id: string;
      type: "done";
      result: SimulationResult;
      playback: RacePlaybackData;
    }
  | { id: string; type: "error"; message: string };

const post = (message: WorkerResponse) => {
  self.postMessage(message);
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, manualSetup, runs, seed, traceSamples } = event.data;
  try {
    const safeRuns = clampSimulationRuns(runs);
    const result = simulateManualRace(defaultConfig, manualSetup, safeRuns, seed, (completedRuns, totalRuns) => {
      post({ id, type: "progress", completedRuns, totalRuns });
    });
    const traces = traceManualRacePool(defaultConfig, manualSetup, traceSamples, seed);
    const playback = buildRacePlaybackData(defaultConfig, traces[0], traces);
    post({ id, type: "done", result, playback });
  } catch (error) {
    post({
      id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
