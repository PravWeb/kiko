# Kiko: demo and pitch plan

## One-line pitch

Kiko is a private, voice-first AI companion that keeps its speech and reasoning on an ordinary laptop, remembers user-approved facts, and adapts its help with local skills.

## 90-second demo

1. **Show the constraint (8 sec):** Point out the local model and voice-engine status. Say that speech and chat run on the laptop; live web search is optional and clearly marked.
2. **Show memory (12 sec):** Ask Kiko to remember one harmless preference, then ask a related question. Open the memory panel so the audience can see and delete what was saved.
3. **Show a skill (15 sec):** Ask for a short lesson on a topic, answer Kiko's quiz question, and show the “Study coach” badge. Mention that skills are small local `SKILL.md` workflows, not separate model downloads.
4. **Show grounded usefulness (20 sec):** Upload a short handout, ask a question whose answer is in it, then ask one whose answer is absent. Highlight that the answer is grounded in the uploaded text and should admit when the source has no answer.
5. **Show voice and hardware fit (15 sec):** Ask a follow-up by voice and play the spoken response. Keep the demo on the fast brain for latency.
6. **Close with interoperability (20 sec):** Connect an MCP client to `http://127.0.0.1:8000/mcp`, call `generate_kiko_speech` and play its audio response, then call `search_uploaded_documents` on the handout. Show `get_kiko_runtime_status` to prove which engines are loaded. Kiko also exposes project/skill discovery and can consume one trusted remote MCP server via `KIKO_MCP_URL`.

## What to measure before presenting

Run the same short task set on the target laptop and report the results honestly:

- Tool-call success on timers, unit conversion, and explicit memory requests.
- Correct recall after a fresh chat and after restarting the app.
- Document answer accuracy, including a question not answered by the document.
- Time to first spoken audio and total response time for fast and smart brains.
- Hindi voice turn completion and transcription quality in a quiet room.
- Peak process memory while speech recognition, speech generation, and chat are in use.

Use a small fixed set of prompts and record successes and failures. Do not present guessed latency or accuracy numbers as benchmark results.

## Suggested slide order

1. **Problem:** Cloud assistants can be inconvenient for private notes, weak connectivity, and spoken use.
2. **Solution:** Kiko combines local speech, a compact local model, explicit memory, grounded document Q&A, and task-specific skills.
3. **Proof:** Show the 90-second demo and the measured results above.
4. **Design:** Explain the fast/smart CPU model choices, local data, and optional network-only web search.
5. **Next:** Authenticated remote MCP configuration, stronger multilingual evaluation, and more user-controlled memory.

## Claims to keep precise

- Say **core chat and speech run locally**. Say that web search needs internet and sends the query to a search provider.
- Say memory is persistent and user-manageable. Do not say it is encrypted unless that has been implemented.
- Describe the current Qwen models as compact local models. Do not claim they match large cloud models.
- Kiko exposes local speech generation, current-session document search, runtime status, and project/skill discovery over MCP. It can call tools from a configured Streamable HTTP server. Do not claim authenticated remote-server support; `KIKO_MCP_URL` currently connects without custom authentication headers.
