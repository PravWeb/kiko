import { chromium } from "playwright";
import path from "path";

const URL = "http://127.0.0.1:8000/";
const SHOT_DIR = "/home/thepraveeneffect/.gemini/antigravity/brain/b5e22d6c-113c-4fe5-a8c0-fad2494a8d8a";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log("Loading Kiko...");
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1000);

// Clear session
await page.locator(".new-chat-btn").click();
await page.waitForTimeout(500);

// Injected test to directly verify Mermaid diagram rendering in Chat
await page.evaluate(() => {
  const mermaidMd = `Here is the offline AI architecture diagram:

\`\`\`mermaid
flowchart LR
    Mic([Microphone]) --> STT[Whisper STT]
    STT --> LLM[Qwen3 Dual-Brain]
    LLM --> TTS[Kokoro-82M TTS]
    TTS --> MP3([24kHz Studio MP3])
    LLM <--> MEM[(Local Memory)]
\`\`\`

All steps execute 100% on-device with zero cloud telemetry.`;

  // Push to localStorage and trigger re-render
  const raw = localStorage.getItem("kiko_sessions_v2");
  if (raw) {
    const data = JSON.parse(raw);
    const curr = data.sessions.find(s => s.id === data.currentId);
    if (curr) {
      curr.messages.push({
        id: Date.now(),
        role: "ai",
        text: mermaidMd,
      });
      localStorage.setItem("kiko_sessions_v2", JSON.stringify(data));
    }
  }
  window.location.reload();
});

console.log("Waiting for reloaded page with diagram...");
await page.waitForNavigation({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const boxCount = await page.locator(".mermaid-box").count();
console.log("Mermaid boxes rendered:", boxCount);

const hasSvg = await page.locator(".mermaid-render-area svg").count();
console.log("Mermaid SVGs compiled:", hasSvg);

await page.screenshot({ path: path.join(SHOT_DIR, "diagram_01_mermaid_flowchart.png"), fullPage: false });
console.log("Saved: diagram_01_mermaid_flowchart.png");

await browser.close();
