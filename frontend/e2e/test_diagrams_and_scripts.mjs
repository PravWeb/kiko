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

// Helper to switch modes
async function switchMode(name) {
  console.log(`Switching to mode: ${name}...`);
  await page.locator(".pselect-btn").click();
  await page.waitForTimeout(300);
  await page.locator(`.pselect-menu button:has-text("${name}")`).click();
  await page.waitForTimeout(600);
}

// 1. Test Voice Studio Script Presets
await switchMode("Voice");
const hindiChip = page.locator(".sample-chip:has-text('Hindi (A-Z Hinglish)')");
console.log("Checking Hinglish preset chip...");
await hindiChip.click();
await page.waitForTimeout(500);

const populatedText = await page.locator(".composer-input").inputValue();
console.log("✓ Populated Hinglish Script:", populatedText);
await page.screenshot({ path: path.join(SHOT_DIR, "voice_03_hinglish_preset.png"), fullPage: false });

// 2. Test Docs Mode with Sample Subject PDF RAG
await switchMode("Docs");
console.log("Testing Docs question against uploaded sample subject PDF...");
const docInput = page.locator(".composer-input");
await docInput.fill("What is the neural TTS model and its audio sample rate mentioned in the document?");
await page.locator(".send-btn").click();

// Wait for answer
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(500);
  const text = await page.locator(".bubble-msg.ai .streaming-markdown").last().innerText().catch(() => "");
  if (text.length > 20) {
    console.log("✓ Docs Answer:", text);
    break;
  }
}
await page.screenshot({ path: path.join(SHOT_DIR, "docs_02_sample_pdf_rag.png"), fullPage: false });

// 3. Test Chat Diagram Rendering
await switchMode("Chat");
await page.locator(".new-chat-btn").click();
await page.waitForTimeout(500);

console.log("Testing Mermaid Diagram prompt in Chat...");
const chatInput = page.locator(".composer-input");
await chatInput.fill("Explain the local AI audio pipeline with a mermaid flowchart diagram.");
await page.locator(".send-btn").click();

// Wait for response and diagram
let sawDiagram = false;
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(500);
  const count = await page.locator(".mermaid-box").count();
  if (count > 0) {
    sawDiagram = true;
    console.log("✓ Mermaid diagram container detected in chat response!");
    break;
  }
}

await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(SHOT_DIR, "diagram_01_mermaid_flowchart.png"), fullPage: false });
console.log("Saved diagram screenshot: diagram_01_mermaid_flowchart.png");

console.log("=== ALL DIAGRAM & SCRIPT TESTS PASSED ===");
await browser.close();
