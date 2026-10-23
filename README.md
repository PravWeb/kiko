# Kiko — Local AI Voice Companion

**Kiko** lives on your laptop. She talks and listens, sets timers, does math, remembers user-approved facts, creates voiceovers, and answers questions about your documents. Core voice, chat, and document features run locally with no API keys; optional web search needs internet.

Runs on CPU: voice synthesis, speech recognition, and the LLM brain load locally. The ASUS i5-13420H / 16 GB configuration you’re considering is the target setup; benchmark it on the actual laptop before quoting latency numbers.

## Quick start

```bash
./start.sh      # Linux / macOS
start.bat       # Windows
```

First launch downloads the models once, then speech and chat run locally. Model downloads are roughly **1.3 GB with the 0.6B brain** or **2.5 GB with the 1.7B brain**, plus Python/Node dependencies. Web search is optional and needs an internet connection.

### On the ASUS ExpertBook P1 you linked

The i5-13420H and 16 GB RAM are a reasonable target for Kiko's CPU-only setup. Text Chat defaults to the **1.7B Smart brain** for better answers; live Voice uses the **0.6B Fast brain** for lower latency. You can switch Chat to Fast when speed matters more. Actual speed depends on model warm-up, system load, and laptop power/thermal settings. On Windows 11, launch `start.bat`; keep internet available for the first setup and model download.

## What Kiko can do

| Mode | What happens |
|---|---|
| 💬 **Chat** | Talk or type, she replies out loud with lip-sync + emotion; flip to **हिंदी** and she answers in Devanagari spoken by a Hindi voice; tools: timers, math, time/date, memory |
| 🎙 **Voice Studio** | For creators and presenters: turn scripts into local speech with English and Hindi voices, speed control, and audio effects |
| ⏱ **Timers** | Natural language: *"set a timer for 5 minutes called chai"* — countdown chips + chime |
| 📎 **Ask the doc (Voice & Multi-Turn RAG)** | Add a **.md / .pdf / .docx** file — she parses it fully offline, indexes it with BM25, and enables multi-turn conversation. Ask questions by typing or by tapping the microphone; she answers grounded on the text and speaks the reply aloud; one-click summarize |
| ∞ **Hands-free loop** | Auto-listen after each reply for a continuous voice conversation |
| 🧭 **Local skills** | Study, writing, and planning workflows are selected from small `SKILL.md` files when relevant; no extra model or cloud call |
| ⚡ **Live voice (streaming)** | Tap the mic: VAD turn-taking over a WebSocket — no chat/record buttons. Reply audio is synthesized sentence by sentence while the model continues generating; talking over her **barge-ins** mid-sentence |
| 🗂 **Chat history** | Start new chats, switch between saved sessions, and delete old sessions; history stays in this browser |
| 💾 **Session export** | Transcript as Markdown or a .zip with every audio clip |
| 🔌 **MCP** | Local speech generation, uploaded-document search, runtime status, project tools/resources; optionally connect one trusted Streamable HTTP MCP server |

## Tech

- **Backend:** FastAPI · Dual-Brain Engine Architecture · BM25 multi-turn doc-RAG (docslib, pypdf) · `kokoro-onnx` (Kokoro-82M fp16) for TTS · `faster-whisper small int8` for STT · `llama-cpp-python` (Qwen3-0.6B for live voice + Qwen3-1.7B for text chat and RAG) · lazy model manager with idle-unload
- **Frontend:** Next.js static export · minimal ambient stage UI · single `uvicorn` serves UI + API, works after the build with any static server
- **Privacy:** speech and core chat inference run locally; mic audio stays on the machine. Optional web search sends the text query to DuckDuckGo.
- **Skills:** add a folder with a `SKILL.md` under `backend/skills/`; Kiko selects one matching workflow per turn to keep the small model's prompt focused. `GET /api/skills` lists installed skill metadata.
- **Memory:** explicit “my name is …” and “remember that …” requests are saved locally when tools are enabled. Passwords, credentials, medical details, and contact details are excluded; review or delete facts in the Memory panel.
- **MCP server:** Streamable HTTP is available at `http://127.0.0.1:8000/mcp`. It exposes local Kokoro speech generation, search over documents uploaded in the running Kiko session, model/runtime status, skills, project overview, and README/demo-guide search. It does not expose arbitrary files or shell access. Check `/api/mcp` for status.
- **Chat shortcut:** enter `/mcp` in Chat for the endpoint and connection instructions; ask for MCP-backed tasks in plain language.
- **MCP client:** both launchers connect chat to Kiko's local endpoint by default. Set `KIKO_MCP_URL` before launch to use one trusted Streamable HTTP MCP server instead. Tool calls have a timeout and output cap, and server-provided descriptions/results are treated as untrusted data. A remote server may require network access.
- **Startup:** `start.bat` and `start.sh` rebuild the static UI when source files are newer than the last build, so launching after an update won't silently show an old interface.

## Model credits

- Speech synthesis: **Kokoro-82M** (Apache-2.0)
- Speech recognition: **faster-whisper** on OpenAI Whisper `small`
- Dual Language Model Brain:
  - **Fast Brain:** `Qwen3-0.6B-Q8_0` for lower-latency voice conversations and quick turns
  - **Smart Brain:** `Qwen3-1.7B-Q8_0` for larger prompts, multi-turn RAG, and summarization
- Fonts/emoji: system stack; emoji glyphs.

## Folder layout

```
backend/        FastAPI app, llm/agent/nlp/tools/skills modules, model manager
backend/models/ Kokoro ONNX + voice data + Qwen GGUF (downloaded on first run)
frontend/       Next.js (static export → out/)
.hf-cache/      Whisper weights (created on first STT load)
start.sh|.bat   one-time setup + launch
```

## Notes

- The fast brain pre-warms at startup and remains resident; the smart brain loads on first use and auto-unloads after 30 minutes idle by default.
- Voice generation now overlaps sentence synthesis with model streaming. The live voice `done` event reports `first_audio_ms`; measure it and total duration on the target laptop before presenting benchmark numbers.
- The 0.6B brain is small: English is solid, Hindi generation is best-effort.
