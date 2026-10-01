# Manual test session: two servers, one Redis, one database

A joint pass over the behaviours this branch changed that **no automated tier can see** — two MJAPI
processes sharing a cache, with a real browser attached to one of them. The unit suites and the
deterministic tier already cover the mechanisms in isolation; what is left is whether a change made
on one server reaches the other, and reaches the browser.

**Roles.** You run **API-A** (your `.env`, your usual port) and **MJExplorer** pointed at it.
I run **API-B** on port 14100 against the same database and the same Redis. Where a step says
*(you)* or *(me)*, that is who performs it; most tests are "you act, I observe" or the reverse.

**Everything in this file assumes `mj_test_2`.** That is what your `.env` already points at and what
API-B will use.

**Checked in that database before writing this:** `MJ: AI Models`, `MJ: Users` and `MJ: User Roles`
all carry `TrustServerCacheCompletely = 1`. So by default **neither** the engine sweep nor the
user-cache poll runs for any of them — which is exactly the §26 behaviour test 5 exercises
deliberately, and the reason test 2 proves the event-and-stamp path rather than a timer.

---

## 0. Setup

### 0.1 Shared Redis

Already running on **port 16390** (private to this work — `6379` belongs to another project, do not
use it). Confirm:

```bash
redis-cli -p 16390 ping          # PONG
redis-cli -p 16390 flushdb       # start from an empty keyspace
```

### 0.2 The one setting that must match

Both servers must use the **same key prefix**, or they will share a Redis instance and nothing else.
We will use `mjmanual`.

### 0.3 Edit `mj.config.cjs` FIRST *(you)* — before any server starts

`configInfo` is built at module scope with `cosmiconfigSync` (`MJServer/src/config.ts`), so the file
is read **once, when the process starts**. Nothing watches it; editing a running server changes
nothing until it restarts.

```js
cacheSettings: { engineSweepIntervalSeconds: 15, verboseLogging: true }
```

The sweep defaults to 300 s, too slow to sit through; `verboseLogging` puts both servers' cache
decisions in their logs, which is most of our instrumentation.

Two consequences worth knowing:

- **We share this file.** API-A and API-B run from the same working tree, so your single edit
  configures both — which test 5 needs, because either server may take the sweep lease.
- **`mj.config.cjs` is a local host artifact. Never commit it.**

### 0.4 Start API-A *(you)*

Launch with the Redis variables inline rather than editing your environment file — nothing persists,
and your file stays as it is:

```bash
REDIS_URL=redis://127.0.0.1:16390 REDIS_KEY_PREFIX=mjmanual pnpm run start:api
```

Then start Explorer as you normally do and sign in.

### 0.5 Start API-B *(me)* — after 0.3, so it picks up the same settings

Same database, same Redis, same prefix, port 14100.

### 0.6 A window on the wire *(either of us, recommended)*

Watch every cross-server message as it happens:

```bash
redis-cli -p 16390 PSUBSCRIBE 'mjmanual*'
```

Keep this visible. Several tests below are judged by what does — or does not — appear here.

---

## 1. A change on one server reaches the other

**Why:** the core promise. Nothing else in this file matters if this fails.

| | |
|---|---|
| *(you)* | In Explorer, open any **AI Model** and change its Description to `manual-test-1`. Save. |
| *(me)* | Read the same row through API-B's engine and report what it holds. |
| *(both)* | Watch the `PSUBSCRIBE` window. |

**Pass:** API-B reports the new description within a second or two, having issued **no database
query** for it — the row arrives in the published payload. One message appears on the wire, not one
per field.

**Fail looks like:** API-B still reports the old value after several seconds, or reports the new one
only after a database read (visible in its log).

Then the reverse: *(me)* I change the same row through API-B, *(you)* confirm **Explorer updates
without a refresh**. That leg exercises the server→browser subscription, which only a browser can
test.

---

## 2. A new user can sign in immediately (#4247)

