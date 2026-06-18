---
"@memberjunction/computer-use-engine": patch
"@memberjunction/computer-use": patch
"@memberjunction/remote-browser-cdp": patch
"@memberjunction/remote-browser-server": patch
---

Computer Use goal loop now defaults to the stored metadata prompts + their model selection, and the prompt text is single-sourced across both layers.

- **Default flip:** `MJComputerUseEngine.Run` defaults the controller + judge to the stored `Computer Use - Controller` / `Computer Use - Judge` metadata prompts (via new `DEFAULT_CONTROLLER_PROMPT_NAME` / `DEFAULT_JUDGE_PROMPT_NAME`) when the caller pins neither a prompt nor a model — routing through `AIPromptRunner` with the prompt's configured models (default Gemini 3.1 Flash-Lite → Gemini 3.5 Flash → Claude Haiku 4.5 → GPT 5.5, each on two vendors for failover). Resolution order: explicit override → stored default prompt → `autoSelectControllerModel()` (non-throwing fallback, so standalone/no-metadata callers degrade cleanly). Model choice is now a metadata edit, not code.
- **Single source of truth:** the behavioral core of the controller/judge prompts lives once in `metadata/prompts/templates/computer-use/_includes/*.md`, pulled into the Layer-2 metadata templates via the push-time `{@include}` directive and generated into the Layer-1 standalone fallback (`@memberjunction/computer-use`) by a `prebuild` (`scripts/generate-prompt-parts.mjs` → `prompt-parts.generated.ts`). A drift-guard test asserts both layers stay in sync.
- READMEs (computer-use-engine, computer-use, remote-browser-cdp/server) and `REMOTE_BROWSER_GUIDE.md` §9e updated.
