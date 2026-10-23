"use client";

import { useCallback, useRef, useState } from "react";
import {
  docsAskStream, docsDelete, docsList, docsSummarize, docsUpload,
  type DocMeta,
} from "@/lib/api";
import type { Msg } from "@/components/ControlPanel";

const emoRe = /\[emotion:\w+\]/g;

export function useDocs({
  setMsgs,
  toast,
}: {
  setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>;
  toast: (t: string) => void;
}) {
  const [docList, setDocList] = useState<DocMeta[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);

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
    async (qOverride?: string) => {
      const q = (qOverride ?? "").trim();
      if (!q || busy) return;
      if (!docList.length) {
        toast("📂 add a file first (.md, .pdf, .docx)");
        return;
      }
      setBusy(true);
      const userId = ++idRef.current;
      const kikoId = ++idRef.current;
      setMsgs((m) => [...m, { id: userId, role: "user", text: q }]);
      setMsgs((m) => [...m, { id: kikoId, role: "ai", text: "", toolLabel: "doc" }]);
      const acc = { raw: "" };
      try {
        const res = await docsAskStream(q, activeDocId, (t) => {
          acc.raw += t;
          const shown = acc.raw.replace(emoRe, " ").trimStart();
          setMsgs((m) =>
            m.map((x) => (x.id === kikoId ? { ...x, text: shown } : x))
          );
        });
        setMsgs((m) =>
          m.map((x) =>
            x.id === kikoId
              ? { ...x, text: res.reply, emotion: res.emotion, toolLabel: "doc" }
              : x
          )
        );
      } catch (e) {
        setMsgs((m) => m.filter((x) => x.id !== kikoId));
        toast(e instanceof Error ? e.message : "doc question failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, docList.length, activeDocId, setMsgs, toast],
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
      { id: kikoId, role: "ai", text: "", toolLabel: "doc" },
    ]);
    try {
      const res = await docsSummarize(activeDocId);
      setMsgs((m) =>
        m.map((x) =>
          x.id === kikoId
            ? { ...x, text: res.reply, emotion: res.emotion, toolLabel: "doc" }
            : x
        )
      );
    } catch (e) {
      setMsgs((m) => m.filter((x) => x.id !== kikoId));
      toast(e instanceof Error ? e.message : "summary failed");
    } finally {
      setBusy(false);
    }
  }, [activeDocId, busy, docList, setMsgs, toast]);

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

  return { docList, activeDocId, busy, upload, ask, summarize, del, select };
}

export default useDocs;
