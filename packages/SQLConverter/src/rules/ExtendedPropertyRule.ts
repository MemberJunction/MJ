import type { IConversionRule, ConversionContext, StatementType } from './types.js';

export class ExtendedPropertyRule implements IConversionRule {
  Name = 'ExtendedPropertyRule';
  AppliesTo: StatementType[] = ['EXTENDED_PROPERTY'];
  Priority = 90;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    // Strip BEGIN TRY...END TRY...BEGIN CATCH...END CATCH wrapper if present
    const execMatch = sql.match(/EXEC\s+sp_addextendedproperty\b[^;]*/is);
    const execSQL = execMatch ? execMatch[0] : sql;

    // Try named parameters first: @name=N'...', @value=N'...'
    const namedResult = this.parseNamedParams(execSQL);
    if (namedResult) return namedResult;

    // Try positional parameters:
    // EXEC sp_addextendedproperty N'MS_Description', N'value', 'SCHEMA', N'schema', 'TABLE', N'table' [, 'COLUMN', N'col']
    const positionalResult = this.parsePositionalParams(execSQL);
    if (positionalResult) return positionalResult;

    return `-- Extended property (could not parse)\n-- ${sql.slice(0, 200)}\n`;
  }

  private parseNamedParams(sql: string): string | null {
    const valueMatch = sql.match(/@value\s*=\s*N?'((?:[^']|'')*?)'/i);
    const level1TypeMatch = sql.match(/@level1type\s*=\s*N?'(\w+)'/i);
    const level1NameMatch = sql.match(/@level1name\s*=\s*N?'(\w+)'/i);
    const level2TypeMatch = sql.match(/@level2type\s*=\s*N?'(\w+)'/i);
    const level2NameMatch = sql.match(/@level2name\s*=\s*N?'(\w+)'/i);

    if (!valueMatch || !level1TypeMatch || !level1NameMatch) return null;

    return this.buildComment(
      valueMatch[1],
      level1TypeMatch[1],
      level1NameMatch[1],
      level2TypeMatch?.[1] ?? null,
      level2NameMatch?.[1] ?? null,
    );
  }

  private parsePositionalParams(sql: string): string | null {
    // Match positional: sp_addextendedproperty N'MS_Description', N'value', 'SCHEMA', N'schema', 'TABLE', N'table'[, 'COLUMN', N'col']
    const match = sql.match(
      /sp_addextendedproperty\s+N?'MS_Description'\s*,\s*N?'((?:[^']|'')*?)'\s*,\s*'SCHEMA'\s*,\s*N?'\w+'\s*,\s*'(\w+)'\s*,\s*N?'(\w+)'(?:\s*,\s*'(\w+)'\s*,\s*N?'(\w+)')?/i
    );

    if (!match) return null;

    return this.buildComment(
      match[1],       // value
      match[2],       // level1type (TABLE/VIEW)
      match[3],       // level1name
      match[4] ?? null, // level2type (COLUMN) or null
      match[5] ?? null, // level2name or null
    );
  }

  private buildComment(
    rawValue: string,
    level1Type: string,
    level1Name: string,
    level2Type: string | null,
    level2Name: string | null,
  ): string {
    const value = rawValue.replace(/''/g, "'");
    const pgValue = value.replace(/'/g, "''");
    const type = level1Type.toUpperCase();

    if (level2Type && level2Name && level2Type.toUpperCase() === 'COLUMN') {
      return `COMMENT ON COLUMN __mj."${level1Name}"."${level2Name}" IS '${pgValue}';\n`;
    }

    if (type === 'TABLE') {
      return `COMMENT ON TABLE __mj."${level1Name}" IS '${pgValue}';\n`;
    }
    if (type === 'VIEW') {
      return `COMMENT ON VIEW __mj."${level1Name}" IS '${pgValue}';\n`;
    }

    return `COMMENT ON TABLE __mj."${level1Name}" IS '${pgValue}';\n`;
  }
}
