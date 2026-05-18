import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Copy,
  Github,
  Languages,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import FilterEvaluationPanel from "./components/FilterEvaluationPanel";
import ResultPanel from "./components/ResultPanel";
import RacePanel from "./components/RacePanel";
import { defaultConfig } from "./config";
import {
  formatGroupLabel,
  formatRacerCount,
  isLanguage,
  languageOptions,
  localeByLanguage,
  racerDisplayName,
  skillDisplayText,
  text,
  translateError,
  type Language,
} from "./i18n";
import {
  DEFAULT_FIRST_FINISH_TAIL_THRESHOLD,
  parseFirstFinishTailThreshold,
} from "./lib/filterEvaluation";
import {
  DEFAULT_SIMULATION_RUNS,
  SIMULATION_RUN_STEP,
  clampSimulationRuns,
} from "./lib/runLimits";
import { getFirstLapStartPosition, racerById } from "./lib/sim";
import {
  type ManualLapMode,
  type ManualRaceSetup,
  type RacePlaybackData,
  type SimulationResult,
} from "./types";

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

type PlaybackRequestConfig = {
  manualSetup: ManualRaceSetup;
  seed: number | null;
  traceSamples: number;
};

const TRACE_SAMPLES = 8;

const initialParams = new URLSearchParams(window.location.search);
const allRacers = defaultConfig.racers;
const allRacerIds = new Set(allRacers.map((racer) => racer.id));
const trackLength = Number(defaultConfig.assumptions.track_length);
const firstLapStartPosition = getFirstLapStartPosition(defaultConfig);
const GITHUB_REPOSITORY_URL = "https://github.com/Uqbc9/wuthering-waves-tuanzi-sim";

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
  return clampSimulationRuns(initialParams.get("runs"), DEFAULT_SIMULATION_RUNS);
}

function safeInitialSeed(): string {
  return initialParams.get("seed") ?? "20260510";
}

