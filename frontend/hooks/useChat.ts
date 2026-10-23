"use client";

import { useCallback, useRef, useState } from "react";
import { chatStream, speakRequest } from "@/lib/api";
import type { Msg } from "@/components/ControlPanel";
import { cleanForSpeech } from "@/lib/speechClean";

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
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [brain, setBrain] = useState<"fast" | "smart">("fast");
  const idRef = useRef(0);
  const emoRe = useRef(/\[emotion:\w+\]|\[emotion[^[\]]*$/gi);

  const sendChat = useCallback(
    async (textOverride?: string) => {
      const body = (textOverride ?? text).trim();
      if (!body || chatBusy) return;
      setChatBusy(true);
      const userMsg: Msg = { id: ++idRef.current, role: "user", text: body };
      setMsgs((m) => [...m, userMsg]);
      setText("");
      const kikoId = ++idRef.current;
      const acc = { raw: "" };
      setMsgs((m) => [...m, { id: kikoId, role: "ai", text: "" }]);
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
            websearch_enabled: webSearchOn,
            lang,
            brain,
          },
          (t) => {
            acc.raw += t;
            const shownText = acc.raw.replace(emoRe.current, " ").trimStart();
            setMsgs((m) =>
              m.map((x) => (x.id === kikoId ? { ...x, text: shownText } : x))
            );
          }
        );
        const toolLabel = res.tool_calls?.[0]?.tool;
        const finalText = res.reply;
        const spoken = cleanForSpeech(finalText);
        setMsgs((m) =>
          m.map((x) =>
            x.id === kikoId
              ? {
                  ...x,
                  text: finalText,
                  emotion: res.emotion,
                  toolLabel,
                  audioLoading: !!spoken,
                }
              : x
          )
        );
        setChatBusy(false);

        // speak the prose only — clean markdown and code blocks, voice full text
        if (spoken) {
          try {
            const { blob, duration } = await speakRequest({
              text: spoken,
              voice: lang === "hi" && !voice.startsWith("h") ? "hf_alpha" : voice,
              speed: 1,
            });
            const url = URL.createObjectURL(blob);
            setMsgs((m) =>
              m.map((x) => (x.id === kikoId ? { ...x, url, dur: duration, audioLoading: false } : x))
            );
            void playBlob(blob, url, duration, spoken);
          } catch {
            setMsgs((m) =>
              m.map((x) => (x.id === kikoId ? { ...x, audioLoading: false } : x))
            );
          }
        }
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
    [text, chatBusy, msgs, toolsOn, webSearchOn, brain, loopOn, playBlob, startMic, toast, voice, lang]
  );

  return {
    text,
    setText,
    chatBusy,
    loopOn,
    setLoopOn,
    toolsOn,
    setToolsOn,
    webSearchOn,
    setWebSearchOn,
    brain,
    setBrain,
    sendChat,
  };
}

export default useChat;
