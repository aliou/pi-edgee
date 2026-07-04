# @aliou/pi-edgee

## 0.1.1

### Patch Changes

- 53e5c7f: Update Edgee model metadata enrichment.

  - Removed the models.dev-sourced fallback metadata table.
  - `session_start` enrichment now uses Pi's built-in registry directly.
  - For Edgee-only providers (`meta`, `qwen`), the lookup falls back to OpenRouter models in Pi's registry for matching upstream model metadata.

## 0.1.0

### Minor Changes

- 983a7b2: Initial Edgee provider extension for Pi.

## 0.0.1

### Patch Changes

- Initial scaffold.
