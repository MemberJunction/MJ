#!/usr/bin/env python3
"""Import the Optica sample CSV into __mj.ContentItem + betty.ContentItem.

Source file is RTF-wrapped (saved via macOS TextEdit). The script decodes the
RTF wrapper in-memory, then bulk-inserts the rows into the local SQL Server
container that backs the MJ dev environment.

Behavior:
  * Idempotent: rows whose deterministic UUID already exists in
    betty.ContentItem are skipped (see --reset-status to flip Pending again).
  * Parents (ParentID = NULL) are inserted before chunks so the
    betty.ContentItem.ParentID self-FK is always satisfied.
  * __mj.ContentItem is inserted with EmbeddingStatus = 'Pending' and
    TaggingStatus = 'Pending' so the existing vectorization / tagging
    pipelines pick the rows up on their next run.
  * Required FKs that aren't in the CSV (ContentSource, ContentType,
    ContentSourceType, ContentFileType) are upserted with hardcoded UUIDs
    so re-running is safe and the same IDs appear across environments.

Usage:
  cd MJ && python3 scripts/import-optica-sample.py
  cd MJ && python3 scripts/import-optica-sample.py --dry-run
  cd MJ && python3 scripts/import-optica-sample.py --limit 100   # smoke test
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import re
import sys
import uuid
from typing import Optional

import pyodbc

# ---------------------------------------------------------------------------
# Configuration --- override via env vars where it makes sense
# ---------------------------------------------------------------------------
DEFAULT_CSV = '/Users/christopherhunnewell/projects/sqlserver-dev/Optica_Sample(in).csv'

DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = int(os.environ.get('DB_PORT', '1433'))
DB_NAME = os.environ.get('DB_DATABASE', 'MJ_5_33_0')
DB_USER = os.environ.get('DB_USERNAME', 'sa')
DB_PASS = os.environ.get('DB_PASSWORD', 'DevSqlPwd123ABC')
DB_TRUST = os.environ.get('DB_TRUST_SERVER_CERTIFICATE', 'true').lower() in ('1', 'true', 'yes')

# Hardcoded UUIDs so the same conceptual rows always have the same IDs across
# environments. Lifted out of the script so they're easy to find/change.
ORG_ID                    = uuid.UUID('A1B2C3D4-0000-4000-A000-000000000001')
ORG_NAME                  = 'Optica'
CONTENT_SOURCE_ID         = uuid.UUID('A1B2C3D4-0001-4000-A000-000000000001')
CONTENT_SOURCE_NAME       = 'Optica Sample'
CONTENT_SOURCE_TYPE_NAME  = 'Web'                # falls back to first existing if not found
CONTENT_TYPE_NAME         = 'Document'           # falls back to first existing if not found
CONTENT_FILE_TYPE_NAME    = 'xml'                # falls back to first existing if not found

# Namespace UUID used with uuid5() to turn the source's INT IDs into stable
# UUIDs. Generated once; do not change once data is loaded.
UUID_NAMESPACE = uuid.UUID('B0E11C9F-0000-4000-A000-000000000042')


# ---------------------------------------------------------------------------
# RTF decoder
# ---------------------------------------------------------------------------

def strip_rtf(raw: str) -> str:
    """Decode the TextEdit-style RTF wrapper into plain CSV text.

    Handles the escapes that show up in this file:
      * \\uNNNN  signed unicode codepoint (optional trailing space)
      * \\'XX    CP1252 byte (curly quotes, etc.)
      * \\par    paragraph break
      * \\<NL>   line continuation (used as row separator in this file)
      * control words (\\tab, \\f0, \\tx720, ...) are stripped
    """
    mark = '\\f0\\fs24 \\cf0 '
    idx = raw.find(mark)
    body = raw[idx + len(mark):] if idx >= 0 else raw
    body = body.rstrip().rstrip('}').rstrip()

    body = body.replace('\\\\', '\x00BS\x00')  # protect literal backslash

    def u_repl(m: re.Match) -> str:
        n = int(m.group(1))
        if n < 0:
            n += 0x10000
        return chr(n)
    body = re.sub(r'\\u(-?\d+) ?', u_repl, body)
    body = body.replace('\\uc0', '')

    def byte_repl(m: re.Match) -> str:
        return bytes([int(m.group(1), 16)]).decode('cp1252', errors='replace')
    body = re.sub(r"\\'([0-9a-fA-F]{2})", byte_repl, body)

    body = body.replace('\\{', '{').replace('\\}', '}').replace('\\par', '\n')
    body = re.sub(r'\\\s*\n', '\n', body)
    body = re.sub(r'\\[a-zA-Z]+-?\d*\s?', '', body)
    body = body.replace('\x00BS\x00', '\\')
    return combine_surrogate_pairs(body)


def combine_surrogate_pairs(s: str) -> str:
    """Merge adjacent UTF-16 surrogate halves into proper supplementary chars.

    RTF encodes non-BMP codepoints as two negative `\\uNNNN` escapes — a high
    surrogate (0xD800-0xDBFF) followed by a low surrogate (0xDC00-0xDFFF).
    Decoding them naively yields a Python string containing lone surrogates,
    which is technically invalid UTF-8/UTF-16 and explodes the moment pyodbc
    tries to send it to SQL Server as NVARCHAR. Walk the string, combine any
    properly paired surrogates into the supplementary codepoint they encode,
    and drop any unpaired survivors.
    """
    out: list[str] = []
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        cp = ord(ch)
        if 0xD800 <= cp <= 0xDBFF and i + 1 < n:
            cp2 = ord(s[i + 1])
            if 0xDC00 <= cp2 <= 0xDFFF:
                combined = ((cp - 0xD800) << 10) + (cp2 - 0xDC00) + 0x10000
                out.append(chr(combined))
                i += 2
                continue
            # high surrogate without a partner — drop it
            i += 1
            continue
        if 0xDC00 <= cp <= 0xDFFF:
            # orphan low surrogate — drop it
            i += 1
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


def int_to_uuid(int_id_str: str) -> uuid.UUID:
    return uuid.uuid5(UUID_NAMESPACE, int_id_str)


def nullable(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    s = val.strip()
    if s in ('', 'NULL'):
        return None
    return s


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def connect() -> pyodbc.Connection:
    cs = (
        'DRIVER={ODBC Driver 18 for SQL Server};'
        f'SERVER={DB_HOST},{DB_PORT};'
        f'DATABASE={DB_NAME};'
        f'UID={DB_USER};'
        f'PWD={DB_PASS};'
        f'TrustServerCertificate={"yes" if DB_TRUST else "no"};'
    )
    conn = pyodbc.connect(cs, autocommit=False)
    conn.timeout = 300
    return conn


def get_existing_uuid(cur, sql: str, *params) -> Optional[uuid.UUID]:
    cur.execute(sql, *params)
    row = cur.fetchone()
    return uuid.UUID(str(row[0])) if row else None


def resolve_or_pick(cur, friendly: str, sql_named: str, sql_first: str, name: str) -> uuid.UUID:
    """Look up by name; if not found, fall back to the first row in the table.

    The ContentType / ContentSourceType / ContentFileType tables are seeded
    by other parts of MJ — we don't want to silently invent rows there.
    """
    found = get_existing_uuid(cur, sql_named, name)
    if found:
        return found
    found = get_existing_uuid(cur, sql_first)
    if not found:
        raise RuntimeError(
            f'{friendly} table is empty and \'{name}\' was not found. '
            f'Seed at least one row before re-running.'
        )
    print(f'  [warn] {friendly} \'{name}\' not found; falling back to {found}')
    return found


def upsert_organization(cur, dry_run: bool) -> None:
    cur.execute('SELECT 1 FROM betty.Organization WHERE ID = ?', str(ORG_ID))
    if cur.fetchone():
        if not dry_run:
            cur.execute(
                'UPDATE betty.Organization SET Name = ? WHERE ID = ?',
                ORG_NAME, str(ORG_ID),
            )
        print(f'  Organization {ORG_NAME} ({ORG_ID}) already present')
        return
    print(f'  Creating Organization {ORG_NAME} ({ORG_ID})')
    if not dry_run:
        cur.execute(
            'INSERT INTO betty.Organization (ID, Name, Description) VALUES (?, ?, ?)',
            str(ORG_ID), ORG_NAME, 'Optica sample corpus for BettyNext testing.',
        )


def upsert_content_source(
    cur,
    content_source_type_id: uuid.UUID,
    content_type_id: uuid.UUID,
    content_file_type_id: uuid.UUID,
    dry_run: bool,
) -> None:
    cur.execute('SELECT 1 FROM __mj.ContentSource WHERE ID = ?', str(CONTENT_SOURCE_ID))
    if cur.fetchone():
        print(f'  ContentSource {CONTENT_SOURCE_NAME} ({CONTENT_SOURCE_ID}) already present')
        return
    print(f'  Creating ContentSource {CONTENT_SOURCE_NAME} ({CONTENT_SOURCE_ID})')
    if not dry_run:
        cur.execute(
            'INSERT INTO __mj.ContentSource ('
            ' ID, Name, ContentTypeID, ContentSourceTypeID, ContentFileTypeID, URL'
            ') VALUES (?, ?, ?, ?, ?, ?)',
            str(CONTENT_SOURCE_ID), CONTENT_SOURCE_NAME,
            str(content_type_id), str(content_source_type_id), str(content_file_type_id),
            'https://www.optica.org/',
        )


# ---------------------------------------------------------------------------
# Main import
# ---------------------------------------------------------------------------

def import_csv(csv_path: str, dry_run: bool, limit: Optional[int]) -> None:
    print(f'Reading {csv_path}')
    with open(csv_path, 'r', encoding='utf-8', errors='replace') as fh:
        raw = fh.read()
    cleaned = strip_rtf(raw)

    reader = csv.DictReader(io.StringIO(cleaned))
    rows = [r for r in reader if r.get('ID') and r['ID'].strip()]
    print(f'  Parsed {len(rows)} rows from CSV')

    # The sample CSV is a slice of a larger corpus: 8,877 of the 10,001 rows
    # are chunks whose ParentID points at an INT not present in the slice.
    # Promoting those orphan chunks to top-level (ParentID = NULL) keeps the
    # content searchable instead of throwing it away. The chunk hierarchy is
    # collapsed for these rows; for retrieval that's fine because each row
    # already carries full Text + Decorator + SourceIdentifier.
    row_ids = {r['ID'] for r in rows}
    flattened = 0
    for r in rows:
        if nullable(r['ParentID']) is not None and r['ParentID'] not in row_ids:
            r['ParentID'] = 'NULL'
            flattened += 1
    if flattened:
        print(f'  Flattened {flattened} chunk rows whose ParentID was outside this CSV slice (ParentID -> NULL)')

    # Ensure surviving real parents are inserted before their chunks.
    rows.sort(key=lambda r: 0 if nullable(r['ParentID']) is None else 1)

    if limit is not None:
        # When limiting, keep all parents referenced by the chosen children
        head = rows[:limit]
        parent_ids = {nullable(r['ParentID']) for r in head} - {None}
        # Add any parent rows that were dropped by the truncation
        kept_ids = {r['ID'] for r in head}
        extra = [r for r in rows[limit:] if r['ID'] in parent_ids and r['ID'] not in kept_ids]
        rows = extra + head
        print(f'  --limit {limit}: keeping {len(rows)} rows (incl. {len(extra)} extra parents)')

    print(f'\nConnecting to {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME} ...')
    conn = connect()
    cur = conn.cursor()
    cur.fast_executemany = True

    try:
        # Resolve / create the metadata rows that every imported item points at.
        print('\nResolving FK metadata rows ...')
        cst_id = resolve_or_pick(
            cur, 'ContentSourceType',
            'SELECT TOP 1 ID FROM __mj.ContentSourceType WHERE Name = ?',
            'SELECT TOP 1 ID FROM __mj.ContentSourceType ORDER BY Name',
            CONTENT_SOURCE_TYPE_NAME,
        )
        ct_id = resolve_or_pick(
            cur, 'ContentType',
            'SELECT TOP 1 ID FROM __mj.ContentType WHERE Name = ?',
            'SELECT TOP 1 ID FROM __mj.ContentType ORDER BY Name',
            CONTENT_TYPE_NAME,
        )
        cft_id = resolve_or_pick(
            cur, 'ContentFileType',
            'SELECT TOP 1 ID FROM __mj.ContentFileType WHERE Name = ?',
            'SELECT TOP 1 ID FROM __mj.ContentFileType ORDER BY Name',
            CONTENT_FILE_TYPE_NAME,
        )
        print(f'  ContentSourceType = {cst_id}')
        print(f'  ContentType       = {ct_id}')
        print(f'  ContentFileType   = {cft_id}')

        print('\nUpserting Organization + ContentSource ...')
        upsert_organization(cur, dry_run)
        upsert_content_source(cur, cst_id, ct_id, cft_id, dry_run)

        # Determine which IDs already live in each table — they're independent
        # because a previous interrupted run can leave __mj rows without their
        # betty partners (and vice versa).
        print('\nFetching existing ContentItem IDs ...')
        cur.execute('SELECT ID FROM __mj.ContentItem WHERE ContentSourceID = ?', str(CONTENT_SOURCE_ID))
        existing_mj = {uuid.UUID(str(r[0])) for r in cur.fetchall()}
        cur.execute('SELECT ID FROM betty.ContentItem WHERE OrganizationID = ?', str(ORG_ID))
        existing_betty = {uuid.UUID(str(r[0])) for r in cur.fetchall()}
        print(f'  __mj.ContentItem under Optica source: {len(existing_mj)}')
        print(f'  betty.ContentItem under Optica org:   {len(existing_betty)}')

        # Build the inserts.
        mj_inserts: list[tuple] = []
        betty_inserts: list[tuple] = []
        skipped_both = 0

        for r in rows:
            new_id = int_to_uuid(r['ID'])
            need_mj = new_id not in existing_mj
            need_betty = new_id not in existing_betty
            if not need_mj and not need_betty:
                skipped_both += 1
                continue

            title = nullable(r['Title'])
            if title and len(title) > 250:
                title = title[:247] + '...'

            text = nullable(r['Text'])
            decorator = nullable(r['Decorator'])
            if decorator and len(decorator) > 2000:
                decorator = decorator[:1997] + '...'
            source_identifier = nullable(r['SourceIdentifier']) or nullable(r['ContentLink']) or nullable(r['Link']) or r['ID']
            if len(source_identifier) > 2000:
                source_identifier = source_identifier[:2000]
            user_link = nullable(r['UserLink'])
            if user_link and len(user_link) > 2000:
                user_link = user_link[:2000]
            content_url = nullable(r['ContentLink']) or nullable(r['Link']) or source_identifier
            if len(content_url) > 2000:
                content_url = content_url[:2000]

            parent_int = nullable(r['ParentID'])
            parent_uuid = str(int_to_uuid(parent_int)) if parent_int else None

            if need_mj:
                mj_inserts.append((
                    str(new_id),
                    str(CONTENT_SOURCE_ID),
                    title,
                    None,                 # Description
                    str(ct_id),
                    str(cst_id),
                    str(cft_id),
                    None,                 # Checksum
                    content_url,
                    text,
                    'Pending',            # EmbeddingStatus
                    'Pending',            # TaggingStatus
                ))
            if need_betty:
                betty_inserts.append((
                    str(new_id),
                    str(ORG_ID),
                    decorator,
                    source_identifier,
                    user_link,
                    parent_uuid,
                ))

        print(
            f'\nPlanned: __mj inserts={len(mj_inserts)}  '
            f'betty inserts={len(betty_inserts)}  '
            f'fully-present={skipped_both}'
        )
        if not mj_inserts and not betty_inserts:
            print('Nothing to do.')
            return

        if dry_run:
            print('--dry-run set; not writing.')
            print('Sample first row:')
            print('  __mj.ContentItem:', mj_inserts[0])
            print('  betty.ContentItem:', betty_inserts[0])
            return

        # Insert in batches. fast_executemany massively cuts round-trips.
        batch = 500
        print('\nInserting __mj.ContentItem ...')
        sql_mj = (
            'INSERT INTO __mj.ContentItem ('
            '  ID, ContentSourceID, Name, Description, ContentTypeID,'
            '  ContentSourceTypeID, ContentFileTypeID, Checksum, URL, Text,'
            '  EmbeddingStatus, TaggingStatus'
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        for start in range(0, len(mj_inserts), batch):
            chunk = mj_inserts[start:start + batch]
            cur.executemany(sql_mj, chunk)
            conn.commit()
            print(f'  __mj.ContentItem +{len(chunk):>4} (total {start + len(chunk):>5}/{len(mj_inserts)})')

        print('\nInserting betty.ContentItem ...')
        sql_betty = (
            'INSERT INTO betty.ContentItem ('
            '  ID, OrganizationID, Decorator, SourceIdentifier, UserLink, ParentID'
            ') VALUES (?, ?, ?, ?, ?, ?)'
        )
        for start in range(0, len(betty_inserts), batch):
            chunk = betty_inserts[start:start + batch]
            cur.executemany(sql_betty, chunk)
            conn.commit()
            print(f'  betty.ContentItem +{len(chunk):>4} (total {start + len(chunk):>5}/{len(betty_inserts)})')

        # Sanity counts
        cur.execute('SELECT COUNT(*) FROM __mj.ContentItem WHERE ContentSourceID = ?', str(CONTENT_SOURCE_ID))
        mj_count = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM betty.ContentItem WHERE OrganizationID = ?', str(ORG_ID))
        betty_count = cur.fetchone()[0]
        cur.execute(
            'SELECT EmbeddingStatus, COUNT(*) FROM __mj.ContentItem '
            'WHERE ContentSourceID = ? GROUP BY EmbeddingStatus',
            str(CONTENT_SOURCE_ID),
        )
        emb_by = cur.fetchall()

        print('\nDone.')
        print(f'  __mj.ContentItem under Optica source: {mj_count}')
        print(f'  betty.ContentItem under Optica org:   {betty_count}')
        print('  EmbeddingStatus breakdown:')
        for status, n in emb_by:
            print(f'    {status:<12} {n}')

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', default=DEFAULT_CSV, help='Path to the Optica sample CSV (RTF or plain).')
    parser.add_argument('--dry-run', action='store_true', help='Parse + plan but do not write.')
    parser.add_argument('--limit', type=int, default=None, help='Insert at most N rows (smoke test).')
    args = parser.parse_args()

    if not os.path.exists(args.csv):
        print(f'ERROR: CSV not found: {args.csv}', file=sys.stderr)
        return 2

    import_csv(args.csv, args.dry_run, args.limit)
    return 0


if __name__ == '__main__':
    sys.exit(main())
