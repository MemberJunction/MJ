# Naming Conventions Guide

MJ's naming convention is **deliberately inverted from ordinary TypeScript style**. If you have
written TypeScript anywhere else, the rule you already know is the wrong one here.

```typescript
export class MyComponent {
    // Public members — PascalCase. This is the class's API surface.
    @Input() QueryId: string | null = null;
    @Output() EntityLinkClick = new EventEmitter<EntityLinkEvent>();
    public IsLoading = false;
    public LoadData(): void {}
    public get Config(): Config { return this._config; }

    // Private members — camelCase. A leading underscore is fine and idiomatic for backing fields.
    private destroy$ = new Subject<void>();
    private _config: Config;
    private buildColumnDefs(): void {}
    private static readonly PREFS_KEY = 'mj.myFeature.prefs';   // constants stay SCREAMING_SNAKE
}

// Exported symbols — PascalCase.
export function EscapeSQLString(value: string): string {}
export class ConversationEngine {}
export interface IMetadataProvider {}
export type AgentStatus = 'Running' | 'Complete';

// Exported constants — PascalCase or SCREAMING_SNAKE.
export const TERMINAL_STATUSES = ['Complete', 'Failed'] as const;
export const ChatMessageRole = { User: 'user', Assistant: 'assistant' } as const;
```

**Why PascalCase for the public surface:** it matches MJ's generated entity classes, so
`agent.Name` and `myComponent.Name` read the same way whether the object came from CodeGen or was
hand-written. It also gives a reader a reliable visual signal for "this is API, that is
implementation" — and in Angular, the HTML template binding must match the property name, so the
casing is part of the component's contract.

---

## The rules, exactly

| Target | Required shape |
|---|---|
| Public class members — explicit `public` **or no modifier at all** | `PascalCase` (or `SCREAMING_SNAKE` for constants) |
| Public constructor parameter properties — `constructor(public Foo: X)` | `PascalCase` |
| `private` class members and parameter properties | `camelCase`, optionally `_`-prefixed (or `SCREAMING_SNAKE` for constants) |
| `protected` class members and parameter properties | **not enforced** — see below |
| `export function`, and `export const` holding an arrow/function expression | `PascalCase` |
| `export class` / `interface` / `type` / `enum` | `PascalCase` |
| `export const` holding a value, and `export let` / `var` | `PascalCase` or `SCREAMING_SNAKE` |
| Names published through `export { Foo }` | `PascalCase` or `SCREAMING_SNAKE` |
| **Members of an exported `interface`, `type` literal or `enum`** | `PascalCase` (or `SCREAMING_SNAKE`) |
| Members of a **non-exported** interface or type | not enforced — an implementation detail |
| Local variables, function parameters | `camelCase` (not machine-enforced) |

**TypeScript's default visibility is public**, so `isLoading = false` with no modifier is just as
much public API as `public isLoading = false`, and the rule applies to it identically. This is the
single most common source of drift.

### `protected` is deliberately not enforced

MJ's own base classes declare **PascalCase protected extension points**, and subclasses cannot
deviate from the parent's casing:

| Extension point | Declared on | Overridden |
|---|---|---|
| `InternalRunAction` | `BaseAction` | ~300× |
| `InternalExecute` | action/engine bases | ~34× |
| `OnQueryParamsChanged` | `BaseResourceComponent` | ~17× |
| `ProviderToUse` | `BaseEntity` / `BaseEngine` | ~13× |
| `AdditionalLoading` | `BaseEngine` | ~9× |

This is the template-method pattern and it is load-bearing. Enforcing `camelCase` on `protected`
would demand a breaking rename across the Actions framework in exchange for nothing, so the rule
covers `private` only — which has no inheritance contract to honour.

### Exported types: their members are API surface

An exported type's members are as much a published contract as a class's public field — a consumer
writes `params.MaxTokens`, and that property name is the API. So the same PascalCase rule applies to
the members of an exported `interface`, an exported `type` alias's object literals (including nested
ones), and an exported `enum`.

**Only exported types.** A `interface Options` that nobody outside the module can name is an
implementation detail, and the public-API-surface principle the whole convention rests on does not
reach it. That asymmetry is the point, not an inconsistency.

