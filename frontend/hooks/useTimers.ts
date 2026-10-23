"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getTimers } from "@/lib/api";
import type { TimerEntry } from "@/lib/api";
import { ringChime } from "@/lib/timerSound";

export function useTimers({ onFire }: { onFire?: (t: TimerEntry) => void } = {}) {
  const [timers, setTimers] = useState<TimerEntry[]>([]);
  const fireRef = useRef(onFire);
  fireRef.current = onFire;
  const firedRef = useRef<Set<string>>(new Set());
  const stopRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ring = useCallback(() => {
    ringChime();
  }, []);

  useEffect(() => {
    stopRef.current = false;
    const poll = async () => {
      if (stopRef.current) return;
      try {
        const res = await getTimers();
        if (stopRef.current) return;
        setTimers(res.timers);
        for (const t of res.timers) {
          if (t.fired && !firedRef.current.has(t.id)) {
            firedRef.current.add(t.id);
            fireRef.current?.(t);
          }
        }
      } catch {}
      if (!stopRef.current) timerRef.current = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      stopRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { timers, ring };
}

export default useTimers;
