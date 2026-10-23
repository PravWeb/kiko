export const API = process.env.NEXT_PUBLIC_API_URL || "";

export type Voice = {
  id: string;
  label: string;
  gender: "Female" | "Male";
  lang: string;
  lang_name: string;
};

export type Languages = Record<
  string,
  { name: string; espeak: string; flag: string }
>;

export type EngineStatus = {
  loaded: boolean;
  loading: boolean;
  info: string;
  load_time_s: number | null;
  idle_ttl_s: number;
  idle_for_s: number | null;
  loads: number;
  unloads: number;
  resident: boolean;
};

export type Status = {
  app?: string;
  tts: { ready: boolean; model: string };
  stt: { ready: boolean; model: string };
  llm: { ready: boolean; available: boolean; model: string };
  memory?: { engines: Record<string, EngineStatus>; rss_mb: number | null };
};

export type SttResult = {
  text: string;
  language: string;
  confidence: number;
  duration: number;
};

export type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

export type ChatResult = {
  reply: string;
  emotion: string;
  tool_calls: ToolCall[];
  elapsed_s: number;
};

export type TimerEntry = {
  id: string;
  label: string;
  seconds: number;
  remaining_s: number;
  fired: boolean;
};

export type TutorWord = { word: string; ok: boolean };
export type TutorResult = {
  score: number;
  words: TutorWord[];
  said: string;
  message: string;
};

export type Effect =
  | "none"
  | "pitch_up"
  | "pitch_down"
  | "robot"
  | "echo"
  | "chipmunk"
  | "deep";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

function post<T>(path: string, body: unknown): Promise<T> {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => json<T>(r));
}

export async function getStatus(): Promise<Status> {
  return json<Status>(await fetch(`${API}/api/status`));
}

export async function getVoices(): Promise<{
  languages: Languages;
  voices: Voice[];
}> {
  return json(await fetch(`${API}/api/voices`));
}

export async function speakRequest(opts: {
  text: string;
  voice: string;
  lang?: string | null;
  speed: number;
  effect?: Effect;
  format?: string;
}): Promise<{ blob: Blob; duration: number }> {
  const res = await fetch(`${API}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: opts.text,
      voice: opts.voice,
      lang: opts.lang ?? null,
      speed: opts.speed,
      effect: opts.effect ?? "none",
      format: opts.format ?? "mp3",
    }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {}
    throw new Error(detail);
  }
  const duration = Number(res.headers.get("X-Audio-Duration") || 0);
  return { blob: await res.blob(), duration };
}

export async function parseFile(file: File): Promise<{
  name: string;
  text: string;
  words: number;
}> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch(`${API}/api/parse-file`, { method: "POST", body: form });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function getMemory(): Promise<{ memory: Record<string, string> }> {
  return json(await fetch(`${API}/api/memory`));
}

export async function setMemory(
  key: string,
  value: string
): Promise<{ ok: boolean; memory: Record<string, string> }> {
  return post("/api/memory", { key, value });
}

export async function deleteMemory(
  key: string
): Promise<{ ok: boolean; memory: Record<string, string> }> {
  const res = await fetch(`${API}/api/memory/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  return json(res);
}

export async function clearMemory(): Promise<{ ok: boolean; memory: Record<string, string> }> {
  const res = await fetch(`${API}/api/memory`, { method: "DELETE" });
  return json(res);
}

export async function transcribeRequest(
  blob: Blob,
  filename = "clip.wav",
  language?: string | null
): Promise<SttResult> {
  const form = new FormData();
  form.append("audio", blob, filename);
  const qs = language ? `?language=${encodeURIComponent(language)}` : "";
  return json<SttResult>(
    await fetch(`${API}/api/stt${qs}`, { method: "POST", body: form })
  );
}

export async function chatRequest(opts: {
  message: string;
  history: { who: "user" | "kiko"; text: string }[];
  tools_enabled: boolean;
  lang?: "en" | "hi";
}): Promise<ChatResult> {
  return post<ChatResult>("/api/chat", opts);
}

export type ChatStreamFinal = {
  reply: string;
  emotion: string;
  tool_calls: ChatResult["tool_calls"];
  elapsed_s: number;
};

async function sseStream(
  path: string,
  payload: unknown,
  onDelta: (t: string) => void
): Promise<ChatStreamFinal> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let FINAL: ChatStreamFinal | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      if (ev.type === "delta") {
        onDelta(ev.t as string);
      } else if (ev.type === "error") {
        throw new Error(ev.message as string);
      } else if (ev.type === "final") {
        FINAL = ev as ChatStreamFinal;
      }
    }
  }
  if (!FINAL) throw new Error("no final event from LLM");
  return FINAL;
}

