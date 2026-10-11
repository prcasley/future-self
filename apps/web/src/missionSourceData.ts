export type MissionResearch = {
  status: "ready" | "not_configured" | "unavailable" | "empty";
  provider: "tavily";
  checked_at: string;
  sources: { title: string; url: string }[];
};

export function sourceUrl(value: string): string | null {
  try {
    if (/[\s\\]/.test(value)) return null;
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function sourceMessage(
  status?: MissionResearch["status"],
  available?: boolean | null,
): string {
  if (status === "ready")
    return "Related reading found with Tavily. These links did not generate your mission.";
  if (available === false || status === "not_configured")
    return "Sources unavailable: Tavily isn't configured yet. Your mission still works without web sources.";
  if (status === "unavailable")
    return "Tavily couldn't return sources. Your mission is unchanged; you can try again.";
  if (status === "empty")
    return "Tavily returned no usable links. Your mission is unchanged.";
  return "No web search has been run for this mission.";
}
