---
"@memberjunction/standards": patch
---

Add the `naming-conventions` standard — an AST-based check for MJ's inverted naming convention
(PascalCase public class members and exported symbols, camelCase `private` members).

The rule reaches the whole exported API surface: `export function` / `class` / `interface` / `type` /
`enum` / `const` / `let`, names published through `export { Foo }`, **the members of an exported
interface, type literal or enum**, and public constructor parameter properties. Members of a
non-exported interface are an implementation detail and are not checked. An interface that `extends`
another — or a class that `implements` one — inherits its names, so the finding lands on the
declaring interface rather than on every implementor.

**Severity is derived from whether a compatible fix exists**, not from which package a finding is
in. Anything a `@deprecated` delegating stub can fix — class members, exported functions, consts —
is an `error`. Members of an exported *data shape* are a `warn`: an interface is erased at compile
time, so there is no runtime carrier for a stub and no rename that keeps consumers compiling. Two
kinds of data-shape member are still errors, because they do have a fix: one whose type is not
published from its package's entry point, and one on an interface a class implements.
`enforceTypeMembers` exists for repos willing to take a breaking change to their published types;
it is off here, because renaming a published interface member breaks every consumer that names it
and no stub can carry the old name.

Anything carrying a `@deprecated` JSDoc tag is exempt, so the back-compat stub that fixes a finding
is not itself a violation; the check reports how many findings it suppressed that way. Framework
contracts are exempt automatically — Angular `ng*` lifecycle hooks, oclif command members, `Error`
subclass members, `SCREAMING_SNAKE` constants, `__mj_*` system columns, `@HostListener`/
`@HostBinding`, `$`-sigil names, and any member name declared by a class something in the repo
`extends` or `implements`. Per-line escape hatch:
`// case-violation-ok-legacy-back-compat: <reason>`.

Also adds an optional `Severity` field to `Violation` so one check can mix severities in a single
run — additive, so `ui-layers` behaviour is unchanged — and caps how many findings `FormatSummary`
prints per severity, since a standard adopted against a large codebase is a worklist rather than a
transcript. `mj-standards check --json <file>` writes the complete list for CI to keep.

`typescript` is now an optional peer dependency, used only by this check.
