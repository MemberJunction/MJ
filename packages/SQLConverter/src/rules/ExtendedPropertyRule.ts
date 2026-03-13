import type { IConversionRule, ConversionContext, StatementType } from './types.js';

export class ExtendedPropertyRule implements IConversionRule {
  Name = 'ExtendedPropertyRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['EXTENDED_PROPERTY'];
  Priority = 90;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    // Strip BEGIN TRY wrapper: extract just the EXEC sp_addextendedproperty call.
    // For single-line positional params, match to end of line (handles ; inside strings).
    // For multi-line named params (@name=, @value=), use a broader extraction.
    let execSQL = sql;
    if (/BEGIN\s+TRY/i.test(sql)) {
      // Try single-line extraction first (handles semicolons in quoted strings)
      const singleLine = sql.match(/EXEC\s+sp_addextendedproperty\b(?:'(?:[^']|'')*'|[^'\n])*$/im);
      if (singleLine) {
        execSQL = singleLine[0];
      }
    }

    const schema = this.extractSchema(execSQL, context);

    // Try named parameters first: @name=N'...', @value=N'...'
    const namedResult = this.parseNamedParams(execSQL, schema);
    if (namedResult) return namedResult;

    // Try positional parameters:
    // EXEC sp_addextendedproperty N'MS_Description', N'value', 'SCHEMA', N'schema', 'TABLE', N'table' [, 'COLUMN', N'col']
    const positionalResult = this.parsePositionalParams(execSQL, schema);
    if (positionalResult) return positionalResult;

    // Comment out the entire batch so no executable SQL leaks through
    const commented = sql.split('\n').map(line => `-- ${line}`).join('\n');
    return `-- Extended property (could not parse)\n${commented}\n`;
  }

  /** Extract the schema name from the @level0name param, falling back to context.Schema */
  private extractSchema(sql: string, context: ConversionContext): string {
    const namedMatch = sql.match(/@level0name\s*=\s*N?'(\w+)'/i);
    if (namedMatch) return namedMatch[1];

    // Positional: 'SCHEMA', N'schemaName'
    const positionalMatch = sql.match(/'SCHEMA'\s*,\s*N?'(\w+)'/i);
    if (positionalMatch) return positionalMatch[1];

    return context.Schema;
  }

  private parseNamedParams(sql: string, schema: string): string | null {
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
      schema,
    );
  }

  private parsePositionalParams(sql: string, schema: string): string | null {
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
      schema,
    );
  }

  private buildComment(
    rawValue: string,
    level1Type: string,
    level1Name: string,
    level2Type: string | null,
    level2Name: string | null,
    schema: string,
  ): string {
    const value = rawValue.replace(/''/g, "'");
    const pgValue = value.replace(/'/g, "''");
    const type = level1Type.toUpperCase();

    if (level2Type && level2Name && level2Type.toUpperCase() === 'COLUMN') {
      return `COMMENT ON COLUMN ${schema}."${level1Name}"."${level2Name}" IS '${pgValue}';\n`;
    }

    if (type === 'TABLE') {
      return `COMMENT ON TABLE ${schema}."${level1Name}" IS '${pgValue}';\n`;
    }
    if (type === 'VIEW') {
      return `COMMENT ON VIEW ${schema}."${level1Name}" IS '${pgValue}';\n`;
    }
    if (type === 'PROCEDURE' || type === 'FUNCTION') {
      // PG doesn't support COMMENT ON FUNCTION without signature; skip these
      return `-- COMMENT ON FUNCTION ${schema}."${level1Name}" (procedure-level comment skipped)\n`;
    }

    return `COMMENT ON TABLE ${schema}."${level1Name}" IS '${pgValue}';\n`;
  }
}
