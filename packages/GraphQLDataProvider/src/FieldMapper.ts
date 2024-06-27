import { RegisterClass } from '@memberjunction/global';

/**
 * FieldMapper is used to map fields from one name to another. This is useful when we need to map
 * fields from one system to another, or when we need to map fields from one version of a system
 * to another. Uses an internal field mapping but may be overridden or extended as needed.
 */
export class FieldMapper {
  private _fieldMap: Record<string, string> = {
    __mj_CreatedAt: '_mj__CreatedAt',
    __mj_UpdatedAt: '_mj__UpdatedAt',
  };

  /**
   * Creates a new FieldMapper instance.
   * @param fieldMap An optional field map to use for mapping fields. If not provided, the default field map will be used.
   */
  constructor(fieldMap?: Record<string, string>) {
    this._fieldMap = fieldMap;
  }

  /**
   * Maps fields from one name to another mutating the object in place.
   * @param obj The object to mutate
   */
  public MapFields(obj: Record<string, unknown>) {
    for (const k in obj) {
      if (k in this._fieldMap) {
        obj[this._fieldMap[k]] = obj[k];
        delete obj[k];
      }
    }
    return obj;
  }

  /**
   * Maps a field name from one name to another.
   * @param fieldName The field name to map.
   * @returns The mapped field name, or the original field name if no mapping is found.
   */
  public MapFieldName(fieldName: string): string {
    return this._fieldMap[fieldName] ?? fieldName;
  }

  /**
   * Maps a field name from one name to another using the reverse mapping.
   * @param fieldName The field name to map.
   * @returns The mapped field name, or the original field name if no mapping is found.
   */
  public ReverseMapFieldName(fieldName: string): string {
    return Object.entries(this._fieldMap).find(([k, v]) => v === fieldName)?.[0] ?? fieldName;
  }

  /**
   * Maps fields from one name to another mutating the object in place using the reverse mapping.
   * @param obj The object to mutate
   */
  public ReverseMapFields(obj: Record<string, unknown>) {
    const reversed = Object.fromEntries(Object.entries(this._fieldMap).map(([k, v]) => [v, k]));
    for (const k in obj) {
      if (k in reversed) {
        obj[reversed[k]] = obj[k];
        delete obj[k];
      }
    }
    return obj;
  }
}
