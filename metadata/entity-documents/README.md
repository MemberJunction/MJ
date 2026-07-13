# Entity Documents (seed metadata)

This folder seeds **`MJ: Entity Documents`** — the records that mark an entity as
vectorizable and describe *how* to turn each record into an embedding. The records here are
all **`Search`**-type documents that power semantic / hybrid search via
`Provider.SearchEntity` and the `Search Entity` action.

See the deep docs for the full picture:
- [guides/ENTITY_SEARCH_GUIDE.md](../../guides/ENTITY_SEARCH_GUIDE.md) — the search API + configuration
- [packages/AI/Vectors/Sync/README.md](../../packages/AI/Vectors/Sync/README.md) — the `EntityVectorSyncer` that does the work

## What ships here (standard set)

All on the in-process **`Simple Vector Service Provider`** + **`gte-small (Local)`** embedding
stack — no API key, no per-token cost, runs via Transformers.js:

| Record (`Name`) | Target entity | Template |
|---|---|---|
| `MJ Entities Search` | `MJ: Entities` | `templates/mj-entities-search.njk` |
| `AI Agents Search` | `MJ: AI Agents` | `templates/mj-ai-agents-search.njk` |
| `Actions Search` | `MJ: Actions` | `templates/mj-actions-search.njk` |
| `AI Prompts Search` | `MJ: AI Prompts` | `templates/mj-ai-prompts-search.njk` |
| `AI Models Search` | `MJ: AI Models` | `templates/mj-ai-models-search.njk` |

The seeded **`Entity Vector Sync - Daily`** scheduled job (in
[`../scheduled-jobs/`](../scheduled-jobs/)) runs `Vectorize Entity` with
`EntityDocumentType="Search"` daily (and immediately on first run), embedding every Active
Search document above. With **no** Active Search documents the job is a clean no-op
(`ResultCode: NO_DOCUMENTS`), never a failed run.

## Adding your own

1. Add a record to `.entity-documents.json` with `fields` only — **omit `primaryKey`/`sync`**
   (mj-sync stamps them on first push):

   ```json
   {
     "fields": {
       "Name": "Accounts Search",
       "EntityID": "@lookup:MJ: Entities.Name=Accounts",
       "TypeID": "@lookup:MJ: Entity Document Types.Name=Search",
       "Status": "Active",
       "VectorDatabaseID": "@lookup:MJ: Vector Databases.Name=Simple Vector Service Provider",
       "VectorIndexID": "@lookup:MJ: Vector Indexes.Name=Default - SVS + gte-small (Local)",
       "AIModelID": "@lookup:MJ: AI Models.Name=gte-small (Local)",
       "TemplateText": "@file:templates/accounts-search.njk",
       "PotentialMatchThreshold": 0.7,
       "AbsoluteMatchThreshold": 0.95
     }
   }
   ```

2. Add the `.njk` template under `templates/`. Reference the human-meaningful fields a user
   would actually phrase (including denormalized view fields), not internal IDs:

   ```jinja
   Account: {{ Name }}{% if Industry %} ({{ Industry }}){% endif %}
   {{ Description }}
   ```

3. Push: `npx mj sync push --dir=metadata --include="entity-documents"`.

### Notes

- **`VectorIndexID` is required at runtime** — `VectorizeEntity` throws if it's missing. Use
  the seeded `Default - SVS + gte-small (Local)` index unless you've created your own.
- **`TemplateText` (not `TemplateID`)** is the easy path: the `MJ: Entity Documents` server
  entity auto-creates the backing `Template` + `Template Content` from the `@file:` content
  on push and stamps `TemplateID` for you.
- **`@file:` content is resolved at push time** — editing a `.njk` requires re-running
  `mj sync push`; a server restart alone won't pick it up.
