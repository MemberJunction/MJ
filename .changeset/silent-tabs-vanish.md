---
"@memberjunction/ng-base-application": patch
---

Add dormant ephemeral-workspace guard to `WorkspaceStateManager`. When the runtime flag `window.__MJ_EPHEMERAL_WORKSPACE__` is set to `true`, `loadWorkspace` short-circuits to a default configuration and `persistConfiguration` is a no-op, so workspace (tab) state never round-trips through the server. This is used only by the regression test environment (the flag is baked into the test Explorer's static `index.html`) to prevent cross-test tab leakage when many tests share a single test user. Production deployments do not set the flag and behavior is unchanged.
