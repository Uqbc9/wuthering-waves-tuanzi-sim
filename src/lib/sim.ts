import {
  BUDDAWANG_ID,
  type AggregateMatch,
  type AggregateSimulationResult,
  type FirstFinishEvaluation,
  type FirstFinishSnapshot,
  type InitialStateConfig,
  type ManualRaceSetup,
  type MatchConfig,
  type RaceResult,
  type RacerConfig,
  type SingleRaceMatch,
  type SingleRaceTrace,
  type SingleSimulationResult,
  type SkillConfig,
  type SimulationResult,
  type TimelineStep,
  type TuanziConfig,
} from "../types";
import { matchesFirstFinishTailFilter } from "./filterEvaluation";
import { SeededRng } from "./rng";

const ROUND_START_MARK_SKILLS = new Set([
  "mark_higher_neighbors_after_roll",
  "mark_higher_neighbors_round_start",
]);
const MIDPOINT_TELEPORT_SKILLS = new Set([
  "midpoint_nearest_ahead_teleport_once",
  "midpoint_adjacent_rank_teleport_once",
  "midpoint_all_racers_to_self_teleport_once",
]);
const TRIGGER_ONCE_REFRESH_AT_NEXT_FINISH_SKILLS = new Set([
  ...MIDPOINT_TELEPORT_SKILLS,
  "last_place_comeback",
]);
const ROUND_START_STACK_SKILLS = new Set([
  "below_stack_chance_next_round_last",
]);

type Racer = {
  id: string;
  name: string;
  skill: SkillConfig;
};

type ProgressCallback = (completedRuns: number, totalRuns: number) => void;

function skillTypeOf(skill: SkillConfig | undefined): string {
  return String(skill?.type ?? "none");
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "undefined" ? fallback : Boolean(value);
}

function incrementCounter(
  target: Record<string, number>,
  key: string | number,
  amount = 1,
): void {
  const normalized = String(key);
  target[normalized] = (target[normalized] ?? 0) + amount;
}

function progressEvery(runs: number): number {
  return Math.max(1, Math.floor(runs / 24));
}

function emptyRankCounts(racerIds: string[]): Record<string, Record<string, number>> {
  return Object.fromEntries(racerIds.map((racerId) => [racerId, {}]));
}

export function getFirstLapStartPosition(config: TuanziConfig): number {
  const trackLength = Number(config.assumptions.track_length);
  const position = Math.trunc(asNumber(config.assumptions.first_lap_start_position, 1));
  return Math.max(0, Math.min(trackLength, position));
}

export function buildRacers(config: TuanziConfig): Record<string, Racer> {
  const racers: Record<string, Racer> = {};
  for (const item of config.racers) {
    racers[item.id] = {
      id: item.id,
      name: item.name,
      skill: item.skill ?? { type: "none" },
    };
  }
  return racers;
}

export function matchById(config: TuanziConfig, matchId: string): MatchConfig {
  const match = config.matches.find((item) => item.id === matchId);
  if (!match) {
    throw new Error(`Unknown match id: ${matchId}`);
  }
  return match;
}

