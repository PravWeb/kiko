"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { activeIndex, computeTimings, type WordTiming } from "@/lib/karaoke";
import type { CharState } from "@/lib/charState";

export function useSpeechPlayer() {
  const [audio] = useState<HTMLAudioElement>(() =>
    typeof window !== "undefined" ? new Audio() : (null as unknown as HTMLAudioElement)
  );
  const [charState, setCharState] = useState<CharState>("idle");
  const [busy, setBusy] = useState(false);
  const [timings, setTimings] = useState<WordTiming[]>([]);
  const [activeWord, setActiveWord] = useState(-1);

  const timingsRef = useRef<WordTiming[]>([]);
  const rafRef = useRef<number | null>(null);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timingsRef.current = timings;
  }, [timings]);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const a = audio;
    if (!a.paused) {
      setActiveWord(activeIndex(timingsRef.current, a.currentTime));
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [audio]);

  useEffect(() => {
    const a = audio;
    const onPlay = () => {
      if (happyTimer.current) clearTimeout(happyTimer.current);
      setCharState("talking");
      setBusy(true);
      stopRaf();
      rafRef.current = requestAnimationFrame(tick);
    };
    const onEnded = () => {
      stopRaf();
      setActiveWord(-1);
      setBusy(false);
      setCharState("happy");
      happyTimer.current = setTimeout(() => {
        setCharState((s) => (s === "happy" ? "idle" : s));
      }, 2400);
    };
    const onError = () => {
      stopRaf();
      setBusy(false);
      setCharState((s) => (s === "talking" || s === "thinking" ? "idle" : s));
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
      stopRaf();
      if (happyTimer.current) clearTimeout(happyTimer.current);
    };
  }, [audio, tick, stopRaf]);

  const playBlob = useCallback(
    (blob: Blob, url?: string, dur?: number, text?: string, karaoke = false) => {
      return new Promise<void>((resolve) => {
        const a = audio;
        const src = url ?? URL.createObjectURL(blob);
        a.pause();
        if (karaoke && text && dur && dur > 0) setTimings(computeTimings(text, dur));
        else setTimings([]);
        setActiveWord(-1);
        setBusy(true);
        setCharState("thinking");
        let finished = false;
        const cleanup = () => {
          if (finished) return;
          finished = true;
          a.removeEventListener("ended", onEnded);
          a.removeEventListener("error", onError);
          if (safety) window.clearTimeout(safety);
          setBusy(false);
          setCharState("idle");
          resolve();
        };
        const onEnded = () => {
          cleanup();
        };
        const onError = () => {
          cleanup();
        };
        // hard fallback: never let a stuck element hang the turn
        const timeoutMs = Math.max(2500, ((dur ?? 3) * 1000) + 1500);
        const safety = window.setTimeout(() => {
          try { a.pause(); } catch {}
          cleanup();
        }, timeoutMs);
        a.addEventListener("ended", onEnded);
        a.addEventListener("error", onError);
        a.src = src;
        a.play().catch(() => {
          cleanup();
        });
      });
    },
    [audio]
  );

  const play = useCallback(
    (url?: string) => {
      if (url) audio.src = url;
      audio.play().catch(() => {});
    },
    [audio]
  );

  const setBusyWrapped = useCallback((b: boolean) => setBusy(b), []);

  return {
    audio,
    charState,
    busy,
    setCharState,
    setBusy: setBusyWrapped,
    playBlob,
    play,
    timings,
    activeWord,
    activeWordIndex: activeWord,
  };
}

export default useSpeechPlayer;