**Why:** this is the bug that motivated the user-cache work — a new user, or a new role grant, was
invisible to every other server until a 180 s timer, and on PostgreSQL never. It is the most
user-visible thing in the branch.

| | |
|---|---|
| *(you)* | In Explorer, create a new User, then grant them a Role. |
| *(me)* | Report what API-B's `UserCache` holds for that user — before and after. |

**Pass:** API-B knows the user **and the role** within a couple of seconds, with no restart. On the
wire you should see one small notice (the user-cache stamp `__MJ_UserCache_Stamp__`), **not** a
payload carrying user rows.

**Second half, the authoritative fallback — optional, and only worth doing if you have a spare
identity to sign in with.** *(me)* I insert a user with raw SQL: no event, no notice, so neither
server's cache can know about them. *(you)* Sign in as that user in a private window. **Pass:** the
sign-in succeeds, because a cache miss falls back to an authoritative read rather than being reported
as "no such user" — the rule the branch adopted, *a hit is an answer, a miss is a question*.

Skip it if arranging an identity is a nuisance. `FindUser`'s fallback is covered by unit tests, and
unlike the first half there is no way to observe it from outside the server process without actually
authenticating — I would rather leave it untested here than stage something that looks like a test.

---

## 3. The CLI clears the fleet's cache when it changes the database — and only then

**Why:** #4083. Four commands, four policies, and the failure mode is silent: servers serving
pre-sync data indefinitely.

Run each *(me, or you if you prefer)* and watch both the wire and both servers' logs:

| Command | Expected |
|---|---|
| `mj cache clear --dry-run` | Reports what it *would* remove. **Nothing** on the wire, nothing removed. |
| `mj cache clear` | Categories cleared; both servers re-check metadata and reload. |
| `mj sync push --dir=<copy of metadata>` with no changes | Succeeds, "no changes" — and **still clears** (a successful push always does). |
| `mj sync push` that fails and rolls back cleanly | **No clear.** Since #4566 an atomic push undoes its own writes, so dropping the fleet's cache would cost a full reload for a run that changed nothing. |
| `mj migrate` with nothing pending | **No clear** — a run that applied no migrations must not disturb the fleet. |

**Pass:** each row behaves as described, and after any real clear, Explorer still shows correct data
(it reloads rather than showing an empty or stale view).

> Use a scratch **copy** of `metadata/` for pushes so repository files stay clean, and
> `MJ_SKIP_SHARED_CACHE_CLEAR=1` when you deliberately want a push *not* to clear.

---

## 4. A bulk write is one notification, not hundreds

**Why:** N11 entity-event batches. Measured in the rig as 100 handler calls → 1 per peer; this
confirms it on a real server with a browser attached.

| | |
|---|---|
| *(you)* | Perform an administrative action that writes many rows in one transaction — enabling **field-level security** on an entity is the canonical one (it writes one permission row per field/role pair, ~84 for `MJ: Employees`). |
| *(both)* | Count messages in the `PSUBSCRIBE` window. |

**Pass:** a small number of messages — one per affected cache slot — not one per row. API-B's log
shows **one** rebuild for the affected engine, not dozens. Explorer stays responsive throughout.

**Fail looks like:** a burst of ~84 messages and a visibly busy browser.

---

## 5. The sweep now runs only where an entity declares it can drift (§26)

**Why:** this is the behaviour *change* most worth seeing with your own eyes, because it is a
deliberate reduction in what MJ does by default — made so a periodic query stops keeping Azure SQL
serverless awake.

**Part A — a trusted entity is not swept.**

| | |
|---|---|
| *(me)* | `UPDATE __mj.AIModel SET Description = 'manual-test-5a' WHERE ID = <id>` — raw SQL, no event. |
| *(both)* | Wait ~30 s (two sweep intervals). |

