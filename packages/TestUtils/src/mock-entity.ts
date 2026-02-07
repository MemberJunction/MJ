/**
 * Options for creating mock entity objects
 */
export interface MockEntityOptions {
  /** Whether the entity should report as saved (existing in DB) */
  isSaved?: boolean;
  /** Whether the entity should report as dirty */
  isDirty?: boolean;
}

/**
 * Creates a mock object that behaves like a BaseEntity with getter/setter properties.
 * Since BaseEntity uses getter/setters, the spread operator doesn't work on real entities.
 * This creates a Proxy-based mock that supports Get(), Set(), GetAll(), and property access.
 *
 * @param data Initial field values for the mock entity
 * @param options Configuration options for the mock's state
 * @returns A proxy object that behaves like a BaseEntity
 */
export function createMockEntity<T extends Record<string, unknown>>(
  data: T,
  options: MockEntityOptions = {}
): T & MockEntityMethods {
  const { isSaved = true, isDirty = false } = options;
  const fields = new Map<string, unknown>(Object.entries(data));
  const oldValues = new Map<string, unknown>(Object.entries(data));
  let dirty = isDirty;

  const methods: MockEntityMethods = {
    Get(fieldName: string): unknown {
      const lowerKey = [...fields.keys()].find(k => k.toLowerCase() === fieldName.toLowerCase());
      return lowerKey ? fields.get(lowerKey) : undefined;
    },
    Set(fieldName: string, value: unknown): void {
      fields.set(fieldName, value);
      dirty = true;
    },
    GetAll(): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      for (const [key, value] of fields) {
        result[key] = value;
      }
      return result;
    },
    get Dirty(): boolean {
      return dirty;
    },
    get IsSaved(): boolean {
      return isSaved;
    },
    get PrimaryKey() {
      return {
        KeyValuePairs: [{ FieldName: 'ID', Value: fields.get('ID') }],
        Values: () => String(fields.get('ID') ?? ''),
      };
    },
    async Save(): Promise<boolean> {
      dirty = false;
      return true;
    },
    async Delete(): Promise<boolean> {
      return true;
    },
  };

  return new Proxy(methods, {
    get(target, prop: string) {
      // Check methods first
      if (prop in target) {
        const val = target[prop as keyof MockEntityMethods];
        return val;
      }
      // Then check data fields
      const lowerProp = prop.toLowerCase();
      for (const [key, value] of fields) {
        if (key.toLowerCase() === lowerProp) {
          return value;
        }
      }
      return undefined;
    },
    set(_target, prop: string, value) {
      fields.set(prop, value);
      dirty = true;
      return true;
    },
  }) as T & MockEntityMethods;
}

export interface MockEntityMethods {
  Get(fieldName: string): unknown;
  Set(fieldName: string, value: unknown): void;
  GetAll(): Record<string, unknown>;
  readonly Dirty: boolean;
  readonly IsSaved: boolean;
  readonly PrimaryKey: { KeyValuePairs: Array<{ FieldName: string; Value: unknown }>; Values: () => string };
  Save(): Promise<boolean>;
  Delete(): Promise<boolean>;
}
