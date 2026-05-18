import type { MechanismConfig, RacerConfig, SkillConfig } from "./types";

export type Language = "zh" | "en";

export const languageOptions: Array<{ value: Language; label: string; title: string }> = [
  { value: "zh", label: "中", title: "中文" },
  { value: "en", label: "EN", title: "English" },
];

export const localeByLanguage: Record<Language, string> = {
  zh: "zh-CN",
  en: "en-US",
};

const zhText = {
  actionOrderAria: "行动顺序和骰点",
  avgPoints: "平均积分",
  avgRank: "平均名次",
  brand: "鸣潮 · 小团快跑 2026",
  calculating: "计算中",
  championRate: "冠军率",
  copied: "链接已复制",
  currentConfig: "当前配置",
  currentEvent: "当前事件",
  custom: "自定义",
  documentDescription: "鸣潮小团快跑锦标赛浏览器本地 Monte Carlo 模拟器",
  documentTitle: "小团快跑本地模拟器",
  firstLap: "第一圈",
  filteredEvaluation: "条件评测",
  filteredPlaybackEmpty: "未找到命中的回放样本",
  filteredPlaybackLoading: "正在匹配回放样本",
  filteredPlaybackReady: "回放使用命中样本",
  filteredPlaybackToggle: "赛局回放使用筛选结果",
  filteredRuns: "命中样本",
  filteredWinRate: "筛选胜率",
  filterTailCondition: "首个团子到达终点后，队尾位置 >",
  githubRepository: "打开 GitHub 仓库",
  groupFirst: "小组第一",
  languageSwitch: "语言切换",
  lapMode: "圈数模式",
  manualSetup: "手动设定",
  moveDown: "同格顺序下移",
  moveUp: "同格顺序上移",
  nextStep: "下一步",
  noRacersError: "请至少选择一个参赛团子",
  noFilteredRuns: "当前阈值没有命中样本",
  noSpecial: "本步无特殊结算",
  participating: "参赛",
  pause: "暂停",
  play: "播放",
  playback: "赛局回放",
  playbackProgress: "回放进度",
  positionAria: "站位",
  positionGuideFirstText: "第一圈固定全员 1，开局起点不判定堆叠前后；每轮行动顺序随机。",
  positionGuideText: "上方优先；起点/终点不判定前后。",
  positionGuideTitle: "站位与同格顺序",
  positionsList: "站位和同格顺序",
  prevStep: "上一步",
  qualifyRate: "晋级率",
  racer: "团子",
  racerPicker: "参赛团子",
  racersSuffix: "名团子",
  ranking: "排名",
  resetStart: "回到开赛",
  results: "模拟结果",
  rollCountSuffix: "次",
  rounds: "轮数",
  runUnit: "次",
  runs: "模拟次数",
  secondLap: "第二圈",
  seed: "随机种子",
  seedPrefix: "种子",
  shareParams: "分享当前参数",
  sortAscending: "升序",
  sortDescending: "降序",
  sortResults: "结果排序",
  stackLabel: "堆叠",
  start: "开始模拟",
  switchSample: "切换样本",
  title: "手动赛局模拟台",
  trackPlayback: "赛道回放",
  trackSuffix: "格赛道",
  thresholdPosition: "队尾阈值",
  mechanismLegend: "赛道机关说明",
  workerLoadError: "Worker 加载失败",
  workerMessageError: "Worker 消息解析失败",
};

type TextMap = typeof zhText;

