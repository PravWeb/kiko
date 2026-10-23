"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen, ChevronDown, Download, FileText, FolderOpen, Languages,
  MessageSquare, Mic, Paperclip, Play, Radio, Send, SlidersHorizontal,
  Sparkles, Target, Timer, Volume2,
} from "lucide-react";
import {
  type DocMeta,
  type TimerEntry,
  type TutorResult,
  type Voice,
} from "@/lib/api";

export type Mode = "chat" | "voice" | "read" | "tutor" | "translate" | "docs";
export type Msg = {
  id: number;
  role: "user" | "ai";
  text: string;
  url?: string;
  dur?: number;
  emotion?: string;
  toolLabel?: string;
};

type Props = {
  mode: Mode;
  setMode: (m: Mode) => void;
  text: string;
  setText: (t: string) => void;
  busy: boolean;
  speaking: boolean;
  recording: boolean;
  level: number;
  transcript: string;
  voices: Voice[] | null;
  langFilter: string;
  setLangFilter: (l: string) => void;
  voice: string;
  setVoice: (v: string) => void;
  speed: number;
  setSpeed: (s: number) => void;
  effect: string;
  setEffect: (e: string) => void;
  voiceTab: "write" | "speak";
  setVoiceTab: (t: "write" | "speak") => void;
  onGenerate: () => void;
  onMicToggle: () => void;
  msgs: Msg[];
  onReplay: (url: string) => void;
  // chat
  chatBusy: boolean;
  onSendChat: (text?: string) => void;
  loopOn: boolean;
  setLoopOn: (b: boolean) => void;
  toolsOn: boolean;
  setToolsOn: (b: boolean) => void;
  chatLang: "en" | "hi";
  setChatLang: (l: "en" | "hi") => void;
  llmReady: boolean;
  llmLoading: boolean;
  timers: TimerEntry[];
  // read
  onSummarize: () => void;
  summarizing: boolean;
  onReadAloud: () => void;
  reading: boolean;
  readProgress: { i: number; n: number } | null;
  // tutor
  tutorTarget: string;
  setTutorTarget: (s: string) => void;
  onTutorRecord: () => void;
  tutorChecking: boolean;
  tutorResult: TutorResult | null;
  onTutorSpeak: () => void;
  // translate
  direction: "en-hi" | "hi-en";
  setDirection: (d: "en-hi" | "hi-en") => void;
  onTranslate: () => void;
  translating: boolean;
  translateResult: string | null;
  onSpeakTranslation: () => void;
  // export
  onExportMd: () => void;
  onExportZip: () => void;
  exporting: boolean;
  // docs (offline RAG)
  docList: DocMeta[];
  activeDocId: string | null;
  docsBusy: boolean;
  onDocUpload: (f: File) => void;
  onDocAsk: (q?: string) => void;
  onDocSummarize: () => void;
  onDocSelect: (id: string) => void;
  onDocDelete: (id: string) => void;
  onSpeakMsg?: (id: number, text: string) => void;
  // live voice + karaoke
  liveState?: "idle" | "listening" | "thinking" | "talking" | "happy" | null;
  timings?: { text: string; start: number; end: number }[];
  activeWord?: number;
};

const MODES: { id: Mode; Icon: typeof MessageSquare; label: string }[] = [
  { id: "chat", Icon: MessageSquare, label: "Chat" },
  { id: "voice", Icon: Radio, label: "Voice" },
  { id: "read", Icon: BookOpen, label: "Read" },
  { id: "tutor", Icon: Target, label: "Tutor" },
  { id: "translate", Icon: Languages, label: "Translate" },
  { id: "docs", Icon: Paperclip, label: "Docs" },
];

const EFFECTS = [
  { id: "none", label: "Clean" },
  { id: "pitch_up", label: "↑ Up" },
  { id: "pitch_down", label: "↓ Down" },
  { id: "chipmunk", label: "Chipmunk" },
  { id: "deep", label: "Deep" },
  { id: "robot", label: "Robot" },
  { id: "echo", label: "Echo" },
];

