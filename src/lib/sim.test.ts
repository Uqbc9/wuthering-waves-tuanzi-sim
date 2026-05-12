import { describe, expect, it } from "vitest";
import { defaultConfig } from "../config";
import { BUDDAWANG_ID } from "../types";
import {
  buildManualMatch,
  simulateManualRace,
  simulateMatch,
  skillLabel,
  traceManualRace,
  traceSingleRace,
  validateConfig,
} from "./sim";
import type { ManualRaceSetup, TuanziConfig } from "../types";

function cloneConfig(): TuanziConfig {
  return JSON.parse(JSON.stringify(defaultConfig)) as TuanziConfig;
}

function setRacerSkill(config: TuanziConfig, racerId: string, skill: TuanziConfig["racers"][number]["skill"]) {
  const racer = config.racers.find((item) => item.id === racerId);
  if (!racer) {
    throw new Error(`Missing test racer ${racerId}`);
  }
  racer.skill = skill;
}

describe("browser simulator", () => {
  it("validates the bundled championship config", () => {
    expect(() => validateConfig(defaultConfig)).not.toThrow();
  });

  it("keeps seeded browser simulations reproducible", () => {
    const first = simulateMatch(defaultConfig, "a_group_upper", 80, 20260509);
    const second = simulateMatch(defaultConfig, "a_group_upper", 80, 20260509);
    expect(first.rank_counts).toEqual(second.rank_counts);
  });

  it("keeps aggregate placement counts aligned with runs", () => {
    const runs = 60;
    const result = simulateMatch(defaultConfig, "a_group_combined", runs, 20260509);
    for (const counts of Object.values(result.rank_counts)) {
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      expect(total).toBe(runs);
    }
  });

  it("records a playable timeline for single race traces", () => {
    const trace = traceSingleRace(defaultConfig, "a_group_upper", 20260509);
    expect(trace.type).toBe("single_race_trace");
    expect(trace.timeline[0].event_type).toBe("start");
    expect(trace.timeline.at(-1)?.event_type).toBe("finish");
    const orders = trace.timeline.filter((step) => step.event_type === "round_order");
    expect(orders.length).toBe(trace.rounds);
    expect(orders[0].action_order).not.toContain(BUDDAWANG_ID);
    expect(orders[2].action_order).toContain(BUDDAWANG_ID);
  });

  it("supports manual second-lap setup with custom positions", () => {
    const setup: ManualRaceSetup = {
      lap_mode: "second",
      racers: ["denia", "phoebe", "siglica", "hiyuki", "lu_hesi", "cartethyia"],
      positions: {
        denia: 32,
        phoebe: 31,
        siglica: 31,
        hiyuki: 30,
        lu_hesi: 30,
        cartethyia: 29,
      },
      stack_order: ["denia", "siglica", "phoebe", "lu_hesi", "hiyuki", "cartethyia"],
    };
    const match = buildManualMatch(defaultConfig, setup);
    expect(match.initial_state?.stacks?.["31"]).toEqual(["phoebe", "siglica"]);

    const result = simulateManualRace(defaultConfig, setup, 40, 20260510);
    expect(result.match_name).toBe("手动赛局");
    expect(Object.keys(result.rank_counts)).toHaveLength(6);

    const trace = traceManualRace(defaultConfig, setup, 20260510);
    expect(trace.timeline[0].progress?.denia.target).toBe(32);
    expect(trace.timeline[0].progress?.phoebe.target).toBe(33);
  });

  it("uses configured skill names in labels", () => {
    const racers = Object.fromEntries(defaultConfig.racers.map((racer) => [racer.id, racer]));
    expect(skillLabel(racers.chisaki.skill)).toContain("视阈解眀");
    expect(skillLabel(racers.denia.skill)).toContain("好事成“双”");
  });

  it("supports fixed-cycle and restricted dice skills", () => {
    const morningTrace = traceManualRace(
      defaultConfig,
      {
        lap_mode: "first",
        racers: ["morning"],
        positions: { morning: 0 },
        stack_order: ["morning"],
      },
      20260510,
    );
    const morningRolls = morningTrace.timeline
      .filter((step) => step.event_type === "racer_turn" && step.actor === "morning")
      .map((step) => step.roll);
    expect(morningRolls.slice(0, 4)).toEqual([3, 2, 1, 3]);

    const shorekeeperTrace = traceManualRace(
      defaultConfig,
      {
        lap_mode: "first",
        racers: ["shorekeeper"],
        positions: { shorekeeper: 0 },
        stack_order: ["shorekeeper"],
      },
      20260510,
    );
    const shorekeeperRolls = shorekeeperTrace.timeline
      .filter((step) => step.event_type === "racer_turn" && step.actor === "shorekeeper")
      .map((step) => step.roll);
    expect(shorekeeperRolls.length).toBeGreaterThan(0);
    expect(shorekeeperRolls.every((roll) => roll === 2 || roll === 3)).toBe(true);
  });

  it("adds Chisaki's bonus when her roll is a round minimum", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["chisaki"],
        positions: { chisaki: 0 },
        stack_order: ["chisaki"],
      },
      20260510,
    );
    const turn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "chisaki",
    );
    expect(turn?.roll).toBe(1);
    expect(turn?.steps).toBe(3);
    expect(turn?.notes).toContain("本轮最低点 +2");
  });

  it("counts Budawang's roll for Chisaki's round-minimum skill after Budawang joins", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [2];
    config.special_units = {
      ...config.special_units,
      budawang: {
        ...config.special_units?.budawang,
        dice_sides: [1],
      },
    };
    config.matches = [
      {
        id: "chisaki_budawang_minimum",
        name: "千咲布大王最低点测试",
        type: "single_race",
        racers: ["chisaki"],
        initial_state: {
          positions: { chisaki: 0, [BUDDAWANG_ID]: 20 },
          stacks: { "0": ["chisaki"], "20": [BUDDAWANG_ID] },
          budawang: { active: true, position: 20 },
        },
      },
    ];

    const trace = traceSingleRace(config, "chisaki_budawang_minimum", 20260510);
    const roundOrder = trace.timeline.find(
      (step) => step.event_type === "round_order" && step.round_no === 1,
    );
    const turn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "chisaki",
    );

    expect(roundOrder?.round_rolls).toMatchObject({ chisaki: 2, [BUDDAWANG_ID]: 1 });
    expect(turn?.roll).toBe(2);
    expect(turn?.steps).toBe(2);
    expect(turn?.notes).not.toContain("本轮最低点 +2");
  });

  it("does not let Siglica mark racers before anyone has moved from the start", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [2];
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["lu_hesi", "siglica"],
        positions: { lu_hesi: 0, siglica: 0 },
        stack_order: ["lu_hesi", "siglica"],
      },
      20260510,
    );
    const roundOrder = trace.timeline.find(
      (step) => step.event_type === "round_order" && step.round_no === 1,
    );
    const luHesiTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.round_no === 1 && step.actor === "lu_hesi",
    );
    expect(roundOrder?.notes).toContain("首轮同在起点，暂无前后顺序，西格莉卡不标记");
    expect(luHesiTurn?.steps).toBe(2);
    expect(luHesiTurn?.notes).not.toContain("标记影响 -1");
  });

  it("still lets Siglica use the configured same-tile order away from the start", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [2];
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["lu_hesi", "siglica"],
        positions: { lu_hesi: 4, siglica: 4 },
        stack_order: ["lu_hesi", "siglica"],
      },
      20260510,
    );
    const luHesiTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.round_no === 1 && step.actor === "lu_hesi",
    );
    expect(luHesiTurn?.steps).toBe(1);
    expect(luHesiTurn?.notes).toContain("标记影响 -1");
  });

  it("supports guaranteed skip and guaranteed double roll variants", () => {
    const linnaeConfig = cloneConfig();
    linnaeConfig.assumptions.dice_sides = [2];
    setRacerSkill(linnaeConfig, "linnae", {
      type: "chance_double_or_skip",
      double_probability: 0,
      skip_probability: 1,
    });
    const linnaeTrace = traceManualRace(
      linnaeConfig,
      {
        lap_mode: "first",
        racers: ["linnae"],
        positions: { linnae: 0 },
        stack_order: ["linnae"],
      },
      20260510,
    );
    const linnaeTurn = linnaeTrace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "linnae",
    );
    expect(linnaeTurn?.steps).toBe(0);
    expect(linnaeTurn?.to_position).toBe(0);
    expect(linnaeTurn?.notes).toContain("本回合无法移动");

    const carllottaConfig = cloneConfig();
    carllottaConfig.assumptions.dice_sides = [2];
    setRacerSkill(carllottaConfig, "carllotta", {
      type: "chance_double_roll",
      probability: 1,
    });
    const carllottaTrace = traceManualRace(
      carllottaConfig,
      {
        lap_mode: "first",
        racers: ["carllotta"],
        positions: { carllotta: 0 },
        stack_order: ["carllotta"],
      },
      20260510,
    );
    const carllottaTurn = carllottaTrace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "carllotta",
    );
    expect(carllottaTurn?.roll).toBe(2);
    expect(carllottaTurn?.steps).toBe(4);
    expect(carllottaTurn?.to_position).toBe(4);
  });

  it("teleports Aemis to the nearest racer ahead after ending at tile 15 or above", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["aemis", "augusta"],
        positions: { aemis: 14, augusta: 16 },
        stack_order: ["aemis", "augusta"],
      },
      20260510,
    );
    const turn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "aemis",
    );
    const teleportPosition = Number(turn?.teleport_to_position);
    expect(turn?.teleported).toBe(true);
    expect(turn?.teleport_trigger_position).toBe(15);
    expect(turn?.to_position).toBe(teleportPosition);
    expect(turn?.stacks[String(teleportPosition)]?.at(-1)).toBe("aemis");
  });

  it("does not consume Aemis teleport when no racer is ahead", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", {
      type: "fixed_roll_cycle",
      sequence: [3],
    });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["aemis", "augusta"],
        positions: { aemis: 14, augusta: 12 },
        stack_order: ["aemis", "augusta"],
      },
      2,
    );
    const aemisTurns = trace.timeline.filter(
      (step) => step.event_type === "racer_turn" && step.actor === "aemis",
    );
    expect(aemisTurns[0]?.to_position).toBe(15);
    expect(aemisTurns[0]?.teleported).toBeUndefined();
    expect(aemisTurns[0]?.midpoint_teleport_triggered).toBeUndefined();
    expect(aemisTurns[1]?.teleported).toBe(true);
  });

  it("does not trigger Aemis teleport when another racer carries Aemis", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["augusta", "aemis", "hiyuki"],
        positions: { augusta: 14, aemis: 14, hiyuki: 20 },
        stack_order: ["aemis", "augusta", "hiyuki"],
      },
      20260510,
    );
    const augustaTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "augusta",
    );
    expect(augustaTurn?.movers).toContain("aemis");
    expect(augustaTurn?.to_position).toBe(15);
    expect(augustaTurn?.teleported).toBeUndefined();
    expect(augustaTurn?.midpoint_teleport_triggered).toBeUndefined();
  });
});
