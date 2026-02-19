import type { IConversionRule, ConversionContext, StatementType } from './types.js';

export class ExtendedPropertyRule implements IConversionRule {
  Name = 'ExtendedPropertyRule';
  AppliesTo: StatementType[] = ['EXTENDED_PROPERTY'];
  Priority = 90;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    // Extract sp_addextendedproperty parameters
    // Common pattern: EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'...',
    //   @level0type=N'SCHEMA', @level0name=N'__mj',
    //   @level1type=N'TABLE', @level1name=N'TableName'
    //   [, @level2type=N'COLUMN', @level2name=N'ColumnName']

    const valueMatch = sql.match(/@value\s*=\s*N?'((?:[^']|'')*?)'/i);
    const level1TypeMatch = sql.match(/@level1type\s*=\s*N?'(\w+)'/i);
    const level1NameMatch = sql.match(/@level1name\s*=\s*N?'(\w+)'/i);
    const level2TypeMatch = sql.match(/@level2type\s*=\s*N?'(\w+)'/i);
    const level2NameMatch = sql.match(/@level2name\s*=\s*N?'(\w+)'/i);

    if (!valueMatch || !level1TypeMatch || !level1NameMatch) {
      return `-- Extended property (could not parse)\n-- ${sql.slice(0, 200)}\n`;
    }

    const value = valueMatch[1].replace(/''/g, "'");
    const level1Type = level1TypeMatch[1].toUpperCase();
    const level1Name = level1NameMatch[1];
    // Escape single quotes in value for PG
    const pgValue = value.replace(/'/g, "''");

    if (level2TypeMatch && level2NameMatch) {
      // Column-level comment
      const level2Type = level2TypeMatch[1].toUpperCase();
      const level2Name = level2NameMatch[1];
      if (level2Type === 'COLUMN') {
        return `COMMENT ON COLUMN __mj."${level1Name}"."${level2Name}" IS '${pgValue}';\n`;
      }
    }

    // Table/View level comment
    if (level1Type === 'TABLE') {
      return `COMMENT ON TABLE __mj."${level1Name}" IS '${pgValue}';\n`;
    }
    if (level1Type === 'VIEW') {
      return `COMMENT ON VIEW __mj."${level1Name}" IS '${pgValue}';\n`;
    }

    return `COMMENT ON TABLE __mj."${level1Name}" IS '${pgValue}';\n`;
  }
}
