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
   * Predicate that decides whether this view type is available for a given entity.
   * For example, Timeline requires a date field; Map requires geocoding support.
   * Grid and Cards are always available.
   *
   * @param entity the entity the viewer is currently displaying
   * @param provider optional metadata provider (for multi-provider scenarios)
   */
  IsAvailableFor(entity: EntityInfo, provider?: IMetadataProvider): boolean;
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

  /** Emitted when a record is selected (single click). */
  recordSelected: EventEmitter<unknown>;

  /** Emitted when a record should be opened (double-click / open). */
  recordOpened: EventEmitter<unknown>;

  /** Emitted when the renderer mutates its own configuration (e.g. timeline date field). */
  configChanged: EventEmitter<TConfig>;
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
   * Default availability: available for every entity. Override in subclasses that have
   * requirements (e.g. Timeline needs a date field, Map needs geocoding).
   */
  IsAvailableFor(_entity: EntityInfo, _provider?: IMetadataProvider): boolean {
    return true;
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
