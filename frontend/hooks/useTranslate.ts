"use client";

import { useCallback, useState } from "react";
import { speakRequest, translateRequest } from "@/lib/api";

type PlayBlob = (blob: Blob, url?: string, dur?: number, text?: string, karaoke?: boolean) => Promise<void>;

export function useTranslate() {
  const [direction, setDirection] = useState<"en-hi" | "hi-en">("en-hi");
  const [result, setResult] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const translate = useCallback(
    async (text: string, dir?: "en-hi" | "hi-en") => {
      const d = dir ?? direction;
      if (!text.trim()) return;
      setTranslating(true);
      try {
        const res = await translateRequest(text, d);
        setResult(res.text);
      } catch {
        setResult(null);
      } finally {
        setTranslating(false);
      }
    },
    [direction]
  );

  const speakResult = useCallback(
    async (voice = "af_heart", speed = 1, playBlob?: PlayBlob) => {
      if (!result) return;
      try {
        const { blob, duration } = await speakRequest({
          text: result,
          voice,
          speed,
        });
        const url = URL.createObjectURL(blob);
        if (playBlob) await playBlob(blob, url, duration, result, true);
      } catch {}
    },
    [result]
  );

  return { direction, setDirection, result, setResult, translating, translate, speakResult };
}

export default useTranslate;
