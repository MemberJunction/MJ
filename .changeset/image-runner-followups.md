---
"@memberjunction/core-actions": minor
"@memberjunction/ai-prompts": minor
---

Follow-ups from the image runner review:

- **Prompt model pinning**: Set `RequireSpecificModels: true` on the `Default Image Generation` carrier prompt (`metadata/prompts/.default-image-generation-prompt.json`), ensuring `AIImageGenerationRunner` only selects models explicitly bound to the prompt with supported drivers rather than falling back to unbound image models.
- **`ResolveImageGenerationAPIKey` JSDoc**: Marked `ResolveImageGenerationAPIKey` in `@memberjunction/core-actions` as `@deprecated` with updated documentation clarifying it is retained for backwards compatibility, pointing callers to `BuildImageGenerationAPIKeys`.