const enText: TextMap = {
  actionOrderAria: "action order and dice rolls",
  avgPoints: "Avg. points",
  avgRank: "Avg. rank",
  brand: "Wuthering Waves · Tuanzi Dash 2026",
  calculating: "Calculating",
  championRate: "Win rate",
  copied: "Link copied",
  currentConfig: "Current setup",
  currentEvent: "Event",
  custom: "Custom",
  documentDescription: "A browser-local Monte Carlo simulator for Wuthering Waves Tuanzi Dash Championship.",
  documentTitle: "Tuanzi Dash Local Simulator",
  firstLap: "First lap",
  filteredEvaluation: "Filtered evaluation",
  filteredPlaybackEmpty: "No matching replay samples found",
  filteredPlaybackLoading: "Finding matching replay samples",
  filteredPlaybackReady: "Replay is using matched samples",
  filteredPlaybackToggle: "Use filtered results in replay",
  filteredRuns: "Matched samples",
  filteredWinRate: "Filtered win",
  filterTailCondition: "After the first tuanzi finishes, tail position >",
  githubRepository: "Open GitHub repository",
  groupFirst: "Group first",
  languageSwitch: "Language switch",
  lapMode: "Lap mode",
  manualSetup: "Manual setup",
  moveDown: "Move down in same-tile order",
  moveUp: "Move up in same-tile order",
  nextStep: "Next step",
  noRacersError: "Select at least one racer",
  noFilteredRuns: "No samples match this threshold",
  noSpecial: "No special resolution on this step",
  participating: "Racing",
  pause: "Pause",
  play: "Play",
  playback: "Race replay",
  playbackProgress: "Replay progress",
  positionAria: "position",
  positionGuideFirstText: "First lap locks everyone at 1; opening start order is neutral and action order is random.",
  positionGuideText: "Higher rows lead; start/finish tiles ignore same-tile order.",
  positionGuideTitle: "Positions and same-tile order",
  positionsList: "positions and same-tile order",
  prevStep: "Previous step",
  qualifyRate: "Advance rate",
  racer: "Racer",
  racerPicker: "Tuanzi racers",
  racersSuffix: "racers",
  ranking: "Ranking",
  resetStart: "Back to start",
  results: "Simulation results",
  rollCountSuffix: "rolls",
  rounds: "Rounds",
  runUnit: "runs",
  runs: "Simulation runs",
  secondLap: "Second lap",
  seed: "Seed",
  seedPrefix: "Seed",
  shareParams: "Share current setup",
  sortAscending: "Ascending",
  sortDescending: "Descending",
  sortResults: "Sort results",
  stackLabel: "Stack",
  start: "Run simulation",
  switchSample: "Switch sample",
  title: "Manual Race Simulator",
  trackPlayback: "Track replay",
  trackSuffix: "tile track",
  thresholdPosition: "Tail threshold",
  mechanismLegend: "Track mechanism legend",
  workerLoadError: "Worker failed to load",
  workerMessageError: "Worker message parsing failed",
};

export const text: Record<Language, TextMap> = {
  zh: zhText,
  en: enText,
};

const racerNames: Record<string, Record<Language, string>> = {
  __budawang__: { zh: "布大王团子", en: "Budawang Tuanzi" },
  aemis: { zh: "爱弥斯", en: "Aemis" },
  augusta: { zh: "奥古斯塔", en: "Augusta" },
  calcharo: { zh: "卡卡罗", en: "Calcharo" },
  carllotta: { zh: "珂莱塔", en: "Carlotta" },
  cartethyia: { zh: "卡提希娅", en: "Cartethyia" },
  changli: { zh: "长离", en: "Changli" },
  chisaki: { zh: "千咲", en: "Chisaki" },
  denia: { zh: "达妮娅", en: "Daniya" },
  florof: { zh: "弗洛洛", en: "Florof" },
  hiyuki: { zh: "绯雪", en: "Hiyuki" },
  jinhsi: { zh: "今汐", en: "Jinhsi" },
  linnae: { zh: "琳奈", en: "Linnae" },
  lu_hesi: { zh: "陆·赫斯", en: "Lu Hesi" },
  morning: { zh: "莫宁", en: "Morning" },
  phoebe: { zh: "菲比", en: "Phoebe" },
  shorekeeper: { zh: "守岸人", en: "Shorekeeper" },
  siglica: { zh: "西格莉卡", en: "Siglica" },
  younuo: { zh: "尤诺", en: "Younuo" },
};

