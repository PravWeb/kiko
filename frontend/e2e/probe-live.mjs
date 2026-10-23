/* Browser probe: fake mic device → click mic button → live voice round-trip. */
import { chromium } from "playwright";
import fs from "node:fs";

const OUTDIR = "/tmp/opencode/kiko-e2e";
fs.mkdirSync(OUTDIR, { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

await page.goto("http://127.0.0.1:8177/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".composer-input", { timeout: 30000 });
await page.waitForTimeout(2500);

// click mic to open live voice session (fake device = beeping tone)
await page.click(".mic-btn");
await page.waitForTimeout(1200); // WS open + config + fake speech → thinking

// grab state badge text over time
const states = [];
for (let i = 0; i < 10; i++) {
  const live = await page.$(".live-dot");
states.push(live ? await live.textContent() : "(no live pill)");
  await page.waitForTimeout(900);
}
console.log("STATES:", JSON.stringify(states));

await page.screenshot({ path: `${OUTDIR}/probe-live.png` });

// stop session (mic again)
await page.click(".mic-btn");
await page.waitForTimeout(800);

// console errors sanity
console.log("pageerrors:", consoleErrors.length, consoleErrors.slice(0, 3));
await browser.close();
process.exit(0);
