import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Hologram } from "./Hologram";
import { turn, type EchoState } from "./api";
import "./style.css";

const empty: EchoState = {
  goals: {},
  facts: [],
  panel: "goals",
  pending: null,
  revision: 0,
};
const session = localStorage.getItem("echo-session") || crypto.randomUUID();
localStorage.setItem("echo-session", session);
function App() {
  const [state, setState] = useState(empty);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Ready when you are");
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState(
    "A future worth becoming starts with a conversation.",
  );
  const [did, setDid] = useState("");
  const [ledger, setLedger] = useState<any[]>([]);
  const [configured, setConfigured] = useState(false);
  const recognition = useRef<any>(null);
  const controller = useRef<AbortController | null>(null);
  const enabled = useRef(false);
  const mutedRef = useRef(false);
  const speaking = useRef(false);
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    fetch("/api/state/" + session)
      .then((r) => r.json())
      .then(setState)
      .catch(() => setStatus("Start the local API to connect ECHO."));
    fetch("/api/health")
      .then((r) => r.json())
      .then((x) => setConfigured(x.configured))
      .catch(() => {});
    return () => {
      enabled.current = false;
      recognition.current?.abort();
      controller.current?.abort();
      speechSynthesis.cancel();
    };
  }, []);
  useEffect(() => {
    if (state.panel === "privacy")
      fetch("/api/ledger")
        .then((r) => r.json())
        .then(setLedger);
  }, [state.panel, state.revision]);
  const listen = () => {
    if (enabled.current && !speaking.current && !busy.current) {
      try {
        recognition.current?.start();
      } catch {
        /* already listening */
      }
    }
  };
  const speak = (text: string) => {
    setSaid(text);
    if (mutedRef.current) {
      setStatus("Listening");
      listen();
      return;
    }
    speaking.current = true;
    recognition.current?.abort();
    setStatus("ECHO is speaking · hold Space to interrupt");
    const speechGeneration = generation.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onend = utterance.onerror = () => {
      if (speechGeneration !== generation.current) return;
      speaking.current = false;
      if (enabled.current) {
        setStatus("Listening");
        listen();
      }
    };
    speechSynthesis.speak(utterance);
  };
  const submit = async (text: string) => {
    const id = ++generation.current;
    busy.current = true;
    recognition.current?.abort();
    controller.current?.abort();
    speechSynthesis.cancel();
    speaking.current = false;
    const abort = new AbortController();
    controller.current = abort;
    setHeard(text);
    setDid("");
    setStatus("Thinking");
    let partial = "";
    let failed = false;
    try {
      for await (const item of turn(session, text, abort.signal)) {
        if (id !== generation.current) return;
        if (item.event === "token") {
          partial += item.data.text;
          setSaid(partial);
        }
        if (item.event === "state") setState(item.data);
        if (item.event === "status") setStatus(item.data.text);
        if (item.event === "tool_result") setDid(item.data.text);
        if (item.event === "sentence") speak(item.data.text);
        if (item.event === "error") speak(item.data.text);
      }
    } catch (error) {
      failed = true;
      if (!abort.signal.aborted)
        setStatus(
          error instanceof Error
            ? error.message
            : "Connection interrupted. Try again.",
        );
    } finally {
      if (id === generation.current) {
        busy.current = false;
        controller.current = null;
        if (!speaking.current) {
          if (!failed)
            setStatus(enabled.current ? "Listening" : "Session ended");
          listen();
        }
      }
    }
  };
  const start = () => {
    if (enabled.current) {
      enabled.current = false;
      setRunning(false);
      ++generation.current;
      busy.current = false;
      controller.current?.abort();
      controller.current = null;
      recognition.current?.abort();
      speechSynthesis.cancel();
      speaking.current = false;
      setStatus("Session ended");
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus(
        "Voice recognition is unavailable here. Open this local page in Chrome or Edge.",
      );
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    recognition.current = rec;
    rec.onresult = (e: any) => {
      if (
        !enabled.current ||
        recognition.current !== rec ||
        busy.current ||
        speaking.current
      )
        return;
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          void submit(text);
          return;
        }
      }
      setHeard(text);
    };
    rec.onerror = (e: any) => {
      if (
        [
          "not-allowed",
          "service-not-allowed",
          "audio-capture",
          "network",
          "language-not-supported",
        ].includes(e.error)
      ) {
        enabled.current = false;
        setRunning(false);
        setStatus(
          e.error === "network"
            ? "Speech recognition lost its connection. Check your network, then start again."
            : "Microphone unavailable. Allow it in browser site settings, then start again.",
        );
      }
    };
    rec.onend = () => {
      if (recognition.current !== rec) return;
      if (enabled.current && !speaking.current && !busy.current) listen();
    };
    enabled.current = true;
    setRunning(true);
    setStatus("Listening");
    try {
      rec.start();
    } catch {
      enabled.current = false;
      setRunning(false);
      setStatus(
        "Microphone could not start. Check browser permissions and try again.",
      );
    }
  };
  const interrupt = () => {
    ++generation.current;
    busy.current = false;
    controller.current?.abort();
    controller.current = null;
    speechSynthesis.cancel();
    speaking.current = false;
    if (enabled.current) {
      setStatus("Listening");
      listen();
    }
    fetch("/api/state/" + session)
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && enabled.current) {
        if ((e.target as HTMLElement)?.closest("button,a")) return;
        e.preventDefault();
        interrupt();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <main>
      <header>
        <a className="brand" href="/">
          FUTURE<span>//</span>SELF
        </a>
        <div className="controls">
          <button className="primary" onClick={start}>
            {running ? "End session" : "Start session"}
          </button>
          <button
            aria-pressed={muted}
            onClick={() => {
              const value = !muted;
              setMuted(value);
              mutedRef.current = value;
              if (value) {
                speechSynthesis.cancel();
                speaking.current = false;
                listen();
              }
            }}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            onClick={() =>
              setStatus(
                "Allow the microphone in your browser’s site settings. Browser speech recognition may send audio to its provider. Hold Space to interrupt ECHO.",
              )
            }
          >
            Permissions
          </button>
        </div>
      </header>
      <section className="intro">
        <div className="eyebrow">YOUR NEXT CHAPTER · VOICE FOUNDATION</div>
        <h1>Meet who you’re becoming.</h1>
        <p>Speak freely. ECHO helps you give your future a direction.</p>
      </section>
      <div className="stage">
        <section className="presence">
          <div className="stage-label">
            <span className={running ? "light live" : "light"} />
            {running ? "SESSION ACTIVE" : "ECHO · STANDING BY"}
          </div>
          <Hologram active={running} />
          <div className="orbit" />
          <div className="presence-footer">
            ONE POSSIBLE FUTURE
            <span>ABSTRACT PRESENCE · PORTRAIT COMING LATER</span>
          </div>
        </section>
        <aside>
          <div className="eyebrow">
            {state.panel === "privacy"
              ? "OUTBOUND CALLS"
              : state.panel === "memory"
                ? "WHAT I REMEMBER"
                : "YOUR DIRECTION"}
          </div>
          {state.panel === "privacy" ? (
            <>
              <h2>A visible footprint.</h2>
              <p>
                Prompts go to Nebius. Browser recognition may process audio with
                its provider. This prototype stores goals on this computer.
              </p>
              {ledger.slice(0, 5).map((x) => (
                <div className="card" key={x.id}>
                  <strong>
                    {x.status === "ok" ? "Completed" : "Attempted"} model call
                  </strong>
                  <p>
                    {x.bytes_out} bytes · {x.latency_ms} ms
                  </p>
                </div>
              ))}
            </>
          ) : state.panel === "memory" ? (
            <>
              <h2>Carry the important things.</h2>
              {state.facts.length ? (
                state.facts.map((x, i) => (
                  <div className="card" key={i}>
                    {x}
                  </div>
                ))
              ) : (
                <p>
                  Ask ECHO to remember something you want to carry into your
                  next conversation.
                </p>
              )}
            </>
          ) : (
            <>
              <h2>
                A little clearer.
                <br />
                One conversation at a time.
              </h2>
              {Object.keys(state.goals).length ? (
                Object.entries(state.goals).map(([domain, goal]) => (
                  <div className="card" key={domain}>
                    <div className="eyebrow">{domain}</div>
                    <p>{goal}</p>
                  </div>
                ))
              ) : (
                <div className="empty">
                  <div className="spark">✦</div>
                  <p>Your goals will take shape here.</p>
                  <span>No forms. Just tell ECHO what matters.</span>
                </div>
              )}
            </>
          )}
          {state.pending && (
            <div className="confirmation">
              A change is waiting.
              <br />
              Say “yes” to confirm or “no” to cancel.
            </div>
          )}
          <div className="try">
            <div className="eyebrow">TRY SAYING</div>
            <p>“I want to build my first app.”</p>
            <p>“Remember I work best in the morning.”</p>
            <p>“Show my memory.”</p>
            <p>“Undo that.”</p>
          </div>
        </aside>
      </div>
      <section className="conversation" aria-live="polite">
        <div className="status">
          <span className={running ? "light live" : "light"} />
          {status}
        </div>
        <p className="echo">{said}</p>
        <div className="transcript">
          <span>HEARD · BROWSER TRANSCRIPT</span>
          <p>{heard || "Your words appear here when you speak."}</p>
        </div>
        {did && <div className="action">DID · {did}</div>}
      </section>
      <footer>
        <span>VOICE ONLY. ALWAYS YOUR CHOICE.</span>
        <span>
          {configured
            ? "NEBIUS CONNECTED · LOCAL PROTOTYPE"
            : "LOCAL PROTOTYPE · API NOT CONFIGURED"}
        </span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
