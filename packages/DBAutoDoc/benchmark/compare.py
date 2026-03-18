#!/usr/bin/env python3
"""Compare DBAutoDoc results against AdventureWorks2022 ground truth. V2 - fixed FK matching."""
import json
from collections import defaultdict

def load_json(path):
    with open(path) as f:
        return json.load(f)

def main():
    print("=" * 80)
    print("DBAutoDoc Benchmark Report - AdventureWorks2022")
    print("=" * 80)

    gt_pks = load_json("/workspace/benchmark/ground-truth/pks.json")
    gt_fks = load_json("/workspace/benchmark/ground-truth/fks.json")
    gt_descs = load_json("/workspace/benchmark/ground-truth/descriptions.json")
    state = load_json("/workspace/benchmark/autodoc-output/run-1/state.json")
    
    # ======== 1. PRIMARY KEY DETECTION ========
    print("\n" + "=" * 80)
    print("1. PRIMARY KEY DETECTION")
    print("=" * 80)
    
    # GT PKs as set of (table, cols_tuple)
    gt_pk_map = {}
    for pk in gt_pks:
        cols = tuple(sorted(c.strip().lower() for c in pk["columns"].split(",")))
        key = (pk["tableName"].lower(), cols)
        gt_pk_map[key] = pk
    
    # AutoDoc PKs
    disc = state["phases"]["keyDetection"]["discovered"]
    ad_pk_map = {}
    for pk in disc.get("primaryKeys", []):
        cols = tuple(sorted(c.lower() for c in pk["columnNames"]))
        key = (pk["tableName"].lower(), cols)
        ad_pk_map[key] = pk
    
    pk_tp = set(gt_pk_map.keys()) & set(ad_pk_map.keys())
    pk_fn = set(gt_pk_map.keys()) - set(ad_pk_map.keys())
    pk_fp = set(ad_pk_map.keys()) - set(gt_pk_map.keys())
    
    pk_prec = len(pk_tp) / len(ad_pk_map) if ad_pk_map else 0
    pk_rec = len(pk_tp) / len(gt_pk_map) if gt_pk_map else 0
    pk_f1 = 2*pk_prec*pk_rec/(pk_prec+pk_rec) if (pk_prec+pk_rec) else 0
    
    print(f"\nGround Truth: {len(gt_pk_map)} | AutoDoc: {len(ad_pk_map)}")
    print(f"Correct: {len(pk_tp)} | Missed: {len(pk_fn)} | Extra: {len(pk_fp)}")
    print(f"Precision: {pk_prec:.1%} | Recall: {pk_rec:.1%} | F1: {pk_f1:.1%}")
    
    if pk_fn:
        # Categorize misses
        composite_miss = sum(1 for k in pk_fn if len(k[1]) > 1)
        single_miss = len(pk_fn) - composite_miss
        beid_miss = sum(1 for k in pk_fn if "businessentityid" in k[1])
        print(f"\n--- Missed PKs: {single_miss} single, {composite_miss} composite, {beid_miss} using BusinessEntityID ---")
        for key in sorted(pk_fn):
            gt = gt_pk_map[key]
            print(f"  {gt['schemaName']}.{gt['tableName']} -> [{gt['columns']}]")
    
    if pk_fp:
        print(f"\n--- Extra PKs ({len(pk_fp)}) [showing first 15] ---")
        for key in sorted(pk_fp)[:15]:
            ad = ad_pk_map[key]
            cols = ",".join(ad["columnNames"])
            print(f"  {ad['schemaName']}.{ad['tableName']} -> [{cols}] (conf: {ad.get('confidence', 'N/A')})")

    # ======== 2. FOREIGN KEY DETECTION ========
    print("\n" + "=" * 80)
    print("2. FOREIGN KEY DETECTION")
    print("=" * 80)
    
    # GT FKs: normalize to (src_table, src_col, ref_table, ref_col) for single-column FKs
    # For multi-col FKs, we split them into individual relationships
    gt_fk_singles = {}
    for fk in gt_fks:
        src_cols = [c.strip() for c in fk["columns"].split(",")]
        ref_cols = [c.strip() for c in fk["referencedColumns"].split(",")]
        for sc, rc in zip(src_cols, ref_cols):
            key = (fk["tableName"].lower(), sc.lower(), fk["referencedTable"].lower(), rc.lower())
            gt_fk_singles[key] = fk

    # AutoDoc FKs from discovery phase
    ad_fk_singles = {}
    for fk in disc.get("foreignKeys", []):
        src_col = fk.get("sourceColumn", "")
        tgt_col = fk.get("targetColumn", "")
        src_table = fk.get("sourceTable", fk.get("tableName", ""))
        tgt_table = fk.get("targetTable", fk.get("referencedTable", ""))
        if src_col and tgt_col:
            key = (src_table.lower(), src_col.lower(), tgt_table.lower(), tgt_col.lower())
            # Keep highest confidence version
            if key not in ad_fk_singles or fk.get("confidence", 0) > ad_fk_singles[key].get("confidence", 0):
                ad_fk_singles[key] = fk

    # Also check analysis-phase FKs in schemas
    for schema in state.get("schemas", []):
        for table in schema.get("tables", []):
            for fk in table.get("foreignKeys", []):
                src_col = fk.get("column", fk.get("columnName", fk.get("sourceColumn", "")))
                ref_table = fk.get("referencedTable", fk.get("targetTable", ""))
                ref_col = fk.get("referencedColumn", fk.get("targetColumn", ""))
                if src_col and ref_table and ref_col:
                    # Clean up schema prefixes in table names (e.g., "Person.Person.BusinessEntity" -> "BusinessEntity")
                    ref_table_clean = ref_table.split(".")[-1]
                    key = (table["name"].lower(), src_col.lower(), ref_table_clean.lower(), ref_col.lower())
                    if key not in ad_fk_singles:
                        ad_fk_singles[key] = fk

    fk_tp = set(gt_fk_singles.keys()) & set(ad_fk_singles.keys())
    fk_fn = set(gt_fk_singles.keys()) - set(ad_fk_singles.keys())
    fk_fp = set(ad_fk_singles.keys()) - set(gt_fk_singles.keys())
    
    fk_prec = len(fk_tp) / len(ad_fk_singles) if ad_fk_singles else 0
    fk_rec = len(fk_tp) / len(gt_fk_singles) if gt_fk_singles else 0
    fk_f1 = 2*fk_prec*fk_rec/(fk_prec+fk_rec) if (fk_prec+fk_rec) else 0
    
    print(f"\nGround Truth FK relationships: {len(gt_fk_singles)}")
    print(f"AutoDoc Discovered FK relationships: {len(ad_fk_singles)}")
    print(f"Correct: {len(fk_tp)} | Missed: {len(fk_fn)} | Extra: {len(fk_fp)}")
    print(f"Precision: {fk_prec:.1%} | Recall: {fk_rec:.1%} | F1: {fk_f1:.1%}")

    if fk_tp:
        print(f"\n--- Correct FKs (first 10) ---")
        for key in sorted(fk_tp)[:10]:
            gt = gt_fk_singles[key]
            ad = ad_fk_singles[key]
            print(f"  {key[0]}.{key[1]} -> {key[2]}.{key[3]} (conf: {ad.get('confidence', 'N/A')})")
    
    if fk_fn:
        print(f"\n--- Missed FKs ({len(fk_fn)}) [first 20] ---")
        for key in sorted(fk_fn)[:20]:
            gt = gt_fk_singles[key]
            print(f"  {gt['tableName']}.{key[1]} -> {gt['referencedTable']}.{key[3]}")
        if len(fk_fn) > 20:
            print(f"  ... and {len(fk_fn) - 20} more")
    
    if fk_fp:
        print(f"\n--- Extra FKs ({len(fk_fp)}) [first 20] ---")
        # Categorize: are these semantically plausible?
        plausible = 0
        for key in sorted(fk_fp)[:20]:
            ad = ad_fk_singles[key]
            conf = ad.get("confidence", "N/A")
            print(f"  {key[0]}.{key[1]} -> {key[2]}.{key[3]} (conf: {conf})")
        if len(fk_fp) > 20:
            print(f"  ... and {len(fk_fp) - 20} more")

    # ======== 3. DESCRIPTIONS ========
    print("\n" + "=" * 80)
    print("3. DESCRIPTION COVERAGE & QUALITY")
    print("=" * 80)
    
    gt_table_descs = {}
    gt_col_descs = {}
    for d in gt_descs:
        if d["level"] == "TABLE":
            gt_table_descs[(d["schemaName"].lower(), d["tableName"].lower())] = d["description"]
        elif d.get("columnName"):
            gt_col_descs[(d["schemaName"].lower(), d["tableName"].lower(), d["columnName"].lower())] = d["description"]
    
    ad_table_descs = {}
    ad_col_descs = {}
    for schema in state.get("schemas", []):
        sname = schema.get("name", "")
        for table in schema.get("tables", []):
            tname = table.get("name", "")
            iters = table.get("descriptionIterations", [])
            if iters:
                last = iters[-1]
                desc = last.get("tableDescription", last.get("description", ""))
                if desc:
                    ad_table_descs[(sname.lower(), tname.lower())] = desc
                col_descs = last.get("columnDescriptions", last.get("columns", {}))
                if isinstance(col_descs, dict):
                    for cname, cdesc in col_descs.items():
                        if cdesc:
                            ad_col_descs[(sname.lower(), tname.lower(), cname.lower())] = cdesc
                elif isinstance(col_descs, list):
                    for cd in col_descs:
                        cname = cd.get("name", cd.get("columnName", ""))
                        cdesc = cd.get("description", "")
                        if cname and cdesc:
                            ad_col_descs[(sname.lower(), tname.lower(), cname.lower())] = cdesc

    print(f"\nGround Truth: {len(gt_table_descs)} table, {len(gt_col_descs)} column descriptions")
    print(f"AutoDoc: {len(ad_table_descs)} table, {len(ad_col_descs)} column descriptions")
    print(f"Table Coverage: {len(ad_table_descs)}/71 ({len(ad_table_descs)/71*100:.0f}%)")
    
    # Quality comparison on overlapping tables
    both = set(gt_table_descs.keys()) & set(ad_table_descs.keys())
    print(f"Tables with both descriptions: {len(both)}")
    
    if both:
        print("\n--- Description Quality Comparison (all overlapping) ---")
        for key in sorted(both):
            gt_d = gt_table_descs[key]
            ad_d = ad_table_descs[key]
            print(f"\n  [{key[0]}.{key[1]}]")
            print(f"    GT:      {gt_d[:200]}")
            print(f"    AutoDoc: {ad_d[:200]}")
    
    # Tables AutoDoc covered but GT didn't
    ad_only = set(ad_table_descs.keys()) - set(gt_table_descs.keys())
    gt_only = set(gt_table_descs.keys()) - set(ad_table_descs.keys())
    if ad_only:
        print(f"\n--- Tables AutoDoc described (no GT): {len(ad_only)} ---")
        for key in sorted(ad_only)[:5]:
            print(f"  {key[0]}.{key[1]}: {ad_table_descs[key][:120]}")
    if gt_only:
        print(f"\n--- Tables GT has but AutoDoc missed: {len(gt_only)} ---")
        for key in sorted(gt_only)[:10]:
            print(f"  {key[0]}.{key[1]}")
        if len(gt_only) > 10:
            print(f"  ... and {len(gt_only) - 10} more")

    # ======== 4. SUMMARY ========
    print("\n" + "=" * 80)
    print("4. OVERALL SUMMARY")
    print("=" * 80)
    
    summary = state.get("summary", {})
    table_cov = len(ad_table_descs) / 71
    
    print(f"\nRun: {summary.get('totalPromptsRun', 0)} prompts, {summary.get('totalTokens', 0):,} tokens, {summary.get('totalIterations', 0)} iterations")
    print(f"\n{'Metric':<30} {'Precision':>10} {'Recall':>10} {'F1':>10}")
    print("-" * 62)
    print(f"{'Primary Key Detection':<30} {pk_prec:>9.1%} {pk_rec:>9.1%} {pk_f1:>9.1%}")
    print(f"{'Foreign Key Detection':<30} {fk_prec:>9.1%} {fk_rec:>9.1%} {fk_f1:>9.1%}")
    print(f"{'Table Description Coverage':<30} {'':>10} {table_cov:>9.1%} {'':>10}")
    
    overall = (pk_f1 + fk_f1 + table_cov) / 3
    grade = "A" if overall >= 0.9 else "B" if overall >= 0.75 else "C" if overall >= 0.6 else "D" if overall >= 0.4 else "F"
    print(f"\nOverall Score: {overall:.1%} (Grade: {grade})")
    
    # ======== 5. ROOT CAUSE ANALYSIS ========
    print("\n" + "=" * 80)
    print("5. ROOT CAUSE ANALYSIS & IMPROVEMENT IDEAS")
    print("=" * 80)
    
    # PK analysis
    beid_miss = sum(1 for k in pk_fn if "businessentityid" in k[1])
    composite_miss = sum(1 for k in pk_fn if len(k[1]) > 1)
    natural_key_miss = sum(1 for k in pk_fn if all(not c.endswith("id") for c in k[1]))
    
    print(f"\nPK Issues:")
    print(f"  - {beid_miss} tables use BusinessEntityID as PK (shared key pattern) - AutoDoc doesn't recognize these")
    print(f"  - {composite_miss} composite PKs missed - composite key detection may be too conservative")
    print(f"  - {natural_key_miss} natural keys (non-ID columns like CountryRegionCode, CurrencyCode)")
    print(f"  - {len(pk_fp)} false positive PKs - over-generating candidates")
    
    # FK analysis
    cross_schema = sum(1 for k in fk_fn if True)  # All missed
    print(f"\nFK Issues:")
    print(f"  - {len(fk_fn)} missed FKs out of {len(gt_fk_singles)} total")
    print(f"  - {len(fk_fp)} extra FKs generated (noise)")
    print(f"  - Need better column-to-column matching vs table-level matching")
    
    # Description analysis  
    print(f"\nDescription Issues:")
    print(f"  - Only {len(ad_table_descs)}/71 tables got descriptions ({table_cov:.0%})")
    print(f"  - 0 column descriptions generated")
    print(f"  - 3 iterations but many tables not processed")
    
    print(f"\n--- Improvement Recommendations ---")
    print("  1. CRITICAL: Fix description generation - only 35% table coverage, 0% column coverage")
    print("  2. PK: Handle shared-key pattern (BusinessEntityID used as PK in child tables)")
    print("  3. PK: Improve composite key detection (17 missed composite PKs)")
    print("  4. PK: Support natural keys (CountryRegionCode, CurrencyCode, UnitMeasureCode)")
    print("  5. FK: Normalize schema prefixes in comparison (many FKs may be correct but misformatted)")
    print("  6. FK: Reduce false positives (84 extra FKs = noise)")
    print("  7. Description: Investigate why only 25/71 tables were analyzed in 3 iterations")

if __name__ == "__main__":
    main()