function safeInitialLanguage(): Language {
  const requested = initialParams.get("lang");
  if (isLanguage(requested)) {
    return requested;
  }
  const stored = window.localStorage.getItem("tuanzi-language");
  return isLanguage(stored) ? stored : "en";
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
  const [language, setLanguage] = useState<Language>(() => safeInitialLanguage());
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [playback, setPlayback] = useState<RacePlaybackData | null>(null);
  const [filteredPlayback, setFilteredPlayback] = useState<RacePlaybackData | null>(null);
  const [filterTailThresholdInput, setFilterTailThresholdInput] = useState(
    String(DEFAULT_FIRST_FINISH_TAIL_THRESHOLD),
  );
  const [filteredPlaybackThreshold, setFilteredPlaybackThreshold] = useState<number | null>(null);
  const [showFilteredPlayback, setShowFilteredPlayback] = useState(false);
  const [isFilteringPlayback, setIsFilteringPlayback] = useState(false);
  const [lastPlaybackRequest, setLastPlaybackRequest] = useState<PlaybackRequestConfig | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const filteredPlaybackWorkerRef = useRef<Worker | null>(null);
  const activeRequestRef = useRef<string>("");
  const activeFilteredPlaybackRequestRef = useRef<string>("");
  const copy = text[language];
  const filterTailThreshold = parseFirstFinishTailThreshold(filterTailThresholdInput);
  const racers = useMemo(() => racerById(defaultConfig), []);
  const firstLapLocked = lapMode === "first";
  const canonicalSelectedRacers = useMemo(
    () => allRacers.filter((racer) => selectedRacerIds.includes(racer.id)).map((racer) => racer.id),
    [selectedRacerIds],
  );
  const orderedSelectedRacers = useMemo(
    () => (firstLapLocked ? canonicalSelectedRacers : reconcileRacerOrder(stackOrder, selectedRacerIds)),
    [canonicalSelectedRacers, firstLapLocked, selectedRacerIds, stackOrder],
  );
  const selectedGroupLabel = useMemo(() => {
    const groups = [
      ...new Set(
        selectedRacerIds
          .map((racerId) => racers[racerId]?.group)
          .filter((group): group is string => Boolean(group)),
      ),
    ];
    return formatGroupLabel(groups, language);
  }, [language, racers, selectedRacerIds]);
  const manualSetup = useMemo<ManualRaceSetup>(
    () => ({
      lap_mode: lapMode,
      racers: orderedSelectedRacers,
      positions: Object.fromEntries(
        orderedSelectedRacers.map((racerId) => [
          racerId,
          firstLapLocked ? firstLapStartPosition : clampPosition(positions[racerId]),
        ]),
      ),
      stack_order: orderedSelectedRacers,
    }),
    [firstLapLocked, lapMode, orderedSelectedRacers, positions],
  );

  useEffect(() => {
    setStackOrder((current) => {
      const next = reconcileRacerOrder(current, selectedRacerIds);
      return arraysEqual(current, next) ? current : next;
    });
  }, [selectedRacerIds]);

  useEffect(() => {
    document.documentElement.lang = localeByLanguage[language];
    document.title = copy.documentTitle;
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute("content", copy.documentDescription);
    window.localStorage.setItem("tuanzi-language", language);
  }, [copy.documentDescription, copy.documentTitle, language]);

  const writeShareParams = (url: URL) => {
    url.searchParams.delete("match");
    url.searchParams.set("lang", language);
    url.searchParams.set("runs", String(clampSimulationRuns(runs)));
    url.searchParams.set("lap", lapMode);
    url.searchParams.set("racers", orderedSelectedRacers.join(","));
    url.searchParams.set(
      "positions",
      orderedSelectedRacers
        .map((racerId) =>
          `${racerId}:${firstLapLocked ? firstLapStartPosition : clampPosition(positions[racerId])}`,
        )
        .join(","),
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

  const updateFilterTailThreshold = (value: string) => {
    filteredPlaybackWorkerRef.current?.terminate();
    filteredPlaybackWorkerRef.current = null;
    activeFilteredPlaybackRequestRef.current = "";
    setFilterTailThresholdInput(value);
    setFilteredPlaybackThreshold(null);
    setFilteredPlayback(null);
    setIsFilteringPlayback(false);
  };

  const updateShowFilteredPlayback = (value: boolean) => {
    setShowFilteredPlayback(value);
    if (!value) {
      filteredPlaybackWorkerRef.current?.terminate();
      filteredPlaybackWorkerRef.current = null;
      activeFilteredPlaybackRequestRef.current = "";
      setIsFilteringPlayback(false);
    }
  };

  const runSimulation = () => {
    if (orderedSelectedRacers.length === 0) {
      setError("请至少选择一个参赛团子");
      return;
    }
    const safeRuns = clampSimulationRuns(runs);
    if (safeRuns !== runs) {
      setRuns(safeRuns);
    }
    workerRef.current?.terminate();
    filteredPlaybackWorkerRef.current?.terminate();
    const id = requestId();
    activeRequestRef.current = id;
    const requestSeed = seed.trim() ? Number(seed) : null;
    const playbackRequest = {
      manualSetup,
      seed: requestSeed,
      traceSamples: TRACE_SAMPLES,
    };
    const worker = new Worker(new URL("./workers/simWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    setIsRunning(true);
    setProgress(0);
    setError(null);
    setCopied(false);
    setFilteredPlayback(null);
    setFilteredPlaybackThreshold(null);
    setIsFilteringPlayback(false);

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
        setFilteredPlayback(message.filteredPlayback);
        setFilteredPlaybackThreshold(filterTailThreshold);
        setLastPlaybackRequest(playbackRequest);
        setProgress(1);
        setIsRunning(false);
        worker.terminate();
        workerRef.current = null;
        const url = new URL(window.location.href);
        writeShareParams(url);
        window.history.replaceState(null, "", url);
      } else if (message.type === "error") {
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
      runs: safeRuns,
      seed: requestSeed,
      traceSamples: TRACE_SAMPLES,
      filterTailThreshold,
      manualSetup,
    });
  };

  useEffect(() => {
    runSimulation();
    return () => {
      workerRef.current?.terminate();
      filteredPlaybackWorkerRef.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      !showFilteredPlayback ||
      !lastPlaybackRequest ||
      !result ||
      result.type !== "single_race" ||
      isRunning ||
      isFilteringPlayback ||
      filteredPlaybackThreshold === filterTailThreshold
    ) {
      return;
    }

    filteredPlaybackWorkerRef.current?.terminate();
    const id = requestId();
    const threshold = filterTailThreshold;
    activeFilteredPlaybackRequestRef.current = id;
    const worker = new Worker(new URL("./workers/simWorker.ts", import.meta.url), {
      type: "module",
    });
    filteredPlaybackWorkerRef.current = worker;
    setIsFilteringPlayback(true);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.id !== activeFilteredPlaybackRequestRef.current) {
        return;
      }
      if (message.type === "filtered_playback_done") {
        setFilteredPlayback(message.filteredPlayback);
        setFilteredPlaybackThreshold(threshold);
        setIsFilteringPlayback(false);
        worker.terminate();
        filteredPlaybackWorkerRef.current = null;
      } else if (message.type === "error") {
        setError(message.message);
        setFilteredPlayback(null);
        setFilteredPlaybackThreshold(threshold);
        setIsFilteringPlayback(false);
        worker.terminate();
        filteredPlaybackWorkerRef.current = null;
      }
    };
    worker.onerror = (event) => {
      if (id !== activeFilteredPlaybackRequestRef.current) {
        return;
      }
      setError(event.message || "Worker 加载失败");
      setFilteredPlayback(null);
      setFilteredPlaybackThreshold(threshold);
      setIsFilteringPlayback(false);
      worker.terminate();
      filteredPlaybackWorkerRef.current = null;
    };
    worker.onmessageerror = () => {
      if (id !== activeFilteredPlaybackRequestRef.current) {
        return;
      }
      setError("Worker 消息解析失败");
      setFilteredPlayback(null);
      setFilteredPlaybackThreshold(threshold);
      setIsFilteringPlayback(false);
      worker.terminate();
      filteredPlaybackWorkerRef.current = null;
    };

    worker.postMessage({
      id,
      type: "filtered_playback",
      ...lastPlaybackRequest,
      filterTailThreshold: threshold,
    });
  }, [
    filterTailThreshold,
    filteredPlaybackThreshold,
    isFilteringPlayback,
    isRunning,
    lastPlaybackRequest,
    result,
    showFilteredPlayback,
  ]);

  const shareCurrent = async () => {
    const url = new URL(window.location.href);
    writeShareParams(url);
    const text = url.toString();
    if (navigator.share) {
      await navigator.share({ title: copy.documentTitle, url: text });
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const filteredPlaybackPending =
    showFilteredPlayback &&
    result?.type === "single_race" &&
    filteredPlaybackThreshold !== filterTailThreshold;
  const filteredPlaybackStatus = showFilteredPlayback
    ? isFilteringPlayback || filteredPlaybackPending
      ? copy.filteredPlaybackLoading
      : filteredPlayback
        ? copy.filteredPlaybackReady
        : copy.filteredPlaybackEmpty
    : null;
  const displayedPlayback = showFilteredPlayback ? filteredPlayback : playback;
  const playbackEmptyMessage = showFilteredPlayback
    ? isFilteringPlayback || filteredPlaybackPending
      ? copy.filteredPlaybackLoading
      : copy.filteredPlaybackEmpty
    : null;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">{copy.brand}</p>
          <h1>{copy.title}</h1>
        </div>
        <div className="topbar-actions">
          <div className="topbar-meta" aria-label={copy.currentConfig}>
            <span>
              <b>{selectedGroupLabel}</b>
              {copy.participating}
            </span>
            <span>
              <b>{orderedSelectedRacers.length}</b>
              {copy.racersSuffix}
            </span>
            <span>
              {trackLength} {copy.trackSuffix}
            </span>
          </div>
          <a
            className="icon-button github-link"
            href={GITHUB_REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            title={copy.githubRepository}
            aria-label={copy.githubRepository}
          >
            <Github size={18} aria-hidden="true" />
          </a>
          <div className="language-switch" aria-label={copy.languageSwitch}>
            <Languages size={16} aria-hidden="true" />
            {languageOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={language === option.value ? "active" : ""}
                aria-pressed={language === option.value}
                aria-label={option.title}
                onClick={() => setLanguage(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="app-grid">
        <aside className="panel controls-panel">
          <div className="section-title">
            <UsersRound size={18} />
            <h2>{copy.manualSetup}</h2>
          </div>

          <div className="mode-toggle" aria-label={copy.lapMode}>
            <button
              type="button"
              className={lapMode === "first" ? "active" : ""}
              aria-pressed={lapMode === "first"}
              onClick={() => setLapMode("first")}
            >
              {copy.firstLap}
            </button>
            <button
              type="button"
              className={lapMode === "second" ? "active" : ""}
              aria-pressed={lapMode === "second"}
              onClick={() => setLapMode("second")}
            >
              {copy.secondLap}
            </button>
          </div>

          <div className="racer-picker" aria-label={copy.racerPicker}>
            {allRacers.map((racer) => {
              const checked = selectedRacerIds.includes(racer.id);
              const skillText = skillDisplayText(racer.skill, language);
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
                  <span title={skillText}>{racerDisplayName(racer, language)}</span>
                  {racer.group ? <small>{racer.group}</small> : null}
                </label>
              );
            })}
          </div>

          <div className="position-guide">
            <strong>{copy.positionGuideTitle}</strong>
            <span>{firstLapLocked ? copy.positionGuideFirstText : copy.positionGuideText}</span>
          </div>

          <div className="position-list" aria-label={copy.positionsList}>
            {orderedSelectedRacers.map((racerId, index) => {
              const racer = racers[racerId];
              const racerName = racerDisplayName(racer ?? racerId, language);
              const skillText = skillDisplayText(racer?.skill, language);
              return (
                <div key={racerId} className={firstLapLocked ? "position-row locked" : "position-row"}>
                  <span className="position-name" title={skillText}>
                    {racerName}
                  </span>
                  <input
                    aria-label={`${racerName} ${copy.positionAria}`}
                    type="number"
                    min={0}
                    max={trackLength}
                    step={1}
                    value={firstLapLocked ? firstLapStartPosition : (positions[racerId] ?? 0)}
                    disabled={firstLapLocked}
                    onChange={(event) => updateRacerPosition(racerId, event.target.value)}
                  />
                  <div className="position-actions">
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => moveStackOrder(racerId, -1)}
                      disabled={firstLapLocked || index === 0}
                      title={copy.moveUp}
                      aria-label={`${racerName} ${copy.moveUp}`}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => moveStackOrder(racerId, 1)}
                      disabled={firstLapLocked || index === orderedSelectedRacers.length - 1}
                      title={copy.moveDown}
                      aria-label={`${racerName} ${copy.moveDown}`}
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
              <span>{copy.runs}</span>
              <input
                type="number"
                step={SIMULATION_RUN_STEP}
                value={runs}
                onChange={(event) => setRuns(clampSimulationRuns(event.target.value, runs))}
              />
            </label>
            <label className="field">
              <span>{copy.seed}</span>
              <input value={seed} onChange={(event) => setSeed(event.target.value)} />
            </label>
          </div>

          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={runSimulation}
              disabled={isRunning}
              aria-busy={isRunning}
            >
              {isRunning ? <RefreshCw size={18} className="spin" /> : <Calculator size={18} />}
              {isRunning ? copy.calculating : copy.start}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={shareCurrent}
              title={copy.shareParams}
              aria-label={copy.shareParams}
            >
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
                  ? copy.copied
                  : `${formatRacerCount(orderedSelectedRacers.length, language)} · ${
                      lapMode === "second" ? copy.secondLap : copy.firstLap
                    }`}
            </span>
          </div>

          {error ? <p className="error-text">{translateError(error, language)}</p> : null}
        </aside>

        <section className="content-stack">
          <ResultPanel result={result} racers={racers} language={language} />
          <FilterEvaluationPanel
            result={result}
            racers={racers}
            language={language}
            thresholdInput={filterTailThresholdInput}
            onThresholdInputChange={updateFilterTailThreshold}
            showFilteredPlayback={showFilteredPlayback}
            onShowFilteredPlaybackChange={updateShowFilteredPlayback}
            filteredPlaybackStatus={filteredPlaybackStatus}
          />
          <RacePanel
            playback={displayedPlayback}
            racers={racers}
            language={language}
            emptyMessage={playbackEmptyMessage}
          />
        </section>
      </section>
    </main>
  );
}

