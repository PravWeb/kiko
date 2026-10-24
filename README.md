# Kiko

**A private, voice-first AI companion that runs on your computer.** Kiko listens, speaks, answers questions, works with your documents, and remembers facts you choose to save. Speech recognition, speech generation, and language models run locally. Optional web search needs an internet connection and sends the search query to DuckDuckGo.

[Source code](https://github.com/PravWeb/kiko) · [Demo guide](HACKATHON_DEMO.md)

## What you can do

- **Chat by voice or text.** Hear spoken replies, use English or Hindi, and interrupt live voice replies by speaking over them.
- **Use a hands-free conversation loop.** Kiko can listen again after each reply.
- **Create voiceovers.** Turn a script into speech, choose a voice and speed, apply an audio effect, and download the result.
- **Ask questions about documents.** Upload Markdown, PDF, or DOCX files and ask follow-up questions grounded in their contents. Kiko can also summarize a document.
- **Use built-in tools.** Set timers, do calculations and unit conversions, check the time and date, and save or remove user-approved memories.
- **Keep chat history and export it.** Sessions stay in this browser; export a transcript as Markdown or a ZIP containing audio clips.
- **Connect through MCP.** Kiko provides a local Streamable HTTP MCP endpoint for speech generation, current-session document search, runtime status, skills, and project information.

## How it works

Kiko has a Next.js frontend and a FastAPI backend. The backend serves the static frontend and API on the same local server. Model inference runs on the CPU using local model files:

| Capability | Technology / model |
|---|---|
| Speech synthesis | Kokoro-82M via `kokoro-onnx` and ONNX Runtime |
| Speech recognition | `faster-whisper` with Whisper `small`, CPU int8 |
| Chat and document answers | Qwen3 GGUF models via `llama-cpp-python`: 0.6B Fast and 1.7B Smart |
| Document retrieval | BM25 with PDF and DOCX/Markdown text extraction |
| API server | FastAPI and Uvicorn |
| Optional web search | DuckDuckGo via `ddgs`; requires internet |
| Interoperability | Model Context Protocol (MCP), Streamable HTTP |

Kiko does not call hosted Gemini, OpenAI, or other cloud LLM APIs for core chat, speech, or document Q&A. Web search is the optional network feature; its query is sent to DuckDuckGo. Conversations and uploaded files are handled by the local app.

## Run Kiko

### Windows

Run `start.bat` from the project folder. It starts the backend and serves the static frontend from `frontend/out/`. The repository includes a portable Windows setup path that uses bundled Python tools and offline wheels when available. Check the startup messages for missing dependencies or model files.

If you changed frontend source files and want to refresh the static UI, build it before launching:

```powershell
npm.cmd --prefix frontend install
npm.cmd --prefix frontend run build
```

Alternatively, `restart.bat` rebuilds the frontend and restarts the server.

### Linux and macOS

Run the setup and launcher:

```bash
./start.sh
```

The script installs `uv` if needed, downloads the Kokoro model files, offers the Qwen3 model download when run interactively, installs Python dependencies, builds the frontend, and starts the backend. The first setup needs internet access. Whisper `small` weights are downloaded on first use if they are not already cached.

### Manual development setup

Requirements: Python 3.12+, Node.js/npm, and the model files described below.

```bash
cd frontend
npm install
npm run build
cd ../backend
uv sync
uv run uvicorn main:app --host 127.0.0.1 --port 8000
```

Then open [http://localhost:8000](http://localhost:8000). For frontend development with hot reload, run `npm run dev` in `frontend` separately; the backend API remains on port 8000.

## Model files

Place model files in `backend/models/`:

- `kokoro-v1.0.fp16.onnx` and `voices-v1.0.bin` for speech generation. The Linux/macOS launcher downloads these automatically when missing.
- `Qwen3-1.7B-Q8_0.gguf` for the Smart brain, or `Qwen3-0.6B-Q8_0.gguf` for the smaller Fast brain. The launcher can download one on first setup.
- Whisper `small` is cached under `.hf-cache/` (or the configured Hugging Face cache) on first use.

The 1.7B model provides the Smart brain for text chat and document questions. The 0.6B model is the lighter Fast brain used for lower-latency live voice. Available models and memory requirements depend on the machine; no latency figures are claimed here.

## Privacy and network use

- Speech synthesis, speech recognition, chat inference, and document retrieval use local models and run on the machine.
- Uploaded documents are indexed for use by the running local app. Chat history and saved memories are stored in this browser/local app setup.
- Optional web search requires internet and sends the search text to DuckDuckGo.
- First-time dependency and model setup may download packages and model weights.
- The local MCP endpoint is `http://127.0.0.1:8000/mcp`. Do not expose it to an untrusted network.

## Configuration and useful endpoints

- `KIKO_MCP_URL` configures a trusted Streamable HTTP MCP server for the chat agent. By default, it points to Kiko's own local endpoint.
- `HF_HOME` controls the local Hugging Face model cache. The launchers set a project-local cache where appropriate.
- `GET /api/mcp` reports MCP client status.
- `GET /api/skills` lists local skill metadata.

## Repository layout

```text
backend/       FastAPI routes, agent, local models, tools, skills, and MCP server
frontend/      Next.js application and static export configuration
sample_docs/   Sample documents for trying document Q&A
HACKATHON_DEMO.md  Short demo outline and measurement guidance
start.bat      Windows launcher
start.sh       Linux/macOS setup and launcher
restart.bat    Windows rebuild and restart helper
```

## Demo

There is no hosted demo link in this repository. See [HACKATHON_DEMO.md](HACKATHON_DEMO.md) for a walkthrough and a checklist for measuring behavior on the target machine.

## License

No repository-level license file is currently included. Check with the maintainers before reusing or redistributing the project.
