import fs from 'node:fs';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import sql from 'mssql';
import { confirm } from '@inquirer/prompts';
import { getValidatedConfig } from '../../config';
import { IsValidRepairId, MigrationMentionsId, ParseEntityRef } from '../../lib/repair-target';
import { FormatRowPreview } from '../../lib/row-preview';

/** Where a bare `--migration <filename>` is looked for when it is not a usable path. */
const MIGRATIONS_ROOT = 'migrations';

/** Bound on the search for a bare migration filename, so a stray root cannot walk a whole disk. */
const MAX_SEARCH_DEPTH = 6;

/**
 * Deletes ONE row that is blocking a migration (MJ#4503).
 *
 * Deliberately explicit: the operator names the row. For an irreversible
 * operation, having to state the target is the point, not friction. This never
 * searches for rows to delete and never deletes more than one.
 */
export default class MigrateRepair extends Command {
  static description =
    'Delete one row whose primary key collides with a row a migration is trying to create.';

  static examples = [
    '<%= config.bin %> <%= command.id %> --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType',
    '<%= config.bin %> <%= command.id %> --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType --migration V202608080752__v6.1.x__Metadata_Sync.sql',
  ];

  static flags = {
    id: Flags.string({ description: 'Primary key of the row to delete', required: true }),
    entity: Flags.string({ description: 'Schema-qualified table, e.g. __mj.CredentialType', required: true }),
    migration: Flags.string({
      description:
        'Optional path (or filename under ./migrations) of the failing migration. When given, the row is deleted only if its ID appears in that file; when omitted, that check does not run.',
    }),
    yes: Flags.boolean({ description: 'Skip the confirmation prompt', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MigrateRepair);

    if (!IsValidRepairId(flags.id)) {
      this.error(`--id must be a GUID; got '${flags.id}'`);
    }

    // Identifiers cannot be parameterised, so they are validated instead.
    const ref = ParseEntityRef(flags.entity);
    if (!ref) {
      this.error(
        `--entity must be schema-qualified using plain identifiers, e.g. __mj.CredentialType; got '${flags.entity}'`,
      );
    }
    const { Schema: schema, Table: table } = ref;

    // The spec's third refusal — "ID present but in an entity the failing
    // migration does not touch". This is the brake on the recognizer's
    // deliberate widening: it triggers on ANY single-GUID collision, so the
    // operator can arrive here holding a GUID from an unrelated failure.
    //
    // It is OPTIONAL rather than required because the migration file is not
    // always on disk: `mj migrate --tag` fetches its slice into a temp dir and
    // deletes it on exit, so requiring the file would strand the operators who
    // most need this. When it is not supplied, this refusal simply does not
    // bind — the help text says so.
    this.verifyMigrationMentionsId(flags.migration, flags.id);

    const config = getValidatedConfig();

    // `mj migrate` honours dbPlatform; this command speaks T-SQL only (the
    // collision it repairs is SQL Server error 2627), so it refuses rather
    // than pointing mssql at a PostgreSQL host.
    if (config.dbPlatform === 'postgresql') {
      this.error(
        "'mj migrate repair' supports SQL Server only, but dbPlatform is 'postgresql'. " +
          `Delete the row manually: DELETE FROM "${schema}"."${table}" WHERE "ID" = '${flags.id}';`,
      );
    }

    const pool = new sql.ConnectionPool({
      server: config.dbHost,
      port: config.dbPort,
      user: config.codeGenLogin,
      password: config.codeGenPassword,
      database: config.dbDatabase,
      options: {
        // Same settings `mj migrate` connects with (see lib/db-preflight.ts).
        // Deriving encrypt from the hostname instead would strand an operator
        // on a non-Azure server that requires encryption — exactly the person
        // the guidance just sent here.
        encrypt: config.dbEncrypt,
        trustServerCertificate: config.dbTrustServerCertificate,
      },
    });

    try {
      await pool.connect();

      const existing = await pool
        .request()
        .input('id', sql.UniqueIdentifier, flags.id)
        .query<Record<string, unknown>>(`SELECT * FROM [${schema}].[${table}] WHERE [ID] = @id`);

      if (existing.recordset.length === 0) {
        this.log(`No row with ID ${flags.id} in ${schema}.${table} — nothing to repair.`);
        return;
      }

      // This command promises never to delete more than one row. [ID] is the
      // primary key in every table this can legitimately target, so more than
      // one match means the assumption is wrong somewhere — refuse instead of
      // issuing a DELETE whose blast radius is unknown.
      if (existing.recordset.length !== 1) {
        this.error(
          `Refusing: ${existing.recordset.length} rows in ${schema}.${table} have ID ${flags.id}. ` +
            'This command deletes exactly one row; resolve this by hand.',
        );
      }

      // So the operator has something to recognise beyond the GUID they just
      // pasted from Task 2's guidance — see "If you do not recognise this
      // row, do NOT delete it" in FormatCollisionGuidance.
      const preview = FormatRowPreview(existing.recordset[0], existing.recordset.columns);
      this.log(`Row found in ${schema}.${table}:`);
      for (const line of preview) {
        this.log(`  ${line}`);
      }

      // @inquirer/prompts errors in a non-TTY, which is why --yes exists and why
      // the CI lane in Task 4 must pass it. See open-app-context.ts:136.
      if (!flags.yes) {
        const proceed = await confirm({
          message: `Delete row ${flags.id} from ${schema}.${table}? This cannot be undone.`,
          default: false,
        });
        if (!proceed) {
          this.log('Aborted. Nothing was deleted.');
          return;
        }
      }

      const deleted = await pool
        .request()
        .input('id', sql.UniqueIdentifier, flags.id)
        .query(`DELETE FROM [${schema}].[${table}] WHERE [ID] = @id`);

      // A row present at SELECT and gone at DELETE means something else removed
      // it in between. That is a no-op, not a repair, so do not tell the
      // operator to re-run as though the blocker were cleared by this command.
      const rowsAffected = deleted.rowsAffected[0] ?? 0;
      if (rowsAffected === 0) {
        this.log(
          `Row ${flags.id} was already gone from ${schema}.${table} by the time the delete ran — nothing was deleted.`,
        );
        return;
      }

      this.log(`Deleted ${rowsAffected} row from ${schema}.${table} (${flags.id}).`);
      this.log('Now re-run: mj migrate');
      this.log(
        'A migration can create more than one fixed-GUID row, so this may not be the only ' +
          'collision it has — if mj migrate fails again on a different row, the same repair applies to it too.',
      );
    } finally {
      await pool.close();
    }
  }

  /**
   * Refuses unless `id` appears in the migration named by `--migration`. A
   * no-op when the flag is absent. Runs before any database connection.
   */
  private verifyMigrationMentionsId(migrationFlag: string | undefined, id: string): void {
    if (!migrationFlag) return;

    const resolved = this.resolveMigrationPath(migrationFlag);
    if (!resolved) {
      this.error(
        `--migration '${migrationFlag}' was not found, either as a path or under ./${MIGRATIONS_ROOT}. ` +
          'Pass the path to the migration file, or omit --migration to skip the check that the row belongs to it.',
      );
    }

    const migrationSql = fs.readFileSync(resolved, 'utf8');
    if (!MigrationMentionsId(migrationSql, id)) {
      this.error(
        `Refusing: ${id} does not appear in ${resolved}. That migration does not create this row, ` +
          'so deleting it would not unblock the migration — check the ID against the failure output.',
      );
    }
  }

  /**
   * Resolves `--migration` to a readable file: the value as given when it is a
   * path, otherwise a search for that basename under `./migrations` (the
   * guidance prints a bare filename, since the failure output carries no path
   * the operator can rely on). Returns null when nothing matches.
   */
  private resolveMigrationPath(value: string): string | null {
    if (fs.existsSync(value) && fs.statSync(value).isFile()) return value;
    if (path.basename(value) !== value) return null;
    return this.findUnderMigrations(MIGRATIONS_ROOT, value, 0);
  }

  private findUnderMigrations(dir: string, filename: string, depth: number): string | null {
    if (depth > MAX_SEARCH_DEPTH || !fs.existsSync(dir)) return null;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) return full;
      if (entry.isDirectory()) {
        const found = this.findUnderMigrations(full, filename, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
}
