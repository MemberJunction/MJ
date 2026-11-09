# Data quality bench

Measures the data quality phase against defects planted in a copy of AdventureWorks, with no model
calls (descriptions and discovery off, `--max-iterations 0`).

```bash
export BENCH_ENV_FILE=/path/to/.bench.env   # BENCH_SQL_HOST/PORT/USER/PASSWORD; never commit it
set -a; . "$BENCH_ENV_FILE"; set +a
sqlcmd -S "$BENCH_SQL_HOST,$BENCH_SQL_PORT" -U "$BENCH_SQL_USER" -P "$BENCH_SQL_PASSWORD" -C -b -i make-db.sql -v SOURCE=AW_Truth TARGET=AW_Quality
sqlcmd -S "$BENCH_SQL_HOST,$BENCH_SQL_PORT" -U "$BENCH_SQL_USER" -P "$BENCH_SQL_PASSWORD" -C -b -d AW_Quality -i inject-defects.sql
./run.sh AW_Quality injected      # needs a built package (pnpm run build)
./run.sh AW_Truth baseline        # the untouched copy, for the false-positive review
node score.mjs runs/injected/data-quality.json expected.json --baseline runs/baseline/data-quality.json
```

`AW_Truth` is AdventureWorks2022 with every declared key intact. `inject-defects.sql` plants 21
defects, one per line of `expected.json`: two declared foreign keys switched to NOCHECK and broken
(one composite), case and whitespace variants, blank strings, placeholder and future dates, a
near-unique column, a negative quantity, numbers and dates stored as text, an always-NULL column, a
constant column, truncated text, and a heap with exact duplicate rows.

## Result (2026-11-09, SQL Server 2022, 73 tables)

| | |
|---|---|
| Recall on planted defects | 21 / 21 |
| Probe time, all tables and relationships | 3.5 s |
| Sampling time on the same run (existing pass) | about 20 s |
| Whole run without model calls | 43-45 s |

Findings that appeared after injection but were not planted (7) are true side effects: truncating
street addresses to 10 characters left trailing spaces in 650 rows, the new test tables have nullable
columns that are never NULL, and blanking 100 comments made the column 99.7% NULL instead of 100%.

The untouched database reports 2 warnings worth knowing (`Product.DiscontinuedDate` and
`SalesOrderHeader.Comment` are always NULL), 1 blank-string warning (`Document.FileExtension` on
folder rows), and informational facts: constant columns (`SalesOrderHeader.Status` is always 5,
`ModifiedDate` identical across lookup tables), one-to-one keys, undeclared unique columns, columns
over 90% NULL, and one empty table (`ErrorLog`).

Two rules were tightened after the first baseline run: a column whose every value is exactly the
declared length is a fixed format (`Customer.AccountNumber`), not truncation; and unbounded text
(`DatabaseLog.TSQL`) is not a key candidate. The first run also showed that SQL Server returns the
columns of a composite foreign key in no particular order; the catalog read now orders them by key
position.
