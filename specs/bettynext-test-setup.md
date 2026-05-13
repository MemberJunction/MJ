# BettyNext — End-to-End Test Setup (Optica Sample Corpus)

This walks through every step to take a freshly migrated local MJ instance and stand
BettyNext up against the 10,001-row Optica sample corpus, end-to-end.

**Assumptions:**

- You're on the `bettyNext` branch with the changes from this session merged in.
- SQL Server is running locally in your dev container at `localhost:1433`,
  database `MJ_5_33_0`, with the creds in `packages/MJAPI/.env`.
- The schema migrations that created `betty.Organization`,
  `betty.Instance`, `betty.PromptComponent`, and `betty.ContentItem`
  have already been applied (i.e. `migrations/v5/V202605121231__...` and
  `migrations/v5/V202605121448__...` already ran during prior dev).
- Pinecone is reachable; the MJ `VectorIndex` row named `tasio-chat-dev`
  exists and maps to your Pinecone index.
- You have the API keys / vendor creds wired in `packages/MJAPI/.env`
  (`AI_VENDOR_API_KEY__VertexLLM`, `AI_VENDOR_API_KEY__OpenAIEmbedding`,
  `AI_VENDOR_API_KEY__PineconeDatabase`, etc).

If any of those aren't true, fix them first — this guide doesn't reproduce
the broader installation.

---

## Step 1 — Configure SQL Full-Text Search (one-time per fresh DB)

Flips the `FullTextSearchEnabled` flag on the two entities and the
`Text` / `Decorator` fields that BettyNext should be able to keyword-search.
CodeGen turns the flags into the actual SQL Server full-text DDL.

```bash
cd /Users/christopherhunnewell/projects/sqlserver-dev/MJ

# Apply the flag flips. Use the Python runner — sqlcmd on macOS often
# resolves `localhost` to ::1 and times out even though the container
# is listening on 127.0.0.1, and the runner uses the same pyodbc path
# that the data importer already exercised.
python3 scripts/run-sql-file.py "SQL Scripts/utilities/betty-content-fti-setup.sql"

# If you'd rather use sqlcmd directly, force IPv4 + a longer login timeout:
#   sqlcmd -S '127.0.0.1,1433' -d MJ_5_33_0 -U sa -P 'DevSqlPwd123ABC' -C -l 30 \
#     -i "SQL Scripts/utilities/betty-content-fti-setup.sql"

# Regenerate CodeGen output (will emit a new CodeGen_Run_*.sql under migrations/v5)
npx mj codegen

# Apply the freshly generated migration (Skyway, not Flyway)
npx mj migrate
```

> `npx mj migrate` is powered by **Skyway** under the hood (the in-house
> Flyway replacement at `@memberjunction/skyway-core`). `mj codegen` does
> **not** apply migrations — it only generates them — so you always run
> `mj migrate` after `mj codegen` produced new SQL.

Sanity-check it worked:

```sql
SELECT e.Name, e.FullTextSearchEnabled AS EntityFTS,
       ef.Name AS Field, ef.FullTextSearchEnabled AS FieldFTS
FROM __mj.Entity e
JOIN __mj.EntityField ef ON ef.EntityID = e.ID
WHERE e.Name IN ('MJ: Content Items', 'Content Items')
  AND ef.Name IN ('Text', 'Decorator')
ORDER BY e.SchemaName, ef.Name;
```

You should see EntityFTS = 1 on both entities and FieldFTS = 1 on the two fields.

---

## Step 2 — Import the Optica sample data

Loads 10,001 rows into `__mj.ContentItem` + `betty.ContentItem` (TPT pair),
creates the `betty.Organization` row, the `__mj.ContentSource` row, and
leaves every row at `EmbeddingStatus = 'Pending'` / `TaggingStatus = 'Pending'`
so the existing pipelines will pick them up.

```bash
cd /Users/christopherhunnewell/projects/sqlserver-dev/MJ

# Optional dry-run / smoke-test first if you want
python3 scripts/import-optica-sample.py --dry-run --limit 50
python3 scripts/import-optica-sample.py --limit 50

# Full import (idempotent — re-runs skip rows already present)
python3 scripts/import-optica-sample.py
```

The script will print a per-batch progress bar and finish with a sanity-count
of rows in each table.

**Important IDs the script writes (hardcoded, deterministic across machines):**

