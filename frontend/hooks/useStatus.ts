"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStatus, getVoices, type Status, type Voice, type Languages } from "@/lib/api";

export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [languages, setLanguages] = useState<Languages | null>(null);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const voicesLoaded = useRef(false);
  const stopRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getStatus();
      setStatus(s);
      if (s.tts.ready && !voicesLoaded.current) {
        voicesLoaded.current = true;
        const v = await getVoices();
        setLanguages(v.languages);
        setVoices(v.voices);
      }
    } catch {}
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    stopRef.current = false;
    const poll = async () => {
      if (stopRef.current) return;
      try {
        const s = await getStatus();
        if (stopRef.current) return;
        setStatus(s);
        if (s.tts.ready && !voicesLoaded.current) {
          voicesLoaded.current = true;
          const v = await getVoices();
          if (!stopRef.current) {
            setLanguages(v.languages);
            setVoices(v.voices);
          }
        }
        if (!stopRef.current) {
          const ready = s.tts.ready && s.stt.ready;
          timerRef.current = setTimeout(poll, ready ? 5000 : 2000);
        }
      } catch {
        if (!stopRef.current) timerRef.current = setTimeout(poll, 3000);
      } finally {
        if (!stopRef.current) setLoading(false);
      }
    };
    poll();
    return () => {
      stopRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const llmReady = status?.llm.ready ?? false;
  const llmLoading = !llmReady && status !== null;

  return { status, languages, voices, loading, llmReady, llmLoading, refresh };
}

export default useStatus;
