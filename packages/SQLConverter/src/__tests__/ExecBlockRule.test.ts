import { describe, it, expect } from 'vitest';
import { ExecBlockRule } from '../rules/ExecBlockRule.js';
import { CreateConversionContext } from '../rules/types.js';
import { POSTGRESQL_PROCEDURE_PARAM_LIMIT } from '../rules/ProcedureToFunctionRule.js';

const rule = new ExecBlockRule();

function convert(sql: string): string {
  const context = CreateConversionContext('tsql', 'postgres');
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

    it('lower-cases an unquoted schema, which is how PostgreSQL stores it (#5864)', () => {
      const sql = execBlock('UpdateEntity', 5).replace('[__mj]', '[__mj_BizAppsSales]');
      expect(convert(sql)).toMatch(/n\.nspname = '__mj_bizappssales'/);
    });

    it('keeps the case of a quoted schema (#5864)', () => {
      const sql = execBlock('UpdateEntity', 5).replace('[__mj]', '"MixedCase"');
      const result = convert(sql);
      expect(result).toMatch(/n\.nspname = 'MixedCase'/);
      expect(result).toMatch(/PERFORM "MixedCase"\."spUpdateEntity"/);
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

// Since the 6.2 cycle mj-sync emits a record it may or may not already hold as a create-or-update:
// the last SET is followed (on the same line) by IF NOT EXISTS (…) BEGIN EXEC spCreate… END ELSE
// BEGIN EXEC spUpdate… END. The rule only knew one EXEC per block, so the guard was swallowed into
// the preceding SET value and raw T-SQL reached the PL/pgSQL output — 64 blocks across the two
// 6.2.0-edge.0 Metadata_Syncs, and neither file applied on PostgreSQL.
describe('ExecBlockRule — mj-sync create-or-update (IF NOT EXISTS … ELSE …)', () => {
  const upsert = [
    '-- Save MJ: AI Vendors (core SP call only)',
    'DECLARE @ID_af78 UNIQUEIDENTIFIER,',
    '@Name_af78 NVARCHAR(50),',
    '@CredentialTypeID_af78 UNIQUEIDENTIFIER',
    'SET',
    "  @ID_af78 = '5F935B01-EC5F-4409-AADC-8063A94936D6'",
    'SET',
    "  @Name_af78 = N'Sakana AI'",
    'SET',
    "  @CredentialTypeID_af78 = '3F0C13AB-EF5F-4260-A50A-D66DDEC25270' IF NOT EXISTS (",
    '    SELECT',
    '      1',
    '    FROM',
    '      [__mj].[AIVendor]',
    '    WHERE',
    '      [ID] = @ID_af78',
    '  )',
    'BEGIN',
    'EXEC [__mj].spCreateAIVendor @ID = @ID_af78,',
    '  @Name = @Name_af78,',
    '  @CredentialTypeID = @CredentialTypeID_af78',
    'END ELSE',
    'BEGIN',
    'EXEC [__mj].spUpdateAIVendor @ID = @ID_af78,',
    '  @Name = @Name_af78,',
    '  @CredentialTypeID = @CredentialTypeID_af78',
    'END;',
  ].join('\n');

  it('keeps the last SET value clean — the guard is not swallowed into it', () => {
    const out = convert(upsert);
    expect(out).toContain("p_CredentialTypeID_af78 := '3F0C13AB-EF5F-4260-A50A-D66DDEC25270';");
  });

  it('emits a PL/pgSQL IF NOT EXISTS … THEN create … ELSE update … END IF with no T-SQL left', () => {
    const out = convert(upsert);
    expect(out).toMatch(/IF NOT EXISTS \(SELECT 1 FROM __mj\."AIVendor" WHERE "ID" = p_ID_af78\) THEN/);
    expect(out).toMatch(/THEN[\s\S]*PERFORM __mj\."spCreateAIVendor"\([\s\S]*ELSE[\s\S]*PERFORM __mj\."spUpdateAIVendor"\([\s\S]*END IF;/);
    expect(out).not.toMatch(/\[__mj\]|\bEXEC\b|\bBEGIN\s*\n\s*EXEC/);
    expect(out).not.toContain('SKIPPED');
  });

  /** A create-or-update block whose guard is not the `[c] = @v` shape the rule converts. */
  const unconvertibleGuard = upsert.replace('[ID] = @ID_af78', '[ID] = @ID_af78 OR [Name] = @Name_af78');

  describe('comments after the closing END (#6337)', () => {
    const footer = [
      '',
      '',
      '-- End of SQL Logging Session',
      '-- Session ID: d342985b-e1d0-4880-9a4c-d62a692eba26',
      '-- Total Statements: 14',
      '',
    ].join('\n');

    it('converts a last save followed by the session footer, and keeps the footer', () => {
      const out = convert(`${upsert}\n${footer}`);
      expect(out).toMatch(/THEN[\s\S]*PERFORM __mj\."spCreateAIVendor"\([\s\S]*ELSE[\s\S]*PERFORM __mj\."spUpdateAIVendor"\([\s\S]*END IF;/);
      expect(out).not.toMatch(/\bEXEC\b|SKIPPED/);
      expect(out).toContain('-- End of SQL Logging Session');
    });

    it('converts a save whose closing END carries a comment on the same line', () => {
      const out = convert(`${upsert} -- last save`);
      expect(out).toMatch(/PERFORM __mj\."spUpdateAIVendor"\(/);
      expect(out).not.toMatch(/\bEXEC\b|SKIPPED/);
    });

    it('stays linear on a dashed comment after the END when a statement follows it', () => {
      const started = performance.now();
      const out = convert(`${upsert}\n-- ${'-'.repeat(46)}\nSELECT 1`);
      expect(performance.now() - started).toBeLessThan(2000);
      expect(out).toContain('-- SKIPPED: EXEC block (unparseable upsert)');
    });

    it('leaves a batch of comments alone', () => {
      expect(convert('-- End of SQL Logging Session\n-- Duration: 5833ms')).toBe('-- End of SQL Logging Session\n-- Duration: 5833ms');
    });

    it('leaves a block comment alone, with line comments around it or a save after it', () => {
      const banner = '/*****\n* BEGIN METADATA SYNC\n*****/';
      expect(convert(`-- before\n${banner}\n-- after`)).toBe(`-- before\n${banner}\n-- after`);

      const out = convert(`${banner}\n\n${upsert}`);
      expect(out).toContain(banner);
      expect(out).toMatch(/PERFORM __mj\."spUpdateAIVendor"\(/);
      expect(out).not.toContain('SKIPPED');
    });

    it('does not take an unterminated block comment for a comment', () => {
      expect(convert('/* never closed\nSELECT 1')).toContain('-- SKIPPED: EXEC block');
    });
  });

  describe('a block that is not convertible as a whole (#6337)', () => {
    it('skips it instead of emitting a DO block holding raw T-SQL', () => {
      const out = convert(unconvertibleGuard);
      expect(out).toContain('-- SKIPPED: EXEC block (unparseable upsert)');
      expect(out).not.toMatch(/^DO \$/m);
      expect(out).not.toMatch(/^\s*BEGIN\s*$/m);
    });

    it('skips a parsed create-or-update that uses an undeclared variable', () => {
      const out = convert(upsert.replace('@ID_af78 UNIQUEIDENTIFIER,\n', ''));
      expect(out).toContain('-- SKIPPED: EXEC block (unparseable upsert)');
      expect(out).not.toMatch(/^DO \$/m);
    });

    it('does not mistake the guard text inside a string value for a guard', () => {
      const out = convert([
        'DECLARE @ID_ab12 UNIQUEIDENTIFIER,',
        '@Notes_ab12 NVARCHAR(MAX)',
        'SET',
        "  @ID_ab12 = '5F935B01-EC5F-4409-AADC-8063A94936D6'",
        'SET',
        "  @Notes_ab12 = N'Wrap it: IF NOT EXISTS (SELECT 1 FROM t) BEGIN x END' EXEC [__mj].spUpdateWidget @ID = @ID_ab12,",
        '  @Notes = @Notes_ab12',
      ].join('\n'));
      expect(out).toMatch(/PERFORM __mj\."spUpdateWidget"\(/);
      expect(out).not.toContain('SKIPPED');
    });
  });
});

/**
 * mj sync push logs a lookup-keyed ID as a subquery on the natural key (#6069). The SET value is
 * converted inside the `DO $mj$` block, where the PostProcessor's bracket pass never reaches, so
 * the rule converts its identifiers itself (#6074).
 */
describe('ExecBlockRule — SET value holding a subquery (#6074)', () => {
  const SUBQUERY_BLOCK = [
    'DECLARE @ID_ab12 UNIQUEIDENTIFIER,',
    '  @Name_ab12 NVARCHAR(MAX)',
    'SET',
    "  @ID_ab12 = (SELECT [ID] FROM [__mj].[Widget] WHERE LOWER([Name]) = LOWER(N'Widgets') AND [EntityID] = (SELECT [ID] FROM [${mjSchema}].[Entity] WHERE LOWER([Name]) = LOWER(N'MJ: Widgets')))",
    'SET',
    "  @Name_ab12 = N'see [__mj].[Widget]' EXEC [__mj].spUpdateWidget @ID = @ID_ab12,",
    '  @Name = @Name_ab12',
  ].join('\n');

  it('converts the bracket identifiers of the subquery', () => {
    const out = convert(SUBQUERY_BLOCK);
    expect(out).toContain(
      `p_ID_ab12 := (SELECT "ID" FROM __mj."Widget" WHERE LOWER("Name") = LOWER('Widgets') AND "EntityID" = (SELECT "ID" FROM \${mjSchema}."Entity" WHERE LOWER("Name") = LOWER('MJ: Widgets')));`
    );
  });

  it('leaves brackets inside a string literal alone', () => {
    expect(convert(SUBQUERY_BLOCK)).toContain("p_Name_ab12 := 'see [__mj].[Widget]';");
  });
});

// The last save of an mj-sync log carries the logger's session trailer after its `END;`. The
// upsert parser needs the block to end in `END`, so with the trailer attached the block fell to
// the single-EXEC path and came out as half-converted T-SQL (issue #6097). The same fixture pins
// that BIT and numeric SETs survive the upsert form (issue #5918).
describe('ExecBlockRule — last save with the logger trailer (issues #6097, #5918)', () => {
  const lastSave = [
    '-- Save MJ: AI Models (core SP call only)',
    'DECLARE @ID_a4e2b58a01b1 UNIQUEIDENTIFIER,',
    '@Name_a4e2b58a01b1 NVARCHAR(50),',
    '@PowerRank_a4e2b58a01b1 INT,',
    '@IsActive_a4e2b58a01b1 BIT,',
    '@InputCost_a4e2b58a01b1 DECIMAL(18, 6)',
    'SET',
    "  @ID_a4e2b58a01b1 = '7955CA7C-9599-48AB-B62F-519228ECE31E'",
    'SET',
    "  @Name_a4e2b58a01b1 = N'Placeholder Model'",
    'SET',
    '  @PowerRank_a4e2b58a01b1 = 150',
    'SET',
    '  @IsActive_a4e2b58a01b1 = 1',
    'SET',
    '  @InputCost_a4e2b58a01b1 = 0.125 IF NOT EXISTS (',
    '    SELECT 1 FROM [__mj].[AIModel] WHERE [ID] = @ID_a4e2b58a01b1',
    '  )',
    'BEGIN',
    'EXEC [__mj].spCreateAIModel @ID = @ID_a4e2b58a01b1,',
    '  @Name = @Name_a4e2b58a01b1,',
    '  @PowerRank = @PowerRank_a4e2b58a01b1,',
    '  @IsActive = @IsActive_a4e2b58a01b1,',
    '  @InputCost = @InputCost_a4e2b58a01b1',
    'END ELSE',
    'BEGIN',
    'EXEC [__mj].spUpdateAIModel @ID = @ID_a4e2b58a01b1,',
    '  @Name = @Name_a4e2b58a01b1,',
    '  @PowerRank = @PowerRank_a4e2b58a01b1,',
    '  @IsActive = @IsActive_a4e2b58a01b1,',
    '  @InputCost = @InputCost_a4e2b58a01b1',
    'END;',
    '',
    '',
    '-- End of SQL Logging Session',
    '-- Session ID: 00000000-0000-0000-0000-000000000000',
    '-- Total Statements: 1',
  ].join('\n');

  it('converts the block as an upsert, with no T-SQL left', () => {
    const out = convert(lastSave);
    expect(out).toMatch(/IF NOT EXISTS \(SELECT 1 FROM __mj\."AIModel" WHERE "ID" = p_ID_a4e2b58a01b1\) THEN/);
    expect(out).toContain('END IF;');
    expect(out).not.toMatch(/\bBEGIN\s*\n\s*EXEC|\[__mj\]/);
    expect(out).not.toContain('SKIPPED');
  });

  it('keeps the trailer, after the converted block', () => {
    const out = convert(lastSave);
    expect(out.indexOf('-- End of SQL Logging Session')).toBeGreaterThan(out.indexOf('END $mj$;'));
    expect(out).toContain('-- Total Statements: 1');
  });

  it('keeps BIT, integer and decimal values (issue #5918)', () => {
    const out = convert(lastSave);
    expect(out).toContain('p_IsActive_a4e2b58a01b1 := TRUE;');
    expect(out).toContain('p_PowerRank_a4e2b58a01b1 := 150;');
    expect(out).toContain('p_InputCost_a4e2b58a01b1 := 0.125;');
  });

  it("leaves N''x'' inside a stored query's literal alone (issue #5838)", () => {
    const sql = [
      'DECLARE @SQL_ab12 NVARCHAR(MAX), @ID_ab12 UNIQUEIDENTIFIER',
      'SET',
      "  @SQL_ab12 = N'SELECT ISNULL(a, 0) FROM t WHERE n = N''x'''",
      'SET',
      "  @ID_ab12 = '7955CA7C-9599-48AB-B62F-519228ECE31E'",
      'EXEC [__mj].spUpdateQuery @ID = @ID_ab12, @SQL = @SQL_ab12',
    ].join('\n');
    expect(convert(sql)).toContain("p_SQL_ab12 := 'SELECT ISNULL(a, 0) FROM t WHERE n = N''x''';");
  });
});
