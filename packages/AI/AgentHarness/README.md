# @memberjunction/ai-agent-harness

Run an **external agent harness** — Claude Code, Codex CLI, OpenCode, Gemini CLI, Pi — as the
reasoning substrate for a MemberJunction agent, while MJ keeps identity, permissions, governed data
access, payload contracts, HITL, cost control and run-level audit.

> **Design principle: the harness is a substrate, not a peer.** MJ owns the run record, the
> credentials, the tool surface and the approval flow. The harness owns the reasoning inside a turn.

Design plan: [`plans/external-agent-harness.md`](../../../plans/external-agent-harness.md)

---

## The core idea: a harness turn *is* a Loop iteration

`BaseAgent` already runs an iterate → decide → execute-steps → iterate loop where the "decide" input
is a prompt execution. This package substitutes a **harness turn** for that prompt call and changes
nothing else.

```
   ┌─ BaseAgent loop (unchanged) ──────────────────────────────────┐
   │                                                               │
   │   executePrompt() ──► [ HarnessAgentBase override ]           │
   │        │                      │                               │
   │        │                      ├─ adapter.RunTurn(input)       │
   │        │                      ├─ accumulate usage             │
   │        │                      └─ write AIPromptRun            │
   │        ▼                                                      │
   │   DetermineNextStep  (inherited from LoopAgentType)           │
   │        ▼                                                      │
   │   validate ─► execute actions / sub-agents / skills           │
   │        ▼                                                      │
   │   checkExecutionGuardrails ─► next turn                       │
   └───────────────────────────────────────────────────────────────┘
```

The harness ends each turn by emitting the **Loop next-step JSON envelope**. MJ then executes any
actions, sub-agents or skills through its own validated machinery and resumes the session with the
results.

**Why this matters:** every guardrail, payload ACL, HITL gate and accounting path already written for
Loop agents applies to harness agents with no new enforcement code — and there is exactly **one**
authority channel to audit, not two.

---

## Two registrations, one metadata column

ClassFactory registrations are namespaced per base class, so `'HarnessAgentType'` is registered
twice against different roots:

| Registered under | Class | Resolved by | Gives you |
|---|---|---|---|
| `BaseAgentType` | `HarnessAgentType` | `BaseAgentType.GetAgentTypeInstance` | the turn protocol (inherits Loop) |
| `BaseAgent` | `HarnessAgentBase` | `AgentRunner` (`AgentRunner.ts:101`) | the execution driver |

Both read `AIAgentType.DriverClass`, so **one metadata value selects both halves**. This is the
mechanism working as designed — `AgentRunner` already treats the type's `DriverClass` as a
`BaseAgent` key and falls back to plain `BaseAgent` when unregistered, which is why every Loop agent
gets the base execution class today.

---

## Adapters

| Harness | DriverClass | Mechanism | Notes |
|---|---|---|---|
| Claude Code | `ClaudeCodeCliAdapter` | CLI, `stream-json` | Session resume; permission hook pending |
| Codex | `CodexAdapter` | `codex exec --json` | Session resume |
| OpenCode | `OpenCodeAdapter` | `opencode run` JSON | Session resume |
| Gemini CLI | `GeminiCliAdapter` | `gemini --output-format json` | **No** resume — context replayed; posture honoured via `--approval-mode`, tool lists not translated |
| Pi | `PiAdapter` | stdio-JSON contract | Requires `ExecutablePath` |
| *anything* | `StdioJsonAdapter` | documented JSON contract | Escape hatch — zero MJ code |

Register your own with `@RegisterClass(BaseHarnessAdapter, 'MyAdapter')` and point a harness row's
`DriverClass` at it. No core changes required.

### Capability honesty

`AIAgentHarness.CapabilitySettings` (typed as `IHarnessCapabilitySettings`) declares what an adapter
**actually implements**, because the runtime *emulates what is missing*. Gemini CLI reports
`SessionResume: false`, so context is replayed each turn and those extra tokens are budgeted against
the run's guardrails rather than quietly absorbed.

Claiming a capability that is not wired up produces a silent behavioural gap, not an error. Report
`false` and let the runtime compensate.

---

## Sandboxes: the provider owns process placement

Adapters never call `spawn`. They run everything through `SandboxExecutor`, obtained from the
handle the provider returns.

| Provider key | Class | Execution | Isolation |
|---|---|---|---|
| `local` (default) | `LocalDirectorySandboxProvider` | direct spawn | **None** — dev only |
| `docker` | `DockerSandboxProvider` | `docker exec`, container per run | Hardened container, real FS boundary; only `networkPolicy: 'none'` enforced |
| `openshell` | `OpenShellSandboxProvider` | `openshell sandbox exec` | Landlock + seccomp + deny-by-default egress with a host allowlist. **EXPERIMENTAL** |

