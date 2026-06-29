import { describe, expect, it } from "vitest";
import { type EdgeeApiModel, EdgeeClient } from "./client";
import {
  type BuiltInModelLookup,
  buildEdgeeModels,
  fetchEdgeeModels,
} from "./models";

function apiModel(id: string, ownedBy = id.split("/")[0]): EdgeeApiModel {
  return { id, object: "model", owned_by: ownedBy, created: 0 };
}

describe("Edgee models", () => {
  it("returns an empty array when the models endpoint reports no data", () => {
    expect(buildEdgeeModels([])).toEqual([]);
  });

  it("maps every model with defaults when no lookup is provided", () => {
    const apiModels = [
      apiModel("openai/gpt-5.2", "openai"),
      apiModel("anthropic/claude-opus-4-8", "anthropic"),
    ];
    const mapped = buildEdgeeModels(apiModels);

    expect(mapped.map((m) => m.id).sort()).toEqual([
      "anthropic/claude-opus-4-8",
      "openai/gpt-5.2",
    ]);

    for (const model of mapped) {
      // Gateway is the only source of truth — no hardcoded per-model metadata.
      expect(model.reasoning).toBe(false);
      expect(model.input).toEqual(["text"]);
      expect(model.cost).toEqual({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      });
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
      expect(model.compat).toMatchObject({
        maxTokensField: "max_tokens",
        supportsUsageInStreaming: true,
      });
    }
  });

  it("inherits cost/modalities/context/reasoning from a matching built-in", () => {
    const lookup: BuiltInModelLookup = (provider, modelId) => {
      if (provider === "openai" && modelId === "gpt-5.2") {
        return {
          reasoning: true,
          input: ["text", "image"],
          cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
          contextWindow: 400000,
          maxTokens: 128000,
        };
      }
      return undefined;
    };

    const mapped = buildEdgeeModels(
      [apiModel("openai/gpt-5.2"), apiModel("meta/llama3-2-1b-instruct")],
      lookup,
    );

    const gpt52 = mapped.find((m) => m.id === "openai/gpt-5.2");
    expect(gpt52?.reasoning).toBe(true);
    expect(gpt52?.input).toEqual(["text", "image"]);
    expect(gpt52?.cost.input).toBe(1.75);
    expect(gpt52?.contextWindow).toBe(400000);
    expect(gpt52?.maxTokens).toBe(128000);

    // Edgee-only provider: falls back to defaults.
    const llama = mapped.find((m) => m.id === "meta/llama3-2-1b-instruct");
    expect(llama?.reasoning).toBe(false);
    expect(llama?.input).toEqual(["text"]);
    expect(llama?.cost.input).toBe(0);
  });

  it("never copies api/baseUrl/compat from the built-in", () => {
    const lookup: BuiltInModelLookup = (provider, modelId) =>
      provider === "anthropic" && modelId === "claude-opus-4-8"
        ? {
            reasoning: true,
            input: ["text", "image"],
            cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
            contextWindow: 1000000,
            maxTokens: 128000,
          }
        : undefined;

    const [model] = buildEdgeeModels(
      [apiModel("anthropic/claude-opus-4-8")],
      lookup,
    );

    // Edgee exposes every model through its unified OpenAI-compatible endpoint,
    // so the registered api is always openai-completions regardless of upstream.
    expect(model.compat).toEqual({
      maxTokensField: "max_tokens",
      supportsUsageInStreaming: true,
    });
    expect(model.reasoning).toBe(true);
    expect(model.input).toEqual(["text", "image"]);
  });

  it.skipIf(!process.env.EDGEE_API_KEY)(
    "can fetch Edgee API models with EDGEE_API_KEY",
    { timeout: 30000 },
    async () => {
      const client = new EdgeeClient({
        apiKey: process.env.EDGEE_API_KEY ?? "",
      });
      const models = await fetchEdgeeModels(client);
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        expect(model.id).toMatch(/^[a-z0-9]+\/[a-z0-9.-]+$/);
      }
    },
  );
});
