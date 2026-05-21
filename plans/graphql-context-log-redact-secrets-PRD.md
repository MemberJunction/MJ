# PRD: GraphQL variables-logging secret redaction

**Tracking issue**: [MemberJunction/MJ#2638](https://github.com/MemberJunction/MJ/issues/2638)

**Companion design doc**: [`plans/graphql-context-log-redact-secrets.md`](./graphql-context-log-redact-secrets.md)

**Branch**: `fix/graphql-context-log-redact-secrets`

**Status**: Design locked and verified against the code. PRD prepared for senior-engineer review.

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

## Solution

Two layers of defense, both grounded in MJ's existing metadata rather than
in keyword matching:

1. **Variables logging is verbose-only, default off.** The always-on log line
   keeps the operation-name signal — operators can see *which* GraphQL
   operations are hitting the server — but doesn't emit the variables block at
   all in default configuration. Operators turn variables logging on locally
   (via a config flag or environment variable) when they need it.

2. **When variables logging is on, the framework strips secrets automatically.**
   For every CRUD mutation against an entity with `Encrypt=true` fields, the
   matching variable keys are replaced with `<redacted>` before the log line is
   emitted. The "what's encrypted" question is answered by the in-memory entity
   metadata that MJ already populates at startup — no name-matching heuristics,
   no allowlists to maintain.

3. **Custom-resolver authors get an opt-out decorator.** Custom resolvers
   (`VoiceTestHubSpotCredential`, MCP tool invocations, anything not generated
   by codegen) don't have entity-field metadata to consult, so authors mark
   sensitive arguments with `@NoLog`. Forgotten decorators are caught by a
   startup audit that names the suspicious argument and a one-time-per-process
   runtime warning that fires when verbose mode is actually on.

After the fix, the reproduction case from the issue (a `CreateMJCredential`
mutation with a populated `Values` field) produces no variables block at all in
default config, and `Values: "<redacted>"` if the operator turns verbose
variables logging on locally.

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

3. As an MJ developer debugging a request, I want the option to see full
   variable payloads in stdout locally, so that I can inspect what the UI is
   sending without resorting to an external proxy or browser DevTools.

4. As an MJ developer enabling verbose logging locally, I want secrets to still
   be stripped from those logs, so that turning on debugging in a shared dev
   environment does not expose teammates' credentials.

5. As an MJ developer authoring a new entity with an encrypted field, I want
   the framework to start protecting that field's variables-log emission
   automatically as soon as I mark the field `Encrypt=true`, so that I never
   have to remember to also update a logging-redaction allowlist.

6. As an MJ developer authoring a custom resolver that takes a secret argument
   (e.g. a credential-test mutation), I want a decorator I can apply to that
   argument to ensure it is redacted from logs, so that my custom resolver
   doesn't bypass the framework-level protections.

7. As an MJ developer authoring a custom resolver, I want a startup warning
   when I forget to apply the decorator, so that I find out about the gap at
   "run the server" time rather than at "secret leaked in production" time.

8. As an MJ developer running the server with verbose logging enabled, I want
   a one-time warning at the moment a custom-resolver call fires, naming the
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
    multi-tenant or multi-server deployments where different providers may
    diverge.

18. As a reviewer reading the synthetic reproduction in the issue, I want the
    canonical repro (a `CreateMJCredential` mutation with
    `Values = "FAKE_SECRET_VALUE_DO_NOT_USE"`) to print no variables block at
    all in default config, and `Values: "<redacted>"` when verbose is enabled,
    so that the acceptance test from the issue is satisfied.

19. As an MJ developer reviewing this change later, I want the design doc and
    PRD pinned to the branch (not deleted after merge), so that a future reader
    can see why the framework adopted metadata-driven redaction instead of
    keyword allowlists.

20. As an MJ developer running the server's unit tests, I want the
    secret-redactor module to be testable in isolation against a mock
    `IMetadataProvider`, so that the redaction rule has dedicated coverage
    that doesn't depend on a real database or a real GraphQL request.

21. As a senior reviewer assessing this PRD, I want to see explicit, named
    edge cases (metadata not loaded, no entity found for an input class,
    RunView inputs, custom-resolver inputs) and their decided behaviors, so
    that I can sanity-check the design without re-derivation.

## Implementation Decisions

### Module 1 — Secret-redactor (deep, testable in isolation)

A pure function (no I/O, no logging, no globals) with the signature:

```ts
type RedactionContext = {
  /** GraphQL input type name from the schema, e.g. "CreateMJCredentialInput" */
  inputTypeName: string;
  /** Raw arg value, as plain object/string/array — not type-graphql-converted */
  rawValue: unknown;
  /** Per-request metadata provider (honors the multi-provider rule) */
  provider: IMetadataProvider;
  /** Marker that this arg was decorated @NoLog at parameter level */
  noLogParameter: boolean;
  /** Marker map: field-name → @NoLog applied at field level on the InputType */
  noLogFields: ReadonlySet<string>;
};

function redactArg(ctx: RedactionContext): unknown;
```

Rules (in order):

1. If `noLogParameter`, return `"<redacted>"`.
2. If `provider.Entities.length === 0`, return `"<metadata-not-ready>"` (fail-closed,
   bootstrap window).
3. Try to derive entity class name: strip the regex
   `^(Create|Update|Delete)(?<name>.+)Input$` from `inputTypeName`. If no match,
   pass `rawValue` through to `shortenForLog` (existing helper). This is the
   "custom resolver / unrecognized input" fail-open path.
4. Resolve entity via `provider.Entities.find(e => e.ClassName === name)`. If
   no entity found, fail-open (same as step 3).
5. Build the encrypted-field name set: `entity.EncryptedFields.map(f => f.Name)`.
   Walk top-level keys of `rawValue`. For each key matching the encrypted set
   *or* `noLogFields`, replace with `"<redacted>"`. Other keys pass through.

This module has **no MJ-server import surface beyond `IMetadataProvider`**. It
is the testable heart of the feature and the only module that contains the
redaction rule.

### Module 2 — `@NoLog` decorator + reflect-metadata helpers

A single decorator function distinguishing parameter vs property use by arity
at runtime:

- As a `ParameterDecorator`, marks `(target, propertyKey, parameterIndex)`.
- As a `PropertyDecorator`, marks `(target, propertyKey)`.

Two read-side helpers:

- `hasNoLogParameter(resolverClass, methodName, parameterIndex): boolean`
- `getNoLogFields(inputTypeClass): ReadonlySet<string>`

Reflect-metadata key shape: `Symbol('mj:NoLog')`. No coupling to type-graphql's
own metadata storage; reads cleanly without involving type-graphql internals.

Decorator exported from `@memberjunction/server` (co-located with the
middleware that consumes it; same shape as the existing `RequireSystemUser` and
`ResolverBase` exports).

### Module 3 — GraphQL variables-logging middleware

A type-graphql `MiddlewareFn` registered in `globalMiddlewares` on
`buildSchemaSync`.

Behavior:

1. If `info.path.prev !== undefined` (i.e. this is a `@FieldResolver`, not a
   root resolver), call `next()` and return. Root resolvers only.
2. If `loggingSettings.graphql.logVariables === false`, call `next()` and
   return. No log work in default config; effectively zero cost.
3. Otherwise, for each `@Arg` on the root resolver:
   - Read the argument's GraphQL type name from the schema:
     `getNamedType(info.parentType.getFields()[info.fieldName].args[i].type).name`.
   - Build a `RedactionContext` (provider from `context.providers[0].provider`,
     `noLogParameter` / `noLogFields` from module 2).
   - Call module 1's `redactArg(ctx)`.
4. Emit a single log line via `console.dir({ operation, args: redactedArgsMap })`
   with `{ depth: null, breakLength: 200 }` to match the existing format.
5. Maintain a per-process `Set<string>` of "warned resolver signatures." On
   first call into a resolver whose args contain at least one un-decorated,
   non-metadata-bound `@Arg`, log a one-time warning naming the resolver and
   the suspicious args. Subsequent calls skip the warning.
6. Call `next()`.

The middleware is thin — it owns the wiring (which args from the schema, which
flag, which provider, which warning state), but the redaction logic lives in
module 1.

**Important verified fact**: in type-graphql v2.0.0-beta.3 (MJ's installed
version), `resolverData.args` passed to a middleware is the raw, plain-object
arg map — *not* a converted typed-instance of the input class. Conversion to
`new CreateMJCredentialInput()` happens inside `getParams()`, which runs after
the middleware chain unwinds. The middleware therefore derives the input type
name from the schema (via `info`), not from `args.input.constructor.name`. This
was a correction made during the design-verification pass.

### Module 4 — Boot-time audit

Runs once during server startup, after schema build, before HTTP `listen`.

Walks the type-graphql resolver metadata. For each `@Arg` whose declared input
type does **not** match the regex `^(Create|Update|Delete).+Input$` *and* whose
parameter does not carry `@NoLog`, emit one warning per such arg:

> Custom resolver `<ClassName>.<methodName>` takes argument `<argName>` (type
> `<TypeName>`) which is not marked `@NoLog`. Verify this argument does not
> carry sensitive material; if it does, apply `@NoLog`. Variables for this
> resolver will be logged in plaintext when `logVariables=true`.

The audit is **a warning, not an error**. Boot does not fail. Treating missing
`@NoLog` as a hard error would impose a migration tax on every existing custom
resolver and break downstream consumers' builds at upgrade time.

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

`cacheSettings.verboseLogging` is left unchanged. Conflating cache verbosity
and GraphQL verbosity in one flag was considered and rejected — operators who
need one shouldn't be forced to take the other.

### Edits to existing log sites

- **Always-on operation-name log**: keep at its current location in the GraphQL
  context function. Remove the `variables` field from the emitted line. After
  the change, the always-on log is operation-name only — no payload, no risk.

- **`GetDataResolver`**: replace `LogStatus(JSON.stringify(input))` with a
  summary line of the form `GetData invoked: N queries`. Apply `@NoLog` to the
  `Token` field on `GetDataInputType` so that even when verbose mode is on, the
  short-lived access token is `<redacted>`.

- **`MCPResolver`**: gate the args portion of the tool-call log behind
  `logVariables`. Drop the existing `.substring(0, 200)` (truncation is not a
  security control — 44-char HubSpot tokens fit in 200 chars). When the gate is
  off, emit only `MCPResolver: [<ToolName>] tool invoked`. Document in the MCP
  authoring guide that tool args may appear in verbose logs and that authors
  should pass secrets by reference (credentials-by-ID), not inline.

- **Audit follow-up commit**: in the same PR but a separate commit, grep
  `MJServer` for `LogStatus(.*JSON.stringify` and `console.log(.*body` patterns
  and apply the same treatment to any other site that dumps resolver input.

### Decided edge cases

| Case | Behavior |
|---|---|
| Metadata not loaded yet (bootstrap window) | Fail-closed. Emit `<metadata-not-ready>` for the whole arg. One-time warning if it persists past boot. |
| Lookup misses (no entity matches stripped class name) | Fail-open. Log as-is via `shortenForLog`. Either a custom resolver (covered by `@NoLog`) or a codegen / build bug. |
| RunView inputs (`RunViewByIDInput`, `RunViewByNameInput`, `RunDynamicViewInput`) | Out of scope for metadata redaction. Filter strings, no entity row data on the wire. Logged as-is under the gate. |
| Apollo error-formatting path | No change required. Verified: MJ has no custom `formatError`; Apollo defaults don't echo variables in error responses. |
| Nested-blob leakage inside a non-encrypted field that wraps an encrypted JSON sub-blob | Out of scope. Metadata cannot see into JSON blobs; authors structuring secrets inside non-encrypted fields are bypassing the encryption pattern. |
| Per-request vs global metadata provider | Module 1 receives `IMetadataProvider` from `context.providers[0].provider`. In current single-server MJAPI deployments, this is functionally equivalent to `Metadata.Provider` (per-request providers reuse global metadata). The per-request choice honors CLAUDE.md's multi-provider rule and is forward-compatible. |

### Why metadata-driven instead of keyword-driven

The original issue proposed keyword matching (`accessToken`, `apiKey`,
`password`, …) as a redaction rule. Rejected on the senior engineer's
recommendation. Reasoning:

- Keyword lists drift. Every new credential-bearing field name (`webhookSecret`,
  `bearerToken`, `bot_token`, custom MJ-product-specific names) requires the
  list to be updated. A new entity added by a downstream consumer that uses an
  un-listed name silently leaks until someone notices.
- MJ already has the source of truth: `EntityFieldInfo.Encrypt = true` on the
  in-memory `EntityInfo`. Already populated at server startup. Already consumed
  by `GenericDatabaseProvider`, `EncryptionEngine`, `ResolverBase`,
  `ChangeDetector`, and Angular forms. Reading it here re-uses the same single
  flag.

The trade-off is the narrower scope: metadata-driven redaction protects
**top-level keys on `Create*Input` / `Update*Input` that map to a known
entity.** Custom resolvers and freeform-string args are out of metadata scope
and need `@NoLog`. The boot-time audit + first-call warning catch human-error
gaps in that second category.

## Testing Decisions

### What makes a good test

- **Test external behavior, not implementation details.** The redactor's tests
  should assert "given this entity metadata and these args, the output is this
  redacted object" — not "the function called `EntityByName` with these
  arguments." Implementation can be refactored freely as long as the I/O
  contract holds.
- **No real database, no real GraphQL request.** Unit tests use mock
  `IMetadataProvider` instances with a small fixture of entities (e.g. one
  entity with one encrypted field, one without). Faster than integration tests,
  easier to add edge cases.
- **Cover the decision tree.** Each branch named in module 1's algorithm
  (`@NoLog` parameter / bootstrap window / regex match / entity lookup match /
  encrypted-field match / fail-open) gets a test asserting the documented
  output.
- **Deterministic.** No timing, no real I/O. Tests should be < 5s per file per
  the existing MJ convention.

### Modules with dedicated tests

- **Module 1 (secret-redactor)**: full coverage of the decision tree above.
  This is the deep module — the only place the redaction rule lives, the only
  place tests need to exhaustively probe.
- **Module 2 (`@NoLog` decorator + helpers)**: covered with three small tests —
  parameter-level marking, field-level marking, "not present → false / empty
  set." Mostly exists to lock the reflect-metadata key shape against
  accidental change.

### Modules without dedicated tests

- **Module 3 (middleware)**: integration-tested implicitly via existing
  MJServer integration tests if we want, but the *logic worth testing* lives in
  module 1. The middleware is wiring — assertions on `console.dir` output
  shape would be brittle and would duplicate module 1's coverage.
- **Module 4 (boot-time audit)**: same reasoning. The audit is a one-shot scan
  + log; the value of testing it is low compared to the cost.

### Prior art in MJ

Existing patterns in `packages/MJCore/src/__tests__/` and other packages use
Vitest with mock `IMetadataProvider` instances (e.g.
`localCacheManager.schemaHash.test.ts` shows the established mock shape).
Module 1's tests should follow the same pattern: a small inline mock provider,
fixture entities, direct assertions on return values.

## Out of Scope

- **Nested-blob leakage** inside non-encrypted fields. Metadata can't see into
  JSON. Authors structuring secrets inside non-encrypted wrappers are bypassing
  the encryption pattern; that's a schema review item, not a logging-layer
  concern.
- **`RunView.ExtraFilter` strings with literal secret values.** Caller bug;
  framework can't catch SQL-fragment-embedded secrets.
- **MCP tool args containing inline secrets in verbose mode.** Documented as a
  tool-author responsibility; credentials-by-reference is the prescribed
  pattern.
- **Apollo's own error-formatting / introspection paths.** Verified non-leak
  under MJ's current Apollo config (no custom `formatError`, defaults don't
  echo variables in error responses).
