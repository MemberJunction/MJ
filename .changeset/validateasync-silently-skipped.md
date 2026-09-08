---
"@memberjunction/core": patch
---

Fix `ValidateAsync` overrides being silently skipped on save.

`BaseEntity.ValidateAsync` documents itself as *"automatically called by Save() AFTER the
synchronous Validate() passes"*. It was not. `Save()` reached it only when a subclass **also**
overrode `DefaultSkipAsyncValidation` — a separate getter the docstring never mentioned, defaulting
to `true`. An override written against the documentation alone never ran: it reads as enforced,
reviews as enforced, and is not.

The default cannot be justified on cost. The base `ValidateAsync` returns success immediately, so
skipping it saves a subclass that did not override it essentially nothing. The flag's only reachable
effect was therefore to disable the async rules of subclasses that had *written* async rules — which
is how `OrderEntityServer.ValidateAsync`, holding both the "cannot confirm an order with no lines"
guard and an entire per-line validation loop, was dead on every save in production. It is the same
reasoning that already exempts companion validation from the flag.

Overriding `ValidateAsync` is now what turns it on. Precedence, in order of authority:

1. `EntitySaveOptions.SkipAsyncValidation`, when set, wins outright.
2. An explicit `DefaultSkipAsyncValidation` override wins next — **either value**. Stating a policy
   still beats inferring one, so a class that deliberately opts out keeps opting out.
3. Only when no policy is stated is it inferred: run `ValidateAsync` if a subclass overrode it.

Distinguishing "chose `true`" from "never made a choice" is what makes that safe; a getter cannot
express it, so the two are told apart by comparing property descriptors against `BaseEntity.prototype`
(cached per class, handling accessors and methods, and finding overrides anywhere in a multi-level
chain).

**Blast radius in this repo is zero.** All 17 classes overriding `ValidateAsync` were checked: 16
already override `DefaultSkipAsyncValidation` explicitly and so take rule 2 unchanged, and the 17th
is `RelatedRecordCollection`, whose `ValidateAsync(result)` is `EntityCompanion`'s method in a
different hierarchy. CodeGen never emits `ValidateAsync`, so generated classes are unaffected. Full
MJCore suite green: 119 files, 1823 tests.

**Downstream applications should expect a behaviour change**, and it is the intended one: a
`ValidateAsync` that has been quietly dead will start running, and can start refusing saves it was
always written to refuse. Pass `SkipAsyncValidation: true`, or override `DefaultSkipAsyncValidation`
to return `true`, for any case that should stay off.
