---
"@aliou/pi-edgee": patch
---

Update Edgee model metadata enrichment.

- Removed the models.dev-sourced fallback metadata table.
- `session_start` enrichment now uses Pi's built-in registry directly.
- For Edgee-only providers (`meta`, `qwen`), the lookup falls back to OpenRouter models in Pi's registry for matching upstream model metadata.
