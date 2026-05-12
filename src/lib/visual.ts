import {
  BUDDAWANG_ID,
  type RacePlaybackData,
  type RoundSummary,
  type SingleRaceTrace,
  type TrackLayout,
  type TuanziConfig,
  type VisualUnit,
} from "../types";
import { buildRacers, shortUnitName, skillLabel } from "./sim";

const racerIcons: Record<string, string> = {
  aemis: new URL("../../assets/tuanzi-icons/aemis.png", import.meta.url).href,
  carllotta: new URL("../../assets/tuanzi-icons/carllotta.png", import.meta.url).href,
  cartethyia: new URL("../../assets/tuanzi-icons/katixiya.png", import.meta.url).href,
  chisaki: new URL("../../assets/tuanzi-icons/chisaki.png", import.meta.url).href,
  denia: new URL("../../assets/tuanzi-icons/daniya.png", import.meta.url).href,
  hiyuki: new URL("../../assets/tuanzi-icons/weixue.png", import.meta.url).href,
  linnae: new URL("../../assets/tuanzi-icons/linnae.png", import.meta.url).href,
  lu_hesi: new URL("../../assets/tuanzi-icons/lu-hesi.png", import.meta.url).href,
  morning: new URL("../../assets/tuanzi-icons/morning.png", import.meta.url).href,
  phoebe: new URL("../../assets/tuanzi-icons/feibi.png", import.meta.url).href,
  shorekeeper: new URL("../../assets/tuanzi-icons/shorekeeper.png", import.meta.url).href,
  siglica: new URL("../../assets/tuanzi-icons/xigelika.png", import.meta.url).href,
};

const budawangIcon = new URL("../../assets/tuanzi-icons/__budawang__.png", import.meta.url).href;

export function buildTrackLayout(config: TuanziConfig): TrackLayout {
  const sequence = [...config.track.sequence];
  const mechanisms = config.track.mechanisms;
  const columns = 14;
  const rows = 14;
  const centerX = (columns - 1) / 2;
  const centerY = (rows - 1) / 2;
  const radius = 5.55;
  const length = sequence.length - 1;
  const cells = sequence.map((marker, position) => {
    const isStartFinish = position === 0 || position === length;
    const visualPosition = position === length ? 0 : position;
    const angle = ((180 - (visualPosition * 360) / Math.max(1, length)) * Math.PI) / 180;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY - radius * Math.sin(angle);
    const markerKey = typeof marker === "string" ? marker : null;
    const mechanism = markerKey ? mechanisms[markerKey] : undefined;
    const mechanismId = mechanism?.id ?? null;
    const mechanismDelta = mechanism?.delta ?? null;
    let mechanismEffect: string | null = null;
    if ((mechanismId === "boost" || mechanismId === "hindrance") && mechanismDelta !== null) {
      mechanismEffect = `${mechanismDelta > 0 ? "+" : ""}${mechanismDelta}`;
    } else if (mechanismId === "rift") {
      mechanismEffect = "洗牌";
    }

    return {
      position,
      display_position: position === 0 ? "0/32" : String(position),
      x,
      y,
      label: isStartFinish ? "0/32" : mechanismEffect ?? String(position),
      marker,
      mechanism_id: mechanismId,
      mechanism_name: mechanism?.name ?? null,
      mechanism_marker: mechanism ? String(marker).toUpperCase() : null,
      mechanism_delta: mechanismDelta,
      mechanism_effect: mechanismEffect,
      is_start_finish: isStartFinish,
      visible: position !== length,
    };
  });

  const mechanismSummaries = Object.entries(mechanisms).map(([marker, mechanism]) => {
    const positions = cells
      .filter((cell) => cell.visible && cell.marker === marker)
      .map((cell) => cell.position);
    const delta = Number(mechanism.delta ?? 0);
    let rule = mechanism.name;
    let effect = "";
    if (mechanism.id === "boost") {
      rule = `团子落地后前进 ${Math.abs(delta || 1)} 格；布大王触发时向编号更大方向移动 ${Math.abs(delta || 1)} 格`;
      effect = `+${Math.abs(delta || 1)}`;
    } else if (mechanism.id === "hindrance") {
      rule = `团子落地后后退 ${Math.abs(delta || -1)} 格；布大王触发时向编号更小方向移动 ${Math.abs(delta || -1)} 格`;
      effect = `-${Math.abs(delta || -1)}`;
    } else if (mechanism.id === "rift") {
      rule = "打乱本格堆叠顺序，影响同格排名和后续携带";
      effect = "洗牌";
    }
    return {
      marker: marker.toUpperCase(),
      id: mechanism.id,
      name: mechanism.name,
      effect,
      rule,
      positions,
    };
  });

  return {
    columns,
    rows,
    cells,
    finish_position: length,
    mechanisms: mechanismSummaries,
  };
}

