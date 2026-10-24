"use client";

import { useCallback, useRef, useState } from "react";
import { chatStream, speakRequest } from "@/lib/api";
import type { Msg } from "@/components/ControlPanel";
import { cleanForSpeech, pickVoice } from "@/lib/speechClean";
import { nextMessageId } from "@/lib/messageIds";

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
  // Text chat prioritizes answer quality. Live voice keeps its separate fast brain.
  const [brain, setBrain] = useState<"fast" | "smart">("smart");
  const emoRe = useRef(/\[emotion:\w+\]|\[emotion[^[\]]*$/gi);

  const sendChat = useCallback(
    async (textOverride?: string, fromVoice: boolean = false) => {
      const body = (textOverride ?? text).trim();
      if (!body || chatBusy) return;
      setChatBusy(true);
      const userMsg: Msg = { id: nextMessageId(), role: "user", text: body };
      setMsgs((m) => [...m, userMsg]);
      setText("");
      const kikoId = nextMessageId();
      const acc: { raw: string; flushTimer?: number } = { raw: "" };
      const initialSearching = !!webSearchOn;
      setMsgs((m) => [
        ...m,
        {
          id: kikoId,
          role: "ai",
          text: "",
          isSearchingWeb: initialSearching,
          toolLabel: initialSearching ? "searching web…" : undefined,
          statusText: initialSearching ? "Searching the web… 🌐" : undefined,
        },
      ]);
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
            if (!acc.flushTimer) {
              acc.flushTimer = window.setTimeout(() => {
                acc.flushTimer = undefined;
                const shownText = acc.raw.replace(emoRe.current, " ").trimStart();
                setMsgs((m) =>
                  m.map((x) =>
                    x.id === kikoId
                      ? {
                          ...x,
                          text: shownText,
                          isSearchingWeb: false,
                        }
                      : x
                  )
                );
              }, 40);
            }
          },
          (status) => {
            if (status.phase === "web_search") {
              setMsgs((m) =>
                m.map((x) =>
                  x.id === kikoId
                    ? {
                        ...x,
                        isSearchingWeb: true,
                        toolLabel: "searching web…",
                        statusText: status.status || "Searching the web… 🌐",
                      }
                    : x
                )
              );
            } else if (status.phase === "web_search_done") {
              setMsgs((m) =>
                m.map((x) =>
                  x.id === kikoId
                    ? {
                        ...x,
                        isSearchingWeb: false,
                        toolLabel: "web search",
                        statusText: undefined,
                      }
                    : x
                )
              );
            }
          }
        );
        const toolName = res.tool_calls?.[0]?.tool;
        const toolLabel = toolName === "web_search" || webSearchOn
          ? "web search"
          : toolName === "memory_saved"
          ? "memory saved"
          : toolName ?? (res.active_skills?.[0] ? `skill · ${res.active_skills[0]}` : undefined);
        if (acc.flushTimer) window.clearTimeout(acc.flushTimer);
        acc.flushTimer = undefined;
        const finalText = res.reply;
        const spoken = cleanForSpeech(finalText);
        const shouldAutoSpeak = loopOn || fromVoice;
        setMsgs((m) =>
          m.map((x) =>
            x.id === kikoId
              ? {
                  ...x,
                  text: finalText,
                  emotion: res.emotion,
                  toolLabel,
                  isSearchingWeb: false,
                  statusText: undefined,
                  audioLoading: shouldAutoSpeak && !!spoken,
                }
              : x
          )
        );
        setChatBusy(false);

        // Auto-speak only when talking via mic or hands-free; otherwise text streams fast and user can tap "listen"
        if (shouldAutoSpeak && spoken) {
          try {
            const { blob, duration } = await speakRequest({
              text: spoken,
              voice: pickVoice(spoken, voice, lang),
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
