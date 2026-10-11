import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { GhostMode, useGhostRoute } from "./ghost/GhostMode";
import { createRoot } from "react-dom/client";
import { EchoStage } from "./EchoStage";
import { useGhostConfig } from "./ghost/useGhostConfig";
import { TypeInstead } from "./TypeInstead";
import { MissionSources } from "./MissionSources";
import { FuturePortrait } from "./FuturePortrait";
import { LabPanel, OtherSidePanel, SIDE_LABELS } from "./Panels";
import { downloadExport, turn, type EchoState } from "./api";
import { forgetPhoto, loadPhoto, savePhoto } from "./avatar/photoStore";
import {
  forgetSidePortraits,
  loadGallery,
  releaseGallery,
  saveSidePortrait,
  type Gallery,
  type Side,
} from "./living/gallery";
import { normalizePhoto } from "./avatar/preparePortrait";
import { FaceScan } from "./scan/FaceScan";
import {
  createRenee,
  describe as describeVoice,
  fetchReneeAudio,
} from "./voice/renee";
import {
  QUIET_PAUSE_MS,
  createBargeIn,
  createSentenceStream,
  isStopCommand,
} from "./voice/conversation";
import "./style.css";

// Photo commands are handled here, in the browser, so the photo never reaches the server.
const FORGET_PHOTO =
  /\b(forget|delete|remove|erase|clear|wipe)\b.*\b(my|the) (photo|picture|selfie|face)\b/i;
const USE_PHOTO =
  /\b(use|add|upload|scan|put in)\b.*\bmy (own )?(photo|picture|selfie|face)\b|\blook like me\b/i;
const SCAN =
  /\b(scan (my )?face|face scan|scan me|golden ratio|phi scan|map my face)\b/i;
