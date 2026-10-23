export type WordTiming = { text: string; start: number; end: number };

/**
 * Approximate word timings for TTS audio (no word timestamps from Kokoro).
 * We allocate the audio duration proportionally to per-word character
 * weight — good enough for karaoke-style highlighting.
 */
export function computeTimings(text: string, duration: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || duration <= 0) return [];
  const weights = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return words.map((w, i) => {
    const span = (weights[i] / total) * duration;
    const start = t;
    t += span;
    return { text: w, start, end: t };
  });
}

export function activeIndex(timings: WordTiming[], t: number): number {
  for (let i = timings.length - 1; i >= 0; i--) {
    if (t >= timings[i].start) return i;
  }
  return -1;
}

/** Split long text into speakable chunks (~maxLen) on sentence boundaries. */
export function chunkText(text: string, maxLen = 260): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?।]+[.!?।]*/g);
  const parts: string[] = [];
  let cur = "";
  const push = (s: string) => {
    if (s.trim()) parts.push(s.trim());
  };
  for (const raw of sentences ?? [text]) {
    const s = raw.trim();
    if (!s) continue;
    if (cur && (cur.length + 1 + s.length) > maxLen) {
      push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
    while (cur.length > maxLen * 1.6) {
      push(cur.slice(0, maxLen));
      cur = cur.slice(maxLen);
    }
  }
  push(cur);
  return parts.length ? parts : [text.slice(0, maxLen)];
}
