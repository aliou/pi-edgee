# pi-edgee

Pi provider extension for [Edgee](https://www.edgee.ai), the Agent Gateway that compresses, routes, and observes LLM requests.

Learn more about Edgee in the [official documentation](https://www.edgee.ai/docs/introduction).

## Installation

```bash
pi install npm:@aliou/pi-edgee
```

Set the API key before use:

```bash
export EDGEE_API_KEY=...
```

## What it provides

- Registers an `edgee` provider in Pi.
- Uses Edgee's OpenAI-compatible Gateway API directly at `https://edgee.io/v1`, not an SDK.
- Fetches models from `GET https://edgee.io/v1/models` when `EDGEE_API_KEY` is available. Model ids use the `{provider}/{model}` format (e.g. `openai/gpt-5.2`); the `owned_by` field exposes the upstream provider.
- Enriches fetched models from Pi's built-in model registry. For Edgee-only providers such as `meta` or `qwen`, it falls back to OpenRouter models in the registry for matching upstream model metadata.
- Uses Pi's native `openai-completions` provider path, so tool calls, streaming usage, and context-overflow normalization all work.
- Normalizes upstream context-overflow errors through Edgee into Pi's `context_length_exceeded` signal.

## Two APIs

Edgee exposes two separate APIs. This extension only needs the Gateway API:

- **Gateway API** (`https://edgee.io`) — LLM requests and model listing. Authenticated with an `sk-edgee-...` API key (`EDGEE_API_KEY`). Endpoints: `/v1/models`, `/v1/chat/completions`, `/v1/messages`, `/v1/responses`, `/v1/compress`, `/v1/count_tokens`.
- **Console API** (`https://api.edgee.app`) — organization management: usage/cost export, gateway API-key management, BYOK. Requires a separate `ek_live_...` Console token and an org id, not the gateway key. Not used by this extension.

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

## Layout

- `extensions/provider/`: Pi extension entry point.
- `src/edgee/`: Edgee model mapping and API helpers.

## Notes

Edgee compresses input tokens before they reach the upstream provider, so actual billed cost is usually lower than the `cost` figures embedded in the model metadata (which reflect upstream list prices from models.dev). Per-request savings are reported in the `compression` field of Edgee's responses and are not reflected here.
