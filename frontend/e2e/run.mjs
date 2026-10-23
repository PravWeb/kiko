import { chromium } from "playwright";
import fs from "fs";

const URL = process.env.KIKO_URL || "http://127.0.0.1:8000/";
const OUT = process.env.KIKO_TEST_OUTPUT_DIR || "/tmp/kiko-e2e";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/00-landing.png` });

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const input = () => page.locator("textarea.composer-input").first();

async function setMode(label) {
  await page.locator(".pselect-btn").click();
  await page.locator(".pselect-item", { hasText: label }).first().click();
  await page.waitForTimeout(500);
}

async function typeText(text) {
  await page.locator(".composer-input").click();
  await page.keyboard.type(text, { delay: 8 });
  await page.waitForTimeout(300);
}

// open every mode from the dropdown, screenshot
for (const label of ["Chat", "Voice", "Docs"]) {
  await setMode(label);
  await shot(`mode-${label.toLowerCase()}`);
}

// ---- chat flow
await setMode("Chat");
await typeText("hi kiko, who are you?");
await page.locator(".send-btn").click();
await page.waitForTimeout(18000);
await shot("chat-reply");
const log = await page.locator(".stream").innerText().catch(() => "");
console.log("log sample:", log.replace(/\s+/g, " ").slice(0, 220));

// timer + tools
await typeText("set a timer for 2 minutes called demo");
await page.locator(".send-btn").click();
await page.waitForTimeout(16000);
await shot("chat-timer");
const chips = await page.locator(".timer-chip").count();
console.log("timer chips:", chips);

// ---- hindi mode reply
await typeText("namaste, aap kaisi ho?");
await page.locator('button.toggle:has-text("हिंदी")').first().click();
await page.locator(".send-btn").click();
await page.waitForTimeout(18000);
await shot("chat-hindi");
const hindi = await page.locator(".stream").innerText().catch(() => "");
console.log("hindi sample:", hindi.slice(-200).replace(/\s+/g, " "));

// ---- tune popover + language pills
await page.locator(".tool-btn", { hasText: "tune" }).first().click();
await page.waitForTimeout(500);
await shot("tune-pop");
const select = await page.locator(".voice-select option").count();
console.log("voice options in dropdown:", select);
await page.keyboard.press("Escape");

await browser.close();
fs.writeFileSync(`${OUT}/console-errors.txt`, errors.join("\n") || "NO ERRORS");
console.log("console errors:", errors.length);
errors.slice(0, 5).forEach((e) => console.log(" -", e));
console.log("done");
