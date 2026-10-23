"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import type { Msg } from "@/components/ControlPanel";

const STORAGE_KEY = "kiko_sessions_v2";
const LEGACY_KEY = "kiko_chat_session_v1";
const MAX_SESSIONS = 40;
const MAX_MESSAGES = 100;

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Msg[];
};

function newSession(): ChatSession {
  const now = Date.now();
  return { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, title: "New chat", createdAt: now, updatedAt: now, messages: [] };
}

function safeMessages(value: unknown): Msg[] {
  if (!Array.isArray(value)) return [];
  return value.filter((m): m is Msg => m && typeof m === "object" &&
    (m.role === "user" || m.role === "ai") && typeof m.text === "string")
    .slice(-MAX_MESSAGES).map((m) => ({
      id: Number.isFinite(m.id) ? m.id : 0,
      role: m.role,
      text: m.text,
      emotion: m.emotion,
      toolLabel: m.toolLabel,
      dur: m.dur,
    }));
}

function readSessions(): { sessions: ChatSession[]; currentId: string } {
  if (typeof window === "undefined") return { sessions: [], currentId: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { sessions?: ChatSession[]; currentId?: string };
      const sessions = Array.isArray(parsed.sessions) ? parsed.sessions.filter((s) => s && typeof s.id === "string") : [];
      if (sessions.length) {
        const currentId = sessions.some((s) => s.id === parsed.currentId) ? parsed.currentId! : sessions[0].id;
        return { sessions: sessions.slice(0, MAX_SESSIONS).map((s) => ({ ...s, messages: safeMessages(s.messages) })), currentId };
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    const first = newSession();
    if (legacy) {
      first.messages = safeMessages(JSON.parse(legacy));
      first.title = first.messages.find((m) => m.role === "user")?.text.slice(0, 48) || "Previous chat";
      first.updatedAt = Date.now();
    }
    return { sessions: [first], currentId: first.id };
  } catch {
    const first = newSession();
    return { sessions: [first], currentId: first.id };
  }
}

export function useSession() {
  const [initial] = useState(readSessions);
  const [bootstrap] = useState(() => initial.sessions.length ? initial : (() => { const s = newSession(); return { sessions: [s], currentId: s.id }; })());
  const [sessions, setSessions] = useState<ChatSession[]>(bootstrap.sessions);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [currentId, setCurrentId] = useState(bootstrap.currentId);
  const [msgs, setMsgs] = useState<Msg[]>(() => initial.sessions.find((s) => s.id === initial.currentId)?.messages ?? []);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const [exporting, setExporting] = useState(false);

  // Batch streamed updates: serializing every token made long replies stall the UI.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedMessages = safeMessages(msgs);
      const updated = sessionsRef.current.map((s) => s.id === currentId ? {
          ...s,
          messages: savedMessages,
          title: s.title === "New chat" ? (savedMessages.find((m) => m.role === "user")?.text.slice(0, 48) || s.title) : s.title,
          updatedAt: Date.now(),
        } : s).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
      setSessions(updated);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentId, sessions: updated })); } catch {}
    }, 450);
    return () => window.clearTimeout(timer);
  }, [msgs, currentId]);

  const snapshotCurrent = useCallback(() => {
    const savedMessages = safeMessages(msgsRef.current);
    const updated = sessionsRef.current.map((s) => s.id === currentId ? {
      ...s,
      messages: savedMessages,
      title: s.title === "New chat" ? (savedMessages.find((m) => m.role === "user")?.text.slice(0, 48) || s.title) : s.title,
      updatedAt: Date.now(),
    } : s).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
    sessionsRef.current = updated;
    setSessions(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentId, sessions: updated })); } catch {}
    return updated;
  }, [currentId]);

  const startNewSession = useCallback(() => {
    const previous = snapshotCurrent();
    const session = newSession();
    const updated = [session, ...previous].slice(0, MAX_SESSIONS);
    sessionsRef.current = updated;
    setSessions(updated);
    setCurrentId(session.id);
    setMsgs([]);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentId: session.id, sessions: updated })); } catch {}
  }, [snapshotCurrent]);

  const loadSession = useCallback((id: string) => {
    const latest = snapshotCurrent();
    const target = latest.find((s) => s.id === id);
    if (!target) return;
    setCurrentId(target.id);
    setMsgs(target.messages);
  }, [snapshotCurrent]);

  const deleteSession = useCallback((id: string) => {
    const latest = snapshotCurrent();
    let remaining = latest.filter((s) => s.id !== id);
    if (!remaining.length) remaining = [newSession()];
    const nextId = id === currentId ? remaining[0].id : currentId;
    sessionsRef.current = remaining;
    setSessions(remaining);
    if (id === currentId) {
      setCurrentId(nextId);
      setMsgs(remaining[0].messages);
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentId: nextId, sessions: remaining })); } catch {}
  }, [currentId, snapshotCurrent]);

  const exportMarkdown = useCallback(() => {
    const lines: string[] = ["# Kiko Session Transcript", "", `Exported: ${new Date().toLocaleString()}`, "Mode: Local AI Companion", "", "---", ""];
    for (const m of msgs) {
      lines.push(`### ${m.role === "user" ? "You" : "Kiko"}`);
      if (m.emotion) lines.push(`*Emotion: ${m.emotion}*`);
      if (m.toolLabel) lines.push(`*Tool: ${m.toolLabel}*`);
      lines.push("", m.text, "");
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `kiko-transcript-${Date.now()}.md`; a.click(); URL.revokeObjectURL(url);
  }, [msgs]);

  const exportZip = useCallback(async () => {
    setExporting(true);
    try {
      const zip = new JSZip();
      const lines: string[] = ["# Kiko Session Transcript & Audio", "", `Exported: ${new Date().toLocaleString()}`, ""];
      for (const m of msgs) {
        lines.push(`### ${m.role === "user" ? "You" : "Kiko"}`, m.text, "");
        if (m.url) try { zip.file(`audio/kiko-${m.id}.mp3`, await (await fetch(m.url)).blob()); } catch {}
      }
      zip.file("transcript.md", lines.join("\n"));
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      const a = document.createElement("a"); a.href = url; a.download = `kiko-session-${Date.now()}.zip`; a.click(); URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }, [msgs]);

  return { msgs, setMsgs, sessions, currentId, startNewSession, loadSession, deleteSession, exporting, exportMarkdown, exportZip };
}

export default useSession;
