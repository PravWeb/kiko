import { chromium } from "playwright";
import fs from "fs";

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
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3000);

async function switchMode(name) {
  await page.locator(".pselect-btn").click();
  await page.waitForTimeout(300);
  await page.locator(".pselect-item", { hasText: name }).first().click();
  await page.waitForTimeout(600);
}

// TEST 1: Chat mode math & tools
console.log("--- TEST 1: Chat mode with calculation ---");
await page.locator("textarea.composer-input").click();
await page.keyboard.type("What is 15 * 24?", { delay: 10 });
await page.locator(".send-btn").click();

// Wait for response to appear
let chatReply = "";
for (let i = 0; i < 45; i++) {
  await page.waitForTimeout(1000);
  const bubbles = await page.locator(".bubble-msg.ai .bbody").allInnerTexts();
  if (bubbles.length > 0 && bubbles[bubbles.length - 1].trim().length > 3) {
    chatReply = bubbles[bubbles.length - 1];
    break;
  }
}
console.log("Chat AI Reply:", chatReply);
await page.screenshot({ path: `${SHOT_DIR}/test_01_chat_math.png` });

// TEST 2: Docs Mode
console.log("--- TEST 2: Docs Mode ---");
await switchMode("Docs");
await page.waitForTimeout(500);
// Upload demo-project.md
const fileInput = page.locator('input[type="file"]');
if (await fileInput.count() > 0) {
  await fileInput.setInputFiles("/tmp/opencode/kiko-e2e/demo-project.md");
  await page.waitForTimeout(2000);
  console.log("Uploaded file. Doc chips count:", await page.locator(".doc-chip").count());
  // Ask a question in docs mode
  await page.locator("textarea.composer-input").click();
  await page.keyboard.type("Who is the team captain?", { delay: 10 });
  await page.locator(".send-btn").click();
  
  let docAnswer = "";
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const bubbles = await page.locator(".bubble-msg.ai .bbody").allInnerTexts();
    if (bubbles.length > 0 && bubbles[bubbles.length - 1].trim().length > 3) {
      docAnswer = bubbles[bubbles.length - 1];
      break;
    }
  }
  console.log("Doc RAG Answer:", docAnswer);
}
await page.screenshot({ path: `${SHOT_DIR}/test_02_docs.png` });

// TEST 3: Voice Studio Mode
console.log("--- TEST 3: Voice Studio Mode ---");
await switchMode("Voice");
await page.waitForTimeout(500);
await page.locator("textarea.composer-input").click();
await page.keyboard.type("Welcome to Kiko local voice assistant demonstration.", { delay: 10 });
await page.locator(".send-btn").click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOT_DIR}/test_03_voice_studio.png` });

// Summary of errors
console.log("Logged errors during test:", JSON.stringify(logEvents));

await browser.close();
