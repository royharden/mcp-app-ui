// BROWSER-01 (pending): real-browser checks of the Lab's sandbox and CSP. NOT part of `npm test`
// and excluded from tsconfig: it needs @playwright/test and a browser, which are deliberately
// not dependencies yet. See tests/e2e/README.md for how and when to activate it.
//
// These observe actual browser behaviour instead of asserting the plan's diagrams. The Lab is
// a srcdoc + meta-CSP inspection host, not a separate-origin production sandbox; a reference
// host (ext-apps basic-host revision to be named) is the target for two-origin checks.
import { expect, test } from "@playwright/test";

const LAB_URL = process.env.APPROVAL_DESK_LAB_URL ?? "";

test.describe("BROWSER-01 Lab sandbox", () => {
  test.skip(LAB_URL === "", "Set APPROVAL_DESK_LAB_URL to a served dist/ (port claimed via agent-ports).");

  test("the view frame is allow-scripts only and its document is unreadable from the Lab", async ({ page }) => {
    await page.goto(LAB_URL);
    const frame = page.locator("iframe.view-frame");
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    const readable = await page.evaluate(() => {
      const el = document.querySelector<HTMLIFrameElement>("iframe.view-frame");
      try {
        return el?.contentDocument !== null;
      } catch {
        return false;
      }
    });
    expect(readable).toBe(false);
  });

  test("the view renders the queue and records a decision through the real handlers", async ({ page }) => {
    await page.goto(LAB_URL);
    const view = page.frameLocator("iframe.view-frame");
    await expect(view.locator('[data-phase="ready"]')).toBeVisible({ timeout: 10000 });
    await view.locator('button[data-action="select"][data-id="REQ-104"]').click();
    await view.locator('input[name="decision"][value="approve"]').check();
    await view.locator('input[name="reason"]').fill("Sandbox renewal approved");
    await view.locator('button[data-action="prepare"]').click();
    await expect(view.locator('[data-field="statement"]')).toHaveText(
      'Approve REQ-104 | title="Renew sandbox editor" | USD 1240.00 | version=3 | reason="Sandbox renewal approved"',
    );
    await view.locator('button[data-action="confirm"]').click();
    await expect(view.locator('[data-outcome="recorded"]')).toBeVisible();
  });

  test("CSP blocks undeclared network and navigation from inside the view", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
    });
    let externalRequests = 0;
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (!url.startsWith(LAB_URL)) externalRequests += 1;
      return route.continue();
    });
    await page.goto(LAB_URL);
    const view = page.frameLocator("iframe.view-frame");
    await expect(view.locator('[data-phase="ready"]')).toBeVisible({ timeout: 10000 });
    // Probe from inside the frame: fetch and an image load must both be refused by the policy.
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame?.evaluate(async () => {
      try {
        await fetch("https://example.test/exfiltrate");
      } catch {
        /* expected */
      }
      const img = document.createElement("img");
      img.src = "https://example.test/pixel.png";
      document.body.appendChild(img);
    });
    await page.waitForTimeout(500);
    expect(externalRequests).toBe(0);
    expect(violations.length).toBeGreaterThan(0);
  });
});
