/**
 * MigrationStatementSplitter — statement-level (GO-batch) classification.
 *
 * The banner-based `MigrationSplitter` works for *feature* migrations (hand-DDL +
 * CodeGen banner + generated block). It cannot handle **baselines** and other
 * old-style files, which are squashed snapshots with NO banners — tables, views,
 * sprocs, grants, and metadata INSERTs all flattened together, GO-separated.
 *
 * This classifier keys off GO-batch boundaries + the leading statement of each
 * batch (and, for routines, the object NAME), so it separates content uniformly
 * whether or not banners are present:
 *
 *   keep/transpile : CREATE/ALTER TABLE · CREATE INDEX/TYPE · CREATE ROLE/SCHEMA
 *                    · sp_addextendedproperty (→ COMMENT ON)
 *   drop+regenerate: CREATE VIEW/PROCEDURE/FUNCTION/TRIGGER whose name matches the
 *                    CodeGen convention (vw, spCreate, spUpdate, spDelete, fn, …)
 *                    + GRANT/REVOKE (CodeGen re-emits permissions)
 *   drop+reseed    : metadata INSERT/UPDATE/DELETE (Entity/EntityField/… regenerated
 *                    by CodeGen introspection; curated rows reseeded by `mj sync push`)
 *   flag           : CREATE PROCEDURE/FUNCTION/TRIGGER NOT matching the CodeGen
 *                    convention → hand-written, needs a human PG version
 *   noise          : PRINT/SET/USE/GO/IF @@ERROR batch-control
 */

export type StatementKind =
  | 'schema-ddl'       // tables, indexes, types — keep + transpile
  | 'comment'          // sp_addextendedproperty — keep, becomes COMMENT ON
  | 'role-setup'       // CREATE ROLE/SCHEMA/USER — keep
  | 'codegen-object'   // generated view/sproc/function/trigger — drop, regenerate
  | 'grant'            // GRANT/REVOKE/DENY — drop, regenerate
  | 'metadata-dml'     // INSERT/UPDATE/DELETE of metadata — drop, regenerate/reseed
  | 'hand-procedural'  // hand-written routine — flag for manual authoring
  | 'noise'            // PRINT/SET/USE/IF @@ERROR/empty — drop
  | 'unknown';         // unclassified — report

export interface StatementBatch {
  kind: StatementKind;
  /** Original SQL of the batch (verbatim, GO stripped). */
  sql: string;
  /** What matched (keyword / object name). */
  evidence: string;
}

const GO_SPLIT = /^[ \t]*GO[ \t]*;?[ \t]*$/im;

/** CodeGen routine/view/trigger naming conventions — these are regenerated, not translated. */
const CODEGEN_NAME = /^(spCreate|spUpdate|spDelete|spRecompile|vw|fn|trgUpdate|trgCreate|trgDelete|trg)/i;

/**
 * Hand-written objects whose names collide with the CodeGen conventions. CodeGen does
 * NOT regenerate these (they only exist in the baselines), so dropping them as
 * codegen-objects would silently lose them on PG. Names are matched case-insensitively.
 * Extend this list when a new custom `vw*`/`fn*` object is hand-authored in a migration.
 */
const HAND_WRITTEN_OBJECT_ALLOWLIST = new Set(['vwentitieswithexternalchangetracking']);

/**
 * Split SQL into GO batches and classify each by its leading statement.
 * Pure function — no I/O.
 */
export function splitByStatement(sql: string): StatementBatch[] {
  return sql
    .split(GO_SPLIT)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map(classifyBatch);
}

