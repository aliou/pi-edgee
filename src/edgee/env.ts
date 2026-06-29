import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import { EDGEE_API_KEY_ENV, EDGEE_PROVIDER_ID } from "./constants";

/**
 * Get the Edgee Gateway API key through Pi's auth handling.
 *
 * Resolution order:
 * 1. Runtime override (CLI `--api-key`)
 * 2. `auth.json` entry for `"edgee"`
 * 3. Environment variable `EDGEE_API_KEY`
 *
 * Used for the model-list client. The registered provider's `apiKey` field
 * uses Pi's `$EDGEE_API_KEY` env interpolation, so actual LLM traffic resolves
 * the key the same way without this helper.
 */
export async function getEdgeeApiKey(
  authStorage: AuthStorage,
): Promise<string | undefined> {
  const key = await authStorage.getApiKey(EDGEE_PROVIDER_ID);
  return key ?? process.env[EDGEE_API_KEY_ENV];
}