const matchNames: Record<string, Record<Language, string>> = {
  a_group_combined: { zh: "A组小组赛汇总 6进4", en: "Group A aggregate, 6 advance to 4" },
  a_group_lower: { zh: "A组小组赛 05.10 下半场", en: "Group A qualifier 05.10, second half" },
  a_group_lower_from_0509_settlement: {
    zh: "A组小组赛 05.10 下半场（接 05.09 结算站位）",
    en: "Group A qualifier 05.10, second half from 05.09 settlement",
  },
  a_group_upper: { zh: "A组小组赛 05.09 上半场", en: "Group A qualifier 05.09, first half" },
  manual_race: { zh: "手动赛局", en: "Manual race" },
  template_all_18: { zh: "18名团子模板赛", en: "18-racer template race" },
};

const eventTypeLabels: Record<string, Record<Language, string>> = {
  budawang_round_end: { zh: "布大王回合末位置", en: "Budawang end-of-round position" },
  budawang_turn: { zh: "布大王移动", en: "Budawang move" },
  finish: { zh: "比赛结束", en: "Race finished" },
  racer_turn: { zh: "团子行动", en: "Racer turn" },
  round_order: { zh: "行动顺序", en: "Action order" },
  start: { zh: "开赛", en: "Race start" },
};

const mechanismLabels: Record<string, Record<Language, string>> = {
  boost: { zh: "推进装置", en: "Boost" },
  hindrance: { zh: "阻遏装置", en: "Hindrance" },
  rift: { zh: "时空裂隙", en: "Rift" },
};

const skillLabels: Record<string, Record<Language, string>> = {
  above_stack_chance_to_top: {
    zh: "概率登顶",
    en: "When no racer is stacked above Jinhsi, if another tuanzi becomes stacked above her, she has a 40% chance to move to the top of the stack.",
  },
  after_meeting_budawang_bonus: {
    zh: "遇王加速",
    en: "Guiding White Bird: after meeting Budawang, moves +1 extra each turn.",
  },
  below_stack_chance_next_round_last: {
    zh: "压轴行动",
    en: "If another tuanzi is stacked below, has a 65% chance to act last next round.",
  },
  chance_double_or_skip: {
    zh: "双倍/停步",
    en: "Colorful Moment: 60% chance to move double, 20% chance to skip the turn.",
  },
  chance_double_roll: {
    zh: "概率双倍",
    en: "Profit Doubled: 28% chance to move double the die roll.",
  },
  fixed_roll_cycle: {
    zh: "固定循环骰",
    en: "Precise Calculation: rolls cycle through 3, 2, 1.",
  },
  last_place_comeback: {
    zh: "末位追赶",
    en: "Comeback Arc: once per race, ending a move in last place enables a 60% chance for +2 on later turns.",
  },
  last_place_start_bonus: {
    zh: "末位起步",
    en: "At the start of its move, if it is in last place, moves +3 extra; after Budawang joins, Budawang counts for last place.",
  },
  mark_higher_neighbors_after_roll: {
    zh: "标记减速",
    en: "Sun Sprite, lend a hand: marks up to two nearby higher-ranked racers; marked racers move 1 fewer step.",
  },
  mark_higher_neighbors_round_start: {
    zh: "轮初标记",
    en: "Sun Sprite, lend a hand: marks up to two nearby higher-ranked racers at round start; marked racers move 1 fewer step.",
  },
  midpoint_nearest_ahead_teleport_once: {
    zh: "达标传送",
    en: "Electronic Ghost: once per race after ending its own move beyond the trigger tile, teleports to the top of the nearest racer ahead; same-tile racers do not count.",
  },
  midpoint_adjacent_rank_teleport_once: {
    zh: "中点牵引",
    en: "Once per race after passing the midpoint, teleports the adjacent ranked racers to its tile in their prior rank order.",
  },
  midpoint_all_racers_to_self_teleport_once: {
    zh: "全员牵引",
    en: "Once per race after ending its own move beyond the trigger tile, if another racer is ahead or stacked above it, teleports every other racer to its tile in prior rank order.",
  },
  none: { zh: "无技能", en: "No skill" },
  per_move_chance_bonus: {
    zh: "概率加速",
    en: "Sentinel's Blessing: 50% chance to move +1 extra.",
  },
  restricted_roll: { zh: "限定骰点", en: "Converging Future: only rolls 2 or 3." },
  round_min_roll_bonus: {
    zh: "最低点加速",
    en: "Vision Release: if this roll is one of the lowest this round, moves +2 extra.",
  },
  round_start_bottom_bonus: {
    zh: "底层加速",
    en: "Before moving, if it is at the bottom of a stack, moves +3 extra; does not trigger if Budawang is below.",
  },
  same_roll_bonus: {
    zh: "同点加速",
    en: "Good Things Come in Pairs: if the die matches the previous roll, moves +2 extra.",
  },
  tile_affinity: {
    zh: "机关亲和",
    en: "Candy, Please: boost tiles add +3 extra; hindrance tiles add -1 extra.",
  },
  top_skip_next_round_last: {
    zh: "顶端停步",
    en: "Before moving, if it is on top of a stack, skips this turn and acts last next round.",
  },
};

