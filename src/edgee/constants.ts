/**
 * Edgee Gateway API constants.
 *
 * Edgee exposes two separate APIs (see https://www.edgee.ai/docs/api-reference):
 *
 * - Gateway API (`https://edgee.io`): LLM requests and `GET /v1/models`.
 *   Authenticated with an `sk-edgee-...` API key via `EDGEE_API_KEY`. This
 *   extension only uses this API.
 * - Console API (`https://api.edgee.app`): org/billing/session-stats
 *   management. Requires a separate `ek_live_...` Console user token + an org
 *   id, not the gateway key. Not used by this extension.
 */

export const EDGEE_PROVIDER_ID = "edgee";
export const EDGEE_PROVIDER_NAME = "Edgee";

/** Default Gateway API root (no trailing slash). */
export const EDGEE_GATEWAY_BASE_URL = "https://edgee.io";

/** Provider base URL handed to Pi's `openai-completions` path (includes `/v1`). */
export const EDGEE_PROVIDER_BASE_URL = `${EDGEE_GATEWAY_BASE_URL}/v1`;

/** Env var holding the Gateway API key. Never print it. */
export const EDGEE_API_KEY_ENV = "EDGEE_API_KEY";

/** Header used by the Edgee CLI to attribute requests to a session. */
export const EDGEE_SESSION_ID_HEADER = "x-edgee-session-id";

/** GitHub repo for the extension, used for request attribution (Referer). */
export const EDGEE_REPO_URL = "https://github.com/aliou/pi-edgee";

/** App attribution headers sent on every LLM request (OpenRouter-style). */
export const EDGEE_ATTRIBUTION_HEADERS: Record<string, string> = {
  Referer: EDGEE_REPO_URL,
  "X-Title": "npm:@aliou/pi-edgee",
};