- **Browser DevTools Network tab.** The user submitting a secret can always see
  their own request body. Not a framework concern.
- **Reverse-proxy access logs in front of MJAPI.** If a deployment logs request
  bodies at the proxy, that's an operational config issue, not this fix's
  responsibility.
- **Downstream-resolver authors logging secrets in their own `LogStatus`
  calls.** Framework-level redaction can't catch arbitrary custom-resolver
  logging mistakes. Documented in the MCP authoring guide note plus the
  general `@NoLog` documentation.
- **Schema directives (`@sensitive`) or `Secret<T>` wrapper types.** Considered
  as alternatives to the metadata-driven approach; rejected in favor of
  re-using the existing `EntityFieldInfo.Encrypt` flag. These are valid future
  extensions if a use case emerges that metadata can't cover.
- **Treating missing `@NoLog` as a boot error.** Considered; rejected because
  it would impose a migration tax on every existing custom resolver and break
  downstream consumers' builds at upgrade time. Boot-time audit is a warning.

## Further Notes

### Verification summary

The design was verified against the actual code in a follow-up pass after the
initial walkthrough. One implementation-level claim was found wrong and
corrected:

- **Original claim**: the middleware receives a converted, typed input
  instance (`args.input instanceof CreateMJCredentialInput`), so
  `args.input.constructor.name` is the input type name.