> ⚠️ The local provider scopes a *directory*; it does **not** contain the *process*. `networkPolicy`
> is advisory there. Anyone who believes `'none'` is enforced locally has a false sense of
> containment, which is worse than knowing the boundary is soft.

### Providers are pluggable

`sandbox.provider` is the key a `BaseSandboxProvider` subclass registered under:

```typescript
@RegisterClass(BaseSandboxProvider, 'my-backend')
export class MySandboxProvider extends BaseSandboxProvider {
    public override Initialize(settings: HarnessSandboxSettings): void { /* validate + store */ }
    public async Provision(key: WorkspaceKey, config: SandboxConfig): Promise<SandboxHandle> { /* ... */ }
    public async Finalize(handle: SandboxHandle, outcome: 'success' | 'failure' | 'cancelled'): Promise<void> { /* never throw */ }
}
```

`HarnessAgentBase` resolves the key through `ClassFactory`, then calls `Initialize` once with the
agent's whole `sandbox` block, before `Provision`. An unknown key is a hard error that lists the
registered keys (it never falls back to a default). Call `LoadAgentHarnessSandboxProviders()` from
your startup path so a bundler cannot tree-shake the registrations away, exactly as with
`LoadAgentHarnessAdapters()`. `ISandboxProvider` remains the contract; `BaseSandboxProvider` adds
`Initialize` and the registry hook.

### Docker: hardened by default