// showcase scope: English + Hindi only
const LANG_GROUPS = [
  { filter: "ALL", label: "All" },
  { filter: "en-us voices", label: "English (US)" },
  { filter: "en-gb voices", label: "English (UK)" },
  { filter: "hi voices", label: "हिंदी" },
];

function allowedVoice(v: Voice) {
  return /^(af|am|bf|bm|hf|hm)_/.test(v.id);
}

export function voiceMatchesFilter(v: Voice, f: string) {
  switch (f) {
    case "English (US)":
      return /^(af|am)_/.test(v.id);
    case "English (UK)":
      return /^(bf|bm)_/.test(v.id);
    case "हिंदी":
      return /^(hf|hm)_/.test(v.id);
    default:
      return true;
  }
}

const TUTOR_SAMPLES = [
  "The quick brown fox jumps over the lazy dog.",
  "She sells sea shells by the seashore.",
  "Kiko runs entirely offline, no internet needed.",
  "नमस्ते, मैं किको हूँ और मैं पूरी तरह ऑफलाइन चलती हूँ।",
  "यह लैपटॉप बिना इंटरनेट के भी सब कुछ कर सकता है।",
];

export default function ControlPanel(p: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tuneOpen, setTuneOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tuneRef = useRef<HTMLDivElement>(null);

  // close popovers on outside click / escape
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
      if (tuneOpen && tuneRef.current && !tuneRef.current.contains(e.target as Node))
        setTuneOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setTuneOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen, tuneOpen]);

  // autoscroll
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.msgs.length, p.translateResult, p.tutorResult, p.readProgress]);

  const shownVoices =
    p.voices?.filter((v) => allowedVoice(v) && voiceMatchesFilter(v, p.langFilter)) ?? [];
  const modeMeta = MODES.find((m) => m.id === p.mode)!;
  const speedStyle = {
    "--fill": `${((p.speed - 0.5) / 1.5) * 100}%`,
  } as CSSProperties;

  const composerPlaceholder: Record<Mode, string> = {
    chat: "Message Kiko…",
    voice: "Type anything — she speaks it out loud…",
    read: "Paste an article or document…",
    tutor: "Pick a sample below, or type a practice line…",
    translate: p.direction === "en-hi" ? "Type English — get Hindi…" : "हिंदी लिखें — अंग्रेज़ी में सुनें…",
    docs: "Ask anything about the uploaded file…",
  };

  return (
    <div className="panel">
      {/* ---------------------------------------------------------- HEAD */}
      <header className="panel-head">
        <div className="pselect" ref={menuRef}>
          <button className="pselect-btn" onClick={() => setMenuOpen((o) => !o)}>
            <span className="pselect-icon"><modeMeta.Icon size={15} /></span>
            <span className="pselect-label">{modeMeta.label}</span>
            <span className={`pselect-caret ${menuOpen ? "up" : ""}`}><ChevronDown size={14} /></span>
          </button>
          {menuOpen && (
            <div className="pselect-menu">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  className={`pselect-item ${p.mode === m.id ? "on" : ""}`}
                  onClick={() => {
                    p.setMode(m.id);
                    setMenuOpen(false);
                  }}
                >
                  <m.Icon size={15} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="head-right">
          {p.liveState && p.liveState !== "idle" && (
            <span className={`live-dot ${p.liveState}`}>
              {p.liveState === "listening"
                ? "listening…"
                : p.liveState === "thinking"
                  ? "thinking…"
                  : "speaking…"}
            </span>
          )}
          <span
            className={`brain-dot ${p.llmReady ? "ok" : p.llmLoading ? "load" : ""}`}
            title={
              p.llmReady
                ? "brain online"
                : p.llmLoading
                  ? "loading brain…"
                  : "brain idle — loads on first chat"
            }
          >
            {p.llmReady ? "brain online" : p.llmLoading ? "waking her up…" : "brain idle"}
          </span>
          <button
            className="icon-btn"
            onClick={p.onExportMd}
            disabled={!p.msgs.length}
            title="export transcript (.md)"
          >
            ⇩
          </button>
          <button
            className="icon-btn"
            onClick={p.onExportZip}
            disabled={!p.msgs.length || p.exporting}
            title={p.exporting ? "packing…" : "export full session (.zip)"}
          >
            {p.exporting ? "…" : "🗂"}
          </button>
        </div>
      </header>

      {/* -------------------------------------------------------- STREAM */}
      <div className="stream" ref={streamRef}>
        <ChatIntro p={p} />
        {p.msgs.map((m) => (
          <div key={m.id} className={`bubble-msg ${m.role}`}>
            <span className="who">{m.role === "user" ? "You" : "Kiko"}</span>
            <div className="bbody">
              {m.toolLabel && <span className="tool-chip"><Sparkles size={11} /> {m.toolLabel}</span>}
              {m.role === "ai" ? <MdLite text={m.text} /> : m.text}
              {m.role === "ai" && m.text && (
                <div className="mini">
                  {m.url ? (
                    <>
                      <button className="mini-btn" onClick={() => p.onReplay(m.url!)}>
                        <Play size={11} /> replay
                      </button>
                      <a className="mini-btn" href={m.url} download={`kiko-${m.id}.wav`}>
                        <Download size={11} /> save
                      </a>
                    </>
                  ) : (
                    p.onSpeakMsg && (
                      <button className="mini-btn" onClick={() => p.onSpeakMsg!(m.id, m.text)}>
                        <Volume2 size={11} /> listen
                      </button>
                    )
                  )}
                  {m.dur ? <span className="dur-tag">{m.dur.toFixed(1)}s</span> : null}
                </div>
              )}
            </div>
          </div>
        ))}
        {p.chatBusy && (
          <div className="bubble-msg ai">
            <span className="who">Kiko</span>
            <div className="bbody typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}

        {/* translate result as a stream reply */}
        {p.translateResult && (
          <div className="bubble-msg ai">
            <span className="who">Kiko</span>
            <div className="bbody">
              <span className="tool-chip"><Languages size={11} /> {p.direction === "en-hi" ? "EN → हिंदी" : "हिंदी → EN"}</span>
              <p className="tr-text">{p.translateResult}</p>
              <button className="mini-btn" onClick={p.onSpeakTranslation}>
                <Play size={11} /> hear it
              </button>
            </div>
          </div>
        )}

        {/* tutor score as a stream reply */}
        {p.tutorResult && (
          <div className="bubble-msg ai">
            <span className="who">Kiko</span>
            <div className="bbody tutor-result">
              <div className="score-ring" data-score={p.tutorResult.score}>
                <b>{p.tutorResult.score}</b>
                <span>/100</span>
              </div>
              <div className="score-words">
                {p.tutorResult.words.map((w, i) => (
                  <span key={i} className={`sword ${w.ok ? "ok" : "bad"}`}>
                    {w.word}
                  </span>
                ))}
              </div>
              <p className="score-msg">{p.tutorResult.message}</p>
            </div>
          </div>
        )}

        {/* tutor heard echo */}
        {p.mode === "tutor" && p.transcript && (
          <div className="bubble-msg user">
            <span className="who">Heard</span>
            <div className="bbody">{p.transcript}</div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------ COMPOSER */}
      {p.mode === "docs" && p.docList.length > 0 && (
        <div className="timer-row">
          {p.docList.map((d) => (
            <span
              key={d.id}
              className={`timer-chip doc-chip ${d.id === p.activeDocId ? "on" : ""}`}
            >
              <button
                className="chip-act"
                onClick={() => p.onDocSelect(d.id)}
                title={`${d.kind} · ${d.chunks} chunks`}
              >
                <FileText size={12} /> {d.name} · {d.words}w
              </button>
              <button
                className="chip-x"
                onClick={() => p.onDocDelete(d.id)}
                title="remove"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {p.timings && p.timings.length > 0 && (
        <div className="karaoke-strip">
          <span className="note"><Volume2 size={11} /> speaking</span>
          <span className="karaoke">
            {p.timings.map((t, i) => (
              <span key={i}>
                <span
                  className={`karaoke-word ${i === p.activeWord ? "active" : i < (p.activeWord ?? -1) ? "done" : ""}`}
                >
                  {t.text}
                </span>{" "}
              </span>
            ))}
          </span>
        </div>
      )}
      <div className="composer-zone">
        {p.timers.length > 0 && (
          <div className="timer-row">
            {p.timers.map((t) => (
              <span key={t.id} className={`timer-chip ${t.fired ? "fired" : ""}`}>
                <Timer size={12} /> {t.label} ·{" "}
                {t.fired
                  ? "done!"
                  : `${Math.floor(t.remaining_s / 60)}:${String(Math.floor(t.remaining_s % 60)).padStart(2, "0")}`}
              </span>
            ))}
          </div>
        )}

        {/* translate: direction segmented */}
        {p.mode === "translate" && (
          <div className="composer-settings-row">
            <div className="segmented">
              <button
                className={`seg ${p.direction === "en-hi" ? "on" : ""}`}
                onClick={() => p.setDirection("en-hi")}
              >
                EN → हिंदी
              </button>
              <button
                className={`seg ${p.direction === "hi-en" ? "on" : ""}`}
                onClick={() => p.setDirection("hi-en")}
              >
                हिंदी → EN
              </button>
            </div>
          </div>
        )}

        {/* chat: quick toggles row */}
        {p.mode === "chat" && (
          <div className="composer-settings-row">
            <button
              className={`toggle ${p.loopOn ? "on" : ""}`}
              onClick={() => p.setLoopOn(!p.loopOn)}
              title="auto-listen after each reply — a real conversation"
            >
              {p.loopOn ? "∞ hands-free on" : "∞ hands-free"}
            </button>
            <button
              className={`toggle ${p.toolsOn ? "on" : ""}`}
              onClick={() => p.setToolsOn(!p.toolsOn)}
              title="timers · calculator · memory"
            >
              {p.toolsOn ? "⚙ tools on" : "⚙ tools"}
            </button>
            <button
              className={`toggle ${p.chatLang === "hi" ? "on" : ""}`}
              onClick={() => p.setChatLang(p.chatLang === "hi" ? "en" : "hi")}
              title="Kiko replies in Hindi"
            >
              {p.chatLang === "hi" ? "हिंदी में बात" : "हिंदी"}
            </button>
            {p.recording && (
              <span className="listening-live">
                <span className="pulse-dot" /> listening…
              </span>
            )}
          </div>
        )}

        {/* tutor: sample chips */}
        {p.mode === "tutor" && (
          <div className="composer-settings-row sample-row">
            {TUTOR_SAMPLES.map((s) => (
              <button
                key={s}
                className={`sample-chip ${p.tutorTarget === s ? "on" : ""}`}
                onClick={() => p.setTutorTarget(s)}
              >
                {s.slice(0, 30)}
                {s.length > 30 ? "…" : ""}
              </button>
            ))}
          </div>
        )}

        <div className={`composer ${p.recording ? "rec" : ""}`}>
          <textarea
            className="composer-input"
            value={p.mode === "tutor" ? p.tutorTarget : p.text}
            maxLength={2000}
            rows={p.mode === "read" ? 3 : 1}
            placeholder={p.recording ? "listening… speak now" : composerPlaceholder[p.mode]}
            onChange={(e) => {
              if (p.mode === "tutor") p.setTutorTarget(e.target.value);
              else p.setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                fireMain(p);
              }
            }}
          />
          <div className="composer-tools">
            <div className="ct-left" ref={tuneRef}>
              <button
                className={`tool-btn ${tuneOpen ? "on" : ""}`}
                onClick={() => setTuneOpen((o) => !o)}
                title="voice, speed, effects"
              >
                <SlidersHorizontal size={13} /> tune
              </button>
              {tuneOpen && <TunePop {...p} speedStyle={speedStyle} voices={shownVoices} />}
            </div>

            <div className="ct-left ct-mic-wrap">
              {p.mode === "docs" && (
                <>
                  <label className="tool-btn" title="add a .md / .pdf / .docx">
                    <FolderOpen size={13} /> file
                    <input
                      type="file"
                      accept=".md,.markdown,.pdf,.docx,.txt,.csv,.json,.log,.rst"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) p.onDocUpload(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {p.docList.length > 0 && (
                    <button
                      className="tool-btn"
                      disabled={p.docsBusy}
                      onClick={p.onDocSummarize}
                      title="summarize the selected file"
                    >
                      <Sparkles size={13} /> summary
                    </button>
                  )}
                </>
              )}
              {(p.mode === "chat" || p.mode === "voice" || p.mode === "tutor") && (
                <button
                  className={`mic-btn ${p.recording ? "rec" : ""}`}
                  onClick={p.mode === "tutor" ? p.onTutorRecord : p.onMicToggle}
                  title={
                    p.mode === "tutor" ? "record and score" : p.mode === "voice" ? "speak instead of typing" : "talk to Kiko"
                  }
                >
                  {p.recording ? <span className="stop-sq" /> : <Mic size={16} />}
                </button>
              )}
              {(p.mode === "chat" || p.mode === "voice") && p.recording && (
                <span className="mic-hint mini-note">listening… tap to stop</span>
              )}
            </div>

            <div className="ct-right">
              {p.mode === "read" && (
                <>
                  <button
                    className="tool-btn"
                    onClick={p.onSummarize}
                    disabled={p.summarizing || p.text.trim().length < 10}
                  >
                    <Sparkles size={13} /> {p.summarizing ? "summarizing…" : "summarize"}
                  </button>
                  <button
                    className="tool-btn"
                    onClick={p.onReadAloud}
                    disabled={p.reading || !p.text.trim()}
                  >
                    {p.reading
                      ? `♪ ${p.readProgress ? `${p.readProgress.i}/${p.readProgress.n}` : "…"}`
                      : <><Play size={13} /> read aloud</>}
                  </button>
                </>
              )}
              {p.mode === "tutor" && (
                <button
                  className="tool-btn"
                  onClick={p.onTutorSpeak}
                  disabled={!p.tutorTarget.trim() || p.busy}
                >
                  <Volume2 size={13} /> hear it
                </button>
              )}
              <button
                className="send-btn"
                onClick={() => fireMain(p)}
                disabled={composerDisabled(p)}
                title={
                  p.mode === "chat"
                    ? "send"
                    : p.mode === "voice"
                      ? "generate"
                      : p.mode === "translate"
                        ? "translate"
                        : "go"
                }
              >
                {p.chatBusy || p.busy || p.translating || p.docsBusy ? "…" : <Send size={15} />}
              </button>
            </div>
          </div>
        </div>

        {p.reading && (
          <div className="read-bar">
            <div
              className="read-fill"
              style={{
                width: p.readProgress ? `${(p.readProgress.i / p.readProgress.n) * 100}%` : "10%",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function composerDisabled(p: Props) {
  const body = (p.mode === "tutor" ? p.tutorTarget : p.text).trim();
  switch (p.mode) {
    case "chat":
      return p.chatBusy || !body;
    case "voice":
      return p.busy || !body || p.recording || p.voiceTab === "speak";
    case "read":
      return p.reading || !body;
    case "tutor":
      return p.tutorChecking || !p.tutorTarget.trim();
    case "translate":
      return p.translating || !p.text.trim();
    case "docs":
      return p.docsBusy || !p.text.trim();
  }
}

function fireMain(p: Props) {
  switch (p.mode) {
    case "chat":
      p.onSendChat();
      break;
    case "voice":
      p.onGenerate();
      break;
    case "translate":
      p.onTranslate();
      break;
    case "read":
      p.onReadAloud();
      break;
    case "tutor":
      // recording flow handled by mic button; Enter just plays target
      p.onTutorSpeak();
      break;
    case "docs":
      p.onDocAsk(p.text.replace(/[ ]+$/, ""));
      break;
  }
}

/* --------------------------------------------------------------- tune pop */
function TunePop(p: Props & { speedStyle: CSSProperties; voices: Voice[] }) {
  return (
    <div className="tune-pop">
      <div className="tp-row lang-pills">
        {LANG_GROUPS.map((g) => (
          <button
            key={g.filter}
            className={`pill ${p.langFilter === g.filter ? "on" : ""}`}
            onClick={() => p.setLangFilter(g.filter)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="tp-row">
        <select
          className="voice-select"
          value={p.voice}
          onChange={(e) => p.setVoice(e.target.value)}
        >
          {!p.voices.length && <option>loading voices…</option>}
          {p.voices.map((v) => (
            <option key={v.id} value={v.id}>
              {(v.gender === "Female" ? "♀ " : "♂ ") + v.label} · {v.lang_name}
            </option>
          ))}
        </select>
      </div>
      <div className="tp-row speed-row">
        <label>speed</label>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.05}
          value={p.speed}
          style={p.speedStyle}
          onChange={(e) => p.setSpeed(Number(e.target.value))}
        />
        <span className="speed-val">{p.speed.toFixed(2)}×</span>
      </div>
      <div className="tp-row fx-row">
        <label>fx</label>
        {EFFECTS.map((f) => (
          <button
            key={f.id}
            className={`fx-chip ${p.effect === f.id ? "on" : ""}`}
            onClick={() => p.setEffect(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- code renderer */
function MdLite({ text }: { text: string }) {
  const parts = text.split(/```(?:\w+)?/);
  return (
    <div className="mdbody">
      {parts.map((chunk, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="code-blk">
            <code>{chunk.replace(/^[a-z]+\n/, "")}</code>
          </pre>
        ) : (
          <span key={i} className="prose">
            {chunk}
          </span>
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------- intro card */
function ChatIntro({ p }: { p: Props }) {
  if (p.msgs.length || p.translateResult || p.tutorResult) return null;
  const copy: Record<Mode, { Icon: typeof MessageSquare; title: string; sub: string }> = {
    chat: {
      Icon: MessageSquare,
      title: "Talk to Kiko",
      sub: "she answers out loud — flip hands-free for a real conversation",
    },
    voice: { Icon: Mic, title: "Voice studio", sub: "type it, she says it — 54 voices, 3 accents… your pick" },
    read: { Icon: BookOpen, title: "Read aloud", sub: "paste a document — she reads it with karaoke subtitles, or summarizes it" },
    tutor: { Icon: Target, title: "Pronunciation tutor", sub: "she says the line, you repeat it — whisper scores every word" },
    docs: { Icon: Paperclip, title: "Ask the doc", sub: "add a markdown, PDF or Word file — she reads it fully offline and answers from it" },
    translate: { Icon: Languages, title: "Translate & speak", sub: "English ⇄ Hindi, spoken aloud — fully offline" },
  };
  const c = copy[p.mode];
  return (
    <div className="chat-empty">
      <div className="ce-emoji"><c.Icon size={40} strokeWidth={1.5} /></div>
      <b>{c.title}</b>
      <p>{c.sub}</p>
      {p.mode === "chat" && (
        <div className="ce-suggestions">
          {["hey kiko, what can you do?", "set a timer for 10 seconds", "tell me a joke"].map((s) => (
            <button key={s} className="chip-suggest" onClick={() => p.onSendChat(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
