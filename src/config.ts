import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

const defaultStartUrl =
  "https://www.notion.so/Getting-Started-36782406b101807e9155e4d448b729c4?source=copy_link";
const defaultWorkspaceId = "c3050e2d-7206-817f-bed8-00038848f12a";

export type Config = {
  googleEmail: string;
  googlePassword: string;
  googleTotpSecret?: string;
  notionStartUrl: string;
  notionWorkspaceId: string;
  headless: boolean;
  slowMoMs: number;
  loginWaitMs: number;
  outputDir: string;
  authStatePath: string;
};

export function loadConfig(): Config {
  const outputDir = envOptional("OUTPUT_DIR") ?? "output";

  return {
    googleEmail: envRequired("GOOGLE_EMAIL"),
    googlePassword: envRequired("GOOGLE_PASSWORD"),
    googleTotpSecret: envOptional("GOOGLE_TOTP_SECRET"),
    notionStartUrl: envOptional("NOTION_START_URL") ?? defaultStartUrl,
    notionWorkspaceId: envOptional("NOTION_WORKSPACE_ID") ?? defaultWorkspaceId,
    headless: parseBoolean(envOptional("HEADLESS"), false),
    slowMoMs: parseNumber(envOptional("SLOW_MO_MS"), 0),
    loginWaitMs: parseNumber(envOptional("LOGIN_WAIT_MS"), 300_000),
    outputDir,
    authStatePath:
      envOptional("AUTH_STATE_PATH") ??
      path.join("playwright", ".auth", "notion-google.json"),
  };
}

function envRequired(name: string): string {
  const value = envOptional(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function envOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative number, received: ${value}`);
  }

  return parsed;
}
