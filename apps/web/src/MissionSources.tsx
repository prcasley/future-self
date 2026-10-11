import { useEffect, useRef, useState } from "react";
import type { EchoState } from "./api";
import {
  sourceMessage,
  sourceUrl,
  type MissionResearch,
} from "./missionSourceData";

export function MissionSources({
  session,
  mission,
  available,
  onResult,
}: {
  session: string;
  mission: NonNullable<EchoState["daily"]["mission"]>;
  available: boolean | null;
  onResult: (research: MissionResearch, revision: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const research = mission.research;
  const search = async () => {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/daily/${session}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission_key: mission.key }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "The mission changed or a search is already running. Try the current card again."
            : "Sources couldn't be loaded. Your mission is unchanged; try again later.",
        );
      const result = await response.json();
      if (!controller.signal.aborted)
        onResult(result.research, result.revision);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "Sources unavailable.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="mission-sources" aria-label="Mission sources">
      <h3>Related reading</h3>
      <p role="status">
        {busy
          ? "Searching Tavily…"
          : error || sourceMessage(research?.status, available)}
      </p>
      {!!research?.sources.length && (
        <ul>
          {research.sources.map((source) => {
            const url = sourceUrl(source.url);
            return (
              url && (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
                </li>
              )
            );
          })}
        </ul>
      )}
      {research?.status === "ready" && (
        <small>
          Retrieved {new Date(research.checked_at).toLocaleString()} · Open a
          link to check its guidance.
        </small>
      )}
      {available !== false &&
        !["ready", "empty"].includes(research?.status || "") && (
          <>
            <p className="source-consent">
              Search sends this mission's goal (up to 400 characters) to Tavily.
              Your memories, conversation, photo and camera are not sent.
            </p>
            <button type="button" disabled={busy} onClick={() => void search()}>
              {busy ? "Searching…" : "Find sources"}
            </button>
          </>
        )}
    </section>
  );
}
