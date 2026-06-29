import { afterEach, describe, expect, it, vi } from "vitest";
import { type EdgeeApiModel, EdgeeClient } from "./client";
import { EDGEE_ATTRIBUTION_HEADERS, EDGEE_GATEWAY_BASE_URL } from "./constants";

const SAMPLE_BODY = {
  object: "list",
  data: [
    {
      id: "openai/gpt-5.2",
      object: "model",
      owned_by: "openai",
      created: 1,
    },
  ],
};

interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

function jsonResponse(body: unknown, status = 200): MockResponse {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

type FetchImpl = typeof fetch;
type FetchMock = ReturnType<typeof vi.fn> & FetchImpl;

function mockFetchOnce(
  handler: (input: string | URL | Request, init?: RequestInit) => MockResponse,
): FetchMock {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(input, init),
  ) as unknown as FetchMock;
  globalThis.fetch = fn;
  return fn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EdgeeClient", () => {
  it("sends Bearer auth, attribution headers, and no session id", async () => {
    const fn = mockFetchOnce(() => jsonResponse(SAMPLE_BODY));
    const client = new EdgeeClient({ apiKey: "secret-key" });

    await client.models();

    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toBe(`${EDGEE_GATEWAY_BASE_URL}/v1/models`);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    expect(headers.accept).toBe("application/json");
    expect(headers.Referer).toBe(EDGEE_ATTRIBUTION_HEADERS.Referer);
    expect(headers["X-Title"]).toBe(EDGEE_ATTRIBUTION_HEADERS["X-Title"]);
    // The model-list client never sends a session id; that header is injected
    // into LLM traffic by the streamSimple wrapper, not here.
    expect(headers["x-edgee-session-id"]).toBeUndefined();
  });

  it("honours a custom base url", async () => {
    const fn = mockFetchOnce(() => jsonResponse(SAMPLE_BODY));
    const client = new EdgeeClient({
      apiKey: "secret-key",
      baseUrl: "https://custom.gateway.example/",
    });

    await client.models();

    const [url] = fn.mock.calls[0];
    expect(String(url)).toBe("https://custom.gateway.example/v1/models");
  });

  it("returns the data array as typed models", async () => {
    mockFetchOnce(() => jsonResponse(SAMPLE_BODY));
    const client = new EdgeeClient({ apiKey: "secret-key" });

    const models = await client.models();
    expect(models).toEqual<EdgeeApiModel[]>(SAMPLE_BODY.data);
  });

  it("returns an empty array when data is missing", async () => {
    mockFetchOnce(() => jsonResponse({ object: "list" }));
    const client = new EdgeeClient({ apiKey: "secret-key" });

    const models = await client.models();
    expect(models).toEqual([]);
  });

  it("throws EdgeeHttpError with status and body on failure", async () => {
    mockFetchOnce(() => jsonResponse({ error: { code: "unauthorized" } }, 401));
    const client = new EdgeeClient({ apiKey: "bad" });

    await expect(client.models()).rejects.toMatchObject({
      name: "EdgeeHttpError",
      status: 401,
    });
    await expect(client.models()).rejects.toThrow(/401/);
  });
});