const CLOSE_SCAN =
  /^\s*(close( it| the scan)?|done|that's enough|exit|hide (it|the scan))\s*[.!]?\s*$/i;
// Stage commands, also local: how ECHO looks and whether it follows your head.
const FOLLOW_ON =
  /\b(follow (me|my head)|mirror me|track my (head|face)|look at me)\b/i;
const FOLLOW_OFF = /\b(stop (following|mirroring|tracking)|don't follow)\b/i;
const LOOK_HOLOGRAM =
  /\b(hologram (mode|look)|show (me )?the hologram|go holographic)\b/i;
const LOOK_REAL =
  /\b(real (mode|look|face)|show (me )?the real (you|face)|photoreal|be real)\b/i;

const empty: EchoState = {
  daily: { mission: null, schedule: null, messages: [] },
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
  const [ghost, setGhost] = useGhostRoute();
  const [state, setState] = useState(empty);
  const [running, setRunning] = useState(false);
  const typing = useRef(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Ready when you are");
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState(
    "A future worth becoming starts with a conversation.",
  );
  const [did, setDid] = useState("");
  const [ledger, setLedger] = useState<any[]>([]);
  const [configured, setConfigured] = useState(false);
  const [tavilyConfigured, setTavilyConfigured] = useState<boolean | null>(
    null,
  );
  const [talking, setTalking] = useState(false);
  const [portrait, setPortrait] = useState<string | null>(null);
  const [portraitEpoch, setPortraitEpoch] = useState(0);
  // The future gallery (one face per side), how ECHO looks, and the camera mirror.
  const [gallery, setGallery] = useState<Gallery>({});
  const [ghostConfig, updateGhostConfig] = useGhostConfig();
  const [runtime, setRuntime] = useState<
    | { model: string; verified_at: string }
    | { limited: "budget" | "credit" | "offline" }
    | null
  >(null);
  const runtimeRef = useRef(false);
  // While limited, re-check the model at most every two minutes (a budget reset or Nebius
  // coming back), not before every turn.
  const limitedAt = useRef(0);
  // No browser speech recognition (Safari, Firefox): point to typing instead of "Listening".
  const noSpeech = useRef(false);
  const listeningText = () =>
    noSpeech.current
      ? "Voice input isn't available in this browser. Use Type instead, or open this page in Chrome or Edge."
      : "Listening";
  // Reneė, ECHO's British voice. The label always names the engine actually speaking.
  const [voiceLabel, setVoiceLabel] = useState("Voice: Reneė · checking");
  const finishSpeaking = useRef<() => void>(() => {});
  const speechLevel = useRef<number | null>(0);
  const renee = useRef<ReturnType<typeof createRenee> | null>(null);
  if (!renee.current)
    renee.current = createRenee({
      onIdle: () => finishSpeaking.current(),
      onEngine: (engine) => setVoiceLabel(describeVoice(engine)),
      fetchAudio: fetchReneeAudio,
      onLevel: (level) => {
        speechLevel.current = level;
      },
    });
  const stopVoice = () => renee.current?.cancel();
  const portraitRef = useRef<string | null>(null);
  portraitRef.current = portrait;
  const fileInput = useRef<HTMLInputElement>(null);
  // The golden-ratio face scan: pops up after a photo is chosen, replays on "scan my face".
  const [scanOpen, setScanOpen] = useState(false);
  const [scanReplay, setScanReplay] = useState(0);
  const scanOpenRef = useRef(false);
  scanOpenRef.current = scanOpen;
  const sideRef = useRef<string | null>(null);
  sideRef.current = state.side;
  const recognition = useRef<any>(null);
  const controller = useRef<AbortController | null>(null);
  const enabled = useRef(false);
  const mutedRef = useRef(false);
  const speaking = useRef(false);
  const generation = useRef(0);
  const busy = useRef(false);
  // Conversation: barge-in watcher, last time anything was said or heard, and why it ended.
  const bargeIn = useRef<Awaited<ReturnType<typeof createBargeIn>>>(null);
  const lastActivity = useRef(0);
  const quietTimer = useRef<number | null>(null);
  const endedStatus = useRef("Session ended");
  useEffect(() => {
    let alive = true;
    let pending = false;
    const poll = async () => {
      if (pending || document.hidden || busy.current) return;
      pending = true;
      try {
        const response = await fetch(`/api/daily/${session}/poll`, {
          method: "POST",
        });
        if (!response.ok) return;
        const next: EchoState = await response.json();
        if (alive)
          setState((previous) =>
            next.revision >= previous.revision ? next : previous,
          );
      } catch {
        /* keep the inbox available during an outage */
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, 30000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);
  useEffect(() => {
    fetch("/api/state/" + session)
      .then((r) => r.json())
      .then(setState)
      .catch(() => setStatus("Start the local API to connect ECHO."));
    fetch("/api/health")
      .then((r) => r.json())
      .then((x) => {
        setConfigured(x.configured);
        setTavilyConfigured(x.sources?.configured ?? null);
      })
      .catch(() => {});
    return () => {
      enabled.current = false;
      recognition.current?.abort();
      controller.current?.abort();
      stopVoice();
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
  const refreshGallery = async () => {
    const next = await loadGallery().catch(() => ({ urls: {} as Gallery }));
    setGallery((previous) => {
      releaseGallery(previous);
      return next.urls;
    });
  };
  useEffect(() => {
    void refreshGallery();
  }, []);
  const setSidePortrait = async (side: Side, file: File) => {
    try {
      const blob = await normalizePhoto(file);
      const persisted = await saveSidePortrait(side, blob);
      await refreshGallery();
      setStatus(
        persisted
          ? `ECHO wears this face on the ${side === "home" ? "present" : side} side. It stays on this device.`
          : "Face set for this visit. Browser storage is unavailable, so it may not survive a reload.",
      );
    } catch {
      setStatus(
        "I couldn't read that picture. Try a JPG or PNG with a clear face.",
      );
    }
  };
  const useGeneratedPortrait = async (side: Side, blob: Blob) => {
    const persisted = await saveSidePortrait(side, blob);
    await refreshGallery();
    setStatus(
      persisted
        ? `Your ${side} future now speaks with that face. It stays on this device.`
        : "Face set for this visit only; browser storage is unavailable.",
    );
  };
  const choosePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await normalizePhoto(file);
      const persisted = await savePhoto(blob);
      setPortrait(URL.createObjectURL(blob));
      setScanReplay((k) => k + 1);
      setScanOpen(true);
      if (!persisted) {
        setStatus(
          "Photo ready for this visit. Browser storage is unavailable, so it may not survive a reload.",
        );
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
    if (FOLLOW_ON.test(text)) {
      updateGhostConfig({ follow: true });
      return "Following your head. The camera stays on this device.";
    }
    if (FOLLOW_OFF.test(text)) {
      updateGhostConfig({ follow: false });
      return "Camera off. I'll hold still.";
    }
    if (LOOK_HOLOGRAM.test(text)) {
      setGhost(true);
      return "Ghost projection. Tap or press Escape for controls.";
    }
    if (LOOK_REAL.test(text)) {
      setGhost(false);
      return "Back to the main stage. Same living face.";
    }
    if (FORGET_PHOTO.test(text)) {
      setPortraitEpoch((value) => value + 1);
      const removedFutures = await forgetSidePortraits();
      await refreshGallery();
      const removed = (await forgetPhoto()) && removedFutures;
      setScanOpen(false);
      setPortrait(null);
      if (!removed)
        return "I've hidden your photo for this visit, but couldn't confirm deletion from browser storage. Please clear this site's data in browser settings to remove any saved copy.";
      return "Done. Your photo is gone from this device, Choose another photo when you are ready.";
    }
    if (SCAN.test(text)) {
      if (!portraitRef.current)
        return "Tap Photo first, then say scan my face. Your photo stays on this device.";
      setScanReplay((k) => k + 1);
      setScanOpen(true);
      return "Scanning. Here is your golden ratio map, measured on this device.";
    }
    if (scanOpenRef.current && CLOSE_SCAN.test(text)) {
      setScanOpen(false);
      return "Closed the scan.";
    }
    if (USE_PHOTO.test(text) && !portraitRef.current)
      return "Tap Photo and choose a picture of yourself. It stays on this device.";
    return null;
  };
  const listen = () => {
    if (
      enabled.current &&
      !typing.current &&
      !speaking.current &&
      !busy.current
    ) {
      try {
        recognition.current?.start();
      } catch {
        /* already listening */
      }
    }
  };
  const speak = (text: string, chunk = false) => {
    if (!chunk) setSaid(text);
    lastActivity.current = Date.now();
    if (mutedRef.current) {
      setStatus(listeningText());
      listen();
      return;
    }
    speaking.current = true;
    setTalking(true);
    recognition.current?.abort();
    setStatus(
      sideRef.current
        ? `Speaking from the ${SIDE_LABELS[sideRef.current].toLowerCase()} · tap Interrupt ECHO to speak`
        : "ECHO is speaking · tap Interrupt ECHO to speak",
    );
    const speechGeneration = generation.current;
    const voice = VOICES[sideRef.current || "home"] || VOICES.home;
    // Talking over Reneė cuts her off and ECHO listens (barge-in).
    if (enabled.current && !noSpeech.current) bargeIn.current?.arm();
    // Listening resumes once, when Reneė has finished every queued sentence.
    finishSpeaking.current = () => {
      if (speechGeneration !== generation.current) return;
      bargeIn.current?.disarm();
      speaking.current = false;
      setTalking(false);
      lastActivity.current = Date.now();
      // Still streaming the reply: the next sentence is on its way, so don't start listening yet.
      if (busy.current) return;
      if (enabled.current) {
        setStatus(listeningText());
        listen();
      } else setStatus(endedStatus.current);
    };
    renee.current?.say(text, voice.rate, voice.pitch);
  };
  const submit = async (text: string, spoken = true) => {
    lastActivity.current = Date.now();
    if (spoken && isStopCommand(text)) {
      setHeard(text);
      endSession("Stopped listening. Tap Start session to talk again.");
      speak("Okay. I'll be right here.");
      return true;
    }
    const id = ++generation.current;
    busy.current = true;
    recognition.current?.abort();
    controller.current?.abort();
    stopVoice();
    speaking.current = false;
    if (spoken) setHeard(text);
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
      return true;
    }
    const abort = new AbortController();
    controller.current = abort;
    setStatus("Thinking");
    let partial = "";
    const sentences = createSentenceStream();
    let failed = false;
    // An outfit only shows on the portrait; without a photo, say how to add one.
    let hint = "";
    try {
      if (
        !runtimeRef.current &&
        (text === "start my day" || Date.now() - limitedAt.current > 120_000)
      ) {
        const response = await fetch("/api/voice/connect", {
          method: "POST",
          signal: abort.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: session,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        const connected = await response.json().catch(() => null);
        if (id !== generation.current) return false;
        if (response.ok && connected) {
          runtimeRef.current = true;
          setRuntime({
            model: connected.model,
            verified_at: connected.verified_at,
          });
        } else if (connected?.limited && connected.state) {
          // Over today's AI budget, or Nebius refused the key or credit. The session still opens
          // without the model and built-in commands keep working; nothing claims to be live, and
          // the next turn checks again in case the budget has reset.
          limitedAt.current = Date.now();
          setRuntime({ limited: connected.limited });
        } else {
          throw new Error(
            "Nebius connection failed. No live model session was established. Try Start session again.",
          );
        }
        setState(connected.state);
        if (text === "start my day") {
          speak(connected.greeting);
          return true;
        }
      }
      for await (const item of turn(session, text, abort.signal)) {
        if (id !== generation.current) return;
        if (item.event === "token") {
          partial += item.data.text;
          setSaid(partial);
          // Reneė starts on the first finished sentence instead of waiting for the whole reply.
          for (const sentence of sentences.feed(partial)) speak(sentence, true);
        }
        if (item.event === "state") {
          sideRef.current = item.data.side;
          setState(item.data);
          // "Delete all my data" was confirmed: the server row is gone; the photo lives here.
          if (item.data.wiped) {
            setPortraitEpoch((value) => value + 1);
            setScanOpen(false);
            setPortrait(null);
            void forgetSidePortraits().then(() => refreshGallery());
            void forgetPhoto().then((removed) => {
              if (!removed)
                setStatus(
                  "Couldn't confirm your photo was removed from browser storage. Clear this site's data to be sure.",
                );
            });
          }
        }
        if (item.event === "tool_call" && item.data.name === "export_data")
          void downloadExport(session).catch(() =>
            setStatus("The download didn't start. Try again in a moment."),
          );
        if (item.event === "status") setStatus(item.data.text);
        if (
          item.event === "tool_call" &&
          item.data.name === "set_appearance" &&
          item.data.args?.outfit === "monarch" &&
          !portraitRef.current
        )
          hint = " Tap Photo and I'll wear it as you.";
        if (item.event === "tool_result") setDid(item.data.text);
        if (item.event === "sentence") {
          if (!sentences.started) speak(item.data.text + hint);
          else {
            setSaid(item.data.text + hint);
            const rest = sentences.rest(item.data.text) + hint;
            if (rest.trim()) speak(rest.trim(), true);
          }
        }
        if (item.event === "error") speak(item.data.text);
      }
    } catch (error) {
      failed = true;
      if (!runtimeRef.current && id === generation.current) {
        enabled.current = false;
        setRunning(false);
        recognition.current?.abort();
      }
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
            setStatus(
              typing.current
                ? "Ready for your message"
                : enabled.current
                  ? listeningText()
                  : "Session ended",
            );
          listen();
        }
      }
    }
    return !failed && id === generation.current;
  };
  /** Stop listening and release the microphone. The mic is never left on. */
  const endSession = (reason: string) => {
    endedStatus.current = reason;
    enabled.current = false;
    setRunning(false);
    runtimeRef.current = false;
    setRuntime(null);
    ++generation.current;
    busy.current = false;
    controller.current?.abort();
    controller.current = null;
    recognition.current?.abort();
    stopVoice();
    speaking.current = false;
    setTalking(false);
    bargeIn.current?.close();
    bargeIn.current = null;
    if (quietTimer.current !== null) window.clearInterval(quietTimer.current);
    quietTimer.current = null;
    setStatus(reason);
  };
  /** After a quiet minute ECHO stops listening on its own. */
  const watchQuiet = () => {
    lastActivity.current = Date.now();
    if (quietTimer.current !== null) window.clearInterval(quietTimer.current);
    quietTimer.current = window.setInterval(() => {
      if (!enabled.current || busy.current || speaking.current || typing.current) {
        if (typing.current) lastActivity.current = Date.now();
        return;
      }
      if (Date.now() - lastActivity.current > QUIET_PAUSE_MS)
        endSession("Paused after a quiet minute. Tap Start session to talk again.");
    }, 5000);
  };
  const start = () => {
    if (enabled.current) {
      endSession("Session ended. Tap Start session to talk again.");
      return;
    }
    if (!window.isSecureContext) {
      setStatus(
        "Microphone access needs the secure HTTPS app link. A desktop LAN address over HTTP will not work on your phone.",
      );
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      noSpeech.current = true;
      enabled.current = true;
      setRunning(true);
      void submit("start my day", false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    recognition.current = rec;
    rec.onresult = (e: any) => {
      lastActivity.current = Date.now();
      if (
        !enabled.current ||
        typing.current ||
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
    setStatus(listeningText());
    watchQuiet();
    void createBargeIn(() => {
      if (speaking.current && enabled.current) interrupt();
    }).then((watcher) => {
      if (enabled.current) bargeIn.current = watcher;
      else watcher?.close();
    });
    try {
      if (!typing.current) rec.start();
      void submit("start my day", false);
    } catch {
      enabled.current = false;
      setRunning(false);
      setStatus(
        "Microphone could not start. Check browser permissions and try again.",
      );
    }
  };
  const interrupt = () => {
    bargeIn.current?.disarm();
    lastActivity.current = Date.now();
    ++generation.current;
    busy.current = false;
    controller.current?.abort();
    controller.current = null;
    stopVoice();
    speaking.current = false;
    setTalking(false);
    if (enabled.current) {
      setStatus(listeningText());
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
        if (
          (e.target as HTMLElement)?.closest(
            "button,a,input,textarea,select,[contenteditable]",
          )
        )
          return;
        e.preventDefault();
        interrupt();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const presenceMode =
    talking || speaking.current
      ? "speaking"
      : busy.current
        ? "thinking"
        : running
          ? "listening"
          : "idle";
  const activeSide = (state.side || "home") as Side;
  const activePortrait = gallery[activeSide] || gallery.home || portrait;
  const typedToggle = (open: boolean) => {
    typing.current = open;
    if (open) recognition.current?.abort();
    else listen();
  };
  const runtimeLabel = !runtime
    ? "Not connected to Nebius yet"
    : "limited" in runtime
      ? runtime.limited === "budget"
        ? "Today's AI budget is used · built-in commands still work"
        : runtime.limited === "credit"
          ? "Nebius refused the request · built-in commands still work"
          : "AI model unreachable · built-in commands still work"
      : `Live Nebius session · ${runtime.model} · verified ${new Date(runtime.verified_at).toLocaleTimeString()}`;
  if (ghost)
    return (
      <GhostMode
        key={portraitEpoch}
        imageUrl={activePortrait}
        config={ghostConfig}
        onConfig={updateGhostConfig}
        onPhoto={(file) => void setSidePortrait(activeSide, file)}
        onControlsChange={() => typedToggle(false)}
        speechLevel={speechLevel}
        mode={presenceMode}
        running={running}
        onSession={start}
        onInterrupt={interrupt}
        status={status}
        onExit={() => {
          typedToggle(false);
          setGhost(false);
        }}
      >
        <p className="runtime-proof">{runtimeLabel}</p>
        <p className="runtime-proof voice-proof">{voiceLabel}</p>
        <TypeInstead onSubmit={(text) => submit(text)} onToggle={typedToggle} />
      </GhostMode>
    );
  return (
    <main>
      <header>
        <a className="brand" href="/">
          THE OTHER <span>SIDE</span>
        </a>
        <div className="controls">
          <button className="primary" onClick={start}>
            {running ? "Stop listening" : "Start session"}
          </button>
          {running && (
            <button className="interrupt-echo" onClick={interrupt}>
              Interrupt ECHO
            </button>
          )}
          <button
            aria-pressed={muted}
            onClick={() => {
              const value = !muted;
              setMuted(value);
              mutedRef.current = value;
              if (value) {
                stopVoice();
                speaking.current = false;
                setTalking(false);
                if (enabled.current && !busy.current) setStatus(listeningText());
                listen();
              }
            }}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            onClick={() =>
              setStatus(
                "Open the secure app link in your phone browser and allow the microphone. Keep this page open during your session. Browser speech recognition may send audio to its provider. Tap Interrupt ECHO to speak; Space also works on desktop.",
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
        <div className="eyebrow">THE OTHER SIDE · VOICE FIRST</div>
        <h1>Meet the you on the other side.</h1>
        <p>
          Speak freely. ECHO listens, remembers, and shows you where your
          choices lead.
        </p>
      </section>
      <TypeInstead
        onSubmit={(text) => submit(text)}
        onToggle={(open) => {
          typing.current = open;
          if (open) recognition.current?.abort();
          else listen();
        }}
      />
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
          <EchoStage
            imageUrl={activePortrait}
            speechLevel={speechLevel}
            mode={presenceMode}
            config={ghostConfig}
            onConfig={updateGhostConfig}
            onPhoto={(file) => void setSidePortrait(activeSide, file)}
            onProject={() => setGhost(true)}
          />
          <div className="presence-footer">
            ONE POSSIBLE FUTURE · 52 WEEKS OUT
            <span>
              SCENARIO, NOT PREDICTION · PHOTO AND CAMERA STAY ON THIS DEVICE
            </span>
            <p className="runtime-proof">{runtimeLabel}</p>
            <p className="runtime-proof voice-proof">{voiceLabel}</p>
          </div>
        </section>
        <aside>
          <FuturePortrait
            key={portraitEpoch}
            session={session}
            onUse={(side, blob) =>
              void useGeneratedPortrait(side as Side, blob)
            }
          />
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
                its provider. Your goals, memories and check-ins are stored by the
                server that runs this app (this computer when run locally). Your
                device-only Photo stays in this browser; say “forget my photo”
                to delete it. Preview your future self has a separate, consented
                photo request when an image service is configured. The face scan
                measures on this device and sends Nebius only the ratio numbers
                for its future projection.
              </p>
              <p>
                Say “export my data” to download everything I keep about you.
                Say “delete all my data” to erase it all, photo included; I’ll
                ask you to confirm first.
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
          {state.daily?.mission && (
            <div className="card">
              <div className="eyebrow">
                {state.daily.mission.done
                  ? "MISSION COMPLETE"
                  : "YOUR DAILY MISSION"}{" "}
                · {state.daily.mission.minutes} MIN
              </div>
              <p>{state.daily.mission.goal}</p>
              <ol>
                {state.daily.mission.steps.map((step, index) => (
                  <li key={index}>
                    {step.minutes} min — {step.text}
                  </li>
                ))}
              </ol>
              <p>{state.daily.mission.basis}</p>
              <small>{state.daily.mission.disclaimer}</small>
              <MissionSources
                key={JSON.stringify(state.daily.mission.key)}
                session={session}
                mission={state.daily.mission}
                available={tavilyConfigured}
                onResult={(research, revision) => {
                  const key = JSON.stringify(state.daily.mission?.key);
                  setState((previous) => {
                    if (
                      !previous.daily.mission ||
                      previous.revision > revision ||
                      JSON.stringify(previous.daily.mission.key) !== key
                    )
                      return previous;
                    return {
                      ...previous,
                      revision,
                      daily: {
                        ...previous.daily,
                        mission: { ...previous.daily.mission, research },
                      },
                    };
                  });
                }}
              />
            </div>
          )}
          {state.daily?.schedule?.enabled && (
            <p>
              Daily check-in · {state.daily.schedule.time} ·{" "}
              {state.daily.schedule.timezone}. In-app only. Say “stop reminders”
              to cancel.
            </p>
          )}
          {!!state.daily?.messages.length && (
            <div className="card" aria-live="polite">
              <div className="eyebrow">
                LATEST CHECK-IN · {state.daily.messages.at(-1)?.date}
              </div>
              <p>{state.daily.messages.at(-1)?.text}</p>
            </div>
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
            <p>“My goal is to learn Python.” · “What is my mission?”</p>
            <p>“Mission complete.” · “Remind me daily at 9 AM.”</p>
            <p>“Show me my dream life.” · “What if I drift?”</p>
            <p>
              “Turn on the lab.” then “Check in: slept six, energy three, stress
              four, forty minutes, done.”
            </p>
            <p>“That was too much.” · “Come back.” · “Undo that.”</p>
            <p>“Follow my head.” · “Hologram mode.” · “Real mode.”</p>
            <p>“Scan my face.” · “Close.”</p>
            <p>“Export my data.” · “Delete all my data.”</p>
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
          <span>YOUR MESSAGE · SPOKEN OR TYPED</span>
          <p>{heard || "Your words appear here when you speak or type."}</p>
        </div>
        {did && <div className="action">DID · {did}</div>}
      </section>
      <FaceScan
        open={scanOpen}
        photoUrl={portrait}
        session={session}
        side={state.side}
        aura={state.appearance?.aura}
        replay={scanReplay}
        onClose={() => setScanOpen(false)}
      />
      <footer>
        <span>VOICE FIRST. ALWAYS YOUR CHOICE.</span>
        <span>
          {runtime && "model" in runtime
            ? "LIVE · NVIDIA NEMOTRON ON NEBIUS"
            : runtime
              ? "LIMITED SESSION · NO LIVE MODEL"
              : configured
                ? "NEBIUS CONFIGURED · NOT CONNECTED YET"
                : "API NOT CONFIGURED"}
        </span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
