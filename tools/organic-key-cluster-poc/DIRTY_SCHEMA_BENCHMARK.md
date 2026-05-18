# Dirty Schema Benchmark

This benchmark answers the question the AdventureWorks (AW) baseline can't:
**does the cluster-based organic-key detection still work on schemas that aren't pristine?**

AW is well-normalized, consistently named, with declared FKs everywhere. Real client
schemas — especially cross-system integration databases — are not. They have:

- Inconsistent column naming conventions (camelCase / snake_case / abbreviated mixed in one DB)
- Cryptic vendor-style column names (`fld_x`, `col_b`)
- Missing FK declarations (common in legacy schemas)
- Typos that survived QA
- System prefixes from sync pipelines (`mc_contact`, `hs_contact`, `sf_contact`)

The benchmark applies these degradations programmatically to the AW state.json,
runs the detection pipeline against the dirty version, and compares the KEEP
cluster set to the baseline using **member-set Jaccard similarity** (matching on
schema+table — column names diverge by definition).

## Files

| File | Purpose |
|---|---|
| `dirty-schema-generator.mjs` | Takes clean state.json, applies degradations, writes dirty state.json |
| `dirty-schema-compare.mjs`   | Compares baseline vs dirty KEEP sets; emits recall/precision report |

## End-to-end runbook

### 1. Generate dirty variant(s) of AdventureWorks

```bash
# Single-mode degradations (one at a time, easier to diagnose)
node dirty-schema-generator.mjs \
    /path/to/clean-state.json \
    /tmp/dirty-rename.json \
    --modes=inconsistent-naming --seed=42

node dirty-schema-generator.mjs \
    /path/to/clean-state.json \
    /tmp/dirty-no-fks.json \
    --modes=drop-fk-declarations --seed=42

node dirty-schema-generator.mjs \
    /path/to/clean-state.json \
    /tmp/dirty-cryptic.json \
    --modes=cryptic-names --seed=42

# All-mode degradation (stress test)
node dirty-schema-generator.mjs \
    /path/to/clean-state.json \
    /tmp/dirty-all.json \
    --modes=inconsistent-naming,abbreviated-names,cryptic-names,drop-fk-declarations,typo,mixed-systems \
    --seed=42
```

### 2. Run the full organic-key detection pipeline against each variant

This requires `db-auto-doc` with `analysis.organicKeyDetection.enabled = true`
in the config and a valid AI provider. Use the embedding cache to keep cost
constant across variants (descriptors that didn't change reuse cached vectors).

```bash
# Run against baseline
db-auto-doc analyze --resume /path/to/clean-state.json --config ./config.json
# Run against each dirty variant
db-auto-doc analyze --resume /tmp/dirty-rename.json --config ./config.json
# ... etc
```

### 3. Compare each dirty run to baseline

```bash
node dirty-schema-compare.mjs \
    --baseline=/path/to/clean-state.json \
    --degraded=/tmp/dirty-rename.json \
    --out=/tmp/report-rename.md

node dirty-schema-compare.mjs \
    --baseline=/path/to/clean-state.json \
    --degraded=/tmp/dirty-no-fks.json \
    --out=/tmp/report-no-fks.md

# ... etc
```

Each report contains recall (% of baseline KEEPs that survive under degradation),
precision (% of dirty KEEPs that map to baseline KEEPs), per-cluster Jaccard
scores, and false-positive lists.

## Degradation modes

| Mode | What it changes | Typical real-world analog |
|---|---|---|
| `inconsistent-naming` | Each table's columns re-formatted to a random naming convention (PascalCase / snake_case / camelCase / kebab-case). PKs preserved. | Database touched by multiple developers / teams over years |
| `abbreviated-names` | Common tokens compressed via lookup table (BusinessEntity→BE, Transaction→Txn, etc.) with 70% rate | Legacy schemas with column-length limits, vendor abbreviations |
| `cryptic-names` | ~15% of columns renamed to `fld_<base36>` style | Vendor-extended fields, low-code platform exports |
| `drop-fk-declarations` | All `isForeignKey` flags cleared, all `foreignKeyReferences` removed, DBAutoDoc's discovered FK list emptied | Many real client DBs simply don't have declared FKs |
| `typo` | 5% of column names get a single-character adjacent swap | Manual schema authoring, copy-paste mistakes |
| `mixed-systems` | ~30% of tables get system prefixes (`mc_`, `hs_`, `sf_`, `mj_`) | Cross-system integration warehouses, ETL staging |

All degradations are deterministic given a fixed seed.

## What success looks like

Per the original PR #2193 framing, organic keys exist BECAUSE real-world schemas
can't always express their relationships as FKs. The benchmark validates this:

- **inconsistent-naming + drop-fk-declarations** combined is roughly "a schema
  syncing from multiple integration sources." If we maintain >70% recall on
  this combination, the algorithm is doing what it was designed for.

- **mixed-systems** alone validates the cross-system case from the original
  PR. If recall stays high here, the table-prefix system markers don't break
  detection — which is critical because most real organic key opportunities
  ARE cross-system.

- **cryptic-names** is the failure mode we EXPECT to see: when column descriptions
  are also cryptic (because DBAutoDoc generated descriptions from cryptic names),
  recall should drop sharply. This tells us the lower bound — clusters with no
  surviving semantic signal can't be recovered.

## Why this benchmark is honest

The benchmark applies degradations to the *current* AW column names and FK
declarations, but it does NOT regenerate descriptions. Real-world dirty
schemas would have correspondingly poor descriptions too. So this benchmark
slightly OVERSTATES recall — it assumes high-quality descriptions even when
column names are bad.

For a stricter test, regenerate descriptions on the degraded schema before
running detection. That's a more expensive run (full DBAutoDoc redo) but a
truer measure.