export function chatStream(
  opts: {
    message: string;
    history: { who: "user" | "kiko"; text: string }[];
    tools_enabled: boolean;
    websearch_enabled?: boolean;
    lang?: "en" | "hi";
    brain?: "fast" | "smart";
  },
  onDelta: (t: string) => void
): Promise<ChatStreamFinal> {
  return sseStream("/api/chat/stream", opts, onDelta);
}

export function docsAskStream(
  q: string,
  docId: string | null,
  history: { who: "user" | "kiko"; text: string }[] = [],
  onDelta: (t: string) => void,
  brain: "smart" | "fast" = "smart",
  websearch_enabled: boolean = false
): Promise<ChatStreamFinal> {
  return sseStream(
    "/api/docs/ask/stream",
    { question: q, doc_id: docId, history, brain, websearch_enabled },
    onDelta
  );
}

export function docsSummarizeStream(
  docId: string,
  onDelta: (t: string) => void,
  brain: "smart" | "fast" = "smart"
): Promise<ChatStreamFinal> {
  return sseStream(
    "/api/docs/summarize/stream",
    { doc_id: docId, brain },
    onDelta
  );
}

export async function searchWeb(query: string): Promise<{
  query: string;
  results: { title: string; url: string; snippet: string }[];
}> {
  return post("/api/search", { query });
}

export async function summarizeRequest(
  text: string
): Promise<{ text: string; tokens_per_s: number }> {
  return post("/api/summarize", { text });
}

export async function rewriteRequest(
  text: string,
  style: string
): Promise<{ text: string }> {
  return post("/api/rewrite", { text, style });
}

export async function tutorScoreRequest(
  target: string,
  said: string
): Promise<TutorResult> {
  return post<TutorResult>("/api/tutor/score", { target, said });
}

export async function getTimers(): Promise<{
  timers: TimerEntry[];
  memory: Record<string, string>;
}> {
  return json(await fetch(`${API}/api/timers`));
}

export function wsVoiceUrl(): string {
  if (typeof window === "undefined") return "";
  if (API) {
    const u = new URL(API, window.location.origin);
    return `${u.protocol === "https:" ? "wss" : "ws"}://${u.host}/ws/voice`;
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/voice`;
}

/* ── docs (offline RAG) ─────────────────────────────────────────────── */

export type DocMeta = {
  id: string;
  name: string;
  kind: string;
  words: number;
  chunks: number;
  added: string;
};

export type DocResult = {
  reply: string;
  emotion?: string;
  sources?: number;
  elapsed_s?: number;
};

export async function docsList(): Promise<{ docs: DocMeta[] }> {
  const res = await fetch(`${API}/api/docs`);
  if (!res.ok) throw new Error("docs list failed");
  return res.json();
}

export async function docsUpload(file: File): Promise<DocMeta> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}/api/docs/upload`, { method: "POST", body: fd });
  if (!res.ok) {
    let detail = `upload failed (${res.status})`;
    try {
      const b = await res.json();
      if (b?.detail) detail = String(b.detail);
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function docsAsk(question: string, docId: string | null): Promise<DocResult> {
  const res = await fetch(`${API}/api/docs/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, doc_id: docId }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const b = await res.json();
      if (b?.detail) detail = String(b.detail);
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function docsSummarize(docId: string): Promise<DocResult> {
  const res = await fetch(`${API}/api/docs/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc_id: docId }),
  });
  if (!res.ok) throw new Error("summarize failed");
  return res.json();
}

export async function docsDelete(docId: string): Promise<void> {
  await fetch(`${API}/api/docs/${docId}`, { method: "DELETE" });
}
