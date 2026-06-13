---
name: build-connector
description: Top-level entry point for connector creation. Drives the three-stage orchestration — Plan (connector-creator), Review (independent-reviewer, different model), Execute (planner-emitted dynamic Workflow under the workshop's locked primitives + bijection floor-check). Triggered by the /build-connector slash command.
---

# build-connector

The orchestrator. Runs at top-level context (the only context where `Task` and `Workflow` are available). The skill is **NOT** the executor — it sequences three structural stages and forwards the planner-emitted Workflow to the runtime harness.

Canonical references:
- Workshop layout + primitives: `packages/Integration/connector-builder-workshop/README.md`
- Bijection slot table: `packages/Integration/connector-builder-workshop/floor/phase0-slots.json`
- Agentic plan: `plans/integration-agentic-local.md`
- Phase 0 framework: `plans/integration-phase-0-pr1.md`

## NO SHORTCUTS

Models are imperfect at any single step. The framework's mechanism for converging on the right answer is **iteration with reviewer + floor-check at every gate**. No phase begins until the prior phase's output is gate-satisfied. Re-dispatching with specific feedback is the default response to any concern.

## Invocation

```
/build-connector <vendor-name> [--context <path-or-inline>] [--budget <tokens>] [--max-tier <T0..T8>]
```

There is **no `--credentials` flag** — a credential is NEVER passed as a path to the agent. Live testing is selected via the Step 0 **[A]** intake and the credential is held only by the broker (the agent submits a read-only job and gets scrubbed results back). Max live tier is **T8** (read-only); there is no T9–T12.

Examples:
- `/build-connector hubspot` — no context; discovers from public sources only.
- `/build-connector propfuel --context ./propfuel-api.md` — **provide vendor docs / API spec / sample payloads / data-model notes / connection info as a Tier-1 authoritative source.**
- `/build-connector hubspot --max-tier T4` — workshop dry-run at the mocked-fixture ceiling.

**You can always provide context.** `--context` may be a file, a directory, or inline text pasted with the command. Whatever you give is the highest-priority source the agent builds from. If you don't pass `--context`, Step 0 still asks you for any — both providing-context and not are always available, every connector.

## Concrete invocation procedure (the skill's runbook)

### Step 0 — Context, credential & sandbox intake (MANDATORY — ALWAYS FIRST, every connector)

**Before you run start-run.mjs, the planner, or ANY stage, you MUST (a) ingest any user-provided context, then (b) prompt the user for the run/credential choice and WAIT for their reply.** Do not proceed on assumptions. Non-skippable for every `/build-connector`.

**0a — Context ingest (always offered).**
- If `--context <path-or-inline>` was passed, read it (a file, every file in a dir, or pasted inline text).
- Then ASK regardless: *"Any context to provide before I build <vendor>? — vendor API docs, OpenAPI/Postman, sample payloads, data-model quirks (e.g. which records get updated or deleted), connection/base-URL info. Paste it or give a path. Optional, but it's the highest-priority source I build from; without it I rely on public discovery only."*
- Save everything provided into `packages/Integration/connectors-registry/<vendor>/sources/`.
- Context is OPTIONAL — proceed once the user answers (including "none"). Both "I gave context" and "I gave none" are always valid.

> **🚨 CONTEXT IS A HELPER, NOT THE SOURCE OF TRUTH (standing rule — the PropFuel lesson).**
> Provided context is **trusted where it speaks** (a documented auth flow, connection info, a sample payload, a stated quirk) and is the highest-priority source **for the facts it actually states**. It is NOT a statement of the system's full nature. It may be a private doc, a partial export spec, or simply *the only slice you're allowed to test* — "all there is" for testing is NOT "all the system is." **Absence in the context is NOT evidence of absence in the system.** Treating the context as exhaustive is the exact failure that shipped PropFuel as "3 file-feed streams" when PropFuel is a rich bidirectional REST product — the context only described the data-export slice, and the pipeline assumed that was the whole connector.
> Therefore the pipeline MUST, on every build, **independently study the connector's full nature** from public discovery (the vendor's real API surface, object families, auth model, pull-vs-bidirectional capability, pagination, rate limits, "what else does this system expose") — regardless of whether context was given. Context refines and is trusted-where-it-speaks; public discovery establishes the breadth. The two are reconciled, never substituted. `source-auditor` ranks context Tier-1 **for its stated claims**, but the connector-nature study (commissioned by the planner — see `connector-creator`) is what determines the object/capability universe, and it must never be capped by what the context happened to mention.
>
> **The four moves (see `connector-creator` "STUDY for awareness; CONTEXT scopes"):** (1) study the system independently → awareness; (2) lay the context against the study and **detect the tension** when they disagree; (3) **investigate the provided slice further AND validate the context — reject it if independent evidence proves it wrong** (context is not sacred); (4) use the context + the client's actual need as the **guiding principle for a limited subset of interest** — model THAT subset deeply, and record the broader nature the study found as **known-but-out-of-scope, with the reason** (`Integration.Configuration.OutOfScopeObjectFamilies`). The goal is a scope decision made **knowingly** — not "discover everything therefore build everything" (over-reach), not "the context is the whole system" (under-reach). Example: PropFuel is a rich bidirectional REST product, but MJ's clients consume its **file feed**, so the file-feed slice is the correct scope — built deeply, with the REST API documented as out-of-scope rather than silently unknown.

