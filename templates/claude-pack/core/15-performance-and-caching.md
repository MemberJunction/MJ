# Performance & caching

MJ's server-side cache is one of the framework's nicer surprises. Most of
the performance work you'd otherwise do — batching, deduplication,
freshness handling — is already done for you, *provided* you use the
framework's primitives instead of fighting them.

This file is the user-friendly summary. The deep version
(invalidation semantics, multi-server pub-sub, eviction strategies) lives
in [`guides/CACHING_AND_PUBSUB_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/main/guides/CACHING_AND_PUBSUB_GUIDE.md).

## The mental model

When MJAPI processes a `RunView` or `RunViews` request, it consults an
in-process cache before touching the database. Hits return immediately;
misses run the query and store the result. Writes (`Save()`, `Delete()`)
publish invalidation events that the cache subscribes to.

Three things follow from this:

1. **Repeated identical reads are nearly free.** If you load `Customers`
   once and then again 200 ms later, the second call is a hashmap lookup.

2. **You don't manage cache freshness yourself.** When a `CustomerEntity`
   is saved or deleted, the cache invalidates affected entries
   automatically.

3. **The cache works without you doing anything.** No `CacheLocal: true`
   flag required; the cache check happens by default. You only opt *out*
   when you need to (see `BypassCache` below).

## What gets cached

The server checks the cache on **every** `RunView` and `RunViews` call.
There are two tiers:

| Tier | What it stores | Maintenance strategy |
|---|---|---|
| **Auto-cache** | Small (≤ 250 rows), **unfiltered**, **unsorted** result sets | Upsert on entity change (row added → cache row added; row removed → cache row removed) |
| **General cache** | Everything else (filtered, sorted, joined) | Invalidate on entity change (drop the entry, recompute on next read) |

Why the split:

- **Auto-cache** can be maintained in-place because the framework knows
  the result is "all rows of entity X". When entity X changes, it knows
  exactly how the cached result should change.
- **General cache** entries depend on SQL predicates (`ExtraFilter`,
  `OrderBy`) that the cache can't evaluate in JavaScript, so it drops the
  entry and lets the next read repopulate it.

## What this means for you

- **Small reference-data reads are nearly always cache hits** in steady
  state. AI Models, AI Vendors, Roles, etc. — first load is the only
  real DB query.

- **Filtered or large reads** are cache hits within their lifetime, but
  any save to the underlying entity drops them. That's fine: the next
  read repopulates.

- **You don't need to coordinate cache lifetimes.** Just write code as
  if the cache didn't exist; it'll be fast anyway.

## When to use `BypassCache`

There's a per-call escape hatch:

```typescript
const result = await rv.RunView({
    EntityName: 'Orders',
    ExtraFilter: `Status='Open'`,
    BypassCache: true,
});
```

When `BypassCache: true`:

- Cache lookup is skipped (always hits the DB)
- The cache is **not updated** with the result (no write-through)

Legitimate uses:

- **Scheduled jobs** that run direct SQL outside the framework and need
  to see the post-SQL state
- **Maintenance Actions** that bulk-edit rows through raw queries
- **Forensic / audit queries** that need true DB state regardless of cache freshness
- **Tests** that explicitly want to bypass any cache effects

If you find yourself reaching for `BypassCache` to "make sure the read is
fresh", **don't** — the cache invalidation already handles that for
normal `Save()` / `Delete()` flows. You only need it when you've bypassed
the framework itself.

## Don't query in loops

Repeated. From `03-runview-patterns.md`: the cache makes N+1 fast, but
*one batched query* beats *N cached hits* every time:

- The cache hit still goes through the GraphQL layer (auth, serialization).
- Batched queries `RunViews([...])` go in one round trip.

Even with hot caches, batching wins. The cache is for when batching
genuinely can't be done (e.g. one query depends on the previous result).

## When you actually need to optimize

You won't typically need to. The framework's defaults are good. But if a
specific page or job is slow, the questions to ask in order:

1. **Are you making N round trips when one would do?** Use `RunViews`
   (plural) for independent queries.
2. **Are you querying inside a loop?** Move the query outside; aggregate
   in memory.
3. **Are you using `ResultType: 'entity_object'` when you only need a
   couple fields?** Switch to `'simple'` with `Fields: [...]`.
4. **Is the cache being constantly invalidated by writes?** Look at
   `BaseEntity.Save()` calls happening in tight loops — each one fires
   an invalidation event.
5. **Is the result genuinely huge (10k+ rows)?** Consider whether the
   query can be narrowed with a tighter `ExtraFilter`, or whether
   pagination (`MaxRows` + `StartRow`) is appropriate.

Usually one of 1, 2, or 3 is the answer. Cache tuning (#4, #5) only
becomes the bottleneck once those are handled.

## Server vs client caching

This whole file is about **server-side** caching (MJAPI). There's also a
separate **client-side** cache in `GraphQLDataProvider` for browser
contexts — it caches metadata so the browser doesn't re-fetch entity
definitions on every page load.

The client cache is durable across page reloads (uses IndexedDB). It can
get stale when you switch the backend database, e.g. between SQL Server
and PostgreSQL on the same port (one uppercases UUIDs, the other
lowercases) — **clear the browser cache** when you do that. Otherwise
you don't need to think about it.

## ResultType isn't part of the cache key

A subtle detail worth knowing: the cache **stores plain JSON** regardless
of `ResultType`. When you ask for `'entity_object'`, the framework hits
the cache, gets the JSON, and *then* transforms it into BaseEntity
instances. So `'simple'` and `'entity_object'` share the same cache
entry for identical queries.

This means you can switch between `'simple'` and `'entity_object'` based
on what each call site needs without worrying about cache fragmentation.

## The day-1 checklist

- [ ] You're not adding manual caching layers — the framework already caches
- [ ] If you reached for `BypassCache: true`, you can name the specific
      framework-bypass scenario it's compensating for
- [ ] Independent queries use `RunViews` (plural); dependent queries
      sequence cleanly
- [ ] You're not querying inside a loop (even cached reads aren't free)
- [ ] `'simple'` + `Fields` for read-only paths; `'entity_object'` only
      when mutating

If you can answer "yes" to all of these, you're getting ~95% of the
performance the framework can give you. The remaining 5% is in the
deep-dive guide linked at the top.
