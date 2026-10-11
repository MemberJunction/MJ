---
"@memberjunction/ai-anthropic": patch
---

The Anthropic provider can now use an API key that is not scoped to a workspace. Anthropic rejects such a key's requests unless they name a workspace in the `anthropic-workspace-id` header, so a tester's organization key failed on every agent run with no way to fix it short of creating a new key. Set `ANTHROPIC_WORKSPACE_ID` in the server's environment, or pass `workspaceId` through `SetAdditionalSettings`, and every request carries the header. Keys created inside a workspace need neither and behave as before.
