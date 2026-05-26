# PRD: GraphQL variables-logging secret redaction

**Tracking issue**: [MemberJunction/MJ#2638](https://github.com/MemberJunction/MJ/issues/2638)

**Companion design doc** (local-only, not in PR): `plans/graphql-context-log-redact-secrets.md` — contains file/line verification anchors for every load-bearing claim.

**Branch**: `fix/graphql-context-log-redact-secrets`

**PR**: [#2648](https://github.com/MemberJunction/MJ/pull/2648)

**Status**: Implementation complete. Tests + smoke verification pending senior review.

**Revision history**: Initial PRD walked the design tree but framed the new
middleware as the primary defense. Ultrareview pointed out that the actual leak
fix is the **removal of the variables field from the always-on log line at
`context.ts:345`**, and that the middleware is an additive, opt-in verbose
echo with redaction — not the load-bearing defense. The first revision
restructured accordingly. It also revised the boot-audit scope (gated to
verbose mode to avoid alert fatigue), is honest about which leak surface
metadata redaction actually covers (entity-bound CRUD only — the original
incident's custom resolver is covered by `@NoLog` + default-off, not by
metadata), and addressed several smaller points from the review.

A second revision (post-implementation) extends the boundary-line behavior:
the line emits operation-name only in default config (the load-bearing leak
fix), and in verbose mode (`MJ_LOG_GRAPHQL_VARIABLES=true`) emits an
additional **structure-only** variables block — field names, array lengths,
nesting, and type markers (`<string>`, `<number>`, `<Date>`) but never
literal values. Developers retain debug visibility into payload shape without
any plaintext value reaching stdout in any configuration.

---

## Problem Statement

When a MemberJunction-based product saves a credential — e.g. a HubSpot Private
App access token, an OpenAI API key, a webhook secret — the secret travels to
MJAPI as a GraphQL variable. As an MJAPI operator (or anyone with access to
container logs, journald, a cloud log aggregator, or even a `tail -f` session on
a dev machine), I can read that secret in plaintext in stdout. The leak happens
in the framework's request-logging path, before the encrypting layer in
`@memberjunction/credentials` runs.

This is on by default. Every MJ-based product that submits a secret through a
GraphQL variable is affected. Every retained stdout amplifies the damage — each
secret submitted is recoverable from log history for the retention horizon.

The leak was discovered during smoke testing of a HubSpot credential save flow.
The exposed tokens had `crm.objects.contacts.{read,write}` and
`crm.schemas.contacts.write` scopes — full-control credentials for the linked
HubSpot portal. They were rotated immediately; no production data was reached.
The leak surface is the framework, not the downstream product.

**The leak has two distinct surfaces, with different fixes:**

1. The **always-on variables echo in the GraphQL context function** — fires for
   every non-introspection request. This is what produced the original incident.
2. **In-resolver `LogStatus(JSON.stringify(...))` calls** at `GetDataResolver`
   and `MCPResolver` — additional leak sites mechanically similar to the
   primary one.

## Solution

Three changes, in order of importance:

### 1. The actual leak fix — boundary log emits operation-name only by default; structural shape only when verbose.

The line at `context.ts:345` (the one that produced the original incident)
emits **operation name only** in default configuration. No `variables` field
is rendered. This is the primary defense and the one that closes the
synthetic reproduction in #2638 in default config.

When `loggingSettings.graphql.logVariables=true` (env override
`MJ_LOG_GRAPHQL_VARIABLES`, off in every environment by default), the same
line ALSO emits a **structure-only** `variables` block: field names, array
lengths, and nesting are preserved, but every primitive value is replaced
with its type marker (`<string>`, `<number>`, `<Date>`, etc.). Literal
values — secret or not — never reach stdout under any flag, in any
configuration. Developers retain visibility into "which fields the client
sent, in what shape" without ever seeing payload contents.

The boundary-line behavior delegates to a pure helper `buildBoundaryLogPayload`,
which in turn delegates value reduction to `describeStructure`. Both live in
`packages/MJServer/src/logging/structuralShape.ts` and have isolation-testable
coverage (41 tests across both files, including 7 explicit "no literal value
appears in output" security assertions).

### 2. Opt-in verbose echo with redaction (new, additive).

Developers debugging a request locally still want to see what the UI is
sending. For that, a new opt-in echo path is added behind a new flag
(`loggingSettings.graphql.logVariables`, default off; env override
`MJ_LOG_GRAPHQL_VARIABLES`). When on, a new type-graphql middleware emits a
separate, redacted variables block per root resolver call. Redaction is
metadata-driven: for `Create*Input` / `Update*Input` types that map to a known
entity, any top-level key matching an `EntityFieldInfo.Encrypt=true` field is
replaced with `<redacted>` before emission. The "what's encrypted" question is
answered by the in-memory entity metadata that MJ already populates at startup
— no name-matching heuristics, no allowlists to maintain. New encrypted fields
are auto-protected the moment they are added.

### 3. Custom-resolver authors get an opt-out decorator.

Custom resolvers (the original incident's `VoiceTestHubSpotCredential`, MCP
tool invocations, any resolver not generated by codegen) do **not** have
entity-field metadata to consult. **Metadata redaction does not cover them.**
For these, authors mark sensitive arguments with `@NoLog` — both at parameter
level (on a resolver method's `@Arg`) and at field level (on a `@Field()` of
an `@InputType` class). When the verbose echo from change 2 fires, `@NoLog`
markers force `<redacted>`. A verbose-mode-only boot audit (and a one-time
per-process runtime warning) names un-decorated, non-metadata-bound args so
authors find out about gaps without alert fatigue in default config.

### What each change actually fixes

| Surface | Fix |
|---|---|
| `context.ts:345` boundary echo, default config (the original incident's leak) | **Change 1a** — `variables` field absent; operation-name only |
| `context.ts:345` boundary echo, verbose mode (`logVariables=true`) | **Change 1b** — structure-only variables (field names + type markers, no values) |
| Verbose-echo path in dev when `logVariables=true`, on entity-bound CRUD inputs | Change 2 — metadata-driven redaction (per-resolver middleware) |
| Verbose-echo path in dev when `logVariables=true`, on custom resolvers | Change 3 — `@NoLog` discipline + boot audit warning |
| `GetDataResolver.ts:121` `LogStatus(JSON.stringify(input))` | Edit to summary line + `@NoLog` on `Token` field |
| `MCPResolver.ts:771` tool-args dump | Gate behind `logVariables`; drop `.substring(0, 200)` |

**Honest framing**: metadata redaction does not, by itself, fix the original
incident's `VoiceTestHubSpotCredential` leak. That leak is fixed by change 1
(default-off variables logging) combined with change 3 (`@NoLog` discipline
for when verbose mode is intentionally enabled). The "no drift" benefit
applies only to entity-field secrets — drift on custom-resolver args is still
managed manually via `@NoLog`, just as the rejected keyword approach would have
required manual per-field maintenance.

## User Stories

1. As an MJ-based product operator running MJAPI in production, I want the
   framework to not log secret material to stdout by default, so that
   credentials submitted through normal user flows do not leak to container
   logs or cloud log aggregators.

2. As an MJ-based product operator, I want a non-secret operational signal
   (which GraphQL operations are hitting the server) to remain in stdout even
   with secrets stripped, so that I can still answer "is the server receiving
   traffic" and "which mutations are clients calling" without enabling any
   verbose mode.

3. As an MJ developer debugging a request, I want the option to see the
   **structural shape** of variable payloads in stdout locally — field names,
   types, array lengths, nesting — so that I can diagnose "is the right
   field being submitted, with the right type, in the right shape" without
   ever seeing literal values in stdout.

4. As an MJ developer enabling verbose logging locally, I want secrets to still
   be stripped from those logs, so that turning on debugging in a shared dev
   environment does not expose teammates' credentials.

5. As an MJ developer authoring a new entity with an encrypted field, I want
   the framework to start protecting that field's variables-log emission
   automatically as soon as I mark the field `Encrypt=true`, so that I never
   have to remember to also update a logging-redaction allowlist.

6. As an MJ developer authoring a custom resolver that takes a secret argument
   (e.g. a credential-test mutation like the one that triggered #2638), I want
   a decorator I can apply to that argument to ensure it is redacted from
   verbose-mode logs, so that my custom resolver doesn't bypass framework-level
   protections when an operator turns on `logVariables`.

7. As an MJ developer enabling verbose logging locally, I want a boot warning
   when any custom resolver has un-decorated, non-metadata-bound arguments, so
   that I find out about the gap at "turn on verbose mode" time rather than at
   "secret leaked in shared dev environment" time.

8. As an MJ developer running the server with verbose logging enabled, I want a
   one-time warning at the moment a custom-resolver call fires, naming the
   un-decorated arguments, so that I see the gap exactly when I'm staring at
   the log it's about to leak into.

9. As an MJ-based product operator running MJAPI behind a reverse proxy, I want
   the always-on operation-name log to survive even when verbose logging is
   off, so that I retain a minimal incoming-request signal for debugging
   request-path issues.

10. As an MJ developer doing local development, I want the verbose flag exposed
    both as a config-file setting and as an environment variable, so that I
    can flip it for a single session without editing my MJ config.

11. As an operator of an MJ-based product, I want the verbose flag to default
    off in every environment regardless of `NODE_ENV` settings, so that a
    forgotten config change doesn't silently turn the leak back on.

12. As an MJ developer working on the `GetData` resolver, I want a summary
    log line — "GetData invoked: N queries" — when verbose logging is off, so
    that I can still see the resolver fired without dumping arbitrary SQL
    bodies and short-lived access tokens to stdout.

13. As an MJ-based product operator, I want the short-lived access token used
    by the `GetData` resolver to be redacted from logs even in verbose mode, so
    that one-time tokens used in batch / system flows don't leak into stdout.

14. As an MJ developer working on the MCP resolver, I want MCP tool argument
    payloads gated behind the same verbose flag as GraphQL variables, so that
    MCP tool calls don't become a back-channel leak when the GraphQL-side
    redaction is turned on.

15. As an MJ developer authoring an MCP tool that takes a secret as an
    argument, I want clear documentation telling me to use
    credentials-by-reference rather than inline-secret args, so that my tool
    doesn't depend on framework heuristics for protection.

16. As an MJ developer doing CRUD work against an entity I don't fully know, I
    want the redactor to fail-closed in transient bootstrap windows (metadata
    not yet loaded), so that a server starting under load doesn't emit
    plaintext secrets during the first few requests.

17. As an MJ-based product operator running a future multi-provider client
    setup, I want the redactor to consult per-request entity metadata rather
    than the global default, so that the redaction rule remains correct in
    deployments where different providers may diverge. (Note: in this PR the
    redactor uses `context.providers[0].provider`, which honors the multi-provider
    rule's spirit; full multi-provider correctness requires plumbing the right
    provider through context per resolver, which is out of scope here.)

18. As a reviewer reading the synthetic reproduction in the issue, I want the
    canonical repro (a `CreateMJCredential` mutation with
    `Values = "FAKE_SECRET_VALUE_DO_NOT_USE"`) to print no variables block at
    all in default config, and `Values: "<redacted>"` when verbose is enabled,
    so that the acceptance test from the issue is satisfied for entity-bound
    inputs.

19. As a reviewer assessing the actual incident in #2638 (`VoiceTestHubSpot
    Credential(accessToken: String!)`), I want default-off variables logging
    to be the primary fix, so that the original leak is closed without
    depending on whether `@NoLog` was applied. With `logVariables=false` in
    default config, the `accessToken` arg never reaches stdout regardless of
    `@NoLog` status.

20. As an MJ developer reviewing this change later, I want the PRD pinned to
    the branch (the companion design doc with file/line citations stays
    local-only and is not part of the PR), so that a future reader can see why
    the framework adopted metadata-driven redaction instead of keyword
    allowlists.

21. As an MJ developer running the server's unit tests, I want the
    secret-redactor module to be testable in isolation against a mock
    `IMetadataProvider`, so that the redaction rule has dedicated coverage
    that doesn't depend on a real database or a real GraphQL request.

22. As a senior reviewer assessing this PRD, I want to see explicit, named
    edge cases (metadata not loaded, no entity found for an input class,
    RunView inputs, custom-resolver inputs, subscription resolvers) and their
    decided behaviors, so that I can sanity-check the design without
    re-derivation.

23. As a future MJ contributor adding a new subscription resolver, I want
    documented assurance that the variables-logging middleware also covers
    `@Subscription` root resolvers, so that I don't inadvertently bypass the
    redactor.

## Implementation Decisions

### Change 1 (the primary fix) — Boundary log behavior

At `packages/MJServer/src/context.ts:327`, the boundary log call is wrapped
in a flag-aware helper:

```ts
const payload = buildBoundaryLogPayload(
  operationName,
  reqAny.body?.variables,
  configInfo.loggingSettings.graphql.logVariables,
);
console.dir(payload, { depth: null, breakLength: 200 });
```

`buildBoundaryLogPayload` is a pure function:
- `logVariables=false` → `{ operationName }` (no `variables` key at all — the
  load-bearing leak fix; synthetic reproduction in #2638 ceases to leak in
  default configuration).
- `logVariables=true` → `{ operationName, variables: describeStructure(variables) }`
  where `describeStructure` returns a deep type-only mirror of the input
  (field names, array lengths, nesting all preserved; every primitive value
  replaced with its type marker).

Both `buildBoundaryLogPayload` and `describeStructure` live in
`packages/MJServer/src/logging/structuralShape.ts`. Neither has any MJ
dependency surface; both are isolation-testable pure functions. The remaining
modules (below) add an opt-in verbose echo path with metadata-driven
redaction — they are additive, not the leak fix.

### Schema-build pipeline implication

The new middleware below is registered via the `globalMiddlewares` key on
`buildSchemaSync`. That key is **not** present in MJServer's current
`buildSchemaSync` call. Implementation adds it. The interaction with the
existing pipeline (`mergeSchemas` + `requireSystemUserDirective.transformer` +
`publicDirective.transformer` + `mwSchemaTransformers`) is unchanged:
middleware wraps resolver invocation at execution time, while the directive
transformers run at schema-build time. They operate on different layers and
should compose cleanly. The implementer should verify by running the existing
auth-directive tests against the modified schema build.

### Module 1 — Secret-redactor (deep, testable in isolation)

A pure function (no I/O, no logging, no globals) with the signature:

```ts
type RedactionContext = {
  /** GraphQL input type name from the schema, e.g. "CreateMJCredentialInput" */
  inputTypeName: string;
  /** Raw arg value, as plain object/string/array — not type-graphql-converted */
  rawValue: unknown;
  /** Per-request metadata provider */
  provider: IMetadataProvider;
  /** Marker that this arg was decorated @NoLog at parameter level */
  noLogParameter: boolean;
  /** Marker set: field-names with @NoLog applied at field level on the InputType */
  noLogFields: ReadonlySet<string>;
};

function redactArg(ctx: RedactionContext): unknown;
```

Rules (in order):

1. If `noLogParameter`, return `"<redacted>"`.
2. If `provider.Entities.length === 0`, return `"<metadata-not-ready>"`
   (fail-closed, bootstrap window).
3. Try to derive entity class name: strip the regex
   `^(Create|Update)(?<name>.+)Input$` from `inputTypeName`. (Reviewer note:
   `Delete` inputs carry PK + Options only — no encrypted-field values by
   construction. Excluding `Delete` from the regex keeps the rule scoped to
   inputs that can actually contain secrets.) If no match, pass `rawValue`
   through to `shortenForLog`. This is the "custom resolver / unrecognized
   input" fail-open path.
4. Resolve entity via `provider.Entities.find(e => e.ClassName === name)`. If
   no entity found, fail-open (same as step 3).
5. Build the encrypted-field name set: `entity.EncryptedFields.map(f => f.Name)`.
   Walk top-level keys of `rawValue`. For each key matching the encrypted set
   *or* `noLogFields`, replace with `"<redacted>"`. Other keys pass through.

This module has **no MJ-server import surface beyond `IMetadataProvider`**. It
is the testable heart of the feature and the only module that contains the
redaction rule.

**Assumption noted for future-proofing**: this implementation assumes
`EntityFieldInfo.Name === GraphQLFieldName` for input-type fields. True today
for all codegen output (verified across 323 `Create*Input` and 323
`Update*Input` classes). type-graphql allows `@Field({ name: 'overrideName' })`
to rename fields at the GraphQL layer, but MJ codegen does not use this.
If a future downstream consumer renames an encrypted field in GraphQL, the
redactor will miss it. A comment in the module's source should call this out
so a future maintainer doesn't get burned.

### Module 2 — `@NoLog` decorator + reflect-metadata helpers

A single decorator function distinguishing parameter vs property use by arity
at runtime:

- As a `ParameterDecorator`, marks `(target, propertyKey, parameterIndex)`.
- As a `PropertyDecorator`, marks `(target, propertyKey)`.

Two read-side helpers:

- `hasNoLogParameter(resolverClass, methodName, parameterIndex): boolean`
- `getNoLogFields(inputTypeClass): ReadonlySet<string>`

Reflect-metadata key shape: `Symbol('mj:NoLog')`. No coupling to type-graphql's
own metadata storage.

Decorator exported from `@memberjunction/server`.

**Single-name vs two-name trade-off**: TypeScript's decorator arity dispatch
(parameter vs property) is well-established (e.g. NestJS's `@Inject()` does
the same). A single name is more intuitive for custom-resolver authors. The
alternative — `@NoLogParam` + `@NoLogField` sharing a metadata key — is more
explicit but adds an extra import authors must remember. Current direction:
single name with arity dispatch. If the senior prefers two names, it is a
one-line change.

### Module 3 — GraphQL variables-logging middleware (opt-in verbose echo)

A type-graphql `MiddlewareFn` registered in `globalMiddlewares` on
`buildSchemaSync`. **This module is additive — it provides a redacted
verbose-echo path for developers who turn on `logVariables`. It is NOT the
leak fix; change 1 is.**

Behavior:

1. If `info.path.prev !== undefined` (i.e. this is a `@FieldResolver`, not a
   root resolver), call `next()` and return. Root resolvers only (covers
   `@Query`, `@Mutation`, and `@Subscription` resolvers via the same schema —
   see "Subscription path" below).
2. If `loggingSettings.graphql.logVariables === false`, call `next()` and
   return. No log work in default config; effectively zero cost.
3. Otherwise, for each `@Arg` on the root resolver:
   - Read the argument's GraphQL type name from the schema:
     `getNamedType(info.parentType.getFields()[info.fieldName].args[i].type).name`.
   - Build a `RedactionContext` (provider from `context.providers[0].provider`,
     `noLogParameter` / `noLogFields` from module 2).
   - Call module 1's `redactArg(ctx)`.
4. Emit a single log line via `console.dir({ operation, args: redactedArgsMap })`
   with `{ depth: null, breakLength: 200 }`. The key shape is **different from
   the existing line 345 format** (`operationName` → `operation`, `variables` →
   `args`). Anyone grepping logs for the old key names won't find the new
   lines; this is documented in the PR description.
5. Maintain a per-process `Set<string>` of "warned resolver signatures." On
   first call into a resolver whose args contain at least one un-decorated,
   non-metadata-bound `@Arg`, log a one-time warning naming the resolver and
   the suspicious args. Subsequent calls skip the warning.
6. Call `next()`.

**Why this isn't the "primary defense"**: the middleware can only intercept
resolver-execution time. The original leak fires in the GraphQL context
function (`context.ts:345`), which runs **before any resolver**. A middleware
cannot prevent that line from logging variables — only deleting the variables
field from that line can. Hence change 1 is the leak fix; this module
provides a redacted alternative for developers who turn on verbose mode.

**Important verified fact**: in type-graphql v2.0.0-beta.3 (MJ's installed
version), `resolverData.args` passed to a middleware is the raw, plain-object
arg map — *not* a converted typed-instance of the input class. Conversion
happens after the middleware chain unwinds. The middleware therefore derives
the input type name from the schema (via `info`), not from
`args.input.constructor.name`. This was a correction made during the
design-verification pass.

**First-call warning is a developer-discovery aid, not a leak preventer**: the
warning emits as part of the same request that emits the variables block.
First leak still happens; subsequent calls are suppressed. This is acceptable
because (a) the warning only fires when `logVariables=true` (an explicit
operator action), and (b) the warning prompts the author to apply `@NoLog`
before the leak surface broadens. Calling this out in the PRD so reviewers
don't over-claim its protection.

### Subscription path (covered, but explicit)

type-graphql v2's `globalMiddlewares` fire for `@Subscription` resolvers using
the same execution path as queries and mutations. The MJ server registers
subscriptions via `useServer` from `graphql-ws` against the same merged schema
(`packages/MJServer/src/index.ts:670-694`). Since the middleware is bound at
schema-build time, subscription root resolvers are covered automatically. **No
separate wiring is needed for subscriptions, but the implementer should add an
integration test that exercises a subscription with verbose mode on, to lock
this assumption against future type-graphql upgrades.**

### Module 4 — Boot-time audit (verbose-mode-only)

Runs once during server startup, **after** the new `loggingSettings.graphql.logVariables`
flag has been read, but only if it is `true`. Walks the type-graphql resolver
metadata. For each `@Arg` whose declared input type does **not** match
`^(Create|Update).+Input$` *and* whose parameter does not carry `@NoLog`, emit
one warning per such arg:

> Custom resolver `<ClassName>.<methodName>` takes argument `<argName>` (type
> `<TypeName>`) which is not marked `@NoLog`. Verify this argument does not
> carry sensitive material; if it does, apply `@NoLog`. Variables for this
> resolver will be logged in plaintext while `logVariables=true` is active.

The audit is **a warning, not an error**. Boot does not fail.

**Why gated to verbose mode** (revised after ultrareview): an always-on boot
audit would warn on every `id: ID!`, `pagination: PaginationInput`,
`maxRows: Int`, `extraFilter: String`, etc. across the codebase. The vast
majority of `@Arg`s are non-secret. Always-on warnings produce alert fatigue;
real secret warnings would disappear in the noise; developers would tune the
audit out within a sprint. Gating to verbose mode (`logVariables=true`) makes
the audit a *diagnostic for the operator who chose to turn on verbose
logging*, not a startup gate.

In default config (production) the audit does not run at all and produces zero
output.

The reviewer's alternative — add a `@SafeToLog` decorator to explicitly mark
"this arg is fine to log" — was considered. Rejected for now because (a) it
doubles the decorator surface authors need to learn, (b) verbose-mode gating
achieves the signal-to-noise goal more simply. Reconsider if a future
deployment surfaces a need for default-on audit.

### Module 5 — Boundary-log structural shape (deep, testable in isolation)

A pure function (no I/O, no logging, no globals, no MJ-server import surface)
with the signature:

```ts
export function describeStructure(value: unknown, maxDepth?: number): unknown;
export function buildBoundaryLogPayload(
  operationName: string | undefined,
  variables: unknown,
  logVariablesEnabled: boolean,
): { operationName: string | undefined; variables?: unknown };
```

`describeStructure` reduces a value to a "structural shape" — field names,
array lengths, nesting depth — but every primitive value is replaced with a
type marker:

| Input | Output |
|---|---|
| `'FAKE_SECRET'` | `'<string>'` |
| `42` | `'<number>'` |
| `true` | `'<boolean>'` |
| `null` | `null` (preserved — carries structural meaning, no value content) |
| `undefined` | `undefined` (same rationale) |
| `['a', 'b']` | `['<string>', '<string>']` (length preserved) |
| `{ Name: 'X', Values: 'FAKE' }` | `{ Name: '<string>', Values: '<string>' }` |
| `new Date()` | `'<Date>'` (constructor name) |
| `new Foo()` (custom class) | `'<Foo>'` (constructor name) |
| Object beyond `maxDepth` | `'<object>'` (collapses to prevent unbounded log output) |

Default `maxDepth = 5` covers any realistic GraphQL variables shape
(typically 2-3 levels).

`buildBoundaryLogPayload` is the seam between `context.ts` and the structural
shape: branches on the flag, delegates value-substitution to `describeStructure`.
Lives in the same module for cohesion (both are about the boundary-log
contract; both are pure functions with the same testability story).

**The load-bearing security property**: in either flag state, the serialized
form of the returned payload **does not contain any literal value from the
input**. Tested explicitly against 5 different secret patterns (UUID-shaped,
JWT-shaped, API-key-shaped, value-shaped, name-shaped) under both
`logVariables=false` and `logVariables=true`.

### Configuration change

Extend the existing config schema in `MJServer`:

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

### Considered and rejected: unified `loggingSettings` namespace

The reviewer raised: today MJ has `cacheSettings.verboseLogging` and a
`telemetrySettings.level` enum with a `verbose` value. Adding
`loggingSettings.graphql.logVariables` makes three semi-overlapping flags.
The reviewer's alternative: migrate `cacheSettings.verboseLogging` to
`loggingSettings.cache.verbose` and add `loggingSettings.graphql.verbose` —
one root key, two sub-domains.

**Rejected for this PR** because (a) the migration touches every MJ-based
consumer's config file, including downstream products' deployed environments;
(b) the value is purely cosmetic — the new flag works under a separate
namespace today and a future restructure can migrate all three together
without breaking anyone retroactively; (c) telemetry's `verbose` enum is a
different shape (level enum vs boolean) and would need its own design pass to
fold into a unified namespace.

The reviewer's point is well-taken as a future cleanup. A separate
configuration-cleanup PR could unify the namespaces once all three areas have
the same shape — but it should not block the security fix.

### Edits to existing log sites

- **Always-on operation-name log** (`context.ts:345`): the `variables` field
  is removed entirely. This is the primary leak fix (change 1 above). After
  the change, the always-on log is operation-name only.

- **`GetDataResolver`** (line 121): replace `LogStatus(JSON.stringify(input))`
  with a summary line of the form `GetData invoked: N queries`. Apply
  `@NoLog` to the `Token` field on `GetDataInputType` so that even when verbose
  mode is on, the short-lived access token is `<redacted>`.

- **`MCPResolver`** (line 771): gate the args portion of the tool-call log
  behind `logVariables`. Drop the existing `.substring(0, 200)` (truncation is
  not a security control — 44-char HubSpot tokens fit in 200 chars). When the
  gate is off, emit only `MCPResolver: [<ToolName>] tool invoked`. Document
  in the MCP authoring guide that tool args may appear in verbose logs and
  that authors should pass secrets by reference (credentials-by-ID), not
  inline.

- **Audit follow-up commit** (revised after ultrareview): rather than the
  hand-wavy "grep `LogStatus(.*JSON.stringify` and apply the same treatment,"
  the implementer enumerates **the specific call sites the commit touches**
  in the implementation PR description. The criterion is: any `LogStatus` /
  `console.log` call that emits user-supplied content (resolver inputs, MCP
  arguments, GraphQL variables) gets either redacted, gated, or replaced
  with a summary. System-generated diagnostic logs (e.g. "step 4 of 5
  complete") are left alone.

### Decided edge cases

| Case | Behavior |
|---|---|
| Metadata not loaded yet (bootstrap window) | Fail-closed. Emit `<metadata-not-ready>` for the whole arg. The fail-closed branch is brief in normal operation and produces an obvious-to-read placeholder; explicit persistence detection is not implemented (no timer / counter added). |
| Lookup misses (no entity matches stripped class name) | Fail-open. Log as-is via `shortenForLog`. Either a custom resolver (covered by `@NoLog`) or a codegen / build bug. |
| RunView inputs (`RunViewByIDInput`, `RunViewByNameInput`, `RunDynamicViewInput`) | Out of scope for metadata redaction. Filter strings, no entity row data on the wire. Logged as-is under the gate. |
| Apollo error-formatting path | No custom `formatError` configured; defaults don't echo variables in error responses. `includeStacktraceInErrorResponses` is unset → Apollo's default applies (stack traces included outside production via `NODE_ENV !== 'production'` check). In dev, an error thrown from a resolver could echo the input that caused it depending on what the resolver did before throwing. Out of scope to fix in this PR but documented for future hardening. |
| Nested-blob leakage inside a non-encrypted field that wraps an encrypted JSON sub-blob | Out of scope. Metadata cannot see into JSON blobs; authors structuring secrets inside non-encrypted fields are bypassing the encryption pattern. |
| Per-request vs global metadata provider | Module 1 receives `IMetadataProvider` from `context.providers[0].provider`. In current single-server MJAPI deployments, this is functionally equivalent to `Metadata.Provider` (per-request providers reuse global metadata). Honors CLAUDE.md's multi-provider rule in spirit; full multi-provider correctness requires routing the right provider per resolver, which is out of scope here. |
| Subscription resolvers | Covered by the same middleware (same merged schema, same `globalMiddlewares`). An integration test exercising a subscription with verbose mode on locks the assumption. |
| GraphQL field-name override via `@Field({ name: 'x' })` | Not used by codegen today. If a future maintainer renames an encrypted field at the GraphQL layer, the redactor misses it. A code-comment in module 1 calls this out. |

### Why metadata-driven instead of keyword-driven (for entity-bound CRUD)

The original issue proposed keyword matching (`accessToken`, `apiKey`,
`password`, …) as a redaction rule. Rejected on the senior engineer's
recommendation for entity-bound CRUD. Reasoning:

- Keyword lists drift. Every new credential-bearing field name
  (`webhookSecret`, `bearerToken`, custom MJ-product-specific names) requires
  the list to be updated. A new entity added by a downstream consumer that
  uses an un-listed name silently leaks until someone notices.
- MJ already has the source of truth: `EntityFieldInfo.Encrypt = true` on the
  in-memory `EntityInfo`. Already populated at server startup. Already
  consumed by `GenericDatabaseProvider`, `EncryptionEngine`, `ResolverBase`,
  `ChangeDetector`, and Angular forms.

**The trade-off is narrower scope**: metadata-driven redaction protects
**top-level keys on `Create*Input` / `Update*Input` that map to a known
entity.** Custom-resolver args and freeform-string args are out of metadata
scope. For those, `@NoLog` discipline is required — which **is** a manual
allowlist, just per-argument instead of per-field-name. The "no drift"
benefit applies only to entity-field secrets.

## Testing Decisions

### What makes a good test

- **Test external behavior, not implementation details.** The redactor's
  tests should assert "given this entity metadata and these args, the output
  is this redacted object" — not "the function called `EntityByName` with
  these arguments." Implementation can be refactored freely as long as the I/O
  contract holds.
- **No real database, no real GraphQL request.** Unit tests use mock
  `IMetadataProvider` instances with a small fixture of entities (e.g. one
  entity with one encrypted field, one without).
- **Cover the decision tree.** Each branch named in module 1's algorithm
  (`@NoLog` parameter / bootstrap window / regex match / entity lookup match /
  encrypted-field match / fail-open) gets a test asserting the documented
  output.
- **Deterministic.** No timing, no real I/O. Tests should be < 5s per file
  per the existing MJ convention.

### Modules with dedicated tests

- **Module 1 (secret-redactor)**: full coverage of the decision tree above.
  This is the deep module — the only place the redaction rule lives, the only
  place tests need to exhaustively probe.
- **Module 2 (`@NoLog` decorator + helpers)**: three small tests —
  parameter-level marking, field-level marking, "not present → false / empty
  set." Exists to lock the reflect-metadata key shape against accidental
  change.
- **Module 4 (boot-time audit)** (revised after ultrareview): one fixture
  resolver class with a mix of metadata-bound and custom args, some
  `@NoLog`-decorated; assert warnings emitted for the un-decorated custom args
  and suppressed for everything else. Without coverage, the audit can
  silently stop firing on a future type-graphql metadata-shape change and no
  one notices. Cost is low; benefit is "the safety net's existence is
  verified."
- **Module 5 (`describeStructure` + `buildBoundaryLogPayload`)**: 41 tests
  across two files. `structuralShape.test.ts` (30 tests) covers the
  `describeStructure` decision tree — primitives, null/undefined, arrays
  (empty, primitive, mixed, nested), plain objects (empty, nested, with
  null/undefined values), depth cap (default, custom, zero), special types
  (Date, Map, Set, function, class instances), and the security property
  (input values do not appear in output). `buildBoundaryLogPayload.test.ts`
  (11 tests) covers the wiring contract — flag-off returns operation-name
  only, flag-on returns structure-only variables, security property holds
  in both flag states against 5 different secret patterns including
  nested-blob values.
- **Subscription middleware coverage** (revised after ultrareview): one
  integration test exercising a subscription resolver with `logVariables=true`,
  asserting the middleware fires and redaction applies. Locks the assumption
  that subscriptions ride the same execution path.

### Modules without dedicated tests

- **Module 3 (middleware)**: implicitly exercised by module 1's tests (it's a
  thin wrapper that delegates redaction logic to module 1). Brittle to test
  directly because it depends on the `console.dir` output shape. Indirect
  coverage via module 1 is enough.

### Prior art in MJ

Existing patterns in `packages/MJCore/src/__tests__/` use Vitest with mock
`IMetadataProvider` instances (e.g.
`localCacheManager.schemaHash.test.ts` shows the established mock shape).
Module 1's tests should follow the same pattern.

## Out of Scope

- **Nested-blob leakage** inside non-encrypted fields. Metadata can't see
  into JSON. Authors structuring secrets inside non-encrypted wrappers are
  bypassing the encryption pattern; that's a schema review item.
- **`RunView.ExtraFilter` strings with literal secret values.** Caller bug;
  framework can't catch SQL-fragment-embedded secrets.
- **MCP tool args containing inline secrets in verbose mode.** Documented as
  a tool-author responsibility; credentials-by-reference is the prescribed
  pattern.
- **Apollo's error-formatting path** when `includeStacktraceInErrorResponses`
  is left at default. In dev (`NODE_ENV !== 'production'`), stack traces are
  included in error responses. A resolver throwing on input could echo the
  input. Out of scope here; flagged for a follow-up hardening task.
- **Browser DevTools Network tab.** The user submitting a secret can always
  see their own request body. Not a framework concern.
- **Reverse-proxy access logs in front of MJAPI.** If a deployment logs
  request bodies at the proxy, that's an operational config issue.
- **Downstream-resolver authors logging secrets in their own `LogStatus`
  calls.** Framework-level redaction can't catch arbitrary custom-resolver
  logging mistakes. Documented in the MCP authoring guide note plus the
  general `@NoLog` documentation.
- **Schema directives (`@sensitive`) or `Secret<T>` wrapper types.**
  Considered as alternatives to the metadata-driven approach; rejected in
  favor of re-using the existing `EntityFieldInfo.Encrypt` flag. Valid future
  extensions.
- **Treating missing `@NoLog` as a boot error.** Considered; rejected because
  it would impose a migration tax on every existing custom resolver and break
  downstream consumers' builds at upgrade time.
- **Full multi-provider correctness** (right provider per resolver). The
  current design uses `context.providers[0].provider`, which honors the
  multi-provider rule's spirit (per-request instead of global) but is not
  truly multi-provider-aware. Out of scope for this PR; a future
  multi-provider router would address it across the whole resolver layer.
- **Unifying `loggingSettings.graphql.logVariables`, `cacheSettings.verbose
  Logging`, and `telemetrySettings.level=verbose` into a single namespace.**
  Considered; rejected as a cosmetic change that touches every MJ-based
  consumer's config. Defer to a future configuration-cleanup PR.

## Further Notes

### Two sources of "this field is sensitive"

`EntityFieldInfo.Encrypt=true` (entity-driven, generated, automatic) and
`@NoLog` (decorator-driven, manual, custom-resolver-only) cover different
surfaces. Resolver-authoring docs should clarify that **metadata-covered
fields do not need `@NoLog`** — applying it is harmless but redundant.
`@NoLog` is specifically for arguments that the redactor cannot identify via
metadata: custom-resolver parameters, MCP tool args, fields on input types
that don't map to a known entity.

### Verification summary

The design was verified against the actual code in a follow-up pass after the
initial walkthrough. One implementation-level claim was found wrong and
corrected (typed-instance vs raw args in the middleware — fixed by deriving
the input type name from `info.parentType` instead of from
`args.input.constructor.name`).

All other load-bearing claims (`EntityFieldInfo.Encrypt` exists and is
populated; `EntityInfo.ClassName` is the right join key; `globalMiddlewares`
is a real type-graphql v2.0.0-beta.3 option; codegen naming convention is
stable across 323 `Create*Input` / 323 `Update*Input` classes; GraphQL field
names match `EntityFieldInfo.Name`; `DatabaseProviderBase.EntityByName` is
per-provider) were confirmed in code.

Full verification anchors with file/line citations live in the companion
local-only design doc.

### Open questions for the senior reviewer

1. **Single-name `@NoLog` decorator vs two-name `@NoLogParam` /
   `@NoLogField`**: current direction is single-name with arity dispatch.
   Either is workable; one-line change to switch.

2. **`Delete` in the input-type regex**: currently excluded (delete inputs
   don't carry encrypted values). Acceptable to leave excluded? Note: this
   has user-visible impact on the boot audit — with `Delete` excluded, every
   codegen `DeleteMJ*` resolver flags as "custom" and the audit dumps
   hundreds of false-positive lines when `logVariables=true`. Including
   `Delete` (regex `Create|Update|Delete`) makes the redactor walk the
   top-level keys, find an empty `EncryptedFields` set, and pass through —
   the audit goes quiet on these. Functionally identical for security
   (delete inputs carry PK + Options only, no encrypted values either way);
   the question is purely about audit signal-to-noise.

3. **Unified config namespace** (`loggingSettings.{cache,graphql,telemetry}`):
   currently deferred to a future config-cleanup PR. Acceptable, or do this
   here?

### Acceptance signal

Per the original issue and per the ultrareview's clarification:

- **Primary (default config)**: the synthetic repro (`CreateMJCredential`
  with `Values = "FAKE_SECRET_VALUE_DO_NOT_USE"`) must print
  `{ operationName: 'CreateMJCredential' }` and no `variables` field at all
  when MJAPI runs with default env settings.
- **Primary (default config)**: the original incident's resolver
  (`VoiceTestHubSpotCredential(accessToken: String!)`) also produces no
  variables block in default config — closed by change 1a, not by metadata
  redaction.
- **Verbose path — boundary line (`MJ_LOG_GRAPHQL_VARIABLES=true`)**:
  `CreateMJCredential` with `Values = "FAKE_SECRET_VALUE_DO_NOT_USE"` must
  print a `variables` block containing `Values: '<string>'` (structural shape;
  literal `"FAKE_SECRET_VALUE_DO_NOT_USE"` must NOT appear anywhere in
  stdout). Field names and array lengths are preserved.
- **Verbose path — per-resolver middleware**: the same flag enables the
  per-resolver redaction middleware, which prints
  `{ operation: 'CreateMJCredential', args: { input: { Values: '<redacted>', ... } } }`
  — entity-aware redaction of the encrypted `Values` field, non-encrypted
  values visible. The `VoiceTestHubSpotCredential` resolver must print
  `accessToken: '<redacted>'` only if `@NoLog` was applied to the parameter.
- **Continuity**: the boundary-log operation-name line continues to appear in
  default config (now under the key `operationName`, unchanged from current
  behavior), so that operators retain incoming-request visibility without
  enabling verbose mode.
- **Security invariant (both flag states)**: no literal value from the
  GraphQL variables payload appears in stdout under any configuration.
  Asserted by the structural-shape security tests (5 secret patterns × 2
  flag states = 10 explicit "string not present in output" assertions) and
  by the per-resolver middleware's entity-aware redaction.
