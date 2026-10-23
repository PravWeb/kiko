/* Browser probe: Docs mode — upload md, ask a question, check grounded reply. */
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errs = [];
page.on("request", (r) => { if (r.url().includes("/api/")) console.log("REQ", r.method(), r.url().split("8177")[1]); });
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

await page.goto("http://127.0.0.1:8177/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pselect-btn", { timeout: 30000 });

// switch mode → Docs
await page.click(".pselect-btn");
await page.click(".pselect-item:has-text('Docs')");
await page.waitForSelector(".panel:has-text('Ask the doc')", { timeout: 15000 });

// upload the test md via hidden file input
await page.setInputFiles('input[type="file"]',
  "/tmp/opencode/kiko-e2e/demo-project.md");
await page.waitForSelector(".doc-chip", { timeout: 20000 });
console.log("doc chip:", await page.textContent(".doc-chip .chip-act"));

// ask two grounded questions
const typeText = async (t) => {
  await page.click(".composer-input");
  await page.keyboard.type(t, { delay: 6 });
};
await typeText("what gpu does the demo laptop have?");
await page.keyboard.press("Enter");
await page.waitForFunction(
  () => document.querySelectorAll(".bubble-msg.ai").length >= 1,
  undefined,
  { timeout: 90000 },
);
await page.waitForFunction(
  () => (document.querySelector(".bubble-msg.ai .bbody")?.textContent ?? ""),
  undefined,
  { timeout: 90000 },
);
console.log("Q1 grounded:", (await page.textContent(".bbody:last-of-type")).slice(0, 80));
await page.waitForTimeout(12000); // let playback finish before next ask

await typeText("who is the team captain?");
await page.keyboard.press("Enter");
await page.waitForFunction(
  () => document.body.innerText.toLowerCase().includes("praveen"),
  undefined,
  { timeout: 90000 },
);
console.log("Q2 grounded: praveen ok");

await page.screenshot({ path: "/tmp/opencode/kiko-e2e/probe-docs.png" });
const bodyTxt = await page.textContent("body");
console.log("BODY tail:", bodyTxt.replace(/\s+/g, " ").slice(-260));
console.log("pageerrors:", errs.length, errs.slice(0, 3));
await browser.close();
process.exit(0);
