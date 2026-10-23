"use client";

import { useCallback, useRef, useState } from "react";
import { parseFile, speakRequest, summarizeRequest } from "@/lib/api";
import { chunkText } from "@/lib/karaoke";

type PlayBlob = (blob: Blob, url?: string, dur?: number, text?: string, karaoke?: boolean) => Promise<void>;

export function useReadAloud({ playBlob, toast }: { playBlob: PlayBlob; toast: (t: string) => void }) {
  const [text, setText] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [reading, setReading] = useState(false);
  const [readProgress, setReadProgress] = useState<{ i: number; n: number } | null>(null);
  const cancelRef = useRef(false);

  const uploadFile = useCallback(
    async (file: File) => {
      try {
        toast(`📄 Parsing ${file.name}...`);
        const res = await parseFile(file);
        if (res.text) {
          setText(res.text);
          toast(`✓ Loaded ${res.name} (${res.words} words)`);
        } else {
          toast("No readable text found in file");
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "File parse failed");
      }
    },
    [toast]
  );

  const summarize = useCallback(async () => {
    if (!text.trim()) return;
    setSummarizing(true);
    try {
      const res = await summarizeRequest(text);
      setText(res.text);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Summarize failed");
    } finally {
      setSummarizing(false);
    }
  }, [text, toast]);

  const readAloud = useCallback(
    async (voice = "af_heart", speed = 1) => {
      const chunks = chunkText(text);
      if (!chunks.length) return;
      cancelRef.current = false;
      setReading(true);
      setReadProgress({ i: 0, n: chunks.length });
      for (let i = 0; i < chunks.length; i++) {
        if (cancelRef.current) break;
        setReadProgress({ i: i + 1, n: chunks.length });
        try {
          const { blob, duration } = await speakRequest({
            text: chunks[i],
            voice,
            speed,
          });
          const url = URL.createObjectURL(blob);
          await playBlob(blob, url, duration, chunks[i], true);
        } catch (e) {
          toast(e instanceof Error ? e.message : "Read failed");
          break;
        }
      }
      setReading(false);
    },
    [text, playBlob, toast]
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setReading(false);
  }, []);

  return { text, setText, summarizing, reading, readProgress, summarize, readAloud, cancel, uploadFile };
}

export default useReadAloud;