/** Classify one GO batch by its first meaningful statement. */
function classifyBatch(batch: string): StatementBatch {
  const code = stripLeadingNoise(batch);
  const head = code.slice(0, 200);

  if (/\bsp_addextendedproperty\b/i.test(batch)) {
    return { kind: 'comment', sql: batch, evidence: 'sp_addextendedproperty' };
  }
  if (/^\s*CREATE\s+TABLE\b/i.test(head)) return mk('schema-ddl', batch, 'CREATE TABLE');
  if (/^\s*ALTER\s+TABLE\b/i.test(head)) return mk('schema-ddl', batch, 'ALTER TABLE');
  if (/^\s*CREATE\s+(?:UNIQUE\s+)?(?:CLUSTERED\s+|NONCLUSTERED\s+)?INDEX\b/i.test(head)) return mk('schema-ddl', batch, 'CREATE INDEX');
  if (/^\s*CREATE\s+TYPE\b/i.test(head)) return mk('schema-ddl', batch, 'CREATE TYPE');
  if (/^\s*CREATE\s+(?:ROLE|SCHEMA|USER)\b/i.test(head)) return mk('role-setup', batch, 'CREATE ROLE/SCHEMA');

  const routine = head.match(/^\s*CREATE\s+(?:OR\s+ALTER\s+)?(VIEW|PROCEDURE|PROC|FUNCTION|TRIGGER)\b/i);
  if (routine) {
    const name = extractObjectName(head);
    if (name && HAND_WRITTEN_OBJECT_ALLOWLIST.has(name.toLowerCase())) {
      // Hand-written despite the codegen-style name — keep + transpile.
      return mk('schema-ddl', batch, `${routine[1]} ${name} (hand-written allowlist)`);
    }
    const isGenerated = !!name && CODEGEN_NAME.test(name);
    return isGenerated
      ? mk('codegen-object', batch, `${routine[1]} ${name}`)
      : mk('hand-procedural', batch, `${routine[1]} ${name ?? '?'}`);
  }

  if (/^\s*(?:GRANT|REVOKE|DENY)\b/i.test(head)) return mk('grant', batch, 'GRANT/REVOKE');
  // SQL Server allows `INSERT [table]` without INTO — metadata seeds use that form.
  if (/^\s*(?:INSERT\b|UPDATE\s|DELETE\s+FROM)/i.test(head)) return mk('metadata-dml', batch, 'INSERT/UPDATE/DELETE');
  if (/^\s*(?:PRINT|SET|USE|IF\s+@@ERROR)\b/i.test(head) || head.length === 0) {
    return mk('noise', batch, 'batch-control');
  }
  // DECLARE-led batches and dynamic SQL carry real statements (seed INSERTs, guarded
  // DDL) — they are NOT noise. Classify as unknown so they flow to the AST transpiler,
  // which either emits them or reports them in `unhandled`. Nothing silent.
  if (/^\s*(?:DECLARE|EXEC(?:UTE)?\s+sp_executesql)\b/i.test(head)) {
    return mk('unknown', batch, head.slice(0, 40).replace(/\s+/g, ' ').trim());
  }
  return mk('unknown', batch, head.slice(0, 40).replace(/\s+/g, ' ').trim());
}

/** Strip leading comment/PRINT/SET/IF-@@ERROR lines so the first real keyword is visible. */
function stripLeadingNoise(batch: string): string {
  const lines = batch.split('\n');
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('--') || /^PRINT\b/i.test(t) || /^SET\s+(NOEXEC|QUOTED_IDENTIFIER|ANSI_)/i.test(t) || /^IF\s+@@ERROR/i.test(t)) {
      i++;
    } else {
      break;
    }
  }
  return lines.slice(i).join('\n');
}

/** Pull the object name out of a CREATE VIEW/PROC/FUNCTION/TRIGGER header. */
function extractObjectName(head: string): string | undefined {
  const m = head.match(/CREATE\s+(?:OR\s+ALTER\s+)?(?:VIEW|PROCEDURE|PROC|FUNCTION|TRIGGER)\s+(?:\[?[\w${}:]+\]?\s*\.\s*)?\[?(\w+)\]?/i);
  return m?.[1];
}

function mk(kind: StatementKind, sql: string, evidence: string): StatementBatch {
  return { kind, sql, evidence };
}

/** Roll up a classified batch list into per-kind counts (for census/reporting). */
export function summarizeStatements(batches: StatementBatch[]): Record<StatementKind, number> {
  const out = {
    'schema-ddl': 0, comment: 0, 'role-setup': 0, 'codegen-object': 0,
    grant: 0, 'metadata-dml': 0, 'hand-procedural': 0, noise: 0, unknown: 0,
  } as Record<StatementKind, number>;
  for (const b of batches) out[b.kind]++;
  return out;
}
