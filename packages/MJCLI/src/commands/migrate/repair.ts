import { Command, Flags } from '@oclif/core';
import sql from 'mssql';
import { confirm } from '@inquirer/prompts';
import { getValidatedConfig } from '../../config';
import { IsValidRepairId, ParseEntityRef } from '../../lib/repair-target';
import { FormatRowPreview } from '../../lib/row-preview';

/**
 * Deletes ONE row that is blocking a migration (MJ#4503).
 *
 * Deliberately explicit: the operator names the row. For an irreversible
 * operation, having to state the target is the point, not friction. This never
 * searches for rows to delete and never deletes more than one.
 */
export default class MigrateRepair extends Command {
  static description =
    'Delete one row that blocks a migration because it was created ahead of the migration chain.';

  static examples = [
    '<%= config.bin %> <%= command.id %> --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType',
  ];

  static flags = {
    id: Flags.string({ description: 'Primary key of the row to delete', required: true }),
    entity: Flags.string({ description: 'Schema-qualified table, e.g. __mj.CredentialType', required: true }),
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

    const config = getValidatedConfig();
    const pool = new sql.ConnectionPool({
      server: config.dbHost,
      port: config.dbPort,
      user: config.codeGenLogin,
      password: config.codeGenPassword,
      database: config.dbDatabase,
      options: {
        encrypt: config.dbHost.includes('.database.windows.net'),
        trustServerCertificate: config.dbTrustServerCertificate ?? true,
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

      this.log(`Deleted ${deleted.rowsAffected[0]} row from ${schema}.${table} (${flags.id}).`);
      this.log('Now re-run: mj migrate');
    } finally {
      await pool.close();
    }
  }
}
