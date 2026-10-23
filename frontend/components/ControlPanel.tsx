"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen, Brain, Check, ChevronDown, Copy, Download, FileText, FolderOpen,
  Globe, Loader2, MessageSquare, Mic, Paperclip, Play, Plus, Radio, Send, SlidersHorizontal,
  Sparkles, Target, Timer, Trash2, Volume2, Zap,
} from "lucide-react";
import { MemoryPop } from "./MemoryPop";
import { StreamingMarkdown } from "./StreamingMarkdown";
import {
  type DocMeta,
  type TimerEntry,
  type TutorResult,
  type Voice,
} from "@/lib/api";

export type Mode = "chat" | "voice" | "read" | "tutor" | "docs";
export type Msg = {
  id: number;
  role: "user" | "ai";
  text: string;
  url?: string;
  dur?: number;
  emotion?: string;
  toolLabel?: string;
  audioLoading?: boolean;
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
  webSearchOn?: boolean;
  setWebSearchOn?: (b: boolean) => void;
  brain?: "fast" | "smart";
  setBrain?: (b: "fast" | "smart") => void;
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
  // export & session
  onExportMd: () => void;
  onExportZip: () => void;
  exporting: boolean;
  onClearSession?: () => void;
  // uploads
  onReadUpload?: (f: File) => void;
  onVoiceUpload?: (f: File) => void;
  // memory
  memory?: Record<string, string>;
  onAddMemory?: (key: string, value: string) => void;
  onDeleteMemory?: (key: string) => void;
  onClearMemory?: () => void;
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
  audioLoadingId?: number | null;
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
  const [memoryOpen, setMemoryOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tuneRef = useRef<HTMLDivElement>(null);
  const memoryRef = useRef<HTMLDivElement>(null);

  // close popovers on outside click / escape
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
      if (tuneOpen && tuneRef.current && !tuneRef.current.contains(e.target as Node))
        setTuneOpen(false);
      if (memoryOpen && memoryRef.current && !memoryRef.current.contains(e.target as Node))
        setMemoryOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setTuneOpen(false);
        setMemoryOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen, tuneOpen, memoryOpen]);

  // autoscroll on new message, stream tokens, and tutor result
  const lastMsgText = p.msgs[p.msgs.length - 1]?.text ?? "";
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.msgs.length, lastMsgText, p.tutorResult, p.readProgress, p.chatBusy, p.docsBusy]);

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
          {p.onClearSession && (
            <button
              className="head-pill-btn new-chat-btn"
              onClick={p.onClearSession}
              title="Start a fresh conversation"
            >
              <Plus size={12} /> new chat
            </button>
          )}

          <div className="memory-trigger-wrap" ref={memoryRef}>
            <button
              className={`head-pill-btn memory-pill-btn ${memoryOpen ? "on" : ""}`}
              onClick={() => setMemoryOpen((o) => !o)}
              title="View & manage Kiko's persistent memory"
            >
              <Brain size={12} /> memory
              {p.memory && Object.keys(p.memory).length > 0 && (
                <span className="memory-count-dot">{Object.keys(p.memory).length}</span>
              )}
            </button>
            {memoryOpen && (
              <MemoryPop
                memory={p.memory ?? {}}
                onAdd={p.onAddMemory}
                onDelete={p.onDeleteMemory}
                onClear={p.onClearMemory}
                onClose={() => setMemoryOpen(false)}
              />
            )}
          </div>

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
        {p.msgs.map((m, idx) => (
          <div key={m.id} className={`bubble-msg ${m.role}`}>
            <div className="bubble-header">
              <span className="who">{m.role === "user" ? "You" : "Kiko"}</span>
              {m.emotion && m.emotion !== "neutral" && (
                <span className={`emo-badge ${m.emotion}`}>{m.emotion}</span>
              )}
              {m.toolLabel && (
                <span className={`tool-chip ${m.toolLabel.includes("web") ? "web" : m.toolLabel.includes("doc") ? "doc" : ""}`}>
                  {m.toolLabel.includes("web") ? <Globe size={11} /> : m.toolLabel.includes("doc") ? <FileText size={11} /> : <Sparkles size={11} />} {m.toolLabel}
                </span>
              )}
            </div>
            <div className="bbody">
              {m.role === "ai" ? (
                <StreamingMarkdown
                  content={m.text}
                  isStreaming={(p.chatBusy || p.docsBusy) && idx === p.msgs.length - 1}
                />
              ) : (
                <div className="user-text">{m.text}</div>
              )}
              {m.role === "ai" && m.text && (
                <div className="mini">
                  {m.audioLoading || p.audioLoadingId === m.id ? (
                    <span className="mini-loading" title="Generating full MP3 voice...">
                      <Loader2 size={11} className="spin-icon" /> generating voice…
                    </span>
                  ) : m.url ? (
                    <>
                      <button className="mini-btn" onClick={() => p.onReplay(m.url!)}>
                        <Play size={11} /> replay
                      </button>
                      <a className="mini-btn" href={m.url} download={`kiko-${m.id}.mp3`}>
                        <Download size={11} /> save mp3
                      </a>
                    </>
                  ) : (
                    p.onSpeakMsg && (
                      <button className="mini-btn" onClick={() => p.onSpeakMsg!(m.id, m.text)}>
                        <Volume2 size={11} /> listen
                      </button>
                    )
                  )}
                  <button
                    className="mini-btn"
                    onClick={() => navigator.clipboard.writeText(m.text)}
                    title="Copy response"
                  >
                    <Copy size={11} /> copy
                  </button>
                  {m.dur && !m.audioLoading && p.audioLoadingId !== m.id ? (
                    <span className="dur-tag">{m.dur.toFixed(1)}s</span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}
        {p.chatBusy && p.msgs[p.msgs.length - 1]?.role !== "ai" && (
          <div className="bubble-msg ai">
            <span className="who">Kiko</span>
            <div className="bbody typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}

        {/* tutor score as a stream reply */}
        {p.mode === "tutor" && p.tutorResult && (
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
            {p.setWebSearchOn && (
              <button
                className={`toggle ${p.webSearchOn ? "on web-on" : ""}`}
                onClick={() => p.setWebSearchOn?.(!p.webSearchOn)}
                title="Search the live web with DuckDuckGo"
              >
                <Globe size={12} /> {p.webSearchOn ? "web on" : "web"}
              </button>
            )}
            {p.setBrain && (
              <button
                className={`toggle brain-mode ${p.brain === "fast" ? "fast" : "smart"}`}
                onClick={() => p.setBrain?.(p.brain === "fast" ? "smart" : "fast")}
                title={p.brain === "fast" ? "Fast Brain (0.6B) · sub-1.5s instant turns" : "Smart Brain (1.7B) · deep reasoning & coding"}
              >
                {p.brain === "fast" ? <><Zap size={11} /> fast</> : <><Brain size={11} /> smart</>}
              </button>
            )}
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

        {/* docs: quick toggles row */}
        {p.mode === "docs" && (
          <div className="composer-settings-row">
            {p.setWebSearchOn && (
              <button
                className={`toggle ${p.webSearchOn ? "on web-on" : ""}`}
                onClick={() => p.setWebSearchOn?.(!p.webSearchOn)}
                title="Search live web alongside document context"
              >
                <Globe size={12} /> {p.webSearchOn ? "web + docs on" : "web search"}
              </button>
            )}
            {p.setBrain && (
              <button
                className={`toggle brain-mode ${p.brain === "fast" ? "fast" : "smart"}`}
                onClick={() => p.setBrain?.(p.brain === "fast" ? "smart" : "fast")}
                title={p.brain === "fast" ? "Fast Brain (0.6B) · instant answers" : "Smart Brain (1.7B) · deep comprehension"}
              >
                {p.brain === "fast" ? <><Zap size={11} /> fast (0.6B)</> : <><Brain size={11} /> smart (1.7B)</>}
              </button>
            )}
            {p.recording && (
              <span className="listening-live">
                <span className="pulse-dot" /> listening to question…
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
              {p.mode === "read" && p.onReadUpload && (
                <label className="tool-btn" title="Import article / document (.pdf, .docx, .md, .txt)">
                  <FolderOpen size={13} /> import file
                  <input
                    type="file"
                    accept=".md,.markdown,.pdf,.docx,.txt,.csv,.json,.log,.rst"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) p.onReadUpload!(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
              {p.mode === "voice" && p.onVoiceUpload && (
                <label className="tool-btn" title="Load voiceover script (.txt, .md, .pdf, .docx)">
                  <FolderOpen size={13} /> load script
                  <input
                    type="file"
                    accept=".md,.markdown,.pdf,.docx,.txt,.csv,.json,.log,.rst"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) p.onVoiceUpload!(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
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
              {(p.mode === "chat" || p.mode === "voice" || p.mode === "tutor" || p.mode === "docs") && (
                <button
                  className={`mic-btn ${p.recording ? "rec" : ""}`}
                  onClick={p.mode === "tutor" ? p.onTutorRecord : p.onMicToggle}
                  title={
                    p.mode === "tutor"
                      ? "record and score"
                      : p.mode === "voice"
                        ? "speak instead of typing"
                        : p.mode === "docs"
                          ? "ask document with voice"
                          : "talk to Kiko"
                  }
                >
                  {p.recording ? <span className="stop-sq" /> : <Mic size={16} />}
                </button>
              )}
              {(p.mode === "chat" || p.mode === "voice" || p.mode === "docs") && p.recording && (
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
                      : "go"
                }
              >
                {p.mode === "chat" ? (p.chatBusy ? "…" : <Send size={15} />) : p.mode === "docs" ? (p.docsBusy ? "…" : <Send size={15} />) : (p.busy ? "…" : <Send size={15} />)}
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


/* ------------------------------------------------------------- intro card */
function ChatIntro({ p }: { p: Props }) {
  if (p.msgs.length || p.tutorResult) return null;
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
