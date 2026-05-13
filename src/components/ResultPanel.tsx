import { Calculator } from "lucide-react";
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

export default function ResultPanel({
  result,
  racers,
  language,
}: {
  result: SimulationResult | null;
  racers: RacerMap;
  language: Language;
}) {
  const copy = text[language];
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

  const rows = Object.entries(result.rank_counts)
    .map(([racerId, counts]) => ({
      racerId,
      name: racerDisplayName(racers[racerId] ?? racerId, language),
      skill: skillDisplayText(racers[racerId]?.skill, language),
      counts,
      avgRank: averageRank(counts, result.runs),
    }))
    .sort((left, right) => left.avgRank - right.avgRank);

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
                  { label: copy.qualifyRate, value: percentage(qualify, aggregate.runs) },
                  { label: copy.groupFirst, value: percentage(champion, aggregate.runs) },
                  { label: copy.avgPoints, value: avgPoints.toFixed(3) },
                  { label: copy.avgRank, value: row.avgRank.toFixed(3) },
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
                { label: copy.championRate, value: percentage(champion, result.runs) },
                { label: "Top2", value: percentage(top2, result.runs) },
                { label: "Top4", value: percentage(top4, result.runs) },
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