**0b — Credential & sandbox.**

1. **Detect the isolation posture:**
   - In a sandbox/container? `test -f /.dockerenv` (or grep `/proc/1/cgroup` for `docker|containerd|kubepods`).
   - Broker reachable? `$MJ_CRED_MAILBOX` set AND that dir exists.
   - `isolated = container OR broker-mailbox-present`.

2. **Ask the user verbatim, then STOP and wait for A or B:**

   > Before I build **<vendor>**, the ONLY thing I need from you is: **do you have a test credential, or not?** How it tests is derived automatically from that — you never pick a tier (T4/T8/etc.).
   > **[A] CREDENTIAL** — you provide one; I test against the real API **READ-ONLY** (TestConnection + discover + one read page — never create/update/delete/ack) **AND** still run the full non-live suite for fullness (live is added on top, never instead).
   > **[B] NO CREDENTIAL** — I run the **full non-live suite**: schema/contract validation against the acquired OpenAPI/GraphQL SDL, mock-server-from-spec, Postman-collection replay, endpoint/header probing, and bijective completeness. No live API calls.
   >
   > **Sandbox/isolation: `<YES — in the workbench container / broker mailbox present>` or `<NO — running on the host as you>`.**
   >
   > If you choose **[A]**, the credential is held by a **SEPARATE OS user** so that NO process running as you — any CC session, host or container — can ever read its value. It is unreadable by OS permissions, not by my good behavior. One-time setup (you run these; I cannot and must not). **Use the EXPLICIT `/Users/Shared/mj-broker` path below — do NOT use `~`/`$HOME`: under `sudo -u mjbroker`, `~` resolves to YOUR home, not mjbroker's, so `~/.mj/...` writes fail with `Permission denied` and the broker then starts tokenless.**
   > 1. Create the broker user: `sudo sysadminctl -addUser mjbroker -fullName "MJ Broker"`
   > 2. Create a broker-OWNED secrets dir (this is what `~` was supposed to give): `sudo mkdir -p /Users/Shared/mj-broker && sudo chown mjbroker /Users/Shared/mj-broker && sudo chmod 700 /Users/Shared/mj-broker`
   > 3. Store the token so ONLY `mjbroker` can read it — entered via a **silent prompt** (no shell history, no `ps` exposure; never put the token as a command argument):
   >    `sudo -u mjbroker bash -lc 'umask 077; read -rsp "<ENVVAR>: " T; printf "<ENVVAR>=%s\n" "$T" > /Users/Shared/mj-broker/<vendor>.env; chmod 600 /Users/Shared/mj-broker/<vendor>.env; unset T; echo saved'`
   >    (It prompts for the token; you paste it once at the `<ENVVAR>:` prompt — nothing echoes, that's `-s` — it's written to the `600` file and cleared from memory. Do NOT use `printf '<ENVVAR>=<token>'` with the token inline — that leaks it to history/`ps`.)
   > 4. Shared mailbox (holds ONLY jobs + scrubbed results, never secrets): `sudo mkdir -p /Users/Shared/mj-mailbox/jobs /Users/Shared/mj-mailbox/results; sudo chmod -R 1777 /Users/Shared/mj-mailbox`
   > 5. Launch the broker AS `mjbroker`: `sudo -u mjbroker bash -lc 'set -a; . /Users/Shared/mj-broker/<vendor>.env; set +a; cd <repo>; MJ_CRED_MAILBOX=/Users/Shared/mj-mailbox node packages/Integration/connectors/test/credential-broker.mjs'` — it must print `mailbox=` + the `READ-ONLY` line with **NO `No such file`** error; that confirms the token loaded.
   > 6. (Container) mount the mailbox into `claude-dev`: add `- /Users/Shared/mj-mailbox:/workspace/mj-mailbox` to its volumes and set `MJ_CRED_MAILBOX=/workspace/mj-mailbox`.
   > 7. Verify the wall — as YOUR user run `cat /Users/Shared/mj-broker/<vendor>.env` → it MUST print `Permission denied`.
   >
   > Then tell me the broker is up. I submit `{ "task": "<vendor>-readonly" }` to the mailbox and receive ONLY the scrubbed result. I use the credential's outcome; I can never read its value.
   >
   > Reply **A** or **B**.

