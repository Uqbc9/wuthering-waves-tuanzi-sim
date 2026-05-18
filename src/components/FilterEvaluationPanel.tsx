import { useMemo } from "react";
import { Filter } from "lucide-react";
import {
  localeByLanguage,
  racerDisplayName,
  skillDisplayText,
  text,
  type Language,
} from "../i18n";
import { parseFirstFinishTailThreshold } from "../lib/filterEvaluation";
import { averageRank, percentage, racerById } from "../lib/sim";
import type { SimulationResult } from "../types";

type RacerMap = ReturnType<typeof racerById>;
type FilterRowData = {
  racerId: string;
  name: string;
  skill: string;
  champion: number;
  top2: number;
  top4: number;
  avgRank: number;
};

export default function FilterEvaluationPanel({
  result,
  racers,
  language,
  thresholdInput,
  onThresholdInputChange,
  showFilteredPlayback,
  onShowFilteredPlaybackChange,
  filteredPlaybackStatus,
}: {
  result: SimulationResult | null;
  racers: RacerMap;
  language: Language;
  thresholdInput: string;
  onThresholdInputChange: (value: string) => void;
  showFilteredPlayback: boolean;
  onShowFilteredPlaybackChange: (value: boolean) => void;
  filteredPlaybackStatus: string | null;
}) {
  const copy = text[language];
  const threshold = parseFirstFinishTailThreshold(thresholdInput);
  const evaluation = result?.type === "single_race" ? result.first_finish_evaluation : null;
  const locale = localeByLanguage[language];

  const { filteredRuns, rows } = useMemo(() => {
    if (!result || result.type !== "single_race" || !evaluation) {
      return { filteredRuns: 0, rows: [] as FilterRowData[] };
    }
    const racerIds = Object.keys(result.rank_counts);
    const counts = Object.fromEntries(racerIds.map((racerId) => [racerId, {}])) as Record<
      string,
      Record<string, number>
    >;
    let runs = 0;

    for (const [rawPosition, bucket] of Object.entries(evaluation.tail_position_buckets)) {
      if (Number(rawPosition) <= threshold) {
        continue;
      }
      runs += bucket.runs;
      for (const racerId of racerIds) {
        for (const [rank, count] of Object.entries(bucket.rank_counts[racerId] ?? {})) {
          counts[racerId][rank] = (counts[racerId][rank] ?? 0) + count;
        }
      }
    }

    const rowData =
      runs === 0
        ? []
        : racerIds
            .map((racerId) => {
              const racerCounts = counts[racerId] ?? {};
              const champion = racerCounts["1"] ?? 0;
              return {
                racerId,
                name: racerDisplayName(racers[racerId] ?? racerId, language),
                skill: skillDisplayText(racers[racerId]?.skill, language),
                champion,
                top2: sumTop(racerCounts, 2),
                top4: sumTop(racerCounts, 4),
                avgRank: averageRank(racerCounts, runs),
              };
            })
            .sort(
              (left, right) =>
                right.champion - left.champion ||
                left.avgRank - right.avgRank ||
                left.name.localeCompare(right.name, locale),
            );

    return { filteredRuns: runs, rows: rowData };
  }, [evaluation, language, locale, racers, result, threshold]);
  const matchedRate =
    evaluation && evaluation.total_runs > 0 ? percentage(filteredRuns, evaluation.total_runs) : "0.00%";

  if (!result || result.type !== "single_race" || !evaluation) {
    return null;
  }

  return (
    <section className="panel filter-panel" aria-live="polite">
      <div className="panel-heading">
        <div className="section-title">
          <Filter size={18} />
          <h2>{copy.filteredEvaluation}</h2>
        </div>
        <div className="run-chip">
          {filteredRuns.toLocaleString(locale)} / {evaluation.total_runs.toLocaleString(locale)}{" "}
          {copy.runUnit}
        </div>
      </div>

      <div className="filter-toolbar">
        <label className="filter-condition">
          <span>{copy.filterTailCondition}</span>
          <input
            type="number"
            min={0}
            step={1}
            value={thresholdInput}
            aria-label={copy.thresholdPosition}
            onChange={(event) => onThresholdInputChange(event.currentTarget.value)}
          />
        </label>
        <strong>
          {copy.filteredRuns} {matchedRate}
        </strong>
      </div>

      <label className="filter-playback-toggle">
        <input
          type="checkbox"
          checked={showFilteredPlayback}
          onChange={(event) => onShowFilteredPlaybackChange(event.currentTarget.checked)}
        />
        <span>{copy.filteredPlaybackToggle}</span>
        {filteredPlaybackStatus ? <em>{filteredPlaybackStatus}</em> : null}
      </label>

      {rows.length === 0 ? (
        <p className="filter-empty">{copy.noFilteredRuns}</p>
      ) : (
        <div className="result-table filter-table" role="table">
          <div className="result-row result-head" role="row">
            <span role="columnheader">{copy.racer}</span>
            <span role="columnheader">{copy.filteredWinRate}</span>
            <span role="columnheader">Top2</span>
            <span role="columnheader">Top4</span>
            <span role="columnheader">{copy.avgRank}</span>
          </div>
          {rows.map((row) => (
            <FilteredResultRow
              key={row.racerId}
              name={row.name}
              skill={row.skill}
              primaryValue={row.champion}
              primaryRuns={filteredRuns}
              values={[
                { label: copy.filteredWinRate, value: percentage(row.champion, filteredRuns) },
                { label: "Top2", value: percentage(row.top2, filteredRuns) },
                { label: "Top4", value: percentage(row.top4, filteredRuns) },
                { label: copy.avgRank, value: row.avgRank.toFixed(3) },
              ]}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FilteredResultRow({
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
      <span className="racer-cell" title={skill} role="cell">
        {name}
        <i style={{ width: `${width}%` }} />
      </span>
      {values.map((value, index) => (
        <span key={`${name}-${index}`} className="metric-cell" role="cell">
          <b>{value.label}</b>
          {value.value}
        </span>
      ))}
    </div>
  );
}

function sumTop(counts: Record<string, number>, top: number): number {
  return Object.entries(counts).reduce(
    (total, [rank, count]) => total + (Number(rank) <= top ? count : 0),
    0,
  );
}
