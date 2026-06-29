import { EDGEE_ATTRIBUTION_HEADERS, EDGEE_GATEWAY_BASE_URL } from "./constants";

/**
 * Minimal model object returned by Edgee's `GET /v1/models` endpoint.
 *
 * Edgee is a multi-provider gateway, so model ids use the `{author_id}/{model_id}`
 * format (e.g. `openai/gpt-5.2`). The list endpoint only exposes id, object,
 * owned_by, and created — no context window, pricing, or capabilities.
 */
export interface EdgeeApiModel {
  id: string;
  object: string;
  owned_by: string;
  created: number;
}

interface EdgeeApiModelsResponse {
  object: string;
  data: EdgeeApiModel[];
}

/**
 * HTTP error raised by {@link EdgeeClient.request}. Carries the status code so
 * callers can tolerate specific responses.
 */
export class EdgeeHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(method: string, path: string, status: number, body: string) {
    super(`[Edgee] ${method} ${path}: -> ${status} ${body.slice(0, 200)}`);
    this.name = "EdgeeHttpError";
    this.status = status;
    this.body = body;
  }
}

export interface EdgeeClientOptions {
  /** Gateway API key. Never printed by the client. */
  apiKey: string;
  /** Gateway API root. Defaults to {@link EDGEE_GATEWAY_BASE_URL}. */
  baseUrl?: string;
}

/**
 * Thin HTTP client for Edgee's Gateway API (`https://edgee.io`).
 *
 * Only used for the model-list endpoint. LLM traffic goes through Pi's
 * `openai-completions` provider path (with a `streamSimple` that injects the
 * session id header), not through this client. The client never logs the API
 * key; it only sends it as a Bearer token.
 */
export class EdgeeClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: EdgeeClientOptions) {
    this.baseUrl = (options.baseUrl ?? EDGEE_GATEWAY_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.apiKey = options.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...EDGEE_ATTRIBUTION_HEADERS,
    };

    const res = await fetch(url, { method, headers, signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new EdgeeHttpError(method, path, res.status, body);
    }
    const json = await res.json();
    return json as T;
  }

  /**
   * List models available through the gateway (`GET /v1/models`). Returns only
   * active models, each with an `{provider}/{model}` id and an `owned_by`
   * provider. Empty array when the gateway reports no models.
   */
  async models(signal?: AbortSignal): Promise<EdgeeApiModel[]> {
    const body = await this.request<EdgeeApiModelsResponse>(
      "GET",
      "/v1/models",
      { signal },
    );
    return body.data ?? [];
  }
}
