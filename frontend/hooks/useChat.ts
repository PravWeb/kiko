"use client";

import { useCallback, useRef, useState } from "react";
import { chatStream, speakRequest } from "@/lib/api";
import type { Msg } from "@/components/ControlPanel";

type PlayBlob = (blob: Blob, url?: string, dur?: number, text?: string, karaoke?: boolean) => Promise<void>;

export function useChat({
  msgs,
  setMsgs,
  playBlob,
  startMic,
  toast,
  voice = "af_heart",
  lang = "en",
}: {
  msgs: Msg[];
  setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>;
  playBlob: PlayBlob;
  startMic: () => void | Promise<void>;
  toast: (t: string) => void;
  voice?: string;
  lang?: "en" | "hi";
}) {
  const [text, setText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [loopOn, setLoopOn] = useState(false);
  const [toolsOn, setToolsOn] = useState(true);
  const idRef = useRef(0);
  const emoRe = useRef(/\[emotion:\w+\]/g);

  const sendChat = useCallback(
    async (textOverride?: string) => {
      const body = (textOverride ?? text).trim();
      if (!body || chatBusy) return;
      setChatBusy(true);
      const userMsg: Msg = { id: ++idRef.current, role: "user", text: body };
      setMsgs((m) => [...m, userMsg]);
      setText("");
      const kikoId = ++idRef.current;
      const acc = { raw: "", shown: false };
      try {
        const history = msgs.slice(-8).map((m) => ({
          who: m.role === "user" ? ("user" as const) : ("kiko" as const),
          text: m.text,
        }));
        const res = await chatStream(
          {
            message: body,
            history,
            tools_enabled: toolsOn,
            lang,
          },
          (t) => {
            acc.raw += t;
            const shownText = acc.raw.replace(emoRe.current, " ").trimStart();
            setMsgs((m) =>
              m.map((x) => (x.id === kikoId ? { ...x, text: shownText } : x))
            );
            if (!acc.shown) {
              acc.shown = true;
              setChatBusy(false);
            }
          }
        );
        const toolLabel = res.tool_calls?.[0]?.tool;
        const finalText = res.reply;
        setMsgs((m) =>
          m.map((x) =>
            x.id === kikoId
              ? { ...x, text: finalText, emotion: res.emotion, toolLabel }
              : x
          )
        );
        // speak the prose only — reading code aloud is horrid
        const spoken = finalText
          .replace(/```[\s\S]*?(?:```|$)/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        try {
          const { blob, duration } = await speakRequest({
            text: spoken.slice(0, 220),
            voice: lang === "hi" && !voice.startsWith("h") ? "hf_alpha" : voice,
            speed: 1,
          });
          const url = URL.createObjectURL(blob);
          setMsgs((m) =>
            m.map((x) => (x.id === kikoId ? { ...x, url, dur: duration } : x))
          );
          await playBlob(blob, url, duration, spoken);
        } catch {}
        if (loopOn) {
          try {
            await startMic();
          } catch {}
        }
      } catch (e) {
        setMsgs((m) => m.filter((x) => x.id !== kikoId));
        toast(e instanceof Error ? e.message : "Chat failed");
      } finally {
        setChatBusy(false);
      }
    },
    [text, chatBusy, msgs, toolsOn, loopOn, playBlob, startMic, toast, voice, lang]
  );

  return {
    text,
    setText,
    chatBusy,
    loopOn,
    setLoopOn,
    toolsOn,
    setToolsOn,
    sendChat,
  };
}

export default useChat;
