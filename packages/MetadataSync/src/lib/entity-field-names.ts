import type { BaseEntity } from '@memberjunction/core';

/** The entity's spelling of a field name, matched without case; undefined when the entity has no such field. */
export function EntityFieldName(entity: BaseEntity, name: string): string | undefined {
  return entity.GetFieldByName(name)?.Name;
}

/** The field names a record file sets, checked without case. */
export class RecordFieldNames {
  private readonly names: Set<string>;

  constructor(fields: Record<string, unknown> | undefined) {
    this.names = new Set(Object.keys(fields ?? {}).map((name) => name.toLowerCase()));
  }

  /** True when the record sets `name` in any case. */
  Has(name: string): boolean {
    return this.names.has(name.toLowerCase());
  }
}
