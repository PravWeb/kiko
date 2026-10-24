"use client";

import { useState } from "react";
import { ChevronDown, Cpu } from "lucide-react";
import { getMcpStatus, type McpStatus, type Status } from "@/lib/api";

type Props = {
  status: Status | null;
  onToggle?: () => void;
};

export default function EngineBay({ status, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [mcpLoaded, setMcpLoaded] = useState(false);
  const mem = status?.memory;

  const ttsReady = Boolean(status?.tts.ready);
  const sttReady = Boolean(status?.stt.ready);
  const llmReady = Boolean(status?.llm.ready || status?.llm.available);
  const allReady = Boolean(ttsReady && sttReady && llmReady);
  const isWarming = Boolean(status && !allReady);

  const statusClass = allReady ? "ok" : isWarming ? "load" : "";
  const statusLabel = allReady
    ? "System Ready"
    : isWarming
        ? !ttsReady || !sttReady
            ? "Voice Engines Warming"
            : "Brain Warming"
        : "Connecting…";

  return (
    <div className="engine-bay">
      <button
        type="button"
        className={`chip eb-trigger ${statusClass}`}
        onClick={() => {
          setOpen((v) => {
            if (!v && !mcpLoaded) {
              setMcpLoaded(true);
              void getMcpStatus().then(setMcp).catch(() => setMcp(null));
            }
            return !v;
          });
          onToggle?.();
        }}
        title="View on-device neural engines & memory status"
      >
        <span className="dot" />
        <span className="eb-trigger-label">{statusLabel}</span>
        <ChevronDown size={11} className={`eb-caret ${open ? "up" : ""}`} />
      </button>

      {open && (
        <div className="engine-bay-panel glass">
          <div className="eb-header">
            <div className="eb-title">
              <Cpu size={14} className="text-cyan" />
              <span>Neural Engines</span>
            </div>
            <span className="eb-badge">ON-DEVICE</span>
          </div>

          <div className="eb-engines-list">
            <div className="eb-engine-item">
              <div className="eb-engine-top">
                <span className="eb-engine-name">Speech (TTS)</span>
                <span className={`eb-badge-mini ${ttsReady ? "ok" : "load"}`}>
                  {ttsReady ? "Ready" : "Loading"}
                </span>
              </div>
              <span className="eb-engine-detail">Kokoro-82M fp16 (ONNX)</span>
            </div>

            <div className="eb-engine-item">
              <div className="eb-engine-top">
                <span className="eb-engine-name">Hearing (STT)</span>
                <span className={`eb-badge-mini ${sttReady ? "ok" : "load"}`}>
                  {sttReady ? "Ready" : "Loading"}
                </span>
              </div>
              <span className="eb-engine-detail">faster-whisper small (int8)</span>
            </div>

            <div className="eb-engine-item">
              <div className="eb-engine-top">
                <span className="eb-engine-name">Brain (LLM)</span>
                <span className={`eb-badge-mini ${llmReady ? "ok" : "load"}`}>
                  {llmReady ? "Dual-Brain Live" : "Idle"}
                </span>
              </div>
              <span className="eb-engine-detail">Qwen 0.6B Fast + 1.7B Smart</span>
            </div>
          </div>

          <div className="eb-divider" />

          <div className="eb-telemetry-row">
            <span className="eb-meta-label">Memory RSS</span>
            <b className="eb-meta-val">{mem?.rss_mb != null ? `${mem.rss_mb} MB` : "—"}</b>
          </div>

          <div className="eb-telemetry-row">
            <span className="eb-meta-label">MCP Server</span>
            <span className={`eb-meta-val ${mcp?.server.enabled ? "text-cyan" : ""}`}>
              {mcp ? (mcp.client.connected ? `${mcp.client.tools.length} remote tools` : "local ready · /mcp") : "checking…"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