const zhNameToId = Object.fromEntries(
  Object.entries(racerNames).map(([id, names]) => [names.zh, id]),
) as Record<string, string>;

const zhNamePattern = new RegExp(
  Object.keys(zhNameToId)
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "g",
);

export function isLanguage(value: string | null | undefined): value is Language {
  return value === "zh" || value === "en";
}

export function racerDisplayName(
  racerOrId: RacerConfig | string | undefined,
  language: Language,
): string {
  const id = typeof racerOrId === "string" ? racerOrId : racerOrId?.id;
  if (id && racerNames[id]) {
    return racerNames[id][language];
  }
  if (typeof racerOrId === "object") {
    return racerOrId.name;
  }
  return id ?? "";
}

export function unitShortName(unitId: string, fallback: string, language: Language): string {
  if (language === "zh") {
    return fallback;
  }
  if (unitId === "__budawang__") {
    return "BW";
  }
  return racerDisplayName(unitId, language).slice(0, 2).toUpperCase();
}

export function skillDisplayText(
  skill: SkillConfig | undefined,
  language: Language,
): string {
  const skillType = String(skill?.type ?? "none");
  if (language === "zh") {
    const skillName = typeof skill?.name === "string" ? skill.name.trim() : "";
    const description = typeof skill?.description === "string" ? skill.description.trim() : "";
    if (skillName && description) {
      return `${skillName}：${description}`;
    }
    if (skillName) {
      return skillName;
    }
    if (description) {
      return description;
    }
  }
  return skillLabels[skillType]?.[language] ?? skillType;
}

export function matchDisplayName(
  matchId: string | undefined,
  fallback: string,
  language: Language,
): string {
  if (matchId && matchNames[matchId]) {
    return matchNames[matchId][language];
  }
  return language === "zh" ? fallback : translateKnownNames(fallback, language);
}

export function eventTypeDisplayName(eventType: string, language: Language): string {
  return eventTypeLabels[eventType]?.[language] ?? eventType;
}

export function mechanismDisplayName(
  id: string | null | undefined,
  fallback: string | null | undefined,
  language: Language,
): string {
  if (id && mechanismLabels[id]) {
    return mechanismLabels[id][language];
  }
  return fallback ?? "";
}

export function mechanismDisplayEffect(
  id: string | null | undefined,
  fallback: string | null | undefined,
  language: Language,
): string {
  if (language === "en" && id === "rift") {
    return "Mix";
  }
  return fallback ?? "";
}

export function formatGroupLabel(groups: string[], language: Language): string {
  if (groups.length === 1) {
    return language === "zh" ? `${groups[0]} 组` : `Group ${groups[0]}`;
  }
  return groups.length > 1 ? groups.join(" / ") : text[language].custom;
}

export function formatRacerCount(count: number, language: Language): string {
  return language === "zh" ? `${count}人` : `${count} ${count === 1 ? "racer" : "racers"}`;
}

export function formatPositions(positions: number[], language: Language): string {
  return language === "zh" ? `${positions.join("、")}格` : `Tiles ${positions.join(", ")}`;
}

