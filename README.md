# Kiko — Offline AI Voice Companion

**Kiko** lives in your laptop. She talks, listens, sets timers, does math, remembers, and reads documents aloud with karaoke-style subtitles — **100% offline, no cloud, no API keys**.

Runs entirely on CPU (tested on an Intel i5-13420H / 16GB RAM): voice synthesis, speech recognition, and the LLM brain all load locally.

## Quick start

```bash
./start.sh      # Linux / macOS
start.bat       # Windows
```

First launch downloads models once (~850MB total), then everything is offline forever.

## What Kiko can do

| Mode | What happens |
|---|---|
| 💬 **Chat** | Talk or type, she replies out loud with lip-sync + emotion; flip to **हिंदी** and she answers in Devanagari spoken by a Hindi voice; tools: timers, math, time/date, memory |
| 🎙 **Voice Studio** | Text → voice, ~30 English + Hindi voices, speed control, audio FX |
| 📖 **Read Aloud** | Paste a document → she reads it aloud with live karaoke word highlight; one-click summarize |
| 🎯 **Tutor** | Pick a phrase, she speaks it, you repeat — instant pronunciation scoring |
| ⏱ **Timers** | Natural language: *"set a timer for 5 minutes called chai"* — countdown chips + chime |
| 📎 **Ask the doc (Voice & Multi-Turn RAG)** | Add a **.md / .pdf / .docx** file — she parses it fully offline, indexes it with BM25, and enables multi-turn conversation. Ask questions by typing or by tapping the microphone; she answers grounded on the text and speaks the reply aloud; one-click summarize |
| ∞ **Hands-free loop** | | Auto-listen after each reply — a real voice conversation |
| ⚡ **Live voice (streaming)** | Tap the mic: VAD turn-taking over a WebSocket — no chat/record buttons. Reply audio streams in **sentence by sentence** (starts playing before the LLM finishes generating), and talking over her **barge-ins** mid-sentence |
| 💾 **Session export** | Transcript as Markdown or a .zip with every audio clip |

## Tech

- **Backend:** FastAPI · Dual-Brain Engine Architecture · BM25 multi-turn doc-RAG (docslib, pypdf) · `kokoro-onnx` (Kokoro-82M fp16) for TTS · `faster-whisper small int8` for STT · `llama-cpp-python` (Qwen3-0.6B for live voice + Qwen3-1.7B for RAG/reasoning) · lazy model manager with idle-unload
- **Frontend:** Next.js static export · minimal ambient stage UI · single `uvicorn` serves UI + API, works after the build with any static server
- **Privacy:** everything local. Mic audio never leaves the machine.

## Model credits

- Speech synthesis: **Kokoro-82M** (Apache-2.0)
- Speech recognition: **faster-whisper** on OpenAI Whisper `small`
- Dual Language Model Brain:
  - **Fast Brain:** `Qwen3-0.6B-Q8_0` for sub-2s streaming voice conversations and quick turns
  - **Smart Brain:** `Qwen3-1.7B-Q8_0` for deep document comprehension, multi-turn RAG, and summarization
- Fonts/emoji: system stack; emoji glyphs.

## Folder layout

```
backend/        FastAPI app, llm/agent/nlp/tools/tutor modules, model manager
backend/models/ Kokoro ONNX + voice data + Qwen GGUF (downloaded on first run)
frontend/       Next.js (static export → out/)
.hf-cache/      Whisper weights (created on first STT load)
start.sh|.bat   one-time setup + launch
```

## Notes

- First chat loads the brain (~3–8s); afterwards it stays warm for 7 minutes.
- On slow CPUs expect ~10–20 tokens/s — responses are kept short on purpose.
- The 0.6B brain is small: English is solid, Hindi generation is best-effort.
