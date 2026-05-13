import { describe, expect, it } from "vitest";
import { defaultConfig } from "../config";
import { BUDDAWANG_ID } from "../types";
import {
  buildManualMatch,
  getFirstLapStartPosition,
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

const firstLapStart = getFirstLapStartPosition(defaultConfig);

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
    expect(trace.timeline[0].positions[trace.racers[0]]).toBe(firstLapStart);
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
    expect(match.initial_state?.state_flags?.cartethyia_triggered).toBe(true);

    const result = simulateManualRace(defaultConfig, setup, 40, 20260510);
    expect(result.match_name).toBe("手动赛局");
    expect(Object.keys(result.rank_counts)).toHaveLength(6);

    const trace = traceManualRace(defaultConfig, setup, 20260510);
    expect(trace.timeline[0].progress?.denia.target).toBe(32);
    expect(trace.timeline[0].progress?.phoebe.target).toBe(33);
  });

  it("keeps second-lap racers at tile 0 when they restart from the shared start line", () => {
    const trace = traceManualRace(
      defaultConfig,
      {
        lap_mode: "second",
        racers: ["augusta", "younuo", "florof"],
        positions: { augusta: 0, younuo: 0, florof: 0 },
        stack_order: ["augusta", "younuo", "florof"],
      },
      20260510,
    );
    expect(trace.timeline[0].positions.augusta).toBe(0);
    expect(trace.timeline[0].positions.younuo).toBe(0);
    expect(trace.timeline[0].positions.florof).toBe(0);
    expect(trace.timeline[0].stacks["0"]).toEqual(["florof", "younuo", "augusta"]);
    expect(trace.timeline[0].stacks["32"]).toBeUndefined();
  });

  it("ignores supplied first-lap start stack order for group C racers at tile 1", () => {
    const setup = {
      lap_mode: "first",
      racers: ["augusta", "younuo", "florof", "changli", "jinhsi", "calcharo"],
      positions: {
        augusta: firstLapStart,
        younuo: firstLapStart,
        florof: firstLapStart,
        changli: firstLapStart,
        jinhsi: firstLapStart,
        calcharo: firstLapStart,
      },
      stack_order: ["augusta", "younuo", "florof", "changli", "jinhsi", "calcharo"],
    } satisfies ManualRaceSetup;
    const reversedSetup: ManualRaceSetup = {
      ...setup,
      stack_order: [...setup.stack_order].reverse(),
    };
    const first = traceManualRace(defaultConfig, setup, 2);
    const reversed = traceManualRace(defaultConfig, reversedSetup, 2);
    const roundOneOrder = first.timeline.find(
      (step) => step.event_type === "round_order" && step.round_no === 1,
    );
    const calcharoTurn = first.timeline.find(
      (step) => step.event_type === "racer_turn" && step.round_no === 1 && step.actor === "calcharo",
    );
    expect(roundOneOrder?.notes).toContain("首轮同在起点，暂无堆叠前后，轮初堆叠技能不触发");
    expect(calcharoTurn?.notes).not.toContain("末位起步 +3");
    expect(reversed.rounds).toBe(first.rounds);
    expect(reversed.ranking).toEqual(first.ranking);
  });

  it("marks trigger-once skills as already used before the next finish in manual second-lap mode", () => {
    const match = buildManualMatch(defaultConfig, {
      lap_mode: "second",
      racers: ["aemis", "younuo", "cartethyia"],
      positions: {
        aemis: 30,
        younuo: 18,
        cartethyia: 29,
      },
      stack_order: ["aemis", "younuo", "cartethyia"],
    });
    expect(match.initial_state?.state_flags?.aemis_midpoint_teleport_triggered).toBe(true);
    expect(match.initial_state?.state_flags?.younuo_midpoint_teleport_triggered).toBe(true);
    expect(match.initial_state?.state_flags?.cartethyia_triggered).toBe(true);

    const finishMatch = buildManualMatch(defaultConfig, {
      lap_mode: "second",
      racers: ["aemis"],
      positions: { aemis: 32 },
      stack_order: ["aemis"],
    });
    expect(finishMatch.initial_state?.state_flags?.aemis_midpoint_teleport_triggered).toBeUndefined();
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
        positions: { lu_hesi: firstLapStart, siglica: firstLapStart },
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

  it("teleports Aemis to the nearest racer ahead after ending above tile 15", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [2];
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["aemis", "augusta"],
        positions: { aemis: 14, augusta: 20 },
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

  it("does not trigger Aemis teleport when ending exactly on tile 15", () => {
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
    expect(turn?.to_position).toBe(15);
    expect(turn?.teleported).toBeUndefined();
    expect(turn?.midpoint_teleport_triggered).toBeUndefined();
  });

  it("ignores racers on Aemis's landing tile when choosing the teleport target", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [2];
    setRacerSkill(config, "augusta", { type: "none" });
    setRacerSkill(config, "hiyuki", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["aemis", "augusta", "hiyuki"],
        positions: { aemis: 15, augusta: 17, hiyuki: 20 },
        stack_order: ["aemis", "augusta", "hiyuki"],
      },
      20260510,
    );
    const turn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "aemis",
    );
    expect(turn?.to_position).toBe(20);
    expect(turn?.teleport_target).toBe("hiyuki");
    expect(turn?.stacks["17"]).toContain("augusta");
    expect(turn?.stacks["17"]).not.toContain("aemis");
  });

  it("uses Aemis's post-mechanism tile when choosing the teleport target", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [2];
    setRacerSkill(config, "augusta", { type: "none" });
    setRacerSkill(config, "hiyuki", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["aemis", "augusta", "hiyuki"],
        positions: { aemis: 14, augusta: 17, hiyuki: 20 },
        stack_order: ["aemis", "augusta", "hiyuki"],
      },
      20260510,
    );
    const turn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "aemis",
    );
    expect(turn?.teleport_from_position).toBe(17);
    expect(turn?.teleport_target).toBe("hiyuki");
    expect(turn?.to_position).toBe(20);
    expect(turn?.stacks["17"]).toContain("augusta");
    expect(turn?.stacks["17"]).not.toContain("aemis");
  });

  it("teleports only Aemis and leaves carried racers on her pre-teleport tile", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [2];
    setRacerSkill(config, "hiyuki", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["aemis", "augusta", "hiyuki"],
        positions: { aemis: 14, augusta: 14, hiyuki: 20 },
        stack_order: ["augusta", "aemis", "hiyuki"],
      },
      20260512,
    );
    const turn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "aemis",
    );
    const teleportFrom = String(turn?.teleport_from_position);
    const teleportTo = String(turn?.teleport_to_position);

    expect(turn?.movers).toContain("augusta");
    expect(turn?.teleported).toBe(true);
    expect(turn?.stacks[teleportFrom]).toEqual(["augusta"]);
    expect(turn?.stacks[teleportTo]?.at(-1)).toBe("aemis");
  });

  it("does not let Aemis reuse her first-lap teleport before crossing the next finish", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "second",
        racers: ["aemis", "augusta"],
        positions: { aemis: 30, augusta: 31 },
        stack_order: ["aemis", "augusta"],
      },
      20260512,
    );
    const turn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "aemis",
    );
    expect(turn?.from_position).toBe(30);
    expect(turn?.to_position).toBe(31);
    expect(turn?.teleported).toBeUndefined();
    expect(turn?.midpoint_teleport_triggered).toBeUndefined();
  });

  it("does not trigger Aemis teleport when she only reaches the next finish in second-lap mode", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", {
      type: "fixed_roll_cycle",
      sequence: [3],
    });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "second",
        racers: ["augusta", "aemis"],
        positions: { augusta: 30, aemis: 31 },
        stack_order: ["augusta", "aemis"],
      },
      3,
    );
    const turn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "aemis",
    );
    expect(turn?.from_position).toBe(31);
    expect(turn?.to_position).toBe(32);
    expect(turn?.teleported).toBeUndefined();
    expect(turn?.midpoint_teleport_triggered).toBeUndefined();
  });

  it("refreshes Aemis's teleport after she crosses the next finish in second-lap mode", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [17];
    setRacerSkill(config, "augusta", {
      type: "fixed_roll_cycle",
      sequence: [18],
    });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "second",
        racers: ["aemis", "augusta"],
        positions: { aemis: 31, augusta: 32 },
        stack_order: ["aemis", "augusta"],
      },
      7,
    );
    const turn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "aemis",
    );
    expect(turn?.teleported).toBe(true);
    expect(turn?.teleport_target).toBe("augusta");
    expect(turn?.notes).toContain("超过15格，传送到奥古斯塔顶端");
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

  it("makes Augusta skip from the top of a stack and act last next round", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["florof", "augusta"],
        positions: { florof: 4, augusta: 4 },
        stack_order: ["augusta", "florof"],
      },
      20260512,
    );

    const roundOneAugusta = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.round_no === 1 && step.actor === "augusta",
    );
    const roundTwoOrder = trace.timeline.find(
      (step) => step.event_type === "round_order" && step.round_no === 2,
    );
    expect(roundOneAugusta?.roll).toBeNull();
    expect(roundOneAugusta?.steps).toBe(0);
    expect(roundOneAugusta?.notes).toContain("开始走格子前位于顶端，本回合不行动，下回合最后行动");
    expect(roundTwoOrder?.action_order?.at(-1)).toBe("augusta");
  });

  it("does not make Augusta skip if a rift shuffles her away from the top before her move", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "hiyuki", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["hiyuki", "augusta"],
        positions: { hiyuki: 5, augusta: 5 },
        stack_order: ["augusta", "hiyuki"],
      },
      3,
    );

    const hiyukiTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.round_no === 1 && step.actor === "hiyuki",
    );
    const augustaTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.round_no === 1 && step.actor === "augusta",
    );
    expect(hiyukiTurn?.to_position).toBe(6);
    expect(hiyukiTurn?.stacks["6"]).toEqual(["augusta", "hiyuki"]);
    expect(augustaTurn?.roll).toBe(1);
    expect(augustaTurn?.steps).toBe(1);
    expect(augustaTurn?.movers).toEqual(["augusta", "hiyuki"]);
    expect(augustaTurn?.notes).not.toContain(
      "开始走格子前位于顶端，本回合不行动，下回合最后行动",
    );
  });

  it("teleports every unfinished racer to Younuo after her own move passes the midpoint", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", { type: "none" });
    setRacerSkill(config, "calcharo", { type: "none" });
    setRacerSkill(config, "hiyuki", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["younuo", "augusta", "calcharo", "hiyuki"],
        positions: { younuo: 15, augusta: 18, calcharo: 14, hiyuki: 4 },
        stack_order: ["augusta", "younuo", "calcharo", "hiyuki"],
      },
      20260512,
    );

    const younuoTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "younuo",
    );
    const stack = younuoTurn?.stacks[String(younuoTurn.to_position)];
    expect(younuoTurn?.all_racers_teleport_triggered).toBe(true);
    expect(younuoTurn?.teleported_racers).toEqual(["augusta", "calcharo", "hiyuki"]);
    expect(stack).toEqual(["hiyuki", "calcharo", "younuo", "augusta"]);
  });

  it("does not trigger Younuo's all-racer teleport when another racer carries her", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [2];
    setRacerSkill(config, "augusta", { type: "none" });
    setRacerSkill(config, "hiyuki", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["augusta", "younuo", "hiyuki"],
        positions: { augusta: 14, younuo: 14, hiyuki: 20 },
        stack_order: ["younuo", "augusta", "hiyuki"],
      },
      20260510,
    );
    const augustaTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "augusta",
    );
    expect(augustaTurn?.movers).toContain("younuo");
    expect(augustaTurn?.all_racers_teleport_triggered).toBeUndefined();
    expect(augustaTurn?.teleported_racers).toBeUndefined();
  });

  it("does not trigger Younuo's all-racer teleport when no racer is ahead", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", { type: "none" });
    setRacerSkill(config, "hiyuki", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["younuo", "augusta", "hiyuki"],
        positions: { younuo: 15, augusta: 1, hiyuki: 2 },
        stack_order: ["younuo", "hiyuki", "augusta"],
      },
      20260510,
    );
    const younuoTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "younuo",
    );
    expect(younuoTurn?.to_position).toBeGreaterThan(15);
    expect(younuoTurn?.all_racers_teleport_triggered).toBeUndefined();
    expect(younuoTurn?.midpoint_teleport_triggered).toBeUndefined();
    expect(younuoTurn?.teleported_racers).toBeUndefined();
  });

  it("does not let Younuo reuse her first-lap teleport before crossing the next finish", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "second",
        racers: ["younuo", "augusta"],
        positions: { younuo: 30, augusta: 31 },
        stack_order: ["younuo", "augusta"],
      },
      20260512,
    );
    const younuoTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "younuo",
    );
    expect(younuoTurn?.from_position).toBe(30);
    expect(younuoTurn?.to_position).toBe(31);
    expect(younuoTurn?.all_racers_teleport_triggered).toBeUndefined();
    expect(younuoTurn?.midpoint_teleport_triggered).toBeUndefined();
  });

  it("does not trigger Younuo's teleport when she only reaches the next finish in second-lap mode", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", {
      type: "fixed_roll_cycle",
      sequence: [3],
    });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "second",
        racers: ["augusta", "younuo"],
        positions: { augusta: 30, younuo: 31 },
        stack_order: ["augusta", "younuo"],
      },
      3,
    );
    const younuoTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "younuo",
    );
    expect(younuoTurn?.from_position).toBe(31);
    expect(younuoTurn?.to_position).toBe(32);
    expect(younuoTurn?.all_racers_teleport_triggered).toBeUndefined();
    expect(younuoTurn?.midpoint_teleport_triggered).toBeUndefined();
  });

  it("infers Younuo's consumed teleport in raw second-lap initial states", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", { type: "none" });
    config.matches = [
      {
        id: "raw_younuo_second_lap",
        name: "尤诺第二圈初始状态",
        type: "single_race",
        racers: ["younuo", "augusta"],
        initial_state: {
          finish_rule: "one_lap_after_next_finish",
          positions: { younuo: 18, augusta: 20 },
          stacks: { "18": ["younuo"], "20": ["augusta"] },
        },
      },
    ];

    const trace = traceSingleRace(config, "raw_younuo_second_lap", 20260512);
    const younuoTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "younuo",
    );
    expect(younuoTurn?.from_position).toBe(18);
    expect(younuoTurn?.to_position).toBe(19);
    expect(younuoTurn?.all_racers_teleport_triggered).toBeUndefined();
    expect(younuoTurn?.midpoint_teleport_triggered).toBeUndefined();
  });

  it("refreshes Younuo's all-racer teleport after she crosses the next finish in second-lap mode", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [17];
    setRacerSkill(config, "augusta", {
      type: "fixed_roll_cycle",
      sequence: [18],
    });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "second",
        racers: ["younuo", "augusta"],
        positions: { younuo: 31, augusta: 32 },
        stack_order: ["younuo", "augusta"],
      },
      7,
    );
    const younuoTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "younuo",
    );
    expect(younuoTurn?.all_racers_teleport_triggered).toBe(true);
    expect(younuoTurn?.teleported_racers).toEqual(["augusta"]);
  });

  it("gives Florof the move-start bottom-stack movement bonus", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["florof", "augusta"],
        positions: { florof: 4, augusta: 4 },
        stack_order: ["augusta", "florof"],
      },
      1,
    );
    const florofTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.round_no === 1 && step.actor === "florof",
    );
    expect(florofTurn?.steps).toBe(4);
    expect(florofTurn?.notes).toContain("开始走格子前底层 +3");
  });

  it("checks Florof's bottom-stack bonus right before her move", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "hiyuki", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["florof", "hiyuki"],
        positions: { florof: 4, hiyuki: 4 },
        stack_order: ["hiyuki", "florof"],
      },
      7,
    );
    const roundOrder = trace.timeline.find(
      (step) => step.event_type === "round_order" && step.round_no === 1,
    );
    const hiyukiTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.round_no === 1 && step.actor === "hiyuki",
    );
    const florofTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.round_no === 1 && step.actor === "florof",
    );
    expect(roundOrder?.action_order?.[0]).toBe("hiyuki");
    expect(hiyukiTurn?.stacks["4"]).toEqual(["florof"]);
    expect(florofTurn?.steps).toBe(1);
    expect(florofTurn?.notes).not.toContain("开始走格子前底层 +3");
  });

  it("does not give Florof the bottom-stack bonus when Budawang is below", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    config.special_units = {
      ...config.special_units,
      budawang: {
        ...config.special_units?.budawang,
        dice_sides: [1],
      },
    };
    config.matches = [
      {
        id: "florof_budawang_below",
        name: "弗洛洛布大王垫底测试",
        type: "single_race",
        racers: ["florof"],
        initial_state: {
          positions: { florof: 4, [BUDDAWANG_ID]: 4 },
          stacks: { "4": [BUDDAWANG_ID, "florof"] },
          budawang: { active: true, position: 4 },
        },
      },
    ];

    const trace = traceSingleRace(config, "florof_budawang_below", 1);
    const florofTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "florof",
    );
    expect(florofTurn?.steps).toBe(1);
    expect(florofTurn?.notes).not.toContain("开始走格子前底层 +3");
  });

  it("can schedule Changli to act last on the next round when stacked above others", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", { type: "none" });
    setRacerSkill(config, "changli", {
      type: "below_stack_chance_next_round_last",
      probability: 1,
    });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["changli", "augusta"],
        positions: { changli: 5, augusta: 5 },
        stack_order: ["changli", "augusta"],
      },
      20260512,
    );
    const roundTwoOrder = trace.timeline.find(
      (step) => step.event_type === "round_order" && step.round_no === 2,
    );
    expect(roundTwoOrder?.action_order?.at(-1)).toBe("changli");
  });

  it("lets Jinhsi move to the top before moving when the probability triggers", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "jinhsi", {
      type: "above_stack_chance_to_top",
      probability: 1,
    });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["jinhsi", "augusta"],
        positions: { jinhsi: 7, augusta: 7 },
        stack_order: ["augusta", "jinhsi"],
      },
      20260512,
    );
    const jinhsiTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "jinhsi",
    );
    expect(jinhsiTurn?.movers).toEqual(["jinhsi"]);
    expect(jinhsiTurn?.notes).toContain("移至堆叠顶端");
  });

  it("does not check Jinhsi before another racer moves a stack", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", { type: "none" });
    setRacerSkill(config, "jinhsi", {
      type: "above_stack_chance_to_top",
      probability: 1,
    });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["jinhsi", "augusta"],
        positions: { jinhsi: 7, augusta: 7 },
        stack_order: ["augusta", "jinhsi"],
      },
      7,
    );
    const roundOrder = trace.timeline.find(
      (step) => step.event_type === "round_order" && step.round_no === 1,
    );
    const augustaTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "augusta",
    );
    expect(roundOrder?.action_order?.[0]).toBe("augusta");
    expect(augustaTurn?.movers).toEqual(["augusta"]);
    expect(augustaTurn?.notes).not.toContain("今汐移至堆叠顶端");
    expect(augustaTurn?.stacks[String(augustaTurn?.from_position)]).toEqual(["jinhsi"]);
    expect(augustaTurn?.stacks[String(augustaTurn?.to_position)]).toEqual(["augusta"]);
  });

  it("gives Calcharo a movement bonus when starting the move in last place", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    setRacerSkill(config, "augusta", { type: "none" });
    const trace = traceManualRace(
      config,
      {
        lap_mode: "first",
        racers: ["calcharo", "augusta"],
        positions: { calcharo: 4, augusta: 8 },
        stack_order: ["augusta", "calcharo"],
      },
      20260512,
    );
    const calcharoTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "calcharo",
    );
    expect(calcharoTurn?.steps).toBe(4);
    expect(calcharoTurn?.notes).toContain("末位起步 +3");
  });

  it("does not give Calcharo the last-place bonus when Budawang is last", () => {
    const config = cloneConfig();
    config.assumptions.dice_sides = [1];
    config.special_units = {
      ...config.special_units,
      budawang: {
        ...config.special_units?.budawang,
        dice_sides: [1],
      },
    };
    config.matches = [
      {
        id: "calcharo_budawang_last",
        name: "卡卡罗布大王末位测试",
        type: "single_race",
        racers: ["calcharo"],
        initial_state: {
          positions: { calcharo: 4, [BUDDAWANG_ID]: 3 },
          stacks: { "4": ["calcharo"], "3": [BUDDAWANG_ID] },
          budawang: { active: true, position: 3 },
        },
      },
    ];

    const trace = traceSingleRace(config, "calcharo_budawang_last", 7);
    const calcharoTurn = trace.timeline.find(
      (step) => step.event_type === "racer_turn" && step.actor === "calcharo",
    );
    expect(calcharoTurn?.steps).toBe(1);
    expect(calcharoTurn?.notes).not.toContain("末位起步 +3");
  });
});
