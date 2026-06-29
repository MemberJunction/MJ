import { Type, EventEmitter } from '@angular/core';
import { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';

/**
 * View-Type Plugin Architecture — Contracts
 * -----------------------------------------
 * This file defines the framework-level contracts for the entity-viewer's pluggable
 * view-type system. A "view type" is a way of rendering a set of entity records — the
 * built-in ones being Grid, Cards, Timeline, and Map, with future additions like
 * Cluster and Tag Cloud.
 *
 * The design separates three concerns:
 *   1. {@link IViewTypeDescriptor} — metadata + availability + the component types to mount.
 *      Descriptors are discovered at runtime via the {@link https MemberJunction ClassFactory}
 *      keyed off the `DriverClass` stored in the `MJ: View Types` entity.
 *   2. {@link IViewRenderer} — the contract a renderer component honors so the host can
 *      feed it data and listen for selection/open/config events uniformly.
 *   3. {@link IViewPropSheet} — the contract a configuration prop-sheet component honors.
 *
 * Because this lives in an Angular package, it is acceptable for the descriptor to reference
 * Angular's `Type<T>` (it points at the concrete component classes to instantiate).
 */

/**
 * Framework-agnostic-ish descriptor for a single view type.
 *
 * A descriptor is the bridge between the `MJ: View Types` metadata row (which stores
 * the `DriverClass` name) and the concrete Angular components that actually render the
 * view and edit its configuration. Descriptors are registered with the ClassFactory via
 * `@RegisterClass(BaseViewTypeDescriptor, '<DriverClass>')` so they can be discovered by
 * name without a hard import from the host.
 */
export interface IViewTypeDescriptor {
  /**
   * Stable internal key for the view type — matches the `DriverClass` column on the
   * `MJ: View Types` entity and the `@RegisterClass` registration key
   * (e.g. "GridViewType", "CardsViewType").
   */
  readonly Name: string;

  /** User-facing label shown in the view-mode switcher (e.g. "Grid", "Tag Cloud"). */
  readonly DisplayName: string;

  /** Font Awesome icon class shown in the switcher (e.g. "fa-solid fa-table"). */
  readonly Icon: string;

  /**
   * The Angular component class that renders this view type. The host instantiates /
   * mounts this component and feeds it data per the {@link IViewRenderer} contract.
   */
  readonly RendererComponent: Type<unknown>;

  /**
   * Optional Angular component class for this view type's configuration prop-sheet
   * (honors {@link IViewPropSheet}). Undefined when the view type has no configurable
   * options.
   */
  readonly PropSheetComponent?: Type<unknown>;

  /**
   * When `true`, this view type's `config.gridState` is backed by the **canonical**
   * `UserView.GridState` column (the single, framework-wide store for a view's
   * columns / sort / filter / aggregates — also read by `MJUserViewEntity.Columns`,
   * the GraphQL data provider's field list, and export) rather than by an opaque
   * per-view-type blob in `DisplayState.viewTypeConfigs`.
   *
   * The container honors this by (a) seeding the renderer's `config.gridState` from
   * the canonical store and (b) routing the renderer's `configChanged.gridState`
   * back to it on persist. This keeps the grid, the config panel, the server query,
   * and export all reading/writing one source of truth. Defaults to `false`, so
   * non-grid view types (Cards/Timeline/Map) keep their opaque per-type config.
   */
  readonly UsesCanonicalGridState?: boolean;

  /**
   * Predicate that decides whether this view type is available for a given entity.
   * For example, Timeline requires a date field; Map requires geocoding support.
   * Grid and Cards are always available.
   *
   * @param entity the entity the viewer is currently displaying
   * @param provider optional metadata provider (for multi-provider scenarios)
   */
  IsAvailableFor(entity: EntityInfo, provider?: IMetadataProvider): boolean;

  /**
   * Optional async hook to load any data this descriptor's {@link IsAvailableFor} predicate
   * depends on (e.g. the Cluster view type needs the set of entities that have an active
   * Entity Document with vectors). The host awaits this once — before computing availability —
   * so the synchronous predicate can read from a now-populated cache. Implementations should
   * be cheap/idempotent (typically `await SomeEngine.Instance.Config(false, ...)`). Omit when
   * availability is computable purely from the {@link EntityInfo} (Grid/Cards/Timeline/Map).
   *
   * @param provider optional metadata provider (for multi-provider scenarios)
   */
  EnsureAvailabilityData?(provider?: IMetadataProvider): Promise<void>;
}

/**
 * Contract honored by a view renderer component. The host binds these inputs and
 * subscribes to these outputs uniformly across all view types.
 *
 * @typeParam TConfig the shape of this view type's configuration object
 */
export interface IViewRenderer<TConfig = unknown> {
  /** The entity whose records are being rendered. */
  entity: EntityInfo | null;

  /** The records to render (already loaded/filtered by the host). */
  records: Record<string, unknown>[];

  /** Primary-key string of the currently selected record, if any. */
  selectedRecordId: string | null;

  /** Active filter text (for highlighting / client-side concerns). */
  filterText: string | null;

  /** View-type-specific configuration. */
  config: TConfig;

  /**
   * Optional: the metadata provider, handed to plug-ins that issue their own data calls
   * (multi-provider safety). Generic — not specific to any one view type.
   */
  provider?: IMetadataProvider | null;

  /**
   * Optional generic data-context the host supplies alongside {@link records}. These are
   * universal "a view of records" concepts (counts, current page, loading) — NOT specific to any
   * view type — so a renderer that paginates or shows a total can read them, and one that doesn't
   * simply ignores them. The host owns the actual data fetch; these describe its current result.
   */
  totalRecordCount?: number;
  /** One-based current page of {@link records} when the host is paginating. */
  page?: number;
  /** Page size the host is using. */
  pageSize?: number;
  /** Whether the host is currently (re)loading the record set. */
  isLoading?: boolean;

  /** Emitted when a record is selected (single click). Payload is the raw record object. */
  recordSelected: EventEmitter<unknown>;

  /**
   * Emitted when THIS entity's record should be opened (double-click / open). Payload is the raw
   * record. This is a NAVIGATION request — the only category of signal that legitimately bubbles
   * to the outer app (routing lives there). Everything else a view does (export, add-to-list,
   * delete, …) is self-contained in the plug-in via Generic dialogs and never bubbles up.
   */
  recordOpened: EventEmitter<unknown>;

  /**
   * Optional: NAVIGATION request to open a *related* record on a DIFFERENT entity (e.g. a
   * foreign-key drill-through in a grid cell). Bubbles to the outer app for routing. Generic —
   * the container forwards it without acting on it.
   */
  openRelatedRecordRequested?: EventEmitter<ViewRelatedRecordNavigation>;

  /**
   * Optional: NAVIGATION request to create a new record of the current entity (e.g. a grid's
   * "New" button) — opening the create form is a routing concern owned by the outer app. Bubbles
   * up; the container forwards it without acting on it.
   */
  createRecordRequested?: EventEmitter<void>;

  /**
   * Emitted when the renderer mutates its own opaque {@link config} (e.g. timeline date field,
   * grid columns/sort/widths, map render mode). The container persists the blob verbatim against
   * the active `ViewTypeID` and never inspects it. (Container ↔ plug-in coordination inside the
   * Generic layer — NOT a signal that drives the outer app.)
   */
  configChanged: EventEmitter<TConfig>;

  /**
   * Optional: ask the container to (re)load the record set differently. The ONLY data-access
   * channel a plug-in has, fully generic — the container honors the request (sort / page /
   * load-all) without knowing which plug-in asked or why. A grid emits sort/page; a map emits
   * `{ loadAll: true }`; a plug-in happy with the records it's given emits nothing. The container
   * owns the actual `RunView`; no per-view-type branching. (Container ↔ plug-in coordination —
   * NOT a signal that drives the outer app.)
   */
  dataRequest?: EventEmitter<ViewDataRequest>;

  /**
   * Optional: ask the host to open this view's configuration UI (e.g. the workspace's config
   * panel). Generic — every view type has configurable settings (the descriptor's
   * {@link IViewTypeDescriptor.PropSheetComponent}); a plug-in raises this when the user invokes
   * an in-renderer affordance for it (e.g. the grid's "Manage Columns" toolbar item). The
   * container forwards it to the host, which owns the config UI; no per-view-type branching.
   * (Container ↔ plug-in coordination — NOT a signal that drives the outer app.)
   */
  configureRequested?: EventEmitter<void>;
}

/**
 * A generic, view-type-agnostic request from a renderer for the host to change how it loads the
 * record set. Every field is optional; the host applies whatever is present. No field names a
 * specific view type — these are universal data-access concepts.
 */
export interface ViewDataRequest {
  /** Desired sort, applied to the host's RunView OrderBy. Empty/omitted clears sorting. */
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  /** One-based page to load (for paginated views). */
  page?: number;
  /** Page size to load. */
  pageSize?: number;
  /** When true, the host loads the full result set (up to its safety cap) instead of paginating. */
  loadAll?: boolean;
}

/**
 * A NAVIGATION request to open a record on a (possibly different) entity — the generic payload
 * for {@link IViewRenderer.openRelatedRecordRequested}. Routing lives in the outer app, so this
 * is one of the few signals that legitimately bubbles up. The container forwards it untouched.
 */
export interface ViewRelatedRecordNavigation {
  /** The entity whose record should be opened. */
  entityName: string;
  /** The record's key — a composite-key string or the raw key value(s). Opaque to the container. */
  recordKey: unknown;
}

/**
 * Contract honored by a view-type configuration prop-sheet component.
 *
 * @typeParam TConfig the shape of the configuration object being edited
 */
export interface IViewPropSheet<TConfig = unknown> {
  /** The entity the configuration applies to. */
  entity: EntityInfo | null;

  /** The current configuration being edited. */
  config: TConfig;

  /** Emitted when the user changes the configuration. */
  configChange: EventEmitter<TConfig>;
}

/**
 * Abstract base class for all view-type descriptors.
 *
 * Concrete descriptors extend this and register themselves with the ClassFactory:
 *
 * ```typescript
 * @RegisterClass(BaseViewTypeDescriptor, 'GridViewType')
 * export class GridViewType extends BaseViewTypeDescriptor {
 *   readonly Name = 'GridViewType';
 *   readonly DisplayName = 'Grid';
 *   readonly Icon = 'fa-solid fa-table';
 *   readonly RendererComponent = EntityDataGridComponent;
 *   IsAvailableFor(): boolean { return true; }
 * }
 * ```
 *
 * The {@link ViewTypeEngine} resolves descriptors by `DriverClass` name using
 * `MJGlobal.Instance.ClassFactory.CreateInstance(BaseViewTypeDescriptor, driverClass)`.
 *
 * NOTE: This class is registered with the ClassFactory itself (via subclasses) and is
 * intentionally NOT decorated — only concrete subclasses carry `@RegisterClass`.
 */
export abstract class BaseViewTypeDescriptor implements IViewTypeDescriptor {
  abstract readonly Name: string;
  abstract readonly DisplayName: string;
  abstract readonly Icon: string;
  abstract readonly RendererComponent: Type<unknown>;
  readonly PropSheetComponent?: Type<unknown>;

  /**
   * Default: this view type uses its own opaque per-view-type config (stored in
   * `DisplayState.viewTypeConfigs`). Override to `true` in a view type that renders the
   * canonical grid columns (see {@link IViewTypeDescriptor.UsesCanonicalGridState}).
   */
  readonly UsesCanonicalGridState: boolean = false;

  /**
   * Default availability: available for every entity. Override in subclasses that have
   * requirements (e.g. Timeline needs a date field, Map needs geocoding).
   */
  IsAvailableFor(_entity: EntityInfo, _provider?: IMetadataProvider): boolean {
    return true;
  }

  /**
   * Default: nothing to preload. Override in subclasses whose availability predicate needs
   * async data (e.g. the Cluster view type loading which entities have Entity Documents).
   */
  async EnsureAvailabilityData(_provider?: IMetadataProvider): Promise<void> {
    // no-op by default
  }
}

/**
 * Tree-shaking guard. Force-references {@link RegisterClass} so bundlers don't drop the
 * decorator import in builds that only touch this contracts module. Concrete descriptor
 * modules each carry their own `@RegisterClass` and load guard, but this keeps the base
 * module self-consistent.
 */
export function LoadViewTypeContracts(): void {
  // no-op; presence prevents tree-shaking of this module's side-effect-free exports
  void RegisterClass;
}