3. **Branch on the reply (do not proceed until you have it):**
   - **[B]** → no `credentialReference`; the plan runs the **full non-live suite** (no live calls). `maxTier` only RECORDS the non-live ceiling — it never restricts which non-live techniques run. Continue to bootstrap.
   - **[A]** → the credential MUST come via the **separate-user broker** (or the container with the mailbox mounted) — **NEVER a same-user file path** (a local CC session running as the user could read that). Confirm the broker is up by round-tripping ONE read-only job through the mailbox (a scrubbed result comes back); only then continue, with the live read-only tier (T8) sourced via the broker. **NEVER** run a write/bidirectional/ack tier — live testing is READ-ONLY ONLY, every connector. If the separate-user broker isn't set up yet, give the user the step-1..6 runbook above and WAIT — do NOT fall back to a credential file the agent's own user can read.

`<ENVVAR>` = the connector's credential env-var name (e.g. `PROPFUEL_TOKEN`); `<vendor>-readonly` = the connector's read-only broker plan in `packages/Integration/connectors/test/plans.mjs`.

### Step 1 — workspace bootstrap

Run the workspace provisioner:
```bash
node packages/Integration/connector-builder-workshop/scripts/start-run.mjs \
  --vendor <vendor-name> \
  [--budget <tokens>] \
  [--max-tier <T0..T8>]
```

Capture its stdout JSON. This blob contains `runID`, `workspaceDir`, `planPath`, `manifestPath`, `specDigestPath`, `slotsPath`, `corpusEntries`. All subsequent stages reference these paths.

### Step 0a — regenerate spec digest (drift gate)

```bash
node packages/Integration/connector-builder-workshop/scripts/regenerate-spec-digest.mjs
```

Non-zero exit = drift; halt and surface the drift evidence as an architecture finding.

## Three-stage orchestration

### Stage 1 — Plan (connector-creator)

Dispatch `connector-creator` (the planner agent, Opus) via `Task` with:
- `vendor_request` — `{ vendor_name, credentialReference?, budget?, max_tier? }`
- `spec_digest` — the contents of `packages/Integration/connector-builder-workshop/planner/spec-digest.json` (regenerated up-front; see Pre-flight).
- `corpus_lookup` — any matching entries from `packages/Integration/connector-builder-workshop/corpus/` keyed by vendor-shape tuple (Gap 6).

