import type {
  ModelRegistry,
  ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import type { BuiltInModel, BuiltInModelLookup } from "./models";

/**
 * Providers that Pi's registry may not know directly, but which are available
 * through Edgee under a different provider prefix. When the registry has no
 * direct match, we look for the same upstream model through proxy providers.
 */
const EDGEE_ONLY_PROVIDERS = new Set(["meta", "qwen"]);

/**
 * Proxy providers used to resolve metadata for upstream models Pi does not
 * have built-in. OpenRouter exposes a broad catalog of open-weight models
 * under stable ids, so it is the primary fallback source.
 */
const PROXY_PROVIDERS = ["openrouter"];

function normalizeModelId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function matchesProxyModel(
  edgeeModelId: string,
  proxyModelId: string,
): boolean {
  const edgee = normalizeModelId(edgeeModelId);
  const proxy = normalizeModelId(proxyModelId);
  if (edgee.length === 0 || proxy.length === 0) return false;

  // Match if either normalized id contains the other. Proxy ids are usually
  // longer (e.g. openrouter's "meta-llama/llama-3.2-1b-instruct" contains
  // Edgee's "llama3-2-1b-instruct"), but tolerate both directions.
  return proxy.includes(edgee) || edgee.includes(proxy);
}

function modelToBuiltIn(model: {
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
}): BuiltInModel {
  return {
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}

function cachedModelToBuiltIn(model: {
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
}): BuiltInModel {
  return {
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}

/**
 * Build a {@link BuiltInModelLookup} backed by Pi's {@link ModelRegistry}.
 *
 * Tries the exact upstream provider first. If that fails and the Edgee
 * provider is one Pi does not know natively (e.g. `meta`, `qwen`), it first
 * reuses metadata from a matching cached model. If the model is not in the
 * cache, it searches OpenRouter models in the registry for a matching upstream
 * model id.
 */
export function createEdgeeLookup(
  registry: ModelRegistry,
  cachedModels: ProviderModelConfig[] = [],
): BuiltInModelLookup {
  const proxyModels = registry
    .getAll()
    .filter((model) => PROXY_PROVIDERS.includes(model.provider));

  const cacheById = new Map(cachedModels.map((model) => [model.id, model]));

  return (provider, modelId) => {
    const edgeeId = `${provider}/${modelId}`;

    const direct = registry.find(provider, modelId);
    if (direct) return modelToBuiltIn(direct);

    if (!EDGEE_ONLY_PROVIDERS.has(provider)) return undefined;

    const cached = cacheById.get(edgeeId);
    if (cached) return cachedModelToBuiltIn(cached);

    for (const model of proxyModels) {
      if (matchesProxyModel(modelId, model.id)) {
        return modelToBuiltIn(model);
      }
    }

    return undefined;
  };
}
