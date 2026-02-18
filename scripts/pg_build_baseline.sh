#!/bin/bash
# Build the PostgreSQL baseline migration from the T-SQL source
# Order: tables -> functions -> views -> procedures -> grants -> seed data

set -e

echo "=== Pass 1: Tables, constraints, indexes, triggers ==="
python3 /workspace/MJ/scripts/pg_convert_tables.py

echo ""
echo "=== Pass 2a: Functions (TVFs and Scalar) ==="
python3 /workspace/MJ/scripts/pg_convert_functions.py

echo ""
echo "=== Injecting functions before views section ==="
# Append functions output to the main file
cat /workspace/MJ/scripts/pg_functions_output.sql >> /workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql

echo ""
echo "=== Pass 2b: Views ==="
python3 /workspace/MJ/scripts/pg_convert_views.py

echo ""
echo "=== Pass 3: Stored Procedures ==="
python3 /workspace/MJ/scripts/pg_convert_procedures.py

echo ""
echo "=== Injecting procedures after views section ==="
cat /workspace/MJ/scripts/pg_procedures_output.sql >> /workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql

echo ""
echo "=== Pass 4: GRANT statements ==="
python3 /workspace/MJ/scripts/pg_convert_grants.py

echo ""
echo "=== Injecting grants ==="
cat /workspace/MJ/scripts/pg_grants_output.sql >> /workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql

echo ""
echo "=== Pass 5: Seed data ==="
python3 /workspace/MJ/scripts/pg_convert_seeddata.py

echo ""
echo "=== Injecting seed data ==="
cat /workspace/MJ/scripts/pg_seeddata_output.sql >> /workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql

echo ""
echo "=== Build complete ==="
wc -l /workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql
