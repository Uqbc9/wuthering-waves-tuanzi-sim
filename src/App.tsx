import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  Copy,
  Pause,
  Play,
  RefreshCw,
  Shuffle,
  UsersRound,
} from "lucide-react";
import { defaultConfig } from "./config";
import {
  averageRank,
  percentage,
  racerById,
  skillLabel,
} from "./lib/sim";
import {
  BUDDAWANG_ID,
  type AggregateSimulationResult,
  type ManualLapMode,
  type ManualRaceSetup,
  type RacePlaybackData,
  type RoundSummary,
  type SimulationResult,
  type TimelineStep,
  type VisualUnit,
} from "./types";

type WorkerResponse =
  | { id: string; type: "progress"; completedRuns: number; totalRuns: number }
  | { id: string; type: "done"; result: SimulationResult; playback: RacePlaybackData }
  | { id: string; type: "error"; message: string };

const initialParams = new URLSearchParams(window.location.search);
const allRacers = defaultConfig.racers;
const allRacerIds = new Set(allRacers.map((racer) => racer.id));
const trackLength = Number(defaultConfig.assumptions.track_length);

function clampPosition(value: unknown): number {
  const numeric = Number(value);
  return Math.max(0, Math.min(trackLength, Number.isFinite(numeric) ? Math.trunc(numeric) : 0));
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function reconcileRacerOrder(order: string[], selected: string[]): string[] {
  const selectedSet = new Set(selected);
  const next = order.filter((racerId) => selectedSet.has(racerId));
  for (const racerId of selected) {
    if (!next.includes(racerId)) {
      next.push(racerId);
    }
  }
  return next;
}

function safeInitialRacerIds(): string[] {
  const requested = initialParams
    .get("racers")
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => allRacerIds.has(item));
  if (requested && requested.length > 0) {
    return [...new Set(requested)];
  }
  return allRacers.filter((racer) => racer.group === "A").map((racer) => racer.id);
}

function safeInitialPositions(): Record<string, number> {
  const positions = Object.fromEntries(allRacers.map((racer) => [racer.id, 0]));
  const raw = initialParams.get("positions");
  if (!raw) {
    return positions;
  }
  for (const item of raw.split(",")) {
    const [racerId, value] = item.split(":");
    if (allRacerIds.has(racerId)) {
      positions[racerId] = clampPosition(value);
    }
  }
  return positions;
}

function safeInitialLapMode(): ManualLapMode {
  return initialParams.get("lap") === "second" ? "second" : "first";
}

function safeInitialStackOrder(selected: string[]): string[] {
  const requested =
    initialParams
      .get("order")
      ?.split(",")
      .map((item) => item.trim())
      .filter((item) => allRacerIds.has(item)) ?? [];
  return reconcileRacerOrder(requested, selected);
}

function safeInitialRuns(): number {
  const rawRuns = initialParams.get("runs");
  if (!rawRuns) {
    return 20_000;
  }
  const requested = Number(rawRuns);
  if (!Number.isFinite(requested)) {
    return 20_000;
  }
  return Math.max(100, Math.min(300_000, Math.trunc(requested)));
}

function safeInitialSeed(): string {
  return initialParams.get("seed") ?? "20260510";
}

