/* WS voice probe: uses /api/tts speech as mic input, verifies full stream. */
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:8177";
const OUTDIR = "/tmp/opencode/kiko-e2e";
fs.mkdirSync(OUTDIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- build 16k pcm stream from a spoken phrase via /api/tts --- */
async function speechToPcm(text) {
  const res = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, voice: "af_heart", lang: "en-us" }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  // tiny wav parse: find data chunk
  let p = 12;
  let dataOff = -1, dataLen = 0, sr = 24000;
  while (p + 8 <= buf.length) {
    const id = buf.slice(p, p + 4).toString("ascii");
    const len = buf.readUInt32LE(p + 4);
    if (id === "data") { dataOff = p + 8; dataLen = len; break; }
    if (id === "fmt ") {
      sr = buf.readUInt32LE(p + 12);
    }
    p += 8 + len + (len % 2);
  }
  const pcm16 = buf.slice(dataOff, dataOff + dataLen);
  const n = pcm16.length / 2;
  const f32 = new Float32Array(n);
  for (let i = 0; i < n; i++) f32[i] = pcm16.readInt16LE(i * 2) / 32768;
  // resample sr -> 16000 linear
  const m = Math.round((n * 16000) / sr);
  const out = new Int16Array(m);
  for (let i = 0; i < m; i++) {
    const pos = i * (sr / 16000);
    const i0 = Math.floor(pos);
    const a = f32[i0] ?? 0, b = f32[i0 + 1] ?? a;
    const v = a + (b - a) * (pos - i0);
    out[i] = Math.max(-32767, Math.min(32767, (v * 32767) | 0));
  }
  return out;
}

function chunkify(pcm, ms = 100) {
  const step = Math.round((16000 * ms) / 1000);
  const chunks = [];
  for (let i = 0; i < pcm.length; i += step)
    chunks.push(pcm.slice(i, i + step));
  return chunks;
}

const ws = new WebSocket("ws://127.0.0.1:8177/ws/voice");
ws.binaryType = "arraybuffer";

const events = [];
let finish = null;
const done = new Promise((r) => (finish = r));
let audioChunks = [];

ws.onopen = async () => {
  console.log("OPEN");
  ws.send(JSON.stringify({
    type: "config", voice: "af_heart", lang: "en", tools: true, history: [],
  }));
  const pcm = await speechToPcm("hey kiko, what can you do?");
  console.log("speaking", pcm.length, "samples");
  await sleep(400);
  for (const c of chunkify(pcm, 100)) {
    if (c.length < 2560) {
      const pad = new Int16Array(2560);
      pad.set(c);
      ws.send(pad.buffer);
    } else ws.send(c.buffer);
  }
  for (let i = 0; i < 8; i++) ws.send(new Int16Array(2560).buffer);
};

ws.onmessage = (e) => {
  if (typeof e.data === "string") {
    const ev = JSON.parse(e.data);
    events.push(ev);
    console.log("EV", JSON.stringify(ev).slice(0, 200));
    if (ev.type === "done" || ev.type === "cleared" || ev.type === "error")
      finish(events, audioChunks);
  } else {
    audioChunks.push(Buffer.from(e.data));
    console.log("EV AUDIO", e.data.byteLength, "bytes");
  }
};

ws.onerror = (e) => { console.log("ERR", String(e)); finish(events, audioChunks); };

await Promise.race([done, sleep(240000)]);

console.log("AUDIO chunks:", audioChunks.length, "total bytes:",
  audioChunks.reduce((a, b) => a + b.length, 0));
if (audioChunks.length) {
  fs.writeFileSync(
    path.join(OUTDIR, "probe-voice.wav"),
    Buffer.concat(audioChunks),
  );
}
ws.close();
process.exit(0);
