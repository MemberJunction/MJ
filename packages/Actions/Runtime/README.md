# @memberjunction/action-runtime

Runtime executor for MJ actions whose `Type='Runtime'` — the ones whose source code lives in the database (`Action.Code`) rather than in a compiled `@RegisterClass`-registered BaseAction subclass.

Ships a single singleton, `RuntimeActionExecutor.Instance`, that `@memberjunction/actions` dispatches to when it sees an action with `Type='Runtime'`. Everything else about the action (approval gate, permission config, input / output param wiring, sandbox isolation) is handled here.

## Where it sits in the stack

```
┌──────────────────────────────────────────────────────────────┐
│ @memberjunction/actions  (ActionEngine)                      │
│   – dispatches Custom/Generated via ClassFactory             │
│   – dispatches Runtime via RuntimeActionExecutor ────────┐   │
└──────────────────────────────────────────────────────────────┘
                                                          │
                           ┌──────────────────────────────┴────┐
                           │ @memberjunction/action-runtime    │
                           │   – approval + status gating      │
                           │   – input/output param mapping    │
                           │   – wraps user code for the vm    │
                           │   – error-type → resultCode       │
                           └──────────────────┬────────────────┘
                                              │
                           ┌──────────────────┴────────────────┐
                           │ @memberjunction/code-execution    │
                           │   – CodeExecutionService          │
                           │   – WorkerPool (forked children)  │
                           │   – isolated-vm sandboxes         │
                           │   – bridge-call IPC protocol      │
                           └───────────────────────────────────┘
```

This package does **not** build the `utilities.*` bridge — that lives in [`@memberjunction/action-runtime-host`](../RuntimeHost/README.md) and is handed in as a `bridgeHandlers` map per invocation. RuntimeActionExecutor is the boundary between "action metadata + parameter plumbing" and "isolated-vm sandbox" — it doesn't know or care what `utilities.*` exposes.

## Executor lifecycle

On first invocation, `RuntimeActionExecutor.Instance` lazily spins up the shared `CodeExecutionService` — which in turn forks N (default 2) worker processes, loads `isolated-vm` in each, and warms them for sandbox execution. Because the executor is a `BaseSingleton`, that setup cost is paid once per MJAPI process; every subsequent Runtime-action invocation reuses the warm pool (typical latency ~80ms vs. ~5s cold start).

See [`@memberjunction/code-execution` README](../CodeExecution/README.md) for the worker pool lifecycle, circuit-breaker behavior, and how failed workers are recycled.

## What `execute()` does, in order

