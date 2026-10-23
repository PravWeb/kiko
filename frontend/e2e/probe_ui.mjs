import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", (msg) => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
  page.on("pageerror", (err) => console.error("[Browser Error]:", err));
  page.on("request", (req) => {
    if (req.url().includes("/api/")) {
      console.log(`[API Request]: ${req.method()} ${req.url()}`);
    }
  });
  page.on("response", (res) => {
    if (res.url().includes("/api/")) {
      console.log(`[API Response]: ${res.status()} ${res.url()}`);
    }
  });

  await page.goto("http://127.0.0.1:8000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const input = page.locator(".composer-input");
  await input.fill("what is docker");
  await page.waitForTimeout(300);

  console.log("Pressing Enter to send message...");
  await input.press("Enter");

  // Monitor for 15 seconds
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const msgs = document.querySelectorAll(".bubble-msg");
      const lastMsg = msgs[msgs.length - 1];
      const sendBtn = document.querySelector(".send-btn");
      return {
        msgCount: msgs.length,
        lastRole: lastMsg?.className,
        lastText: lastMsg?.textContent?.slice(0, 100),
        sendBtnText: sendBtn?.textContent,
        sendBtnDisabled: sendBtn?.hasAttribute("disabled")
      };
    });
    console.log(`[Second ${i + 1}]:`, state);
  }

  await browser.close();
}

run().catch(console.error);
