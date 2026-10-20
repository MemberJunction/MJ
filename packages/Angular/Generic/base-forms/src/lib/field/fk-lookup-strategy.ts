/**
 * The extension point for where the rows in a foreign-key dropdown come from.
 *
 * {@link MjFormFieldComponent} owns the dropdown itself — rendering, keyboard handling, the
 * column plan, the pinned current selection, the recent-picks group and the create-new footer.
 * A strategy owns only the rows, so an app can decide *which* records a given foreign key
 * should offer without forking the field.
 *
 * Registration is through `MJGlobal.ClassFactory`, most specific first:
 *
 * ```ts
 * // every foreign key that points at Organizations
 * @RegisterClass(FKLookupStrategy, 'MJ_BizApps_Common: Organizations')
 * export class PartyLookupStrategy extends FKLookupStrategy { ... }
 *
 * // just this one field on this one entity
 * @RegisterClass(FKLookupStrategy, 'MJ_BizApps_Orders: Orders.BillToOrganizationID')
 * export class BillToLookupStrategy extends PartyLookupStrategy { ... }
 * ```
 *
 * When nothing is registered the field uses `DefaultFKLookupStrategy`, which is MJ's own
 * behaviour and the case for almost every field in the system.
 */

import type { BaseEntity, EntityFieldInfo, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { MJGlobal, OptionalKeyedSpecialization } from '@memberjunction/global';

/** A small marker rendered beside a row's name, e.g. "4 orders". */
export interface FKLookupChip {
  Text: string;
  Tone?: 'default' | 'info' | 'warn';
}

/**
 * One row a strategy offers. `Values` must contain every field named in
 * {@link FKLookupContext.Fields} — the field maps those into the dropdown's columns, so a row
 * missing the primary key or the name field cannot be rendered or selected.
 */
export interface FKLookupRow {
  Values: Record<string, unknown>;
  /** Second line under the name, used to tell look-alikes apart, e.g. "Springfield, IL · northwind.example.org". */
  Secondary?: string;
  Chips?: FKLookupChip[];
}

/** A titled group of rows. `Label: null` renders the rows with no header. */
export interface FKLookupGroup {
  Key: string;
  Label: string | null;
  Rows: FKLookupRow[];
}

/**
 * Labels for the dropdown's scope toggle. `primary` names the narrow population the strategy
 * offers first ("Customers"); `all` names the wide one ("All organizations").
 */
export interface FKLookupScopeLabels {
  primary: string;
  all: string;
}

/** Which population the current lookup is over. Strategies decide what `primary` means. */
export type FKLookupScope = 'primary' | 'all';

/** Everything a strategy needs to answer one lookup. Rebuilt per keystroke. */
export interface FKLookupContext {
  /** The record being edited — the host of the foreign key, not the record being looked up. */
  Record: BaseEntity;
  /** The foreign-key field itself, carrying `RelatedEntityFilter` / `RelatedEntityOrderBy`. */
  FieldInfo: EntityFieldInfo;
  RelatedEntity: EntityInfo;
  Provider: IMetadataProvider;
  /** Fields the dropdown will read from each row: primary key, name, extra columns, icon. */
  Fields: string[];
  /** The related entity's primary key field name. */
  PkField: string;
  /** The related entity's name field name. */
  NameField: string;
  /**
   * The field the user is searching — the name field unless they chose another column on the
   * dropdown's scope pill. A typed query is matched against this column.
   */
  SearchField: string;
  /** What the user has typed. Empty when the dropdown was opened by focus. */
  Query: string;
  Scope: FKLookupScope;
  MaxRows: number;
  /**
   * From the field's `[FKLookupOptions]` input, plus `ExtraFilter` and `OrderBy` contributed by
   * `[FKExtraFilter]` / `[FKOrderBy]`. Opaque to the field; each strategy documents its own keys.
   */
  Options: Record<string, unknown>;
}

/**
 * Base class for a foreign-key lookup strategy. Subclass, implement {@link Lookup}, and register
 * it with `@RegisterClass(FKLookupStrategy, '<key>')` — see the module doc for the key forms.
 *
 * Marked `@OptionalKeyedSpecialization` because a keyed lookup landing on the base is the
 * designed outcome for nearly every foreign key in the system, not a failed resolution.
 */
@OptionalKeyedSpecialization()
export abstract class FKLookupStrategy {
  /**
   * Labels for the scope toggle, or null to hide it. Called before every {@link Lookup} so a
   * strategy can decide per field whether a second population is worth offering.
   */
  public ScopeLabels(_context: FKLookupContext): FKLookupScopeLabels | null {
    return null;
  }

  /**
   * The rows for the current query and scope, in the order they should render. Called for the
   * empty query too — that is the browse list the user sees on focus.
   */
  public abstract Lookup(context: FKLookupContext): Promise<FKLookupGroup[]>;

  /**
   * Runs after the user picks a row and before the value is written. Return false to cancel the
   * pick — used where choosing a record has a side effect the user should confirm first.
   */
  public async BeforeSelect(_context: FKLookupContext, _row: FKLookupRow): Promise<boolean> {
    return true;
  }

  /**
   * WHERE fragment the field applies when it hydrates the user's recent picks, so a record this
   * strategy's population no longer includes stops being offered under "Recent". Empty means no
   * filter beyond the primary-key list.
   */
  public RecentFilter(_context: FKLookupContext): string {
    return '';
  }

  /** Values to prefill when the user creates a new related record from the dropdown's footer. */
  public CreateDefaults(context: FKLookupContext): Record<string, unknown> {
    const typed = context.Query.trim();
    return typed ? { [context.NameField]: typed } : {};
  }
}

/** Trim + lowercase, so a registration can use whatever casing reads naturally. */
function normalizeKeyPart(value: string): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Resolve the strategy for one foreign key: a `<HostEntity>.<FieldName>` registration wins over a
 * `<RelatedEntity>` one. Returns null when neither exists, so the caller can fall back to
 * `DefaultFKLookupStrategy` rather than this module depending on it.
 */
export function ResolveFKLookupStrategy(
  hostEntityName: string,
  fieldName: string,
  relatedEntityName: string,
): FKLookupStrategy | null {
  const factory = MJGlobal.Instance.ClassFactory;
  const keys = [
    `${normalizeKeyPart(hostEntityName)}.${normalizeKeyPart(fieldName)}`,
    normalizeKeyPart(relatedEntityName),
  ];
  for (const key of keys) {
    if (!factory.GetRegistration(FKLookupStrategy, key)) {
      continue;
    }
    const resolution = factory.TryCreateInstance<FKLookupStrategy>(FKLookupStrategy, key);
    if (resolution.Resolved && resolution.Instance) {
      return resolution.Instance;
    }
  }
  return null;
}