```typescript
export interface ChatParams {
    MaxTokens: number;     // ✅
    topP: number;          // ❌  rename to TopP
}

interface InternalOptions {
    retryCount: number;    // ✅ not exported — not checked
}
```

`interface B extends A` inherits A's names and cannot deviate, so B's matching members are exempt
and the finding lands on A — the one declaration that can lead a rename of the family. The same
holds for a class and the interface it `implements`: the interface is the authority, so one finding
is reported there rather than one on every implementor.

**Wire-format payloads are the honest exception.** An interface mirroring a vendor's JSON
(`access_token`, `output_config`, `stop_reason`) must keep the remote casing. Use the marker:

```typescript
export interface TokenResponse {
    access_token: string;   // case-violation-ok-legacy-back-compat: OAuth wire format
}
```

For a whole file of them, `allowedPrefixes` in `.mj-standards.json` is less noisy than 40 markers.

---

## The CI gate

The convention is enforced by the `naming-conventions` check in
[`@memberjunction/standards`](../packages/Standards/README.md), which parses every `.ts` file with
the TypeScript AST — syntax-only, about two seconds for the whole repo.

```bash
pnpm run check:naming        # this check alone
pnpm run check:standards     # every adopted standard, same as CI
```

It runs on every PR via [`.github/workflows/ci-standards.yml`](../.github/workflows/ci-standards.yml).

### Severity says whether a compatible fix exists

The repo had ~29,900 pre-existing violations when the gate landed. A single severity could not
work — but the axis that separates them is **not** which package a finding is in. It is whether the
finding can be fixed *without breaking a consumer*.

**Almost everything can.** A class member, an exported function, an exported const all have a
runtime object that can carry the new name while keeping the old one as a `@deprecated` stub that
delegates to it. Nothing downstream breaks. Those are **`error`** — 18,593 of them, and the build
fails until they are gone.

**Members of an exported data shape cannot.** An interface is erased at compile time, so there is no
carrier and no stub: renaming the member just breaks anyone who names it. Keeping both members does
not rescue it either — making them optional to stay compatible is precisely what destroys the type
safety the interface existed for. Those are **`warn`** — 11,352 of them, visible and counted, but
not something the build can demand.

Two kinds of data-shape member *are* errors, because they have a fix after all:

- the owning type is **not published** from its package's entry point, so no consumer can name it —
  the gate resolves each package's entry from `package.json` and follows its `export *` graph;
- the owning interface is **implemented by a class**, which carries both names like any other class.

To take the type-only break on the remaining 11,352 — renaming them outright and accepting a
`TS2551` for external TypeScript consumers, which MJ's own
[`PUBLISH_NO_BREAK_POLICY.md`](../packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md) permits as a *minor*
— set `enforceTypeMembers: true` in [`.mj-standards.json`](../.mj-standards.json).

### Fixing a finding

Rename the symbol, and leave the old name behind as a deprecated delegating stub:

```typescript
public LoadData(): void { /* the real implementation */ }

/** @deprecated Use {@link LoadData}. */
public loadData(): void { return this.LoadData(); }
```

The gate ignores anything carrying a `@deprecated` tag, so the stub is not itself a violation. It
reports how many findings it suppressed that way, so the exclusion stays visible rather than
becoming a quiet hiding place.

⚠️ **Renaming a public member of an Angular component is not a TypeScript-only edit.** 875 `.html`
files and 336 inline `template:` strings bind to these names; the template must be rewritten in
lockstep or the binding silently breaks at runtime. For `@Input` there is a cheaper route already in
use in `base-forms` — `@Input('oldName') set _deprecatedOldName(v) { this.NewName = v; }` keeps the
old template binding working without touching a single consumer template.

### Reading the output

Both lists are capped at 50 in the terminal; the summary names the heaviest packages so there is
somewhere to start. CI publishes the same text to the job summary and uploads the **complete** list
as a `standards-findings.json` artifact. Locally:

```bash
node packages/Standards/bin/run.js check --json findings.json
```

---

## Exemptions

### Built in — never flagged

These are not style choices; something else owns the name.

