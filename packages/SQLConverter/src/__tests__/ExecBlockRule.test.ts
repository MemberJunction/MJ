import { describe, it, expect } from 'vitest';
import { ExecBlockRule } from '../rules/ExecBlockRule.js';
import { createConversionContext } from '../rules/types.js';
import { POSTGRESQL_PROCEDURE_PARAM_LIMIT } from '../rules/ProcedureToFunctionRule.js';

const rule = new ExecBlockRule();

function convert(sql: string): string {
  const context = createConversionContext('tsql', 'postgres');
  return rule.PostProcess!(sql, sql, context);
}

/**
 * Build a DECLARE/SET/EXEC block in the shape mj-sync actually emits: ONE comma-separated
 * DECLARE (splitIntoBlocks starts a new block at every line-leading `DECLARE @`, so separate
 * DECLARE lines would be parsed as separate blocks), `SET` on its own line with the assignment
 * indented beneath it, and the EXEC appended to the final SET.
 */
function execBlock(procName: string, count: number, suffix = 'ab12'): string {
  const names = Array.from({ length: count }, (_, i) => `Col${i + 1}`);
  const declares = 'DECLARE ' + names.map(n => `@${n}_${suffix} NVARCHAR(MAX)`).join(',\n  ');
  const sets = names.map((n, i) => `SET\n  @${n}_${suffix} = N'v${i + 1}'`).join('\n');
  const args = names.map(n => `@${n} = @${n}_${suffix}`).join(',\n  ');
  return `${declares}\n${sets} EXEC [__mj].sp${procName} ${args}`;
}

describe('ExecBlockRule', () => {
  describe('metadata', () => {
    it('should have correct name, priority, and applies-to', () => {
      expect(rule.Name).toBe('ExecBlockRule');
      expect(rule.Priority).toBe(52);
      expect(rule.AppliesTo).toEqual(['EXEC_BLOCK']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  // The shape of a CRUD sproc (typed-arg vs single-JSONB-arg) is a property of the FUNCTION,
  // not of any one call. A T-SQL EXEC may omit parameters that carry defaults, and CodeGen
  // decides JSON-arg from the entity's PROJECTED parameter count -- which includes `_Clear`
  // companions that no call is obliged to pass. So a call's own argument count cannot settle
  // which shape exists in the target database.
  //
  // Regression: on v6.1.0-edge.3, adding Entity.Configuration pushed MJ: Entities over the
  // threshold. CodeGen projected 90 and emitted spUpdateEntity(p_data JSONB), dropping every
  // typed-arg overload; __mj.spUpdateEntity on SQL Server has 93 parameters; and the single
  // EXEC in that release's metadata sync passes 89. Deciding from 89 emitted a typed-arg call
  // against a JSONB-only function, and `mj migrate` failed with
  // `function __mj.spUpdateEntity(...) does not exist`.
  describe('CRUD sproc call shape (#edge3 spUpdateEntity regression)', () => {
    it('emits an apply-time pg_proc lookup when the call count does not settle the shape', () => {
      const result = convert(execBlock('UpdateEntity', 12));

      // Both shapes must be present, selected at apply time rather than at convert time.
      expect(result).toMatch(/IF EXISTS \(/);
      expect(result).toMatch(/FROM pg_proc p JOIN pg_namespace n ON n\.oid = p\.pronamespace/);
      expect(result).toMatch(/p\.proname = 'spUpdateEntity'/);
      expect(result).toMatch(/p\.pronargs = 1 AND p\.proargtypes\[0\] = 'jsonb'::regtype/);
      expect(result).toMatch(/PERFORM __mj\."spUpdateEntity"\(p_data := jsonb_build_object/);
      expect(result).toMatch(/ELSE/);
      expect(result).toMatch(/PERFORM __mj\."spUpdateEntity"\(p_Col1 :=/);
      expect(result).toMatch(/END IF;/);
    });

    it('scopes the lookup to the schema the call targets', () => {
      const result = convert(execBlock('UpdateEntity', 5));
      expect(result).toMatch(/n\.nspname = '__mj'/);
    });

    it('emits JSON-arg unconditionally when the CALL ALONE exceeds the limit', () => {
      // Above the limit no typed-arg function can exist on PostgreSQL at all, so there is
      // nothing to resolve -- emitting the lookup would be dead weight.
      const result = convert(execBlock('UpdateAIAgent', POSTGRESQL_PROCEDURE_PARAM_LIMIT + 5));
      expect(result).toMatch(/PERFORM __mj\."spUpdateAIAgent"\(p_data := jsonb_build_object/);
      expect(result).not.toMatch(/IF EXISTS \(/);
      expect(result).not.toMatch(/END IF;/);
    });

    it('covers the exact boundary the release tripped over -- 89 args, limit 90', () => {
      // 89 is below the limit, so the old `>` test chose typed-arg. The function was JSONB-only.
      expect(POSTGRESQL_PROCEDURE_PARAM_LIMIT).toBe(90);
      const result = convert(execBlock('UpdateEntity', 89));
      expect(result).toMatch(/p\.proargtypes\[0\] = 'jsonb'::regtype/);
      expect(result).toMatch(/p_data := jsonb_build_object/);
    });

    it('keeps the whole call inside the DO block it was already wrapped in', () => {
      const result = convert(execBlock('UpdateEntity', 6));
      const doIdx = result.indexOf('DO $mj$');
      const endIdx = result.indexOf('END $mj$;');
      const ifIdx = result.indexOf('IF EXISTS (');
      expect(doIdx).toBeGreaterThanOrEqual(0);
      expect(endIdx).toBeGreaterThan(ifIdx);
      expect(ifIdx).toBeGreaterThan(doIdx);
    });

    it('drops _Clear flags in the JSON branch but keeps them in the typed branch', () => {
      // In JSON-arg shape a PRESENT KEY means "set this column", so a separate _Clear flag is
      // meaningless -- that is the full-record semantics the metadata sync expresses. The typed
      // branch still has to pass them, because that function declares them.
      const sql = `DECLARE @Name_ab12 NVARCHAR(MAX),
  @Description_ab12 NVARCHAR(MAX)
SET
  @Name_ab12 = N'x'
SET
  @Description_ab12 = N'y' EXEC [__mj].spUpdateEntity @Name = @Name_ab12,
  @Description = @Description_ab12,
  @Description_Clear = 1`;
      const result = convert(sql);
      const jsonBranch = result.slice(result.indexOf('THEN'), result.indexOf('ELSE'));
      const typedBranch = result.slice(result.indexOf('ELSE'));
      expect(jsonBranch).not.toMatch(/'Description_Clear'/);
      expect(typedBranch).toMatch(/p_Description_Clear := TRUE/);
    });
  });
});
