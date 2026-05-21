import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Locator, Page } from "playwright";
import type { Config } from "./config.js";
import { generateTotp } from "./totp.js";

const notionLoginUrl = "https://www.notion.so/login";

export async function ensureNotionLogin(
  context: BrowserContext,
  config: Config,
): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(notionLoginUrl, { waitUntil: "domcontentloaded" });

  if (await isSignedInNotionPage(page)) {
    await page.goto(config.notionStartUrl, { waitUntil: "domcontentloaded" });
    await saveStorageState(context, config.authStatePath);
    return page;
  }

  const authPage = await clickGoogleSignIn(page, context);
  await completeGoogleLogin(authPage, config);

  const notionPage = await waitForSignedInNotionPage(context, config.loginWaitMs);
  await notionPage.goto(config.notionStartUrl, { waitUntil: "domcontentloaded" });
  await saveStorageState(context, config.authStatePath);

  return notionPage;
}

async function clickGoogleSignIn(
  page: Page,
  context: BrowserContext,
): Promise<Page> {
  const popupPromise = page.waitForEvent("popup", { timeout: 5_000 }).catch(() => null);

  await clickFirstVisible([
    page.getByRole("button", { name: /continue with google|sign in with google/i }),
    page.getByText(/continue with google|sign in with google/i),
    page.locator('[role="button"]').filter({ hasText: /google/i }),
  ]);

  const popup = await Promise.race([
    popupPromise,
    page.waitForURL(/accounts\.google\.com/, { timeout: 5_000 }).then(() => null).catch(() => null),
  ]);

  if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    return popup;
  }

  const googlePage = context.pages().find((candidate) =>
    candidate.url().includes("accounts.google.com"),
  );

  return googlePage ?? page;
}

async function completeGoogleLogin(page: Page, config: Config): Promise<void> {
  const deadline = Date.now() + config.loginWaitMs;

  while (Date.now() < deadline) {
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);

    if (await isSignedInNotionPage(page)) {
      return;
    }

    await failOnKnownGoogleBlockers(page);

    if (await clickAccountChoice(page, config.googleEmail)) {
      await waitShort();
      continue;
    }

    if (await fillGoogleEmail(page, config.googleEmail)) {
      await waitShort();
      continue;
    }

    if (await fillGooglePassword(page, config.googlePassword)) {
      await waitShort();
      continue;
    }

    if (await fillTotpIfRequested(page, config.googleTotpSecret)) {
      await waitShort();
      continue;
    }

    if (await clickConsentContinue(page)) {
      await waitShort();
      continue;
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error(
    "Timed out waiting for Google login to finish. If Google requested device verification or CAPTCHA, rerun headed and complete that step manually in the browser.",
  );
}

async function clickAccountChoice(page: Page, email: string): Promise<boolean> {
  return clickIfVisible(page.getByText(email, { exact: false }));
}

async function fillGoogleEmail(page: Page, email: string): Promise<boolean> {
  const emailInput = page.locator('input[type="email"], input[name="identifier"]').first();

  if (!(await isVisible(emailInput))) {
    return false;
  }

  await emailInput.fill(email);
  await clickFirstVisible([
    page.locator("#identifierNext button"),
    page.getByRole("button", { name: /^next$/i }),
  ]);
  return true;
}

async function fillGooglePassword(page: Page, password: string): Promise<boolean> {
  const passwordInput = page.locator('input[type="password"], input[name="Passwd"]').first();

  if (!(await isVisible(passwordInput))) {
    return false;
  }

  await passwordInput.fill(password);
  await clickFirstVisible([
    page.locator("#passwordNext button"),
    page.getByRole("button", { name: /^next$/i }),
  ]);
  return true;
}

async function fillTotpIfRequested(
  page: Page,
  totpSecret: string | undefined,
): Promise<boolean> {
  const codeInput = page
    .locator('input[name="totpPin"], input[type="tel"], input[aria-label*="code" i]')
    .first();

  if (!(await isVisible(codeInput))) {
    return false;
  }

  if (!totpSecret) {
    console.log(
      "Google requested a verification code. Complete it manually in the headed browser, or set GOOGLE_TOTP_SECRET and rerun.",
    );
    return false;
  }

  await codeInput.fill(generateTotp(totpSecret));
  await clickFirstVisible([
    page.getByRole("button", { name: /^next$/i }),
    page.getByRole("button", { name: /^verify$/i }),
  ]);
  return true;
}

async function clickConsentContinue(page: Page): Promise<boolean> {
  return clickFirstVisibleIfAny([
    page.getByRole("button", { name: /^continue$/i }),
    page.getByRole("button", { name: /^allow$/i }),
    page.getByRole("button", { name: /^i understand$/i }),
  ]);
}

async function waitForSignedInNotionPage(
  context: BrowserContext,
  timeoutMs: number,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      if (await isSignedInNotionPage(page)) {
        return page;
      }
    }

    await context.pages()[0]?.waitForTimeout(1_000);
  }

  const urls = context.pages().map((page) => page.url()).join(", ");
  throw new Error(`Timed out waiting for a signed-in Notion page. Open pages: ${urls}`);
}

async function isSignedInNotionPage(page: Page): Promise<boolean> {
  const url = page.url();

  if (!url.includes("notion.so") || url.includes("/login")) {
    return false;
  }

  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  return !/continue with google|sign in with google|log in to notion/i.test(bodyText);
}

async function failOnKnownGoogleBlockers(page: Page): Promise<void> {
  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");

  if (/this browser or app may not be secure/i.test(bodyText)) {
    throw new Error(
      "Google rejected this automated browser. Run headed, use the dedicated test account, and complete any trust prompt manually.",
    );
  }
}

async function saveStorageState(
  context: BrowserContext,
  authStatePath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(authStatePath), { recursive: true });
  await context.storageState({ path: authStatePath });
}

async function clickFirstVisible(locators: Locator[]): Promise<void> {
  for (const locator of locators) {
    if (await clickIfVisible(locator)) {
      return;
    }
  }

  throw new Error("Could not find a visible element to click.");
}

async function clickFirstVisibleIfAny(locators: Locator[]): Promise<boolean> {
  for (const locator of locators) {
    if (await clickIfVisible(locator)) {
      return true;
    }
  }

  return false;
}

async function clickIfVisible(locator: Locator): Promise<boolean> {
  const candidate = locator.first();

  if (!(await isVisible(candidate))) {
    return false;
  }

  await candidate.click();
  return true;
}

async function isVisible(locator: Locator): Promise<boolean> {
  return locator.isVisible({ timeout: 2_000 }).catch(() => false);
}

async function waitShort(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 750));
}
