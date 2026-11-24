#!/usr/bin/env python3
"""Compare DBAutoDoc results against ground truth (schema-qualified + paper weights)."""
import argparse
import json
import os


def load_json(path):
    with open(path) as f:
        return json.load(f)


def split_table(raw, default_schema):
    if "." in raw:
        s, t = raw.split(".", 1)
        return s.lower(), t.lower()
    return default_schema.lower(), raw.lower()


def main():
    parser = argparse.ArgumentParser(description="Score a DBAutoDoc state.json against ground truth.")
    parser.add_argument(
        "state_path",
        nargs="?",
        default="/workspace/benchmark/autodoc-output/run-001/run-1/state.json",
        help="Path to DBAutoDoc state.json",
    )
    parser.add_argument(
        "--gt-dir",
        default=os.environ.get("DBAUTODOC_GT_DIR", "/workspace/benchmark/ground-truth"),
        help="Directory containing pks.json and fks.json",
    )
    args = parser.parse_args()
    state_path = args.state_path

    print("=" * 80)
    print("DBAutoDoc Benchmark Report")
    print("State file: " + state_path)
    print("Ground truth dir: " + args.gt_dir)
    print("=" * 80)

    gt_pks = load_json(os.path.join(args.gt_dir, "pks.json"))
    gt_fks = load_json(os.path.join(args.gt_dir, "fks.json"))
    state = load_json(state_path)

    # ======== 1. PRIMARY KEY DETECTION ========
    print("\n" + "=" * 80)
    print("1. PRIMARY KEY DETECTION")
    print("=" * 80)

    gt_pk_map = {}
    for pk in gt_pks:
        cols = tuple(sorted(c.strip().lower() for c in pk["columns"].split(",")))
        schema_name = pk.get("schemaName", "dbo").lower()
        key = (schema_name, pk["tableName"].lower(), cols)
        gt_pk_map[key] = pk

    disc = state.get("phases", {}).get("keyDetection", {}).get("discovered", {})
    best_pk_by_table = {}
    for pk in disc.get("primaryKeys", []):
        # Skip rejected PKs — pruning has determined these are not real PKs
        if pk.get("status") == "rejected":
            continue
        schema_name = pk.get("schemaName", "dbo").lower()
        table_key = (schema_name, pk["tableName"].lower())
        rank = (1 if pk.get("status") == "confirmed" else 0, pk.get("confidence", 0))
        if table_key not in best_pk_by_table or rank > best_pk_by_table[table_key][0]:
            best_pk_by_table[table_key] = (rank, pk)

    ad_pk_map = {}
    for (schema_name, table_name), (_, pk) in best_pk_by_table.items():
        cols = tuple(sorted(c.lower() for c in pk["columnNames"]))
        ad_pk_map[(schema_name, table_name, cols)] = pk

    pk_tp = set(gt_pk_map.keys()) & set(ad_pk_map.keys())
    pk_fn = set(gt_pk_map.keys()) - set(ad_pk_map.keys())
    pk_fp = set(ad_pk_map.keys()) - set(gt_pk_map.keys())

    pk_prec = len(pk_tp) / len(ad_pk_map) if ad_pk_map else 0
    pk_rec = len(pk_tp) / len(gt_pk_map) if gt_pk_map else 0
    pk_f1 = 2 * pk_prec * pk_rec / (pk_prec + pk_rec) if (pk_prec + pk_rec) else 0

    print("\nGround Truth: " + str(len(gt_pk_map)) + " | AutoDoc: " + str(len(ad_pk_map)))
    print("Correct: " + str(len(pk_tp)) + " | Missed: " + str(len(pk_fn)) + " | Extra: " + str(len(pk_fp)))
    print("Precision: {:.1%} | Recall: {:.1%} | F1: {:.1%}".format(pk_prec, pk_rec, pk_f1))

    if pk_fn:
        composite_miss = sum(1 for k in pk_fn if len(k[2]) > 1)
        single_miss = len(pk_fn) - composite_miss
        beid_miss = sum(1 for k in pk_fn if "businessentityid" in k[2])
        natural_miss = sum(1 for k in pk_fn if all(not c.endswith("id") for c in k[2]))
        print("\n--- Missed PKs: {} single, {} composite, {} BusinessEntityID, {} natural keys ---".format(
            single_miss, composite_miss, beid_miss, natural_miss))
        for key in sorted(pk_fn):
            gt = gt_pk_map[key]
            print("  {}.{} -> [{}]".format(gt.get("schemaName", "dbo"), gt["tableName"], gt["columns"]))

    if pk_fp:
        print("\n--- Extra PKs ({}) [first 20] ---".format(len(pk_fp)))
        for key in sorted(pk_fp)[:20]:
            ad = ad_pk_map[key]
            cols = ",".join(ad["columnNames"])
            print("  {}.{} -> [{}] (conf: {})".format(ad.get("schemaName", "dbo"), ad["tableName"], cols, ad.get("confidence", "?")))
        if len(pk_fp) > 20:
            print("  ... and {} more".format(len(pk_fp) - 20))

    # ======== 2. FOREIGN KEY DETECTION ========
    print("\n" + "=" * 80)
    print("2. FOREIGN KEY DETECTION")
    print("=" * 80)

    # GT FKs normalized with schemas: (src_schema, src_table, src_col, tgt_schema, tgt_table, tgt_col)
    gt_fk_set = {}
    for fk in gt_fks:
        src_schema = fk.get("schemaName", "dbo").lower()
        tgt_schema = fk.get("referencedSchema", fk.get("schemaName", "dbo")).lower()
        src_cols = [c.strip() for c in fk["columns"].split(",")]
        ref_cols = [c.strip() for c in fk["referencedColumns"].split(",")]
        for sc, rc in zip(src_cols, ref_cols):
            key = (src_schema, fk["tableName"].lower(), sc.lower(), tgt_schema, fk["referencedTable"].lower(), rc.lower())
            gt_fk_set[key] = fk

    ad_fk_set = {}
    rejected_fks = set()
    for fk in disc.get("foreignKeys", []):
        default_schema = fk.get("schemaName", "dbo")
        src_schema, src_table = split_table(fk.get("sourceTable", ""), default_schema)
        tgt_schema, tgt_table = split_table(fk.get("targetTable", ""), fk.get("targetSchema") or default_schema)
        src_col = fk.get("sourceColumn", "").lower()
        tgt_col = fk.get("targetColumn", "").lower()
        if not (src_col and tgt_col and src_table and tgt_table):
            continue
        key = (src_schema, src_table, src_col, tgt_schema, tgt_table, tgt_col)
        if fk.get("status") == "rejected":
            rejected_fks.add(key)
            continue
        if key not in ad_fk_set or fk.get("confidence", 0) > ad_fk_set[key].get("confidence", 0):
            ad_fk_set[key] = fk

    # Also check table-level dependsOn (current state.ts field) and legacy foreignKeys
    for schema in state.get("schemas", []):
        schema_name = schema.get("name", "dbo")
        for table in schema.get("tables", []):
            edges = list(table.get("dependsOn", [])) + list(table.get("foreignKeys", []))
            for fk in edges:
                src_col = fk.get("column", fk.get("columnName", fk.get("sourceColumn", "")))
                ref_table_raw = fk.get("table", fk.get("referencedTable", fk.get("targetTable", "")))
                ref_col = fk.get("referencedColumn", fk.get("targetColumn", ""))
                ref_schema_default = fk.get("schema", fk.get("referencedSchema", fk.get("targetSchema", schema_name)))
                if src_col and ref_table_raw and ref_col:
                    tgt_schema, tgt_table = split_table(ref_table_raw, ref_schema_default)
                    key = (schema_name.lower(), table["name"].lower(), src_col.lower(), tgt_schema, tgt_table, ref_col.lower())
                    if key in rejected_fks:
                        continue
                    if key not in ad_fk_set:
                        ad_fk_set[key] = fk

    fk_tp = set(gt_fk_set.keys()) & set(ad_fk_set.keys())
    fk_fn = set(gt_fk_set.keys()) - set(ad_fk_set.keys())
    fk_fp = set(ad_fk_set.keys()) - set(gt_fk_set.keys())

    fk_prec = len(fk_tp) / len(ad_fk_set) if ad_fk_set else 0
    fk_rec = len(fk_tp) / len(gt_fk_set) if gt_fk_set else 0
    fk_f1 = 2 * fk_prec * fk_rec / (fk_prec + fk_rec) if (fk_prec + fk_rec) else 0

    print("\nGround Truth: {} | AutoDoc: {}".format(len(gt_fk_set), len(ad_fk_set)))
    print("Correct: {} | Missed: {} | Extra: {}".format(len(fk_tp), len(fk_fn), len(fk_fp)))
    print("Precision: {:.1%} | Recall: {:.1%} | F1: {:.1%}".format(fk_prec, fk_rec, fk_f1))

    if fk_tp:
        print("\n--- Correct FKs ({}) ---".format(len(fk_tp)))
        for key in sorted(fk_tp):
            conf = ad_fk_set[key].get("confidence", "?")
            print("  {}.{}.{} -> {}.{}.{} (conf: {})".format(key[0], key[1], key[2], key[3], key[4], key[5], conf))

    if fk_fn:
        print("\n--- Missed FKs ({}) [first 25] ---".format(len(fk_fn)))
        for key in sorted(fk_fn)[:25]:
            print("  {}.{}.{} -> {}.{}.{}".format(key[0], key[1], key[2], key[3], key[4], key[5]))
        if len(fk_fn) > 25:
            print("  ... and {} more".format(len(fk_fn) - 25))

    if fk_fp:
        print("\n--- Extra FKs ({}) [first 25] ---".format(len(fk_fp)))
        for key in sorted(fk_fp)[:25]:
            conf = ad_fk_set[key].get("confidence", "?")
            print("  {}.{}.{} -> {}.{}.{} (conf: {})".format(key[0], key[1], key[2], key[3], key[4], key[5], conf))
        if len(fk_fp) > 25:
            print("  ... and {} more".format(len(fk_fp) - 25))

    # ======== 3. DESCRIPTIONS ========
    print("\n" + "=" * 80)
    print("3. DESCRIPTION COVERAGE")
    print("=" * 80)

    tw = 0
    tn = 0
    cw = 0
    cn = 0
    tt = 0
    tc = 0
    for schema in state.get("schemas", []):
        for table in schema.get("tables", []):
            tt += 1
            iters = table.get("descriptionIterations", [])
            if table.get("description") or (iters and iters[-1].get("description", "")):
                tw += 1
            else:
                tn += 1
            for col in table.get("columns", []):
                tc += 1
                ci = col.get("descriptionIterations", [])
                if col.get("description") or (ci and ci[-1].get("description", "")):
                    cw += 1
                else:
                    cn += 1

    table_cov = tw / tt if tt else 0
    col_cov = cw / tc if tc else 0
    print("\nTable descriptions: {}/{} ({:.0%})".format(tw, tt, table_cov))
    print("Column descriptions: {}/{} ({:.0%})".format(cw, tc, col_cov))

    # ======== 4. SUMMARY ========
    print("\n" + "=" * 80)
    print("OVERALL SUMMARY")
    print("=" * 80)

    summary = state.get("summary", {})
    print("\nTokens: {:,} | Iterations: {} | Prompts: {}".format(
        summary.get("totalTokens", 0), summary.get("totalIterations", 0), summary.get("totalPromptsRun", 0)))

    print("\n{:<30} {:>10} {:>10} {:>10}".format("Metric", "Precision", "Recall", "F1"))
    print("-" * 62)
    print("{:<30} {:>9.1%} {:>9.1%} {:>9.1%}".format("Primary Key Detection", pk_prec, pk_rec, pk_f1))
    print("{:<30} {:>9.1%} {:>9.1%} {:>9.1%}".format("Foreign Key Detection", fk_prec, fk_rec, fk_f1))
    print("{:<30} {:>10} {:>9.0%}".format("Table Descriptions", "", table_cov))
    print("{:<30} {:>10} {:>9.0%}".format("Column Descriptions", "", col_cov))

    weighted = 0.35 * fk_f1 + 0.30 * pk_f1 + 0.20 * table_cov + 0.15 * col_cov
    unweighted = (pk_f1 + fk_f1 + table_cov + col_cov) / 4
    grade = "A+" if weighted >= 0.95 else "A" if weighted >= 0.9 else "B" if weighted >= 0.75 else "C" if weighted >= 0.6 else "D" if weighted >= 0.4 else "F"
    print("\nOverall Score: {:.1%} (Grade: {}) [weights 0.35 FK / 0.30 PK / 0.20 TblDesc / 0.15 ColDesc]".format(weighted, grade))
    print("Unweighted Mean: {:.1%}".format(unweighted))
    print("Target: PK F1 >= 95%, FK F1 >= 90%")


if __name__ == "__main__":
    main()
