---
"@memberjunction/ai-agent-harness": patch
"@memberjunction/code-execution": patch
"@memberjunction/core-actions": patch
---

Harden the code-execution sandbox and the agent-harness sandboxes, make sandbox providers pluggable, and add an experimental NVIDIA OpenShell provider.

**`@memberjunction/code-execution`**
- Workers are forked with an explicit minimal environment (`WORKER_ENV_ALLOWLIST`, via `BuildWorkerEnvironment`) instead of inheriting MJAPI's whole `process.env`, so DB credentials and vendor API keys are no longer present in the process that hosts agent-written code.
- `timeoutSeconds` / `memoryLimitMB` are clamped in `CodeExecutionService` to a ceiling (120 s / 512 MB; floors 1 s / 8 MB; non-positive or non-numeric values get the default) and every adjustment is logged. New exports `CODE_EXECUTION_LIMITS` and `ResolveExecutionLimits`. The "Execute Code" action stays a thin wrapper; every caller of the service gets the same bound.

**`@memberjunction/ai-agent-harness`**
- Docker provider: `--cap-drop ALL`, `no-new-privileges`, `--init`, pids/memory/cpu ceilings (configurable under `sandbox.limits`) and a non-root `--user` (host uid:gid by default, override under `sandbox.docker.user`). Granted secrets are passed to `docker exec` by NAME (`--env NAME`) with the values in the docker CLI's own minimal environment, so no secret appears on a command line. `docker run`/`stop` no longer inherit MJAPI's environment. Egress under `mcp-only`/`allowlist` is still not enforced; a warning now says so on every provision.
- Credential grants are resolved through `CredentialEngine` (decryption, audit log, expiry) and inject ONE secret (the only field, else `apiKey`/`token`/…); an ambiguous, inactive or expired credential is skipped and logged instead of its raw JSON blob being injected.
- `GeminiCliAdapter` honours the permission posture (`--approval-mode default | auto_edit | yolo`) instead of always passing `--yolo`; allow/deny tool lists are still not translated, so `PermissionPolicy` stays `false` and the runtime now reports the partial enforcement accurately (`PartialPolicyEnforcement`).
- Sandbox providers are pluggable: new `BaseSandboxProvider` (registered under `local`, `docker`, `openshell`), resolved from `sandbox.provider` through `ClassFactory`, configured by `Initialize(settings)`; an unknown key is an error. `LoadAgentHarnessSandboxProviders()` is the tree-shaking guard.
- New EXPERIMENTAL `OpenShellSandboxProvider` (`sandbox.provider: "openshell"`) driving the `openshell` CLI with a generated deny-by-default network policy. Pre-1.0 upstream, run-scope only, not yet run end-to-end against a live gateway, never the default.
- Adds a dependency on `@memberjunction/credentials`.
