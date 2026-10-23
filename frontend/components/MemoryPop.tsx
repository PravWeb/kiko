"use client";

import React, { useState } from "react";
import { Brain, Plus, Trash2, X, ShieldCheck } from "lucide-react";

interface Props {
  memory: Record<string, string>;
  onAdd?: (key: string, value: string) => void;
  onDelete?: (key: string) => void;
  onClear?: () => void;
  onClose: () => void;
}

export function MemoryPop({ memory, onAdd, onDelete, onClear, onClose }: Props) {
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newVal.trim()) return;
    onAdd?.(newKey.trim(), newVal.trim());
    setNewKey("");
    setNewVal("");
  };

  const entries = Object.entries(memory);

  return (
    <div className="memory-popover" onClick={(e) => e.stopPropagation()}>
      <div className="memory-pop-header">
        <div className="memory-pop-title">
          <Brain size={14} className="text-purple" />
          <span>Long-Term Memory</span>
          <span className="memory-badge">{entries.length} facts</span>
        </div>
        <button type="button" className="memory-close-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="memory-note">
        <ShieldCheck size={12} className="text-emerald" />
        <span>Persisted locally in <code>backend/data/memory.json</code>. Kiko remembers these across restarts.</span>
      </div>

      <div className="memory-list">
        {entries.length === 0 ? (
          <div className="memory-empty">
            No memories stored yet. Tell Kiko <i>&quot;My name is...&quot;</i> or <i>&quot;Remember that I like Python&quot;</i>, or add a fact below.
          </div>
        ) : (
          entries.map(([k, v]) => (
            <div key={k} className="memory-item">
              <div className="memory-content">
                <span className="memory-key">{k}</span>
                <span className="memory-val">{v}</span>
              </div>
              {onDelete && (
                <button
                  type="button"
                  className="memory-del-btn"
                  onClick={() => onDelete(k)}
                  title={`Forget ${k}`}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {onAdd && (
        <form className="memory-add-form" onSubmit={handleAdd}>
          <input
            type="text"
            className="memory-input"
            placeholder="Key (e.g. name)"
            value={newKey}
            maxLength={40}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <input
            type="text"
            className="memory-input val"
            placeholder="Value (e.g. Praveen)"
            value={newVal}
            maxLength={250}
            onChange={(e) => setNewVal(e.target.value)}
          />
          <button type="submit" className="memory-add-btn" disabled={!newKey.trim() || !newVal.trim()}>
            <Plus size={12} /> Add
          </button>
        </form>
      )}

      {entries.length > 0 && onClear && (
        <div className="memory-footer">
          <button type="button" className="memory-clear-btn" onClick={onClear}>
            Clear All Memory
          </button>
        </div>
      )}
    </div>
  );
}

export default MemoryPop;
