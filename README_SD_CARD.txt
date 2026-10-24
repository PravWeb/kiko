========================================================================
             KIKO - 100% OFFLINE AI VOICE COMPANION
========================================================================

HOW TO RUN ON WINDOWS:
1. Plug this SD Card / USB drive into your Windows laptop.
2. Open the drive folder.
3. Double-click "start.bat".

WHAT HAPPENS AUTOMATICALLY:
- No internet is required.
- No Python installation is required (bundled in "tools\python").
- No uv installation is required (bundled in "tools\uv.exe").
- No Node.js / npm is required (the UI is pre-compiled in "frontend\out").
- All dependencies are pre-cached in "wheels" and configure in ~3 seconds.
- All AI models (Qwen LLM, Kokoro TTS, Whisper STT) are pre-loaded on this drive.
- Your web browser will automatically open to http://localhost:8000.

HOW TO RUN ON LINUX / MACOS:
1. Open a terminal in this drive folder.
2. Run:
     ./start.sh

FEATURES READY TO USE:
- Live hands-free voice conversation (sub-1.5s offline latency)
- Text Chat with Mermaid flowcharts and DuckDuckGo web search
- Offline Document RAG with preloaded subject PDFs (sample_docs/)
- Voice Studio with MP3 download & pitch demo presets
- Persistent local SQLite memory
