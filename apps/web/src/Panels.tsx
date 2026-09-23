import { useEffect, useState } from "react";
import {
  getJSON,
  type EchoState,
  type Experiment,
  type Future,
  type LabSummary,
} from "./api";

export const SIDES = ["dream", "good", "neutral", "bad"] as const;
export const SIDE_LABELS: Record<string, string> = {
  dream: "Dream life",
  good: "Good path",
  neutral: "Neutral drift",
  bad: "Hard road",
};

function Sparkline({
  values,
  max,
  className,
}: {
  values: number[];
  max: number;
  className?: string;
}) {
  if (!values.length) return null;
  const w = 220,
    h = 56;
  const points = values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 2 - (Math.min(v, max) / max) * (h - 6)).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      className={"spark-line " + (className || "")}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="52-week curve"
    >
      <line x1="2" y1={h - 2} x2={w - 2} y2={h - 2} className="spark-axis" />
      <polyline
        points={points}
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SideCard({
  side,
  future,
  active,
}: {
  side: string;
  future?: Future;
  active: boolean;
}) {
  return (
    <div className={"side " + side + (active ? " active" : "")}>
      <div className="eyebrow">{SIDE_LABELS[side]}</div>
      {future ? (
        <>
          <div className="side-number">
            {Math.round(future.stats.avg_progress)}
            <span>% avg progress</span>
          </div>
          <Sparkline values={future.avg_curve} max={100} />
          <p className="side-meta">
            {future.stats.active_weeks} of 52 weeks worked ·{" "}
            {future.stats.burnout_weeks} burnout
            {future.stats.breaks ? ` · plan broke ${future.stats.breaks}×` : ""}
          </p>
          {Object.entries(future.final).map(([domain, value]) => (
            <p className="side-domain" key={domain}>
              <strong>{domain}</strong> {Math.round(value)}% ·{" "}
              {future.bands[domain]}
            </p>
          ))}
        </>
      ) : (
        <p className="side-meta">
          Not crossed yet. Say “show me my {SIDE_LABELS[side].toLowerCase()}.”
        </p>
      )}
    </div>
  );
}

export function OtherSidePanel({ state }: { state: EchoState }) {
  const current = state.side ? state.futures[state.side] : undefined;
  return (
    <>
      <h2>
        {state.side
          ? `Speaking from the ${SIDE_LABELS[state.side].toLowerCase()}.`
          : "Four sides. Same goals."}
      </h2>
      <p className="side-meta">
        Fifty-two weeks simulated from your own goals and stated assumptions.
        Scenario reasoning, not prediction.
      </p>
      {current?.narrative && (
        <div className="postcard">{current.narrative}</div>
      )}
      <div className="sides">
        {SIDES.map((side) => (
          <SideCard
            key={side}
            side={side}
            future={state.futures[side]}
            active={state.side === side}
          />
        ))}
      </div>
      {state.side && (
        <p className="side-meta">
          Strain over the year:{" "}
          <Sparkline
            values={current?.strain_curve || []}
            max={1}
            className="strain"
          />{" "}
          Say “come back” to return.
        </p>
      )}
    </>
  );
}

export function LabPanel({
  state,
  session,
}: {
  state: EchoState;
  session: string;
}) {
  const [summary, setSummary] = useState<LabSummary | null>(null);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  useEffect(() => {
    if (!state.lab.consent) return;
    getJSON<LabSummary>("/lab/" + session)
      .then(setSummary)
      .catch(() => {});
    if (Object.keys(state.goals).length)
      getJSON<Experiment>("/lab/" + session + "/experiment")
        .then(setExperiment)
        .catch(() => {});
  }, [state.revision, state.lab.consent, session]);
  const last = state.lab.last;
  if (!state.lab.consent)
    return (
      <>
        <h2>The Lab is off.</h2>
        <p className="side-meta">
          The Lab studies one question: can an agent tell when to push,
          maintain, or reduce your goal intensity from your own longitudinal
          signals? It records daily check-in numbers and each decision on this
          computer only. Say “turn on the lab” to start. Say “wipe the lab” to
          erase it.
        </p>
      </>
    );
  return (
    <>
      <h2>
        {last
          ? `Tomorrow: ${last.applied}.`
          : "Check in to get tomorrow's call."}
      </h2>
      {last ? (
        <div className="card">
          <div className="eyebrow">
            {last.target_minutes} minutes on your goal · {last.why}
          </div>
          <p>
            capacity {last.features.capacity} · streak {last.features.streak} ·
            sleep debt {last.features.sleep_debt_3d}h · stress trend{" "}
            {last.features.stress_trend > 0 ? "+" : ""}
            {last.features.stress_trend}
          </p>
          <p>
            rule says {last.recommendations.rule} · bandit says{" "}
            {last.recommendations.bandit} · model says{" "}
            {last.recommendations.llm || "—"}
          </p>
          <p>
            {last.rating
              ? `You rated it ${last.rating.replace("_", " ")}.`
              : "Say too much, just right, or too little."}
          </p>
        </div>
      ) : (
        <p className="side-meta">
          Say: “Check in: slept six, energy three, stress four, forty minutes,
          done.”
        </p>
      )}
      {summary && (
        <table className="lab-table">
          <thead>
            <tr>
              <th>policy</th>
              <th>calls</th>
              <th>just right</th>
              <th>reward</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(summary.policies).map(([name, row]) => (
              <tr
                key={name}
                className={name === summary.active ? "active" : ""}
              >
                <td>{name}</td>
                <td>{row.decisions}</td>
                <td>
                  {row.just_right_rate === null
                    ? "—"
                    : Math.round(row.just_right_rate * 100) + "%"}
                </td>
                <td>
                  {row.mean_reward_when_applied === null
                    ? "—"
                    : row.mean_reward_when_applied.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {experiment && (
        <>
          <div className="eyebrow">
            In the simulator · {SIDE_LABELS[experiment.side]} ·{" "}
            {experiment.weeks} weeks
          </div>
          <table className="lab-table">
            <thead>
              <tr>
                <th>policy</th>
                <th>progress</th>
                <th>burnout wks</th>
                <th>strain</th>
              </tr>
            </thead>
            <tbody>
              {experiment.rows.map((row) => (
                <tr key={row.policy}>
                  <td>{row.policy}</td>
                  <td>{Math.round(row.avg_progress)}%</td>
                  <td>{row.burnout_weeks}</td>
                  <td>{row.avg_strain.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="side-meta">
        {state.lab.checkins} check-ins · {state.lab.decisions} decisions ·
        active policy: {state.lab.active} ·{" "}
        <a href={"/api/lab/" + session + "/export"}>export anonymized JSONL</a>
      </p>
    </>
  );
}
