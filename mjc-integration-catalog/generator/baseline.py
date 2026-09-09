"""
String-aware extraction of objects from the MemberJunction v5.51.0 baseline migrations.

The baseline is a single ~180k-line file per dialect containing every DDL statement and every
metadata row. Naive regex over it is wrong in two specific ways this module handles:

  * a `;` or a `)` inside a string literal (descriptions contain both) truncates a statement,
    which silently yields a partial object that still looks plausible
  * SQL Server escapes a quote by doubling it, so a scanner that treats every `'` as a delimiter
    loses sync on any description containing an apostrophe — and several do

Every scanner here tracks string state and nesting depth for that reason.
"""
import re


def _scan_to_terminator(s, start, terminator=';'):
    """From `start`, return (text, index_of_terminator), string- and depth-aware."""
    i, depth, instr = start, 0, False
    while i < len(s):
        c = s[i]
        if instr:
            if c == "'":
                if i + 1 < len(s) and s[i + 1] == "'":
                    i += 2
                    continue
                instr = False
            i += 1
            continue
        if c == "'":
            instr = True
            i += 1
            continue
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
        elif c == terminator and depth == 0:
            return s[start:i], i
        i += 1
    return s[start:], len(s)


def split_tuples(block):
    """Split a VALUES block into its top-level `(...)` tuples."""
    out, depth, cur, i, instr = [], 0, [], 0, False
    while i < len(block):
        c = block[i]
        if instr:
            cur.append(c)
            if c == "'":
                if i + 1 < len(block) and block[i + 1] == "'":
                    cur.append("'")
                    i += 2
                    continue
                instr = False
            i += 1
            continue
        if c == "'":
            instr = True
            cur.append(c)
            i += 1
            continue
        if c == '(':
            depth += 1
            if depth == 1:
                cur = []
                i += 1
                continue
        elif c == ')':
            depth -= 1
            if depth == 0:
                out.append(''.join(cur))
                i += 1
                continue
        if depth > 0:
            cur.append(c)
        i += 1
    return out


