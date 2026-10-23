"use client";

import { useCallback, useState } from "react";
import JSZip from "jszip";
import type { Msg } from "@/components/ControlPanel";

export function useSession(initial: Msg[] = []) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [exporting, setExporting] = useState(false);

  const exportMarkdown = useCallback(() => {
    const lines: string[] = ["# Kiko session transcript", "", `Exported: ${new Date().toISOString()}`, ""];
    for (const m of msgs) {
      lines.push(`## ${m.role === "user" ? "You" : "Kiko"}`);
      lines.push("");
      lines.push(m.text);
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcript.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [msgs]);

  const exportZip = useCallback(async () => {
    setExporting(true);
    try {
      const zip = new JSZip();
      const lines: string[] = ["# Kiko session transcript", "", `Exported: ${new Date().toISOString()}`, ""];
      for (const m of msgs) {
        lines.push(`## ${m.role === "user" ? "You" : "Kiko"}`);
        lines.push("");
        lines.push(m.text);
        lines.push("");
        if (m.url) {
          try {
            const res = await fetch(m.url);
            const blob = await res.blob();
            zip.file(`kiko-${m.id}.wav`, blob);
          } catch {}
        }
      }
      zip.file("transcript.md", lines.join("\n"));
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "kiko-session.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [msgs]);

  return { msgs, setMsgs, exporting, exportMarkdown, exportZip };
}

export default useSession;
