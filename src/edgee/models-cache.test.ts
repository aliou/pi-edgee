import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const FAKE_AGENT_DIR = join(
  tmpdir(),
  `edgee-cache-test-${process.pid}-${Date.now()}`,
);

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: () => FAKE_AGENT_DIR,
}));

// Import after the getAgentDir mock is installed so cachePath() resolves to
// the isolated temp directory.
const { loadCachedEdgeeModels, writeCachedEdgeeModels } = await import(
  "./models-cache"
);

const CACHE_FILE = join(FAKE_AGENT_DIR, "cache", "edgee-models.json");

function modelsFixture(): ProviderModelConfig[] {
  return [
    {
      id: "openai/gpt-5.2",
      name: "Openai gpt-5.2",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
      contextWindow: 400000,
      maxTokens: 128000,
      compat: { maxTokensField: "max_tokens", supportsUsageInStreaming: true },
    },
  ];
}

function writeRaw(content: string): void {
  writeFileSync(CACHE_FILE, content, "utf8");
}

describe("edgee models cache", () => {
  beforeEach(() => {
    rmSync(FAKE_AGENT_DIR, { recursive: true, force: true });
    mkdirSync(join(FAKE_AGENT_DIR, "cache"), { recursive: true });
  });

  afterEach(() => {
    rmSync(FAKE_AGENT_DIR, { recursive: true, force: true });
  });

  test("returns null when no cache file exists", () => {
    expect(loadCachedEdgeeModels()).toBeNull();
  });

  test("round-trips models", async () => {
    const models = modelsFixture();
    await writeCachedEdgeeModels(models);

    const loaded = loadCachedEdgeeModels();
    expect(loaded).not.toBeNull();
    expect(loaded?.models).toEqual(models);
  });

  test("returns null when version mismatches", async () => {
    await writeCachedEdgeeModels(modelsFixture());
    const parsed = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    writeRaw(JSON.stringify({ ...parsed, version: 999 }));

    expect(loadCachedEdgeeModels()).toBeNull();
  });

  test("returns null for malformed JSON", () => {
    writeRaw("{not json");
    expect(loadCachedEdgeeModels()).toBeNull();
  });

  test("returns null when models is not an array", () => {
    writeRaw(JSON.stringify({ version: 1, models: "nope" }));
    expect(loadCachedEdgeeModels()).toBeNull();
  });

  test("write is best-effort: does not throw on read-only dir", async () => {
    rmSync(FAKE_AGENT_DIR, { recursive: true, force: true });
    mkdirSync(FAKE_AGENT_DIR, { recursive: true });
    chmodSync(FAKE_AGENT_DIR, 0o500);

    await expect(
      writeCachedEdgeeModels(modelsFixture()),
    ).resolves.toBeUndefined();

    chmodSync(FAKE_AGENT_DIR, 0o700);
  });

  test("existsSync import sanity", () => {
    expect(typeof existsSync).toBe("function");
  });
});
