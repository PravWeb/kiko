"use client";

import { useCallback, useEffect, useState } from "react";
import { clearMemory, deleteMemory, getMemory, setMemory } from "@/lib/api";

export function useMemory(toast?: (t: string) => void) {
  const [memory, setMemoryState] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getMemory();
      if (res && res.memory) {
        setMemoryState(res.memory);
      }
    } catch {
      // ignore on early boot
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (key: string, value: string) => {
      try {
        const res = await setMemory(key, value);
        if (res && res.memory) {
          setMemoryState(res.memory);
        } else {
          setMemoryState((prev) => ({ ...prev, [key]: value }));
        }
        toast?.(`Remembered: ${key}`);
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        toast?.(`Failed to remember: ${err}`);
      }
    },
    [toast]
  );

  const del = useCallback(
    async (key: string) => {
      try {
        const res = await deleteMemory(key);
        if (res && res.memory) {
          setMemoryState(res.memory);
        } else {
          setMemoryState((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
        toast?.(`Forgot: ${key}`);
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        toast?.(`Failed to forget: ${err}`);
      }
    },
    [toast]
  );

  const clear = useCallback(async () => {
    try {
      const res = await clearMemory();
      if (res && res.memory) {
        setMemoryState(res.memory);
      } else {
        setMemoryState({});
      }
      toast?.("Cleared all memories");
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      toast?.(`Failed to clear: ${err}`);
    }
  }, [toast]);

  return {
    memory,
    loading,
    refresh,
    add,
    del,
    clear,
  };
}