export function translateTimelineLabel(label: string, language: Language): string {
  if (language === "zh") {
    return label;
  }
  if (label === "开赛") {
    return "Race start";
  }
  if (label === "比赛结束") {
    return "Race finished";
  }
  let match = label.match(/^第(\d+)轮 行动顺序$/);
  if (match) {
    return `Round ${match[1]} action order`;
  }
  match = label.match(/^第(\d+)轮 布大王移动$/);
  if (match) {
    return `Round ${match[1]} Budawang move`;
  }
  match = label.match(/^第(\d+)轮 布大王回合末位置$/);
  if (match) {
    return `Round ${match[1]} Budawang end-of-round position`;
  }
  match = label.match(/^第(\d+)轮 (.+)$/);
  if (match) {
    return `Round ${match[1]} ${translateKnownNames(match[2], language)}`;
  }
  return translateKnownNames(label, language);
}

export function translateTimelineNote(note: string, language: Language): string {
  if (language === "zh") {
    return note;
  }

  const staticNotes: Record<string, string> = {
    "双倍点数移动": "Moved double the die roll",
    "布大王出场": "Budawang entered",
    "布大王已在初始站位中，首轮起加入行动顺序":
      "Budawang starts in the initial position and joins the action order from round 1",
    "本回合无法移动": "Could not move this turn",
    "本步无特殊结算": "No special resolution on this step",
    "第3轮起布大王加入行动顺序": "Budawang joins the action order from round 3",
    "每轮随机行动；西格莉卡轮初标记": "Random action order each round; Siglica marks at round start",
    "开始走格子前位于顶端，本回合不行动，下回合最后行动":
      "Was on top before moving, skipped this turn, and will act last next round",
    "移至堆叠顶端": "Moved to the top of the stack",
    "今汐移至堆叠顶端": "Jinhsi moved to the top of the stack",
    "首轮同在起点，暂无前后顺序，西格莉卡不标记":
      "All racers start together, so Siglica does not mark anyone in round 1",
    "所有团子需先到下一次起终点，再完整跑一圈到起终点":
      "Each racer must first reach the next start/finish, then complete a full lap back to start/finish",
    "追赶状态开启": "Comeback state activated",
  };
  if (staticNotes[note]) {
    return staticNotes[note];
  }

  let match = note.match(/^标记影响 ([+-]?\d+)$/);
  if (match) {
    return `Mark effect ${match[1]}`;
  }
  match = note.match(/^连续同点 \+(\d+)$/);
  if (match) {
    return `Repeated roll +${match[1]}`;
  }
  match = note.match(/^已遇见布大王 \+(\d+)$/);
  if (match) {
    return `Met Budawang +${match[1]}`;
  }
  match = note.match(/^追赶触发 \+(\d+)$/);
  if (match) {
    return `Comeback triggered +${match[1]}`;
  }
  match = note.match(/^概率触发 \+(\d+)$/);
  if (match) {
    return `Chance bonus +${match[1]}`;
  }
  match = note.match(/^本轮最低点 \+(\d+)$/);
  if (match) {
    return `Lowest roll this round +${match[1]}`;
  }
  match = note.match(/^轮初底层 \+(\d+)$/);
  if (match) {
    return `Started the round at the bottom +${match[1]}`;
  }
  match = note.match(/^开始走格子前底层 \+(\d+)$/);
  if (match) {
    return `Started the move at the bottom +${match[1]}`;
  }
  match = note.match(/^末位起步 \+(\d+)$/);
  if (match) {
    return `Started the move in last place +${match[1]}`;
  }
  match = note.match(/^从(.+)接续$/);
  if (match) {
    return `Continues from ${translateKnownNames(match[1], language)}`;
  }
  match = note.match(/^初始已完成：(.+)$/);
  if (match) {
    return `Already finished at start: ${translateNameList(match[1], language)}`;
  }
  match = note.match(/^西格莉卡轮初标记 (.+)$/);
  if (match) {
    return `Siglica marked ${translateNameList(match[1], language)}`;
  }
  match = note.match(/^达到(\d+)格，传送到(.+)顶端$/);
  if (match) {
    return `Reached tile ${match[1]} and teleported to the top of ${translateKnownNames(match[2], language)}`;
  }
  match = note.match(/^超过(\d+)格，传送到(.+)顶端$/);
  if (match) {
    return `Moved beyond tile ${match[1]} and teleported to the top of ${translateKnownNames(match[2], language)}`;
  }
  match = note.match(/^经过(\d+)格，传送(.+)至自身格子$/);
  if (match) {
    return `Passed tile ${match[1]} and teleported ${translateNameList(match[2], language)} to its tile`;
  }
  match = note.match(/^(.+)位于顶端，本回合不行动，下回合最后行动$/);
  if (match) {
    return `${translateKnownNames(match[1], language)} is on top, skips this round, and acts last next round`;
  }
  match = note.match(/^(.+)位于底层，移动 \+(\d+)$/);
  if (match) {
    return `${translateKnownNames(match[1], language)} is at the bottom and moves +${match[2]}`;
  }
  match = note.match(/^(.+)下方有堆叠，下回合最后行动$/);
  if (match) {
    return `${translateKnownNames(match[1], language)} has a stack below and acts last next round`;
  }
  match = note.match(/^行动前已到(.+)后方，先传送回起终点$/);
  if (match) {
    return `Already behind ${translateKnownNames(match[1], language)}, so teleported back to start/finish before moving`;
  }
  match = note.match(/^走完后已到(.+)后方，结算回起终点$/);
  if (match) {
    return `Ended behind ${translateKnownNames(match[1], language)}, so returned to start/finish`;
  }
  match = note.match(/^最后一名(.+)在(\d+)，布大王与其分开，回合末传送回起终点$/);
  if (match) {
    return `Last-place ${translateKnownNames(match[1], language)} is at ${match[2]}; Budawang is separated and returns to start/finish at round end`;
  }
  match = note.match(/^最后一名(.+)与布大王同在(\d+)，布大王保留当前位置$/);
  if (match) {
    return `Last-place ${translateKnownNames(match[1], language)} shares tile ${match[2]} with Budawang; Budawang stays there`;
  }
  match = note.match(/^最后一名(.+)在(\d+)，布大王尚未到队尾，保留当前位置$/);
  if (match) {
    return `Last-place ${translateKnownNames(match[1], language)} is at ${match[2]}; Budawang has not reached the tail and stays there`;
  }

  return translateKnownNames(note, language);
}