Every container is started with `--cap-drop ALL`, `--security-opt no-new-privileges`, `--init`,
and conservative `--pids-limit` / `--memory` (swap pinned to it) / `--cpus` ceilings, and runs as
the MJAPI process's own uid:gid so files in the bind-mounted workspace stay owned by the MJAPI user
(skipped on Windows, and when MJAPI itself is root — the image's `USER` then applies). When it runs
as a non-root user, `HOME` is set to `/workspace/.home` inside the mounted workspace so CLI
harnesses have somewhere writable for their config and session store.

```jsonc
"sandbox": {
  "provider": "docker",
  "image": "my-registry/harness-sandbox:1.4",
  "limits": { "memory": "4g", "cpus": 2, "pids": 512 },   // these are the defaults
  "docker": { "user": "1000:1000" }                       // optional override of the host uid:gid
}
```

**Secrets never travel on a command line.** Granted environment is passed as `docker exec --env NAME`
(name only); the values live in the `docker` CLI process's own environment, which is built from a
minimal allowlist (`PATH`, `HOME`, `DOCKER_*`, ...) plus the granted variables — never MJAPI's full
`process.env`. A grant named like a variable the docker CLI itself reads (`PATH`, `HOME`,
`DOCKER_HOST`, ...) is refused with an error rather than silently shadowing or hijacking it.

`mcp-only` / `allowlist` are **not enforced** under Docker (a bridge network has no egress filter);
the provider logs a warning on every provision that says so and points at `openshell`.

### OpenShell (EXPERIMENTAL)

[NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) runs agents in policy-governed sandboxes —
Landlock + seccomp for filesystem and syscalls, a deny-by-default egress proxy with per-binary,
per-host rules, and credential *providers* whose secrets are injected on the wire so the agent only
ever holds placeholders. It is the one backend here that can actually enforce `mcp-only` and
`allowlist`.

> **Experimental, and not the default.** OpenShell is pre-1.0: v0.1.0 (2026-09-25) broke its
> protocol, policy schema, CLI and provider-profile format relative to 0.0.x. This provider drives the
> `openshell` CLI and was written by reading OpenShell's source (commit `0e8d9e5`, post v0.1.2).
> Checked against the real v0.1.2 binaries: the CLI's argument parser accepts the generated
> `create`/`exec`/`delete` commands, and the generated policy files parse under OpenShell's own policy
> parser (`openshell-prover check`). **Not** checked: an end-to-end create → exec → delete against a live
> gateway. It targets CLI versions `>=0.1.0 <0.2.0` and logs a warning outside that range. Expect it to change.

```jsonc
"sandbox": {
  "provider": "openshell",
  "workspaceScope": "run",                          // the only supported scope
  "networkPolicy": "mcp-only",                      // none | mcp-only | allowlist  ('open' is rejected)
  "image": "registry.example.com/me/claude-agent:1",// omit for the gateway's default (minimal Ubuntu, no harness CLI)
  "allowedHosts": ["api.anthropic.com", "statsig.anthropic.com"],   // host or host:port; wildcards need 3+ labels
  "limits": { "memory": "4g", "cpus": 2 },          // optional; pids is not supported
  "openshell": {
    "gateway": "local",                             // optional; defaults to the CLI's active gateway
    "cliPath": "openshell",                         // optional; defaults to `openshell` on PATH
    "providers": ["anthropic"],                     // providers pre-registered on the gateway
    "providerManagedEnv": ["ANTHROPIC_API_KEY"],    // granted vars NOT to inject (the provider supplies them)
    "mcpEndpoint": "http://host.openshell.internal:4000/mcp",   // allowed under mcp-only
    "networkBinaries": ["/**"]                      // executables the generated rule applies to
  }
}
```

What happens: `Provision` writes an MJ-generated policy file and runs
`openshell sandbox create --name mj-harness-<RunId> --policy <file> [--from <image>] [--provider <p>]… --detach -o json -- sleep infinity`
(the image therefore needs `sleep`). Each turn is
`openshell sandbox exec -n <name> --workdir /sandbox --no-tty --no-login-shell [--env K=V]… -- <cmd> <args>`
(the image must put the harness on the sandbox's PATH). `Finalize` runs `openshell sandbox delete`
and removes the policy file; it never throws.

The generated policy (`BuildOpenShellPolicy`): workspace `/sandbox` and `/tmp` read-write, system
directories read-only, Landlock `hard_requirement`; `none` adds no network rules, `mcp-only` allows
`mcpEndpoint` plus `allowedHosts`, `allowlist` allows `allowedHosts` only. Every allowed endpoint is
an inspected (`protocol: rest`) endpoint with `enforcement: enforce` — OpenShell's default,
`audit`, would only log violations.

Limitations of this spike:

- **`run` workspace scope only.** The sandbox has its own filesystem, so `agent` / `agent-user`
  persistence (and with it session resume) is rejected with an error.
- **`networkPolicy: 'open'` is rejected.** OpenShell has no allow-all egress rule; list hosts and use
  `allowlist`.
- **Attached providers add their own egress rules** (from their imported profile) on top of this
  policy, so `none` means "no MJ-added egress", not "no egress", when providers are attached. The
  provider profile's `binaries` must match your image's harness path (see `providers/claude-code.yaml`
  in the OpenShell repo).
- **Secrets.** Variables named in `providerManagedEnv` are withheld. Anything else granted is passed with
  `exec --env K=V`, which puts the *value* on the local `openshell` process's command line (there is no
  out-of-band channel in the CLI) — the provider logs a warning, by name only, for credential-looking
  names. Use an OpenShell provider for real secrets.
- Cancelling a turn kills the local CLI; whether the remote process dies with it is up to the gateway.
  `Finalize` deleting the sandbox is what guarantees cleanup.

**Local test procedure** (needs Docker running locally):

1. Install OpenShell (gateway + `openshell` CLI) per its docs and start a local gateway:
   `openshell gateway add http://127.0.0.1:18080 --local --name local && openshell gateway select local`
   (see OpenShell's `docs/about/installation.mdx`). Check `openshell --version` is `0.1.x`.
2. Import the Claude Code provider profile and register your key as a provider named `anthropic`:
   `openshell profile import --url https://raw.githubusercontent.com/NVIDIA/OpenShell/main/providers/claude-code.yaml`
   then `export ANTHROPIC_API_KEY=… && openshell provider create --name anthropic --type claude-code --from-existing`.
   Edit the profile's `binaries` if your image installs `claude` somewhere other than `/usr/bin/claude`
   or `/usr/local/bin/claude`.
3. Build a sandbox image containing the Claude Code CLI and `sleep`, loadable by your gateway's compute
   driver (for the Docker driver, a local `docker build` is enough).
4. Set the `Demo Harness Agent`'s `TypeConfiguration` to the openshell block above (`"provider": "openshell"`,
   `"workspaceScope": "run"`, your `image`, `"providers": ["anthropic"]`, `"providerManagedEnv": ["ANTHROPIC_API_KEY"]`,
   `"allowedHosts"` for any extra hosts), make sure the Claude Code harness row is `Active`, and run the agent.
5. Watch for the `OpenShell sandbox started: mj-harness-<RunId>` log, then `openshell sandbox list`
   during the run (and confirm the sandbox is gone afterwards). `openshell logs <name> --source sandbox`
   shows any egress the policy denied.

### `WorkspacePath` means "as the harness sees it"

A host path under the local provider; a **container-internal** path under Docker. Pass it to harness
processes — do **not** open it with `fs` unless you know you are on the local provider.

---

## Configuration

Per-agent, in `AIAgent.TypeConfiguration`, validated against `AIAgentType.ConfigSchema`:

```jsonc
{
  "harnessName": "Claude Code",          // lookup into MJ: AI Agent Harnesses
  "sandbox": {
    "provider": "local",                 // local | docker | openshell (experimental) | any registered key
    "image": "ghcr.io/memberjunction/harness-sandbox:latest",
    "workspaceScope": "agent-user",      // run | agent | agent-user
    "networkPolicy": "mcp-only",
    "allowedHosts": [],                  // host[:port], honoured only where egress is enforced (openshell)
    "limits": { "memory": "4g", "cpus": 2, "pids": 512 },   // docker / openshell
    "docker": { "user": "1000:1000" },   // docker only
    "openshell": { }                     // openshell only — see the OpenShell section
  }
}
```

**Workspace scope** decides how long files live: `run` is discarded, `agent` is shared across every
run of that agent, `agent-user` (default) is per agent per user — continuity without one user's
working files leaking into another's session.

---

## Accounting — why every turn writes an `AIPromptRun`

Run totals are **derived**: `calculateTokenStats` sums `AIAgentRunStep.PromptRun` rollups. A turn
that records no prompt run contributes nothing, so the run reports zero tokens and zero cost
*forever* — and its cost ceiling has nothing to compare against.

`AIPromptRun.PromptID`, `.ModelID` and `.VendorID` are all **NOT NULL**, and each resolves to a
**real** catalog row rather than a placeholder:

| Column | Resolves to | Why it is not a fiction |
|---|---|---|
| `PromptID` | the agent type's system prompt | that template really did produce the turn |
| `VendorID` | `AIAgentHarness.AIVendorID` | Claude Code really does call Anthropic |
| `ModelID` | `AIAgentHarness.AIModelID` | the harness really does run that model |

If none resolves, the runtime **fails loudly** rather than skipping the row. A silent skip is exactly
how a cost ceiling stops protecting anything.

---

## Credentials

`MJ: AI Agent Credentials` records the **grant edge** — which credentials an agent carries into its
sandbox. Custody stays in `MJ: Credentials` / `CredentialEngine`.

Environment injection is the **only** channel by which a secret reaches the harness, and it carries
exactly what was granted — never the MJAPI process environment, never DB credentials, never a user
token.

Granted credentials are resolved through `CredentialEngine` (decryption, expiry check, and an access
record in the credential audit log tagged `AgentHarness`) — not by reading `MJ: Credentials` directly.
A credential's `Values` holds *every* field of its type, but a grant maps one variable to one secret,
so exactly one field is injected: the only field if there is one, otherwise the first of `apiKey`,
`api_key`, `token`, `accessToken`, `access_token`, `authToken`, `secret`, `value` (case-insensitive).
If neither applies (an AWS IAM credential, say) the grant is **skipped and logged by credential and
agent name** — the blob is never injected, and the server's same-named environment variable is not
substituted for it. Inactive and expired credentials are refused the same way.

Distinct from `MJ: AI Credential Bindings`, which is inference-selection plumbing for
`AIPromptRunner` failover when *MJ itself* executes a prompt.

---

## The audit boundary

MJ records what **crosses the boundary**: MCP loopback reads and the turn-end step. Activity *inside*
the sandbox — file edits, shell commands — streams to `onProgress` for live view but is **not**
persisted as run steps.

This "opaque super-step" granularity is **intentional**. In-sandbox behaviour is governed by posture
policy, not by run steps. Widening it is a design change, not a bug fix.

---

## Deployment

| Environment | Provider | Notes |
|---|---|---|
| Local dev | `local` | Fast; uses the dev's own installed CLI and auth |
| Local parity | `docker` | Same path as production |
| AWS / Azure | `docker` → ECS/Fargate or ACI | Sandbox image versioned **separately** from MJAPI |

Do **not** bake harness binaries into the MJAPI image. A harness running inside the API container
inherits that container's network reach and IAM role — the wrong blast radius for a process
executing an autonomous agent's shell commands.

---

## Known gaps

- **`PermissionHooks: false` on every adapter.** The `strict` posture needs an MCP permission-prompt
  tool that does not exist yet. Reported honestly so the runtime cannot assume interception it lacks.
- **`networkPolicy` `mcp-only` / `allowlist` are not enforced at the packet level** under Docker —
  documented (and logged on every provision) as such rather than aliased to `open`. The experimental
  `openshell` provider enforces them.
- **Gemini CLI applies the posture but not the allow/deny tool lists.** It maps `strict`/`auto`/`dangerous`
  to `--approval-mode default`/`auto_edit`/`yolo`, but has no deny flag, so the lists are ignored (and
  logged as such) and `PermissionPolicy` stays `false`.
- **MCP loopback is not yet wired.** `HarnessSessionConfig` carries the fields; the server and
  per-run scoped credential are still to come.
- **`ModelID` uses the declared model**, not the model the harness reported for the turn. The
  refinement belongs in `resolveAccountingIds` once adapters surface it.

## License

Business Source License 1.1 — see [LICENSE](../../../LICENSE) for details.
