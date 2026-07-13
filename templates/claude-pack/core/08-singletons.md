# Singletons — always extend `BaseSingleton<T>`

If a class needs to be a singleton in MJ, it must extend `BaseSingleton<T>`
from `@memberjunction/global`. Rolling your own `static _instance` looks
fine in unit tests and breaks in production for non-obvious reasons.

## The rule

```typescript
// ✅ CORRECT
import { BaseSingleton } from '@memberjunction/global';

export class MyService extends BaseSingleton<MyService> {
    // BaseSingleton requires a protected (or private) constructor
    protected constructor() {
        super();
    }

    // Expose a static accessor that calls the inherited getInstance()
    public static get Instance(): MyService {
        return MyService.getInstance<MyService>();
    }

    public DoThing() { /* ... */ }
}

// Usage:
const s = MyService.Instance;
s.DoThing();
```

```typescript
// ❌ WRONG — looks identical, breaks under code splitting
export class MyService {
    private static _instance: MyService;
    public static get Instance(): MyService {
        if (!MyService._instance) {
            MyService._instance = new MyService();
        }
        return MyService._instance;
    }
}
```

## Why `static _instance` is wrong

Modern bundlers (ESBuild, Vite, Rollup, Webpack) do aggressive code
splitting and inlining. A class can end up *duplicated* in the bundle —
once in chunk A, once in chunk B — when:

- The class is imported from multiple entry points
- Re-exports cross package boundaries
- A monorepo workspace package gets bundled differently in two consumers

Each copy has its own `static _instance` field on its own class
constructor. When two callers go through different copies, you get
**two singletons** — silently, with diverging state. The bug shows up
much later as a desync ("why is the cache empty here when I just wrote
to it over there?").

`BaseSingleton<T>` solves this by storing the instance in a **global
object store** — a single `Map` keyed by class name, attached to
`globalThis`. There's exactly one map across all duplicated copies of
the code, so all callers get the same instance.

## The two-line summary

| Aspect | `BaseSingleton<T>` | Hand-rolled `static _instance` |
|---|---|---|
| One instance per process | Yes, guaranteed | Only when no code duplication |
| Survives bundler quirks | Yes | No |
| Constructor enforcement | Compile error if public | None |
| Boilerplate | ~10 lines | ~6 lines |

The savings on the hand-rolled version aren't worth the production foot­gun.

## Common gotcha: `protected constructor()`

`BaseSingleton<T>` requires a `protected` (or `private`) constructor.
Forgetting this means callers can still do `new MyService()` directly,
which bypasses the singleton and creates an unmanaged instance.

```typescript
export class MyService extends BaseSingleton<MyService> {
    constructor() {  // ❌ public — defeats the singleton
        super();
    }
}

export class MyService extends BaseSingleton<MyService> {
    protected constructor() {  // ✅ enforced singleton access
        super();
    }
}
```

The TypeScript compiler will error if you try to `new MyService()` from
outside the class hierarchy when the constructor is protected.

## When NOT to use a singleton

Singletons are a tool for "exactly one of this thing per process". Common
legitimate uses:

- A connection pool that wraps a shared resource
- A registry that catalogs other singletons (e.g. `ClassFactory`)
- A cache layer that needs cross-call coherence

When in doubt, **don't** make it a singleton. Instead, pass instances as
parameters or store them on whatever context object already exists.
Singletons hide dependencies and make tests painful.

## Provider classes — use `this`, not the global

There's a related pitfall: any class instance that *is* an `IMetadataProvider`
should use its own `this` rather than reaching for the global `Metadata`
singleton. See `02-entity-essentials.md` for the full version. The short
form:

```typescript
// ❌ Inside a class that owns a provider
const md = new Metadata();  // ← global default; wrong in multi-provider setups
md.EntityByName(name);

// ✅ Use the instance's own provider
this.EntityByName(name);   // 'this' IS an IMetadataProvider
```

`Metadata.Provider` / `new Metadata()` always returns the **default** provider.
That's only correct in single-provider apps. Multi-provider clients (a
front-end talking to two MJ servers in parallel) will silently use the wrong
provider if internal code reaches for the global.