export function validateConfig(config: TuanziConfig): void {
  const required: Array<keyof TuanziConfig> = [
    "metadata",
    "assumptions",
    "track",
    "racers",
    "matches",
  ];
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required key: ${key}`);
    }
  }

  const length = Number(config.assumptions.track_length);
  if (config.track.sequence.length !== length + 1) {
    throw new Error(
      `Track sequence has ${config.track.sequence.length} entries, expected ${
        length + 1
      }`,
    );
  }

  const racerIds = new Set(config.racers.map((item) => item.id));
  if (racerIds.size !== config.racers.length) {
    throw new Error("Duplicate racer id in config");
  }

  const matchIds = new Set(config.matches.map((item) => item.id));
  for (const match of config.matches) {
    if (match.type === "single_race") {
      for (const racerId of match.racers) {
        if (!racerIds.has(racerId)) {
          throw new Error(`Match ${match.id} references unknown racer ${racerId}`);
        }
      }
      validateInitialState(match, new Set(match.racers), length);
    } else if (match.type === "aggregate") {
      for (const sessionId of match.sessions) {
        if (!matchIds.has(sessionId)) {
          throw new Error(`Aggregate ${match.id} references unknown session ${sessionId}`);
        }
      }
    } else {
      throw new Error(`Unsupported match type: ${(match as MatchConfig).type}`);
    }
  }
}

function validateInitialState(
  match: SingleRaceMatch,
  matchRacerIds: Set<string>,
  trackLength: number,
): void {
  const initialState = match.initial_state;
  if (!initialState) {
    return;
  }

  const knownUnits = new Set([...matchRacerIds, BUDDAWANG_ID]);
  const seenInStacks = new Set<string>();
  for (const unitId of Object.keys(initialState.positions ?? {})) {
    if (!knownUnits.has(unitId)) {
      throw new Error(`Initial state for ${match.id} references unknown unit ${unitId}`);
    }
  }

  for (const [rawPosition, stack] of Object.entries(initialState.stacks ?? {})) {
    const position = Number(rawPosition);
    if (position < 0 || position > trackLength) {
      throw new Error(
        `Initial state for ${match.id} has out-of-track stack position ${position}`,
      );
    }
    for (const unitId of stack) {
      if (!knownUnits.has(unitId)) {
        throw new Error(`Initial state for ${match.id} references unknown unit ${unitId}`);
      }
      if (seenInStacks.has(unitId)) {
        throw new Error(`Initial state for ${match.id} stacks unit ${unitId} more than once`);
      }
      seenInStacks.add(unitId);
    }
  }

  for (const racerId of initialState.finished ?? []) {
    if (!matchRacerIds.has(racerId)) {
      throw new Error(`Initial state for ${match.id} marks unknown racer ${racerId} finished`);
    }
  }
}

export class Race {
  private config: TuanziConfig;
  private assumptions: TuanziConfig["assumptions"];
  private racers: Record<string, Racer>;
  private racerIds: string[];
  private rng: SeededRng;
  private maxRounds: number;
  private captureTrace: boolean;
  private timeline: TimelineStep[] = [];
  private traceIndex = 0;
  private length: number;
  private firstLapStartPosition: number;
  private diceSides: number[];
  private budawangDiceSides: number[];
  private mechanisms: Record<number, string>;
  private positions: Record<string, number>;
  private stacks: Record<number, string[]>;
  private finished: string[] = [];
  private finishedSet = new Set<string>();
  private lapFinishMode = false;
  private startCoordinates: Record<string, number>;
  private distanceTraveled: Record<string, number>;
  private finishDistance: Record<string, number>;
  private previousRoll: Record<string, number | null>;
  private currentRoundRolls: Record<string, number> = {};
  private fixedRollCycleIndexes: Record<string, number>;
  private midpointTeleportTriggered: Record<string, boolean>;
  private lapTriggerOnceRefreshPending: Record<string, boolean>;
  private siglicaPenalties: Record<string, number> = {};
  private openingStartRacers = new Set<string>();
  private nextRoundLastActionRacers = new Set<string>();
  private hiyukiMetBudawang = false;
  private cartethyiaTriggered = false;
  private cartethyiaActive = false;
  private budawangActive = false;
  private budawangPosition: number;
  private budawangPendingRoundEndTeleport = false;
  private initialStateLabel = "";
  private stackSkillNotes: string[] = [];
  private firstFinishSnapshot: FirstFinishSnapshot | null = null;

  constructor(
    config: TuanziConfig,
    racerIds: string[],
    rng: SeededRng,
    maxRounds = 80,
    captureTrace = false,
    initialState?: InitialStateConfig,
  ) {
    this.config = config;
    this.assumptions = config.assumptions;
    this.racers = buildRacers(config);
    this.racerIds = [...racerIds];
    this.rng = rng;
    this.maxRounds = maxRounds;
    this.captureTrace = captureTrace;
    this.length = Number(this.assumptions.track_length);
    this.firstLapStartPosition = getFirstLapStartPosition(config);
    this.diceSides = [...this.assumptions.dice_sides];
    this.budawangDiceSides = [
      ...(config.special_units?.budawang?.dice_sides ?? this.diceSides),
    ];
    this.mechanisms = this.buildMechanismMap();
    this.positions = Object.fromEntries(
      this.racerIds.map((racerId) => [racerId, this.firstLapStartPosition]),
    );
    this.stacks = { [this.firstLapStartPosition]: [...this.racerIds] };
    this.startCoordinates = Object.fromEntries(
      this.racerIds.map((racerId) => [
        racerId,
        this.coordinateForPosition(this.firstLapStartPosition),
      ]),
    );
    this.distanceTraveled = Object.fromEntries(this.racerIds.map((racerId) => [racerId, 0]));
    this.finishDistance = Object.fromEntries(
      this.racerIds.map((racerId) => [racerId, this.length]),
    );
    this.previousRoll = Object.fromEntries(this.racerIds.map((racerId) => [racerId, null]));
    this.fixedRollCycleIndexes = Object.fromEntries(this.racerIds.map((racerId) => [racerId, 0]));
    this.midpointTeleportTriggered = Object.fromEntries(
      this.racerIds.map((racerId) => [racerId, false]),
    );
    this.lapTriggerOnceRefreshPending = Object.fromEntries(
      this.racerIds.map((racerId) => [racerId, false]),
    );
    this.budawangPosition = this.length;
    this.applyInitialState(initialState);
    this.configureOpeningStartRacers();
  }

  run(): RaceResult {
    const roundOrders: string[][] = [];
    const startNotes = ["每轮随机行动；西格莉卡轮初标记"];
    if (this.initialStateLabel) {
      startNotes.push(`从${this.initialStateLabel}接续`);
    }
    if (this.lapFinishMode) {
      startNotes.push("所有团子需先到下一次起终点，再完整跑一圈到起终点");
    }
    startNotes.push(this.budawangActive ? "布大王已在初始站位中，首轮起加入行动顺序" : "第3轮起布大王加入行动顺序");
    if (this.finished.length > 0) {
      startNotes.push(
        `初始已完成：${this.finished.map((racerId) => this.racers[racerId].name).join("、")}`,
      );
    }
    this.recordState("开赛", "start", { notes: startNotes });
    this.captureFirstFinishSnapshotIfNeeded(0);

    for (let roundNo = 1; roundNo <= this.maxRounds; roundNo += 1) {
      this.siglicaPenalties = {};
      const forcedLastAction = new Set(this.nextRoundLastActionRacers);
      this.nextRoundLastActionRacers = new Set();
      this.budawangPendingRoundEndTeleport = false;
      const roundNotes: string[] = [];
      const skipOpeningStartMarks =
        this.isNeutralOpeningRound(roundNo) && this.hasActiveRoundStartMarkSkill();
      const marked = skipOpeningStartMarks ? [] : this.applyRoundStartMarks();
      roundNotes.push(...this.applyRoundStartStackSkills(roundNo));
      if (skipOpeningStartMarks) {
        roundNotes.push("首轮同在起点，暂无前后顺序，西格莉卡不标记");
      }
      if (marked.length > 0) {
        roundNotes.push(`西格莉卡轮初标记 ${marked.map((id) => this.racers[id].name).join("、")}`);
      }

      const budawangInOrder =
        this.budawangActive || roundNo >= Number(this.assumptions.budawang_starts_on_round);
      const actionOrder = this.applyLastActionOrder(
        this.randomRoundOrder(budawangInOrder),
        forcedLastAction,
      );
      this.prepareRoundRolls(actionOrder);
      roundOrders.push(actionOrder);
      this.recordState(`第${roundNo}轮 行动顺序`, "round_order", {
        round_no: roundNo,
        action_order: actionOrder,
        round_rolls: { ...this.currentRoundRolls },
        notes: roundNotes,
      });

      for (const actorId of actionOrder) {
        if (actorId === BUDDAWANG_ID) {
          const turn = this.takeBudawangTurn(roundNo);
          this.updateHiyukiMeeting();
          this.captureFirstFinishSnapshotIfNeeded(roundNo);
          this.recordState(`第${roundNo}轮 布大王移动`, "budawang_turn", {
            round_no: roundNo,
            ...turn,
          });
          continue;
        }

        if (this.finishedSet.has(actorId)) {
          continue;
        }
        const turn = this.takeRacerTurn(actorId);
        this.captureFirstFinishSnapshotIfNeeded(roundNo);
        this.recordState(`第${roundNo}轮 ${this.racers[actorId].name}`, "racer_turn", {
          round_no: roundNo,
          ...turn,
        });
        if (this.finished.length === this.racerIds.length) {
          return this.result(roundNo, roundOrders);
        }
      }

      if (
        this.budawangActive &&
        asBoolean(this.assumptions.budawang_teleports_to_finish_at_round_end_when_apart)
      ) {
        const roundEnd = this.resolveBudawangEndOfRound();
        this.captureFirstFinishSnapshotIfNeeded(roundNo);
        this.recordState(`第${roundNo}轮 布大王回合末位置`, "budawang_round_end", {
          round_no: roundNo,
          ...roundEnd,
        });
      }

      if (this.finished.length === this.racerIds.length) {
        return this.result(roundNo, roundOrders);
      }
    }

    return this.result(this.maxRounds, roundOrders);
  }

  randomRoundOrder(includeBudawang = false): string[] {
    const actionOrder = this.racerIds.filter((racerId) => !this.finishedSet.has(racerId));
    if (includeBudawang) {
      actionOrder.push(BUDDAWANG_ID);
    }
    return this.rng.shuffle(actionOrder);
  }

  private applyLastActionOrder(actionOrder: string[], forcedLastAction: Set<string>): string[] {
    const lastActors = actionOrder.filter((actorId) => forcedLastAction.has(actorId));
    if (lastActors.length === 0) {
      return actionOrder;
    }
    return [
      ...actionOrder.filter((actorId) => !forcedLastAction.has(actorId)),
      ...lastActors,
    ];
  }

  private buildMechanismMap(): Record<number, string> {
    const result: Record<number, string> = {};
    this.config.track.sequence.forEach((item, position) => {
      if (typeof item === "string" && this.config.track.mechanisms[item]) {
        result[position] = this.config.track.mechanisms[item].id;
      }
    });
    return result;
  }

  private normalizeInitialPosition(value: unknown): number {
    return Math.max(0, Math.min(this.length, Math.trunc(asNumber(value))));
  }

  private coordinateForPosition(position: number): number {
    if (position >= this.length) {
      return 0;
    }
    return Math.max(0, position) % this.length;
  }

  private positionForCoordinate(coordinate: number, preferFinish = false): number {
    const normalized = ((coordinate % this.length) + this.length) % this.length;
    if (normalized === 0 && preferFinish) {
      return this.length;
    }
    return normalized;
  }

  private remainingFinishDistanceFromPosition(position: number): number {
    const coordinate = this.coordinateForPosition(position);
    const distanceToNextFinish = (this.length - coordinate) % this.length;
    return distanceToNextFinish + this.length;
  }

  private boardPositionForRacer(racerId: string): number {
    const coordinate = this.startCoordinates[racerId] + this.distanceTraveled[racerId];
    const preferFinish =
      this.positions[racerId] === this.length || this.distanceTraveled[racerId] > 0;
    return this.positionForCoordinate(coordinate, preferFinish);
  }

  private signedTrackDelta(fromPosition: number, toPosition: number, direction: number): number {
    const fromCoordinate = this.coordinateForPosition(fromPosition);
    const toCoordinate = this.coordinateForPosition(toPosition);
    if (direction >= 0) {
      return (toCoordinate - fromCoordinate + this.length) % this.length;
    }
    return -((fromCoordinate - toCoordinate + this.length) % this.length);
  }

  private applyInitialState(initialState?: InitialStateConfig): void {
    if (!initialState) {
      return;
    }

    this.initialStateLabel = String(initialState.label ?? "").trim();
    this.lapFinishMode = String(initialState.finish_rule ?? "").trim() === "one_lap_after_next_finish";
    const rawPositions = initialState.positions ?? {};
    const rawStacks = initialState.stacks ?? {};

    for (const racerId of this.racerIds) {
      if (racerId in rawPositions) {
        this.positions[racerId] = this.normalizeInitialPosition(rawPositions[racerId]);
      }
    }

    this.finished = [];
    this.finishedSet = new Set();
    if (!this.lapFinishMode) {
      for (const racerId of initialState.finished ?? []) {
        if (this.racerIds.includes(racerId) && !this.finishedSet.has(racerId)) {
          this.finishedSet.add(racerId);
          this.finished.push(racerId);
          this.positions[racerId] = this.length;
        }
      }
    }

    this.stacks = {};
    for (const [rawPosition, stack] of Object.entries(rawStacks)) {
      const position = this.normalizeInitialPosition(rawPosition);
      const cleaned: string[] = [];
      for (const unitId of stack) {
        if (unitId === BUDDAWANG_ID) {
          this.budawangActive = true;
          this.budawangPosition = position;
          cleaned.push(unitId);
        } else if (this.racerIds.includes(unitId)) {
          this.positions[unitId] = position;
          cleaned.push(unitId);
        }
      }
      if (cleaned.length > 0) {
        this.stacks[position] = cleaned;
      }
    }

    for (const racerId of this.racerIds) {
      if (this.finishedSet.has(racerId)) {
        continue;
      }
      const inStack = Object.values(this.stacks).some((stack) => stack.includes(racerId));
      if (!inStack) {
        this.stacks[this.positions[racerId]] = this.stacks[this.positions[racerId]] ?? [];
        this.stacks[this.positions[racerId]].push(racerId);
      }
    }

    const budawangState = initialState.budawang ?? {};
    if (BUDDAWANG_ID in rawPositions) {
      this.budawangActive = true;
      this.budawangPosition = this.normalizeInitialPosition(rawPositions[BUDDAWANG_ID]);
    }
    if (typeof budawangState.position !== "undefined") {
      this.budawangPosition = this.normalizeInitialPosition(budawangState.position);
    }
    if (typeof budawangState.active !== "undefined") {
      this.budawangActive = Boolean(budawangState.active);
    }
    if (this.budawangActive) {
      const stack = (this.stacks[this.budawangPosition] = this.stacks[this.budawangPosition] ?? []);
      if (!stack.includes(BUDDAWANG_ID)) {
        stack.unshift(BUDDAWANG_ID);
      }
      this.normalizeBudawangStack(this.budawangPosition);
    }

    if (this.lapFinishMode) {
      const traveled = initialState.distance_traveled ?? {};
      const finishDistance = initialState.finish_distance ?? {};
      for (const racerId of this.racerIds) {
        this.startCoordinates[racerId] = this.coordinateForPosition(this.positions[racerId]);
        this.distanceTraveled[racerId] = Math.trunc(asNumber(traveled[racerId], 0));
        this.finishDistance[racerId] = Math.trunc(
          asNumber(
            finishDistance[racerId],
            this.remainingFinishDistanceFromPosition(this.positions[racerId]),
          ),
        );
        this.positions[racerId] = this.boardPositionForRacer(racerId);
      }
    }

    const stateFlags = initialState.state_flags ?? {};
    if ("hiyuki_met_budawang" in stateFlags) {
      this.hiyukiMetBudawang = Boolean(stateFlags.hiyuki_met_budawang);
    } else {
      this.updateHiyukiMeeting();
    }
    if ("cartethyia_triggered" in stateFlags) {
      this.cartethyiaTriggered = Boolean(stateFlags.cartethyia_triggered);
    }
    if ("cartethyia_active" in stateFlags) {
      this.cartethyiaActive = Boolean(stateFlags.cartethyia_active);
    }
    for (const racerId of this.racerIds) {
      const flagKey = `${racerId}_midpoint_teleport_triggered`;
      if (flagKey in stateFlags) {
        this.midpointTeleportTriggered[racerId] = Boolean(stateFlags[flagKey]);
      }
    }
    for (const racerId of this.racerIds) {
      this.inferConsumedTriggerOnceSkillBeforeNextFinish(racerId, stateFlags);
    }

    for (const [racerId, roll] of Object.entries(initialState.previous_roll ?? {})) {
      if (racerId in this.previousRoll) {
        this.previousRoll[racerId] = roll === null ? null : Math.trunc(asNumber(roll));
      }
    }
    for (const racerId of this.racerIds) {
      this.configureLapTriggerOnceRefresh(racerId);
    }
  }

  private configureOpeningStartRacers(): void {
    const activeRacers = this.racerIds.filter((racerId) => !this.finishedSet.has(racerId));
    if (
      this.lapFinishMode ||
      !activeRacers.every((racerId) => this.positions[racerId] === this.firstLapStartPosition)
    ) {
      this.openingStartRacers = new Set();
      return;
    }
    this.openingStartRacers = new Set(activeRacers);
  }

  private isOpeningStartRacer(racerId: string, position: number): boolean {
    return (
      !this.lapFinishMode &&
      position === this.firstLapStartPosition &&
      this.openingStartRacers.has(racerId)
    );
  }

  private markOpeningStartRacersMoved(racerIds: string[]): void {
    for (const racerId of racerIds) {
      this.openingStartRacers.delete(racerId);
    }
  }

  private resetTriggerOnceSkillState(racerId: string): void {
    const skillType = skillTypeOf(this.racers[racerId]?.skill);
    if (MIDPOINT_TELEPORT_SKILLS.has(skillType)) {
      this.midpointTeleportTriggered[racerId] = false;
      return;
    }
    if (skillType === "last_place_comeback") {
      this.cartethyiaTriggered = false;
      this.cartethyiaActive = false;
    }
  }

  private triggerOnceSkillConsumed(racerId: string): boolean {
    const skillType = skillTypeOf(this.racers[racerId]?.skill);
    if (MIDPOINT_TELEPORT_SKILLS.has(skillType)) {
      return Boolean(this.midpointTeleportTriggered[racerId]);
    }
    if (skillType === "last_place_comeback") {
      return this.cartethyiaTriggered || this.cartethyiaActive;
    }
    return false;
  }

  private isBeforeLapTriggerRefreshPoint(racerId: string): boolean {
    const refreshDistance = this.finishDistance[racerId] - this.length;
    return refreshDistance > 0 && this.distanceTraveled[racerId] < refreshDistance;
  }

  private inferConsumedTriggerOnceSkillBeforeNextFinish(
    racerId: string,
    stateFlags: Record<string, boolean>,
  ): void {
    if (!this.lapFinishMode || !this.isBeforeLapTriggerRefreshPoint(racerId)) {
      return;
    }
    const skillType = skillTypeOf(this.racers[racerId]?.skill);
    if (!TRIGGER_ONCE_REFRESH_AT_NEXT_FINISH_SKILLS.has(skillType)) {
      return;
    }
    if (MIDPOINT_TELEPORT_SKILLS.has(skillType)) {
      const flagKey = `${racerId}_midpoint_teleport_triggered`;
      if (!(flagKey in stateFlags)) {
        this.midpointTeleportTriggered[racerId] = true;
      }
      return;
    }
    if (
      skillType === "last_place_comeback" &&
      !("cartethyia_triggered" in stateFlags) &&
      !("cartethyia_active" in stateFlags)
    ) {
      this.cartethyiaTriggered = true;
      this.cartethyiaActive = false;
    }
  }

  private configureLapTriggerOnceRefresh(racerId: string): void {
    const skillType = skillTypeOf(this.racers[racerId]?.skill);
    if (!this.lapFinishMode || !TRIGGER_ONCE_REFRESH_AT_NEXT_FINISH_SKILLS.has(skillType)) {
      this.lapTriggerOnceRefreshPending[racerId] = false;
      return;
    }
    if (this.positions[racerId] === this.length) {
      this.resetTriggerOnceSkillState(racerId);
      this.lapTriggerOnceRefreshPending[racerId] = false;
      return;
    }
    this.lapTriggerOnceRefreshPending[racerId] = this.triggerOnceSkillConsumed(racerId);
  }

  private refreshTriggerOnceSkillAfterNextFinishIfNeeded(
    racerId: string,
    previousDistance: number,
  ): void {
    if (!this.lapTriggerOnceRefreshPending[racerId]) {
      return;
    }
    const refreshDistance = this.finishDistance[racerId] - this.length;
    if (
      refreshDistance <= 0 ||
      previousDistance >= refreshDistance ||
      this.distanceTraveled[racerId] < refreshDistance
    ) {
      return;
    }
    this.resetTriggerOnceSkillState(racerId);
    this.lapTriggerOnceRefreshPending[racerId] = false;
  }

  private roll(): number {
    return this.rng.choice(this.diceSides);
  }

  private rollBudawang(): number {
    return this.rng.choice(this.budawangDiceSides);
  }

  private prepareRoundRolls(actionOrder: string[]): void {
    this.currentRoundRolls = {};
    for (const actorId of actionOrder) {
      if (this.finishedSet.has(actorId)) {
        continue;
      }
      this.currentRoundRolls[actorId] =
        actorId === BUDDAWANG_ID ? this.rollBudawang() : this.rollForRacer(actorId);
    }
  }

  private rollForRacer(racerId: string): number {
    const skill = this.racers[racerId]?.skill ?? {};
    const skillType = String(skill.type ?? "none");
    if (skillType === "fixed_roll_cycle") {
      const sequence = Array.isArray(skill.sequence)
        ? skill.sequence.map((item) => Math.trunc(asNumber(item))).filter((item) => item > 0)
        : [];
      const cycle = sequence.length > 0 ? sequence : [3, 2, 1];
      const index = this.fixedRollCycleIndexes[racerId] ?? 0;
      this.fixedRollCycleIndexes[racerId] = index + 1;
      return cycle[index % cycle.length];
    }
    if (skillType === "restricted_roll") {
      const sides = Array.isArray(skill.sides)
        ? skill.sides.map((item) => Math.trunc(asNumber(item))).filter((item) => item > 0)
        : [];
      return this.rng.choice(sides.length > 0 ? sides : this.diceSides);
    }
    return this.roll();
  }

  private currentRoundMinimumRoll(): number | null {
    const rolls = Object.values(this.currentRoundRolls);
    return rolls.length > 0 ? Math.min(...rolls) : null;
  }

  private takeRacerTurn(racerId: string): Record<string, unknown> {
    this.stackSkillNotes = [];
    const skill = this.racers[racerId].skill;
    const skillType = String(skill.type ?? "none");
    const notes: string[] = [];
    const extraMeta: Record<string, unknown> = {};

    if (skillType === "top_skip_next_round_last" && this.isStackTop(racerId)) {
      const move = this.stationaryRacerMove(racerId);
      this.applyJinhsiStackedAboveTrigger(
        this.positions[racerId],
        this.stackForRacer(racerId).filter((unitId) => unitId !== racerId),
      );
      this.nextRoundLastActionRacers.add(racerId);
      delete this.currentRoundRolls[racerId];
      notes.push("开始走格子前位于顶端，本回合不行动，下回合最后行动");
      notes.push(...this.consumeStackSkillNotes());
      return {
        actor: racerId,
        roll: null,
        steps: 0,
        movers: move.movers,
        from_position: move.from_position,
        target_position: move.target_position,
        to_position: move.to_position,
        skipped_by_skill: true,
        notes,
      };
    }

    const roll = this.currentRoundRolls[racerId] ?? this.rollForRacer(racerId);
    const penalty = Math.trunc(this.siglicaPenalties[racerId] ?? 0);
    let steps = Math.max(1, roll + penalty);
    let skipMovement = false;
    if (penalty) {
      notes.push(`标记影响 ${penalty >= 0 ? "+" : ""}${penalty}`);
    }

    if (skillType === "round_start_bottom_bonus" && this.isStackBottom(racerId)) {
      const bonus = Math.trunc(asNumber(skill.bonus_steps));
      if (bonus !== 0) {
        steps += bonus;
        notes.push(`开始走格子前底层 +${bonus}`);
      }
    }

    if (skillType === "last_place_start_bonus" && this.isLastPlace(racerId)) {
      const bonus = Math.trunc(asNumber(skill.bonus_steps));
      steps += bonus;
      notes.push(`末位起步 +${bonus}`);
    }

    if (skillType === "same_roll_bonus" && this.previousRoll[racerId] === roll) {
      const bonus = Math.trunc(asNumber(skill.bonus_steps));
      steps += bonus;
      notes.push(`连续同点 +${bonus}`);
    } else if (skillType === "after_meeting_budawang_bonus" && this.hiyukiMetBudawang) {
      const bonus = Math.trunc(asNumber(skill.bonus_steps));
      steps += bonus;
      notes.push(`已遇见布大王 +${bonus}`);
    } else if (skillType === "last_place_comeback" && this.cartethyiaActive) {
      if (this.rng.random() < asNumber(skill.future_bonus_probability)) {
        const bonus = Math.trunc(asNumber(skill.bonus_steps));
        steps += bonus;
        notes.push(`追赶触发 +${bonus}`);
      }
    } else if (skillType === "per_move_chance_bonus") {
      if (this.rng.random() < asNumber(skill.probability)) {
        const bonus = Math.trunc(asNumber(skill.bonus_steps));
        steps += bonus;
        notes.push(`概率触发 +${bonus}`);
      }
    } else if (skillType === "round_min_roll_bonus") {
      const minimumRoll = this.currentRoundMinimumRoll();
      if (minimumRoll !== null && roll === minimumRoll) {
        const bonus = Math.trunc(asNumber(skill.bonus_steps));
        steps += bonus;
        notes.push(`本轮最低点 +${bonus}`);
      }
    } else if (skillType === "chance_double_or_skip") {
      const skipProbability = Math.max(0, asNumber(skill.skip_probability));
      const doubleProbability = Math.max(0, asNumber(skill.double_probability));
      const sample = this.rng.random();
      if (sample < skipProbability) {
        steps = 0;
        skipMovement = true;
        notes.push("本回合无法移动");
      } else if (sample < skipProbability + doubleProbability) {
        steps = Math.max(1, roll * 2 + penalty);
        notes.push("双倍点数移动");
      }
    } else if (skillType === "chance_double_roll") {
      if (this.rng.random() < asNumber(skill.probability)) {
        steps = Math.max(1, roll * 2 + penalty);
        notes.push("双倍点数移动");
      }
    }

    this.previousRoll[racerId] = roll;
    const move = skipMovement
      ? this.stationaryRacerMove(racerId)
      : this.moveRacerStack(racerId, steps, racerId);
    notes.push(...this.consumeStackSkillNotes());
    if (!skipMovement && skillType === "midpoint_nearest_ahead_teleport_once") {
      const finalMovePosition = move.to_position;
      const teleport = this.applyThresholdTeleportIfNeeded(
        racerId,
        move.movers,
        finalMovePosition,
      );
      if (teleport) {
        if (teleport.note) {
          notes.push(String(teleport.note));
        }
        move.to_position = Number(teleport.to_position ?? move.to_position);
        Object.assign(extraMeta, teleport);
        delete extraMeta.note;
        notes.push(...this.consumeStackSkillNotes());
      }
    }
    if (!skipMovement && skillType === "midpoint_all_racers_to_self_teleport_once") {
      const teleport = this.applyAllRacersToSelfTeleportIfNeeded(racerId, move.to_position);
      if (teleport) {
        if (teleport.note) {
          notes.push(String(teleport.note));
        }
        Object.assign(extraMeta, teleport);
        delete extraMeta.note;
        notes.push(...this.consumeStackSkillNotes());
      }
    }
    this.updateHiyukiMeeting();

    if (skillType === "last_place_comeback" && !this.cartethyiaTriggered) {
      const ranking = this.currentRanking();
      if (ranking[ranking.length - 1] === racerId) {
        this.cartethyiaTriggered = true;
        this.cartethyiaActive = true;
        notes.push("追赶状态开启");
      }
    }

    return {
      actor: racerId,
      roll,
      steps,
      movers: move.movers,
      from_position: move.from_position,
      target_position: move.target_position,
      to_position: move.to_position,
      notes,
      ...extraMeta,
    };
  }

  private applyRoundStartMarks(): string[] {
    const marked: string[] = [];
    for (const racerId of this.racerIds) {
      if (this.finishedSet.has(racerId)) {
        continue;
      }
      const skill = this.racers[racerId].skill;
      if (!ROUND_START_MARK_SKILLS.has(String(skill.type ?? "none"))) {
        continue;
      }
      marked.push(
        ...this.applySiglicaMarks(
          racerId,
          Math.trunc(asNumber(skill.count, 2)),
          Math.trunc(asNumber(skill.step_delta, -1)),
        ),
      );
    }
    return marked;
  }

  private isNeutralOpeningRound(roundNo: number): boolean {
    if (roundNo !== 1 || this.lapFinishMode) {
      return false;
    }
    const activeRacers = this.racerIds.filter((racerId) => !this.finishedSet.has(racerId));
    return (
      activeRacers.length > 1 &&
      activeRacers.every(
        (racerId) =>
          this.openingStartRacers.has(racerId) &&
          this.positions[racerId] === this.firstLapStartPosition,
      )
    );
  }

  private hasActiveRoundStartMarkSkill(): boolean {
    return this.racerIds.some((racerId) => {
      if (this.finishedSet.has(racerId)) {
        return false;
      }
      const skill = this.racers[racerId].skill;
      return ROUND_START_MARK_SKILLS.has(String(skill.type ?? "none"));
    });
  }

  private applySiglicaMarks(racerId: string, count: number, stepDelta: number): string[] {
    const ranking = this.currentRanking().filter((id) => !this.finishedSet.has(id));
    const index = ranking.indexOf(racerId);
    if (index < 0) {
      return [];
    }
    const higher = ranking.slice(Math.max(0, index - count), index);
    for (const targetId of higher) {
      this.siglicaPenalties[targetId] = (this.siglicaPenalties[targetId] ?? 0) + stepDelta;
    }
    return higher;
  }

  private applyRoundStartStackSkills(roundNo: number): string[] {
    const notes: string[] = [];
    if (this.isNeutralOpeningRound(roundNo) && this.hasActiveRoundStartStackSkill()) {
      return ["首轮同在起点，暂无堆叠前后，轮初堆叠技能不触发"];
    }
    for (const racerId of this.racerIds) {
      if (this.finishedSet.has(racerId)) {
        continue;
      }
      const skill = this.racers[racerId].skill;
      const skillType = String(skill.type ?? "none");
      const racerName = this.racers[racerId].name;

      if (
        skillType === "below_stack_chance_next_round_last" &&
        this.hasStackedBelow(racerId) &&
        this.rng.random() < asNumber(skill.probability)
      ) {
        this.nextRoundLastActionRacers.add(racerId);
        notes.push(`${racerName}下方有堆叠，下回合最后行动`);
      }
    }
    return notes;
  }

  private hasActiveRoundStartStackSkill(): boolean {
    return this.racerIds.some((racerId) => {
      if (this.finishedSet.has(racerId)) {
        return false;
      }
      const skill = this.racers[racerId].skill;
      return ROUND_START_STACK_SKILLS.has(String(skill.type ?? "none"));
    });
  }

  private isNeutralStartTile(position: number, racerId?: string): boolean {
    if (this.lapFinishMode) {
      return false;
    }
    return (
      position === 0 ||
      (typeof racerId === "string" && this.isOpeningStartRacer(racerId, position))
    );
  }

  private stackedUnitsAt(position: number): string[] {
    return (this.stacks[position] ?? []).filter(
      (unitId) =>
        unitId === BUDDAWANG_ID ||
        (this.racerIds.includes(unitId) && !this.finishedSet.has(unitId)),
    );
  }

  private stackForRacer(racerId: string): string[] {
    return this.stackedUnitsAt(this.positions[racerId]);
  }

  private isStackTop(racerId: string): boolean {
    if (this.isNeutralStartTile(this.positions[racerId], racerId)) {
      return false;
    }
    const stack = this.stackForRacer(racerId);
    return stack.length > 1 && stack[stack.length - 1] === racerId;
  }

  private isStackBottom(racerId: string): boolean {
    if (this.isNeutralStartTile(this.positions[racerId], racerId)) {
      return false;
    }
    const stack = this.stackForRacer(racerId);
    return stack.length > 1 && stack[0] === racerId;
  }

  private hasStackedBelow(racerId: string): boolean {
    if (this.isNeutralStartTile(this.positions[racerId], racerId)) {
      return false;
    }
    const stack = this.stackForRacer(racerId);
    const index = stack.indexOf(racerId);
    return index > 0;
  }

  private hasStackedAbove(racerId: string): boolean {
    if (this.isNeutralStartTile(this.positions[racerId], racerId)) {
      return false;
    }
    const stack = this.stackForRacer(racerId);
    const index = stack.indexOf(racerId);
    return index >= 0 && index < stack.length - 1;
  }

  private moveRacerToTopOfStack(racerId: string): void {
    const position = this.positions[racerId];
    const stack = this.stacks[position] ?? [];
    if (!stack.includes(racerId)) {
      return;
    }
    this.stacks[position] = [...stack.filter((unitId) => unitId !== racerId), racerId];
  }

  private consumeStackSkillNotes(): string[] {
    const notes = this.stackSkillNotes;
    this.stackSkillNotes = [];
    return notes;
  }

  private racersAboveInStack(stack: string[], racerId: string): string[] {
    const index = stack.indexOf(racerId);
    if (index < 0) {
      return [];
    }
    return stack
      .slice(index + 1)
      .filter((unitId) => this.racerIds.includes(unitId) && !this.finishedSet.has(unitId));
  }

  private applyJinhsiStackedAboveTrigger(position: number, previousStack: string[]): void {
    const jinhsiId = "jinhsi";
    if (
      !this.racerIds.includes(jinhsiId) ||
      this.finishedSet.has(jinhsiId) ||
      this.positions[jinhsiId] !== position ||
      this.isNeutralStartTile(position, jinhsiId)
    ) {
      return;
    }

    const skill = this.racers[jinhsiId]?.skill ?? {};
    if (skillTypeOf(skill) !== "above_stack_chance_to_top") {
      return;
    }
    if (
      !previousStack.includes(jinhsiId) ||
      this.racersAboveInStack(previousStack, jinhsiId).length > 0
    ) {
      return;
    }
    if (this.racersAboveInStack(this.stackForRacer(jinhsiId), jinhsiId).length === 0) {
      return;
    }
    if (this.rng.random() >= asNumber(skill.probability)) {
      return;
    }

    this.moveRacerToTopOfStack(jinhsiId);
    this.stackSkillNotes.push(`${this.racers[jinhsiId].name}移至堆叠顶端`);
  }

  private isLastPlace(racerId: string): boolean {
    if (
      this.isNeutralStartTile(this.positions[racerId], racerId) &&
      this.hasOtherActiveUnitAtSamePosition(racerId)
    ) {
      return false;
    }
    const ranking = this.currentActiveUnitRanking();
    return ranking[ranking.length - 1] === racerId;
  }

  private hasOtherActiveUnitAtSamePosition(racerId: string): boolean {
    const position = this.positions[racerId];
    if (
      this.racerIds.some(
        (otherId) =>
          otherId !== racerId &&
          !this.finishedSet.has(otherId) &&
          this.positions[otherId] === position,
      )
    ) {
      return true;
    }
    return this.budawangActive && this.budawangPosition === position;
  }

  private takeBudawangTurn(roundNo: number): Record<string, unknown> {
    this.stackSkillNotes = [];
    let turnStartPosition = this.budawangPosition;
    const notes: string[] = [];
    if (!this.budawangActive) {
      this.budawangActive = true;
      this.budawangPosition = this.length;
      turnStartPosition = this.budawangPosition;
      notes.push("布大王出场");
    }

    let teleportStatus = this.budawangTeleportStatus();
    const settlesAtRoundEnd = asBoolean(
      this.assumptions.budawang_teleports_to_finish_at_round_end_when_apart,
    );
    const settlesAfterMove =
      asBoolean(this.assumptions.budawang_teleports_to_finish_after_passing_last_racer) &&
      !settlesAtRoundEnd;
    const teleportedBeforeMove =
      !settlesAtRoundEnd &&
      !settlesAfterMove &&
      asBoolean(this.assumptions.budawang_teleports_before_move_when_behind_all_racers) &&
      Boolean(teleportStatus.should_teleport);
    const teleportFromPosition = teleportedBeforeMove ? this.budawangPosition : null;
    if (teleportedBeforeMove) {
      this.teleportBudawangToFinish();
      const lastRacer = teleportStatus.last_racer;
      const lastName = typeof lastRacer === "string" ? this.racers[lastRacer].name : "团子";
      notes.push(`行动前已到${lastName}后方，先传送回起终点`);
    }

    const fromPosition = this.budawangPosition;
    const steps = this.currentRoundRolls[BUDDAWANG_ID] ?? this.rollBudawang();
    const delta = steps * Number(this.assumptions.budawang_direction);
    const [pathPositions, targetPosition] = this.budawangPathTo(fromPosition + delta);
    const move = this.moveBudawang(delta);
    const reachedTeamTail = this.budawangPathReachesTeamTail(teleportStatus, pathPositions);
    if (settlesAtRoundEnd && reachedTeamTail) {
      this.budawangPendingRoundEndTeleport = true;
    }
    const settlementStatus = this.budawangTeleportStatus();
    if (settlesAtRoundEnd && Boolean(settlementStatus.should_teleport)) {
      this.budawangPendingRoundEndTeleport = true;
    }
    const teleportedAfterMove =
      settlesAfterMove && (reachedTeamTail || Boolean(settlementStatus.should_teleport));
    const settlementFromPosition = teleportedAfterMove ? this.budawangPosition : null;
    if (teleportedAfterMove) {
      const lastRacer = settlementStatus.last_racer;
      const lastName = typeof lastRacer === "string" ? this.racers[lastRacer].name : "团子";
      this.teleportBudawangToFinish();
      notes.push(`走完后已到${lastName}后方，结算回起终点`);
    }
    teleportStatus = settlementStatus;
    notes.push(...this.consumeStackSkillNotes());
    return {
      actor: BUDDAWANG_ID,
      roll: steps,
      steps: delta,
      movers: move.movers,
      from_position: fromPosition,
      target_position: targetPosition,
      to_position: this.budawangPosition,
      turn_start_position: turnStartPosition,
      teleported_before_move: teleportedBeforeMove,
      teleport_from_position: teleportFromPosition,
      teleported_after_move: teleportedAfterMove,
      settlement_from_position: settlementFromPosition,
      round_end_teleport_pending: this.budawangPendingRoundEndTeleport,
      last_racer: teleportStatus.last_racer,
      last_racer_position: teleportStatus.last_racer_position,
      tail_position: teleportStatus.tail_position,
      round_no: roundNo,
      notes,
    };
  }

  private stationaryRacerMove(
    racerId: string,
  ): { movers: string[]; from_position: number; target_position: number; to_position: number } {
    const position = this.positions[racerId] ?? this.length;
    return {
      movers: [],
      from_position: position,
      target_position: position,
      to_position: position,
    };
  }

  private applyThresholdTeleportIfNeeded(
    racerId: string,
    movers: string[],
    finalMovePosition: number,
  ): Record<string, unknown> | null {
    if (this.midpointTeleportTriggered[racerId] || this.finishedSet.has(racerId)) {
      return null;
    }
    const skill = this.racers[racerId]?.skill ?? {};
    const triggerPosition = Math.max(
      0,
      Math.min(this.length, Math.trunc(asNumber(skill.trigger_position, Math.ceil(this.length / 2)))),
    );
    if (this.midpointTriggerProgress(racerId, finalMovePosition) <= triggerPosition) {
      return null;
    }

    const targetRacer = this.nearestRacerAhead(racerId, movers);
    if (!targetRacer) {
      return null;
    }

    this.midpointTeleportTriggered[racerId] = true;
    const targetPosition = this.positions[targetRacer];
    const targetProgress = this.lapFinishMode ? this.lapProgressScore(targetRacer) : null;
    const activeMovers = [racerId];
    this.detachFromStack(activeMovers);
    const previousStack = [...(this.stacks[targetPosition] ?? [])];
    for (const mover of activeMovers) {
      if (targetProgress !== null) {
        this.distanceTraveled[mover] = Math.max(0, targetProgress + this.finishDistance[mover]);
      }
      this.positions[mover] = targetPosition;
    }
    this.stacks[targetPosition] = this.stacks[targetPosition] ?? [];
    this.stacks[targetPosition].push(...activeMovers);
    this.normalizeBudawangStack(targetPosition);
    this.applyJinhsiStackedAboveTrigger(targetPosition, previousStack);

    return {
      midpoint_teleport_triggered: true,
      teleported: true,
      teleport_target: targetRacer,
      teleport_from_position: finalMovePosition,
      teleport_trigger_position: triggerPosition,
      teleport_to_position: targetPosition,
      to_position: targetPosition,
      note: `超过${triggerPosition}格，传送到${this.racers[targetRacer].name}顶端`,
    };
  }

  private applyAllRacersToSelfTeleportIfNeeded(
    racerId: string,
    finalMovePosition: number,
  ): Record<string, unknown> | null {
    if (this.midpointTeleportTriggered[racerId] || this.finishedSet.has(racerId)) {
      return null;
    }
    const skill = this.racers[racerId]?.skill ?? {};
    const triggerPosition = Math.max(
      0,
      Math.min(this.length, Math.trunc(asNumber(skill.trigger_position, Math.ceil(this.length / 2)))),
    );
    if (this.midpointTriggerProgress(racerId, finalMovePosition) <= triggerPosition) {
      return null;
    }
    if (!this.hasOtherRacerAheadOrAbove(racerId)) {
      return null;
    }

    const rankingBefore = this.currentRanking().filter((id) => !this.finishedSet.has(id));
    const ownRank = rankingBefore.indexOf(racerId);
    if (ownRank < 0) {
      return null;
    }
    const targetIds = rankingBefore.filter((id) => id !== racerId);
    if (targetIds.length === 0) {
      return null;
    }

    this.midpointTeleportTriggered[racerId] = true;
    const teleportPosition = this.positions[racerId];
    const teleportProgress = this.lapFinishMode ? this.lapProgressScore(racerId) : null;
    const previousStack = [...(this.stacks[teleportPosition] ?? [])];
    const rankIndex = new Map(rankingBefore.map((id, index) => [id, index]));
    const rankingOrder = [...targetIds].sort(
      (left, right) => (rankIndex.get(left) ?? 0) - (rankIndex.get(right) ?? 0),
    );
    const stackOrder = (ids: string[]) =>
      [...ids].sort((left, right) => (rankIndex.get(right) ?? 0) - (rankIndex.get(left) ?? 0));
    const aboveTargets = rankingOrder.filter((id) => (rankIndex.get(id) ?? 0) < ownRank);
    const belowTargets = rankingOrder.filter((id) => (rankIndex.get(id) ?? 0) > ownRank);

    this.detachRacersFromStacks(rankingOrder);
    for (const targetId of rankingOrder) {
      if (teleportProgress !== null) {
        this.distanceTraveled[targetId] = Math.max(
          0,
          teleportProgress + this.finishDistance[targetId],
        );
      }
      this.positions[targetId] = teleportPosition;
    }

    const stack = (this.stacks[teleportPosition] = this.stacks[teleportPosition] ?? []);
    if (!stack.includes(racerId)) {
      stack.push(racerId);
    }
    const ownStackIndex = stack.indexOf(racerId);
    this.stacks[teleportPosition] = [
      ...stack.slice(0, ownStackIndex),
      ...stackOrder(belowTargets),
      racerId,
      ...stackOrder(aboveTargets),
      ...stack.slice(ownStackIndex + 1),
    ];
    this.normalizeBudawangStack(teleportPosition);
    this.applyJinhsiStackedAboveTrigger(teleportPosition, previousStack);

    return {
      midpoint_teleport_triggered: true,
      all_racers_teleport_triggered: true,
      teleport_actor: racerId,
      teleported_racers: rankingOrder,
      teleport_trigger_position: triggerPosition,
      teleport_to_position: teleportPosition,
      note: `经过${triggerPosition}格，传送${rankingOrder
        .map((id) => this.racers[id].name)
        .join("、")}至自身格子`,
    };
  }

  private detachRacersFromStacks(racerIds: string[]): void {
    const detached = new Set(racerIds);
    for (const [rawPosition, stack] of Object.entries(this.stacks)) {
      const position = Number(rawPosition);
      this.stacks[position] = stack.filter((unitId) => !detached.has(unitId));
      if (this.stacks[position].length === 0) {
        delete this.stacks[position];
      }
    }
  }

  private hasOtherRacerAheadOrAbove(racerId: string): boolean {
    return this.nearestRacerAhead(racerId, []) !== null || this.hasOtherRacerStackedAbove(racerId);
  }

  private hasOtherRacerStackedAbove(racerId: string): boolean {
    const stack = this.stackForRacer(racerId);
    const index = stack.indexOf(racerId);
    if (index < 0) {
      return false;
    }
    return stack
      .slice(index + 1)
      .some((unitId) => this.racerIds.includes(unitId) && !this.finishedSet.has(unitId));
  }

  private nearestRacerAhead(racerId: string, excludedRacers: string[]): string | null {
    const excluded = new Set([racerId, ...excludedRacers]);
    const candidates = this.racerIds.filter(
      (candidateId) => !excluded.has(candidateId) && !this.finishedSet.has(candidateId),
    );
    if (this.lapFinishMode) {
      const activeProgress = this.lapProgressScore(racerId);
      const ahead = candidates
        .map((candidateId) => ({
          racerId: candidateId,
          distance: this.lapProgressScore(candidateId) - activeProgress,
        }))
        .filter((candidate) => candidate.distance > 0)
        .sort((left, right) => left.distance - right.distance);
      return ahead[0]?.racerId ?? null;
    }

    const activePosition = this.positions[racerId];
    const ahead = candidates
      .map((candidateId) => ({
        racerId: candidateId,
        distance: this.positions[candidateId] - activePosition,
      }))
      .filter((candidate) => candidate.distance > 0)
      .sort((left, right) => left.distance - right.distance);
    return ahead[0]?.racerId ?? null;
  }

  private lapProgressScore(racerId: string): number {
    return this.distanceTraveled[racerId] - this.finishDistance[racerId];
  }

  private midpointTriggerProgress(racerId: string, finalMovePosition: number): number {
    if (!this.lapFinishMode) {
      return finalMovePosition;
    }
    const refreshDistance = Math.max(0, this.finishDistance[racerId] - this.length);
    return this.distanceTraveled[racerId] - refreshDistance;
  }

  private moveRacerStack(
    racerId: string,
    delta: number,
    activeRacerId: string,
  ): { movers: string[]; from_position: number; target_position: number; to_position: number } {
    if (this.finishedSet.has(racerId)) {
      return {
        movers: [],
        from_position: this.length,
        target_position: this.length,
        to_position: this.length,
      };
    }
    const fromPosition = this.positions[racerId];
    const movers = this.movingStack(racerId);
    this.markOpeningStartRacersMoved(movers);
    this.detachFromStack(movers);
    const newPosition = fromPosition + delta;
    let targetPosition = newPosition;
    if (this.lapFinishMode) {
      const targetTravel = this.distanceTraveled[activeRacerId] + delta;
      if (targetTravel >= this.finishDistance[activeRacerId]) {
        targetPosition = this.length;
      } else {
        const targetCoordinate = this.startCoordinates[activeRacerId] + targetTravel;
        targetPosition = this.positionForCoordinate(targetCoordinate, true);
      }
    }
    this.placeMovingRacers(movers, newPosition, activeRacerId);
    return {
      movers,
      from_position: fromPosition,
      target_position: targetPosition,
      to_position: this.positions[activeRacerId] ?? this.length,
    };
  }

  private movingStack(racerId: string): string[] {
    const position = this.positions[racerId];
    const stack = this.stacks[position] ?? [];
    if (
      !asBoolean(this.assumptions.carry_racers_stacked_above) ||
      this.isOpeningStartRacer(racerId, position) ||
      (!this.lapFinishMode &&
        asBoolean(this.assumptions.carry_disabled_on_start_and_finish) &&
        (position === 0 || position === this.length)) ||
      !stack.includes(racerId)
    ) {
      return [racerId];
    }
    const index = stack.indexOf(racerId);
    return stack
      .slice(index)
      .filter((item) => this.racerIds.includes(item) && !this.finishedSet.has(item));
  }

  private detachFromStack(movers: string[]): void {
    if (movers.length === 0) {
      return;
    }
    const position = this.positions[movers[0]];
    const stack = this.stacks[position] ?? [];
    this.stacks[position] = stack.filter((item) => !movers.includes(item));
    if (this.stacks[position].length === 0) {
      delete this.stacks[position];
    }
  }

  private advanceLapRacer(racerId: string, delta: number): boolean {
    const previousDistance = this.distanceTraveled[racerId];
    this.distanceTraveled[racerId] += delta;
    this.refreshTriggerOnceSkillAfterNextFinishIfNeeded(racerId, previousDistance);
    if (this.distanceTraveled[racerId] >= this.finishDistance[racerId]) {
      if (!this.finishedSet.has(racerId)) {
        this.finishedSet.add(racerId);
        this.finished.push(racerId);
      }
      this.positions[racerId] = this.length;
      return true;
    }
    this.positions[racerId] = this.boardPositionForRacer(racerId);
    return false;
  }

  private reorderLapFinishedMovers(movers: string[], finishedMovers: string[]): void {
    if (finishedMovers.length <= 1) {
      return;
    }
    const finishedSet = new Set(finishedMovers);
    this.finished = [
      ...this.finished.filter((racerId) => !finishedSet.has(racerId)),
      ...[...movers].reverse().filter((racerId) => finishedSet.has(racerId)),
    ];
  }

  private placeMovingRacers(
    movers: string[],
    newPosition: number,
    activeRacerId: string,
    triggerMechanism = true,
  ): void {
    if (this.lapFinishMode) {
      const unfinishedMovers: string[] = [];
      const finishedMovers: string[] = [];
      const delta = newPosition - this.positions[activeRacerId];
      for (const racerId of movers) {
        if (this.advanceLapRacer(racerId, delta)) {
          finishedMovers.push(racerId);
        } else {
          unfinishedMovers.push(racerId);
        }
      }
      this.reorderLapFinishedMovers(movers, finishedMovers);
      if (unfinishedMovers.length > 0) {
        const position = this.positions[unfinishedMovers[0]];
        const previousStack = [...(this.stacks[position] ?? [])];
        for (const racerId of unfinishedMovers) {
          this.positions[racerId] = position;
        }
        this.stacks[position] = this.stacks[position] ?? [];
        this.stacks[position].push(...unfinishedMovers);
        this.normalizeBudawangStack(position);
        this.applyJinhsiStackedAboveTrigger(position, previousStack);
      }
      if (
        triggerMechanism &&
        !this.finishedSet.has(activeRacerId) &&
        unfinishedMovers.includes(activeRacerId)
      ) {
        this.applyLandingMechanism(unfinishedMovers, activeRacerId, 1);
      }
      return;
    }

    if (newPosition >= this.length) {
      for (const racerId of [...movers].reverse()) {
        if (!this.finishedSet.has(racerId)) {
          this.finishedSet.add(racerId);
          this.finished.push(racerId);
          this.positions[racerId] = this.length;
        }
      }
      return;
    }

    const position = Math.max(0, newPosition);
    const previousStack = [...(this.stacks[position] ?? [])];
    for (const racerId of movers) {
      this.positions[racerId] = position;
    }
    this.stacks[position] = this.stacks[position] ?? [];
    this.stacks[position].push(...movers);
    this.normalizeBudawangStack(position);
    this.applyJinhsiStackedAboveTrigger(position, previousStack);
    if (triggerMechanism) {
      this.applyLandingMechanism(movers, activeRacerId, 1);
    }
  }

  private applyLandingMechanism(movers: string[], activeRacerId: string, direction: number): void {
    const chainLimit = Number(this.assumptions.mechanism_chain_limit);
    let currentMovers = [...movers];
    for (let index = 0; index < chainLimit; index += 1) {
      currentMovers = currentMovers.filter(
        (mover) => mover === BUDDAWANG_ID || !this.finishedSet.has(mover),
      );
      if (currentMovers.length === 0 || this.finishedSet.has(activeRacerId)) {
        return;
      }

      const position = this.positions[activeRacerId];
      if (typeof position === "undefined" || position >= this.length) {
        return;
      }
      const mechanism = this.mechanisms[position];
      if (!mechanism) {
        return;
      }
      if (mechanism === "rift") {
        this.randomizeStack(position);
        return;
      }

      let extra = mechanism === "boost" ? direction : -direction;
      const activeSkill = this.racers[activeRacerId]?.skill ?? {};
      if (activeSkill.type === "tile_affinity") {
        if (mechanism === "boost") {
          extra += Math.trunc(asNumber(activeSkill.boost_extra_steps)) * direction;
        } else if (mechanism === "hindrance") {
          extra += Math.trunc(asNumber(activeSkill.hindrance_extra_steps)) * direction;
        }
      }

      this.detachFromStack(currentMovers);
      const newPosition = this.positions[activeRacerId] + extra;
      if (direction === 1) {
        this.placeMovingRacers(currentMovers, newPosition, activeRacerId, false);
        continue;
      }
      this.placeBudawangAt(newPosition);
      return;
    }
  }

  private moveBudawang(delta: number): { movers: string[] } {
    const movers = this.movingBudawangStack();
    const moved = [...movers];
    if (this.budawangActive) {
      this.detachBudawangStack(movers);
    }
    moved.push(...this.moveBudawangStackTo(movers, this.budawangPosition + delta));
    moved.push(...this.applyBudawangMechanism());
    return { movers: this.uniqueMovers(moved) };
  }

  private moveBudawangStackTo(movers: string[], position: number): string[] {
    const [pathPositions, targetPosition] = this.budawangPathTo(position);
    const pickedUp: string[] = [];

    if (pathPositions.length > 0 && asBoolean(this.assumptions.budawang_captures_passed_racers, true)) {
      for (const pathPosition of pathPositions) {
        pickedUp.push(...this.collectBudawangPathRacers(movers, pathPosition));
      }
    }

    const direction = position > this.budawangPosition ? 1 : -1;
    this.placeBudawangStack(movers, targetPosition, direction);
    return pickedUp;
  }

  private budawangPathTo(position: number): [number[], number] {
    const currentPosition = this.budawangPosition;
    const delta = position - currentPosition;
    if (delta === 0) {
      return [[], currentPosition];
    }

    if (asBoolean(this.assumptions.start_and_finish_share_tile)) {
      let current =
        currentPosition === this.length ? 0 : ((currentPosition % this.length) + this.length) % this.length;
      const direction = delta > 0 ? 1 : -1;
      const pathPositions: number[] = [];
      for (let index = 0; index < Math.abs(delta); index += 1) {
        current = (current + direction + this.length) % this.length;
        pathPositions.push(current);
      }
      return [pathPositions, pathPositions[pathPositions.length - 1]];
    }

    const targetPosition = Math.max(0, Math.min(this.length, position));
    const step = targetPosition > currentPosition ? 1 : -1;
    const pathPositions: number[] = [];
    for (let item = currentPosition + step; step > 0 ? item <= targetPosition : item >= targetPosition; item += step) {
      pathPositions.push(item);
    }
    return [pathPositions, targetPosition];
  }

  private budawangPathReachesTeamTail(
    status: Record<string, string | number | boolean | null>,
    pathPositions: number[],
  ): boolean {
    if (Boolean(status.should_teleport)) {
      return true;
    }
    const tailPosition = typeof status.tail_position === "number" ? status.tail_position : null;
    if (tailPosition === null) {
      return false;
    }
    return pathPositions.some((position) => position <= tailPosition);
  }

  private collectBudawangPathRacers(movers: string[], position: number): string[] {
    const stack = this.stacks[position] ?? [];
    const pickedUp = stack.filter(
      (item) =>
        this.racerIds.includes(item) &&
        !this.finishedSet.has(item) &&
        !movers.includes(item),
    );
    if (pickedUp.length === 0) {
      return [];
    }
    this.stacks[position] = stack.filter((item) => !pickedUp.includes(item));
    if (this.stacks[position].length === 0) {
      delete this.stacks[position];
    }
    movers.push(...pickedUp);
    return pickedUp;
  }

  private budawangStackPositions(): number[] {
    const positions = [this.budawangPosition];
    if (asBoolean(this.assumptions.start_and_finish_share_tile)) {
      if (this.budawangPosition === this.length) {
        positions.push(0);
      } else if (this.budawangPosition === 0) {
        positions.push(this.length);
      }
    }
    return positions;
  }

  private movingBudawangStack(): string[] {
    if (!asBoolean(this.assumptions.budawang_carries_stacked_racers, true)) {
      return [BUDDAWANG_ID];
    }
    const movers = [BUDDAWANG_ID];
    for (const position of this.budawangStackPositions()) {
      const stack = this.stacks[position] ?? [];
      let candidates: string[] = [];
      if (position === this.budawangPosition && stack.includes(BUDDAWANG_ID)) {
        candidates = stack.slice(stack.indexOf(BUDDAWANG_ID) + 1);
      } else if (position !== this.budawangPosition) {
        candidates = stack;
      }
      for (const item of candidates) {
        if (this.racerIds.includes(item) && !this.finishedSet.has(item) && !movers.includes(item)) {
          movers.push(item);
        }
      }
    }
    return movers;
  }

  private detachBudawangStack(movers: string[]): void {
    for (const position of this.budawangStackPositions()) {
      const stack = this.stacks[position];
      if (!stack) {
        continue;
      }
      this.stacks[position] = stack.filter((item) => !movers.includes(item));
      if (this.stacks[position].length === 0) {
        delete this.stacks[position];
      }
    }
  }

  private placeBudawangStack(movers: string[], position: number, direction = -1): void {
    this.budawangPosition = Math.max(0, Math.min(this.length, position));
    let racerMovers = movers.filter(
      (item) => this.racerIds.includes(item) && !this.finishedSet.has(item),
    );
    if (this.lapFinishMode) {
      const unfinishedRacers: string[] = [];
      const finishedRacers: string[] = [];
      for (const racerId of racerMovers) {
        const delta = this.signedTrackDelta(this.positions[racerId], this.budawangPosition, direction);
        if (this.advanceLapRacer(racerId, delta)) {
          finishedRacers.push(racerId);
        } else {
          unfinishedRacers.push(racerId);
        }
      }
      this.reorderLapFinishedMovers(racerMovers, finishedRacers);
      racerMovers = unfinishedRacers;
    }

    if (this.budawangPosition >= this.length) {
      if (this.lapFinishMode) {
        const previousStack = [...(this.stacks[this.length] ?? [])];
        const stack = (this.stacks[this.length] = this.stacks[this.length] ?? []);
        if (!stack.includes(BUDDAWANG_ID)) {
          stack.push(BUDDAWANG_ID);
        }
        stack.push(...racerMovers);
        this.normalizeBudawangStack(this.length);
        this.applyJinhsiStackedAboveTrigger(this.length, previousStack);
        return;
      }
      for (const racerId of [...racerMovers].reverse()) {
        this.finishedSet.add(racerId);
        this.finished.push(racerId);
        this.positions[racerId] = this.length;
      }
      return;
    }

    for (const racerId of racerMovers) {
      this.positions[racerId] = this.budawangPosition;
    }
    const previousStack = [...(this.stacks[this.budawangPosition] ?? [])];
    const stack = (this.stacks[this.budawangPosition] = this.stacks[this.budawangPosition] ?? []);
    if (!stack.includes(BUDDAWANG_ID)) {
      stack.push(BUDDAWANG_ID);
    }
    stack.push(...racerMovers);
    this.normalizeBudawangStack(this.budawangPosition);
    this.applyJinhsiStackedAboveTrigger(this.budawangPosition, previousStack);
  }

  private uniqueMovers(movers: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const mover of movers) {
      if (!seen.has(mover)) {
        seen.add(mover);
        result.push(mover);
      }
    }
    return result;
  }

  private placeBudawangAt(position: number): void {
    this.budawangPosition = Math.max(0, Math.min(this.length, position));
    if (this.budawangPosition < this.length) {
      const stack = (this.stacks[this.budawangPosition] = this.stacks[this.budawangPosition] ?? []);
      if (!stack.includes(BUDDAWANG_ID)) {
        stack.unshift(BUDDAWANG_ID);
      }
      this.normalizeBudawangStack(this.budawangPosition);
    }
  }

  private applyBudawangMechanism(): string[] {
    const moved: string[] = [];
    const chainLimit = Number(this.assumptions.mechanism_chain_limit);
    for (let index = 0; index < chainLimit; index += 1) {
      const position = this.budawangPosition;
      const mechanism = this.mechanisms[position];
      if (!mechanism) {
        return moved;
      }
      if (mechanism === "rift") {
        this.randomizeStack(position);
        return moved;
      }
      const movers = this.movingBudawangStack();
      moved.push(...movers);
      this.detachBudawangStack(movers);
      if (mechanism === "boost") {
        moved.push(...this.moveBudawangStackTo(movers, position + 1));
      } else if (mechanism === "hindrance") {
        moved.push(...this.moveBudawangStackTo(movers, position - 1));
      } else {
        return moved;
      }
    }
    return moved;
  }

  private removeBudawangFromStack(): void {
    const position = this.budawangPosition;
    const stack = this.stacks[position];
    if (!stack) {
      return;
    }
    this.stacks[position] = stack.filter((item) => item !== BUDDAWANG_ID);
    if (this.stacks[position].length === 0) {
      delete this.stacks[position];
    }
  }

  private normalizeBudawangStack(position: number): void {
    const stack = this.stacks[position];
    if (!stack || !stack.includes(BUDDAWANG_ID)) {
      return;
    }
    this.stacks[position] = [BUDDAWANG_ID, ...stack.filter((item) => item !== BUDDAWANG_ID)];
  }

  private randomizeStack(position: number): void {
    const stack = this.stacks[position] ?? [];
    const budawang = stack.filter((item) => item === BUDDAWANG_ID);
    const racers = stack.filter((item) => item !== BUDDAWANG_ID);
    this.rng.shuffle(racers);
    this.stacks[position] = [...budawang, ...racers];
  }

  private updateHiyukiMeeting(): void {
    if (this.hiyukiMetBudawang || !this.budawangActive) {
      return;
    }
    if (!this.racerIds.includes("hiyuki") || this.finishedSet.has("hiyuki")) {
      return;
    }
    if (this.positions.hiyuki === this.budawangPosition) {
      this.hiyukiMetBudawang = true;
    }
  }

  private budawangTeleportStatus(): Record<string, string | number | boolean | null> {
    if (!this.budawangActive) {
      return {
        should_teleport: false,
        last_racer: null,
        last_racer_position: null,
        tail_position: null,
      };
    }
    const unfinished = this.currentRanking().filter((id) => !this.finishedSet.has(id));
    if (unfinished.length === 0) {
      return {
        should_teleport: false,
        last_racer: null,
        last_racer_position: null,
        tail_position: null,
      };
    }
    const lastRacer = unfinished[unfinished.length - 1];
    const lastPosition = this.positions[lastRacer];
    const tailPosition = lastPosition > 0 ? lastPosition - 1 : null;
    return {
      should_teleport: tailPosition !== null && this.budawangPosition <= tailPosition,
      last_racer: lastRacer,
      last_racer_position: lastPosition,
      tail_position: tailPosition,
    };
  }

  private resolveBudawangEndOfRound(): Record<string, unknown> {
    const status = this.budawangTeleportStatus();
    const lastRacer = typeof status.last_racer === "string" ? status.last_racer : null;
    const positionBefore = this.budawangPosition;
    const notes: string[] = [];

    if (lastRacer === null) {
      this.budawangPendingRoundEndTeleport = false;
      return {
        actor: BUDDAWANG_ID,
        roll: null,
        steps: null,
        movers: [],
        from_position: positionBefore,
        target_position: positionBefore,
        to_position: positionBefore,
        teleported: false,
        last_racer: null,
        last_racer_position: null,
        tail_position: null,
        notes,
      };
    }

    const lastName = this.racers[lastRacer].name;
    const lastPosition = Number(status.last_racer_position);
    const pendingTeleport = this.budawangPendingRoundEndTeleport;
    const teleported = pendingTeleport || Boolean(status.should_teleport);
    if (teleported) {
      this.teleportBudawangToFinish();
      notes.push(`最后一名${lastName}在${lastPosition}，布大王与其分开，回合末传送回起终点`);
    } else if (positionBefore === lastPosition) {
      notes.push(`最后一名${lastName}与布大王同在${lastPosition}，布大王保留当前位置`);
    } else {
      notes.push(`最后一名${lastName}在${lastPosition}，布大王尚未到队尾，保留当前位置`);
    }
    this.budawangPendingRoundEndTeleport = false;
    return {
      actor: BUDDAWANG_ID,
      roll: null,
      steps: null,
      movers: [],
      from_position: positionBefore,
      target_position: teleported ? this.length : positionBefore,
      to_position: this.budawangPosition,
      teleported,
      will_teleport_before_move: false,
      last_racer: lastRacer,
      last_racer_position: lastPosition,
      tail_position: status.tail_position,
      same_tile_with_last_racer: !teleported && positionBefore === lastPosition,
      pending_teleport: pendingTeleport,
      notes,
    };
  }

  private teleportBudawangToFinish(): void {
    this.removeBudawangFromStack();
    this.budawangPosition = this.length;
  }

  currentRanking(): string[] {
    const ranking = [...this.finished];
    const unfinished = this.racerIds.filter((racerId) => !this.finishedSet.has(racerId));

    if (this.lapFinishMode) {
      unfinished.sort((left, right) => {
        const leftStack = this.stacks[this.positions[left]] ?? [];
        const rightStack = this.stacks[this.positions[right]] ?? [];
        const leftIndex = leftStack.includes(left) ? leftStack.indexOf(left) : 0;
        const rightIndex = rightStack.includes(right) ? rightStack.indexOf(right) : 0;
        const leftScore = this.distanceTraveled[left] - this.finishDistance[left];
        const rightScore = this.distanceTraveled[right] - this.finishDistance[right];
        return rightScore - leftScore || rightIndex - leftIndex;
      });
      ranking.push(...unfinished);
      return ranking;
    }

    unfinished.sort((left, right) => {
      const leftStack = this.stacks[this.positions[left]] ?? [];
      const rightStack = this.stacks[this.positions[right]] ?? [];
      const leftIndex = leftStack.includes(left) ? leftStack.indexOf(left) : 0;
      const rightIndex = rightStack.includes(right) ? rightStack.indexOf(right) : 0;
      return this.positions[right] - this.positions[left] || rightIndex - leftIndex;
    });
    ranking.push(...unfinished);
    return ranking;
  }

  private currentActiveUnitRanking(): string[] {
    const units = this.racerIds.filter((racerId) => !this.finishedSet.has(racerId));
    if (this.budawangActive) {
      units.push(BUDDAWANG_ID);
    }

    units.sort((left, right) => {
      const leftStack = this.stacks[this.unitPosition(left)] ?? [];
      const rightStack = this.stacks[this.unitPosition(right)] ?? [];
      const leftIndex = leftStack.includes(left) ? leftStack.indexOf(left) : 0;
      const rightIndex = rightStack.includes(right) ? rightStack.indexOf(right) : 0;
      return this.unitProgressScore(right) - this.unitProgressScore(left) || rightIndex - leftIndex;
    });
    return units;
  }

  private unitPosition(unitId: string): number {
    return unitId === BUDDAWANG_ID ? this.budawangPosition : this.positions[unitId];
  }

  private unitProgressScore(unitId: string): number {
    if (unitId === BUDDAWANG_ID) {
      return this.lapFinishMode ? this.budawangPosition - this.length : this.budawangPosition;
    }
    return this.lapFinishMode ? this.lapProgressScore(unitId) : this.positions[unitId];
  }

  private captureFirstFinishSnapshotIfNeeded(roundNo: number): void {
    if (this.firstFinishSnapshot || this.finished.length === 0) {
      return;
    }
    const ranking = this.currentRanking();
    const firstRacer = this.finished[0] ?? ranking[0];
    const lastRacer = ranking.at(-1);
    if (!firstRacer || !lastRacer) {
      return;
    }
    const positions = Object.fromEntries(
      this.racerIds.map((racerId) => [racerId, Math.trunc(this.positions[racerId] ?? this.length)]),
    );
    this.firstFinishSnapshot = {
      round_no: roundNo,
      first_racer: firstRacer,
      first_racer_position: positions[firstRacer] ?? this.length,
      last_racer: lastRacer,
      last_racer_position: positions[lastRacer] ?? this.length,
      ranking: [...ranking],
      positions,
    };
  }

  private result(rounds: number, roundOrders: string[][]): RaceResult {
    const ranking = this.currentRanking();
    if (this.captureTrace) {
      this.recordState("比赛结束", "finish", { rounds });
    }
    const payload: RaceResult = {
      ranking,
      rounds,
      action_order: roundOrders[0] ?? [],
      round_orders: roundOrders,
      first_rolls: {},
      first_finish: this.firstFinishSnapshot,
    };
    if (this.captureTrace) {
      payload.timeline = this.timeline;
    }
    return payload;
  }

  private recordState(
    label: string,
    eventType: string,
    meta: Record<string, unknown> = {},
  ): void {
    if (!this.captureTrace) {
      return;
    }
    this.traceIndex += 1;
    const stacks: Record<string, string[]> = {};
    for (const [rawPosition, stack] of Object.entries(this.stacks).sort(
      ([left], [right]) => Number(left) - Number(right),
    )) {
      if (stack.length > 0) {
        stacks[String(rawPosition)] = [...stack];
      }
    }
    const finishStack = this.finished.filter((racerId) => this.positions[racerId] === this.length);
    if (finishStack.length > 0) {
      stacks[String(this.length)] = finishStack;
    }
    if (this.budawangActive && this.budawangPosition === this.length) {
      stacks[String(this.length)] = stacks[String(this.length)] ?? [];
      if (!stacks[String(this.length)].includes(BUDDAWANG_ID)) {
        stacks[String(this.length)].unshift(BUDDAWANG_ID);
      }
    }

    const positions: Record<string, number> = {};
    for (const racerId of this.racerIds) {
      positions[racerId] = Math.trunc(this.positions[racerId]);
    }
    if (this.budawangActive) {
      positions[BUDDAWANG_ID] = Math.trunc(this.budawangPosition);
    }

    const snapshot: TimelineStep = {
      index: this.traceIndex,
      label,
      event_type: eventType,
      positions,
      stacks,
      ranking: this.currentRanking(),
      finished: [...this.finished],
      budawang_active: this.budawangActive,
      hiyuki_met_budawang: this.hiyukiMetBudawang,
      cartethyia_active: this.cartethyiaActive,
      ...meta,
    };

    if (this.lapFinishMode) {
      snapshot.progress = Object.fromEntries(
        this.racerIds.map((racerId) => [
          racerId,
          {
            advanced: this.distanceTraveled[racerId],
            target: this.finishDistance[racerId],
            remaining: Math.max(0, this.finishDistance[racerId] - this.distanceTraveled[racerId]),
          },
        ]),
      );
    }
    this.timeline.push(snapshot);
  }
}

export function simulateSingle(
  config: TuanziConfig,
  match: SingleRaceMatch,
  runs: number,
  rng: SeededRng,
  onProgress?: ProgressCallback,
): SingleSimulationResult {
  const racerIds = [...match.racers];
  const rankCounts = emptyRankCounts(racerIds);
  const firstFinishEvaluation: FirstFinishEvaluation = {
    total_runs: 0,
    tail_position_buckets: {},
  };
  let roundsTotal = 0;
  const interval = progressEvery(runs);
  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const result = new Race(config, racerIds, rng, 80, false, match.initial_state).run();
    roundsTotal += result.rounds;
    result.ranking.forEach((racerId, index) => {
      incrementCounter(rankCounts[racerId], index + 1);
    });
    recordFirstFinishEvaluation(firstFinishEvaluation, result, racerIds);
    if (onProgress && ((runIndex + 1) % interval === 0 || runIndex + 1 === runs)) {
      onProgress(runIndex + 1, runs);
    }
  }

  return {
    type: "single_race",
    match_id: match.id,
    match_name: match.name,
    runs,
    rank_counts: rankCounts,
    avg_rounds: roundsTotal / runs,
    first_finish_evaluation: firstFinishEvaluation,
  };
}

function recordFirstFinishEvaluation(
  evaluation: FirstFinishEvaluation,
  result: RaceResult,
  racerIds: string[],
): void {
  const snapshot = result.first_finish;
  if (!snapshot) {
    return;
  }
  const tailPosition = Math.trunc(snapshot.last_racer_position);
  const bucketKey = String(tailPosition);
  const bucket =
    evaluation.tail_position_buckets[bucketKey] ??
    (evaluation.tail_position_buckets[bucketKey] = {
      runs: 0,
      rank_counts: emptyRankCounts(racerIds),
    });
  bucket.runs += 1;
  evaluation.total_runs += 1;
  result.ranking.forEach((racerId, index) => {
    incrementCounter(bucket.rank_counts[racerId], index + 1);
  });
}

export function simulateAggregate(
  config: TuanziConfig,
  match: AggregateMatch,
  runs: number,
  rng: SeededRng,
  onProgress?: ProgressCallback,
): AggregateSimulationResult {
  const sessions = match.sessions.map((sessionId) => matchById(config, sessionId) as SingleRaceMatch);
  const racerIds = [...sessions[0].racers];
  const pointsByRank = [...config.assumptions.aggregate_rank_points];
  const qualifyTop = Number(match.qualify_top);
  const placementCounts: Record<string, Record<string, number>> = Object.fromEntries(
    racerIds.map((racerId) => [racerId, {}]),
  );
  const qualifyCounts: Record<string, number> = {};
  const pointsTotal: Record<string, number> = {};
  const sessionRankCounts: Record<string, Record<string, Record<string, number>>> = Object.fromEntries(
    sessions.map((session) => [
      session.id,
      Object.fromEntries(racerIds.map((racerId) => [racerId, {}])),
    ]),
  );
  const interval = progressEvery(runs);

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const points: Record<string, number> = {};
    const bestRank: Record<string, number> = {};
    const rankSum: Record<string, number> = {};
    const randomTie: Record<string, number> = {};
    for (const racerId of racerIds) {
      points[racerId] = 0;
      bestRank[racerId] = 99;
      rankSum[racerId] = 0;
      randomTie[racerId] = rng.random();
    }

    for (const session of sessions) {
      const ranking = new Race(config, [...session.racers], rng, 80, false, session.initial_state).run().ranking;
      ranking.forEach((racerId, index) => {
        const rank = index + 1;
        points[racerId] += pointsByRank[index] ?? 0;
        bestRank[racerId] = Math.min(bestRank[racerId], rank);
        rankSum[racerId] += rank;
        incrementCounter(sessionRankCounts[session.id][racerId], rank);
      });
    }

    const aggregateRanking = [...racerIds].sort(
      (left, right) =>
        points[right] - points[left] ||
        bestRank[left] - bestRank[right] ||
        rankSum[left] - rankSum[right] ||
        randomTie[left] - randomTie[right],
    );
    aggregateRanking.forEach((racerId, index) => {
      const placement = index + 1;
      incrementCounter(placementCounts[racerId], placement);
      pointsTotal[racerId] = (pointsTotal[racerId] ?? 0) + points[racerId];
      if (placement <= qualifyTop) {
        qualifyCounts[racerId] = (qualifyCounts[racerId] ?? 0) + 1;
      }
    });
    if (onProgress && ((runIndex + 1) % interval === 0 || runIndex + 1 === runs)) {
      onProgress(runIndex + 1, runs);
    }
  }

  return {
    type: "aggregate",
    match_id: match.id,
    match_name: match.name,
    runs,
    qualify_top: qualifyTop,
    rank_counts: placementCounts,
    qualify_counts: qualifyCounts,
    points_total: pointsTotal,
    session_rank_counts: sessionRankCounts,
  };
}

export function buildManualMatch(config: TuanziConfig, setup: ManualRaceSetup): SingleRaceMatch {
  const knownRacers = new Set(config.racers.map((racer) => racer.id));
  const racers = buildRacers(config);
  const selected: string[] = [];
  for (const racerId of setup.racers) {
    if (!knownRacers.has(racerId)) {
      throw new Error(`Unknown racer id: ${racerId}`);
    }
    if (!selected.includes(racerId)) {
      selected.push(racerId);
    }
  }
  if (selected.length === 0) {
    throw new Error("请至少选择一个参赛团子");
  }

  const trackLength = Number(config.assumptions.track_length);
  const clampPosition = (value: unknown) =>
    Math.max(0, Math.min(trackLength, Math.trunc(asNumber(value))));
  const selectedSet = new Set(selected);
  const stackOrder: string[] = [];
  for (const racerId of setup.stack_order ?? []) {
    if (selectedSet.has(racerId) && !stackOrder.includes(racerId)) {
      stackOrder.push(racerId);
    }
  }
  for (const racerId of selected) {
    if (!stackOrder.includes(racerId)) {
      stackOrder.push(racerId);
    }
  }

  const positions = Object.fromEntries(
    selected.map((racerId) => [racerId, clampPosition(setup.positions[racerId])]),
  );
  const finished =
    setup.lap_mode === "first"
      ? stackOrder.filter((racerId) => positions[racerId] >= trackLength)
      : [];
  const finishedSet = new Set(finished);
  const leadingOrderByPosition: Record<string, string[]> = {};
  for (const racerId of stackOrder) {
    if (finishedSet.has(racerId)) {
      continue;
    }
    const position = String(positions[racerId]);
    leadingOrderByPosition[position] = leadingOrderByPosition[position] ?? [];
    leadingOrderByPosition[position].push(racerId);
  }
  const stacks = Object.fromEntries(
    Object.entries(leadingOrderByPosition).map(([position, stack]) => [
      position,
      [...stack].reverse(),
    ]),
  );

  const initialState: InitialStateConfig = {
    label: setup.lap_mode === "second" ? "手动第二圈站位" : "手动第一圈站位",
    positions,
    stacks,
    state_flags: {
      hiyuki_met_budawang: false,
      cartethyia_triggered: false,
      cartethyia_active: false,
    },
  };
  if (setup.lap_mode === "second") {
    initialState.finish_rule = "one_lap_after_next_finish";
    for (const racerId of selected) {
      const position = positions[racerId];
      if (position === 0 || position >= trackLength) {
        continue;
      }
      const skillType = skillTypeOf(racers[racerId]?.skill);
      if (MIDPOINT_TELEPORT_SKILLS.has(skillType)) {
        initialState.state_flags![`${racerId}_midpoint_teleport_triggered`] = true;
      } else if (skillType === "last_place_comeback") {
        initialState.state_flags!.cartethyia_triggered = true;
        initialState.state_flags!.cartethyia_active = false;
      }
    }
  }
  if (finished.length > 0) {
    initialState.finished = finished;
  }

  return {
    id: "manual_race",
    name: "手动赛局",
    type: "single_race",
    racers: selected,
    initial_state: initialState,
  };
}

export function simulateManualRace(
  config: TuanziConfig,
  setup: ManualRaceSetup,
  runs: number,
  seed?: number | null,
  onProgress?: ProgressCallback,
): SingleSimulationResult {
  validateConfig(config);
  const match = buildManualMatch(config, setup);
  validateInitialState(match, new Set(match.racers), Number(config.assumptions.track_length));
  return simulateSingle(config, match, runs, new SeededRng(seed), onProgress);
}

function singleRaceTraceFromResult(
  match: SingleRaceMatch,
  result: RaceResult,
  seed?: number | null,
): SingleRaceTrace {
  return {
    type: "single_race_trace",
    match_id: match.id,
    match_name: match.name,
    seed: seed ?? null,
    racers: [...match.racers],
    rounds: result.rounds,
    ranking: result.ranking,
    action_order: result.action_order,
    round_orders: result.round_orders,
    first_rolls: result.first_rolls,
    first_finish: result.first_finish,
    timeline: result.timeline ?? [],
  };
}

export function traceManualRace(
  config: TuanziConfig,
  setup: ManualRaceSetup,
  seed?: number | null,
): SingleRaceTrace {
  validateConfig(config);
  const match = buildManualMatch(config, setup);
  validateInitialState(match, new Set(match.racers), Number(config.assumptions.track_length));
  const result = new Race(
    config,
    [...match.racers],
    new SeededRng(seed),
    80,
    true,
    match.initial_state,
  ).run();
  return singleRaceTraceFromResult(match, result, seed);
}

export function traceManualRacePool(
  config: TuanziConfig,
  setup: ManualRaceSetup,
  samples: number,
  seed?: number | null,
): SingleRaceTrace[] {
  const count = Math.max(1, samples);
  const seedRng = new SeededRng(seed);
  const seeds: Array<number | null> = [];
  if (typeof seed === "number" && Number.isFinite(seed)) {
    seeds.push(seed);
  }
  while (seeds.length < count) {
    seeds.push(seedRng.randRange(1, 2_147_483_647));
  }
  return seeds.slice(0, count).map((itemSeed) => traceManualRace(config, setup, itemSeed));
}

export function traceManualRacePoolByFirstFinishTail(
  config: TuanziConfig,
  setup: ManualRaceSetup,
  samples: number,
  tailThreshold: number,
  seed?: number | null,
  maxAttempts = Math.max(200, samples * 250),
): SingleRaceTrace[] {
  const count = Math.max(1, samples);
  const attemptsLimit = Math.max(count, maxAttempts);
  validateConfig(config);
  const match = buildManualMatch(config, setup);
  validateInitialState(match, new Set(match.racers), Number(config.assumptions.track_length));
  const seedRng = new SeededRng(seed);
  const traces: SingleRaceTrace[] = [];
  let attempts = 0;

  while (traces.length < count && attempts < attemptsLimit) {
    const itemSeed =
      attempts === 0 && typeof seed === "number" && Number.isFinite(seed)
        ? seed
        : seedRng.randRange(1, 2_147_483_647);
    attempts += 1;
    const result = new Race(
      config,
      [...match.racers],
      new SeededRng(itemSeed),
      80,
      false,
      match.initial_state,
    ).run();
    if (matchesFirstFinishTailFilter(result.first_finish, tailThreshold)) {
      const traceResult = new Race(
        config,
        [...match.racers],
        new SeededRng(itemSeed),
        80,
        true,
        match.initial_state,
      ).run();
      traces.push(singleRaceTraceFromResult(match, traceResult, itemSeed));
    }
  }

  return traces;
}

export function simulateMatch(
  config: TuanziConfig,
  matchId: string,
  runs: number,
  seed?: number | null,
  onProgress?: ProgressCallback,
): SimulationResult {
  validateConfig(config);
  const rng = new SeededRng(seed);
  const match = matchById(config, matchId);
  if (match.type === "single_race") {
    return simulateSingle(config, match, runs, rng, onProgress);
  }
  if (match.type === "aggregate") {
    return simulateAggregate(config, match, runs, rng, onProgress);
  }
  throw new Error(`Unsupported match type: ${(match as MatchConfig).type}`);
}

export function traceSingleRace(
  config: TuanziConfig,
  matchId: string,
  seed?: number | null,
): SingleRaceTrace {
  validateConfig(config);
  const match = matchById(config, matchId);
  if (match.type !== "single_race") {
    throw new Error(`Match ${matchId} is not a single_race`);
  }
  const result = new Race(
    config,
    [...match.racers],
    new SeededRng(seed),
    80,
    true,
    match.initial_state,
  ).run();
  return singleRaceTraceFromResult(match, result, seed);
}

export function traceSingleRacePool(
  config: TuanziConfig,
  matchId: string,
  samples: number,
  seed?: number | null,
): SingleRaceTrace[] {
  validateConfig(config);
  const match = matchById(config, matchId);
  if (match.type !== "single_race") {
    throw new Error(`Match ${matchId} is not a single_race`);
  }

  const count = Math.max(1, samples);
  const seedRng = new SeededRng(seed);
  const seeds: Array<number | null> = [];
  if (typeof seed === "number" && Number.isFinite(seed)) {
    seeds.push(seed);
  }
  while (seeds.length < count) {
    seeds.push(seedRng.randRange(1, 2_147_483_647));
  }
  return seeds.slice(0, count).map((itemSeed) => traceSingleRace(config, matchId, itemSeed));
}

export function percentage(value: number, runs: number): string {
  return `${((value / runs) * 100).toFixed(2)}%`;
}

export function averageRank(counts: Record<string, number>, runs: number): number {
  return Object.entries(counts).reduce((total, [rank, count]) => total + Number(rank) * count, 0) / runs;
}

export function shortUnitName(name: string): string {
  return name.replace("·", "").slice(0, 2);
}

export function skillLabel(skill: SkillConfig = { type: "none" }): string {
  const skillName = typeof skill.name === "string" ? skill.name.trim() : "";
  const description = typeof skill.description === "string" ? skill.description.trim() : "";
  if (skillName && description) {
    return `${skillName}：${description}`;
  }
  if (skillName) {
    return skillName;
  }
  if (description) {
    return description;
  }

  const labels: Record<string, string> = {
    none: "无技能",
    above_stack_chance_to_top: "概率登顶",
    below_stack_chance_next_round_last: "压轴行动",
    tile_affinity: "机关亲和",
    mark_higher_neighbors_after_roll: "标记减速",
    mark_higher_neighbors_round_start: "轮初标记",
    same_roll_bonus: "同点加速",
    after_meeting_budawang_bonus: "遇王加速",
    last_place_comeback: "末位追赶",
    last_place_start_bonus: "末位起步",
    midpoint_adjacent_rank_teleport_once: "中点牵引",
    midpoint_all_racers_to_self_teleport_once: "全员牵引",
    per_move_chance_bonus: "概率加速",
    round_min_roll_bonus: "最低点加速",
    round_start_bottom_bonus: "底层加速",
    fixed_roll_cycle: "固定循环骰",
    chance_double_or_skip: "双倍/停步",
    midpoint_nearest_ahead_teleport_once: "达标传送",
    restricted_roll: "限定骰点",
    chance_double_roll: "概率双倍",
    top_skip_next_round_last: "顶端停步",
  };
  return labels[String(skill.type ?? "none")] ?? String(skill.type ?? "none");
}

export function racerById(config: TuanziConfig): Record<string, RacerConfig> {
  return Object.fromEntries(config.racers.map((racer) => [racer.id, racer]));
}