1. **Type gate** — refuses anything other than `Type='Runtime'` with `resultCode: INVALID_TYPE`.
2. **Code presence** — refuses missing or empty `Action.Code` with `resultCode: MISSING_CODE`.
3. **Status gate** — refuses `Status !== 'Active'` with `resultCode: INACTIVE`.
4. **Approval gate** — refuses `CodeApprovalStatus !== 'Approved'` with `resultCode: NOT_APPROVED`. This is **the primary security boundary** — an operator must have explicitly approved the code before it can run.
5. **Abort check** — refuses upstream-aborted signals with `resultCode: TIMEOUT`.
6. **Input wiring** — builds a plain `input` object from every `ActionParam` with `Type === 'Input' | 'Both'`, keyed by `Name`. Output-type params are excluded so user code isn't confused by half-filled output slots.
7. **Code wrapping** — wraps user code so its return value lands in the sandbox's `output` variable (see ["User code contract"](#user-code-contract) below).
8. **Sandbox dispatch** — calls `CodeExecutionService.execute({ code, inputData, timeoutSeconds, memoryLimitMB, bridgeHandlers, maxBridgeCalls, abortSignal })`. Default limits: 30s wall clock, 128MB heap.
9. **Result mapping** — promotes the returned value into output `ActionParam`s (see ["Output params"](#output-params)) and maps any `errorType` the sandbox surfaced into the corresponding `RuntimeActionResultCode`.

## User code contract

User code is written as the **body of a function** — it receives `input`, can `return` any value, and has access to an allowlisted `require()` for standard libraries (lodash, date-fns, mathjs, papaparse, uuid, validator):

```js
const _ = require('lodash');
const { numbers, outlierThresholdSigma = 2 } = input;

if (!Array.isArray(numbers)) return { success: false, error: 'numbers must be an array' };

const nums = numbers.filter((n) => typeof n === 'number' && Number.isFinite(n));
const mean = _.sum(nums) / nums.length;
const stdDev = Math.sqrt(_.sumBy(nums, (n) => Math.pow(n - mean, 2)) / nums.length);

return {
  success: true,
  count: nums.length,
  mean,
  stdDev,
  outliers: nums.filter((n) => Math.abs(n - mean) > stdDev * outlierThresholdSigma)
};
```

Under the hood, RuntimeActionExecutor produces a single awaited statement that the worker's outer async wrapper captures correctly:

```js
output = await (async function(input) { /* USER CODE HERE */ })(input);
```

**Why this shape**: the worker's outer wrapper looks roughly like `(async function() { let output; ${params.code}; globalThis._output = output; })();` — it does **not** await arbitrary expressions in the user's code. Our single `await (...)` statement is something the outer wrapper's sequential execution awaits naturally, so the return value flows to the host cleanly. An earlier async-IIFE wrapper inside the user code dropped the return value; the current one-liner form is deliberate.

## Output params

When user code returns:

- **An object** — each top-level key becomes an `Output` `ActionParam`. If the key name matches an existing `Input` param, that param is upgraded to `Both` and its value is replaced with the returned value.
- **A scalar, array, or non-object** — wrapped under an `Output` param named `result`.
- **`undefined`** — no output params added.

Params emitted here are **plain objects** (`{ Name, Value, Type }`), not class instances. This is deliberate: MJ's GraphQL resolver runs them through `CopyScalarsAndArrays`, which silently drops keys whose values are class instances without a `toJSON`. Emitting plain objects keeps the full output set visible end-to-end.

## Approval gate in practice

```ts
if (action.CodeApprovalStatus !== 'Approved') {
  return {
    success: false,
    resultCode: RuntimeActionResultCode.NOT_APPROVED,
    message: `Action '${action.Name}' has CodeApprovalStatus='${action.CodeApprovalStatus}'. ` +
             'Runtime actions must be approved before execution.',
    params: originalParams
  };
}
```

This check runs **before** any user code executes, before `CodeExecutionService.execute()` is even called. No sandbox cost is paid for unapproved actions. In MJExplorer, the action form surfaces `CodeApprovalStatus` prominently and exposes a dropdown for toggling `Approved` / `Pending` / `Rejected` in edit mode.

## Result codes

Defined in `RuntimeActionResultCode`:

| Code | Meaning |
|---|---|
| `SUCCESS` | User code completed, output captured |
| `INVALID_TYPE` | Action.Type !== 'Runtime' |
| `MISSING_CODE` | Action.Code null/empty |
| `INACTIVE` | Action.Status !== 'Active' |
| `NOT_APPROVED` | Action.CodeApprovalStatus !== 'Approved' |
| `TIMEOUT` | Upstream abort OR sandbox wall-clock exceeded |
| `MEMORY_LIMIT` | Sandbox exceeded `memoryLimitMB` |
| `SYNTAX_ERROR` | User code couldn't be parsed |
| `SECURITY_ERROR` | Sandbox detected a policy violation |
| `RUNTIME_ERROR` | User code threw |
| `UNEXPECTED_ERROR` | Host-side dispatch failure (rare — the sandbox service itself threw) |

## The `utilities.*` bridge

User code in Runtime actions has access to MJ services via a `utilities.*` global — `utilities.md.GetEntity`, `utilities.rv.RunView`, `utilities.actions.Invoke`, `utilities.agents.Run`, `utilities.ai.ExecutePrompt`, etc. That bridge is **not defined here** — it's in `@memberjunction/action-runtime-host` and is passed in as the `bridgeHandlers` param per invocation.

The split exists to avoid a circular dependency — see the [RuntimeHost README](../RuntimeHost/README.md) for the full story.

## Testing

```bash
cd packages/Actions/Runtime
npm run test          # 13 unit tests covering approval gates, param mapping, error paths
```

End-to-end regression is in `packages/Actions/Runtime/harness/run-demos.ts` — a standalone tsx script that spins up a real SQL connection, registers the full class graph, and runs all 5 demo Runtime actions (`Calculate Array Statistics`, `Entity Data Quality Report`, `Find Similar Records`, `Summarize Entity Records`, `Weekly Entity Digest`) against a live database. Run with:

```bash
npx tsx packages/Actions/Runtime/harness/run-demos.ts
```

Exits 0 if all 5 pass.

## Related packages

- [`@memberjunction/action-runtime-host`](../RuntimeHost/README.md) — the default `utilities.*` bridge implementation
- [`@memberjunction/code-execution`](../CodeExecution/README.md) — isolated-vm sandbox + worker pool
- `@memberjunction/actions-base` — shared types + the `RuntimeActionConfigurationSchema` parsed before dispatch
- `@memberjunction/actions` — ActionEngine that routes `Type='Runtime'` records here
