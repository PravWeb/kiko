import { chromium } from "playwright";
import fs from "fs";

const URL = "http://127.0.0.1:8000/";
const SHOT_DIR = "/tmp/opencode/audit_shots";
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const consoleLogs = [];
const pageErrors = [];

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 }
});
const page = await context.newPage();

page.on("console", (msg) => {
  consoleLogs.push({ type: msg.type(), text: msg.text() });
});

page.on("pageerror", (err) => {
  pageErrors.push(String(err));
});

console.log("Navigating to", URL);
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

await page.screenshot({ path: `${SHOT_DIR}/01_landing_chat.png`, fullPage: false });
console.log("1. Captured landing (chat mode)");

// Helper to switch modes
async function switchMode(modeLabel) {
  await page.locator(".pselect-btn").click();
  await page.waitForTimeout(300);
  await page.locator(".pselect-item", { hasText: modeLabel }).first().click();
  await page.waitForTimeout(600);
}

// 2. Visit Voice Studio mode
await switchMode("Voice");
await page.screenshot({ path: `${SHOT_DIR}/02_mode_voice_studio.png` });
console.log("2. Captured Voice Studio mode");

// 3. Visit Read Aloud mode
await switchMode("Read");
await page.screenshot({ path: `${SHOT_DIR}/03_mode_read_aloud.png` });
console.log("3. Captured Read Aloud mode");

// 4. Visit Tutor mode
await switchMode("Tutor");
await page.screenshot({ path: `${SHOT_DIR}/04_mode_tutor.png` });
console.log("4. Captured Tutor mode");

// 5. Visit Translate mode
await switchMode("Translate");
await page.screenshot({ path: `${SHOT_DIR}/05_mode_translate.png` });
console.log("5. Captured Translate mode");

// 6. Visit Docs mode
await switchMode("Docs");
await page.screenshot({ path: `${SHOT_DIR}/06_mode_docs.png` });
console.log("6. Captured Docs mode");

// Check console errors
console.log("Total console messages:", consoleLogs.length);
console.log("Page errors:", pageErrors);
const errors = consoleLogs.filter(l => l.type === "error");
console.log("Console errors:", errors);

await browser.close();
