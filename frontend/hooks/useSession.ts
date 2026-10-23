"use client";

import { useCallback, useEffect, useState } from "react";
import JSZip from "jszip";
import type { Msg } from "@/components/ControlPanel";

const STORAGE_KEY = "kiko_chat_session_v1";

export function useSession() {
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [exporting, setExporting] = useState(false);

  // Auto-persist messages to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const serializable = msgs.slice(-100).map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          emotion: m.emotion,
          toolLabel: m.toolLabel,
          dur: m.dur,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
      } catch {}
    }
  }, [msgs]);

  const clearSession = useCallback(() => {
    setMsgs([]);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, []);

  const exportMarkdown = useCallback(() => {
    const lines: string[] = [
      "# Kiko Session Transcript",
      "",
      `Exported: ${new Date().toLocaleString()}`,
      "Mode: 100% Offline AI Companion",
      "",
      "---",
      "",
    ];
    for (const m of msgs) {
      lines.push(`### ${m.role === "user" ? "You" : "Kiko"}`);
      if (m.emotion) lines.push(`*Emotion: ${m.emotion}*`);
      if (m.toolLabel) lines.push(`*Tool: ${m.toolLabel}*`);
      lines.push("");
      lines.push(m.text);
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kiko-transcript-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [msgs]);

  const exportZip = useCallback(async () => {
    setExporting(true);
    try {
      const zip = new JSZip();
      const lines: string[] = [
        "# Kiko Session Transcript & Audio",
        "",
        `Exported: ${new Date().toLocaleString()}`,
        "",
      ];
      for (const m of msgs) {
        lines.push(`### ${m.role === "user" ? "You" : "Kiko"}`);
        lines.push(m.text);
        lines.push("");
        if (m.url) {
          try {
            const res = await fetch(m.url);
            const blob = await res.blob();
            zip.file(`audio/kiko-${m.id}.mp3`, blob);
          } catch {}
        }
      }
      zip.file("transcript.md", lines.join("\n"));
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kiko-session-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [msgs]);

  return { msgs, setMsgs, clearSession, exporting, exportMarkdown, exportZip };
}

export default useSession;
