export type EchoState = {
  goals: Record<string, string>;
  facts: string[];
  panel: string;
  pending: null | { name: string; args: Record<string, string> };
  revision: number;
};
export type EchoEvent = { event: string; data: any };
export async function* turn(
  session_id: string,
  text: string,
  signal: AbortSignal,
): AsyncGenerator<EchoEvent> {
  const response = await fetch("/api/voice/text_turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, text }),
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
