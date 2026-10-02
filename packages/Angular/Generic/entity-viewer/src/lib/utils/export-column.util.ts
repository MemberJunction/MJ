import { IsDateOnlySQLType } from '@memberjunction/core';
import type { ColumnDataType } from '@memberjunction/export-engine';

/**
 * The export column type for a field's SQL type: how the export engine formats that column.
 *
 * Shared by the grid's export and every host's fallback export (the view workspace, Explorer's view
 * resource), so a view exports the same column the same way whichever view type is showing. A SQL
 * `date` is a calendar day (`dateonly`: `YYYY-MM-DD` in CSV and JSON, a date cell on the stored day in
 * Excel), as distinct from a timestamp (`date`: an instant). Untyped, a calendar day exported as a full
 * ISO timestamp from Cards, Map and Timeline while the grid exported the day.
 *
 * @param sqlType The field's SQL type (`EntityFieldInfo.Type`); absent maps to `string`
 */
export function ExportColumnTypeForSQLType(sqlType?: string | null): ColumnDataType {
  if (!sqlType) return 'string';

  const type = sqlType.toLowerCase();
  if (type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('numeric')) {
    return 'number';
  }
  if (IsDateOnlySQLType(type)) {
    return 'dateonly';
  }
  if (type.includes('date') || type.includes('time')) {
    return 'date';
  }
  if (type.includes('bit') || type.includes('bool')) {
    return 'boolean';
  }
  if (type.includes('money') || type.includes('currency')) {
    return 'currency';
  }
  return 'string';
}
