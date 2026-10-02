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
the TypeScript AST — syntax-only, about 44 seconds for the whole repo on a developer laptop.

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
safety the interface existed for. Those are **`warn`** — 11,421 of them, visible and counted, but
not something the build can demand.

Two kinds of data-shape member *are* errors, because they have a fix after all:

- the owning type is **not published** from any of its package's entry points, so no consumer can
  name it — the gate resolves every entry `package.json` declares (`types`/`main` **and each
  subpath in `exports`**, since `@scope/pkg/forms` is as public as `@scope/pkg`) and follows the
  `export *` graph from each;
- the owning interface is **implemented by a class**, which carries both names like any other class.

**The rest cannot be fixed at all, and that is the end of it.** Renaming a member of a published
interface is a breaking change to the MJ repo's own API — every external consumer naming that
property stops compiling, with no stub able to carry the old name. There is no policy under which
that is a minor.

[`PUBLISH_NO_BREAK_POLICY.md`](../packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md) does **not** license
it: that policy governs **OpenApp schemas**, not this repository's TypeScript surface. Do not read
it as permission to break MJ's own published types.

`enforceTypeMembers: true` therefore exists for a *different repository* to adopt this standard on
its own terms — one whose types are internal, or that is pre-1.0 and willing to take the break. **It
should stay `false` here.** Turning it on in MJ converts ~4,100 unfixable findings into build
failures that no one may act on.

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

### Doing it in bulk

Most findings are the same four or five shapes repeated, so there is a codemod that writes the
rename and the stub for you, one package at a time:

```bash
node packages/Standards/bin/run.js check --json findings.json
node packages/Standards/scripts/naming-codemod.mjs --findings findings.json --package packages/SQLConverter
#   ...then re-run with --apply once the dry run looks right
```

It handles exported functions, `export const fn = () => {}`, class methods, typed class properties
and constructor parameter properties. Alongside each rename it adds the new name to any barrel that
re-exports the old one — otherwise the correct name is never published and nobody can migrate onto
it — and moves the package's **own** call sites across. Consumers in other packages keep using the
deprecated name until their own slice runs, which is what the stub is for.

**It refuses anything it cannot prove equivalent** and prints why, so the residue is a worklist
rather than a silent gap. Decorated members, untyped properties, `get`/`set` pairs, generators,
destructured parameters and overload sets are all left for a human. So are type members — an
interface has no runtime carrier, so no stub exists (above). Run the package's build and tests
afterwards; the codemod is careful, not clairvoyant.

### Angular members

⚠️ **Renaming a public member of an Angular component is not a TypeScript-only edit.** 875 `.html`
files and 336 inline `template:` strings bind these names, and **`tsc --noEmit` does not type-check
templates** — only `ngc` does. A rename that breaks every template in a package still passes a plain
typecheck. Always run the package's real build.

The good news is that a correctly shaped stub keeps templates working untouched, because the old
name survives as a real member. Each binding kind needs its own shape:

**Plain members and methods** — nothing extra. The `@deprecated` getter or delegating method the
stub already adds is what the template reads or calls.

**`@Input`** — a **readable accessor pair**, not just a setter:

```typescript
@Input() IsOpen = false;

/** @deprecated Use {@link IsOpen}. */
@Input() set isOpen(value: MyComponent['IsOpen']) { this.IsOpen = value; }
/** @deprecated Use {@link IsOpen}. */
get isOpen(): MyComponent['IsOpen'] { return this.IsOpen; }
```

A setter alone accepts `[isOpen]="x"` but makes `@if (isOpen)` and `{{ isOpen }}` a compile error,
because a component's own template **reads** its inputs as well as receiving them. `base-forms`'
`@Input('sectionKey') set _deprecatedSectionKey(…)` is write-only and only safe where nothing reads
the old name — which is not something to assume.

**`@Output`** — two outputs sharing **one emitter**:

```typescript
@Output() Saved = new EventEmitter<Thing>();

/** @deprecated Use {@link Saved}. */
@Output() saved = this.Saved;
```

An output cannot be forwarded the way an input can: Angular takes hold of the `EventEmitter` object
itself and subscribes once, so there is no call to intercept. Both names must *be* the same emitter.
The alias **must be declared after** the canonical one — class fields initialise in declaration
order, so reversed it captures `undefined` and Angular throws on subscribe. The pattern is held down
by [`deprecated-output-alias.dom.test.ts`](../packages/Angular/Generic/base-forms/src/lib/deprecated-output-alias.dom.test.ts).

**A class built by name-based deserialization** — the stub keeps *reads* working, but it does not
automatically keep *writes* working, and that asymmetry is easy to miss.

Renaming a field turns the old name from an **own data property** into a **prototype accessor**. Any
loader that decides what to copy with `hasOwnProperty` therefore stops seeing it, and the incoming
value is dropped in silence: no error, no warning, just a field that is suddenly `null`.

MJ hit this for real. The `Entities` table's column is spelled `spCreate`, so every metadata row
arrives under that key; once `EntityInfo.spCreate` became an alias for `SpCreate`, `copyInitData`
skipped it and every entity loaded without its custom routine name. `BaseInfo.copyInitData` now also
accepts a key that resolves to a **settable** accessor on the prototype chain — a read-only getter
has nothing to assign to, and requiring a setter keeps inherited methods out of the copy.

So when you rename a field on a class that is constructed from stored data — a metadata row, a
cached JSON document, an API payload — check that whatever populates it looks past own properties.
The compiler cannot see this one, and neither can the gate.

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
| React lifecycle | `getDerivedStateFromError`, `getDerivedStateFromProps`, `componentDidCatch`, `componentDidMount`, `componentDidUpdate`, `componentWillUnmount`, `shouldComponentUpdate`, `getSnapshotBeforeUpdate`, the `UNSAFE_*` forms, `defaultProps`, `displayName`, `contextType`, `propTypes` |
| Node stream hooks | `_transform`, `_flush`, `_read`, `_write`, `_writev`, `_final`, `_destroy`, `_construct` |
| Framework-bound members | anything carrying `@HostListener` or `@HostBinding` |
| MJ system columns | anything prefixed `__mj_` |
| Constants | `SCREAMING_SNAKE_CASE`, in any visibility |
| Non-identifier names | `[Symbol.iterator]`, computed keys, string-literal keys |

**The two React statics are exempt for a stronger reason than the rest.** React reads
`getDerivedStateFromError` and `getDerivedStateFromProps` off the class into a local and calls
them **unbound** — `var f = fiber.type.getDerivedStateFromError; f(error)`. A `@deprecated` stub
that forwards through `this` therefore does not merely look wrong, it throws; and for the error
boundary it throws while React is already handling a child's error, so the whole tree unmounts.
These are matched by name rather than through the base-class index because a boundary built
against an injected React (`extends (React as any).Component`) has no typed base class to index.

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
replacement with `{@link}`, and give **no** removal version. The repo has never used one, and
promising a deletion date for a name that external consumers depend on is a breaking change with a
countdown attached.

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
