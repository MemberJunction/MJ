import { BaseSingleton } from '@memberjunction/global';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Per (host-entity, FK-column) user overrides for the foreign-key search dropdown
 * rendered by {@link MjFormFieldComponent}. Every field is optional — an entry
 * exists only for the specific dropdowns a user has actively customized. Most users
 * never customize anything, so the stored blob stays tiny (often empty).
 */
export interface LinkedFieldOption {
  /**
   * Related-entity field code name to search against. When unset, the dropdown
   * searches the related entity's Name field (the default).
   */
  searchField?: string;
  /**
   * Related-entity field code name to sort the dropdown by. `null` (or unset) means
   * natural order (whatever order the cache / DB returned).
   */
  sortField?: string | null;
  /** Sort direction; only meaningful when {@link sortField} is set. */
  sortDir?: 'asc' | 'desc';
  /**
   * User-resized column widths in pixels, keyed by related-entity field code name
   * (the Name column uses its own field code name as the key). Columns the user
   * never resized are absent and fall back to content-based sizing.
   */
  colWidths?: Record<string, number>;
  /**
   * Ordered list of extra-column field code names to display (besides the always-shown
   * Name column). When set, fully overrides the default `DefaultInView`-derived columns —
   * letting the user add normally-hidden fields (e.g. ID) or remove default ones.
   * `undefined` = use the default column set. An empty array = only the Name column.
   */
  visibleFields?: string[];
}

/**
 * The whole preference blob: a map of `"<hostEntity>|<fkField>"` (lowercased) →
 * {@link LinkedFieldOption}. Persisted as a single `MJ: User Settings` row so we
 * never spam the settings table with one key per field.
 */
export type LinkedFieldUserOptions = Record<string, LinkedFieldOption>;

/**
 * Reads/writes the user's per-FK-dropdown preferences (search scope, sort, column
 * widths) through {@link UserInfoEngine} — server-side, cross-device, never
 * `localStorage`. All writes are debounced (UI handlers can fire freely).
 *
 * Everything funnels through ONE settings key ({@link STORAGE_KEY}); reads are
 * synchronous in-memory cache hits via `UserInfoEngine.GetSetting`, so calling
 * `Get(...)` on every focus is cheap.
 *
 * Implemented as a {@link BaseSingleton} so the in-process parse cache is shared.
 */
export class LinkedFieldOptionsStore extends BaseSingleton<LinkedFieldOptionsStore> {
  /** The single User Settings key holding the entire preference blob (v1 shape). */
  private static readonly STORAGE_KEY = 'mj.linkedFieldUserOptions.v1';

  protected constructor() {
    super();
  }

  public static get Instance(): LinkedFieldOptionsStore {
    return super.getInstance<LinkedFieldOptionsStore>();
  }

  /** Compose the per-field map key from the host entity + FK column names. */
  private buildKey(entityName: string, fieldName: string): string {
    return `${(entityName ?? '').trim().toLowerCase()}|${(fieldName ?? '').trim().toLowerCase()}`;
  }

  /** Parse the full blob from the user setting (empty object when unset / malformed). */
  private readAll(): LinkedFieldUserOptions {
    const raw = UserInfoEngine.Instance.GetSetting(LinkedFieldOptionsStore.STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as LinkedFieldUserOptions) : {};
    } catch {
      return {};
    }
  }

  /** Persist the full blob (debounced fire-and-forget). */
  private writeAll(all: LinkedFieldUserOptions): void {
    UserInfoEngine.Instance.SetSettingDebounced(
      LinkedFieldOptionsStore.STORAGE_KEY,
      JSON.stringify(all)
    );
  }

  /** Read the saved options for a (host entity, FK field) pair, or undefined. */
  public Get(entityName: string, fieldName: string): LinkedFieldOption | undefined {
    if (!entityName || !fieldName) return undefined;
    return this.readAll()[this.buildKey(entityName, fieldName)];
  }

  /** Merge a shallow patch into a field's options and persist. */
  private patch(entityName: string, fieldName: string, mutate: (o: LinkedFieldOption) => void): void {
    if (!entityName || !fieldName) return; // no host context → don't persist
    const all = this.readAll();
    const key = this.buildKey(entityName, fieldName);
    const opt: LinkedFieldOption = { ...(all[key] ?? {}) };
    mutate(opt);
    all[key] = opt;
    this.writeAll(all);
  }

  /** Persist the user's chosen search scope field for this dropdown. */
  public SetSearchField(entityName: string, fieldName: string, searchField: string): void {
    this.patch(entityName, fieldName, o => { o.searchField = searchField; });
  }

  /** Persist the user's chosen sort column + direction (or clear with sortField=null). */
  public SetSort(entityName: string, fieldName: string, sortField: string | null, sortDir: 'asc' | 'desc'): void {
    this.patch(entityName, fieldName, o => { o.sortField = sortField; o.sortDir = sortDir; });
  }

  /** Persist one column's resized width (px), merging into any existing widths. */
  public SetColWidth(entityName: string, fieldName: string, colField: string, width: number): void {
    this.patch(entityName, fieldName, o => {
      o.colWidths = { ...(o.colWidths ?? {}), [colField]: Math.round(width) };
    });
  }

  /** Persist the user's chosen set/order of visible extra columns. */
  public SetVisibleFields(entityName: string, fieldName: string, fields: string[]): void {
    this.patch(entityName, fieldName, o => { o.visibleFields = [...fields]; });
  }
}
