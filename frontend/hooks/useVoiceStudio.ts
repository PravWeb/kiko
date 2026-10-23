"use client";

import { useCallback, useRef, useState } from "react";
import { parseFile, speakRequest, transcribeRequest } from "@/lib/api";
import type { Msg } from "@/components/ControlPanel";
import type { Effect } from "@/lib/api";
import { useMic } from "@/hooks/useMic";

type PlayBlob = (blob: Blob, url?: string, dur?: number, text?: string, karaoke?: boolean) => Promise<void>;

export function useVoiceStudio({
  msgs,
  setMsgs,
  playBlob,
  toast,
}: {
  msgs: Msg[];
  setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>;
  playBlob: PlayBlob;
  toast: (t: string) => void;
}) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("af_heart");
  const [speed, setSpeed] = useState(1);
  const [effect, setEffect] = useState<Effect>("none");
  const [langFilter, setLangFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const mic = useMic();

  const generate = useCallback(
    async (raw?: string) => {
      const body = (raw ?? text).trim();
      if (!body || busy) return;
      setBusy(true);
      const msgId = ++idRef.current;
      setMsgs((m) => [
        ...m,
        { id: msgId, role: "ai", text: body, audioLoading: true },
      ]);
      try {
        const { blob, duration } = await speakRequest({
          text: body,
          voice,
          speed,
          effect,
        });
        const url = URL.createObjectURL(blob);
        setMsgs((m) =>
          m.map((x) =>
            x.id === msgId ? { ...x, url, dur: duration, audioLoading: false } : x
          )
        );
        await playBlob(blob, url, duration, body, true);
      } catch (e) {
        setMsgs((m) => m.filter((x) => x.id !== msgId));
        toast(e instanceof Error ? e.message : "Voice generation failed");
      } finally {
        setBusy(false);
      }
    },
    [text, busy, voice, speed, effect, setMsgs, playBlob, toast]
  );

  const onMicToggle = useCallback(async () => {
    if (mic.recording) {
      const blob = await mic.stop();
      if (!blob) return;
      try {
        const res = await transcribeRequest(blob);
        if (res.text) {
          setText(res.text);
          await generate(res.text);
        } else {
          toast("Didn't catch that — try again");
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Speech recognition failed");
      }
    } else {
      await mic.start();
    }
  }, [mic, generate, toast]);

  const uploadScript = useCallback(
    async (file: File) => {
      try {
        toast(`🎙 Parsing script ${file.name}...`);
        const res = await parseFile(file);
        if (res.text) {
          setText(res.text.slice(0, 2000));
          toast(`✓ Loaded ${res.name} (${res.words} words)`);
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to load script");
      }
    },
    [toast]
  );

  return {
    text,
    setText,
    voice,
    setVoice,
    speed,
    setSpeed,
    effect,
    setEffect,
    langFilter,
    setLangFilter,
    busy,
    generate,
    recording: mic.recording,
    level: mic.level,
    transcript: mic.transcript,
    onMicToggle,
    uploadScript,
  };
}

export default useVoiceStudio;
