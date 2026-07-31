---
"@memberjunction/search-engine": minor
"@memberjunction/server": patch
"@memberjunction/core-actions": patch
---

Make the SearchScope permission resolver replaceable.

`SearchEngine` authorizes every search through `SearchScopePermissionResolver`, which answers from `__mj.SearchScopePermission` rows keyed by `UserID` or by one of the user's MJ Roles. That covers MJ's own permission model completely — but it is not the only shape a permission model can take, and until now it was the only one the search path could consult.

A consumer whose entitlements are neither a user nor an MJ Role has no row that can express them. Its grants are therefore invisible to the check that actually runs, and the failure is silent in the worst way: the grant is configured, an administrator can see it, and the search simply returns nothing. The resolver was a module-level singleton imported directly by `SearchEngine`, so the only remedies were to project the consumer's model into `SearchScopePermission` as derived per-user rows — permission state that can drift from its source — or to fork the search path.

This adds the seam that was missing:

- **`SearchScopePermissionResolverBase`** — the abstract contract registrations bind to.
- **`SEARCH_SCOPE_PERMISSION_RESOLVER_KEY`** — the ClassFactory key. There is exactly one resolver per deployment (a consumer *replaces* the policy rather than selecting among several), so a single shared key with priority ordering is the right shape, and it keeps the registry free of the keyless-registration warning.
- **`GetSearchScopePermissionResolver()`** — returns the highest-priority registration, falling back to MJ's own.

**Every path that authorizes a scope now goes through the seam**, not just `SearchEngine`. This matters more than it sounds: a seam honoured on some paths and not others is worse than no seam, because the resulting behaviour is inconsistent rather than merely absent — the same grant authorizes a search issued one way and silently denies it issued another. The five call sites are `SearchEngine.searchOneScope`, `SearchKnowledgeResolver` (both the single-scope check and the visible-scope-list filter), `SearchKnowledgeStreamResolver`, and the `__Scoped_Search` core action. The last is the agent-facing path, so an override that did not reach it would be invisible to exactly the callers most likely to need it.

Resolution happens per call rather than being cached at module load. A registration made during application startup would otherwise be missed depending on import order — a failure mode that presents as "my resolver works in tests but not in the server", which is expensive to diagnose. The class is stateless and construction is trivial, so there is nothing to gain by caching.

The intended shape for an override is to compose with the stock resolver rather than replace its logic:

```ts
@RegisterClass(SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY, 10)
export class MyResolver extends SearchScopePermissionResolver {
    public override async ResolveEffectivePermission(input: ResolvePermissionInput) {
        const stock = await super.ResolveEffectivePermission(input);
        if (stock.Allowed) return stock;      // never narrow what MJ already granted
        return this.myOwnGrantCheck(input);   // only ever widen
    }
}
```

**Nothing changes for existing consumers.** MJ's resolver registers itself as the default, so behaviour is identical when nothing else is registered. `DefaultSearchScopePermissionResolver` is retained and still exported so existing imports keep compiling; it is marked `@deprecated` because it always yields MJ's own implementation and therefore bypasses any registered override.

The failure posture is unchanged and worth restating for anyone writing an override: `SearchEngine` treats a resolver throw as **denied**, never as allowed. An override that cannot reach its own store must not accidentally open a scope.

7 tests covering the default, the fallback, an honoured registration, late registration (imperative, because `@RegisterClass` evaluates at module load and so cannot demonstrate lateness), composition with `super`, the deprecated constant, and that a subclass of the stock resolver satisfies the base contract.
