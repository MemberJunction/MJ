import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sql from 'mssql';
import { SafeJSONParse } from '@memberjunction/global';
import { BulkLoader } from './bulk-load';
import { DatasetStamp } from './stamp';

export interface LoadSummary {
  Table: string;
  Rows: number;
  People: number;
  Ms: number;
}

interface WorldManifest {
  rowCount: number;
  seed?: number;
}

/** Bulk loader for W1–W9 world seeds into `pstruth.W<n>_Person` and `pstruth.W<n>_MembershipYear` / `W9_EventRegistration`. */
export class WorldLoader {
  public static Prefix(worldId: string): string {
    const m = /^(W[1-9])\b/.exec(worldId);
    if (!m) {
      throw new Error(`Invalid world ID '${worldId}' (expected W1..W9 prefix)`);
    }
    return m[1]!;
  }

  public static RowTable(worldId: string): string {
    const prefix = WorldLoader.Prefix(worldId);
    return prefix === 'W9' ? 'W9_EventRegistration' : `${prefix}_MembershipYear`;
  }

  public static PersonTable(worldId: string): string {
    const prefix = WorldLoader.Prefix(worldId);
    return `${prefix}_Person`;
  }

  /** Delete existing rows of this world's tables, bulk-load `people.csv` and `rows.csv`, check row count and constraints, and stamp both tables. */
  public static async LoadSeed(pool: sql.ConnectionPool, worldId: string, dir: string): Promise<LoadSummary> {
    const t0 = performance.now();
    const rowTable = WorldLoader.RowTable(worldId);
    const personTable = WorldLoader.PersonTable(worldId);
    await BulkLoader.AssertDirectSqlOptIn(pool, rowTable);
    await BulkLoader.AssertDirectSqlOptIn(pool, personTable);

    const manifest = SafeJSONParse<WorldManifest>(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (!manifest || typeof manifest.rowCount !== 'number') {
      throw new Error(`Invalid or missing manifest.json in ${dir}`);
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).query(`DELETE FROM pstruth.[${rowTable}]; DELETE FROM pstruth.[${personTable}];`);
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    const peopleCount = await BulkLoader.LoadCsvFile(pool, personTable, path.join(dir, 'people.csv'));
    await BulkLoader.LoadCsvFile(pool, rowTable, path.join(dir, 'rows.csv'));

    await pool
      .request()
      .query(
        `ALTER TABLE pstruth.[${personTable}] WITH CHECK CHECK CONSTRAINT ALL; ALTER TABLE pstruth.[${rowTable}] WITH CHECK CHECK CONSTRAINT ALL;`,
      );

    const countRes = await pool.request().query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM pstruth.[${rowTable}]`);
    const actualRows = Number(countRes.recordset[0]?.cnt ?? 0);
    if (actualRows !== manifest.rowCount) {
      throw new Error(
        `WorldLoader.LoadSeed(${worldId}): loaded row count ${actualRows} differs from manifest rowCount ${manifest.rowCount}`,
      );
    }

    const rowsSha = createHash('sha256')
      .update(readFileSync(path.join(dir, 'rows.csv')))
      .digest('hex');
    const seedTag = path.basename(dir).startsWith('seed-')
      ? path.basename(dir)
      : `seed-${manifest.seed ?? 'unknown'}`;
    const stampVal = `${worldId}/${seedTag}#${rowsSha}`;
    await DatasetStamp.Write(pool, personTable, stampVal);
    await DatasetStamp.Write(pool, rowTable, stampVal);

    return {
      Table: `pstruth.${rowTable}`,
      Rows: actualRows,
      People: peopleCount,
      Ms: Math.round(performance.now() - t0),
    };
  }
}
