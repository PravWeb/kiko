"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { wsVoiceUrl } from "@/lib/api";
import type { CharState, Emotion } from "@/lib/charState";
import type { Msg } from "@/components/ControlPanel";

type ServerState = "listening" | "thinking" | "talking";

type Options = {
  msgs: Msg[];
  setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>;
  setCharState: (s: CharState) => void;
  toast: (t: string) => void;
  voice: string;
  lang: "en" | "hi";
  toolsOn: boolean;
};

type Queued = { url: string; text: string };

function encodePcm16(input: Float32Array, srcRate: number): Int16Array {
  // linear resample to 16 kHz mono then int16
  const n = Math.max(1, Math.round((input.length * 16000) / srcRate));
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const pos = i * (srcRate / 16000);
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = input[i0] ?? 0;
    const b = input[i0 + 1] ?? a;
    let v = a + (b - a) * frac;
    v = v < -1 ? -1 : v > 1 ? 1 : v;
    out[i] = (v * 32767) | 0;
  }
  return out;
}

export function useVoiceLive({
  msgs,
  setMsgs,
  setCharState,
  toast,
  voice,
  lang,
  toolsOn,
}: Options) {
  const [active, setActive] = useState(false);
  const [level, setLevel] = useState(0);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Queued[]>([]);
  const playingRef = useRef(false);
  const mutedRef = useRef(false);
  const activeRef = useRef(false);
  const levelRef = useRef(0);
  const speakingTailRef = useRef(0); // frames above barge-in threshold
  const replyRef = useRef("");
  const lastRef = useRef<{ url: string; dur: number } | null>(null);
  const emotionRef = useRef<string>("neutral");
  const toolRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const msgsRef = useRef(msgs);
  const voiceRef = useRef(voice);
  const langRef = useRef(lang);
  const toolsRef = useRef(toolsOn);

  msgsRef.current = msgs;
  voiceRef.current = voice;
  langRef.current = lang;
  toolsRef.current = toolsOn;

  const sendConfig = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    const history = msgsRef.current.slice(-8).map((m) => ({
      who: m.role === "user" ? "user" : "kiko",
      text: m.text,
    }));
    ws.send(JSON.stringify({
      type: "config",
      voice: voiceRef.current,
      lang: langRef.current,
      tools: toolsRef.current,
      history,
    }));
  }, []);

  const flushAiMsg = useCallback(() => {
    const reply = replyRef.current.trim();
    if (!reply) return;
    const url = lastRef.current?.url;
    const dur = lastRef.current?.dur;
    setMsgs((m) => [
      ...m,
      {
        id: ++idRef.current,
        role: "ai",
        text: reply,
        url,
        dur,
        emotion: emotionRef.current,
        toolLabel: toolRef.current ?? undefined,
      },
    ]);
    replyRef.current = "";
    lastRef.current = null;
  }, [setMsgs]);

  const playNext = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || playingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    playingRef.current = true;
    mutedRef.current = true; // don't feed our own playback back to the server
    setCharState("talking");
    audio.src = next.url;
    audio.play().catch(() => {
      playingRef.current = false;
      mutedRef.current = false;
    });
  }, [setCharState]);

  const clearQueue = useCallback((partial: boolean) => {
    queueRef.current = [];
    const audio = audioRef.current;
    if (audio && playingRef.current) {
      audio.pause();
      audio.currentTime = 0;
    }
    playingRef.current = false;
    if (!partial) flushAiMsg();
    mutedRef.current = false;
  }, [flushAiMsg]);

  const doInterrupt = useCallback(() => {
    const ws = wsRef.current;
    clearQueue(true);
    ws?.send(JSON.stringify({ type: "interrupt" }));
    setCharState(activeRef.current ? "listening" : "idle");
  }, [clearQueue, setCharState]);

  /* playback wiring */
  useEffect(() => {
    if (!active) return;
    const audio = new Audio();
    audio.onended = () => {
      playingRef.current = false;
      mutedRef.current = false;
      if (queueRef.current.length > 0) {
        playNext();
      } else {
        // reply (or its barge-in leftovers) is over — flush what we got
        flushAiMsg();
        setCharState(activeRef.current ? "listening" : "idle");
      }
    };
    audioRef.current = audio;
    return () => {
      audio.onended = null;
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      playingRef.current = false;
      mutedRef.current = false;
      queueRef.current = [];
    };
  }, [active, playNext, flushAiMsg, setCharState]);

  /* main streaming session */
  const start = useCallback(async () => {
    if (activeRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        },
      });
      const ctx = new AudioContext();
      await ctx.resume();
      const url = wsVoiceUrl();
      if (!url) throw new Error("no ws url");
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      let open = false;
      ws.onopen = () => {
        open = true;
        ws.send(JSON.stringify({
          type: "config",
          voice: voiceRef.current,
          lang: langRef.current,
          tools: toolsRef.current,
          history: [],
        }));
        void new Promise((r) => setTimeout(r, 500)).then(sendConfig);
      };

      const onBarge = () => doInterrupt();

      ws.onmessage = (e) => {
        if (typeof e.data === "string") {
          let ev: Record<string, unknown> = {};
          try { ev = JSON.parse(e.data); } catch { return; }
          const type = ev.type as string;
          if (type === "state") {
            const s = ev.state as ServerState;
            setListening(s === "listening");
            if (s === "listening" && activeRef.current) {
              // fresh turn coming — push latest config/history
              sendConfig();
              if (!playingRef.current) setCharState("listening");
            }
          } else if (type === "stt") {
            const text = String(ev.text ?? "").trim();
            setInterim(text);
            if (text) {
              setMsgs((m) => [
                ...m,
                { id: ++idRef.current, role: "user", text },
              ]);
            }
          } else if (type === "turn_start") {
            emotionRef.current = String(ev.emotion ?? "neutral");
            toolRef.current =
              Array.isArray(ev.tool_calls) && ev.tool_calls.length > 0
                ? String(ev.tool_calls[0].tool)
                : null;
            replyRef.current = "";
            setCharState("thinking");
          } else if (type === "sentence") {
            replyRef.current = `${replyRef.current} ${String(ev.text ?? "")}`.trim();
          } else if (type === "done") {
            // final flush happens when last audio ends; catch no-audio case
            void ev;
          } else if (type === "cleared") {
            flushAiMsg();
            setCharState(activeRef.current ? "listening" : "idle");
          } else if (type === "error") {
            toast(String(ev.detail ?? "voice error"));
          }
        } else {
          // binary WAV frame for the last announced sentence
          const blob = new Blob([e.data], { type: "audio/wav" });
          const burl = URL.createObjectURL(blob);
          const cur = queueRef.current.length;
          queueRef.current.push({ url: burl, text: "" });
          if (cur === 0) playNext();
        }
      };

      ws.onclose = () => {
        if (open) toast("Voice session ended");
      };

      /* audio capture: stream PCM16 frames while not muted */
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        const rms = Math.sqrt(sum / input.length);
        levelRef.current = rms;
        setLevel(rms);

        // barge-in watch while the agent is talking
        if (mutedRef.current && rms > 0.05) {
          speakingTailRef.current += 1;
          if (speakingTailRef.current >= 12) {
            speakingTailRef.current = 0;
            onBarge();
          }
        } else {
          speakingTailRef.current = 0;
        }

        if (!open || ws.readyState !== 1 || mutedRef.current) return;
        const pcm = encodePcm16(input, ctx.sampleRate);
        try {
          ws.send(pcm.buffer as ArrayBuffer);
        } catch {}
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      teardownRef.current = () => {
        try {
          source.disconnect();
          processor.disconnect();
        } catch {}
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        try { ws.close(); } catch {}
      };

      activeRef.current = true;
      setActive(true);
      setCharState("listening");
    } catch (err) {
      toast(err instanceof Error ? `Mic/voice failed: ${err.message}` : "Voice failed");
      activeRef.current = false;
      setActive(false);
    }
  }, [sendConfig, playNext, flushAiMsg, setMsgs, setCharState, toast, doInterrupt]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setListening(false);
    setLevel(0);
    setInterim("");
    clearQueue(false);
    speakingTailRef.current = 0;
    teardownRef.current?.();
    teardownRef.current = null;
    wsRef.current = null;
    setCharState("idle");
  }, [clearQueue, setCharState]);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else void start();
  }, [start, stop]);

  useEffect(() => () => {
    activeRef.current = false;
    teardownRef.current?.();
  }, []);

  return {
    active, level, listening, interim,
    start, stop, toggle,
  };
}

export default useVoiceLive;
