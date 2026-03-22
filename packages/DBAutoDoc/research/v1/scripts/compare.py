#!/usr/bin/env python3
"""Compare DBAutoDoc results against AdventureWorks2022 ground truth. V5 - filters rejected PKs/FKs from pruning passes."""
import json, sys

def load_json(path):
    with open(path) as f:
        return json.load(f)

def main():
    state_path = sys.argv[1] if len(sys.argv) > 1 else "/workspace/benchmark/autodoc-output/run-001/run-1/state.json"
    
    print("=" * 80)
    print("DBAutoDoc Benchmark Report - AdventureWorks2022")
    print("State file: " + state_path)
    print("=" * 80)

    gt_pks = load_json("/workspace/benchmark/ground-truth/pks.json")
    gt_fks = load_json("/workspace/benchmark/ground-truth/fks.json")
    gt_descs = load_json("/workspace/benchmark/ground-truth/descriptions.json")
    state = load_json(state_path)
    
    # ======== 1. PRIMARY KEY DETECTION ========
    print("\n" + "=" * 80)
    print("1. PRIMARY KEY DETECTION")
    print("=" * 80)
    
    gt_pk_map = {}
    for pk in gt_pks:
        cols = tuple(sorted(c.strip().lower() for c in pk["columns"].split(",")))
        key = (pk["tableName"].lower(), cols)
        gt_pk_map[key] = pk
    
    disc = state["phases"]["keyDetection"]["discovered"]
    ad_pk_map = {}
    for pk in disc.get("primaryKeys", []):
        # Skip rejected PKs — pruning has determined these are not real PKs
        if pk.get("status") == "rejected":
            continue
        cols = tuple(sorted(c.lower() for c in pk["columnNames"]))
        key = (pk["tableName"].lower(), cols)
        # Keep highest confidence
        if key not in ad_pk_map or pk.get("confidence", 0) > ad_pk_map[key].get("confidence", 0):
            ad_pk_map[key] = pk
    
    pk_tp = set(gt_pk_map.keys()) & set(ad_pk_map.keys())
    pk_fn = set(gt_pk_map.keys()) - set(ad_pk_map.keys())
    pk_fp = set(ad_pk_map.keys()) - set(gt_pk_map.keys())
    
    pk_prec = len(pk_tp) / len(ad_pk_map) if ad_pk_map else 0
    pk_rec = len(pk_tp) / len(gt_pk_map) if gt_pk_map else 0
    pk_f1 = 2*pk_prec*pk_rec/(pk_prec+pk_rec) if (pk_prec+pk_rec) else 0
    
    print("\nGround Truth: " + str(len(gt_pk_map)) + " | AutoDoc: " + str(len(ad_pk_map)))
    print("Correct: " + str(len(pk_tp)) + " | Missed: " + str(len(pk_fn)) + " | Extra: " + str(len(pk_fp)))
    print("Precision: {:.1%} | Recall: {:.1%} | F1: {:.1%}".format(pk_prec, pk_rec, pk_f1))
    
    if pk_fn:
        composite_miss = sum(1 for k in pk_fn if len(k[1]) > 1)
        single_miss = len(pk_fn) - composite_miss
        beid_miss = sum(1 for k in pk_fn if "businessentityid" in k[1])
        natural_miss = sum(1 for k in pk_fn if all(not c.endswith("id") for c in k[1]))
        print("\n--- Missed PKs: {} single, {} composite, {} BusinessEntityID, {} natural keys ---".format(
            single_miss, composite_miss, beid_miss, natural_miss))
        for key in sorted(pk_fn):
            gt = gt_pk_map[key]
            print("  {}.{} -> [{}]".format(gt["schemaName"], gt["tableName"], gt["columns"]))
    
    if pk_fp:
        print("\n--- Extra PKs ({}) [first 20] ---".format(len(pk_fp)))
        for key in sorted(pk_fp)[:20]:
            ad = ad_pk_map[key]
            cols = ",".join(ad["columnNames"])
            print("  {}.{} -> [{}] (conf: {})".format(ad["schemaName"], ad["tableName"], cols, ad.get("confidence", "?")))
        if len(pk_fp) > 20:
            print("  ... and {} more".format(len(pk_fp) - 20))

    # ======== 2. FOREIGN KEY DETECTION ========
    print("\n" + "=" * 80)
    print("2. FOREIGN KEY DETECTION")
    print("=" * 80)
    
    # GT FKs normalized: (src_table, src_col, ref_table, ref_col) - all lowercase, no schema
    gt_fk_set = {}
    for fk in gt_fks:
        src_cols = [c.strip() for c in fk["columns"].split(",")]
        ref_cols = [c.strip() for c in fk["referencedColumns"].split(",")]
        for sc, rc in zip(src_cols, ref_cols):
            key = (fk["tableName"].lower(), sc.lower(), fk["referencedTable"].lower(), rc.lower())
            gt_fk_set[key] = fk

    # AutoDoc FKs from discovery - normalize by stripping schema prefix from table names
    ad_fk_set = {}
    for fk in disc.get("foreignKeys", []):
        # Skip rejected FKs - LLM determined these are not real relationships
        if fk.get("status") == "rejected":
            continue
        src_col = fk.get("sourceColumn", "")
        tgt_col = fk.get("targetColumn", "")
        src_table = fk.get("sourceTable", "").split(".")[-1]  # strip schema
        tgt_table = fk.get("targetTable", "").split(".")[-1]  # strip schema
        if src_col and tgt_col:
            key = (src_table.lower(), src_col.lower(), tgt_table.lower(), tgt_col.lower())
            if key not in ad_fk_set or fk.get("confidence", 0) > ad_fk_set[key].get("confidence", 0):
                ad_fk_set[key] = fk

    # Also check LLM-generated FKs from analysis phase
    for schema in state.get("schemas", []):
        for table in schema.get("tables", []):
            for fk in table.get("foreignKeys", []):
                src_col = fk.get("column", fk.get("columnName", fk.get("sourceColumn", "")))
                ref_table = fk.get("referencedTable", fk.get("targetTable", ""))
                ref_col = fk.get("referencedColumn", fk.get("targetColumn", ""))
                if src_col and ref_table and ref_col:
                    ref_table_clean = ref_table.split(".")[-1]
                    key = (table["name"].lower(), src_col.lower(), ref_table_clean.lower(), ref_col.lower())
                    if key not in ad_fk_set:
                        ad_fk_set[key] = fk

    fk_tp = set(gt_fk_set.keys()) & set(ad_fk_set.keys())
    fk_fn = set(gt_fk_set.keys()) - set(ad_fk_set.keys())
    fk_fp = set(ad_fk_set.keys()) - set(gt_fk_set.keys())
    
    fk_prec = len(fk_tp) / len(ad_fk_set) if ad_fk_set else 0
    fk_rec = len(fk_tp) / len(gt_fk_set) if gt_fk_set else 0
    fk_f1 = 2*fk_prec*fk_rec/(fk_prec+fk_rec) if (fk_prec+fk_rec) else 0
    
    print("\nGround Truth: {} | AutoDoc: {}".format(len(gt_fk_set), len(ad_fk_set)))
    print("Correct: {} | Missed: {} | Extra: {}".format(len(fk_tp), len(fk_fn), len(fk_fp)))
    print("Precision: {:.1%} | Recall: {:.1%} | F1: {:.1%}".format(fk_prec, fk_rec, fk_f1))

    if fk_tp:
        print("\n--- Correct FKs ({}) ---".format(len(fk_tp)))
        for key in sorted(fk_tp):
            conf = ad_fk_set[key].get("confidence", "?")
            print("  {}.{} -> {}.{} (conf: {})".format(key[0], key[1], key[2], key[3], conf))
    
    if fk_fn:
        print("\n--- Missed FKs ({}) [first 25] ---".format(len(fk_fn)))
        for key in sorted(fk_fn)[:25]:
            print("  {}.{} -> {}.{}".format(key[0], key[1], key[2], key[3]))
        if len(fk_fn) > 25:
            print("  ... and {} more".format(len(fk_fn) - 25))
    
    if fk_fp:
        print("\n--- Extra FKs ({}) [first 25] ---".format(len(fk_fp)))
        for key in sorted(fk_fp)[:25]:
            conf = ad_fk_set[key].get("confidence", "?")
            print("  {}.{} -> {}.{} (conf: {})".format(key[0], key[1], key[2], key[3], conf))
        if len(fk_fp) > 25:
            print("  ... and {} more".format(len(fk_fp) - 25))

    # ======== 3. DESCRIPTIONS ========
    print("\n" + "=" * 80)
    print("3. DESCRIPTION COVERAGE")
    print("=" * 80)
    
    tw = 0; tn = 0; cw = 0; cn = 0; tt = 0; tc = 0
    for schema in state.get("schemas", []):
        for table in schema.get("tables", []):
            tt += 1
            iters = table.get("descriptionIterations", [])
            if iters and iters[-1].get("description", ""):
                tw += 1
            else:
                tn += 1
            for col in table.get("columns", []):
                tc += 1
                ci = col.get("descriptionIterations", [])
                if ci and ci[-1].get("description", ""):
                    cw += 1
                else:
                    cn += 1

    print("\nTable descriptions: {}/{} ({:.0%})".format(tw, tt, tw/tt if tt else 0))
    print("Column descriptions: {}/{} ({:.0%})".format(cw, tc, cw/tc if tc else 0))

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
    print("{:<30} {:>10} {:>9.0%}".format("Table Descriptions", "", tw/tt if tt else 0))
    print("{:<30} {:>10} {:>9.0%}".format("Column Descriptions", "", cw/tc if tc else 0))
    
    overall = (pk_f1 + fk_f1 + (tw/tt if tt else 0) + (cw/tc if tc else 0)) / 4
    grade = "A+" if overall >= 0.95 else "A" if overall >= 0.9 else "B" if overall >= 0.75 else "C" if overall >= 0.6 else "D" if overall >= 0.4 else "F"
    print("\nOverall Score: {:.1%} (Grade: {})".format(overall, grade))
    print("Target: PK F1 >= 95%, FK F1 >= 90%")

if __name__ == "__main__":
    main()
