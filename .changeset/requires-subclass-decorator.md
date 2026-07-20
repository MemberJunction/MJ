---
"@memberjunction/global": patch
"@memberjunction/core": patch
---

Convert the `RequiresSubclass` marker from a static class property to a `@RequiresSubclass()` decorator, and fix an inheritance bug in how it was read.

`@RequiresSubclass()` applies an own, non-enumerable marker (`__mj_RequiresSubclass`) to the class prototype, and `ClassRequiresSubclass(classOrInstance)` reads it via an **own-property** check.

That own-property semantics is the substantive change. The previous `(baseClass as X).RequiresSubclass === true` read walked the constructor prototype chain, so **every subclass of a marked base also reported `true`** — meaning a ClassFactory resolution against a concrete, perfectly instantiable subclass would have wrongly thrown. The marker now applies to exactly the class that declared it.

The decorator also matches the existing `@RegisterClass` idiom, keeps the marker key defined in one place rather than retyped as a literal per base, and centralizes the own-property check so call sites can't get it wrong.

Backward compatible: the legacy `static RequiresSubclass = true` form is still honored (with the same own-property semantics).
