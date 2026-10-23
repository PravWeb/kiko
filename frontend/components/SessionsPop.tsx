"use client";

import { Clock3, MessageSquare, Trash2 } from "lucide-react";
import type { ChatSession } from "@/hooks/useSession";

export function SessionsPop({ sessions, currentId, onSelect, onDelete }: {
  sessions: ChatSession[];
  currentId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="sessions-popover">
      <div className="sessions-pop-title"><Clock3 size={13} /> Recent chats <span>{sessions.length}</span></div>
      <div className="sessions-list">
        {sessions.map((session) => (
          <div key={session.id} className={`session-row ${session.id === currentId ? "current" : ""}`}>
            <button className="session-select" onClick={() => onSelect(session.id)} title={session.title}>
              <MessageSquare size={13} />
              <span className="session-copy">
                <b>{session.title || "New chat"}</b>
                <small>{session.messages.length} messages · {new Date(session.updatedAt).toLocaleString()}</small>
              </span>
            </button>
            <button className="session-delete" onClick={() => onDelete(session.id)} title="Delete this chat" aria-label={`Delete ${session.title}`}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {!sessions.length && <p className="session-empty">Chats are saved on this device.</p>}
      </div>
      <p className="session-footnote">Saved locally in this browser. Up to 40 chats.</p>
    </div>
  );
}