def split_fields(t):
    """Split one tuple's body on top-level commas."""
    out, cur, instr, i, depth = [], [], False, 0, 0
    while i < len(t):
        c = t[i]
        if instr:
            cur.append(c)
            if c == "'":
                if i + 1 < len(t) and t[i + 1] == "'":
                    cur.append("'")
                    i += 2
                    continue
                instr = False
            i += 1
            continue
        if c == "'":
            instr = True
            cur.append(c)
            i += 1
            continue
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
        if c == ',' and depth == 0:
            out.append(''.join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(c)
        i += 1
    out.append(''.join(cur).strip())
    return out


class Baseline:
    def __init__(self, text, dialect):
        self.s = text
        self.dialect = dialect          # 'ss' | 'pg'

    # -- naming helpers ------------------------------------------------------
    def _obj(self, name):
        return f'[__mj].[{name}]' if self.dialect == 'ss' else f'__mj."{name}"'

    # -- table ---------------------------------------------------------------
    def create_table(self, table):
        head = f'CREATE TABLE {self._obj(table)}'
        i = self.s.index(head)
        body, end = _scan_to_terminator(self.s, i)
        return body.rstrip()

    def table_columns(self, table):
        """[(name, type_text, nullable, inline_default)] in declaration order."""
        body = self.create_table(table)
        inner = body[body.index('(') + 1:body.rindex(')')]
        cols = []
        for line in split_fields(inner):
            line = line.strip()
            if not line or line.upper().startswith('CONSTRAINT'):
                continue
            if self.dialect == 'ss':
                m = re.match(r'\[([^\]]+)\]\s+(.*)$', line)
            else:
                m = re.match(r'"([^"]+)"\s+(.*)$', line)
            if not m:
                continue
            name, rest = m.group(1), m.group(2).strip()
            nullable = not re.search(r'\bNOT\s+NULL\b', rest, re.I)
            dm = re.search(r'\bDEFAULT\s+(.*?)(?:\s+NOT\s+NULL|\s+NULL)?$', rest, re.I)
            default = dm.group(1).strip() if dm else None
            typ = re.split(r'\s+(?:COLLATE|DEFAULT|NOT\s+NULL|NULL)\b', rest, flags=re.I)[0].strip()
            cols.append((name, typ, nullable, default))
        return cols

    def table_constraints(self, table):
        body = self.create_table(table)
        inner = body[body.index('(') + 1:body.rindex(')')]
        return [l.strip() for l in split_fields(inner) if l.strip().upper().startswith('CONSTRAINT')]

    def alter_constraints(self, table):
        """Postgres puts constraints in separate ALTER TABLE statements, not inside CREATE TABLE.

        Returns [(constraint_name, full_statement)]. `ALTER TABLE ONLY` (used for PK/UQ) and plain
        `ALTER TABLE` (used for CHECK) are both matched, because the baseline uses both spellings
        for the same table.
        """
        if self.dialect != 'pg':
            return []
        out, pos = [], 0
        needle = 'ALTER TABLE '
        while True:
            i = self.s.find(needle, pos)
            if i == -1:
                break
            pos = i + 1
            head = self.s[i:i + 400]
            if f'__mj."{table}"' not in head.split('ADD CONSTRAINT')[0]:
                continue
            body, end = _scan_to_terminator(self.s, i)
            m = re.search(r'ADD CONSTRAINT "([^"]+)"', body)
            if m:
                out.append((m.group(1), body.strip() + ';'))
            pos = end
        return out

    def alter_defaults(self, table):
        """SQL Server only: the separate ALTER TABLE ... ADD CONSTRAINT [DF_...] statements."""
        if self.dialect != 'ss':
            return []
        pat = re.compile(
            r'ALTER TABLE \[__mj\]\.\[' + re.escape(table) + r'\] ADD CONSTRAINT \[([^\]]+)\] DEFAULT \((.*?)\) FOR \[([^\]]+)\];')
        return [(m.group(1), m.group(2), m.group(3)) for m in pat.finditer(self.s)]

    # -- routines ------------------------------------------------------------
    def routine(self, name):
        """The full CREATE VIEW / PROCEDURE / FUNCTION text for one object."""
        if self.dialect == 'ss':
            pat = re.compile(r'CREATE (?:VIEW|PROCEDURE|FUNCTION|TRIGGER) \[__mj\]\.\[' + re.escape(name) + r'\]')
        else:
            pat = re.compile(r'CREATE (?:OR REPLACE )?(?:VIEW|FUNCTION|TRIGGER) __mj\."' + re.escape(name) + r'"')
        m = pat.search(self.s)
        if not m:
            return None
        if self.dialect == 'ss':
            end = self.s.find('\nGO\n', m.start())
            return self.s[m.start():end if end != -1 else len(self.s)].rstrip()
        # Postgres: functions are $$-quoted; views end at the first top-level ';'
        seg = self.s[m.start():]
        dm = re.search(r'\$([A-Za-z_]*)\$', seg[:4000])
        if dm:
            tag = dm.group(0)
            first = seg.index(tag)
            second = seg.index(tag, first + len(tag))
            tail = seg.index(';', second)
            return seg[:tail + 1].rstrip()
        body, _ = _scan_to_terminator(seg, 0)
        return (body + ';').rstrip()

    # -- metadata rows -------------------------------------------------------
    def entity_field_rows(self, entity_id):
        """(columns, [row_values]) for every EntityField row of one entity, in Sequence order."""
        if self.dialect == 'ss':
            hdr = re.compile(r'INSERT INTO \[__mj\]\.\[EntityField\]\s*\(([^)]+)\)\s*VALUES', re.S)
            strip = lambda c: c.strip().strip('[]')
            cols = None
        else:
            # The Postgres baseline writes `INSERT INTO __mj."EntityField" VALUES` with NO column
            # list, so the tuple order is the table's PHYSICAL column order. Take it from the
            # table definition rather than assuming it matches SQL Server's — it does not have to.
            hdr = re.compile(r'INSERT INTO __mj\."EntityField"\s*(?:\(([^)]+)\)\s*)?VALUES', re.S)
            strip = lambda c: c.strip().strip('"')
            cols = [c[0] for c in self.table_columns('EntityField')]
        rows, pos = [], 0
        while True:
            m = hdr.search(self.s, pos)
            if not m:
                break
            if cols is None and m.group(1):
                cols = [strip(c) for c in m.group(1).split(',')]
            if cols is None:
                pos = m.end()
                continue
            block, end = _scan_to_terminator(self.s, m.end())
            for t in split_tuples(block):
                f = split_fields(t)
                if len(f) != len(cols):
                    continue
                if f[1].strip().lstrip('N').strip("'").upper() == entity_id.upper():
                    rows.append(f)
            pos = end
        if cols is None:
            return [], []
        si = cols.index('Sequence')
        rows.sort(key=lambda r: int(r[si]) if r[si].strip().isdigit() else 0)
        return cols, rows
