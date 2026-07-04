import { getApiProvider } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import {
  type BuiltInModelLookup,
  createEdgeeLookup,
  EDGEE_API_KEY_ENV,
  EDGEE_ATTRIBUTION_HEADERS,
  EDGEE_OVERFLOW_PATTERN,
  EDGEE_PROVIDER_BASE_URL,
  EDGEE_PROVIDER_ID,
  EDGEE_PROVIDER_NAME,
  EDGEE_SESSION_ID_HEADER,
  EdgeeClient,
  fetchEdgeeModels,
  getEdgeeApiKey,
  loadCachedEdgeeModels,
  writeCachedEdgeeModels,
} from "../../src";

function registerEdgeeProvider(
  pi: ExtensionAPI,
  models: ProviderModelConfig[],
): void {
  if (models.length === 0) return;

  const base = getApiProvider("openai-completions")?.streamSimple;
  pi.registerProvider(EDGEE_PROVIDER_ID, {
    name: EDGEE_PROVIDER_NAME,
    baseUrl: EDGEE_PROVIDER_BASE_URL,
    apiKey: `$${EDGEE_API_KEY_ENV}`,
    api: "openai-completions",
    // Request attribution (OpenRouter-style: app URL + name). Always present,
    // including when streamSimple is unset.
    headers: EDGEE_ATTRIBUTION_HEADERS,
    ...(base
      ? {
          // Delegate to Pi's built-in openai-completions streamSimple, merging
          // the attribution headers with x-edgee-session-id (read live from
          // options.sessionId).
          streamSimple: (model, context, options = {}) =>
            base(model, context, {
              ...options,
              headers: {
                ...EDGEE_ATTRIBUTION_HEADERS,
                ...options.headers,
                [EDGEE_SESSION_ID_HEADER]: options.sessionId ?? "",
              },
            }),
        }
      : {}),
    models,
  });
}

/**
 * Revalidate the model list from the live gateway, enrich from Pi's built-in
 * registry, re-register, and persist the cache. `authStorage` and `lookup` come
 * from `session_start` (Pi does not expose them to factories). Returns the
 * fetched models, or `null` when the key is missing or the fetch fails.
 */
async function revalidateModels(
  pi: ExtensionAPI,
  authStorage: Parameters<typeof getEdgeeApiKey>[0],
  lookup: BuiltInModelLookup,
  signal?: AbortSignal,
): Promise<ProviderModelConfig[] | null> {
  const apiKey = await getEdgeeApiKey(authStorage);
  if (!apiKey) return null;

  const client = new EdgeeClient({ apiKey });
  let models: ProviderModelConfig[];
  try {
    models = await fetchEdgeeModels(client, signal, lookup);
  } catch {
    // Keep whatever is registered (cached models, if any). The cache is not
    // overwritten on failure so the next successful fetch can still reseed.
    return null;
  }

  if (models.length === 0) return null;

  registerEdgeeProvider(pi, models);
  await writeCachedEdgeeModels(models);
  return models;
}

export default async function (pi: ExtensionAPI) {
  // Register synchronously from the on-disk cache so the provider shows up in
  // pre-session UIs and scoped models validate at startup. The model list is
  // only discoverable via authenticated `GET /v1/models`, which needs
  // `authStorage` — only available in `session_start`. So the factory registers
  // from cache; `session_start` revalidates from the live gateway, re-registers,
  // and writes the cache back. First run with no cache warns once until the
  // first revalidation persists a cache.
  const cache = loadCachedEdgeeModels();
  if (cache) registerEdgeeProvider(pi, cache.models);

  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    const lookup = createEdgeeLookup(ctx.modelRegistry, cache?.models);

    void revalidateModels(
      pi,
      ctx.modelRegistry.authStorage,
      lookup,
      ctx.signal,
    );
  });

  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;
    if (
      message.provider !== EDGEE_PROVIDER_ID &&
      ctx.model?.provider !== EDGEE_PROVIDER_ID
    ) {
      return;
    }

    const errorMessage = message.errorMessage ?? "";
    if (errorMessage.includes("context_length_exceeded")) return;
    if (!EDGEE_OVERFLOW_PATTERN.test(errorMessage)) return;

    return {
      message: {
        ...message,
        errorMessage: `context_length_exceeded: ${errorMessage}`,
      },
    };
  });
}
