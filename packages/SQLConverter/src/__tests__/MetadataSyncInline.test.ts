import { describe, it, expect } from 'vitest';
import { ConvertMigration, ExtractKeptTSQL, IsMetadataSyncLog } from '../MigrationConverter.js';
import type { TSQLToPGTranspiler } from '../MigrationConverter.js';
import { ClassifyBatch } from '../rules/StatementClassifier.js';

/**
 * #5543: an mj-sync log on the split / bake path is converted inline (one DO block per save)
 * instead of becoming a "re-seeded by `mj sync push`" marker, and an Open App's
 * `[${mjSchema}].sp…` core calls convert with the placeholder kept (decision pg.1, A).
 */
const noTranspiler: TSQLToPGTranspiler = {
  async transpile() {
    throw new Error('an mj-sync log must not reach the AST transpiler');
  },
};

/** One mj-sync save of `fields` values against a core entity, as an Open App's log writes it. */
function coreSave(suffix: string, fields: string[]): string {
  const declares = fields.map((f) => `@${f}_${suffix} NVARCHAR(255)`).concat([`@ID_${suffix} UNIQUEIDENTIFIER`]);
  const sets = fields.map((f, i) => `SET\n  @${f}_${suffix} = N'value ${i}'`).concat([
    `SET\n  @ID_${suffix} = (SELECT [ID] FROM [\${mjSchema}].[Entity] WHERE LOWER([Name]) = LOWER(N'Accounts'))`,
  ]);
  const args = fields.map((f) => `@${f} = @${f}_${suffix}`).concat([`@ID = @ID_${suffix}`]);
  return [
    '-- Save MJ: Entities (core SP call only)',
    `DECLARE ${declares.join(',\n')}`,
    sets.join('\n'),
    `EXEC [\${mjSchema}].spUpdateEntity ${args.join(',\n  ')};`,
    '',
  ].join('\n');
}

/** Three core saves carrying 61 values in all — the shape of the bizapps-common occurrence. */
function openAppSyncLog(): string {
  const fields = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
  return [
    '-- MJ sync log (placeholder data)',
    coreSave('a1', fields(20, 'Description')),
    coreSave('b2', fields(20, 'DisplayName')),
    coreSave('c3', fields(18, 'Icon')),
  ].join('\nGO\n');
}

describe('[${mjSchema}] core calls classify as EXEC blocks', () => {
  it('a DECLARE block calling [${mjSchema}].spUpdateEntity is an EXEC_BLOCK once the placeholder is protected', () => {
    // The legacy pipeline protects `[${mjSchema}].` before classification; the classifier then
    // sees a schema-qualified EXEC.
    const batch = coreSave('z9', ['Description']).replaceAll('[${mjSchema}]', '[__mj_core_schema_placeholder__]');
    expect(ClassifyBatch(batch)).toBe('EXEC_BLOCK');
  });
});

describe('mj-sync log on the split path (#5543 item 1)', () => {
  it('is recognised as a sync log', () => {
    expect(IsMetadataSyncLog(ExtractKeptTSQL(openAppSyncLog(), 'V202611042220__v5.60.x__Metadata_Sync.sql'))).toBe(true);
  });

  it('converts every save inline with all its values, not a marker', async () => {
    const r = await ConvertMigration(openAppSyncLog(), 'V202611042220__v5.60.x__Metadata_Sync.sql', {
      transpiler: noTranspiler,
      schema: '__mj_BizAppsCommon',
      coreSchema: '__mj',
      includeHeader: false,
    });
    expect(r.status).toBe('converted');
    expect(r.unhandled).toEqual([]);
    expect(r.pgSQL).not.toMatch(/re-seeded/i);
    expect(r.pgSQL.match(/^DO \$mj\$/gm)).toHaveLength(3);
    // 20 + 20 + 18 field values plus the three IDs: 61 values reach the output.
    expect(r.pgSQL.match(/'value \d+'/g)).toHaveLength(58);
    expect(r.pgSQL.match(/p_ID_(?:a1|b2|c3) :=/g)).toHaveLength(3);
    expect(r.pgSQL).toContain('__mj."spUpdateEntity"');
    expect(r.pgSQL).not.toContain('${mjSchema}');
    expect(r.reconciliation.emittedStatements).toBe(3);
  });

  it('a save the legacy pipeline cannot convert is a reported gap', async () => {
    const broken = '-- Save MJ: Entities (core SP call only)\nPRINT \'not a save\'\n';
    const r = await ConvertMigration(`${openAppSyncLog()}\nGO\n${broken}`, 'V1__Metadata_Sync.sql', {
      transpiler: noTranspiler,
      includeHeader: false,
    });
    expect(r.status).toBe('needs-hand-authoring');
    expect(r.unhandled.some((u) => u.snippet.includes('MISSING SAVES'))).toBe(true);
  });
});
