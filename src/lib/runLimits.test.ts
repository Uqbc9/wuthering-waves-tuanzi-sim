import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIMULATION_RUNS,
  clampSimulationRuns,
} from "./runLimits";

describe("simulation run limits", () => {
  it("uses the default for non-numeric values", () => {
    expect(clampSimulationRuns("not-a-number")).toBe(DEFAULT_SIMULATION_RUNS);
  });

  it("accepts any positive integer-sized run count", () => {
    expect(clampSimulationRuns(1)).toBe(1);
    expect(clampSimulationRuns(999_999_999)).toBe(999_999_999);
  });

  it("falls back for zero or negative values", () => {
    expect(clampSimulationRuns(0)).toBe(DEFAULT_SIMULATION_RUNS);
    expect(clampSimulationRuns(-5)).toBe(DEFAULT_SIMULATION_RUNS);
  });

  it("truncates fractional run counts", () => {
    expect(clampSimulationRuns(12_345.67)).toBe(12_345);
  });
});
