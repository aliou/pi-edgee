import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createEdgeeLookup } from "./registry-lookup";

function fakeModel(
  provider: string,
  id: string,
  overrides: Partial<{
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
  }> = {},
) {
  return {
    provider,
    id,
    name: id,
    api: "openai-completions" as const,
    baseUrl: "https://example.com",
    reasoning: overrides.reasoning ?? false,
    input: overrides.input ?? ["text"],
    cost: overrides.cost ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: overrides.contextWindow ?? 128000,
    maxTokens: overrides.maxTokens ?? 8192,
  };
}

describe("createEdgeeLookup", () => {
  it("returns a direct registry match when available", () => {
    const registry = {
      find: (provider: string, modelId: string) =>
        provider === "openai" && modelId === "gpt-5.2"
          ? fakeModel("openai", "gpt-5.2", {
              reasoning: true,
              input: ["text", "image"],
              cost: {
                input: 1.75,
                output: 14,
                cacheRead: 0.175,
                cacheWrite: 0,
              },
              contextWindow: 400000,
              maxTokens: 128000,
            })
          : undefined,
      getAll: () => [],
    } as unknown as ModelRegistry;

    const lookup = createEdgeeLookup(registry);
    const result = lookup("openai", "gpt-5.2");

    expect(result?.reasoning).toBe(true);
    expect(result?.input).toEqual(["text", "image"]);
    expect(result?.cost.input).toBe(1.75);
    expect(result?.contextWindow).toBe(400000);
  });

  it("falls back to OpenRouter for Edgee-only providers", () => {
    const registry = {
      find: () => undefined,
      getAll: () => [
        fakeModel("openrouter", "meta-llama/llama-3.2-1b-instruct", {
          reasoning: false,
          input: ["text"],
          cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 131072,
          maxTokens: 4096,
        }),
      ],
    } as unknown as ModelRegistry;

    const lookup = createEdgeeLookup(registry);
    const result = lookup("meta", "llama3-2-1b-instruct");

    expect(result).not.toBeUndefined();
    expect(result?.contextWindow).toBe(131072);
    expect(result?.cost.input).toBe(0.1);
  });

  it("prefers cached metadata over OpenRouter for Edgee-only providers", () => {
    const registry = {
      find: () => undefined,
      getAll: () => [
        fakeModel("openrouter", "meta-llama/llama-3.2-1b-instruct", {
          contextWindow: 131072,
          maxTokens: 4096,
        }),
      ],
    } as unknown as ModelRegistry;

    const lookup = createEdgeeLookup(registry, [
      {
        id: "meta/llama3-2-1b-instruct",
        name: "Meta llama3-2-1b-instruct",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 9.99, output: 99, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1234,
        maxTokens: 5678,
      },
    ]);

    const result = lookup("meta", "llama3-2-1b-instruct");
    expect(result?.reasoning).toBe(true);
    expect(result?.contextWindow).toBe(1234);
    expect(result?.cost.input).toBe(9.99);
  });

  it("only searches OpenRouter, not other proxy providers", () => {
    const registry = {
      find: () => undefined,
      getAll: () => [
        fakeModel("cloudflare-workers-ai", "meta-llama/llama-3.2-1b-instruct", {
          contextWindow: 999999,
          maxTokens: 999999,
        }),
      ],
    } as unknown as ModelRegistry;

    const lookup = createEdgeeLookup(registry);
    expect(lookup("meta", "llama3-2-1b-instruct")).toBeUndefined();
  });

  it("does not search OpenRouter for known upstream providers", () => {
    const registry = {
      find: () => undefined,
      getAll: () => [
        fakeModel("openrouter", "anthropic/claude-opus-4-8", {
          reasoning: true,
          contextWindow: 1000000,
          maxTokens: 128000,
        }),
      ],
    } as unknown as ModelRegistry;

    const lookup = createEdgeeLookup(registry);
    expect(lookup("anthropic", "claude-opus-4-8")).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    const registry = {
      find: () => undefined,
      getAll: () => [],
    } as unknown as ModelRegistry;

    const lookup = createEdgeeLookup(registry);
    expect(lookup("meta", "unknown-model")).toBeUndefined();
  });
});
