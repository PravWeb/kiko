"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { Status } from "@/lib/api";
import EngineBay from "@/components/panel/EngineBay";

type Props = {
  status: Status | null;
  onToggleEngineBay?: () => void;
};

export default function Header({ status, onToggleEngineBay }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-glyph" src="/kiko.png" alt="Kiko" draggable={false} />
        <div>
          <h1>KIKO</h1>
          <small>offline voice companion · 100% local</small>
        </div>
      </div>
      <div className="status-row">
        <span className={`chip ${status?.tts.ready ? "ok" : status ? "load" : ""}`}>
          <span className="dot" />
          TTS {status?.tts.ready ? "ready" : "loading"}
        </span>
        <span className={`chip ${status?.stt.ready ? "ok" : status ? "load" : ""}`}>
          <span className="dot" />
          STT {status?.stt.ready ? "ready" : "loading"}
        </span>
        <span className={`chip ${status?.llm.ready ? "ok" : status?.llm.available ? "load" : ""}`}>
          <span className="dot" style={{ background: "var(--violet)" }} />
          LLM {status?.llm.ready ? "ready" : status?.llm.available ? "loading" : "idle"}
        </span>
        <span className="chip privacy-chip" title="100% on-device AI. Zero cloud telemetry, zero API keys.">
          <ShieldCheck size={11} className="privacy-icon" />
          100% Offline
        </span>
        <EngineBay status={status} onToggle={onToggleEngineBay} />
      </div>
    </header>
  );
}
