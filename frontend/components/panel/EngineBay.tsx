"use client";

import { useState } from "react";
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
  return (
    <div className="engine-bay">
      <button
        className="chip"
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
      >
        <span className="dot" style={{ background: "var(--amber)" }} />
        Engine Bay
      </button>
      {open && (
        <div className="engine-bay-panel glass">
          <div className="eb-row">
            <span>RSS</span>
            <b>{mem?.rss_mb != null ? `${mem.rss_mb} MB` : "—"}</b>
          </div>
          {mem?.engines &&
            Object.entries(mem.engines).map(([name, e]) => (
              <div key={name} className="eb-engine">
                <span className="eb-name">{name}</span>
                <span className={`eb-state ${e.loaded ? "ok" : ""}`}>
                  {e.loaded ? "loaded" : e.loading ? "loading" : "idle"}
                </span>
                <span className="eb-meta">
                  idle {e.idle_for_s != null ? `${Math.round(e.idle_for_s)}s` : "—"} · loads {e.loads} · unloads {e.unloads}
                </span>
              </div>
            ))}
          <div className="eb-engine">
            <span className="eb-name">MCP</span>
            <span className={`eb-state ${mcp?.server.enabled ? "ok" : ""}`}>
              {mcp ? (mcp.client.connected ? `${mcp.client.tools.length} remote tools` : mcp.client.configured ? "configured · offline" : "project server ready") : "checking…"}
            </span>
            <span className="eb-meta">local endpoint · /mcp</span>
          </div>
        </div>
      )}
    </div>
  );
}