| Object | UUID | Note |
|---|---|---|
| `betty.Organization` for the corpus | `A1B2C3D4-0000-4000-A000-000000000001` | **This is the OrganizationID you'll hand BettyNext as `PrimaryScopeRecordID`.** |
| `__mj.ContentSource` "Optica Sample" | `A1B2C3D4-0001-4000-A000-000000000001` | |

8,877 of the 10,001 rows are chunks of larger documents whose parent rows
weren't in the sample; the importer collapses them to top-level
(`ParentID = NULL`) instead of dropping them, so all 10K rows stay searchable.

> The earlier `SQL Scripts/utilities/betty-content-seed.sql` is now
> **superseded** by this Python importer — leave it alone unless you want
> to keep the synthetic "Betty Test Org" around for something else.

---

## Step 3 — Push the agent / scope / prompt metadata

These were created in the previous session and live under `metadata/`. They
need to be pushed once, after which the database knows about:

- The `Betty Content` search scope (Pinecone + Database Full-Text)
- BettyNext's swap from the generic `Search` action to `Scoped Search`
- The updated system prompt that wires `PrimaryScopeRecordID`

```bash
cd /Users/christopherhunnewell/projects/sqlserver-dev/MJ
npx mj sync push --dir=metadata --include="search-scopes,agents,prompts"
```

Verify after push:

```sql
SELECT a.Name, a.SearchScopeAccess
FROM __mj.AIAgent a
WHERE a.Name = 'BettyNext';                                   -- SearchScopeAccess must be 'Assigned'

SELECT s.Name, ass.Phase, ass.IsDefault
FROM __mj.AIAgentSearchScope ass
JOIN __mj.SearchScope s ON s.ID = ass.SearchScopeID
JOIN __mj.AIAgent a    ON a.ID = ass.AgentID
WHERE a.Name = 'BettyNext';                                   -- expect 'Betty Content' / AgentInvoked / 1

SELECT act.Name
FROM __mj.AIAgentAction aa
JOIN __mj.Action act ON act.ID = aa.ActionID
JOIN __mj.AIAgent a  ON a.ID = aa.AgentID
WHERE a.Name = 'BettyNext';                                   -- expect 'Scoped Search'
```

---

## Step 4 — Vectorize the corpus

10,001 rows are sitting at `EmbeddingStatus = 'Pending'`. Trigger the
existing vectorization pipeline (the one whose status-update bug we fixed
on `fix/embedding-status-update`) to push them through OpenAI embeddings →
Pinecone.

There are two ways to kick this off; pick whichever your environment uses:

**Option A — via the Content Autotagging engine in MJAPI:**

Restart MJAPI (so it picks up the new content rows and the agent / scope
metadata in one go), then trigger the autotag / vectorize flow from MJExplorer
on the `Optica Sample` content source.

```bash
cd /Users/christopherhunnewell/projects/sqlserver-dev/MJ/packages/MJAPI
npm run start          # background task; tail the log for "Embedding ... rows"
```

**Option B — via a one-off Node script if your environment has one:**

Some dev setups have a `scripts/run-content-vectorization.ts` or equivalent
that you can run with `npx ts-node`. Use that if it's wired up — the inputs
are the `ContentSourceID = A1B2C3D4-0001-4000-A000-000000000001` and the
`EmbeddingModelID` matching the `tasio-chat-dev` vector index.

Either way, when it finishes, the breakdown should be:

```sql
SELECT EmbeddingStatus, COUNT(*) FROM __mj.ContentItem
WHERE ContentSourceID = 'A1B2C3D4-0001-4000-A000-000000000001'
GROUP BY EmbeddingStatus;
-- expect: Complete = 10001  (or close — Failed = few is acceptable)
```

Check Pinecone too: vector count in `tasio-chat-dev` should jump by ~10K.

> Tagging (`TaggingStatus = 'Pending'`) can run in parallel or be left
> Pending — BettyNext doesn't depend on tag results for search.

---

## Step 5 — Launch MJAPI + MJExplorer and talk to BettyNext

```bash
# In one terminal
cd /Users/christopherhunnewell/projects/sqlserver-dev/MJ/packages/MJAPI
npm run start

# In a second terminal
cd /Users/christopherhunnewell/projects/sqlserver-dev/MJ/packages/MJExplorer
npm run start
```

Wait for MJAPI to print its listening line and for MJExplorer's Vite dev
server to report compilation success. Then open
<http://localhost:4201>.

### How BettyNext gets the OrganizationID