Planner output (validated by output schema):
- Workflow script written to `packages/Integration/connector-builder-workshop/plans/<vendor>.workflow.js`.
- `minimumThoroughnessManifest`.
- `vendorShape` + `authPattern` + `discoveredCapabilities`.
- `scriptHash` (content-addressed for resumption).
- `rationale` (≤500 words).

### Stage 2 — Review (independent-reviewer, different model)

Dispatch `independent-reviewer` via `Task`, explicitly setting a model that differs from the planner. Pass:
- The planner's script path + manifest only — NOT the rationale (architectural firewall).
- The spec digest.
- Corpus failure modes for this vendor-shape (`workshop/corpus/<shape>/failures.json` if present).

Reviewer's default verdict is `rejected`. On `approved` / `approved-with-amendments`: proceed to Stage 3. On `rejected`: re-dispatch the planner with the reviewer's amendment requests; up to 3 rounds. Persistent rejection → escalate.

**Model-difference enforcement**: when invoking `independent-reviewer`, the Task call MUST pass a model identifier different from the planner's. If you cannot deterministically pick a different model, halt and report the orchestration failure rather than silently risk same-model groupthink.

### Stage 3 — Execute (planner-emitted Workflow)

Invoke the workflow script via the `Workflow` tool with `scriptPath` pointing to the planner's emitted file at `packages/Integration/connector-builder-workshop/plans/<vendor>.workflow.js`. Pass `args` containing:
- `vendor` — the vendor name.
- `runID` — from Step 0's stdout.
- `liveCredential` — for an [A] run: the separate-user broker is up and a read-only job round-trips via the mailbox (**no credential path is EVER passed into the workflow** — the live tier sources it only through the broker). For a [B] run: absent/`null` (credential-free).
- `manifestPath` — path to the planner's manifest (the script reads it).
- `slotsPath` — `packages/Integration/connector-builder-workshop/floor/phase0-slots.json`.
- `maxTier` — RECORDS the **live** ceiling actually reachable (creds → up to T8 read-only; no creds → the non-live ceiling). It does NOT gate the non-live suite, which always runs to its full applicable extent regardless of `maxTier`.

The Workflow itself runs the locked primitives (`audit-source`, `extract-iiof-pipeline`, `freeze-contract`, `verification-ladder`, `floor-check`). Each primitive composes the appropriate `agentType` subagent stages internally (e.g., `extract-iiof-pipeline` dispatches `ioiof-extractor` ONCE over the whole schema — one script walks every object, flat in object count — then one batched verify + N reviewers over the full emission; `verification-ladder` dispatches `testing-agent` per-rung).

The plan-script template at `packages/Integration/connector-builder-workshop/plans/_TEMPLATE.workflow.js` is the shape the planner is expected to customize. Read it once before the run so you know what the runtime will be executing.

#### Amendment loops — REQUIRED, not optional

The planner-emitted workflow MUST implement two amendment loops (the template does). A single `return` on first reviewer-blocking-gap is a broken orchestration — it wastes the entire upstream investment (sources + identity + metadata + extraction) and ships nothing. The amendment loop turns reviewer feedback into mechanical corrections the producer applies, then re-validates.

**Extract amendment loop** — when `independent-reviewer` reports `ConfirmedGapsBlocking > 0`, the workflow re-dispatches `ioiof-extractor` with the reviewer's `FixInstructions` as input, re-freezes the contract, re-reviews. `MAX_AMENDMENT_ROUNDS = 1` (kept LOW deliberately — the mechanical gates: 0-field hard-fail, §0b `enforce-finding-floor`, `compute-source-diff`, T1 invariants, catch defects in-pass, so repeated re-extract is pure waste).

Exit conditions:
- `ConfirmedGapsBlocking === 0` → proceed to CodeBuild.
- Reviewer fingerprint byte-identical to prior round (same gaps, same fix instructions) → producer can't fix what reviewer wants → escalate as `EscalatedDeadlock`.
- Hit `MAX_AMENDMENT_ROUNDS = 1` with unresolved gaps → escalate as `EscalatedMaxRounds`.

