export const BUDDAWANG_ID = "__budawang__";

export type SkillConfig = {
  type?: string;
  [key: string]: unknown;
};

export type RacerConfig = {
  id: string;
  name: string;
  group?: string;
  skill?: SkillConfig;
};

export type MechanismConfig = {
  id: string;
  name: string;
  delta?: number;
};

export type InitialStateConfig = {
  label?: string;
  finish_rule?: string;
  positions?: Record<string, number>;
  stacks?: Record<string, string[]>;
  finished?: string[];
  state_flags?: Record<string, boolean>;
  previous_roll?: Record<string, number | null>;
  distance_traveled?: Record<string, number>;
  finish_distance?: Record<string, number>;
  budawang?: {
    active?: boolean;
    position?: number;
  };
};

export type SingleRaceMatch = {
  id: string;
  name: string;
  type: "single_race";
  date?: string;
  group?: string;
  racers: string[];
  initial_state?: InitialStateConfig;
};

export type ManualLapMode = "first" | "second";

export type ManualRaceSetup = {
  lap_mode: ManualLapMode;
  racers: string[];
  positions: Record<string, number>;
  stack_order?: string[];
};

export type AggregateMatch = {
  id: string;
  name: string;
  type: "aggregate";
  sessions: string[];
  qualify_top: number;
};

export type MatchConfig = SingleRaceMatch | AggregateMatch;

export type TuanziConfig = {
  metadata: {
    title?: string;
    updated_at?: string;
    data_status?: string;
    sources?: Array<{ label: string; url: string; note?: string }>;
  };
  assumptions: Record<string, unknown> & {
    dice_sides: number[];
    track_length: number;
    mechanism_chain_limit: number;
    budawang_direction: number;
    budawang_starts_on_round: number;
    aggregate_rank_points: number[];
  };
  track: {
    sequence: Array<string | number>;
    mechanisms: Record<string, MechanismConfig>;
  };
  racers: RacerConfig[];
  special_units?: {
    budawang?: {
      id?: string;
      name?: string;
      dice_sides?: number[];
      starts_on_round?: number;
      start_position?: number;
      direction?: number;
      acts_after_racers?: boolean;
    };
  };
  matches: MatchConfig[];
  payout?: {
    enabled?: boolean;
    multipliers?: Record<string, number>;
    other_multiplier?: number;
  };
};

export type RaceResult = {
  ranking: string[];
  rounds: number;
  action_order: string[];
  round_orders: string[][];
  first_rolls: Record<string, number>;
  timeline?: TimelineStep[];
};

export type TimelineStep = {
  index: number;
  label: string;
  event_type: string;
  round_no?: number;
  positions: Record<string, number>;
  stacks: Record<string, string[]>;
  ranking: string[];
  finished: string[];
  budawang_active: boolean;
  hiyuki_met_budawang: boolean;
  cartethyia_active: boolean;
  progress?: Record<string, { advanced: number; target: number; remaining: number }>;
  action_order?: string[];
  actor?: string;
  roll?: number | null;
  steps?: number | null;
  movers?: string[];
  from_position?: number;
  target_position?: number;
  to_position?: number;
  notes?: string[];
  [key: string]: unknown;
};

export type SingleSimulationResult = {
  type: "single_race";
  match_id: string;
  match_name: string;
  runs: number;
  rank_counts: Record<string, Record<string, number>>;
  avg_rounds: number;
};

export type AggregateSimulationResult = {
  type: "aggregate";
  match_id: string;
  match_name: string;
  runs: number;
  qualify_top: number;
  rank_counts: Record<string, Record<string, number>>;
  qualify_counts: Record<string, number>;
  points_total: Record<string, number>;
  session_rank_counts: Record<string, Record<string, Record<string, number>>>;
};

export type SimulationResult = SingleSimulationResult | AggregateSimulationResult;

export type SingleRaceTrace = {
  type: "single_race_trace";
  match_id: string;
  match_name: string;
  seed: number | null;
  racers: string[];
  rounds: number;
  ranking: string[];
  action_order: string[];
  round_orders: string[][];
  first_rolls: Record<string, number>;
  timeline: TimelineStep[];
};

export type TrackCell = {
  position: number;
  display_position: string;
  x: number;
  y: number;
  label: string;
  marker: string | number;
  mechanism_id: string | null;
  mechanism_name: string | null;
  mechanism_marker: string | null;
  mechanism_delta: number | null;
  mechanism_effect: string | null;
  is_start_finish: boolean;
  visible: boolean;
};

export type TrackLayout = {
  columns: number;
  rows: number;
  cells: TrackCell[];
  finish_position: number;
  mechanisms: Array<{
    marker: string;
    id: string;
    name: string;
    effect: string;
    rule: string;
    positions: number[];
  }>;
};

export type VisualUnit = {
  id: string;
  name: string;
  short: string;
  color: string;
  icon?: string;
  skill: string;
  special?: boolean;
};

export type RoundSummary = {
  round_no: number;
  action_order: string[];
  rolls: Array<{ actor?: string; roll: number; steps?: number | null }>;
  dice_total: number;
  roll_count: number;
  first_actor: string | null;
};

export type RacePlayback = {
  seed: number | null;
  rounds: number;
  ranking: string[];
  action_order: string[];
  round_orders: string[][];
  round_summaries: RoundSummary[];
  first_rolls: Record<string, number>;
  timeline: TimelineStep[];
};

export type RacePlaybackData = {
  title: string;
  match_id: string;
  base_seed: number | null;
  track: TrackLayout;
  units: VisualUnit[];
  races: RacePlayback[];
};
