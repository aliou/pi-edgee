# pi-edgee

Pi extension that registers Edgee as a model provider.

## Structure

- `extensions/provider/index.ts` is the only Pi extension entry point.
- `src/index.ts` re-exports public source helpers.
- `src/edgee/` contains Edgee API code:
  - `constants.ts` provider id, base URLs, env var, header name.
  - `client.ts` `EdgeeClient`, a thin HTTP client for the Gateway API model-list endpoint only (mirrors aperture's `ApertureClient`). All model-list network I/O lives here. LLM traffic does NOT go through this client.
  - `env.ts` `getEdgeeApiKey(authStorage)` resolves the API key via Pi auth storage (CLI override -> auth.json -> env), mirroring pi-synthetic/pi-neuralwatt.
  - `models.ts` maps `GET /v1/models` into Pi provider model configs, enriching each `{provider}/{model}` from Pi's built-in model registry (cost/modalities/context/limits/reasoning) when the `owned_by` matches a known provider. Never copies `api`/`baseUrl`/`compat` — Edgee exposes every model through its unified OpenAI-compatible endpoint.
  - `models-cache.ts` stale-while-revalidate on-disk cache for the model list.
  - `context-overflow.ts` Edgee overflow matching.

  The `x-edgee-session-id` header is injected into LLM requests inline in the provider entry point (`extensions/provider/index.ts`), by delegating to Pi's built-in `openai-completions` streamSimple with `headers` set on the options. The session id is read live from a closure (`currentSessionId`) updated at the start of `session_start`, so it stays correct even when revalidation fails.

## Provider behavior

- Provider id: `edgee`.
- API key env var: `EDGEE_API_KEY`. The registered provider's `apiKey` uses Pi's `$EDGEE_API_KEY` env interpolation; the model-list client resolves the key via `getEdgeeApiKey(authStorage)` (CLI override -> auth.json -> env).
- Base URL: `https://edgee.io/v1`.
- API mode: Pi's native `openai-completions` path for every model, regardless of upstream provider. Edgee is a unified OpenAI-compatible gateway; verified that `/v1/chat/completions` works for openai, google, deepseek, and anthropic models. Never set a model's `api` to the upstream native value (e.g. `anthropic-messages`) — that would break the unified path.
- The provider is registered synchronously from the on-disk cache in the factory body (before `session_start`) so it shows up in pre-session UIs and scoped models validate at startup. The model list is only discoverable via authenticated `GET /v1/models`, which needs `authStorage` — only available in `session_start`. So: factory registers from cache; `session_start` revalidates from the live gateway, enriches from Pi's built-in registry, re-registers, and writes the cache back. First run with no cache warns once until the first revalidation persists a cache.
- The Pi session id (`ctx.sessionManager.getSessionId()`) is injected into LLM requests as `x-edgee-session-id` via a custom `streamSimple` (Edgee CLI parity for request attribution). It is NOT sent on the model-list fetch. The session id is read live from a closure updated at the start of `session_start`, so it stays correct even when the revalidation fetch fails.
- Model ids use the `{provider}/{model}` format (e.g. `openai/gpt-5.2`). The `owned_by` field from `/v1/models` is the upstream provider and is used to look up enrichment metadata from Pi's built-in registry.
- Edgee's `/v1/models` returns only id/object/created/owned_by — no pricing, context, modalities, or reasoning. Those come from Pi's built-in registry on hit; misses (Edgee-only providers like `meta`/`qwen`) fall back to conservative defaults. Edgee's input compression lowers actual billed cost and is not reflected in the `cost` figures.

## Two APIs

Edgee has two separate APIs. This extension only uses the Gateway API:

- **Gateway API** (`https://edgee.io`): LLM requests + `GET /v1/models`. Auth: `EDGEE_API_KEY` (`sk-edgee-...`).
- **Console API** (`https://api.edgee.app`): usage/cost export, API-key management, BYOK, session stats. Requires a separate `ek_live_...` Console user token + org id. Not reachable with the gateway key (returns `401 invalid token`). Not used by this extension.

## Development

- Run `pnpm typecheck` and `pnpm lint` after changes.
- Keep Pi registration code in `extensions/*` and reusable API code in `src/*`.
- Do not use any Edgee SDK. Use `EdgeeClient` for the model-list call; inject `x-edgee-session-id` into LLM traffic by delegating to Pi's built-in `openai-completions` streamSimple with `headers` on the options.
- Do not read or print `EDGEE_API_KEY`; resolve it via `getEdgeeApiKey(authStorage)`.
- Network I/O must go through `EdgeeClient`; do not call `fetch` directly in the extension entry point or model-mapping code.
- Do not send `x-edgee-session-id` on the model-list fetch; it is for LLM requests only, injected via `streamSimple`.
