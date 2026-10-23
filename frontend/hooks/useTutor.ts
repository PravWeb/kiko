"use client";

import { useCallback, useState } from "react";
import { speakRequest, transcribeRequest, tutorScoreRequest } from "@/lib/api";
import type { TutorResult } from "@/lib/api";
import { useMic } from "@/hooks/useMic";

type PlayBlob = (blob: Blob, url?: string, dur?: number, text?: string, karaoke?: boolean) => Promise<void>;

export function useTutor({ playBlob }: { playBlob: PlayBlob }) {
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<TutorResult | null>(null);
  const [checking, setChecking] = useState(false);
  const mic = useMic();

  const speakTarget = useCallback(async () => {
    if (!target.trim()) return;
    try {
      const { blob, duration } = await speakRequest({
        text: target,
        voice: "af_heart",
        speed: 1,
      });
      const url = URL.createObjectURL(blob);
      await playBlob(blob, url, duration, target, true);
    } catch {}
  }, [target, playBlob]);

  const recordAndScore = useCallback(async () => {
    if (mic.recording) {
      const blob = await mic.stop();
      if (!blob) return;
      setChecking(true);
      try {
        const res = await transcribeRequest(blob);
        const said = res.text;
        const score = await tutorScoreRequest(target, said);
        setResult(score);
      } catch (e) {
        setResult(null);
      } finally {
        setChecking(false);
      }
    } else {
      await mic.start();
    }
  }, [mic, target]);

  return {
    target,
    setTarget,
    result,
    setResult,
    checking,
    recording: mic.recording,
    level: mic.level,
    transcript: mic.transcript,
    speakTarget,
    recordAndScore,
  };
}

export default useTutor;
