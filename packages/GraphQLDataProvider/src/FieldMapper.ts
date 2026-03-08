import { RegisterClass } from '@memberjunction/global';

/**
 * FieldMapper is used to map fields from one name to another. This is useful when we need to map
 * fields from one system to another, or when we need to map fields from one version of a system
 * to another. Uses an internal field mapping but may be overridden or extended as needed.
 */
export class FieldMapper {
  /**
   * Prefix used in database column names that must be transformed for GraphQL transport.
   * GraphQL reserves `__` as a prefix for introspection fields, so any column starting
   * with `__mj_` is mapped to `_mj__` for transport and mapped back on the client side.
   */
  private static readonly DB_PREFIX = '__mj_';
  private static readonly GQL_PREFIX = '_mj__';

  /**
   * Creates a new FieldMapper instance.
   */
  constructor() {}

  /**
   * Maps fields from one name to another mutating the object in place.
   * Any field starting with `__mj_` is renamed to `_mj__` for GraphQL transport.
   * @param obj The object to mutate
   */
  public MapFields(obj?: Record<string, unknown>) {
    if (obj) {
      for (const k in obj) {
        const mapped = this.MapFieldName(k);
        if (mapped !== k) {
          obj[mapped] = obj[k];
          delete obj[k];
        }
      }
    }
    return obj;
  }

  /**
   * Maps a field name for GraphQL transport. Fields starting with `__mj_` are
   * transformed to `_mj__` because GraphQL reserves the `__` prefix.
   * @param fieldName The field name to map.
   * @returns The mapped field name, or the original field name if no mapping is needed.
   */
  public MapFieldName(fieldName: string): string {
    if (fieldName.startsWith(FieldMapper.DB_PREFIX)) {
      return FieldMapper.GQL_PREFIX + fieldName.substring(FieldMapper.DB_PREFIX.length);
    }
    return fieldName;
  }

  /**
   * Reverse-maps a GraphQL field name back to the database column name.
   * Fields starting with `_mj__` are transformed back to `__mj_`.
   * @param fieldName The field name to reverse-map.
   * @returns The original database field name.
   */
  public ReverseMapFieldName(fieldName: string): string {
    if (fieldName.startsWith(FieldMapper.GQL_PREFIX)) {
      return FieldMapper.DB_PREFIX + fieldName.substring(FieldMapper.GQL_PREFIX.length);
    }
    return fieldName;
  }

  /**
   * Maps fields from one name to another mutating the object in place using the reverse mapping.
   * Any field starting with `_mj__` is renamed back to `__mj_`.
   * @param obj The object to mutate
   */
  public ReverseMapFields(obj: Record<string, unknown>) {
    for (const k in obj) {
      const reversed = this.ReverseMapFieldName(k);
      if (reversed !== k) {
        obj[reversed] = obj[k];
        delete obj[k];
      }
    }
    return obj;
  }
}
