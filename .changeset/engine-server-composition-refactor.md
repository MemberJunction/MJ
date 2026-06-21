---
"@memberjunction/actions": minor
"@memberjunction/communication-engine": minor
"@memberjunction/communication-types": minor
"@memberjunction/templates": minor
"@memberjunction/core-actions": minor
"@memberjunction/ai-agent-manager": minor
---

Refactor server-side engines to COMPOSE their metadata-cache base instead of extending it, eliminating duplicate metadata caches (and the "Duplicate RunView Detected" telemetry warning).

`ActionEngineServer`, `EntityActionEngineServer`, `CommunicationEngine`, and `TemplateEngineServer` each previously extended a `BaseEngine` subclass, which made each its own singleton with its own `Config()` — so on a typical server both the base and the server layer loaded, issuing a second identical RunViews batch and holding a second copy of all the cached arrays (for Templates, a second copy of the `Template_Metadata` dataset).

They now follow the `AIEngine`/`AIEngineBase` pattern: the server engine `extends BaseSingleton`, holds a private `Base` accessor to the single cache-holding base, delegates `Config()` to it, and proxies every cached collection + lookup. Each keeps its own `_contextUser` (captured on `Config()`) and all server-only behavior (action execution/logging, `RunEntityAction`, `SendMessages`/`SendSingleMessage`/`CreateDraft`, nunjucks rendering). `CommunicationEngineBase`'s `StartRun`/`EndRun`/`StartLog` send-lifecycle methods are now public so the composed server can drive them.

Also fixes incorrect singleton instantiation surfaced by the change: `new ActionEngineServer()` / `new TemplateEngineServer()` (which only compiled under the old base and produced unconfigured, empty-cache instances) are replaced with `.Instance` at the affected call sites in `@memberjunction/core-actions` and `@memberjunction/ai-agent-manager`.
