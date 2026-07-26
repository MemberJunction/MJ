/**
 * Extracts the `Application` IDs an Open App's OWN migrations declare (fixed-GUID
 * `spCreateApplication`) — the authoritative "owned by this app" signal for teardown.
 *
 * An `Application` is a UI navigation container: it has NO FK to the app's schema and often ZERO
 * `ApplicationEntity` links (link-less is the norm, even for core Applications), so it cannot be
 * found by walking entity links. The app's migrations (which create it with a fixed GUID) are the
 * reliable source of truth. Without this, a link-less nav Application survives removal and a
 * re-install's `spCreateApplication` collides on `PK_Application_ID`.
 *
 * KNOWN LIMITATION — SQL-Server-only patterns: the extraction regexes below are T-SQL-shaped
 * (`EXEC … @ID = …`, `N'…'` literals, `INSERT INTO [schema].[Application]` bracket quoting). A
 * PostgreSQL-flavored app migration won't match any of them, so on PostgreSQL this returns `[]` and
 * the link-less-nav-Application cleanup (this "Solution 2") does not apply — a PG app's link-less
 * Application can still survive removal. (The FK-graph metadata cascade — "Solution 1" — DOES have
 * full PG parity; only this migration-scan does not yet.) PG-flavored patterns are a follow-up.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** A SQL Server UNIQUEIDENTIFIER literal (8-4-4-4-12 hex). */
const GUID_SRC = '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}';

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collect the `Application` IDs a single migration's SQL creates, into `out` (lowercased). */
function collectApplicationIds(sql: string, out: Set<string>): void {
  // 1) `EXEC … spCreateApplication/spUpdateApplication @ID = <@var | 'literal'>, …`
  //    (MJ's `mj sync push` "Save MJ: Applications (core SP call only)" pattern). The @ID is
  //    usually a variable assigned earlier in the batch (`@ID_xxxx = 'GUID'`), sometimes a literal.
  const execRe = /sp(?:Create|Update)Application\b([\s\S]{0,4000}?)(?:\bGO\b|;|$)/gi;
  const idArgRe = new RegExp(`@ID\\s*=\\s*(@[A-Za-z0-9_]+|N?'(${GUID_SRC})')`, 'i');
  let m: RegExpExecArray | null;
  while ((m = execRe.exec(sql))) {
    const idArg = idArgRe.exec(m[1]);
    if (!idArg) continue;
    if (idArg[2]) {
      out.add(idArg[2].toLowerCase()); // literal @ID = 'GUID'
      continue;
    }
    // @ID = @variable → resolve the variable's assigned GUID anywhere in the same file.
    const asn = new RegExp(`${escapeRegExp(idArg[1])}\\s*=\\s*N?'(${GUID_SRC})'`, 'i').exec(sql);
    if (asn) out.add(asn[1].toLowerCase());
  }
  // 2) Defensive: a direct `INSERT INTO [..].[Application] (…) VALUES ('GUID', …)`.
  const insRe = new RegExp(
    `INSERT\\s+INTO\\s+[^\\n(]*\\[Application\\][^\\n(]*\\([^)]*\\)\\s*VALUES\\s*\\(\\s*N?'(${GUID_SRC})'`,
    'gi',
  );
  while ((m = insRe.exec(sql))) out.add(m[1].toLowerCase());
}

/**
 * Extract the `Application` IDs that an app's OWN migrations create. Returns lowercased, de-duped
 * GUIDs; `[]` when the directory is absent, unreadable, or declares no Applications.
 *
 * @param migrationsDir absolute path to the app's migrations directory
 */
export async function extractApplicationIds(migrationsDir: string): Promise<string[]> {
  let files: string[];
  try {
    files = (await fs.readdir(migrationsDir)).filter((f) => /\.sql$/i.test(f));
  } catch {
    return [];
  }
  const ids = new Set<string>();
  for (const file of files) {
    try {
      collectApplicationIds(await fs.readFile(path.join(migrationsDir, file), 'utf8'), ids);
    } catch {
      /* unreadable file — skip */
    }
  }
  return [...ids];
}
