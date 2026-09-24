import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { Hologram } from "./Hologram";
import { LabPanel, OtherSidePanel, SIDE_LABELS } from "./Panels";
import { turn, type EchoState } from "./api";
import { PortraitAvatar } from "./avatar/PortraitAvatar";
import { forgetPhoto, loadPhoto, savePhoto } from "./avatar/photoStore";
import { normalizePhoto } from "./avatar/preparePortrait";
import "./style.css";

// Photo commands are handled here, in the browser, so the photo never reaches the server.
const FORGET_PHOTO =
  /\b(forget|delete|remove|erase|clear|wipe)\b.*\b(my|the) (photo|picture|selfie|face)\b/i;
const USE_PHOTO =
  /\b(use|add|upload|scan|put in)\b.*\bmy (own )?(photo|picture|selfie|face)\b|\blook like me\b/i;

const empty: EchoState = {
  goals: {},
  facts: [],
  panel: "goals",
  pending: null,
  revision: 0,
  side: null,
  futures: {},
  lab: {
    consent: false,
    active: "rule",
    checkins: 0,
    decisions: 0,
    last: null,
  },
  appearance: { outfit: "casual", aura: "cyan" },
};
// ECHO's voice shifts with the side it speaks from.
const VOICES: Record<string, { rate: number; pitch: number }> = {
  home: { rate: 1, pitch: 1 },
  dream: { rate: 1, pitch: 1.06 },
  good: { rate: 1, pitch: 1.02 },
  neutral: { rate: 0.96, pitch: 0.96 },
  bad: { rate: 0.92, pitch: 0.9 },
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
  const [talking, setTalking] = useState(false);
  const [portrait, setPortrait] = useState<string | null>(null);
  const portraitRef = useRef<string | null>(null);
  portraitRef.current = portrait;
  const fileInput = useRef<HTMLInputElement>(null);
  const sideRef = useRef<string | null>(null);
  sideRef.current = state.side;
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
  // The photo is kept in this browser only; restore it on load.
  useEffect(() => {
    let alive = true;
    loadPhoto()
      .then((blob) => {
        if (alive && blob) setPortrait(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (portrait) URL.revokeObjectURL(portrait);
    },
    [portrait],
  );
  const choosePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await normalizePhoto(file);
      const persisted = await savePhoto(blob);
      setPortrait(URL.createObjectURL(blob));
      if (!persisted) {
        setStatus("Photo ready for this visit. Browser storage is unavailable, so it may not survive a reload.");
        return;
      }
      setStatus(
        "Your photo stays on this device. Say “forget my photo” to remove it.",
      );
    } catch {
      setStatus("I couldn't read that photo. Try a JPG or PNG.");
    }
  };
  /** Photo commands never go to the server: the photo lives only in this browser. */
  const photoCommand = async (text: string): Promise<string | null> => {
    if (FORGET_PHOTO.test(text)) {
      const removed = await forgetPhoto();
      setPortrait(null);
      if (!removed)
        return "I've hidden your photo for this visit, but couldn't confirm deletion from browser storage. Please clear this site's data in browser settings to remove any saved copy.";
      return "Done. Your photo is gone from this device, and I'm back to my own face.";
    }
    if (USE_PHOTO.test(text) && !portraitRef.current)
      return "Tap Photo and choose a picture of yourself. It stays on this device.";
    return null;
  };
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
    setTalking(true);
    recognition.current?.abort();
    setStatus(
      sideRef.current
        ? `Speaking from the ${SIDE_LABELS[sideRef.current].toLowerCase()} · hold Space to interrupt`
        : "ECHO is speaking · hold Space to interrupt",
    );
    const speechGeneration = generation.current;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = VOICES[sideRef.current || "home"] || VOICES.home;
    utterance.rate = voice.rate;
    utterance.pitch = voice.pitch;
    utterance.onend = utterance.onerror = () => {
      if (speechGeneration !== generation.current) return;
      speaking.current = false;
      setTalking(false);
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
    setHeard(text);
    setTalking(false);
    setDid("");
    const local = await photoCommand(text).catch(() => null);
    if (local !== null) {
      if (id !== generation.current) return;
      busy.current = false;
      setDid(
        local.startsWith("Done") ? "Removed your photo from this device" : "",
      );
      speak(local);
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setStatus("Thinking");
    let partial = "";
    let failed = false;
    // An outfit only shows on the portrait; without a photo, say how to add one.
    let hint = "";
    try {
      for await (const item of turn(session, text, abort.signal)) {
        if (id !== generation.current) return;
        if (item.event === "token") {
          partial += item.data.text;
          setSaid(partial);
        }
        if (item.event === "state") {
          sideRef.current = item.data.side;
          setState(item.data);
        }
        if (item.event === "status") setStatus(item.data.text);
        if (
          item.event === "tool_call" &&
          item.data.name === "set_appearance" &&
          item.data.args?.outfit === "monarch" &&
          !portraitRef.current
        )
          hint = " Tap Photo and I'll wear it as you.";
        if (item.event === "tool_result") setDid(item.data.text);
        if (item.event === "sentence") speak(item.data.text + hint);
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
      setTalking(false);
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
    setTalking(false);
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
  const presenceMode = !running
    ? "idle"
    : talking || speaking.current
      ? "speaking"
      : busy.current
        ? "thinking"
        : "listening";
  return (
    <main>
      <header>
        <a className="brand" href="/">
          THE OTHER <span>SIDE</span>
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
                setTalking(false);
                if (enabled.current && !busy.current) setStatus("Listening");
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
          <button
            aria-label={
              portrait
                ? "Change your photo. It stays on this device."
                : "Add your photo. It stays on this device."
            }
            onClick={() => fileInput.current?.click()}
          >
            {portrait ? "Change photo" : "Photo"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void choosePhoto(e)}
          />
        </div>
      </header>
      <section className="intro">
        <div className="eyebrow">THE OTHER SIDE · VOICE ONLY</div>
        <h1>Meet the you on the other side.</h1>
        <p>
          Speak freely. ECHO listens, remembers, and shows you where your
          choices lead.
        </p>
      </section>
      <div className="stage">
        <section className="presence">
          <div className="stage-label">
            <span className={running ? "light live" : "light"} />
            {state.side
              ? `SPEAKING FROM · ${SIDE_LABELS[state.side].toUpperCase()}`
              : running
                ? "SESSION ACTIVE"
                : "ECHO · STANDING BY"}
          </div>
          {portrait ? (
            <PortraitAvatar
              active={running}
              side={state.side}
              portraitUrl={portrait}
              appearance={state.appearance}
              mode={presenceMode}
              onPrepared={(ok) => {
                if (!ok)
                  setStatus("I couldn't read that photo. Try a JPG or PNG.");
              }}
            />
          ) : (
            <Hologram
              active={running}
              side={state.side}
              aura={state.appearance?.aura}
              mode={presenceMode}
            />
          )}
          <div className={"orbit" + (state.side ? " " + state.side : "")} />
          <div className="presence-footer">
            {state.side
              ? "ONE POSSIBLE FUTURE · 52 WEEKS OUT"
              : "ONE POSSIBLE FUTURE"}
            <span>
              {portrait
                ? state.side
                  ? "PORTRAIT PROJECTION OF YOUR PHOTO · SCENARIO, NOT PREDICTION"
                  : "PORTRAIT PROJECTION OF YOUR PHOTO · STAYS ON THIS DEVICE"
                : state.side
                  ? "ORIGINAL DIGITAL PERSONA · SCENARIO, NOT PREDICTION"
                  : "ORIGINAL DIGITAL PERSONA · NOT YOUR LIKENESS"}
            </span>
          </div>
        </section>
        <aside>
          <div className="eyebrow">
            {state.panel === "privacy"
              ? "OUTBOUND CALLS"
              : state.panel === "memory"
                ? "WHAT I REMEMBER"
                : state.panel === "otherside"
                  ? "THE OTHER SIDE"
                  : state.panel === "lab"
                    ? "THE LAB · PUSH, MAINTAIN, REDUCE"
                    : "YOUR DIRECTION"}
          </div>
          {state.panel === "otherside" ? (
            <OtherSidePanel state={state} />
          ) : state.panel === "lab" ? (
            <LabPanel state={state} session={session} />
          ) : state.panel === "privacy" ? (
            <>
              <h2>A visible footprint.</h2>
              <p>
                Prompts go to Nebius. Browser recognition may process audio with
                its provider. This prototype stores goals on this computer. Your
                photo never leaves this browser; say “forget my photo” to delete
                it.
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
            <p>“Show me my dream life.” · “What if I drift?”</p>
            <p>
              “Turn on the lab.” then “Check in: slept six, energy three, stress
              four, forty minutes, done.”
            </p>
            <p>“That was too much.” · “Come back.” · “Undo that.”</p>
            <p>“Put on the monarch armor.” · “Make my aura gold.”</p>
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
