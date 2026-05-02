---
"@memberjunction/messaging-adapters": patch
"@memberjunction/server-extensions-core": patch
---

Slack/Teams server extensions now skip silently when enabled but unconfigured (placeholder ContextUserEmail or missing tokens) instead of throwing and logging failed to initialize on every MJAPI startup. Adds optional Skipped?: boolean to ExtensionInitResult for extensions to opt into the quiet path; loader emits LogStatus instead of LogError when set. Genuine misconfig (real credentials but unknown email) still throws and logs as an error.
