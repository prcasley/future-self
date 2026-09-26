import { useState } from "react";

export function TypeInstead({
  onSubmit,
  onToggle,
}: {
  onSubmit: (text: string) => Promise<boolean | void>;
  onToggle: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  return (
    <details
      className="type-instead"
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary>Type instead</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const message = text.trim();
          if (!message || sending) return;
          setSending(true);
          try {
            const accepted = await onSubmit(message);
            if (accepted !== false) setText("");
          } finally {
            setSending(false);
          }
        }}
      >
        <label htmlFor="typed-message">Message ECHO</label>
        <textarea
          id="typed-message"
          value={text}
          maxLength={4000}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a goal, question, or correction…"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !text.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
        <small>
          Same conversation. Microphone pauses while this box is open.
        </small>
      </form>
    </details>
  );
}
