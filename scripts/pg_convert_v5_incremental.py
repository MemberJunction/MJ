#!/usr/bin/env python3
"""
Convert v5.x incremental SQL Server migrations to PostgreSQL.

Reuses the same conversion engine as the baseline converter.

Usage:
    python3 pg_convert_v5_incremental.py
"""

import os
import sys
import time
import glob

# Import the baseline converter's functions
sys.path.insert(0, os.path.dirname(__file__))
from pg_convert_v5_baseline import (
    preprocess, split_batches, classify_batch, convert_batch,
    postprocess, ConversionStats, print_report
)


MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "migrations", "v5")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "migrations", "pg")

# The incremental migration files to convert
INCREMENTAL_FILES = [
    "V202602131500__v5.0.x__Entity_Name_Normalization_And_ClassName_Prefix_Fix.sql",
    "V202602141421__v5.0.x__Add_AllowMultipleSubtypes_to_Entity.sql",
    "V202602161825__v5.0.x__Metadata_Sync.sql",
    "V202602170015__v5.1__Regenerate_Delete_Stored_Procs.sql",
    "V202602171600__v5.0.x__Add_PlatformVariants_Columns.sql",
    "V202602171919__v5.1.x__Open_App_Tracking_Tables.sql",
]


def convert_incremental(input_path: str, output_path: str) -> ConversionStats:
    """Convert a single incremental migration file."""
    stats = ConversionStats()

    print(f"\n{'='*70}")
    print(f"Converting: {os.path.basename(input_path)}")
    print(f"{'='*70}")

    with open(input_path, 'r', encoding='utf-8') as f:
        raw_sql = f.read()

    print(f"  Input size: {len(raw_sql):,} bytes, {raw_sql.count(chr(10)):,} lines")

    # Pre-process
    sql = preprocess(raw_sql)

    # Split into batches
    batches = split_batches(sql)
    stats.total_batches = len(batches)
    print(f"  Found {stats.total_batches:,} batches")

    # Convert each batch
    output_parts: list[str] = []

    # Add PostgreSQL header
    base_name = os.path.basename(input_path).replace('.sql', '')
    output_parts.append(f"""-- ============================================================================
-- {base_name} (PostgreSQL)
-- Deterministically converted from SQL Server using sqlglot + custom pipeline
-- ============================================================================

SET search_path TO __mj, public;

""")

    for i, batch in enumerate(batches):
        batch_type = classify_batch(batch)

        try:
            result = convert_batch(batch, batch_type, stats)
            if result:
                output_parts.append(result)
                stats.converted += 1
        except Exception as e:
            stats.errors += 1
            stats.error_batches.append(f"Error in batch {i+1} ({batch_type}): {str(e)[:100]}")
            output_parts.append(f'\n-- ERROR converting batch {i+1} ({batch_type}): {str(e)[:100]}\n')

    # Post-process
    full_output = '\n'.join(output_parts)
    full_output = postprocess(full_output)

    # Write output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(full_output)

    print(f"  Output: {output_path}")
    print(f"  Output size: {len(full_output):,} bytes")

    return stats


def main() -> None:
    print("SQL Server → PostgreSQL Incremental Migration Converter")
    print(f"  Source: {MIGRATIONS_DIR}")
    print(f"  Output: {OUTPUT_DIR}")

    total_stats = ConversionStats()
    start_time = time.time()

    for filename in INCREMENTAL_FILES:
        input_path = os.path.join(MIGRATIONS_DIR, filename)
        if not os.path.exists(input_path):
            print(f"\n  WARNING: {filename} not found, skipping")
            continue

        # Generate output filename with _PG suffix
        output_name = filename.replace('.sql', '_PG.sql')
        output_path = os.path.join(OUTPUT_DIR, output_name)

        stats = convert_incremental(input_path, output_path)
        print_report(stats)

        # Accumulate stats
        total_stats.total_batches += stats.total_batches
        total_stats.converted += stats.converted
        total_stats.skipped += stats.skipped
        total_stats.errors += stats.errors
        total_stats.tables_created += stats.tables_created
        total_stats.views_created += stats.views_created
        total_stats.procedures_converted += stats.procedures_converted
        total_stats.functions_converted += stats.functions_converted
        total_stats.triggers_converted += stats.triggers_converted
        total_stats.inserts_converted += stats.inserts_converted
        total_stats.grants_converted += stats.grants_converted
        total_stats.fk_constraints += stats.fk_constraints
        total_stats.check_constraints += stats.check_constraints
        total_stats.indexes_created += stats.indexes_created
        total_stats.comments_converted += stats.comments_converted
        total_stats.error_batches.extend(stats.error_batches)
        total_stats.skipped_batches.extend(stats.skipped_batches)

    elapsed = time.time() - start_time

    print(f"\n{'='*70}")
    print("OVERALL INCREMENTAL CONVERSION SUMMARY")
    print_report(total_stats)
    print(f"\nCompleted in {elapsed:.1f}s")

    if total_stats.errors > 0:
        print(f"\n⚠ {total_stats.errors} total errors — review outputs")
        sys.exit(1)
    else:
        print("\n✓ All incremental migrations converted successfully")


if __name__ == '__main__':
    main()
