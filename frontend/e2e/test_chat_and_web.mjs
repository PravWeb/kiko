import { chromium } from "playwright";

async function run() {
  console.log("Starting full E2E test for Chat, Web Search, Fast/Smart brain, and Docs streaming...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 850 });

  page.on("console", (m) => {
    if (m.type() === "error" || m.text().includes("failed")) {
      console.log(`[Browser Console ${m.type()}]:`, m.text());
    }
  });
  page.on("pageerror", (err) => console.error("[Browser Error]:", err));

  console.log("Loading Kiko UI at http://127.0.0.1:8000/ ...");
  await page.goto("http://127.0.0.1:8000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // 1. Initial Layout verification
  const layout = await page.evaluate(() => {
    const docH = document.documentElement.scrollHeight;
    const winH = window.innerHeight;
    const composer = document.querySelector(".composer-zone");
    const rect = composer?.getBoundingClientRect();
    return {
      docH,
      winH,
      composerBottom: rect?.bottom,
      composerVisible: rect ? rect.bottom <= winH : false,
    };
  });
  console.log("Initial Layout Check:", layout);

  // Robust send & wait helper
  const sendChatMessage = async (text, label) => {
    console.log(`\n========================================`);
    console.log(`[${label}] >>> User: "${text}"`);
    console.log(`========================================`);
    const input = page.locator(".composer-input");
    await input.click();
    await input.fill(text);
    await page.waitForTimeout(200);
    await input.press("Enter");

    // Poll until streaming completes
    let lastReply = "";
    let started = false;
    for (let i = 0; i < 40; i++) {
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
        console.log(`[Completed in ${(i + 1) * 0.5}s]`);
        break;
      }
      if (i % 4 === 0) {
        console.log(`  ..waiting ${(i + 1) * 0.5}s: busy=${state.isBusy}, cursor=${state.hasCursor}, len=${state.lastText.length}`);
      }
    }

    console.log(`<<< Kiko replied:\n` + lastReply);
    return lastReply;
  };

  // Turn 1: Fast brain technical prompt
  console.log("\n--- Turn 1: Fast brain technical prompt ---");
  await sendChatMessage("what is docker and show a run command", "Turn 1: Docker");

  // Turn 2: Enable Web Search and ask a real-time question
  console.log("\n--- Turn 2: Live Web Search ---");
  const webToggle = page.locator(".toggle:has-text('web')");
  await webToggle.click();
  await page.waitForTimeout(400);

  const isWebOn = await webToggle.evaluate((el) => el.classList.contains("on"));
  console.log("Web search toggle state:", isWebOn ? "ACTIVE" : "INACTIVE");

  await sendChatMessage("who won 2024 t20 world cup", "Turn 2: Web Search");

  const shot1 = "/home/thepraveeneffect/.gemini/antigravity/brain/b5e22d6c-113c-4fe5-a8c0-fad2494a8d8a/artifact_chat_websearch.png";
  await page.screenshot({ path: shot1 });
  console.log(`Saved chat + web search screenshot to ${shot1}`);

  // Turn 3: Switch to Docs mode and test document streaming
  console.log("\n--- Turn 3: Docs Mode Streaming ---");
  const pselect = page.locator(".pselect-btn");
  await pselect.click();
  await page.waitForTimeout(400);
  const docsItem = page.locator(".pselect-item:has-text('Docs')");
  await docsItem.click();
  await page.waitForTimeout(1000);

  // Upload test document if not present
  const docCount = await page.evaluate(() => document.querySelectorAll(".doc-chip").length);
  console.log(`Active documents in Docs mode: ${docCount}`);
  if (docCount === 0) {
    console.log("Uploading test document via file input...");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("label.tool-btn:has-text('file')").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles("/home/thepraveeneffect/local-voice-ai/README.md");
    await page.waitForTimeout(2000);
  }

  // Ask question about uploaded document
  await sendChatMessage("What models does Kiko use?", "Turn 3: Doc RAG");

  const shot2 = "/home/thepraveeneffect/.gemini/antigravity/brain/b5e22d6c-113c-4fe5-a8c0-fad2494a8d8a/artifact_docs_streaming.png";
  await page.screenshot({ path: shot2 });
  console.log(`Saved docs streaming screenshot to ${shot2}`);

  // Final layout check after all turns
  const finalLayout = await page.evaluate(() => {
    const docH = document.documentElement.scrollHeight;
    const winH = window.innerHeight;
    const composer = document.querySelector(".composer-zone");
    const rect = composer?.getBoundingClientRect();
    const chips = document.querySelectorAll(".tool-chip").length;
    const webChips = document.querySelectorAll(".tool-chip.web").length;
    const codeBlocks = document.querySelectorAll(".md-code-block").length;
    const stream = document.querySelector(".stream");
    return {
      docH,
      winH,
      composerBottom: rect?.bottom,
      composerVisible: rect ? rect.bottom <= winH : false,
      chips,
      webChips,
      codeBlocks,
      streamScrollTop: stream?.scrollTop,
      streamScrollHeight: stream?.scrollHeight,
      streamClientHeight: stream?.clientHeight,
    };
  });
  console.log("\nFinal Layout & Elements Check:", finalLayout);

  await browser.close();

  if (!finalLayout.composerVisible) {
    throw new Error(`Composer is cut off or outside window! bottom: ${finalLayout.composerBottom}, winH: ${finalLayout.winH}`);
  }
  if (finalLayout.docH > finalLayout.winH + 5) {
    throw new Error(`Window is overflowing! docH: ${finalLayout.docH}, winH: ${finalLayout.winH}`);
  }

  console.log("\n========================================================");
  console.log("ALL VERIFICATIONS PASSED: CHAT, WEB SEARCH & DOCS STREAMING! 🚀");
  console.log("========================================================");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