export function translateError(message: string, language: Language): string {
  const copy = text[language];
  if (message.includes("请至少选择一个参赛团子")) {
    return copy.noRacersError;
  }
  if (message.includes("Worker 加载失败")) {
    return copy.workerLoadError;
  }
  if (message.includes("Worker 消息解析失败")) {
    return copy.workerMessageError;
  }
  return language === "zh" ? message : translateKnownNames(message, language);
}

export function translateKnownNames(value: string, language: Language): string {
  if (language === "zh") {
    return value;
  }
  return value.replace(zhNamePattern, (name) => racerNames[zhNameToId[name]]?.en ?? name);
}

function translateNameList(value: string, language: Language): string {
  return value
    .split("、")
    .map((item) => translateKnownNames(item.trim(), language))
    .filter(Boolean)
    .join(language === "zh" ? "、" : ", ");
}

export function cellTitle(
  displayPosition: string,
  mechanism: Pick<MechanismConfig, "id" | "name"> | null,
  effect: string | null,
  language: Language,
): string {
  if (!mechanism) {
    return displayPosition;
  }
  const mechanismName = mechanismDisplayName(mechanism.id, mechanism.name, language);
  const mechanismEffect = mechanismDisplayEffect(mechanism.id, effect, language);
  return language === "zh"
    ? `${displayPosition} ${mechanismName}：${mechanismEffect}`
    : `${displayPosition} ${mechanismName}: ${mechanismEffect}`;
}
