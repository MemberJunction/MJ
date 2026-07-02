# GraphQL variables-logging secret-redaction design

**Tracking issue**: [MemberJunction/MJ#2638](https://github.com/MemberJunction/MJ/issues/2638)

**Branch**: `fix/graphql-context-log-redact-secrets`

**PR**: [#2648](https://github.com/MemberJunction/MJ/pull/2648) (contains PRD only; this design doc is local-only)

**Companion PRD**: [`plans/graphql-context-log-redact-secrets-PRD.md`](./graphql-context-log-redact-secrets-PRD.md)

**Status**: Superseded in part by senior review. The structural-shape (value-blind)
line described below is **deleted**; the value-bearing-but-secret-masked middleware line
is **kept** as the sole verbose emitter; the "no literal value under any flag" invariant
is **retracted**. Full resolution in the companion PRD's **Resolution (post-review)**
section and in [`docs/adr/0001-graphql-variables-logging-tiered-by-verbose.md`](../../docs/adr/0001-graphql-variables-logging-tiered-by-verbose.md).
The "three-layer logging" / "two complementary log lines" model below is the rejected
design — retained for history. Where it conflicts with the ADR, the ADR wins.

**Final implemented behavior** (smoke-tested live against MJAPI on SQL Server):
- Default/prod: boundary line = `{ operationName }` only — no values. ✅
- Verbose (`MJ_LOG_GRAPHQL_VARIABLES=true`): the per-resolver middleware is the **sole** values
  emitter; values **fully emitted** except `Encrypt=true` fields (`<redacted>`). The boundary
  line stays operation-name-only (no second value-blind line). ✅
- Live `CreateMJCredential` test: `Values: '<redacted>'`, fake secret absent from stdout
  (`grep -c` = 0). ✅
- Two bugs fixed during smoke prep: (1) `Delete` added to the audit + redactor regex to stop the
  boot-audit flood; (2) field-level `@NoLog` now honored on non-entity-bound inputs (was silently
  ignored — `GetDataInputType.Token` would have leaked). Build clean; 261 MJServer tests pass.

**Revision history**: Initial design framed the new middleware as the primary
defense. Ultrareview pointed out that the actual leak fix is the **removal of
the `variables` field from the always-on log line at `context.ts:345`**, and
that the middleware is an additive, opt-in verbose echo with redaction. The
first revision restructured accordingly. It also revised the boot-audit scope
(gated to verbose mode to avoid alert fatigue), is honest about which leak
surface metadata redaction actually covers, and addressed several smaller
points from the review.

A second revision (post-implementation) extends the boundary-line behavior:
the line emits operation-name only in default config (the load-bearing leak
fix), and in verbose mode (`MJ_LOG_GRAPHQL_VARIABLES=true`) emits an
additional **structure-only** variables block — field names, array lengths,
nesting, and type markers (`<string>`, `<number>`, `<Date>`) but never
literal values. Lives in `packages/MJServer/src/logging/structuralShape.ts`
as `describeStructure` + `buildBoundaryLogPayload`; 41 tests across two
spec files (`structuralShape.test.ts`, `buildBoundaryLogPayload.test.ts`).

---

## Problem

`@memberjunction/server`'s GraphQL context function logs every incoming request's
`operationName` and `variables` to stdout for debugging. The log line has no
notion of which variables are sensitive, so any mutation that accepts a secret
as an argument leaks the secret in plaintext to stdout, container logs, journald,
cloud log aggregators, etc.

Source of the leak: [`packages/MJServer/src/context.ts:344-346`](../packages/MJServer/src/context.ts#L344-L346).

Two related log sites flagged in the issue:

- [`packages/MJServer/src/resolvers/GetDataResolver.ts:121`](../packages/MJServer/src/resolvers/GetDataResolver.ts#L121)
  — `LogStatus(JSON.stringify(input))` where `input = { Token, Queries: string[] }`.
- [`packages/MJServer/src/resolvers/MCPResolver.ts:771`](../packages/MJServer/src/resolvers/MCPResolver.ts#L771)
  — `LogStatus('... Parsed args: ${JSON.stringify(parsedArgs).substring(0, 200)}...')`
  where `parsedArgs` is arbitrary MCP-tool-defined JSON.

## Guiding principles

From the senior engineer's direction:

1. **Metadata-driven, not keyword-driven.** Use `EntityFieldInfo.Encrypt` as the
   source of truth for what to redact. No regex over field names like
   "password" / "secret" / "apiKey".
2. **Variables logging is verbose-only**, not always-on. Default off in production.
3. **Custom resolvers get an opt-out decorator** (`@NoLog`) for parameters that
   metadata cannot identify as sensitive.

From the ultrareview's clarification:

4. **The actual leak fix is the variables-field deletion from line 345.** The
   new middleware is additive (an opt-in verbose echo with redaction), not the
   load-bearing defense.
5. **Metadata redaction does NOT cover the original incident's custom resolver.**
   `VoiceTestHubSpotCredential(accessToken: String!)` is closed by change 1 +
   `@NoLog`, not by metadata.

## Architecture

### The primary fix (change 1)

At [`context.ts:327`](../packages/MJServer/src/context.ts#L327), the boundary
log call is wrapped in a flag-aware helper:

```ts
const payload = buildBoundaryLogPayload(
  operationName,
  reqAny.body?.variables,
  configInfo.loggingSettings.graphql.logVariables,
);
console.dir(payload, { depth: null, breakLength: 200 });
```

`buildBoundaryLogPayload` is a pure function with two branches:
- `logVariables=false` → returns `{ operationName }` only. The `variables`
  key is not present in the output. **This is the load-bearing leak fix** —
  the original incident's leak surface no longer exists in default config.
- `logVariables=true` → returns `{ operationName, variables: describeStructure(variables) }`,
  where `describeStructure` reduces the variables payload to a type-only
  mirror: field names, array lengths, and nesting all preserved; every
  primitive value replaced with its type marker (`'<string>'`, `'<number>'`,
  `'<Date>'`, etc.). Literal values never reach stdout.

Both helpers live in
[`packages/MJServer/src/logging/structuralShape.ts`](../packages/MJServer/src/logging/structuralShape.ts).
Pure functions, no MJ-server import surface, isolation-testable. 41 tests
across two spec files. Everything else in this doc is **additive** — provides
a metadata-driven redacted alternative for developers who explicitly turn on
verbose mode (per-resolver middleware, see below).

### Three-layer logging (after the fix lands)

| Log content | Gate | Default | Where it lives |
|---|---|---|---|
| `{ operationName: '<name>' }` — operation name only | Always on, no flag | On | [`context.ts:327`](../packages/MJServer/src/context.ts#L327), default branch of `buildBoundaryLogPayload` |
| `{ operationName, variables: <structure-only> }` — same line, with structural shape added | `loggingSettings.graphql.logVariables` | **Off** | [`context.ts:327`](../packages/MJServer/src/context.ts#L327), verbose branch of `buildBoundaryLogPayload`; reduction via `describeStructure` |
| `{ operation, args: <entity-aware-redacted> }` per root resolver | `loggingSettings.graphql.logVariables` | **Off** | New type-graphql `globalMiddlewares` entry (per-resolver middleware) |

When `logVariables=true`, **two complementary log lines** fire per request:
the boundary line shows the request shape as the HTTP body was received (no
entity-binding, no value visibility), and the middleware line shows the
resolved args with entity-aware redaction (non-encrypted values visible,
encrypted fields masked). Different debug perspectives for different bugs.

The per-resolver middleware fires **only on root resolvers**
(`@Query` / `@Mutation` / `@Subscription`), detected via `info.path.prev === undefined`.
Field resolvers are skipped to keep the log volume close to the current
one-line-per-request shape rather than one-line-per-resolution-step.

### Schema-build pipeline implication

The new middleware below is registered via the `globalMiddlewares` key on
`buildSchemaSync`. That key is **not** currently passed to MJServer's
[`buildSchemaSync` call at index.ts:647-653](../packages/MJServer/src/index.ts#L647-L653)
— implementation has to add it. The interaction with the existing pipeline
(`mergeSchemas` + `requireSystemUserDirective.transformer` +
`publicDirective.transformer` + `mwSchemaTransformers` on
[index.ts:660-663](../packages/MJServer/src/index.ts#L660-L663)) is unchanged:
middleware wraps resolver invocation at execution time, while the directive
transformers run at schema-build time. They operate on different layers and
should compose cleanly. The implementer should verify by running the existing
auth-directive tests against the modified schema build.

### Configuration

Add to `packages/MJServer/src/config.ts`:

```ts
loggingSettings: {
  graphql: {
    logVariables: boolean   // default false
  }
}
```

Environment-variable override: `MJ_LOG_GRAPHQL_VARIABLES`, parsed via the
existing `parseBooleanEnv` helper. Defaults to `false` in all environments
regardless of `NODE_ENV`.

**Considered and rejected: unified `loggingSettings` namespace.** Ultrareview
suggested migrating `cacheSettings.verboseLogging` to
`loggingSettings.cache.verbose` and adding `loggingSettings.graphql.verbose`
under one root key. Rejected for this PR because (a) the migration touches every
MJ-based consumer's config file including downstream products' deployed
environments; (b) the value is purely cosmetic — a future restructure can
migrate all three areas together; (c) telemetry's `verbose` enum is a different
shape (level enum vs boolean) and would need its own design pass. Defer to a
future configuration-cleanup PR.

### Boundary-log structural shape (the layer-1 path)

`describeStructure(value, maxDepth = 5)` is a recursive type-only mirror of
the input. Decision tree:

1. `null` → `null` (preserved). `undefined` → `undefined` (preserved). Both
   carry structural meaning (presence/absence) without value content.
2. Primitives (`typeof` is `string` / `number` / `boolean` / `bigint` /
   `symbol` / `function`) → `'<' + typeof + '>'`.
3. Beyond `maxDepth` and value is an object → `'<object>'` (collapse to
   prevent unbounded log output for pathological structures).
4. Array → map each element recursively (depth + 1). Length preserved.
5. Class instance / typed object (constructor is not plain `Object`) →
   `'<' + constructor.name + '>'` (e.g. `'<Date>'`, `'<Map>'`, `'<Set>'`,
   `'<Foo>'`). Not walked; treated as opaque typed value.
6. Plain object (constructor is `Object`, or `Object.create(null)`) →
   recurse into each `(key, value)`, depth + 1. Keys preserved.

`buildBoundaryLogPayload(operationName, variables, logVariablesEnabled)` is
the seam between `context.ts` and the structural shape:
- `logVariablesEnabled=false` → `{ operationName }`. No `variables` key.
- `logVariablesEnabled=true` → `{ operationName, variables: describeStructure(variables) }`.

Both helpers live in
[`packages/MJServer/src/logging/structuralShape.ts`](../packages/MJServer/src/logging/structuralShape.ts).
Neither has any MJ-server import surface. Both are isolation-testable pure
functions with 41 tests across
[`structuralShape.test.ts`](../packages/MJServer/src/__tests__/structuralShape.test.ts)
(30 tests) and
[`buildBoundaryLogPayload.test.ts`](../packages/MJServer/src/__tests__/buildBoundaryLogPayload.test.ts)
(11 tests). The latter includes explicit "no literal value appears in
output" assertions against 5 different secret patterns under both flag states.

**Security property**: in either flag state, the JSON-serialized form of the
returned payload contains no literal value from the input variables payload.
This is the layer-1 contract: structural visibility for debugging without
ever emitting plaintext.

### Redaction rule (the metadata path)

For each `@Arg` on the root resolver, the middleware:

1. Reads the argument's **GraphQL input type name** from the schema via
   `info.parentType.getFields()[info.fieldName].args[i].type` — e.g. the string
   `"CreateMJCredentialInput"`.
2. If the type name matches `Create<X>Input` / `Update<X>Input` (regex
   `^(Create|Update)(?<name>.+)Input$`), strip the prefix and suffix to get the
   entity class name `<X>` (e.g. `"MJCredential"`).
   *(`Delete<X>Input` excluded: delete inputs carry PK + Options only, no
   encrypted-field values by construction. Including them would be vacuous.)*
3. Looks up the `EntityInfo` whose `ClassName === '<X>'` via the
   **per-request provider** (`context.providers[0].provider.Entities`).
4. Walks the top-level keys of the raw arg value. For each key matching an entry
   in `entity.EncryptedFields` (by `.Name`), replaces the value with
   `"<redacted>"`. Other keys pass through `shortenForLog` unchanged.
5. For any `@Arg` decorated `@NoLog` at parameter level, replaces the whole
   value with `"<redacted>"` regardless of metadata.

**Scope is intentionally narrow**: top-level keys of `Create*Input` /
`Update*Input` mapped to a known entity. Out of scope:

- Nested-blob leakage inside non-encrypted entity fields (metadata can't see in).
- `RunView*Input` shapes (`ExtraFilter`, `OrderBy`, `UserSearchString` — these
  are SQL fragments / filter strings, not entity row data; no entity-field
  binding exists on the wire).
- Freeform-string args on custom resolvers — covered by `@NoLog`, not by the
  metadata path.

**Assumption noted for future-proofing**: this implementation assumes
`EntityFieldInfo.Name === GraphQLFieldName` for input-type fields. True today
for all codegen output (verified across 323 `Create*Input` and 323
`Update*Input` classes). type-graphql allows `@Field({ name: 'overrideName' })`
to rename fields at the GraphQL layer, but MJ codegen does not use this. If a
future downstream consumer renames an encrypted field in GraphQL, the redactor
will miss it. A code-comment in module 1's source should call this out so a
future maintainer doesn't get burned.

### `@NoLog` decorator

Ships from `@memberjunction/server` (co-located with the middleware that reads it,
same shape as the existing `RequireSystemUser` / `ResolverBase` exports).

Dual-mode — works as both:

- **`ParameterDecorator`** on a resolver method argument, e.g.
  ```ts
  @Mutation(...)
  async VoiceTestHubSpotCredential(
    @Arg('accessToken') @NoLog accessToken: string,
    @Ctx() ctx: AppContext
  ) { ... }
  ```
- **`PropertyDecorator`** on an `@Field()` inside an `@InputType` class, e.g.
  ```ts
  @InputType()
  export class GetDataInputType {
    @Field(() => String) @NoLog Token: string;
    @Field(() => [String]) Queries: string[];
  }
  ```

Distinguished by arity at runtime. Stored via reflect-metadata (key shape
`Symbol('mj:NoLog')`) so the variables-logging middleware can read the marker
without import-time coupling to type-graphql's own metadata storage.

**Single-name vs two-name trade-off**: TypeScript's decorator arity dispatch
(parameter vs property) is well-established (e.g. NestJS's `@Inject()` does
the same). A single name is more intuitive for custom-resolver authors. The
alternative — `@NoLogParam` + `@NoLogField` sharing a metadata key — is more
explicit but adds an extra import authors must remember. Current direction:
single name with arity dispatch. If the senior prefers two names, it is a
one-line change.

### Safety-net layers around `@NoLog`

Two warnings catch the case where a custom-resolver author forgets `@NoLog`:

1. **Boot-time audit (verbose-mode-only)**: on server startup, **only if
   `logVariables=true`**, scan resolver metadata for `@Arg`s whose type does not
   match `^(Create|Update).+Input$` *and* whose parameter does not carry
   `@NoLog`. Emit one warning per such arg: *"Custom resolver `X.foo` takes
   argument 'bar' (type `<TypeName>`) which is not marked `@NoLog`. Verify this
   argument does not carry sensitive material; if it does, apply `@NoLog`.
   Variables for this resolver will be logged in plaintext while
   `logVariables=true` is active."*

   **Why verbose-mode-only** (revised after ultrareview): an always-on boot
   audit would warn on every `id: ID!`, `pagination: PaginationInput`,
   `maxRows: Int`, `extraFilter: String`, etc. across the codebase. The vast
   majority of `@Arg`s are non-secret. Always-on warnings produce alert fatigue;
   real secret warnings would disappear in the noise; developers would tune the
   audit out within a sprint. Gating to verbose mode makes the audit a
   *diagnostic for the operator who chose to turn on verbose logging*, not a
   startup gate. In default config (production) the audit does not run at all
   and produces zero output.

   **Considered alternative** (rejected): add a `@SafeToLog` decorator to
   explicitly mark "this arg is fine to log." Rejected because (a) it doubles
   the decorator surface authors need to learn, (b) verbose-mode gating
   achieves the signal-to-noise goal more simply. Reconsider if a future
   deployment surfaces a need for default-on audit.

2. **Runtime first-call warning** (only when `logVariables=true`): on the first
   invocation of any resolver whose args are neither `@NoLog`-decorated nor
   metadata-bound, emit a one-time-per-process warning naming the resolver and
   the suspicious args. Strictly additive to (1); fires at the moment the
   author is actually staring at the log.

   **Note on the warning's protective scope**: the warning emits as part of
   the same request that emits the variables block. The first leak still
   happens; subsequent calls are suppressed (one-time). This is acceptable
   because (a) the warning only fires when `logVariables=true` (an explicit
   operator action), and (b) the warning prompts the author to apply `@NoLog`
   before the leak surface broadens. The runtime warning is a
   developer-discovery aid, not a leak preventer.

These are **warnings, not errors** — boot does not fail. Treating missing
`@NoLog` as a hard error would impose a migration tax on every existing
custom resolver and break downstream consumers' builds at upgrade time.

### Subscription path (covered, but explicit)

type-graphql v2's `globalMiddlewares` fire for `@Subscription` resolvers using
the same execution path as queries and mutations. The MJ server registers
subscriptions via `useServer` from `graphql-ws` against the same merged schema
([`index.ts:670-694`](../packages/MJServer/src/index.ts#L670-L694)). Since the
middleware is bound at schema-build time, subscription root resolvers are
covered automatically.

**No separate wiring is needed for subscriptions**, but the implementer should
add an integration test that exercises a subscription with verbose mode on, to
lock this assumption against future type-graphql upgrades.

### Edge cases

| Case | Behavior | Rationale |
|---|---|---|
| Metadata not loaded yet (`provider.Entities.length === 0`) | **Fail-closed** — emit `<metadata-not-ready>` for the whole `@Arg`. | Transient bootstrap window, safer to over-redact than under-redact. No persistence-detection mechanism (no timer / counter); the window is brief in normal operation and produces an obvious-to-read placeholder. |
| Lookup misses (no entity matches the stripped class name) | **Fail-open** — log as-is via `shortenForLog`. | Either a custom resolver (covered by `@NoLog` path) or a build-time codegen bug. |
| RunView inputs (`RunViewByIDInput`, etc.) | Logged as-is under the gate, no metadata redaction. | Filter strings, no entity row data on the wire. |
| Apollo error-formatting path | No custom `formatError` configured. Apollo defaults don't echo variables in error responses. `includeStacktraceInErrorResponses` is unset → Apollo's default applies (stack traces included outside production via `NODE_ENV !== 'production'`). In dev, an error thrown from a resolver could echo the input that caused it depending on what the resolver did before throwing. Out of scope to fix in this PR; flagged for a follow-up hardening task. | Out of scope for this PR. |
| Nested-blob leakage inside a non-encrypted field that wraps an encrypted JSON sub-blob | Out of scope. | Metadata cannot see into JSON blobs; authors structuring secrets inside non-encrypted fields are bypassing the encryption pattern. |
| Per-request vs global metadata provider | Module 1 receives `IMetadataProvider` from `context.providers[0].provider`. In current single-server MJAPI deployments this is functionally equivalent to `Metadata.Provider` (per-request providers reuse global metadata). Honors CLAUDE.md's multi-provider rule in spirit; full multi-provider correctness requires routing the right provider per resolver, which is out of scope here. | Forward-compatible without behavior change today. |
| Subscription resolvers | Covered by the same middleware (same merged schema, same `globalMiddlewares`). An integration test exercising a subscription with verbose mode on locks the assumption. | type-graphql v2 binds middleware at schema-build time; subscriptions ride the same execution path. |
| GraphQL field-name override via `@Field({ name: 'x' })` | Not used by codegen today. If a future maintainer renames an encrypted field at the GraphQL layer, the redactor misses it. A code-comment in module 1 calls this out. | Latent footgun; documented to prevent surprise. |

### Other log sites

- **`GetDataResolver.ts:121`**: replace `LogStatus(JSON.stringify(input))` with a
  summary line — `LogStatus('GetData invoked: ${input.Queries.length} queries')`.
  Mark `Token` on `GetDataInputType` with `@NoLog` so even when the gated
  variables log fires (verbose mode on), the short-lived access token is
  `<redacted>`.

- **`MCPResolver.ts:771`**: gate the args portion of the log line behind
  `logVariables`. Drop the misleading `.substring(0, 200)` — truncation is not
  a security control; 44-char HubSpot tokens fit inside 200 chars trivially.
  When the gate is off, emit `MCPResolver: [<ToolName>] tool invoked` (no args).
  Document for MCP tool authors that tool args are visible in verbose mode and
  that secrets should pass through credentials-by-reference rather than inline.

- **Audit follow-up commit** (revised after ultrareview): same PR, separate
  commit. Rather than the hand-wavy "grep `LogStatus(.*JSON.stringify` and
  apply the same treatment," the implementer **enumerates the specific call
  sites the commit touches** in the implementation PR description. Criterion:
  any `LogStatus` / `console.log` call that emits **user-supplied content**
  (resolver inputs, MCP arguments, GraphQL variables) gets either redacted,
  gated, or replaced with a summary. System-generated diagnostic logs (e.g.
  "step 4 of 5 complete") are left alone.

## Implementation notes (verified against the codebase)

### How the middleware sees args

**Important correction from the design walkthrough.** In type-graphql v2.0.0-beta.3
(MJ's installed version), `resolverData.args` passed to a middleware is the **raw,
plain-object** arg map from the GraphQL execution layer — not the typed input
instance. Conversion to `new CreateMJCredentialInput()` happens inside
`getParams()`, which runs *after* the middleware chain unwinds into the resolver
body.

Reference: [`packages/MJServer/node_modules/type-graphql/build/cjs/resolvers/create.js`](../packages/MJServer/node_modules/type-graphql/build/cjs/resolvers/create.js)
lines 13-18 — `resolverData = { root, args, context, info }` is constructed first;
`getParams` (which calls `convertArgToInstance` and ultimately `Object.assign(new Target(), data)`)
runs only inside the innermost handler.

So the middleware **cannot** use `args.input.constructor.name` to learn the input
type. Instead, it derives the input type name from the schema via:

```ts
const fieldDef = info.parentType.getFields()[info.fieldName];
for (const argDef of fieldDef.args) {
  const argTypeName = getNamedType(argDef.type).name;   // e.g. "CreateMJCredentialInput"
  const rawValue = args[argDef.name];
  // ...derive entity, walk top-level keys, redact, emit...
}
```

`info.parentType: GraphQLObjectType` and `info.fieldName: string` are guaranteed
fields on `GraphQLResolveInfo` from `graphql-js`. The argument's GraphQL type
name is a stable string from the schema — same conventional `Create<X>Input` /
`Update<X>Input` pattern used in code-gen, verified across all 323 generated
input types in `packages/MJServer/src/generated/generated.ts`.

### Per-request provider note

`context.providers[0].provider.EntityByName(...)` honors the spirit of
[CLAUDE.md](../CLAUDE.md)'s multi-provider rule — it uses a per-request
provider instead of `Metadata.Provider`. **However, this is not full
multi-provider correctness**: in a future deployment with multiple distinct
providers per request (e.g. a federated server routing resolvers to different
backends), `[0]` arbitrarily picks the first. The right provider for any given
resolver would depend on which provider that resolver targets — a routing
concern not addressed in this PR.

In current MJAPI deployments the per-request providers are configured with
`loadMetadata=false` ([`context.ts:384`](../packages/MJServer/src/context.ts#L384)),
so they reuse the global provider's in-memory metadata tree. Functionally the
per-request and global `Entities` arrays point at the same data today. Using
the per-request provider is the **forward-compatible spirit-of-the-rule choice**
without changing today's behavior.

### Output shape change is silent

The existing line at `context.ts:345` emits keys `operationName` and `variables`.
The new middleware emits `operation` and `args`. Anyone grepping logs for the
old key names will not find the new lines. Documented in the PR description so
operators with log-grep automation know to update their patterns. Probably fine
for a dev-facing log; flagged here to prevent surprise.

### Hot-path cost

When `logVariables=false` (production default), the middleware does a single
boolean check before calling `next()`. Effectively zero cost. With
`logVariables=true`, the per-resolver overhead is one metadata lookup + an object
walk + a `console.dir` — milliseconds, dominated by I/O, fine for dev.

## What each change actually fixes (summary table)

| Surface | Fix |
|---|---|
| `context.ts:327` boundary echo, default config (the original incident's leak) | **Change 1a** — `buildBoundaryLogPayload` with `logVariables=false` returns `{ operationName }` only. `variables` key absent. |
| `context.ts:327` boundary echo, verbose mode (`logVariables=true`) | **Change 1b** — structure-only variables block via `describeStructure`. Field names and array lengths visible; no literal values. |
| Verbose-echo path in dev when `logVariables=true`, on entity-bound CRUD inputs (per-resolver) | Metadata-driven redaction (module 1) via `variablesLoggingMiddleware` |
| Verbose-echo path in dev when `logVariables=true`, on custom resolvers (per-resolver) | `@NoLog` discipline (module 2) + verbose-mode-gated boot audit (module 4) |
| `GetDataResolver.ts:121` `LogStatus(JSON.stringify(input))` | Edit to summary line + `@NoLog` on `Token` field |
| `MCPResolver.ts:771` tool-args dump | Gate behind `logVariables`; drop `.substring(0, 200)` |

**Honest framing**: metadata redaction does not, by itself, fix the original
incident's `VoiceTestHubSpotCredential` leak. That leak is fixed by change 1
(default-off variables logging) combined with `@NoLog` discipline (for when
verbose mode is intentionally enabled). The "no drift" benefit applies only to
entity-field secrets — drift on custom-resolver args is still managed manually
via `@NoLog`, just as the rejected keyword approach would have required manual
per-field maintenance.

## Two sources of "this field is sensitive"

`EntityFieldInfo.Encrypt=true` (entity-driven, generated, automatic) and
`@NoLog` (decorator-driven, manual, custom-resolver-only) cover different
surfaces. Resolver-authoring docs should clarify that **metadata-covered fields
do not need `@NoLog`** — applying it is harmless but redundant. `@NoLog` is
specifically for arguments that the redactor cannot identify via metadata:
custom-resolver parameters, MCP tool args, fields on input types that don't
map to a known entity.

## Out of scope (documented decisions, not gaps)

- **Nested-blob leakage** inside non-encrypted entity fields. Metadata cannot
  see into JSON blobs.
- **`RunView.ExtraFilter` strings with literal secrets.** Caller bug, not the
  framework's responsibility.
- **MCP tool args containing secrets in verbose mode.** Tool-author
  responsibility — documented in the same PR.
- **Apollo's error-formatting / introspection paths** with default
  `includeStacktraceInErrorResponses`. In dev (`NODE_ENV !== 'production'`),
  stack traces are included in error responses; a resolver throwing on input
  could echo the input. Out of scope here; flagged for a follow-up hardening
  task.
- **Full multi-provider correctness** (right provider per resolver). Current
  design uses `context.providers[0].provider` — honors the spirit but is not
  truly multi-provider-aware.
- **Unifying `loggingSettings.graphql.logVariables`, `cacheSettings.verboseLogging`,
  and `telemetrySettings.level=verbose` into a single namespace.** Deferred to
  a future configuration-cleanup PR.
- **Treating missing `@NoLog` as a boot error.** Would impose a migration tax
  on every existing custom resolver. The boot audit is a warning, not an
  error.
- **Schema directives (`@sensitive`) or `Secret<T>` wrapper types.** Considered
  as alternatives; rejected in favor of re-using the existing
  `EntityFieldInfo.Encrypt` flag. Valid future extensions if a use case
  emerges that metadata can't cover.

## Verification anchors

The design depends on these load-bearing facts; each has been verified against
the codebase:

- `EntityFieldInfo.Encrypt: boolean` and `EntityInfo.EncryptedFields` — see
  [`entityInfo.ts:758`](../packages/MJCore/src/generic/entityInfo.ts#L758),
  [`entityInfo.ts:1752`](../packages/MJCore/src/generic/entityInfo.ts#L1752).
  Already consumed by `GenericDatabaseProvider`, `EncryptionEngine`,
  `ResolverBase`, `ChangeDetector`, Angular forms.
- `EntityInfo.ClassName` — [`entityInfo.ts:1697`](../packages/MJCore/src/generic/entityInfo.ts#L1697),
  populated from `vwEntities` via migration
  [`V202602190836__v5.2.x__Schema_Based_ClassName_Prefix.sql`](../migrations/v5/V202602190836__v5.2.x__Schema_Based_ClassName_Prefix.sql).
- type-graphql `globalMiddlewares` + `MiddlewareFn` exist in the installed
  v2.0.0-beta.3 — see
  [`build-context.d.ts:27`](../packages/MJServer/node_modules/type-graphql/build/typings/schema/build-context.d.ts#L27).
  **Not currently passed to `buildSchemaSync`** at
  [`index.ts:647-653`](../packages/MJServer/src/index.ts#L647-L653) —
  implementation has to add it.
- Codegen naming convention: 323 `Create*Input` and 323 `Update*Input` classes
  in `packages/MJServer/src/generated/generated.ts`, all following
  `Create<ClassName>Input` / `Update<ClassName>Input`.
- GraphQL field name = DB column name = `EntityFieldInfo.Name`. Confirmed for
  `MJCredential_.Values`, the entity field flagged as
  *"uses MemberJunction field-level encryption."*
- `DatabaseProviderBase.EntityByName` and `.Entities` are per-provider —
  [`providerBase.ts:2796, 2800`](../packages/MJCore/src/generic/providerBase.ts#L2796-L2800).
- type-graphql passes **raw args**, not typed instances, to middleware — see
  [`create.js:13-18`](../packages/MJServer/node_modules/type-graphql/build/cjs/resolvers/create.js#L13-L18)
  and [`helpers.js:9-47`](../packages/MJServer/node_modules/type-graphql/build/cjs/resolvers/helpers.js#L9-L47).
  Middleware uses `info.parentType.getFields()[info.fieldName].args` to derive
  the input type name from the schema.
- Apollo config: no custom `formatError`, no `includeStacktraceInErrorResponses`
  override at
  [`apolloServer/index.ts`](../packages/MJServer/src/apolloServer/index.ts).
  Defaults apply.
- `describeStructure` and `buildBoundaryLogPayload` exist at
  [`packages/MJServer/src/logging/structuralShape.ts`](../packages/MJServer/src/logging/structuralShape.ts).
  Both are pure functions with no MJ dependencies. Tests at
  [`structuralShape.test.ts`](../packages/MJServer/src/__tests__/structuralShape.test.ts)
  (30 cases) and
  [`buildBoundaryLogPayload.test.ts`](../packages/MJServer/src/__tests__/buildBoundaryLogPayload.test.ts)
  (11 cases) pass green. Wiring at
  [`context.ts:327`](../packages/MJServer/src/context.ts#L327) calls
  `buildBoundaryLogPayload`.

## Acceptance signal

Per the original issue and per the ultrareview's clarification:

- **Primary (default config)**: the synthetic repro (`CreateMJCredential`
  with `Values = "FAKE_SECRET_VALUE_DO_NOT_USE"`) must print
  `{ operationName: 'CreateMJCredential' }` with no `variables` field at all
  when MJAPI runs with default env settings.
- **Primary (default config)**: the original incident's resolver
  (`VoiceTestHubSpotCredential(accessToken: String!)`) also produces no
  variables block in default config — closed by change 1a, not by metadata
  redaction.
- **Verbose path — boundary line (`MJ_LOG_GRAPHQL_VARIABLES=true`)**:
  `CreateMJCredential` with `Values = "FAKE_SECRET_VALUE_DO_NOT_USE"` must
  print a `variables` block of structural shape — `Values: '<string>'` (the
  literal `"FAKE_SECRET_VALUE_DO_NOT_USE"` does NOT appear anywhere in
  stdout). Field names and array lengths preserved.
- **Verbose path — per-resolver middleware**: the same flag enables the
  per-resolver redaction middleware, which prints
  `{ operation: 'CreateMJCredential', args: { input: { Values: '<redacted>', ... } } }`
  — entity-aware redaction of the encrypted `Values` field. The
  `VoiceTestHubSpotCredential` resolver must print
  `accessToken: '<redacted>'` only if `@NoLog` was applied to the parameter.
- **Continuity**: the boundary-log operation-name line continues to appear in
  default config (key `operationName`, unchanged from current behavior), so
  that operators retain incoming-request visibility without enabling verbose
  mode.
- **Security invariant (both flag states)**: no literal value from the
  GraphQL variables payload appears in stdout under any configuration.
  Asserted by the structural-shape security tests (5 secret patterns × 2
  flag states = 10 explicit "string not present in output" assertions) plus
  the per-resolver middleware's entity-aware redaction.
