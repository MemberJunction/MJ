/**
 * The honest-serving migration's CodeGen tail carries hand edits that a regeneration of the tail would silently drop
 * (review R5, D4-72/D4-80): this test reads the shipped migration and fails when one is missing, so a regenerated tail
 * cannot land without them.
 *
 * - HAND EDIT (4): the `MJ: Latest Feature Values.EntityID` field is inserted with `AutoUpdateRelatedEntityInfo = 0`, so
 *   CodeGen's LLM decoration never infers a soft foreign key on it.
 * - HAND EDIT (5): the seven bounded-text columns of `MJ: ML Models` CodeGen may pick as the name field are pinned
 *   `AutoUpdateIsNameField = 0`.
 * - Deleted generated blocks: no "Set LLM-identified FKs" block for `MJ: Latest Feature Values`, and no
 *   `IsNameField = 1` on an `MJ: ML Models` column.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const MIGRATIONS = new URL('../../../../../../migrations/v6/', import.meta.url);
const LATEST_FEATURE_VALUES_ENTITY = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';
const ENTITY_ID_FIELD = 'b7f56029-cf28-434c-b31e-4c236fe48ed5';
const ML_MODELS_ENTITY = 'A3997636-011D-46E0-BC01-8B1E61E1087B';
/** The seven pinned `MJ: ML Models` columns, with the fixed `EntityField` IDs their migrations insert them under. */
const PINNED_NAME_CANDIDATES: Readonly<Record<string, string>> = {
  TargetVariable: '052aa3ef-9b41-44c7-ac90-f9039d30a625',
  ProblemType: '0cb9357a-8739-4cb4-80eb-1dd0c0a0d9a0',
  Status: '8b0c0799-d66a-48ba-987d-c32d477e2a28',
  ArtifactSha256: '53d76647-33d0-4f5f-860c-5ff4968e6429',
  SnapshotHash: 'e52dd2c2-0d59-4ffc-a9e9-90456a571e27',
  FeatureSchemaHash: '9bea6b10-2722-4ccf-8919-6cf80a634cdc',
  ArtifactStatus: '3d26a331-b246-4781-ab7e-5fc789ef4996',
};

/** The shipped honest-serving migration's text, found by name so a retime of its version does not break the test. */
function servingMigration(): string {
  const name = readdirSync(MIGRATIONS).find((f) => /^V\d+__v6\.\d+\.x__PS_Honest_Serving_Schema\.sql$/.test(f));
  if (!name) throw new Error('the PS_Honest_Serving_Schema migration is not in migrations/v6');
  return readFileSync(new URL(name, MIGRATIONS), 'utf8');
}

/** Splits a SQL list on its top-level commas (not inside parentheses or string literals), after dropping `--` comments. */
function topLevelItems(list: string): string[] {
  const text = list.replace(/--[^\n]*/g, '');
  const items: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const ch of text) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (!quoted && depth === 0 && ch === ',') {
      items.push(current.trim());
      current = '';
    } else current += ch;
  }
  items.push(current.trim());
  return items;
}

/** The value the guarded `EntityField` insert of `fieldId` gives `column`, or null when the insert or column is absent. */
function insertedFieldValue(sql: string, fieldId: string, column: string): string | null {
  const start = sql.indexOf(`WHERE ID = '${fieldId}'`);
  if (start < 0) return null;
  const block = sql.slice(start, sql.indexOf('END;', start));
  const match = /INSERT INTO [^(]+\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*)\)\s*$/.exec(block.trim());
  if (!match) return null;
  const columns = topLevelItems(match[1]);
  const values = topLevelItems(match[2]);
  const i = columns.indexOf(`[${column}]`);
  return i < 0 ? null : values[i];
}

describe('the honest-serving migration keeps its CodeGen-tail hand edits', () => {
  const sql = servingMigration();

  it('HAND EDIT (4): inserts MJ: Latest Feature Values.EntityID with AutoUpdateRelatedEntityInfo = 0', () => {
    expect(insertedFieldValue(sql, ENTITY_ID_FIELD, 'EntityID')).toBe(`'${LATEST_FEATURE_VALUES_ENTITY}'`);
    expect(insertedFieldValue(sql, ENTITY_ID_FIELD, 'AutoUpdateRelatedEntityInfo')).toBe('0');
  });

  it('HAND EDIT (5): pins every bounded-text MJ: ML Models name candidate AutoUpdateIsNameField = 0', () => {
    for (const name of Object.keys(PINNED_NAME_CANDIDATES)) {
      expect(sql).toContain(`UPDATE [\${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = '${ML_MODELS_ENTITY}' AND [Name] = N'${name}' AND [IsNameField] = 0;`);
    }
  });

  it('carries neither deleted generated block: no LLM-identified FKs on MJ: Latest Feature Values, no name field on MJ: ML Models', () => {
    expect(sql).not.toMatch(/Set LLM-identified FKs for MJ: Latest Feature Values/);
    for (const [name, fieldId] of Object.entries(PINNED_NAME_CANDIDATES)) {
      const pick = new RegExp(`SET\\s+IsNameField\\s*=\\s*1\\s+WHERE\\s+ID\\s*=\\s*'${fieldId}'`, 'i');
      expect(pick.test(sql), `CodeGen's IsNameField = 1 on MJ: ML Models.${name} is in the tail`).toBe(false);
    }
  });
});