**CodeBuild amendment loop** — when `code-builder` returns `BuildClean=false` OR `verification-ladder` shows a red rung, re-dispatch `code-builder` with the specific errors fed back. `MAX_CODE_BUILD_ROUNDS = 2`. Same convergence + max-round rules.

Anti-thrash: if a higher tier fails on something a lower tier could have caught, that's a gate-placement bug — fix the lower-tier check, don't silently re-run the higher tier.

Mechanical fixes (singular-vs-plural FK target naming, missing co-grouped `DeleteIDLocation`, TypeScript type-mismatch) resolve in 1–2 rounds. Genuinely unresolvable issues surface as `EscalatedDeadlock` after the producer attempts and fails — which is honest escalation, not silent abandonment.

### Gate — Floor-check verdict

After the Workflow returns, read the final `floor-check` verdict:
- `pass: true` → write `SuperCoordinatorReport.{json,md}` to `connectors-registry/<vendor>/` + announce success to the user. NO commit, NO PR (per MJ Rule #1; explicit user approval each time).
- `pass: false` → surface the structural failures. Route back through the planner amendment loop (one round); if it still fails, escalate.

### Teardown — clear the environment (MANDATORY at the END of EVERY run, pass or fail)

After reporting the verdict you MUST present cleanup so no credential or run state lingers. Show the user the relevant block verbatim:

**If this was an [A] live run (broker used):**
> Run finished — clear the environment:
> 1. Stop the broker: `sudo -u mjbroker pkill -f credential-broker.mjs` (or Ctrl-C in its terminal).
> 2. Destroy the token: `sudo rm -f /Users/Shared/mj-broker/<vendor>.env` (or `sudo rm -rf /Users/Shared/mj-broker` to remove the broker secrets dir entirely).
> 3. Clear the mailbox (results are scrubbed, but wipe it): `rm -rf /Users/Shared/mj-mailbox/jobs/* /Users/Shared/mj-mailbox/results/* /Users/Shared/mj-mailbox/done/* 2>/dev/null`.
> 4. Stop + clean the Docker workbench: `cd docker/workbench && docker compose down` (add `-v` to also drop the data volumes for a clean slate). If you added the `- /Users/Shared/mj-mailbox:/workspace/mj-mailbox` mount for this run, remove that line.
> 5. Wipe this run's scratch: `rm -rf packages/Integration/connectors-registry/<vendor>/runs/<runID>/test-data`.
> 6. (Optional, if `mjbroker` was one-off) remove the user: `sudo sysadminctl -deleteUser mjbroker`.
> Verify clean: `pgrep -fl credential-broker.mjs` → no output, and `ls /Users/Shared/mj-mailbox/jobs /Users/Shared/mj-mailbox/results` → empty.

**If this was a [B] credential-free run:**
> Run finished — `cd docker/workbench && docker compose down` if you started the workbench. Nothing credential-related to clear.

A build is NOT "done" until the user has the teardown for whatever they stood up — never skip it.

## Pre-flight

Before Stage 1 spawns, verify:
- `packages/Integration/engine/dist/` exists (`npm run build` in the package if missing).
- `packages/Integration/pk-classifier/dist/` exists.
- `packages/Integration/progress-artifacts/dist/` exists.
- `packages/MCP/mj-metadata/dist/` + `packages/MCP/mj-test-runner/dist/` exist if referenced by the planner's manifest.
- `.mcp.json` registers any MCPs the workflow will use.
- `packages/Integration/connector-builder-workshop/` + `packages/Integration/connectors-registry/` exist.
- Spec digest regeneration: `node packages/Integration/connector-builder-workshop/scripts/regenerate-spec-digest.mjs`. Exit non-zero = digest drift; halt and surface the drift evidence as an architecture finding (the bijection is supposed to stay in lockstep; drift means the agentic doc or Phase 0 doc moved without the slot table catching up).

**v2 environment gates (S0 `EnvPreflight` — the workflow's FIRST phase; ARCHITECTURE_REFACTOR.md P7).**
The GrowthZone marathon lost hours to environment defects no stage checked: a **stale nested
`@memberjunction/integration-*` dist** under `packages/MJServer/node_modules` silently disabling
custom-column capture framework-wide (GZ #31), stale turbo dists masking fixes (#13), churned
generated trees + stale class manifests killing MJAPI boot (#11/#19/#33), zombie runs from mid-sync
restarts (#14). The planner-emitted workflow MUST begin with `EnvPreflight` and abort cheap on:
- DB unreachable / wrong migration level; MJAPI not bootable from the current tree.
- Generated tree (generated.ts, entity_subclasses, class manifests) churned vs HEAD and unaccounted.
- **Stale-nested-dist scan**: any real-directory `@memberjunction/integration-*` copy under a
  package's `node_modules` whose dist hash differs from the workspace dist.
- Turbo dist staleness for the packages under test (src newer than dist).
`floor-check` fails any run whose journal lacks `envPreflight` (`env-preflight-missing`) or carries
unresolved `staleNestedDists` (`stale-nested-dist`).

**v2 empiricism contract (ARCHITECTURE_REFACTOR.md — binding on every run).** The plan must contain a
**`RealityProbe` phase (S7)** — read-only verdicts on declared claims (paths / pagination-advances /
PK-populated / watermark / write-surface existence / rate headers) BEFORE CodeBuild, degraded to the
unauthenticated per-claim status probe when no credential exists — plus ONE `ProbeAmend` round. And
when intake chose **[A] (credential)**, the `HybridE2E` stage runs **live — mock mode cannot satisfy
it** (`e2e-mock-dodge` floor rule); a multi-secret credential is a harness deficiency to fix, never a
reason to skip live. Reports state the EMPIRICAL vs LINT split of every gate — a lint-green is never
presented as verification.

If any prerequisite is missing, error to the user with the specific missing piece.

## Failure response

Per the agentic plan §12 standing rule: **if the gap can't be fixed by ONE LINE in ONE role file or ONE primitive, that's an architectural finding — escalate, don't iterate the framework.**

Concretely:
- Planner persistent reject after 3 amendment rounds → escalate to user with the reviewer's evidence chain.
- Workflow execution failure inside a locked primitive → surface the primitive's structured error; route to the responsible upstream agent.
- Floor-check structural failure after one amendment round → escalate to user with the failure list.
- Budget hits 1M ceiling → halt with `budget-exhausted` and escalate.

## What this skill does NOT do

- **Does NOT discover, probe, analyze, or conclude anything itself — only the agent architecture's findings count.** The orchestrator MUST NOT hand-run discovery probes, parse vendor schemas, measure patterns, or reach conclusions about the connector's shape/objects/fields/PK/FK and then feed them in or "report" them as truth. That is the single biggest failure mode: the orchestrator injecting "likely"-grade hand-work that the rigorous pipeline never sanctioned. Findings produced by the orchestrator are **invalid by construction** and must not drive any decision. The orchestrator ONLY: runs Step-0 intake, sequences Plan→Review→Execute, and **reports back what the AGENTS found** (verbatim from their structured outputs / the floor-check verdict). If you catch yourself running a `curl`/probe/script to "see what the vendor has" or analyzing a result to decide the connector's shape — STOP; that is the agent's job, and your version is not trustworthy. (Reading run artifacts to *report status* is fine; deriving connector truth is not.)
- Does NOT read the credentials file. The secret is held by a **separate OS user** (the `mjbroker` broker set up in Step 0b, `600` perms) so the filesystem denies any read by this skill or any sub-agent running as your user — credential isolation is an OS-permission guarantee, not a behavioral one. Only the `mj-test-runner` MCP subprocess dereferences the opaque reference internally.
- Does NOT make design decisions about the connector's shape — the planner owns those (and the workflow runtime executes them deterministically).
- Does NOT commit or push. Final commit requires explicit user approval each time.
- Does NOT call `SoftPKClassifier` directly. That's runtime D4's job inside `IntegrationConnectorCreationPipeline` if/when the connector is later registered against a live system.
- Does NOT bypass `floor-check`. The bijection floor is the structural truth.
