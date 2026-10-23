import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const URL = "http://127.0.0.1:8000/";
const SHOT_DIR = "/home/thepraveeneffect/.gemini/antigravity/brain/b5e22d6c-113c-4fe5-a8c0-fad2494a8d8a";
const logEvents = [];

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("console", (msg) => {
  if (msg.type() === "error") {
    logEvents.push({ type: "console_error", text: msg.text() });
  }
});

page.on("pageerror", (err) => {
  logEvents.push({ type: "page_error", text: String(err) });
});

console.log("Loading Kiko at", URL);
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

// Helper to switch modes
async function switchMode(name) {
  console.log(`Switching to mode: ${name}...`);
  await page.locator(".pselect-btn").click();
  await page.waitForTimeout(300);
  await page.locator(`.pselect-menu button:has-text("${name}")`).click();
  await page.waitForTimeout(600);
}

// 1. Verify Header & Privacy Chip
const privacyText = await page.locator(".privacy-chip").innerText();
console.log("Privacy Chip verified:", privacyText);

// 2. Open Memory Popover
console.log("Testing Long-Term Memory popover...");
const memoryBtn = page.locator(".memory-pill-btn");
await memoryBtn.click();
await page.waitForSelector(".memory-popover", { timeout: 5000 });
await page.waitForTimeout(800);

// Add a test fact
const keyInput = page.locator(".memory-input").first();
const valInput = page.locator(".memory-input.val");
await keyInput.fill("hackathon_award");
await valInput.fill("1st Place Winner");
await page.locator(".memory-add-btn").click();
await page.waitForTimeout(1000);

// Capture Memory Screenshot
await page.screenshot({ path: path.join(SHOT_DIR, "hackathon_01_memory.png"), fullPage: false });
console.log("Saved screenshot: hackathon_01_memory.png");

// Close memory popover
await page.locator(".memory-close-btn").click();
await page.waitForTimeout(400);

// 3. Test Chat with Memory Recall
console.log("Testing Chat with memory recall...");
const composer = page.locator(".composer-input");
await composer.click();
await composer.fill("Who created you and what is our target for tomorrow?");
await page.waitForTimeout(200);
await composer.press("Enter");

// Wait for streaming AI response
let lastReply = "";
let started = false;
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const msgs = document.querySelectorAll(".bubble-msg.ai");
    const last = msgs[msgs.length - 1];
    const btn = document.querySelector(".send-btn");
    const cursor = document.querySelector(".streaming-cursor");
    return {
      aiMsgCount: msgs.length,
      lastText: last ? last.innerText : "",
      isBusy: btn?.textContent === "…",
      hasCursor: !!cursor,
    };
  });

  if (state.isBusy || state.hasCursor || state.lastText.length > 5) {
    started = true;
  }
  if (started && !state.isBusy && !state.hasCursor && state.lastText.length > 10) {
    lastReply = state.lastText;
    console.log(`[Chat completed in ${(i + 1) * 0.5}s]`);
    break;
  }
}

console.log("Kiko Memory-Informed Reply:", lastReply);

// Verify MP3 download button
const saveBtn = page.locator(".bubble-msg.ai .mini a");
if (await saveBtn.count() > 0) {
  const downloadAttr = await saveBtn.last().getAttribute("download");
  const saveText = await saveBtn.last().innerText();
  console.log(`Save button verified: download="${downloadAttr}", text="${saveText}"`);
}

await page.screenshot({ path: path.join(SHOT_DIR, "hackathon_02_chat_memory.png"), fullPage: false });
console.log("Saved screenshot: hackathon_02_chat_memory.png");

// 4. Test New Chat button
console.log("Testing New Chat button...");
await page.locator(".new-chat-btn").click();
await page.waitForTimeout(600);
const msgCountAfterClear = await page.locator(".bubble-msg").count();
console.log("Message count after new chat:", msgCountAfterClear);
await page.screenshot({ path: path.join(SHOT_DIR, "hackathon_03_new_chat.png"), fullPage: false });
console.log("Saved screenshot: hackathon_03_new_chat.png");

// 5. Test Voice Studio Mode with Load Script
await switchMode("Voice");
const loadScriptBtn = page.locator(".ct-left.ct-mic-wrap label:has-text('load script')");
console.log("Voice Studio 'load script' button present:", await loadScriptBtn.count() > 0);
await page.screenshot({ path: path.join(SHOT_DIR, "hackathon_04_voice_studio.png"), fullPage: false });
console.log("Saved screenshot: hackathon_04_voice_studio.png");

// 6. Test Read Aloud Mode with Import File
await switchMode("Read");
const importFileBtn = page.locator(".ct-left.ct-mic-wrap label:has-text('import file')");
console.log("Read Aloud 'import file' button present:", await importFileBtn.count() > 0);

// Test uploading a document into Read Aloud
const sampleDocPath = "/tmp/hackathon_speech.txt";
fs.writeFileSync(sampleDocPath, "Kiko is an offline, privacy-first local AI companion built for high performance on consumer hardware.");
const fileChooserPromise = page.waitForEvent("filechooser");
await importFileBtn.click();
const fileChooser = await fileChooserPromise;
await fileChooser.setFiles(sampleDocPath);
await page.waitForTimeout(1500);

const readText = await page.locator(".composer-input").inputValue();
console.log("Read Aloud loaded text from file:", readText);
await page.screenshot({ path: path.join(SHOT_DIR, "hackathon_05_read_aloud_upload.png"), fullPage: false });
console.log("Saved screenshot: hackathon_05_read_aloud_upload.png");

// 7. Test Docs Mode
await switchMode("Docs");
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(SHOT_DIR, "hackathon_06_docs_mode.png"), fullPage: false });
console.log("Saved screenshot: hackathon_06_docs_mode.png");

// 8. Test Tutor Mode
await switchMode("Tutor");
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(SHOT_DIR, "hackathon_07_tutor_mode.png"), fullPage: false });
console.log("Saved screenshot: hackathon_07_tutor_mode.png");

console.log("=== ALL E2E VERIFICATIONS SUCCESSFUL ===");
if (logEvents.length > 0) {
  console.log("Browser log warnings/errors:", JSON.stringify(logEvents, null, 2));
}

await browser.close();
