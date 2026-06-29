import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { EdgeeApiModel, EdgeeClient } from "./client";

const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_COMPAT = {
  maxTokensField: "max_tokens" as const,
  supportsUsageInStreaming: true,
};

/**
 * Fields copied from a Pi built-in model when an Edgee `owned_by` matches a
 * known provider. We copy only the objective metadata — pricing, modalities,
 * context/output limits, reasoning — never `api`/`baseUrl`/`compat`/
 * `thinkingLevelMap`, which are upstream-native. Edgee exposes every model
 * through its unified OpenAI-compatible `/v1/chat/completions` endpoint, so
 * the registered api is always `openai-completions` regardless of upstream.
 */
export interface BuiltInModel {
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
}

/**
 * Lookup a built-in model by `{provider}/{model}` split. Returns `undefined`
 * when there is no matching Pi provider (e.g. Edgee-only providers like `meta`
 * or `qwen`, or when the registry is not available — factory body).
 */
export type BuiltInModelLookup = (
  provider: string,
  modelId: string,
) => BuiltInModel | undefined;

function formatModelName(id: string, ownedBy: string): string {
  const modelPart = id.includes("/") ? id.split("/")[1] : id;
  const provider =
    ownedBy.charAt(0).toUpperCase() + ownedBy.slice(1).toLowerCase();
  return `${provider} ${modelPart}`;
}

function defaultModelConfig(model: EdgeeApiModel): ProviderModelConfig {
  return {
    id: model.id,
    name: formatModelName(model.id, model.owned_by),
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    compat: DEFAULT_COMPAT,
  } satisfies ProviderModelConfig;
}

function edgeeModelConfig(
  model: EdgeeApiModel,
  lookup?: BuiltInModelLookup,
): ProviderModelConfig {
  const base = defaultModelConfig(model);
  if (!lookup) return base;

  const [provider, modelId] = splitId(model.id);
  if (!provider || !modelId) return base;

  const builtIn = lookup(provider, modelId);
  if (!builtIn) return base;

  return {
    ...base,
    reasoning: builtIn.reasoning,
    input: builtIn.input,
    cost: builtIn.cost,
    contextWindow: builtIn.contextWindow,
    maxTokens: builtIn.maxTokens,
  } satisfies ProviderModelConfig;
}

function splitId(id: string): [string, string] {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) return ["", ""];
  return [id.slice(0, slash), id.slice(slash + 1)];
}

/**
 * Map Edgee `GET /v1/models` results into Pi provider model configs. When a
 * `lookup` is provided, models whose `{provider}/{model}` matches a Pi
 * built-in inherit that model's cost/modalities/context/limits/reasoning.
 * Models with no match (Edgee-only providers, or no registry) fall back to
 * conservative defaults. Returns an empty array when Edgee reports no models.
 */
export function buildEdgeeModels(
  models: EdgeeApiModel[],
  lookup?: BuiltInModelLookup,
): ProviderModelConfig[] {
  return models.map((model) => edgeeModelConfig(model, lookup));
}

/**
 * Fetch the live model list via {@link EdgeeClient.models} and map it into Pi
 * provider model configs. Pass a `lookup` to enrich models from Pi's built-in
 * registry (see {@link buildEdgeeModels}). Returns an empty array when the
 * gateway reports no models. Never prints the API key; the client handles auth.
 */
export async function fetchEdgeeModels(
  client: EdgeeClient,
  signal?: AbortSignal,
  lookup?: BuiltInModelLookup,
): Promise<ProviderModelConfig[]> {
  const models = await client.models(signal);
  return buildEdgeeModels(models, lookup);
}
