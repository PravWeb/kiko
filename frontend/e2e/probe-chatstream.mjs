import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
await page.goto("http://127.0.0.1:8000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.locator(".composer-input").click();
await page.keyboard.type("hi kiko, who are you?", { delay: 8 });
await page.locator(".send-btn").click();

const body = page.locator(".bubble-msg.ai .bbody").first();
let last = "", stable = 0, finalTxt = "";
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(2000);
  const txt = (await body.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  if (txt.length > 15 && txt === last) stable++;
  else stable = 0;
  last = txt;
  if (stable >= 2) { finalTxt = txt; break; }
}
const clean = !finalTxt.includes("[emotion");
console.log("FINAL:", finalTxt.slice(0, 220));
console.log("CLEAN-FINAL:", clean, "| pageerrors:", errors.length);
await page.screenshot({ path: "/tmp/opencode/kiko-e2e/chatstream-fix.png" });
await browser.close();
process.exit(clean && errors.length === 0 ? 0 : 1);
