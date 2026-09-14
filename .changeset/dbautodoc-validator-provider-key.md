---
"@memberjunction/db-auto-doc": patch
---

The relationship-discovery validator builds its LLM through the package's own provider factory instead of handing `aiConfig.provider` to ClassFactory directly. The config names a PROVIDER (`openrouter`); the registration is a DRIVER CLASS (`OpenRouterLLM`), so the lookup missed for every provider — and did not fail, because ClassFactory returns an instance of the base class when nothing matches and `BaseLLM` carries no `@RequiresSubclass()`. The `if (!llm)` guard was therefore dead, and discovery validated against an LLM that cannot answer while the run reported its usual trigger and spent the budget behind it.
