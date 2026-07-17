import type { Api, Model } from "@earendil-works/pi-ai";
import { getApiProvider } from "@earendil-works/pi-ai/compat";
import type {
  ExtensionAPI,
  ExtensionContext,
  ModelRegistry,
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
} from "../../src";

function storeModelToConfig(model: Model<Api>): ProviderModelConfig {
  return {
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    thinkingLevelMap: model.thinkingLevelMap,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    headers: model.headers,
    compat: model.compat,
  } satisfies ProviderModelConfig;
}

function storeModelsToConfigs(
  models?: readonly Model<Api>[],
): ProviderModelConfig[] {
  return models?.map(storeModelToConfig) ?? [];
}

function configToStoreModel(config: ProviderModelConfig): Model<Api> {
  return {
    ...config,
    api: config.api ?? "openai-completions",
    provider: EDGEE_PROVIDER_ID,
    baseUrl: config.baseUrl ?? EDGEE_PROVIDER_BASE_URL,
  };
}

export default async function (pi: ExtensionAPI) {
  let latestRegistry: ModelRegistry | undefined;
  const base = getApiProvider("openai-completions")?.streamSimple;

  pi.registerProvider(EDGEE_PROVIDER_ID, {
    name: EDGEE_PROVIDER_NAME,
    baseUrl: EDGEE_PROVIDER_BASE_URL,
    apiKey: `$${EDGEE_API_KEY_ENV}`,
    api: "openai-completions",
    headers: EDGEE_ATTRIBUTION_HEADERS,
    streamSimple: base
      ? (model, context, options = {}) => {
          return base(model, context, {
            ...options,
            headers: {
              ...EDGEE_ATTRIBUTION_HEADERS,
              ...options.headers,
              [EDGEE_SESSION_ID_HEADER]: options.sessionId ?? "",
            },
          });
        }
      : undefined,
    models: [],
    async refreshModels(context) {
      const stored = await context.store.read();
      const cachedModels = storeModelsToConfigs(stored?.models);
      const lookup: BuiltInModelLookup | undefined = latestRegistry
        ? createEdgeeLookup(latestRegistry, cachedModels)
        : undefined;

      if (!context.allowNetwork) return cachedModels;

      const apiKey = await getEdgeeApiKey(context.credential);
      if (!apiKey) return cachedModels;

      try {
        const client = new EdgeeClient({ apiKey });
        const models = await fetchEdgeeModels(client, context.signal, lookup);
        if (models.length === 0) return cachedModels;

        await context.store.write({
          models: models.map(configToStoreModel),
          checkedAt: Date.now(),
        });
        return models;
      } catch {
        // Keep and return the last model-store catalog on transient failures.
        return cachedModels;
      }
    },
  });

  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    latestRegistry = ctx.modelRegistry;
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
