import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Stale-while-revalidate disk cache for Edgee models.
 *
 * Edgee's `GET /v1/models` only returns id/object/owned_by/created — no
 * pricing, context window, or capabilities. We enrich live-fetched ids with a
 * models.dev-sourced metadata table, then persist the fully-built
 * {@link ProviderModelConfig} array to disk so the next launch can register the
 * provider synchronously, before `session_start` revalidates from the live API.
 *
 * Pi validates scoped models (e.g. `edgee/openai/gpt-5.2`) during startup,
 * *before* `session_start` fires. Without a cache, the first run warns once
 * about "No models match pattern" until the first revalidation writes a cache.
 * Subsequent runs resolve cleanly from the cache.
 *
 * Invalidation is by content, not URL: the gateway base URL is fixed, so the
 * cache carries no URL key. Every successful `session_start` revalidation
 * overwrites the cache with the live model list, so newly accessible providers
 * or models take effect on the next launch (and within the same session once
 * revalidation re-registers the provider).
 *
 * File shape: `{ version: 1, models: ProviderModelConfig[] }`.
 */

const CACHE_VERSION = 1;
const CACHE_FILENAME = "edgee-models.json";

function cachePath(): string {
  return join(getAgentDir(), "cache", CACHE_FILENAME);
}

export interface EdgeeModelsCacheFile {
  version?: unknown;
  models?: unknown;
}

export interface EdgeeModelsCache {
  models: ProviderModelConfig[];
}

/**
 * Read cached Edgee models synchronously.
 *
 * Designed to be called from the provider extension factory body, before Pi
 * enters the event loop. Returns `null` if the cache is missing, unreadable,
 * malformed, or for an incompatible version.
 */
export function loadCachedEdgeeModels(): EdgeeModelsCache | null {
  try {
    const path = cachePath();
    if (!existsSync(path)) return null;

    const parsed: EdgeeModelsCacheFile = JSON.parse(readFileSync(path, "utf8"));
    if (parsed.version !== CACHE_VERSION) return null;
    if (!Array.isArray(parsed.models)) return null;

    return { models: parsed.models as ProviderModelConfig[] };
  } catch {
    return null;
  }
}

/**
 * Persist Edgee models to disk for the next startup.
 *
 * Called after a successful `/v1/models` fetch. Failures are swallowed since
 * a missing cache only degrades to the first-run path (next session
 * revalidates and writes again).
 */
export async function writeCachedEdgeeModels(
  models: ProviderModelConfig[],
): Promise<void> {
  try {
    const path = cachePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      `${JSON.stringify({ version: CACHE_VERSION, models }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // Cache writes are best-effort. A missing cache only falls back to the
    // first-run path (next session revalidates and writes again).
    return;
  }
}
