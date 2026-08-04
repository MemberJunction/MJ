# Metadata Files & mj-sync — declarative reference data

For reference data — lookup tables, AI Models, AI Vendors, Application
config, etc. — MJ has a declarative metadata system. You write JSON files
under `metadata/`, run `mj sync push`, and the records land in the
database. It's the idiomatic alternative to `INSERT` statements in
migrations.

## When to use mj-sync vs SQL

| Use mj-sync for | Use SQL migrations for |
|---|---|
| Reference data (statuses, types, categories) | Schema changes (CREATE TABLE, ALTER) |
| AI Models / AI Vendors / AI Configurations | New columns, indexes, constraints |
| Application + nav config | Anything that changes table shape |
| Default Roles, default Users | Stored procs (CodeGen emits these) |
| Seed templates, sample data | Triggers, views, functions |

If it's a **row in a table**, prefer mj-sync. If it's **the shape of the
table itself**, that's a migration.

## Why prefer mj-sync over SQL INSERT

- **Version-controlled, human-readable** — diffs are JSON object changes,
  not opaque SQL strings
- **Idempotent** — `mj sync push` upserts; safe to re-run anywhere
- **`@lookup:` resolves IDs automatically** — you don't need to hardcode
  FK UUIDs that depend on what other rows exist
- **Cross-environment safe** — same file produces the same logical row
  on dev, staging, prod, customer installs
- **Free preview** — `mj sync push --dry-run` shows what would change
- **CodeGen-friendly** — runs alongside CodeGen, doesn't fight it for
  ownership of the same rows

The blanket SQL INSERT for reference data leads to:
- Different IDs on different environments (because timestamps / sequence
  values diverge)
- Conflicts when CodeGen later wants to update the same rows
- No safe re-run on a partially-applied state

## Directory layout

```
metadata/
├── .mj-sync.json                          (top-level config)
├── ai-models/
│   ├── .mj-sync.json                      (per-entity config)
│   └── .ai-models.json                    (the data — JSON array of records)
├── ai-vendors/
│   ├── .mj-sync.json
│   └── .ai-vendors.json
└── applications/
    └── .my-app-application.json
```

Each entity gets its own directory under `metadata/`. A `.mj-sync.json`
in that directory tells mj-sync which entity these files describe and how
to handle conflicts.

## Record file structure

Records are JSON arrays. Each entry has a `fields` object with the column
values:

```json
[
  {
    "fields": {
      "Name": "Production",
      "Description": "Production-grade models",
      "DisplayOrder": 1
    }
  },
  {
    "fields": {
      "Name": "Development",
      "Description": "Dev/test models",
      "DisplayOrder": 2
    }
  }
]
```

On first `push`, mj-sync assigns each record a UUID, writes a `primaryKey`
field back into the source file, and records sync metadata. Don't add
`primaryKey` or `sync` by hand — they appear automatically.

## The four reference syntaxes

mj-sync supports four `@`-prefixed reference forms inside `fields`:

### `@file:relative/path.ext` — embed file contents

```json
{
  "fields": {
    "Name": "User Profile Form",
    "TemplateText": "@file:templates/user-profile.hbs"
  }
}
```

The value is replaced with the file's contents at sync time. Useful for
long Handlebars templates, JSON schemas, or anything multi-line that
would be unreadable inline.

### `@lookup:Entity Name.FieldName=Value` — resolve to another entity's ID

```json
{
  "fields": {
    "Name": "GPT-4 OpenAI",
    "ModelID": "@lookup:AI Models.Name=GPT-4",
    "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI"
  }
}
```

The value is replaced with the ID of the matching record at sync time.
This means you can reference rows that *also* came from mj-sync without
hardcoding UUIDs. The lookup runs after all records of the target entity
are loaded, so order doesn't matter.

If the lookup doesn't find a match, push errors out clearly.

### `@template:relative/path.ext` — same as @file but treated as a template

For template-engine content (Handlebars, Liquid, etc.) where you want the
sync to validate or transform the content before insertion.

### `@parent:FieldName` / `@root:FieldName` — reference enclosing record

For nested / related-record sync structures, lets a child record reference
a field on its parent.

## Workflow

```bash
# 1. Edit JSON under metadata/
vi metadata/ai-models/.ai-models.json

# 2. Preview what would change
mj sync push --dir metadata/ --dry-run

# 3. Apply for real
mj sync push --dir metadata/

# 4. Commit BOTH the source file AND the auto-generated primaryKey/sync fields
git add metadata/ai-models/.ai-models.json
git commit
```

The `primaryKey` and `sync` fields that mj-sync writes back are part of
the record's identity — commit them so other developers (and CI) keep
upserting to the same row.

## Pulling existing data into mj-sync

If you have reference data already in the database that you want to
manage via mj-sync going forward:

```bash
mj sync pull --dir metadata/ --entity 'AI Models'
```

This reads the rows out of the database and writes them as JSON under
`metadata/ai-models/`. Commit the result; from then on, the JSON file is
the source of truth.

## Validation

Before push, mj-sync runs a validation pass:

- Required fields are present
- `@lookup:` references resolve to actual rows
- Field values match their type / value-list constraints
- Foreign keys reference real entities

You can run validation explicitly without pushing:

```bash
mj sync validate --dir metadata/
```

CI typically runs this on every PR that touches `metadata/`.

## The day-1 checklist

- [ ] Reference data goes in `metadata/<entity-dir>/`, not SQL `INSERT`
- [ ] One directory per entity, with `.mj-sync.json` config + data file
- [ ] FK references use `@lookup:` so IDs resolve automatically
- [ ] Long content (templates, schemas) uses `@file:` instead of inline
- [ ] You ran `mj sync push --dry-run` before applying
- [ ] You committed the source file *with* the auto-written `primaryKey` and `sync` blocks
