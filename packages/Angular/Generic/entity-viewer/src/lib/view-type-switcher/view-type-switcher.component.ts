import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EntityInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { IViewTypeDescriptor, ViewTypeEngine } from '../view-types';

/**
 * A single selectable entry in the view-type switcher. Built from the
 * `MJ: View Types` registry (via {@link ViewTypeEngine}) for the bound entity.
 */
export interface ViewTypeSwitcherOption {
  /**
   * Stable key — the descriptor's `Name` (== `MJ: View Types.DriverClass`),
   * e.g. "GridViewType", "ClusterViewType". Used as the `@for` track key.
   */
  Key: string;
  /** The `MJ: View Types` row ID — what gets emitted and persisted as the active view type. */
  ViewTypeId: string;
  /** User-facing label (from `ViewType.DisplayName`). */
  Label: string;
  /** Font Awesome icon class (from `ViewType.Icon` metadata). */
  Icon: string;
}

/**
 * Payload emitted by {@link ViewTypeSwitcherComponent.ViewTypeSelected} when the user picks a
 * view type from the menu.
 */
export interface ViewTypeSelectedEvent {
  /** The `MJ: View Types` row ID that was selected. */
  viewTypeId: string;
  /** The descriptor `DriverClass` / Name of the selected view type (e.g. "ClusterViewType"). */
  driverClass: string;
}

/**
 * `mj-view-type-switcher` — a small, self-contained dropdown that lets the user switch between
 * the view types available for an entity (Grid / Cards / Timeline / Map / Cluster / third-party
 * plug-ins).
 *
 * It computes its own available types from the `MJ: View Types` registry via the
 * {@link ViewTypeEngine} — the exact same source the {@link EntityViewerComponent} uses — gated by
 * each descriptor's `IsAvailableFor` predicate (e.g. Timeline needs a date field, Map needs
 * geocoding, Cluster needs vectors). Icons come from `ViewType.Icon` metadata. There is
 * intentionally no hardcoded fallback list: when the registry yields one type or fewer, the
 * switcher renders nothing.
 *
 * The component is purely presentational with respect to selection — it does NOT switch the
 * actual rendering. It emits {@link ViewTypeSelected} and the host (the entity-viewer header or
 * the view-workspace toolbar) routes that to its existing view-type selection logic. This keeps
 * the switcher reusable both inside the viewer's own header and lifted up into a parent toolbar
 * without the parent-reads-child `ExpressionChangedAfterItHasBeenCheckedError` anti-pattern.
 *
 * @example
 * ```html
 * <mj-view-type-switcher
 *   [Provider]="Provider"
 *   [Entity]="Entity"
 *   [ActiveViewTypeID]="activeViewTypeId"
 *   (ViewTypeSelected)="onViewTypeSelected($event)">
 * </mj-view-type-switcher>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-view-type-switcher',
  templateUrl: './view-type-switcher.component.html',
  styleUrls: ['./view-type-switcher.component.css']
})
export class ViewTypeSwitcherComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  private _entity: EntityInfo | null = null;
  private _activeViewTypeId: string | null = null;
  private _initialized = false;

  /**
   * The entity whose available view types are offered. When it changes the available types
   * are recomputed from the registry.
   */
  @Input()
  get Entity(): EntityInfo | null {
    return this._entity;
  }
  set Entity(value: EntityInfo | null) {
    const previous = this._entity;
    this._entity = value;
    if (this._initialized && (!previous || !value || !UUIDsEqual(value.ID, previous.ID))) {
      this.refreshAvailableTypes();
    }
  }

  /**
   * The currently-active view type's `MJ: View Types` row ID (drives the trigger label/icon and
   * the active highlight in the menu). The host owns this — the switcher only requests changes.
   */
  @Input()
  get ActiveViewTypeID(): string | null {
    return this._activeViewTypeId;
  }
  set ActiveViewTypeID(value: string | null) {
    this._activeViewTypeId = value;
  }

  /**
   * Emitted when the user selects a view type from the menu. The host routes this to its existing
   * view-type selection logic (by `viewTypeId`). The switcher does not change rendering itself.
   */
  @Output() ViewTypeSelected = new EventEmitter<ViewTypeSelectedEvent>();

  /** The available view types for the current entity, sourced from the registry. */
  public AvailableViewTypes: ViewTypeSwitcherOption[] = [];

  /** Whether the dropdown menu is currently open. */
  public DropdownOpen = false;

  /** Initializes the switcher and performs the first registry resolution. */
  ngOnInit(): void {
    this._initialized = true;
    void this.ensureViewTypesLoaded();
  }

  /**
   * The option matching {@link ActiveViewTypeID} (for the trigger's icon + label), or the first
   * available option as a sensible default, or null before the registry resolves.
   */
  get ActiveOption(): ViewTypeSwitcherOption | null {
    const active = this.AvailableViewTypes.find(o => o.ViewTypeId === this._activeViewTypeId);
    return active ?? this.AvailableViewTypes[0] ?? null;
  }

  /**
   * Loads the view-type registry once (including each descriptor's availability-data hook) and
   * then computes the available types. Fire-and-forget from {@link ngOnInit}; on failure the
   * switcher simply renders nothing (registry not seeded).
   */
  private async ensureViewTypesLoaded(): Promise<void> {
    try {
      const provider = this.ProviderToUse;
      await ViewTypeEngine.Instance.Config(false, provider?.CurrentUser, provider ?? undefined);
      await ViewTypeEngine.Instance.EnsureAvailabilityData(provider ?? undefined);
      this.refreshAvailableTypes();
    } catch {
      this.AvailableViewTypes = [];
      this.cdr.detectChanges();
    }
  }

  /**
   * Recomputes {@link AvailableViewTypes} from the registry for the current entity. Each available
   * `MJ: View Types` row is mapped to a switcher option using its descriptor's display metadata.
   */
  private refreshAvailableTypes(): void {
    const entity = this._entity;
    if (!entity) {
      this.AvailableViewTypes = [];
      this.cdr.detectChanges();
      return;
    }

    let rows: Array<{ ViewType: { ID: string }; Descriptor: IViewTypeDescriptor }> = [];
    try {
      rows = ViewTypeEngine.Instance.GetAvailableViewTypeRows(entity, this.ProviderToUse ?? undefined);
    } catch {
      rows = [];
    }

    this.AvailableViewTypes = rows.map(({ ViewType, Descriptor }) => ({
      Key: Descriptor.Name,
      ViewTypeId: ViewType.ID,
      Label: Descriptor.DisplayName,
      Icon: Descriptor.Icon ?? ''
    }));
    this.cdr.detectChanges();
  }

  /** Toggles the dropdown menu open/closed. */
  public ToggleDropdown(): void {
    this.DropdownOpen = !this.DropdownOpen;
  }

  /**
   * Handles a menu selection. Closes the menu and emits {@link ViewTypeSelected} so the host can
   * apply the switch through its own selection logic.
   */
  public SelectViewType(option: ViewTypeSwitcherOption): void {
    this.DropdownOpen = false;
    this.ViewTypeSelected.emit({ viewTypeId: option.ViewTypeId, driverClass: option.Key });
  }
}
