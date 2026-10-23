"use client";

import { useCallback, useRef, useState } from "react";
import {
  docsAskStream, docsDelete, docsList, docsSummarizeStream, docsUpload,
  speakRequest, transcribeRequest,
  type DocMeta,
} from "@/lib/api";
import type { Msg } from "@/components/ControlPanel";
import { cleanForSpeech } from "@/lib/speechClean";

const emoRe = /\[emotion:\w+\]|\[emotion[^[\]]*$/gi;

type PlayBlob = (blob: Blob, url?: string, dur?: number, text?: string, karaoke?: boolean) => Promise<void>;

export function useDocs({
  msgs,
  setMsgs,
  playBlob,
  toast,
  voice = "af_heart",
  speed = 1,
}: {
  msgs: Msg[];
  setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>;
  playBlob?: PlayBlob;
  toast: (t: string) => void;
  voice?: string;
  speed?: number;
}) {
  const [docList, setDocList] = useState<DocMeta[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [brain, setBrain] = useState<"fast" | "smart">("smart");
  const idRef = useRef(0);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;

  const refresh = useCallback(async () => {
    try {
      const { docs } = await docsList();
      setDocList(docs);
      setActiveDocId((cur) => cur ?? docs[0]?.id ?? null);
    } catch {}
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const meta = await docsUpload(file);
        setDocList((m) => [...m, meta]);
        setActiveDocId(meta.id);
        toast(`📎 ${meta.name} ready — ${meta.words} words`);
      } catch (e) {
        toast(e instanceof Error ? e.message : "upload failed");
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const ask = useCallback(
    async (qOverride?: string, speakOut = false) => {
      const q = (qOverride ?? "").trim();
      if (!q || busy) return;
      if (!docList.length) {
        toast("📂 add a file first (.md, .pdf, .docx)");
        return;
      }
      setBusy(true);
      const userId = ++idRef.current;
      const kikoId = ++idRef.current;
      const userText = speakOut ? `🎙 ${q}` : q;
      setMsgs((m) => [
        ...m,
        { id: userId, role: "user", text: userText },
        { id: kikoId, role: "ai", text: "", toolLabel: webSearchOn ? "web + doc" : "doc" },
      ]);
      const acc = { raw: "" };
      try {
        // Multi-turn history: send last 8 turns of context
        const history = msgsRef.current.slice(-8).map((m) => ({
          who: m.role === "user" ? ("user" as const) : ("kiko" as const),
          text: m.text,
        }));
        const res = await docsAskStream(
          q,
          activeDocId,
          history,
          (t) => {
            acc.raw += t;
            const shown = acc.raw.replace(emoRe, " ").trimStart();
            setMsgs((m) =>
              m.map((x) => (x.id === kikoId ? { ...x, text: shown } : x))
            );
          },
          brain,
          webSearchOn
        );
        const replyText = res.reply;
        const toolLabel = webSearchOn ? "web + doc" : "doc";
        setMsgs((m) =>
          m.map((x) =>
            x.id === kikoId
              ? { ...x, text: replyText, emotion: res.emotion, toolLabel }
              : x
          )
        );

        // Optional speech synthesis (e.g. when voice asked)
        if (speakOut && playBlob) {
          try {
            setMsgs((m) =>
              m.map((x) => (x.id === kikoId ? { ...x, audioLoading: true } : x))
            );
            const spoken = cleanForSpeech(replyText);
            const { blob, duration } = await speakRequest({
              text: spoken,
              voice,
              speed,
            });
            const url = URL.createObjectURL(blob);
            setMsgs((m) =>
              m.map((x) => (x.id === kikoId ? { ...x, url, dur: duration, audioLoading: false } : x))
            );
            await playBlob(blob, url, duration, spoken, true);
          } catch {
            setMsgs((m) =>
              m.map((x) => (x.id === kikoId ? { ...x, audioLoading: false } : x))
            );
          }
        }
      } catch (e) {
        setMsgs((m) => m.filter((x) => x.id !== kikoId));
        toast(e instanceof Error ? e.message : "doc question failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, docList.length, activeDocId, setMsgs, toast, playBlob, voice, speed, brain, webSearchOn],
  );

  const askWithVoice = useCallback(
    async (blob: Blob) => {
      try {
        toast("🎙 Transcribing question...");
        const { text: question } = await transcribeRequest(blob);
        if (!question.trim()) {
          toast("Didn't catch that — try again");
          return;
        }
        await ask(question, true);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Voice question failed");
      }
    },
    [ask, toast],
  );

  const summarize = useCallback(async () => {
    if (!activeDocId || busy) return;
    const doc = docList.find((d) => d.id === activeDocId);
    setBusy(true);
    const userId = ++idRef.current;
    const kikoId = ++idRef.current;
    setMsgs((m) => [
      ...m,
      { id: userId, role: "user", text: `✦ summarize ${doc?.name ?? "file"}` },
      { id: kikoId, role: "ai", text: "", toolLabel: "doc summary" },
    ]);
    const acc = { raw: "" };
    try {
      const res = await docsSummarizeStream(
        activeDocId,
        (t) => {
          acc.raw += t;
          const shown = acc.raw.replace(emoRe, " ").trimStart();
          setMsgs((m) =>
            m.map((x) => (x.id === kikoId ? { ...x, text: shown } : x))
          );
        },
        brain
      );
      setMsgs((m) =>
        m.map((x) =>
          x.id === kikoId
            ? { ...x, text: res.reply, emotion: res.emotion, toolLabel: "doc summary" }
            : x
        )
      );
    } catch (e) {
      setMsgs((m) => m.filter((x) => x.id !== kikoId));
      toast(e instanceof Error ? e.message : "summary failed");
    } finally {
      setBusy(false);
    }
  }, [activeDocId, busy, docList, setMsgs, toast, brain]);

  const del = useCallback(async (id: string) => {
    await docsDelete(id);
    setDocList((m) => {
      const next = m.filter((d) => d.id !== id);
      setActiveDocId(
        (cur) => (cur === id ? next[0]?.id ?? null : cur),
      );
      return next;
    });
  }, []);

  const select = useCallback((id: string) => setActiveDocId(id), []);

  void refresh;

  return {
    docList,
    activeDocId,
    busy,
    webSearchOn,
    setWebSearchOn,
    brain,
    setBrain,
    upload,
    ask,
    askWithVoice,
    summarize,
    del,
    select,
  };
}

export default useDocs;
