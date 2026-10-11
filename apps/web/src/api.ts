import type { MissionResearch } from "./missionSourceData";

export type Future = {
  label: string;
  final: Record<string, number>;
  bands: Record<string, string>;
  stats: {
    burnout_weeks: number;
    breaks: number;
    active_weeks: number;
    avg_strain: number;
    avg_progress: number;
  };
  avg_curve: number[];
  strain_curve: number[];
  narrative: string | null;
  runner: string;
};
export type Decision = {
  id: number;
  applied: string;
  why: string;
  target_minutes: number;
  bucket: string;
  features: Record<string, number>;
  recommendations: Record<string, string | null>;
  reasons: Record<string, string | null>;
  rating: string | null;
  reward: number | null;
};
export type LabState = {
  consent: boolean;
  active: string;
  checkins: number;
  decisions: number;
  last: Decision | null;
};
export type LabSummary = LabState & {
  policies: Record<
    string,
    {
      decisions: number;
      distribution: Record<string, number>;
      just_right_rate: number | null;
      mean_reward_when_applied: number | null;
    }
  >;
  bandit: Record<string, Record<string, [number, number]>>;
};
export type Experiment = {
  side: string;
  weeks: number;
  rows: {
    policy: string;
    avg_progress: number;
    burnout_weeks: number;
    active_weeks: number;
    avg_strain: number;
  }[];
};
export type EchoState = {
  daily: {
    mission: null | {
      key: (string | number | null)[];
      research?: MissionResearch;
      goal: string;
      minutes: number;
      done: boolean;
      steps: { minutes: number; text: string }[];
      basis: string;
      disclaimer: string;
    };
    schedule: null | { time: string; timezone: string; enabled: boolean };
    messages: { id: string; date: string; text: string }[];
  };
  goals: Record<string, string>;
  facts: string[];
  panel: string;
  pending: null | { name: string; args: Record<string, string> };
  revision: number;
  side: string | null;
  futures: Record<string, Future>;
  lab: LabState;
  /** Voice-picked wardrobe for the portrait projection. The photo itself never leaves the browser. */
  appearance: { outfit: string; aura: string };
  /** Set once, on the turn that confirmed "delete all my data". */
  wiped?: boolean;
};
export type ScanProjection = {
  side: string | null;
  weeks: number;
  rows: {
    key: string;
    now: number;
    future: number;
    chance: number;
    note: string;
  }[];
  runner: "nemotron" | "local";
  model: string | null;
  disclaimer: string;
};
/** Download everything the server keeps for this session as a JSON file. */
export async function downloadExport(session_id: string): Promise<void> {
  const response = await fetch("/api/export/" + session_id);
  if (!response.ok) throw new Error("Export failed");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "the-other-side-export.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Future card for the face scan. Sends ratio numbers only; the photo never leaves the browser. */
export async function projectScan(
  session_id: string,
  ratios: Record<string, number>,
  side: string | null,
): Promise<ScanProjection> {
  const response = await fetch("/api/scan/projection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, ratios, side }),
  });
  if (!response.ok) throw new Error("Projection failed");
  return (await response.json()) as ScanProjection;
}
export async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch("/api" + path);
  if (!response.ok) throw new Error("Request failed");
  return (await response.json()) as T;
}
export type EchoEvent = { event: string; data: any };
export async function* turn(
  session_id: string,
  text: string,
  signal: AbortSignal,
): AsyncGenerator<EchoEvent> {
  const response = await fetch("/api/voice/text_turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id,
      text,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error(
      response.status === 409
        ? "Please wait a moment and try again."
        : "ECHO cannot reach the local server.",
    );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        "\n",
      );
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (data) {
          if (event === "done") complete = true;
          yield { event, data: JSON.parse(data) };
        }
      }
    }
    if (!complete)
      throw new Error(
        "Connection interrupted before ECHO finished. Please try again.",
      );
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
