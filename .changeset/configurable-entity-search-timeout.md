---
"@memberjunction/search-engine": minor
---

Make the entity-search per-entity timeout configurable and lower its default. `EntitySearchProvider`'s hard per-entity fan-out timeout was a `private static readonly PER_ENTITY_TIMEOUT_MS = 30_000`, so a deployment could not tune it. It is now a **public static `PerEntityTimeoutMS`** (default lowered from 30000ms to **3000ms**), mirroring the existing deployment-adjustable `PerEntityFetchDepth` static.

The 3s default keeps interactive/omnibar fan-outs responsive by dropping a pathological entity promptly instead of stalling the whole fan-out. Deployments doing large unindexed LIKE scans that need the old behavior can raise it — either by assigning the static at startup or by overriding the default with an environment variable at process start:

```ts
import { EntitySearchProvider } from '@memberjunction/search-engine';
EntitySearchProvider.PerEntityTimeoutMS = 30_000;
```

```bash
# equivalent env-var override, read once when the module loads
MJ_SEARCH_PER_ENTITY_TIMEOUT_MS=30000
```

All three deployment-adjustable search statics now accept an env-var default override, read once at module load (mirroring the `MJ_INTEGRATION_*` numeric ceilings):

| Static | Environment variable | Default |
|---|---|---|
| `EntitySearchProvider.PerEntityTimeoutMS` | `MJ_SEARCH_PER_ENTITY_TIMEOUT_MS` | `3000` |
| `EntitySearchProvider.PerEntityFetchDepth` | `MJ_SEARCH_PER_ENTITY_FETCH_DEPTH` | `15` |
| `FullTextSearchProvider.PerEntityFetchDepth` | `MJ_SEARCH_FULLTEXT_PER_ENTITY_FETCH_DEPTH` | `15` |

A positive value is floored to an integer. A value that is *present but invalid* (non-numeric or non-positive) falls back to the built-in default and logs a `warning`-severity message so an ops-side typo surfaces at boot; an unset variable is silent.

Behavior change: the per-entity timeout now defaults to 3000ms (was 30000ms). The constant also becomes public and writable (formerly private readonly).
