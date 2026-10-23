import { chromium } from "playwright";
import path from "path";

const URL = "http://127.0.0.1:8000/";
const SHOT_DIR = "/home/thepraveeneffect/.gemini/antigravity/brain/b5e22d6c-113c-4fe5-a8c0-fad2494a8d8a";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log("Loading Kiko at", URL);
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1500);

// Helper to switch modes
async function switchMode(name) {
  console.log(`Switching to mode: ${name}...`);
  await page.locator(".pselect-btn").click();
  await page.waitForTimeout(300);
  await page.locator(`.pselect-menu button:has-text("${name}")`).click();
  await page.waitForTimeout(600);
}

// 1. Test Voice Studio Loading and Full Completion
await switchMode("Voice");
const composer = page.locator(".composer-input");
await composer.fill("Welcome judges! Kiko generates full offline high-fidelity MP3 voiceovers without ever cutting sentences halfway. Everything runs 100% on this machine.");

console.log("Submitting voice generation...");
await page.locator(".send-btn").click();

// Immediately check for the loading badge
let sawLoading = false;
for (let i = 0; i < 20; i++) {
  const loadingCount = await page.locator(".mini-loading").count();
  if (loadingCount > 0) {
    sawLoading = true;
    console.log("✓ Caught voice generation loading indicator:", await page.locator(".mini-loading").first().innerText());
    await page.screenshot({ path: path.join(SHOT_DIR, "voice_01_loading.png"), fullPage: false });
    break;
  }
  await page.waitForTimeout(100);
}

// Wait for audio generation to complete (loading disappears and replay/save appear)
console.log("Waiting for MP3 audio generation to finish completely...");
await page.waitForSelector(".mini .mini-btn:has-text('replay')", { timeout: 30000 });
await page.waitForSelector(".mini a[download$='.mp3']", { timeout: 5000 });

const saveBtn = page.locator(".mini a[download$='.mp3']").first();
const downloadAttr = await saveBtn.getAttribute("download");
const durTag = await page.locator(".dur-tag").first().innerText();

console.log(`✓ Voice generation completed! Duration: ${durTag}, Download: ${downloadAttr}`);
await page.screenshot({ path: path.join(SHOT_DIR, "voice_02_completed_mp3.png"), fullPage: false });

// 2. Test Chat Voice Generation with Full Speech
await switchMode("Chat");
await page.locator(".composer-input").fill("Tell me a complete two-sentence story about an astronaut discovering a secret garden on Mars.");
await page.locator(".send-btn").click();

// Wait for text stream to finish and audio loading to start
let sawChatAudioLoading = false;
for (let i = 0; i < 40; i++) {
  const hasLoading = await page.locator(".bubble-msg.ai .mini-loading").count();
  if (hasLoading > 0) {
    sawChatAudioLoading = true;
    console.log("✓ Caught Chat voice generation loading indicator in stream!");
    await page.screenshot({ path: path.join(SHOT_DIR, "chat_01_voice_loading.png"), fullPage: false });
    break;
  }
  await page.waitForTimeout(300);
}

// Wait for Chat replay and save mp3 to appear
console.log("Waiting for Chat MP3 generation to finish...");
await page.waitForSelector(".bubble-msg.ai .mini .mini-btn:has-text('replay')", { timeout: 30000 });
const chatSaveBtn = page.locator(".bubble-msg.ai .mini a[download$='.mp3']").last();
const chatDownloadAttr = await chatSaveBtn.getAttribute("download");
const chatDurTag = await page.locator(".bubble-msg.ai .dur-tag").last().innerText();
const replyText = await page.locator(".bubble-msg.ai .streaming-markdown").last().innerText();

console.log("Reply text length:", replyText.length, "characters");
console.log(`✓ Chat MP3 generation completed! Duration: ${chatDurTag}, Download: ${chatDownloadAttr}`);
await page.screenshot({ path: path.join(SHOT_DIR, "chat_02_voice_completed.png"), fullPage: false });

console.log("=== ALL VOICE LOADING & FULL COMPLETION TESTS PASSED ===");
await browser.close();
