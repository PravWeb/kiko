import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const URL = process.env.KIKO_URL || "http://127.0.0.1:8000/";
const ARTIFACT_DIR = "/home/thepraveeneffect/.gemini/antigravity/brain/b5e22d6c-113c-4fe5-a8c0-fad2494a8d8a";

async function run() {
  console.log("Starting Web Search UI Indicator verification...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 850 });

  console.log("Navigating to", URL);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Toggle Web Search button
  const webToggle = page.locator('button:has-text("web search"), button:has-text("web")').first();
  await webToggle.click();
  await page.waitForTimeout(300);

  const isWebActive = await page.evaluate(() => {
    const el = document.querySelector(".toggle.web-on");
    return !!el;
  });
  console.log("Web Search Toggle Enabled:", isWebActive);

  // Send a search query
  const input = page.locator(".composer-input");
  await input.click();
  await input.fill("What are the latest updates on quantum computing breakthroughs?");
  await page.waitForTimeout(200);
  await input.press("Enter");

  // Immediately check for the Web Search banner and searching pill
  let sawSearchingIndicator = false;
  let bannerText = "";

  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(200);
    const searchState = await page.evaluate(() => {
      const banner = document.querySelector(".web-search-banner");
      const searchingChip = document.querySelector(".tool-chip.searching");
      return {
        hasBanner: !!banner,
        bannerText: banner?.innerText || "",
        hasSearchingChip: !!searchingChip,
        chipText: searchingChip?.innerText || "",
      };
    });

    if (searchState.hasBanner || searchState.hasSearchingChip) {
      sawSearchingIndicator = true;
      bannerText = searchState.bannerText;
      console.log(`[PASS] Web Search indicator active at step ${i}:`, searchState);
      // Capture screenshot while searching indicator is visible!
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "websearch_01_searching_active.png") });
      break;
    }
  }

  // Wait for stream completion
  console.log("Waiting for web search response to complete...");
  for (let i = 0; i < 70; i++) {
    await page.waitForTimeout(500);
    const done = await page.evaluate(() => {
      const btn = document.querySelector(".send-btn");
      const cursor = document.querySelector(".streaming-cursor");
      const msgs = document.querySelectorAll(".bubble-msg.ai");
      const last = msgs[msgs.length - 1];
      const text = last?.innerText || "";
      return btn?.textContent !== "…" && !cursor && text.length > 50;
    });
    if (done) {
      console.log(`Response streaming finished at iteration ${i}!`);
      break;
    }
  }

  // Capture final screenshot
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "websearch_02_results_rendered.png") });

  const finalCheck = await page.evaluate(() => {
    const msgs = document.querySelectorAll(".bubble-msg.ai");
    const last = msgs[msgs.length - 1];
    const toolChip = last?.querySelector(".tool-chip");
    return {
      textLength: last?.innerText.length,
      toolLabel: toolChip?.innerText,
      hasWebInLabel: toolChip?.innerText.toLowerCase().includes("web"),
    };
  });
  console.log("Final State:", finalCheck);

  await browser.close();
  console.log(`\nVerification Complete! Saw searching indicator: ${sawSearchingIndicator}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
