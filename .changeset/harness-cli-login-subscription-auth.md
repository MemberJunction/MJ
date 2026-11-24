---
"@memberjunction/ai-agent-harness": minor
---

Add first-class Local CLI Login / Subscription Auth Mode (`HarnessAuthMode = 'auto' | 'cli-login' | 'api-key'`) across local CLI harnesses (`AntigravityCliAdapter`, `ClaudeCodeCliAdapter`, `CodexAdapter`, `GeminiCliAdapter`), including local CLI login session detection (`DetectLocalCliLoginSession`), automatic resolution (`ResolveEffectiveHarnessAuthMode`), strict API-key stripping (`StripHarnessApiKeyEnvironment`) in `cli-login` mode, and `XDG_CONFIG_HOME` preservation in `ChildProcessExecutor`.