BettyNext's system prompt reads `{{ data.OrganizationID }}` and tells the
LLM to thread that value into `Scoped Search`'s `PrimaryScopeRecordID` on
every call. **For testing right now, we're getting that conversationally** —
i.e. you tell BettyNext which org you're asking about as part of the chat.

In MJExplorer's conversation UI (or whichever surface you're invoking
BettyNext from), pass the OrganizationID via the agent run's `data` payload.
The hardcoded value for the Optica corpus is:

```
A1B2C3D4-0000-4000-A000-000000000001
```

If you're invoking BettyNext via the GraphQL `RunAIAgent` mutation directly,
include it like:

```graphql
mutation {
  RunAIAgent(input: {
    AgentName: "BettyNext"
    Messages: [{ Role: "user", Content: "What does the Applied Optics paper on radiative cooling using porous TiO say?" }]
    Data: "{\"OrganizationID\":\"A1B2C3D4-0000-4000-A000-000000000001\"}"
  }) { Success Output }
}
```

> When you later add a real conversation surface, the right pattern is for
> that surface to look up the user's OrganizationID server-side and inject
> it as `data.OrganizationID` before invoking the agent — don't trust the
> client to send the right OrgID.

---

## Step 6 — Sanity checks during testing

Run these while talking to BettyNext to confirm it's actually doing what
it claims:

```sql
-- 1) Are the agent's recent Scoped Search calls getting non-zero results?
SELECT TOP 20 ar.StartedAt, ars.ActionName, ars.Status,
       JSON_VALUE(ars.OutputData, '$.TotalCount') AS Hits
FROM __mj.AIAgentRun ar
JOIN __mj.AIAgentRunStep ars ON ars.AIAgentRunID = ar.ID
WHERE ar.AgentName = 'BettyNext'
ORDER BY ar.StartedAt DESC, ars.Sequence;

-- 2) Are searches actually scoped to the Optica org? Look at the rendered
-- ExtraFilter in the agent run log (verbose logging via LogStatusEx
-- writes to MJAPI stdout — grep for "PrimaryScopeRecordID").

-- 3) Did embeddings reach Pinecone? Cross-check vector count vs Complete count.
SELECT COUNT(*) FROM __mj.ContentItem
WHERE ContentSourceID = 'A1B2C3D4-0001-4000-A000-000000000001'
  AND EmbeddingStatus = 'Complete';
```

---

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Scoped Search` returns `ACCESS_DENIED` | BettyNext's `SearchScopeAccess` isn't `Assigned` or the `MJ: AI Agent Search Scopes` row is missing | Re-run Step 3 push and verify with the SQL in that step |
| `Scoped Search` returns 0 results consistently | Either no embeddings landed (Step 4 didn't actually run) **or** the rendered ExtraFilter has a bad OrganizationID — check that `data.OrganizationID` matches the seeded UUID exactly | Step 4 sanity-count; also check MJAPI logs for the rendered filter |
| BettyNext starts answering from memory ("I think the paper says…") | The agent skipped Scoped Search this turn | Verify the system prompt was pushed in Step 3; the rules are explicit but a stale template would let it drift |
| Full-text search leg returns 0 | FT catalog/index not built | Step 1 — confirm CodeGen emitted a `CodeGen_Run_*.sql` containing `CREATE FULLTEXT INDEX ON [betty].[ContentItem] ...` and that you ran `npx mj migrate` after CodeGen |
| Pinecone leg returns cross-tenant results | Known limitation — vectors aren't tagged with OrganizationID metadata yet, so we don't push a Pinecone `MetadataFilter` | For now: single-tenant testing only. To fix later: re-ingest with OrgID in vector metadata, then add `MetadataFilter` to the `Betty Content` scope's external-index row |
| `pyodbc` errors during import | Driver not installed | `brew install msodbcsql18 unixodbc` then re-run |
| `sqlcmd` "Login timeout expired" / `0x102` but SSMS connects fine | sqlcmd is hitting IPv6 (`::1`) and the container only listens on IPv4 | Use `python3 scripts/run-sql-file.py <file.sql>`, or `sqlcmd -S '127.0.0.1,1433' -l 30 ...` |

---

## What's intentionally NOT in this guide

- **Production multi-tenant rollout** — the scope is single-org until vector
  metadata tagging lands.
- **CI / scripted regression tests** — this is a manual dev-loop runbook.
- **Tagging pipeline** — runs in parallel; not required for BettyNext search.
