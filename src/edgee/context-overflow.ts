/**
 * Pattern matching context-overflow errors that bubble up from upstream
 * providers through the Edgee gateway. Edgee passes provider errors through in
 * an OpenAI-style envelope, so the messages vary by upstream provider.
 */
export const EDGEE_OVERFLOW_PATTERN =
  /too many tokens|context length|maximum context|prompt is too long|input is too long|context window|exceeds the .* token/i;
