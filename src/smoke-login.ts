import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { loadConfig } from "./config.js";
import { ensureNotionLogin } from "./login.js";

const config = loadConfig();
const authStateExists = fs.existsSync(config.authStatePath);

const browser = await chromium.launch({
  headless: config.headless,
  slowMo: config.slowMoMs,
});

try {
  const context = await browser.newContext({
    storageState: authStateExists ? config.authStatePath : undefined,
  });

  const page = await ensureNotionLogin(context, config);

  console.log("Notion login smoke check passed.");
  console.log(`Current URL: ${page.url()}`);
  console.log(`Auth state: ${path.resolve(config.authStatePath)}`);
} finally {
  await browser.close();
}
