---
name: edgee-models
description: Update model metadata for the pi-edgee extension. Use when refreshing Edgee model lists, checking Edgee model availability, or syncing hardcoded model metadata with the Edgee API and models.dev.
---

# Update Edgee models

Update `src/edgee/models.ts` from live Edgee and models.dev data, not guesses.

## Default behavior

Take initiative:

1. If `EDGEE_API_KEY` is available, fetch `https://edgee.io/v1/models` to confirm API-visible models and their `owned_by` provider.
2. Edgee is a gateway, not a model host. It is NOT present on models.dev. Use models.dev upstream provider entries (e.g. `openai`) for pricing, context, output limits, modalities, and reasoning flags for each `{provider}/{model}` id.
3. Probe `https://edgee.io/v1/chat/completions` only when availability is unclear. Never print the API key.
4. Update `src/edgee/models.ts`.
5. Run model tests plus typecheck and lint.
6. Create a changeset for user-visible metadata changes.
7. Commit only relevant files when asked.

Do not push.

## Sources of truth

Use these in order:

1. `https://edgee.io/v1/models` (with `EDGEE_API_KEY`) for the live model list and `owned_by` provider.
2. `https://models.dev/api.json` upstream provider entries (keyed by the provider prefix in the model id, e.g. `openai/gpt-5.2` -> provider `openai`, model `gpt-5.2`) for pricing, context, output limits, modalities, and reasoning flags.
3. Edgee docs: https://www.edgee.ai/docs/api-reference/models
4. Existing hardcoded definitions for fields live sources do not expose.

## Required checks

Run:

```bash
pnpm test -- src/edgee/models.test.ts
pnpm typecheck
pnpm lint
```

## Field mapping

From models.dev (upstream provider entry, model id = part after the `/`):

- `id` -> `id` (keep the `{provider}/{model}` format from Edgee's list)
- `modalities.input` containing `image` -> `input: ["text", "image"]`
- `reasoning` -> `reasoning`
- `limit.context` -> `contextWindow`
- `limit.output` -> `maxTokens`
- `cost.input` -> `cost.input`
- `cost.output` -> `cost.output`
- `cost.cache_read` -> `cost.cacheRead` (default 0)
- `cost.cache_write` -> `cost.cacheWrite` (default 0)

Provider compatibility defaults:

```ts
compat: {
  maxTokensField: "max_tokens",
  supportsUsageInStreaming: true,
}
```

## Runtime probes

Use these only when needed. Never echo `EDGEE_API_KEY`.

### Check model list

```bash
curl -sS https://edgee.io/v1/models \
  -H "Authorization: Bearer $EDGEE_API_KEY" \
  -H 'accept: application/json'
```

### Check chat completions

```bash
curl -sS https://edgee.io/v1/chat/completions \
  -H "Authorization: Bearer $EDGEE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "model": "openai/gpt-5.2",
  "messages": [{"role": "user", "content": "Reply exactly ok"}],
  "max_tokens": 5
}
JSON
```

## Decision rules

- Add a model when `/v1/models` or runtime confirms it is available.
- Keep hardcoded known models that are callable even if absent from `GET /v1/models`.
- Edgee compresses input tokens before the upstream provider sees them, so actual billed cost is lower than the models.dev list price. Cost metadata reflects upstream list price; do not adjust for compression.
- Leave cost at zero only when no pricing source exposes a price.
- Edgee is a gateway: never add Edgee itself to models.dev-based lookups.

## Commit workflow

When asked to commit:

1. Run checks.
2. Check `git status`.
3. Stage only relevant files. Never use `git add .` or `git add -A`.
4. Use a concise conventional commit message.
