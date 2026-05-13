import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Pause,
  Play,
  Shuffle,
} from "lucide-react";
import {
  cellTitle,
  eventTypeDisplayName,
  formatPositions,
  matchDisplayName,
  mechanismDisplayEffect,
  mechanismDisplayName,
  racerDisplayName,
  skillDisplayText,
  text,
  translateTimelineLabel,
  translateTimelineNote,
  unitShortName,
  type Language,
} from "../i18n";
import { racerById } from "../lib/sim";
import {
  BUDDAWANG_ID,
  type RacePlaybackData,
  type RoundSummary,
  type TimelineStep,
  type VisualUnit,
} from "../types";

type RacerMap = ReturnType<typeof racerById>;

export default function RacePanel({
  playback,
  racers,
  language,
}: {
  playback: RacePlaybackData | null;
  racers: RacerMap;
  language: Language;
}) {
  const copy = text[language];
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
      <section className="panel playback-panel skeleton" aria-busy="true">
        <div className="panel-heading">
          <div className="section-title">
            <Play size={18} />
            <h2>{copy.playback}</h2>
          </div>
          <div className="run-chip skeleton-chip" aria-hidden="true" />
        </div>
        <div className="playback-grid playback-placeholder" aria-hidden="true">
          <div className="track-skeleton">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <div className="timeline-skeleton">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const unitMap = Object.fromEntries(playback.units.map((unit) => [unit.id, unit]));
  const rankedUnits = step.ranking.map((racerId) => ({
    id: racerId,
    unit: unitMap[racerId],
    name: unitDisplayName(racerId, unitMap[racerId], racers, language),
  }));
  const rankingText = rankedUnits.map((item) => item.name).join(" / ");
  const notes = step.notes ?? [];

  return (
    <section className="panel playback-panel">
      <div className="panel-heading">
        <div className="section-title">
          <Play size={18} />
          <h2>{copy.playback}</h2>
        </div>
        <div className="run-chip">
          {copy.seedPrefix} {race.seed ?? (language === "zh" ? "随机" : "random")}
        </div>
      </div>

      <div className="playback-grid">
        <TrackBoard playback={playback} step={step} unitMap={unitMap} racers={racers} language={language} />

        <div className="timeline-panel">
          <h3>{matchDisplayName(playback.match_id, playback.title, language)}</h3>
          <p className="step-label" title={translateTimelineLabel(step.label, language)}>
            {translateTimelineLabel(step.label, language)}
          </p>
          <div className="timeline-controls">
            <button
              type="button"
              className="icon-button"
              onClick={() => setStepIndex(0)}
              title={copy.resetStart}
              aria-label={copy.resetStart}
            >
              <ChevronsLeft size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              title={copy.prevStep}
              aria-label={copy.prevStep}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="icon-button strong"
              onClick={() => setPlaying((value) => !value)}
              title={playing ? copy.pause : copy.play}
              aria-label={playing ? copy.pause : copy.play}
              aria-pressed={playing}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
              title={copy.nextStep}
              aria-label={copy.nextStep}
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setRaceIndex((current) => (current + 1) % playback.races.length);
                setStepIndex(0);
                setPlaying(false);
              }}
              title={copy.switchSample}
              aria-label={copy.switchSample}
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
              aria-label={copy.playbackProgress}
              onChange={(event) => setStepIndex(Number(event.target.value))}
            />
            <span>
              {stepIndex + 1} / {steps.length}
            </span>
          </div>
          <div className="round-stats">
            <div>
              <span>{copy.rounds}</span>
              <strong>{race.rounds}</strong>
            </div>
            <div>
              <span>{copy.currentEvent}</span>
              <strong title={eventTypeDisplayName(step.event_type, language)}>
                {eventTypeDisplayName(step.event_type, language)}
              </strong>
            </div>
          </div>
          <div className="ranking-box">
            <span>{copy.ranking}</span>
            <div className="ranking-list" aria-label={rankingText}>
              {rankedUnits.map(({ id, unit, name }, index) => (
                <span
                  key={`${id}-${index}`}
                  className="ranking-chip"
                  title={unitSkillTitle(id, unit, racers, language)}
                >
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
            racers={racers}
            language={language}
          />
          <div className={notes.length > 0 ? "notes-box" : "notes-box empty"} aria-live="polite">
            {notes.length > 0 ? (
              notes.map((note) => (
                <span key={note} title={translateTimelineNote(note, language)}>
                  {translateTimelineNote(note, language)}
                </span>
              ))
            ) : (
              <span>{copy.noSpecial}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function UnitAvatar({ unit, className = "" }: { unit?: VisualUnit; className?: string }) {
  const classes = ["unit-avatar", className].filter(Boolean).join(" ");
  if (unit?.icon) {
    return <img className={classes} src={unit.icon} alt="" draggable={false} />;
  }
  return <i className={classes} style={{ background: unit?.color ?? "#8d9a94" }} />;
}

function unitDisplayName(
  unitId: string,
  unit: VisualUnit | undefined,
  racers: RacerMap,
  language: Language,
): string {
  return racerDisplayName(racers[unitId] ?? unitId, language) || unit?.name || unitId;
}

function unitSkillTitle(
  unitId: string,
  unit: VisualUnit | undefined,
  racers: RacerMap,
  language: Language,
): string {
  if (unitId === BUDDAWANG_ID) {
    return language === "zh" ? (unit?.skill ?? "逆向巡场") : "Reverse patrol";
  }
  return skillDisplayText(racers[unitId]?.skill, language);
}

function TrackBoard({
  playback,
  step,
  unitMap,
  racers,
  language,
}: {
  playback: RacePlaybackData;
  step: TimelineStep;
  unitMap: Record<string, VisualUnit>;
  racers: RacerMap;
  language: Language;
}) {
  const copy = text[language];
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
        aria-label={copy.trackPlayback}
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
              {mechanismDisplayEffect(cell.mechanism_id, cell.label, language) || cell.label}
            </text>
            <title>
              {cellTitle(
                cell.display_position,
                cell.mechanism_name
                  ? { id: cell.mechanism_id ?? "", name: cell.mechanism_name }
                  : null,
                cell.mechanism_effect,
                language,
              )}
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
                <text x={x} y={y + radius * 0.16}>{unitShortName(unit.id, unit.short, language)}</text>
              )}
              <title>
                {unitDisplayName(unit.id, unit, racers, language)} · {copy.stackLabel} {order + 1}/{count} ·{" "}
                {unitSkillTitle(unit.id, unit, racers, language)}
              </title>
            </g>
          );
        })}
      </svg>
      <div className="track-footer">
        <div className="mechanism-legend" aria-label={copy.mechanismLegend}>
          {playback.track.mechanisms.map((mechanism) => (
            <span key={mechanism.id} className={`mechanism-chip ${mechanism.id}`}>
              <b>{mechanismDisplayEffect(mechanism.id, mechanism.effect, language)}</b>
              <strong>{mechanismDisplayName(mechanism.id, mechanism.name, language)}</strong>
              <em>{formatPositions(mechanism.positions, language)}</em>
            </span>
          ))}
        </div>
        <div className="unit-legend">
          {playback.units.map((unit) => (
            <span key={unit.id} title={unitSkillTitle(unit.id, unit, racers, language)}>
              <UnitAvatar unit={unit} />
              <strong>{unitDisplayName(unit.id, unit, racers, language)}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoundReadout({
  currentActor,
  currentRound,
  rounds,
  unitMap,
  racers,
  language,
}: {
  currentActor?: string;
  currentRound?: number;
  rounds: RoundSummary[];
  unitMap: Record<string, VisualUnit>;
  racers: RacerMap;
  language: Language;
}) {
  const copy = text[language];
  const round = rounds.find((item) => item.round_no === currentRound) ?? rounds[0] ?? null;
  if (!round) {
    return null;
  }
  const rollsByActor = new Map(round.rolls.map((roll) => [roll.actor, roll]));
  const highlightedActor = currentActor ?? round.first_actor ?? undefined;

  return (
    <div className="round-readout">
      <div className="round-readout-title">
        <span>{language === "zh" ? `第 ${round.round_no} 轮` : `Round ${round.round_no}`}</span>
        <small>
          {round.roll_count} {copy.rollCountSuffix}
        </small>
      </div>
      <div
        className="current-round-list"
        aria-label={
          language === "zh"
            ? `第 ${round.round_no} 轮${copy.actionOrderAria}`
            : `Round ${round.round_no} ${copy.actionOrderAria}`
        }
      >
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
              title={unitSkillTitle(unitId, unit, racers, language)}
            >
              <span className="current-order">
                <UnitAvatar unit={unit} />
                <b>{index + 1}.</b>
                <strong>{unitDisplayName(unitId, unit, racers, language)}</strong>
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