| Category | Examples |
|---|---|
| Angular lifecycle hooks | `ngOnInit`, `ngOnDestroy`, `ngOnChanges`, `ngAfterViewInit`, anything `/^ng[A-Z]/` |
| Base-class contracts | any member name declared by a class something in the repo `extends`, plus anything marked `override` |
| oclif commands | on a `*Command` subclass: `run`, `flags`, `args`, `description`, `examples`, `summary`, … |
| `Error` subclasses | `name`, `message`, `stack`, `cause` |
| Platform / protocol | `toJSON`, `toString`, `valueOf`, `transform`, `writeValue`, `registerOnChange`, `setDisabledState`, `connectedCallback`, `render`, `dispose` |
| Framework-bound members | anything carrying `@HostListener` or `@HostBinding` |
| MJ system columns | anything prefixed `__mj_` |
| Constants | `SCREAMING_SNAKE_CASE`, in any visibility |
| Non-identifier names | `[Symbol.iterator]`, computed keys, string-literal keys |

**Base-class contracts are matched by name, not by the `override` keyword.** Only ~8% of real
overrides in MJ carry `override`, because TypeScript does not require it unless
`noImplicitOverride` is on. Matching by name over-exempts slightly — a member that happens to share
a name with an unrelated base class's member — in exchange for not emitting ~1,450 findings nobody
can fix. Note that the **base class's own** camelCase declaration is still flagged: that is the one
line that can lead a rename of the whole family.

### `@deprecated` — the back-compat stub

Anything carrying a `@deprecated` JSDoc tag is exempt, at every kind of declaration. This is what
makes the cleanup possible: the fix for a violating name is to rename it and leave the old one
behind as a deprecated stub, so the old name keeps its old casing *on purpose*, and flagging it
would make the fix itself a violation.

```typescript
/** @deprecated Use {@link EscapeSQLString}. */
export function escapeSqlString(v: string): string { return EscapeSQLString(v); }
```

The check prints how many findings it suppressed this way. Follow MJ's existing format — name the
replacement with `{@link}`, and give **no** removal version: the repo has never used one and
[`PUBLISH_NO_BREAK_POLICY.md`](../packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md) explicitly rejects
"scheduled for deletion in X.Y".

### Per line — the reviewed exception

```typescript
export class SlackPayload {
    public webhook_url: string;   // case-violation-ok-legacy-back-compat: Slack's wire format, not ours to choose
}
```

`// case-violation-ok-legacy-back-compat: <reason>` on the offending line, or the line **directly** above it. One line
only — a wider window lets a suppression drift away from the thing it excuses and outlive the reason
for it. Always give a reason.

### Per repo — config

For a whole class of names a repo legitimately uses, extend the allowlist rather than scattering
markers:

```jsonc
// .mj-standards.json
"naming-conventions": {
  "Severity": "error",
  "Options": {
    "allowedNames": ["legacyThing"],
    "allowedPrefixes": ["wire_"],
    "includeTests": false,
    "enforceTypeMembers": false
  }
}
```

### Not read at all

`node_modules`, `dist`, `build`, `coverage`, `.angular`, `.turbo`, `.claude` (which holds duplicate
worktree checkouts), any `generated/` directory, `*.d.ts`, and — unless `includeTests` is on —
`*.test.ts`, `*.spec.ts` and `__tests__/`. Tests deliberately mimic third-party lowercase APIs.

**Generated code is skipped because the fix belongs in the generator.** `CodeGenLib` emits
`public record!: ...` into the 389 committed files under `core-entity-forms/src/lib/generated/`
from [`angular-codegen.ts`](../packages/CodeGenLib/src/Angular/angular-codegen.ts); editing the
output would be reverted by the next `mj codegen`. Fix the template instead.

---

## Related

- [`.claude/rules/typescript-style.md`](../.claude/rules/typescript-style.md) — the full TypeScript
  style rule, including the no-`any` and decomposition rules
- [`packages/Standards/README.md`](../packages/Standards/README.md) — how the standards framework
  works and how to add a check
- [UI Layering Guide](UI_LAYERING_GUIDE.md) — the other repo-wide architectural standard
