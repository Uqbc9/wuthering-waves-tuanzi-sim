import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Calculator, ChevronDown, ChevronUp } from "lucide-react";
import {
  localeByLanguage,
  matchDisplayName,
  racerDisplayName,
  skillDisplayText,
  text,
  type Language,
} from "../i18n";
import { averageRank, percentage, racerById } from "../lib/sim";
import type { AggregateSimulationResult, SimulationResult } from "../types";

type RacerMap = ReturnType<typeof racerById>;
type ResultSortKey =
  | "avgPoints"
  | "avgRank"
  | "championRate"
  | "groupFirst"
  | "qualifyRate"
  | "top2"
  | "top4";
type SortDirection = "asc" | "desc";
type SortState = { key: ResultSortKey; direction: SortDirection };
type SortOption = { key: ResultSortKey; label: string; defaultDirection: SortDirection };
type ResultRowData = {
  racerId: string;
  name: string;
  skill: string;
  counts: Record<string, number>;
  avgRank: number;
  champion: number;
  top2: number;
  top4: number;
  qualify: number;
  avgPoints: number;
};

const DEFAULT_SORT: SortState = {
  key: "avgRank",
  direction: "asc",
};

export default function ResultPanel({
  result,
  racers,
  language,
}: {
  result: SimulationResult | null;
  racers: RacerMap;
  language: Language;
}) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const copy = text[language];
  const sortOptions = useMemo<SortOption[]>(
    () =>
      !result
        ? []
        : result.type === "aggregate"
        ? [
            { key: "qualifyRate", label: copy.qualifyRate, defaultDirection: "desc" },
            { key: "groupFirst", label: copy.groupFirst, defaultDirection: "desc" },
            { key: "avgPoints", label: copy.avgPoints, defaultDirection: "desc" },
            { key: "avgRank", label: copy.avgRank, defaultDirection: "asc" },
          ]
        : [
            { key: "championRate", label: copy.championRate, defaultDirection: "desc" },
            { key: "top2", label: "Top2", defaultDirection: "desc" },
            { key: "top4", label: "Top4", defaultDirection: "desc" },
            { key: "avgRank", label: copy.avgRank, defaultDirection: "asc" },
          ],
    [copy.avgPoints, copy.avgRank, copy.championRate, copy.groupFirst, copy.qualifyRate, result],
  );
  const resolvedSort = sortOptions.some((option) => option.key === sort.key) ? sort : DEFAULT_SORT;

  useEffect(() => {
    if (
      sort.key !== resolvedSort.key ||
      sort.direction !== resolvedSort.direction
    ) {
      setSort(resolvedSort);
    }
  }, [resolvedSort.direction, resolvedSort.key, sort.direction, sort.key]);

  const rows = useMemo<ResultRowData[]>(() => {
    if (!result) {
      return [];
    }
    const aggregate = result.type === "aggregate" ? result : null;
    return Object.entries(result.rank_counts)
      .map(([racerId, counts]) => {
        const champion = counts["1"] ?? 0;
        return {
          racerId,
          name: racerDisplayName(racers[racerId] ?? racerId, language),
          skill: skillDisplayText(racers[racerId]?.skill, language),
          counts,
          avgRank: averageRank(counts, result.runs),
          champion,
          top2: sumTop(counts, 2),
          top4: sumTop(counts, 4),
          qualify: aggregate?.qualify_counts[racerId] ?? 0,
          avgPoints: aggregate ? (aggregate.points_total[racerId] ?? 0) / aggregate.runs : 0,
        };
      })
      .sort((left, right) => compareRows(left, right, resolvedSort, language));
  }, [language, racers, resolvedSort, result]);

  const handleSort = (option: SortOption) => {
    setSort((current) =>
      current.key === option.key
        ? {
            key: option.key,
            direction: current.direction === "desc" ? "asc" : "desc",
          }
        : {
            key: option.key,
            direction: option.defaultDirection,
          },
    );
  };

  if (!result) {
    return (
      <section className="panel result-panel skeleton" aria-busy="true">
        <div className="panel-heading">
          <div className="section-title">
            <Calculator size={18} />
            <h2>{copy.results}</h2>
          </div>
          <div className="run-chip skeleton-chip" aria-hidden="true" />
        </div>
        <div className="result-skeleton" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel result-panel" aria-live="polite">
      <div className="panel-heading">
        <div className="section-title">
          <Calculator size={18} />
          <h2>{copy.results}</h2>
          <span className="panel-subtitle">
            {matchDisplayName(result.match_id, result.match_name, language)}
          </span>
        </div>
        <div className="run-chip">
          {result.runs.toLocaleString(localeByLanguage[language])} {copy.runUnit}
        </div>
      </div>

      <div className="result-toolbar">
        <strong>{copy.sortResults}</strong>
        <div className="result-sort-controls" role="toolbar" aria-label={copy.sortResults}>
          {sortOptions.map((option) => {
            const active = resolvedSort.key === option.key;
            return (
              <button
                key={option.key}
                type="button"
                className={active ? "result-sort-button active" : "result-sort-button"}
                aria-pressed={active}
                title={`${option.label} · ${
                  active
                    ? resolvedSort.direction === "asc"
                      ? copy.sortAscending
                      : copy.sortDescending
                    : copy.sortResults
                }`}
                onClick={() => handleSort(option)}
              >
                <span>{option.label}</span>
                {active ? (
                  resolvedSort.direction === "asc" ? (
                    <ChevronUp size={14} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={14} aria-hidden="true" />
                  )
                ) : (
                  <ArrowUpDown size={14} aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="result-table" role="table">
        <div className="result-row result-head" role="row">
          <span role="columnheader">{copy.racer}</span>
          {result.type === "aggregate" ? (
            <>
              <span role="columnheader">{copy.qualifyRate}</span>
              <span role="columnheader">{copy.groupFirst}</span>
              <span role="columnheader">{copy.avgPoints}</span>
            </>
          ) : (
            <>
              <span role="columnheader">{copy.championRate}</span>
              <span role="columnheader">Top2</span>
              <span role="columnheader">Top4</span>
            </>
          )}
          <span role="columnheader">{copy.avgRank}</span>
        </div>
        {rows.map((row) => {
          if (result.type === "aggregate") {
            const aggregate = result as AggregateSimulationResult;
            return (
              <ResultRow
                key={row.racerId}
                name={row.name}
                skill={row.skill}
                primaryValue={row.qualify}
                primaryRuns={aggregate.runs}
                values={[
                  { label: copy.qualifyRate, value: percentage(row.qualify, aggregate.runs) },
                  { label: copy.groupFirst, value: percentage(row.champion, aggregate.runs) },
                  { label: copy.avgPoints, value: row.avgPoints.toFixed(3) },
                  { label: copy.avgRank, value: row.avgRank.toFixed(3) },
                ]}
              />
            );
          }

          return (
            <ResultRow
              key={row.racerId}
              name={row.name}
              skill={row.skill}
              primaryValue={row.champion}
              primaryRuns={result.runs}
              values={[
                { label: copy.championRate, value: percentage(row.champion, result.runs) },
                { label: "Top2", value: percentage(row.top2, result.runs) },
                { label: "Top4", value: percentage(row.top4, result.runs) },
                { label: copy.avgRank, value: row.avgRank.toFixed(3) },
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

function compareRows(
  left: ResultRowData,
  right: ResultRowData,
  sort: SortState,
  language: Language,
): number {
  const difference = sortValue(left, sort.key) - sortValue(right, sort.key);
  if (difference !== 0) {
    return sort.direction === "asc" ? difference : -difference;
  }
  if (sort.key !== "avgRank" && left.avgRank !== right.avgRank) {
    return left.avgRank - right.avgRank;
  }
  return left.name.localeCompare(right.name, localeByLanguage[language]);
}

function sortValue(row: ResultRowData, key: ResultSortKey): number {
  switch (key) {
    case "avgPoints":
      return row.avgPoints;
    case "avgRank":
      return row.avgRank;
    case "championRate":
    case "groupFirst":
      return row.champion;
    case "qualifyRate":
      return row.qualify;
    case "top2":
      return row.top2;
    case "top4":
      return row.top4;
    default:
      return 0;
  }
}
