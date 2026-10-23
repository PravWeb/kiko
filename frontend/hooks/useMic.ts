"use client";

import { useCallback, useRef, useState } from "react";
import { startRecording, type RecordingHandle } from "@/lib/recorder";

export function useMic() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const handleRef = useRef<RecordingHandle | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const h = await startRecording();
      handleRef.current = h;
      setRecording(true);
      const tick = () => {
        if (handleRef.current === h) {
          setLevel(h.getLevel());
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setRecording(false);
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const h = handleRef.current;
    handleRef.current = null;
    setRecording(false);
    setLevel(0);
    stopRaf();
    if (!h) return null;
    return await h.stop();
  }, [stopRaf]);

  const cancel = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setRecording(false);
    setLevel(0);
    stopRaf();
  }, [stopRaf]);

  return { recording, level, transcript, setTranscript, start, stop, cancel };
}

export default useMic;
