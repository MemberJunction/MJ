#!/usr/bin/env python3
"""Run a .sql file against the local MJ SQL Server container via pyodbc.

Drop-in replacement for `sqlcmd -i ...` when sqlcmd misbehaves (typical
cause on macOS is sqlcmd resolving `localhost` to ::1 even though SQL
Server is only listening on IPv4 inside the container).

Splits the file on `GO` batch separators (case-insensitive, must be the
only token on its line) and executes each batch in its own statement.
Prints any rowsets returned (so SELECT sanity-checks at the bottom of
scripts still show up).

Usage:
  python3 scripts/run-sql-file.py "SQL Scripts/utilities/betty-content-fti-setup.sql"
"""
from __future__ import annotations

import argparse
import os
import re
import sys

import pyodbc

DB_HOST = os.environ.get('DB_HOST', '127.0.0.1')
DB_PORT = int(os.environ.get('DB_PORT', '1433'))
DB_NAME = os.environ.get('DB_DATABASE', 'MJ_5_33_0')
DB_USER = os.environ.get('DB_USERNAME', 'sa')
DB_PASS = os.environ.get('DB_PASSWORD', 'DevSqlPwd123ABC')


def split_batches(sql: str) -> list[str]:
    """Split on `GO` lines (the T-SQL batch separator) — same rule as sqlcmd."""
    parts: list[list[str]] = [[]]
    for line in sql.splitlines():
        if re.match(r'^\s*GO\s*(--.*)?$', line, re.IGNORECASE):
            parts.append([])
        else:
            parts[-1].append(line)
    return [b for b in ('\n'.join(p).strip() for p in parts) if b]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sql_file')
    parser.add_argument('-d', '--database', default=DB_NAME)
    args = parser.parse_args()

    if not os.path.exists(args.sql_file):
        print(f'ERROR: file not found: {args.sql_file}', file=sys.stderr)
        return 2

    with open(args.sql_file, 'r', encoding='utf-8') as fh:
        sql = fh.read()

    batches = split_batches(sql)
    print(f'Running {len(batches)} batches from {args.sql_file} against {DB_USER}@{DB_HOST}:{DB_PORT}/{args.database}\n')

    cs = (
        'DRIVER={ODBC Driver 18 for SQL Server};'
        f'SERVER={DB_HOST},{DB_PORT};'
        f'DATABASE={args.database};'
        f'UID={DB_USER};'
        f'PWD={DB_PASS};'
        'TrustServerCertificate=yes;'
    )
    conn = pyodbc.connect(cs, autocommit=True)
    cur = conn.cursor()

    try:
        for i, batch in enumerate(batches, 1):
            preview = (batch.splitlines() or [''])[0][:80]
            print(f'[batch {i}/{len(batches)}] {preview}{"..." if len(batch) > 80 else ""}')
            cur.execute(batch)
            # Pull any rowsets that the batch produced (SELECT sanity-checks).
            while True:
                try:
                    if cur.description:
                        cols = [c[0] for c in cur.description]
                        rows = cur.fetchall()
                        if rows:
                            print('  -> ' + ' | '.join(cols))
                            for r in rows:
                                print('     ' + ' | '.join('' if v is None else str(v) for v in r))
                except pyodbc.ProgrammingError:
                    pass
                if not cur.nextset():
                    break
        print('\nDone.')
        return 0
    except pyodbc.Error as e:
        print(f'\nERROR: {e}', file=sys.stderr)
        return 1
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    sys.exit(main())
