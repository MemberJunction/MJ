---
'@memberjunction/redis-provider': patch
---

CI now runs RedisProvider's integration suites against a real Redis, and fails when they skip.

Those files are gated `describe.skipIf(!REDIS_URL)`, which in CI did not report a gap — it reported
success: every test skipped, the file passed, and the summary looked identical to a real run. The
shared-cache behaviour they pin (index-group pruning, per-category TTL, the key lock, leases) had no
CI coverage as a result.

The unit shards now start a `redis:7-alpine` service with a health check and a per-run key prefix, and
the shard that draws this package runs `.github/scripts/check-redis-suites-ran.mjs`, which re-runs the
gated files and requires a non-zero passed count and zero skipped. The guard discovers the files by
naming convention rather than listing them, so it neither breaks on a file that has not landed yet nor
silently ignores one that has.

No runtime behaviour changes.
