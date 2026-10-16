# @memberjunction/standards

MemberJunction's engineering standards, as runnable checks — plus the scaffolding that gets a
repository actually enforcing them.

```bash
npx mj-standards adopt --ci github --declare-compliant   # set a repo up
npx mj-standards check                                   # run what it adopted
npx mj-standards list                                    # what exists, and this repo's stance
```

Inside a repo that has the MJ CLI, the same commands are `mj standards adopt` / `check` / `list`.

---

## Why this package exists

MJ has two kinds of standards and they need opposite distribution mechanisms.

**Judgment standards** are prose that has to be read — the guides in the MJ repo. They are
distributed as documentation.

**Executable standards** are the ones a machine can settle. Those are here, versioned like code,
because copy-pasting a check script into each repo stops scaling at about five repos and guarantees
that half of them are running a version from eight months ago.

## The property that makes it safe

> **Adding a standard to this package never changes an existing repository's result.**

Three mechanisms, together:

1. **Opt-in per check.** A check does nothing until a repo's `.mj-standards.json` names it.
   Registration makes a check *available*, not active.
2. **Version-pinned adoption.** Each check declares the MJ version it was introduced in (`Since`).
   Each repo records the version it adopted against (`StandardsVersion`). Checks newer than that
   are reported as available and are **not run** — upgrading this package cannot activate them.
3. **Severity lives in the repo, not the package.** `DefaultSeverity` is what `adopt` writes for a
   *new* adopter. Changing it here never changes a repo that has already adopted. Severity can
   decay forward — `warn` → `error` on a major, by the repo's own choice — and never backward into
   something already shipped.

The result: this package can ship new standards continuously, and a repo pinned on an older MJ
never wakes up to a red build it did not ask for. Adopting a new standard is always a visible,
reviewable commit.

## `.mj-standards.json`

```jsonc
{
  "$schema": "./node_modules/@memberjunction/standards/schema/mj-standards.schema.json",
  "StandardsVersion": "6.0.0",     // what this repo adopted against
  "Checks": {
    "ui-layers": {
      "Severity": "error",          // off | warn | error
      "Roots": ["packages"],
      "Options": {
        // Locked subtrees: an undeclared package HERE is a failure. Everywhere else it is
        // skipped. This is the shape a real migration takes — one tree cleaned and held, the
        // rest still being worked through.
        "requireDeclaredIn": ["packages/Angular"]
      }
    }
  }
}
```

A check absent from `Checks` does not run. A check present but `off` does not run and is not
nagged about — the repo has seen it and said no.

## Commands

### `adopt`

Writes the config, and optionally a CI workflow, an npm script, and the per-package declarations.
**Idempotent and additive**: it never lowers a severity you raised, never overwrites a CI file you
edited, and never bumps `StandardsVersion` without `--upgrade`.

| Flag | |
|---|---|
| `--ci github` | write `.github/workflows/mj-standards.yml` |
| `--declare-compliant` | declare `mjUILayer` on packages that already pass |
| `--upgrade` | enable standards newer than the recorded version, and bump it |
| `--dry-run` | report, write nothing |

**`--declare-compliant` matters more than it looks.** Without it, a fresh adoption produces a
config that enforces nothing: every package is undeclared, so every package is skipped, and the
repo gets a green check that means nothing.

It takes the **strictest** layer each package honestly qualifies for and **never assigns `shell`**.
`shell` checks nothing, so every package passes as `shell` — assigning it would hand a permanent
exemption to exactly the packages that need work. (An earlier version did assign it; a two-package
test repo caught it in the first run, with the deliberately-broken package coming back declared
`shell` and passing.) A package that qualifies for nothing is reported, not declared.

### `check`

Runs the adopted standards. Exit 1 on `error` violations only; `--strict` also fails on warnings —
the flag to turn on once a newly adopted check is clean.

### `list`

Every registered standard, when it was introduced, and what this repo does with it.

## The standards

| Id | Since | What it enforces |
|---|---|---|
| `ui-layers` | 6.0.0 | The four-layer UI architecture — [guide](https://github.com/MemberJunction/MJ/blob/next/guides/UI_LAYERING_GUIDE.md). Widgets may not import `@angular/router` or MJ Explorer, and may not construct a global-provider `RunView`/`Metadata`. Packages opt in with `"mjUILayer"` in their own `package.json`. |
| `naming-conventions` | 6.2.0 | MJ's inverted naming convention — [guide](https://github.com/MemberJunction/MJ/blob/next/guides/NAMING_CONVENTIONS_GUIDE.md). Public class members and the whole exported API surface are PascalCase — including the members of an exported interface, type literal or enum, and public constructor parameter properties; `private` members are camelCase. `protected` is exempt (MJ base classes declare PascalCase extension points). Framework contracts — Angular `ng*` hooks, oclif command members, base-class overrides, SCREAMING_SNAKE constants — are exempt automatically. Severity says whether a compatible fix exists: anything a `@deprecated` delegating stub can fix is an error; members of an exported data shape are a warn, since an interface has no runtime carrier for a stub (`enforceTypeMembers` opts into the type-only break). Anything tagged `@deprecated` is exempt. Marker: `case-violation-ok-legacy-back-compat`. |

## Adding a standard

1. Implement `StandardCheck` in `src/checks/`.
2. Set `Since` to the MJ version it will **ship in**. Never backdate it — that would silently
   activate the check in repos that adopted before it existed.
3. Register it in `src/registry.ts`.
4. Give it a `DocsUrl`. Every failure prints it; a rule whose reasoning is one click away gets
   followed, and one that just says "no" gets worked around.
5. Consider shipping it at `DefaultSeverity: 'warn'` first if it is likely to have a long tail.

## Design notes

**No runtime dependencies.** This gets installed into client repos and run in CI; every dependency
is one more thing that can conflict with their tree. The only non-trivial thing it needed was
semver comparison, which is twenty lines.

The one exception is `typescript`, declared as an **optional peer** for `naming-conventions`, which
needs a real parser: the naming rule turns on visibility modifiers, decorators and heritage clauses,
and a text-matching version of it produces false positives in both directions. Optional-peer rather
than a hard dependency so the host repo pins its own version — any repo with TypeScript source
already has the compiler, and one without it has nothing for that check to read, so it reports a
skip instead of failing to install. Every other check stays dependency-free.

**Severity can vary within one check.** A `Violation` may carry its own `Severity`, overriding the
check's configured one. `naming-conventions` uses it to hard-fail the packages a repo has already
cleaned while only reporting the rest — a rule with a five-figure tail has no usable single
severity, because `error` is unadoptable until the tail is gone and `warn` does nothing to stop it
growing. Omit the field and a finding takes its check's severity, which is what `ui-layers` does.

**Comments are stripped before matching.** MJ source documents itself heavily — a JSDoc block
explaining "this calls `new RunView()` on the global provider" is a comment about a violation, not
a violation. A gate that cannot tell the difference gets switched off.

**Only zero-argument constructors are flagged.** `new RunView(provider)` passes a provider
explicitly and is correct. An earlier, blunter pattern flagged it; false positives are how a gate
loses its authority.

**Reviewed exceptions** use a marker in a comment on the offending line, or the line directly
above it — one line, so a marker cannot drift away from what it excuses. For `ui-layers` the marker
is `mj-ui-layers-allow`.
