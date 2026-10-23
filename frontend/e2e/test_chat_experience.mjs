import { chromium } from "playwright";

async function run() {
  console.log("Launching browser for comprehensive chat experience test...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 850 });

  page.on("pageerror", (err) => console.error("[Browser Error]:", err));

  console.log("Loading Kiko on http://127.0.0.1:8000/ ...");
  await page.goto("http://127.0.0.1:8000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const sendMessage = async (text, stepName) => {
    console.log(`\n========================================`);
    console.log(`>>> User: "${text}"`);
    console.log(`========================================`);
    const input = page.locator(".composer-input");
    await input.click();
    await input.fill(text);
    await page.waitForTimeout(300);

    // Press Enter to submit
    await input.press("Enter");

    // Wait until sendBtn becomes busy '…'
    await page.waitForTimeout(500);

    // Wait until sendBtn is no longer busy (its text is empty string, showing the Send SVG icon)
    console.log("Waiting for Kiko streaming to finish...");
    await page.waitForFunction(() => {
      const btn = document.querySelector(".send-btn");
      return btn && btn.textContent !== "…";
    }, null, { timeout: 60000 });

    await page.waitForTimeout(1000);
    const lastMsg = await page.evaluate(() => {
      const msgs = document.querySelectorAll(".bubble-msg.ai");
      const last = msgs[msgs.length - 1];
      return last ? last.innerText : "";
    });
    console.log(`<<< Kiko replied (${stepName}):\n` + lastMsg);

    const shotPath = `/home/thepraveeneffect/.gemini/antigravity/brain/b5e22d6c-113c-4fe5-a8c0-fad2494a8d8a/chat_step_${stepName}.png`;
    await page.screenshot({ path: shotPath });
    console.log(`Saved screenshot to ${shotPath}`);
  };

  // Turn 1: Basic concept
  await sendMessage("what is docker", "1_docker_intro");

  // Turn 2: Technical commands request (fenced code, bullets, inline code)
  await sendMessage("show me some essential docker commands with examples", "2_docker_commands");

  // Layout check: Verify NO window scrolling (height strictly inside viewport)
  const layout = await page.evaluate(() => {
    const docH = document.documentElement.scrollHeight;
    const winH = window.innerHeight;
    const bodyH = document.body.scrollHeight;
    const composer = document.querySelector(".composer-zone");
    const stream = document.querySelector(".stream");
    const rect = composer?.getBoundingClientRect();
    return {
      docH,
      winH,
      bodyH,
      composerBottom: rect?.bottom,
      composerVisible: rect ? rect.bottom <= winH : false,
      streamScrollTop: stream?.scrollTop,
      streamScrollHeight: stream?.scrollHeight,
      streamClientHeight: stream?.clientHeight
    };
  });
  console.log("\nLayout Verification:", layout);

  // Markdown element stats
  const mdStats = await page.evaluate(() => {
    const codeBlocks = document.querySelectorAll(".md-code-block").length;
    const inlineCodes = document.querySelectorAll(".inline-code").length;
    const bulletLists = document.querySelectorAll(".md-bullet-list").length;
    const copyBtns = document.querySelectorAll(".md-code-copy-btn, .mini-btn").length;
    return { codeBlocks, inlineCodes, bulletLists, copyBtns };
  });
  console.log("\nParsed Markdown Elements:", mdStats);

  await browser.close();

  if (!layout.composerVisible) {
    throw new Error(`Composer is cut off or outside window! bottom: ${layout.composerBottom}, winH: ${layout.winH}`);
  }
  if (layout.docH > layout.winH + 5) {
    throw new Error(`Window is overflowing! docH: ${layout.docH}, winH: ${layout.winH}`);
  }
  console.log("\n==========================================");
  console.log("CHAT EXPERIENCE & STREAMING MARKDOWN VERIFIED! 🚀");
  console.log("==========================================");
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
