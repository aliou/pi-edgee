import type { Credential } from "@earendil-works/pi-ai";
import { EDGEE_API_KEY_ENV } from "./constants";

/**
 * Get the Edgee Gateway API key through Pi's model refresh credential context.
 *
 * Resolution order:
 * 1. Pi-resolved credential for the `"edgee"` provider (runtime/auth.json)
 * 2. Provider-scoped `EDGEE_API_KEY` env from that credential
 * 3. Environment variable `EDGEE_API_KEY`
 *
 * Used only for the model-list client. Actual LLM traffic is authenticated by
 * the registered provider's `apiKey` field through Pi's normal auth path.
 */
export async function getEdgeeApiKey(
  credential?: Credential,
): Promise<string | undefined> {
  if (credential?.type === "api_key") {
    return (
      credential.key ??
      credential.env?.[EDGEE_API_KEY_ENV] ??
      process.env[EDGEE_API_KEY_ENV]
    );
  }

  if (credential?.type === "oauth") {
    return credential.access;
  }

  return process.env[EDGEE_API_KEY_ENV];
}