function requestId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default function App() {
  const [selectedRacerIds, setSelectedRacerIds] = useState(() => safeInitialRacerIds());
  const [positions, setPositions] = useState(() => safeInitialPositions());
  const [lapMode, setLapMode] = useState<ManualLapMode>(() => safeInitialLapMode());
  const [stackOrder, setStackOrder] = useState(() => safeInitialStackOrder(safeInitialRacerIds()));
  const [runs, setRuns] = useState(safeInitialRuns);
  const [seed, setSeed] = useState(safeInitialSeed);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [playback, setPlayback] = useState<RacePlaybackData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const activeRequestRef = useRef<string>("");
  const racers = useMemo(() => racerById(defaultConfig), []);
  const orderedSelectedRacers = useMemo(
    () => reconcileRacerOrder(stackOrder, selectedRacerIds),
    [selectedRacerIds, stackOrder],
  );
  const manualSetup = useMemo<ManualRaceSetup>(
    () => ({
      lap_mode: lapMode,
      racers: orderedSelectedRacers,
      positions: Object.fromEntries(
        orderedSelectedRacers.map((racerId) => [racerId, clampPosition(positions[racerId])]),
      ),
      stack_order: orderedSelectedRacers,
    }),
    [lapMode, orderedSelectedRacers, positions],
  );

  useEffect(() => {
    setStackOrder((current) => {
      const next = reconcileRacerOrder(current, selectedRacerIds);
      return arraysEqual(current, next) ? current : next;
    });
  }, [selectedRacerIds]);

  const writeShareParams = (url: URL) => {
    url.searchParams.delete("match");
    url.searchParams.set("runs", String(runs));
    url.searchParams.set("lap", lapMode);
    url.searchParams.set("racers", orderedSelectedRacers.join(","));
    url.searchParams.set(
      "positions",
      orderedSelectedRacers.map((racerId) => `${racerId}:${clampPosition(positions[racerId])}`).join(","),
    );
    url.searchParams.set("order", orderedSelectedRacers.join(","));
    if (seed.trim()) {
      url.searchParams.set("seed", seed.trim());
    } else {
      url.searchParams.delete("seed");
    }
  };

  const toggleRacer = (racerId: string) => {
    setSelectedRacerIds((current) => {
      if (current.includes(racerId)) {
        return current.length <= 1 ? current : current.filter((item) => item !== racerId);
      }
      return [...current, racerId];
    });
  };

  const updateRacerPosition = (racerId: string, value: unknown) => {
    setPositions((current) => ({
      ...current,
      [racerId]: clampPosition(value),
    }));
  };

  const moveStackOrder = (racerId: string, offset: number) => {
    setStackOrder((current) => {
      const next = reconcileRacerOrder(current, selectedRacerIds);
      const index = next.indexOf(racerId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= next.length) {
        return current;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const runSimulation = () => {
    if (orderedSelectedRacers.length === 0) {
      setError("请至少选择一个参赛团子");
      return;
    }
    workerRef.current?.terminate();
    const id = requestId();
    activeRequestRef.current = id;
    const worker = new Worker(new URL("./workers/simWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    setIsRunning(true);
    setProgress(0);
    setError(null);
    setCopied(false);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.id !== activeRequestRef.current) {
        return;
      }
      if (message.type === "progress") {
        setProgress(message.completedRuns / message.totalRuns);
      } else if (message.type === "done") {
        setResult(message.result);
        setPlayback(message.playback);
        setProgress(1);
        setIsRunning(false);
        worker.terminate();
        workerRef.current = null;
        const url = new URL(window.location.href);
        writeShareParams(url);
        window.history.replaceState(null, "", url);
      } else {
        setError(message.message);
        setIsRunning(false);
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.onerror = (event) => {
      if (id !== activeRequestRef.current) {
        return;
      }
      setError(event.message || "Worker 加载失败");
      setIsRunning(false);
      worker.terminate();
      workerRef.current = null;
    };
    worker.onmessageerror = () => {
      if (id !== activeRequestRef.current) {
        return;
      }
      setError("Worker 消息解析失败");
      setIsRunning(false);
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({
      id,
      runs,
      seed: seed.trim() ? Number(seed) : null,
      traceSamples: 8,
      manualSetup,
    });
  };

  useEffect(() => {
    runSimulation();
    return () => workerRef.current?.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareCurrent = async () => {
    const url = new URL(window.location.href);
    writeShareParams(url);
    const text = url.toString();
    if (navigator.share) {
      await navigator.share({ title: "小团快跑手动模拟器", url: text });
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Wuthering Waves Tuanzi Championship</p>
          <h1>小团快跑手动模拟器</h1>
        </div>
      </header>

      <section className="app-grid">
        <aside className="panel controls-panel">
          <div className="section-title">
            <UsersRound size={18} />
            <h2>手动设定</h2>
          </div>

          <div className="mode-toggle" aria-label="圈数模式">
            <button
              type="button"
              className={lapMode === "first" ? "active" : ""}
              onClick={() => setLapMode("first")}
            >
              第一圈
            </button>
            <button
              type="button"
              className={lapMode === "second" ? "active" : ""}
              onClick={() => setLapMode("second")}
            >
              第二圈
            </button>
          </div>

          <div className="racer-picker" aria-label="参赛团子">
            {allRacers.map((racer) => {
              const checked = selectedRacerIds.includes(racer.id);
              const skillText = skillLabel(racer.skill);
              return (
                <label
                  key={racer.id}
                  className={checked ? "racer-toggle active" : "racer-toggle"}
                  title={skillText}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={checked && selectedRacerIds.length <= 1}
                    onChange={() => toggleRacer(racer.id)}
                  />
                  <span title={skillText}>{racer.name}</span>
                  {racer.group ? <small>{racer.group}</small> : null}
                </label>
              );
            })}
          </div>

          <div className="position-guide">
            <strong>站位 / 同格顺序</strong>
            <span>同一格内列表越靠上越靠前，可用右侧箭头调整；首轮全员在起点时暂不计算前后。</span>
          </div>

          <div className="position-list" aria-label="站位和同格顺序">
            {orderedSelectedRacers.map((racerId, index) => {
              const racer = racers[racerId];
              const skillText = skillLabel(racer?.skill);
              return (
                <div key={racerId} className="position-row">
                  <span className="position-name" title={skillText}>
                    {racer?.name ?? racerId}
                  </span>
                  <input
                    aria-label={`${racer?.name ?? racerId} 站位`}
                    type="number"
                    min={0}
                    max={trackLength}
                    step={1}
                    value={positions[racerId] ?? 0}
                    onChange={(event) => updateRacerPosition(racerId, event.target.value)}
                  />
                  <div className="position-actions">
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => moveStackOrder(racerId, -1)}
                      disabled={index === 0}
                      title="同格顺序上移"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => moveStackOrder(racerId, 1)}
                      disabled={index === orderedSelectedRacers.length - 1}
                      title="同格顺序下移"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="field-grid">
            <label className="field">
              <span>模拟次数</span>
              <input
                type="number"
                min={100}
                max={300000}
                step={1000}
                value={runs}
                onChange={(event) => setRuns(Math.max(1, Number(event.target.value)))}
              />
            </label>
            <label className="field">
              <span>随机种子</span>
              <input value={seed} onChange={(event) => setSeed(event.target.value)} />
            </label>
          </div>

          <div className="button-row">
            <button className="primary-button" onClick={runSimulation} disabled={isRunning}>
              {isRunning ? <RefreshCw size={18} className="spin" /> : <Calculator size={18} />}
              {isRunning ? "计算中" : "开始模拟"}
            </button>
            <button className="icon-button" onClick={shareCurrent} title="分享当前参数">
              <Copy size={18} />
            </button>
          </div>

          <div className="progress-wrap" aria-live="polite">
            <div className="progress-track">
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span>
              {isRunning
                ? `${Math.round(progress * 100)}%`
                : copied
                  ? "链接已复制"
                  : `${orderedSelectedRacers.length}人 · ${lapMode === "second" ? "第二圈" : "第一圈"}`}
            </span>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </aside>

        <section className="content-stack">
          <ResultPanel result={result} racers={racers} />
          <RacePanel playback={playback} racers={racers} />
        </section>
      </section>
    </main>
  );
}

function ResultPanel({
  result,
  racers,
}: {
  result: SimulationResult | null;
  racers: ReturnType<typeof racerById>;
}) {
  if (!result) {
    return (
      <section className="panel result-panel skeleton">
        <div className="section-title">
          <Calculator size={18} />
          <h2>模拟结果</h2>
        </div>
      </section>
    );
  }

  const rows = Object.entries(result.rank_counts)
    .map(([racerId, counts]) => ({
      racerId,
      name: racers[racerId]?.name ?? racerId,
      skill: skillLabel(racers[racerId]?.skill),
      counts,
      avgRank: averageRank(counts, result.runs),
    }))
    .sort((left, right) => left.avgRank - right.avgRank);

  return (
    <section className="panel result-panel">
      <div className="panel-heading">
        <div className="section-title">
          <Calculator size={18} />
          <h2>模拟结果</h2>
          <span className="panel-subtitle">{result.match_name}</span>
        </div>
        <div className="run-chip">{result.runs.toLocaleString("zh-CN")} runs</div>
      </div>

      <div className="result-table" role="table">
        <div className="result-row result-head" role="row">
          <span>团子</span>
          {result.type === "aggregate" ? (
            <>
              <span>晋级率</span>
              <span>小组第一</span>
              <span>平均积分</span>
            </>
          ) : (
            <>
              <span>冠军率</span>
              <span>Top2</span>
              <span>Top4</span>
            </>
          )}
          <span>平均名次</span>
        </div>
        {rows.map((row) => {
          if (result.type === "aggregate") {
            const aggregate = result as AggregateSimulationResult;
            const qualify = aggregate.qualify_counts[row.racerId] ?? 0;
            const champion = row.counts["1"] ?? 0;
            const avgPoints = (aggregate.points_total[row.racerId] ?? 0) / aggregate.runs;
            return (
              <ResultRow
                key={row.racerId}
                name={row.name}
                skill={row.skill}
                primaryValue={qualify}
                primaryRuns={aggregate.runs}
                values={[
                  { label: "晋级率", value: percentage(qualify, aggregate.runs) },
                  { label: "小组第一", value: percentage(champion, aggregate.runs) },
                  { label: "平均积分", value: avgPoints.toFixed(3) },
                  { label: "平均名次", value: row.avgRank.toFixed(3) },
                ]}
              />
            );
          }

          const champion = row.counts["1"] ?? 0;
          const top2 = sumTop(row.counts, 2);
          const top4 = sumTop(row.counts, 4);
          return (
            <ResultRow
              key={row.racerId}
              name={row.name}
              skill={row.skill}
              primaryValue={champion}
              primaryRuns={result.runs}
              values={[
                { label: "冠军率", value: percentage(champion, result.runs) },
                { label: "Top2", value: percentage(top2, result.runs) },
                { label: "Top4", value: percentage(top4, result.runs) },
                { label: "平均名次", value: row.avgRank.toFixed(3) },
              ]}
            />
          );
        })}
      </div>
    </section>
  );
}

function ResultRow({
  name,
  skill,
  values,
  primaryValue,
  primaryRuns,
}: {
  name: string;
  skill: string;
  values: Array<{ label: string; value: string }>;
  primaryValue: number;
  primaryRuns: number;
}) {
  const width = Math.max(3, Math.min(100, (primaryValue / primaryRuns) * 100));
  return (
    <div className="result-row" role="row">
      <span className="racer-cell" title={skill}>
        {name}
        <i style={{ width: `${width}%` }} />
      </span>
      {values.map((value, index) => (
        <span key={`${name}-${index}`} className="metric-cell">
          <b>{value.label}</b>
          {value.value}
        </span>
      ))}
    </div>
  );
}

function UnitAvatar({ unit, className = "" }: { unit?: VisualUnit; className?: string }) {
  const classes = ["unit-avatar", className].filter(Boolean).join(" ");
  if (unit?.icon) {
    return <img className={classes} src={unit.icon} alt="" draggable={false} />;
  }
  return <i className={classes} style={{ background: unit?.color ?? "#8d9a94" }} />;
}

function RacePanel({
  playback,
  racers,
}: {
  playback: RacePlaybackData | null;
  racers: ReturnType<typeof racerById>;
}) {
  const [raceIndex, setRaceIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setRaceIndex(0);
    setStepIndex(0);
    setPlaying(false);
  }, [playback]);

  const race = playback?.races[raceIndex] ?? null;
  const steps = race?.timeline ?? [];
  const step = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))] ?? null;

  useEffect(() => {
    if (!playing || steps.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setStepIndex((current) => {
        if (current >= steps.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [playing, steps.length]);

  if (!playback || !race || !step) {
    return (
      <section className="panel playback-panel skeleton">
        <div className="section-title">
          <Play size={18} />
          <h2>赛局回放</h2>
        </div>
      </section>
    );
  }

  const unitMap = Object.fromEntries(playback.units.map((unit) => [unit.id, unit]));
  const rankedUnits = step.ranking.map((racerId) => ({
    id: racerId,
    unit: unitMap[racerId],
    name: unitMap[racerId]?.name ?? racers[racerId]?.name ?? racerId,
  }));
  const rankingText = rankedUnits.map((item) => item.name).join(" / ");
  const notes = step.notes ?? [];

  return (
    <section className="panel playback-panel">
      <div className="panel-heading">
        <div className="section-title">
          <Play size={18} />
          <h2>赛局回放</h2>
        </div>
        <div className="run-chip">seed {race.seed ?? "random"}</div>
      </div>

      <div className="playback-grid">
        <TrackBoard playback={playback} step={step} unitMap={unitMap} />

        <div className="timeline-panel">
          <h3>{playback.title}</h3>
          <p className="step-label" title={step.label}>{step.label}</p>
          <div className="timeline-controls">
            <button className="icon-button" onClick={() => setStepIndex(0)} title="回到开赛">
              <ChevronsLeft size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              title="上一步"
            >
              <ChevronLeft size={18} />
            </button>
            <button className="icon-button strong" onClick={() => setPlaying((value) => !value)} title="播放">
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              className="icon-button"
              onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
              title="下一步"
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => {
                setRaceIndex((current) => (current + 1) % playback.races.length);
                setStepIndex(0);
                setPlaying(false);
              }}
              title="切换样本"
            >
              <Shuffle size={18} />
            </button>
          </div>
          <div className="step-range">
            <input
              type="range"
              min={0}
              max={Math.max(0, steps.length - 1)}
              value={stepIndex}
              onChange={(event) => setStepIndex(Number(event.target.value))}
            />
            <span>{stepIndex + 1} / {steps.length}</span>
          </div>
          <div className="round-stats">
            <div>
              <span>轮数</span>
              <strong>{race.rounds}</strong>
            </div>
            <div>
              <span>当前事件</span>
              <strong title={step.event_type}>{step.event_type}</strong>
            </div>
          </div>
          <div className="ranking-box">
            <span>排名</span>
            <div className="ranking-list" aria-label={rankingText}>
              {rankedUnits.map(({ id, unit, name }, index) => (
                <span key={`${id}-${index}`} className="ranking-chip" title={unit?.skill ?? name}>
                  <b>{index + 1}</b>
                  <UnitAvatar unit={unit} />
                  <em>{name}</em>
                </span>
              ))}
            </div>
          </div>
          <RoundReadout
            currentActor={typeof step.actor === "string" ? step.actor : undefined}
            currentRound={step.round_no ?? (step.event_type === "finish" ? race.rounds : undefined)}
            rounds={race.round_summaries}
            unitMap={unitMap}
          />
          <div className={notes.length > 0 ? "notes-box" : "notes-box empty"} aria-live="polite">
            {notes.length > 0 ? (
              notes.map((note) => (
                <span key={note} title={note}>{note}</span>
              ))
            ) : (
              <span>无额外说明</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrackBoard({
  playback,
  step,
  unitMap,
}: {
  playback: RacePlaybackData;
  step: TimelineStep;
  unitMap: Record<string, VisualUnit>;
}) {
  const cells = playback.track.cells.filter((cell) => cell.visible);
  const cellByPosition = Object.fromEntries(cells.map((cell) => [cell.position, cell]));
  const stackEntries: Array<{
    rawPosition: number;
    visualPosition: number;
    cell: (typeof cells)[number];
    units: VisualUnit[];
  }> = [];
  for (const [rawPosition, stack] of Object.entries(step.stacks)) {
    const position = Number(rawPosition);
    const visualPosition = visualTrackPosition(position, playback.track.finish_position);
    const cell = cellByPosition[visualPosition] ?? cellByPosition[0];
    const units = stack.map((unitId) => unitMap[unitId]).filter((unit): unit is VisualUnit => Boolean(unit));
    if (cell && units.length > 0) {
      stackEntries.push({
        rawPosition: position,
        visualPosition,
        cell,
        units,
      });
    }
  }
  const laneTotals = stackEntries.reduce((totals, entry) => {
    totals.set(entry.visualPosition, (totals.get(entry.visualPosition) ?? 0) + 1);
    return totals;
  }, new Map<number, number>());
  const laneIndexes = new Map<number, number>();
  const stackGuides: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = [];
  const tokens = stackEntries.flatMap((entry) => {
    const laneIndex = laneIndexes.get(entry.visualPosition) ?? 0;
    laneIndexes.set(entry.visualPosition, laneIndex + 1);
    const laneTotal = laneTotals.get(entry.visualPosition) ?? 1;
    const { normalX, normalY } = stackVector(entry.cell, playback.track);
    const tangentX = -normalY;
    const tangentY = normalX;
    const laneOffset = (laneIndex - (laneTotal - 1) / 2) * 0.32;
    const count = Math.max(1, entry.units.length);
    const radius = count > 3 ? 0.35 : 0.39;
    const startOffset = count > 1 ? 0.84 : 0.72;
    const stepOffset = count > 1 ? Math.min(radius * 1.38, 0.52) : 0;

    if (count > 1) {
      stackGuides.push({
        key: `${entry.rawPosition}-${entry.units.map((unit) => unit.id).join("-")}`,
        x1: entry.cell.x + normalX * 0.38 + tangentX * laneOffset,
        y1: entry.cell.y + normalY * 0.38 + tangentY * laneOffset,
        x2: entry.cell.x + normalX * (startOffset + (count - 1) * stepOffset) + tangentX * laneOffset,
        y2: entry.cell.y + normalY * (startOffset + (count - 1) * stepOffset) + tangentY * laneOffset,
      });
    }

    return entry.units.map((unit, index) => {
      const offset = startOffset + index * stepOffset;
      return {
        unit,
        x: entry.cell.x + normalX * offset + tangentX * laneOffset,
        y: entry.cell.y + normalY * offset + tangentY * laneOffset,
        radius,
        order: index,
        count,
        rawPosition: entry.rawPosition,
        actor: step.actor === unit.id,
        mover: Array.isArray(step.movers) && step.movers.includes(unit.id),
        finished: step.finished.includes(unit.id),
      };
    });
  });

  return (
    <div className="track-wrap">
      <svg
        className="track-board"
        viewBox="0.35 0.35 12.3 12.3"
        role="img"
        aria-label="赛道回放"
      >
        <path
          className="track-loop"
          d={cells
            .map((cell, index) => `${index === 0 ? "M" : "L"} ${cell.x} ${cell.y}`)
            .join(" ")}
        />
        {cells.map((cell) => (
          <g key={cell.position} className={`track-cell ${cell.mechanism_id ?? "normal"}`}>
            <circle cx={cell.x} cy={cell.y} r="0.5" />
            <text
              className={cell.mechanism_id ? "mechanism-label" : undefined}
              x={cell.x}
              y={cell.y + 0.05}
            >
              {cell.label}
            </text>
            <title>
              {cell.mechanism_name
                ? `${cell.display_position} ${cell.mechanism_name}：${cell.mechanism_effect}`
                : cell.display_position}
            </title>
          </g>
        ))}
        {stackGuides.map((guide) => (
          <line
            key={guide.key}
            className="stack-guide"
            x1={guide.x1}
            y1={guide.y1}
            x2={guide.x2}
            y2={guide.y2}
          />
        ))}
        <defs>
          {tokens.map(({ unit, x, y, radius, order, rawPosition }) => {
            if (!unit.icon) {
              return null;
            }
            const tokenKey = `${unit.id}-${rawPosition}-${order}`;
            return (
              <clipPath key={tokenKey} id={`token-clip-${tokenKey}`} clipPathUnits="userSpaceOnUse">
                <circle cx={x} cy={y} r={radius * 0.82} />
              </clipPath>
            );
          })}
        </defs>
        {tokens.map(({ unit, x, y, radius, order, count, rawPosition, actor, mover, finished }) => {
          const tokenKey = `${unit.id}-${rawPosition}-${order}`;
          const avatarRadius = radius * 0.82;
          return (
            <g
              key={tokenKey}
              className={[
                "token",
                unit.id === BUDDAWANG_ID ? "special" : "",
                actor ? "actor" : "",
                mover ? "mover" : "",
                finished ? "finished" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <circle cx={x} cy={y} r={radius} fill={unit.color} />
              {unit.icon ? (
                <image
                  className="token-avatar-svg"
                  href={unit.icon}
                  x={x - avatarRadius}
                  y={y - avatarRadius}
                  width={avatarRadius * 2}
                  height={avatarRadius * 2}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#token-clip-${tokenKey})`}
                />
              ) : (
                <text x={x} y={y + radius * 0.16}>{unit.short}</text>
              )}
              <title>
                {unit.name} · 堆叠 {order + 1}/{count} · {unit.skill}
              </title>
            </g>
          );
        })}
      </svg>
      <div className="mechanism-legend" aria-label="赛道机关说明">
        {playback.track.mechanisms.map((mechanism) => (
          <span key={mechanism.id} className={`mechanism-chip ${mechanism.id}`}>
            <b>{mechanism.effect}</b>
            <strong>{mechanism.name}</strong>
            <em>{mechanism.positions.join("、")}格</em>
          </span>
        ))}
      </div>
      <div className="unit-legend">
        {playback.units.map((unit) => (
          <span key={unit.id} title={unit.skill}>
            <UnitAvatar unit={unit} />
            <strong>{unit.name}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function RoundReadout({
  currentActor,
  currentRound,
  rounds,
  unitMap,
}: {
  currentActor?: string;
  currentRound?: number;
  rounds: RoundSummary[];
  unitMap: Record<string, VisualUnit>;
}) {
  const round = rounds.find((item) => item.round_no === currentRound) ?? rounds[0] ?? null;
  if (!round) {
    return null;
  }
  const rollsByActor = new Map(round.rolls.map((roll) => [roll.actor, roll]));
  const highlightedActor = currentActor ?? round.first_actor ?? undefined;

  return (
    <div className="round-readout">
      <div className="round-readout-title">
        <span>第 {round.round_no} 轮</span>
        <small>{round.roll_count} 次</small>
      </div>
      <div className="current-round-list" aria-label={`第 ${round.round_no} 轮行动顺序和骰点`}>
        {round.action_order.map((unitId, index) => {
          const unit = unitMap[unitId];
          const roll = rollsByActor.get(unitId);
          const rollText = roll
            ? `${roll.roll}${typeof roll.steps === "number" && roll.steps !== roll.roll ? ` -> ${roll.steps}` : ""}`
            : "-";
          return (
            <div
              key={`${round.round_no}-${unitId}-${index}`}
              className={unitId === highlightedActor ? "current-round-row active" : "current-round-row"}
              title={unit?.skill}
            >
              <span className="current-order">
                <UnitAvatar unit={unit} />
                <b>{index + 1}.</b>
                <strong>{unit?.name ?? unitId}</strong>
              </span>
              <span className="current-roll">{rollText}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function visualTrackPosition(position: number, finishPosition: number): number {
  return position === finishPosition ? 0 : position;
}

function stackVector(
  cell: RacePlaybackData["track"]["cells"][number],
  track: RacePlaybackData["track"],
): { normalX: number; normalY: number } {
  const trackCenterX = (track.columns - 1) / 2;
  const trackCenterY = (track.rows - 1) / 2;
  const inwardX = trackCenterX - cell.x;
  const inwardY = trackCenterY - cell.y;
  const length = Math.max(0.001, Math.hypot(inwardX, inwardY));
  return {
    normalX: inwardX / length,
    normalY: inwardY / length,
  };
}

function sumTop(counts: Record<string, number>, top: number): number {
  return Object.entries(counts).reduce(
    (total, [rank, count]) => total + (Number(rank) <= top ? count : 0),
    0,
  );
}