**Pass:** **neither** server picks the change up, and neither issues a sweep query for it. That is
correct: `MJ: AI Models` carries `TrustServerCacheCompletely = 1`, which declares that every mutation
flows through `BaseEntity.Save()`. We told MJ this cannot happen, so MJ does not pay to check.

**Part B — declare the drift, and it is swept.**

| | |
|---|---|
| *(me)* | `UPDATE __mj.Entity SET TrustServerCacheCompletely = 0 WHERE Name = 'MJ: AI Models'` |
| *(both)* | Restart **both** servers — the flag is read from metadata at boot. |
| *(me)* | Repeat the raw SQL change. |

**Pass:** within one sweep interval (~15 s) both servers hold the new value, **exactly one** of them
performed the reload, and the other adopted its payload. Explorer shows the change without a refresh.

*(me)* I restore the flag to `1` afterwards and confirm.

---

## 6. What is in Redis, and what expires

**Why:** §25.1 and §16.3 — dataset blobs must expire, and the keys that *vouch* for other keys must
expire first or never.

```bash
# dataset blobs and their `_date` proxies
for k in $(redis-cli -p 16390 --scan --pattern 'mjmanual:default:*DATASET*'); do
  echo "$(redis-cli -p 16390 TTL "$k")  $k"
done

# the metadata snapshot
for k in $(redis-cli -p 16390 --scan --pattern 'mjmanual:default:*Metadata_*' | grep -v DATASET); do
  echo "$(redis-cli -p 16390 TTL "$k")  $k"
done
```

**Pass:** every dataset blob has a TTL of ~3600 and its `_date` key a **shorter** one (~3300) — the
proxy must die first, so the cache reads as absent rather than as "fresh, but empty". The metadata
snapshot keys report `-1` (never expire).

---

## 7. A server that starts into a warm cache barely touches the database

**Why:** the startup warm-up lease. Worth seeing because it is what makes a rolling deploy cheap.

| | |
|---|---|
| *(me)* | Restart API-B while API-A keeps running, and report its startup banner. |

**Pass:** API-B's banner shows a **metadata** phase of a few hundred ms and far fewer database calls
than a cold start — it reads metadata and engine data from Redis. In the rig this is 14 queries
against 111.

Optional and more convincing: *(both)* stop **both** servers, `flushdb`, then start them **at the
same time**. Exactly one should do the cold load while the other waits briefly and then loads from
the cache — not both querying.

---

## 8. An expired slot still reaches the fleet (F9, §25.5)

**Why:** the subtlest fix on the branch, and the one I would most like a second pair of eyes on. It
needs a short TTL to observe, so it comes last.

| | |
|---|---|
| *(both)* | Restart both servers with `REDIS_TTL_SECONDS=60` added to the launch line. |
| *(me)* | Confirm API-B boots **warm** — it reads the engine's slot rather than filling it. This is the case that used to be invisible. |
| *(both)* | Wait ~70 s for the slot to expire. Confirm with `redis-cli -p 16390 --scan --pattern 'mjmanual:RunViewCache:*AI Model*'`. |
| *(me)* | Save a change through **API-B** — the server that only ever *read* that slot. |

**Pass:** API-A picks the change up (and Explorer shows it), because API-B still had the fingerprint
and invalidated the vanished slot, publishing a `removed` you can see on the wire.

**Before this fix** that only worked if the saving server was the one that originally *filled* the
slot — which, behind a load balancer, is arbitrary.

---

## Teardown

- *(me)* Restore `TrustServerCacheCompletely = 1` on `MJ: AI Models`; delete any rows we created;
  confirm `mj_test_2` is as we found it.
- *(you)* Revert the `mj.config.cjs` edits (sweep interval, verbose logging) — never commit that file.
- Either: `redis-cli -p 16390 flushdb`.

---

## Recording what we find

I will keep notes against each numbered test as we go and fold the results into
`plans/engine-cache-architecture-plan.md` as §28, in the same form as the automated results: what was
observed, not "it worked". Anything that fails gets a reproduction before a fix.
