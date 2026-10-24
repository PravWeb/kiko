"use client";

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
        <div className="brand-copy">
          <div className="brand-title-row">
            <span className="brand-name">KIKO</span>
            <span className="brand-badge">VOICE AI</span>
          </div>
          <span className="brand-sub">on-device voice companion</span>
        </div>
      </div>
      <div className="status-row">
        <span
          className="chip privacy-chip"
          title="AI runs 100% on this device. Microphone audio never leaves your machine."
        >
          <ShieldCheck size={12} className="privacy-icon" />
          Local AI
        </span>
        <EngineBay status={status} onToggle={onToggleEngineBay} />
      </div>
    </header>
  );
}
