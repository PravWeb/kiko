"use client";

import { useCallback, useRef, useState } from "react";
import { speakRequest, transcribeRequest } from "@/lib/api";
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
      try {
        const { blob, duration } = await speakRequest({
          text: body,
          voice,
          speed,
          effect,
        });
        const url = URL.createObjectURL(blob);
        setMsgs((m) => [
          ...m,
          { id: ++idRef.current, role: "ai", text: body, url, dur: duration },
        ]);
        await playBlob(blob, url, duration, body, true);
      } catch (e) {
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
  };
}

export default useVoiceStudio;