- **Reality**: type-graphql v2.0.0-beta.3 passes the raw plain-object args to
  middleware. Conversion to the typed instance happens after the middleware
  chain unwinds.
- **Fix**: derive the input type name from the schema via
  `info.parentType.getFields()[info.fieldName].args[i].type`, not from the
  runtime constructor identity.

All other load-bearing claims (`EntityFieldInfo.Encrypt` exists and is
populated; `EntityInfo.ClassName` is the right join key; `globalMiddlewares` is
a real type-graphql v2.0.0-beta.3 option; codegen naming convention is stable
across 323 `Create*Input` / 323 `Update*Input` classes; GraphQL field names
match `EntityFieldInfo.Name`; `DatabaseProviderBase.EntityByName` is
per-provider) were confirmed in code.

Full verification anchors with file/line citations live in the companion design
doc.

### Question for the senior reviewer

**Module split confirmation**: the design extracts the redaction rule into a
deep, isolation-testable module (module 1 above). The other three pieces
(`@NoLog` decorator, middleware wiring, boot-time audit) are intentionally
thinner — they own integration and wiring rather than rule logic. Does this
split match expectations, or would you prefer a different boundary (e.g.
folding the audit into the middleware, or extracting the schema-introspection
helper as its own module)?

**Test surface confirmation**: the PRD proposes dedicated unit tests for
module 1 only, with modules 2-4 left to integration / manual verification.
Reasoning is that module 1 contains all the decision logic worth testing
exhaustively. Do you want test coverage extended to modules 2 / 3 / 4?

### Acceptance signal

Per the original issue: after the fix, the synthetic repro (a
`CreateMJCredential` mutation with `Values = "FAKE_SECRET_VALUE_DO_NOT_USE"`)
must print no variables block at all when MJAPI runs with default env settings,
and must print `Values: "<redacted>"` when `MJ_LOG_GRAPHQL_VARIABLES=true`.

A second acceptance: the existing always-on operation-name log
(`{ operationName: 'CreateMJCredential' }` or equivalent) must continue to
appear in default config, so that operators retain incoming-request visibility
without enabling verbose mode.
