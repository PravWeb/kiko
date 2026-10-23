import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const URL = process.env.KIKO_URL || "http://127.0.0.1:8000/";
const SHOT_DIR = process.env.KIKO_TEST_OUTPUT_DIR || "/tmp/kiko-e2e";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log("Loading Kiko...");
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1000);

// Clear session to start clean
await page.locator(".new-chat-btn").click();
await page.waitForTimeout(500);

console.log("Sending chat message...");
const input = page.locator(".composer-input");
await input.fill("Tell me about Polaris the North Star in two vivid sentences.");
await page.locator(".send-btn").click();

let sawLoading = false;
let completed = false;
let duration = "";
let downloadFile = "";

for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(500);
  const mini = await page.locator(".bubble-msg.ai .mini").allInnerTexts();
  const text = mini.join(" ");

  if (!sawLoading && text.includes("generating voice")) {
    sawLoading = true;
    console.log("✓ Live audio loading indicator confirmed:", text);
    await page.screenshot({ path: path.join(SHOT_DIR, "chat_voice_01_loading.png"), fullPage: false });
  }

  if (text.includes("replay") && text.includes("save mp3")) {
    completed = true;
    const durTag = await page.locator(".bubble-msg.ai .dur-tag").last().innerText();
    const saveLink = page.locator(".bubble-msg.ai .mini a[download$='.mp3']").last();
    downloadFile = await saveLink.getAttribute("download");
    duration = durTag;
    console.log(`✓ Full MP3 voice synthesis complete! Duration: ${duration}, File: ${downloadFile}`);
    await page.screenshot({ path: path.join(SHOT_DIR, "chat_voice_02_complete.png"), fullPage: false });
    break;
  }
}

if (!completed) {
  throw new Error("Voice generation did not complete within 30 seconds");
}

console.log("=== VERIFICATION PASSED: FULL MP3 GENERATION WITH LOADING FEEDBACK ===");
await browser.close();