export function buildVisualUnits(config: TuanziConfig, racerIds: string[]): VisualUnit[] {
  const racers = buildRacers(config);
  const palette = [
    "#147a7e",
    "#d45335",
    "#315dd6",
    "#b88718",
    "#3f9b55",
    "#8a5bd6",
    "#d6356f",
    "#177da0",
    "#d47409",
    "#2f73d6",
    "#7f3fbf",
    "#0f9b75",
    "#a45b23",
    "#587a78",
    "#b5222f",
    "#527a42",
    "#7133a8",
    "#0f6f9d",
  ];
  const units: VisualUnit[] = racerIds.map((racerId, index) => {
    const racer = racers[racerId];
    return {
      id: racerId,
      name: racer.name,
      short: shortUnitName(racer.name),
      color: palette[index % palette.length],
      icon: racerIcons[racerId],
      skill: skillLabel(racer.skill),
    };
  });
  units.push({
    id: BUDDAWANG_ID,
    name: config.special_units?.budawang?.name ?? "布大王",
    short: "布王",
    color: "#1f2933",
    icon: budawangIcon,
    skill: "逆向巡场",
    special: true,
  });
  return units;
}

export function buildRoundSummaries(trace: SingleRaceTrace): RoundSummary[] {
  const summaries = new Map<number, RoundSummary>();
  for (const step of trace.timeline) {
    const roundNo = step.round_no;
    if (typeof roundNo !== "number") {
      continue;
    }
    if (!summaries.has(roundNo)) {
      summaries.set(roundNo, {
        round_no: roundNo,
        action_order: [],
        rolls: [],
        dice_total: 0,
        roll_count: 0,
        first_actor: null,
      });
    }
    const summary = summaries.get(roundNo)!;
    if (step.event_type === "round_order") {
      const actionOrder = [...(step.action_order ?? [])];
      summary.action_order = actionOrder;
      summary.first_actor = actionOrder[0] ?? null;
    } else if (
      (step.event_type === "racer_turn" || step.event_type === "budawang_turn") &&
      typeof step.roll === "number"
    ) {
      summary.rolls.push({
        actor: typeof step.actor === "string" ? step.actor : undefined,
        roll: step.roll,
        steps: typeof step.steps === "number" ? step.steps : null,
      });
      summary.dice_total += step.roll;
      summary.roll_count += 1;
    }
  }
  return [...summaries.values()].sort((left, right) => left.round_no - right.round_no);
}

export function buildRacePlaybackData(
  config: TuanziConfig,
  trace: SingleRaceTrace,
  traces?: SingleRaceTrace[],
): RacePlaybackData {
  const racePool = traces && traces.length > 0 ? traces : [trace];
  return {
    title: trace.match_name,
    match_id: trace.match_id,
    base_seed: trace.seed,
    track: buildTrackLayout(config),
    units: buildVisualUnits(config, trace.racers),
    races: racePool.map((item) => ({
      seed: item.seed,
      rounds: item.rounds,
      ranking: item.ranking,
      action_order: item.action_order,
      round_orders: item.round_orders,
      round_summaries: buildRoundSummaries(item),
      first_rolls: item.first_rolls,
      timeline: item.timeline,
    })),
  };
}
