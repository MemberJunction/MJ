import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, inject, NgZone,
  ContentChildren, QueryList, AfterContentInit, OnDestroy,
  ViewChild, ViewEncapsulation, ElementRef
} from '@angular/core';
import { BaseEntity, CompositeKey, EntityInfo, Metadata, RunView, type FormChromeRule } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormToolbarConfig, DEFAULT_TOOLBAR_CONFIG } from '../types/toolbar-config';
import { ResolveFormShowToolbar, ResolveFormToolbarConfig } from '../types/entity-form-config';
import { FormNavigationEvent } from '../types/navigation-events';
import { FormWidthMode } from '../types/form-types';
import { MjCollapsiblePanelComponent } from '../panel/collapsible-panel.component';
import { SectionManagerItem, ChromeMembershipChange } from '../section-manager/section-manager.component';
import {
  BeforeSaveEventArgs,
  BeforeDeleteEventArgs,
  BeforeCancelEventArgs,
  BeforeHistoryViewEventArgs,
  BeforeListManagementEventArgs,
  CustomToolbarButtonClickEventArgs,
  BeforeLayoutResolveEventArgs,
  AfterLayoutResolvedEventArgs,
  BeforeSectionActivateEventArgs,
  AfterSectionActivatedEventArgs,
} from '../types/form-events';
import { BaseFormComponent } from '../base-form-component';
import { RestoreVersionEvent, RecordChangesComponent } from '@memberjunction/ng-record-changes';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ListManagementResult } from '@memberjunction/ng-list-management';
import { FormSlotCoordinator } from '../panel-slot/form-slot-coordinator.service';
import { FormChromeCoordinator } from '../chrome/form-chrome-coordinator.service';
import { ResolveFormChrome, OrderChromeGroups, OrderMoreSectionKeys, MoveChromeGroupInSectionOrder } from '../chrome/resolve-form-chrome';
import { LoadFormChromeRules } from '../chrome/load-form-chrome-rules';
import { MORE_SECTION_KEY, HumanizeEntityTitle, IsAlwaysMoreSection } from '../chrome/form-chrome';
import type { FormChromeGroup, FormChromePanelSnapshot } from '../chrome/form-chrome';
import {
  FORM_CHROME_RAIL_PINNED_DEFAULT,
  ParseRailPinnedSetting,
  SerializeRailPinnedSetting,
} from '../chrome/form-chrome-rail-pref';
import { CollectFormPanelRegistrations } from '../panel-slot/collect-form-panel-registrations';
import { ContributionHiddenSectionKeys, ResolveFormContributions } from '../panel-slot/form-contribution';
import { IsFormSectionHidden } from '../types/entity-form-config';

/**
 * Display shape for the variant picker. Kept minimal so the Generic
 * container doesn't pull in resolver types; the Explorer-level component
 * that owns the resolver shapes its rows into this.
 */
export interface VariantPickerItem {
    ID: string;
    Label: string;
    Scope: 'User' | 'Role' | 'Global';
    Status: 'Active' | 'Pending' | 'Inactive';
}

/**
 * Top-level container that composes the toolbar, content slots, and sticky behavior.
 *
 * **Two usage modes:**
 *
 * 1. **With FormComponent** (generated forms): Pass `[FormComponent]="this"` and the
 *    container derives all state from the BaseFormComponent instance. Save/Cancel/Edit
 *    are handled internally by calling FormComponent methods.
 *
 * 2. **Standalone**: Pass individual @Input properties and handle all @Output events.
 *
 * @example Generated form usage:
 * ```html
 * <mj-record-form-container [Record]="record" [FormComponent]="this"
 *   (Navigate)="OnFormNavigate($event)"
 *   (DeleteRequested)="OnDeleteRequested()"
 *   (FavoriteToggled)="OnFavoriteToggled()"
 *   (HistoryRequested)="OnHistoryRequested()"
 *   (ListManagementRequested)="OnListManagementRequested()">
 *
 *   <mj-collapsible-panel SectionKey="details" ...>
 *     <mj-form-field ...></mj-form-field>
 *   </mj-collapsible-panel>
 *
 *   <mj-collapsible-panel SectionKey="relatedOrders" Variant="related-entity" ...>
 *     <!-- related entity grid -->
 *   </mj-collapsible-panel>
 * </mj-record-form-container>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-record-form-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './record-form-container.component.html',
  styleUrls: ['./record-form-container.component.css'],
  // FormSlotCoordinator + FormChromeCoordinator scoped per-container.
  providers: [FormSlotCoordinator, FormChromeCoordinator],
})
export class MjRecordFormContainerComponent extends BaseAngularComponent implements AfterContentInit, OnDestroy  {
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private notificationService = inject(MJNotificationService);
  private chrome = inject(FormChromeCoordinator);
  private slots = inject(FormSlotCoordinator);
  private host = inject(ElementRef<HTMLElement>);
  private destroy$ = new Subject<void>();
  private panelNavReset$ = new Subject<void>();
  private chromeResolveTimer: ReturnType<typeof setTimeout> | null = null;
  private chromeRules: FormChromeRule[] = [];
  private chromeRulesForEntityId: string | null = null;

  // ---- Internal State ----

  /** Reference to the record changes drawer (when visible) for triggering refresh after save */
  @ViewChild(RecordChangesComponent) private recordChangesDrawer?: RecordChangesComponent;

  /** Controls visibility of record changes drawer */
  ShowRecordChanges = false;

  /** Controls visibility of tags panel */
  ShowTagsPanel = false;

  /** Persisted tags panel width */
  TagsPanelWidth = 0;
  private static readonly TAGS_WIDTH_KEY = 'MJ_TagsPanel_Width';

  /** Number of tags on this record */
  TagCount = 0;

  /** Number of tracked record change versions for this record */
  VersionCount = 0;

  /** Controls visibility of list management dialog */
  ShowListManagement = false;

  /** Controls visibility of section manager drawer */
  ShowSectionManager = false;

  /**
   * Persisted per entity. Pinned (default) keeps the left rail open.
   * Unpinned auto-collapses after the user picks another section.
   */
  ChromeRailPinned = FORM_CHROME_RAIL_PINNED_DEFAULT;

  /** Session-only: the rail is showing its items. Follows pin on load. */
  private chromeRailExpanded = FORM_CHROME_RAIL_PINNED_DEFAULT;

  // ---- Primary Inputs ----

  /** The entity record being displayed/edited */
  @Input() Record!: BaseEntity;

  /**
   * Reference to the parent form component (e.g. BaseFormComponent subclass).
   * When provided, the container derives toolbar state from this reference and
   * handles Save/Cancel/Edit internally by calling its methods.
   */
  @Input() FormComponent: BaseFormComponent | null = null;

  // ---- Fallback Inputs (used when FormComponent is NOT provided) ----

  @Input() EntityInfo: EntityInfo | null = null;
  @Input() EditMode = false;
  @Input() UserCanEdit = false;
  @Input() UserCanDelete = false;
  @Input() IsFavorite = false;
  @Input() FavoriteInitDone = false;
  @Input() IsDirty = false;
  @Input() DirtyFieldNames: string[] = [];
  @Input() ListCount = 0;
  @Input() IsSaving = false;
  @Input() ToolbarConfig: FormToolbarConfig = DEFAULT_TOOLBAR_CONFIG;
  @Input() WidthMode: FormWidthMode = 'centered';

  /**
   * Variants available for this entity record. When more than one variant is
   * provided, a compact picker appears between the toolbar and the form body
   * letting the user switch which form is rendered. Empty / single-variant
   * lists hide the picker entirely.
   *
   * Each item is a plain object — we don't take a hard dep on the resolver's
   * row type from here (this is a Generic component; the Explorer-level
   * single-record component shapes the resolver row into this minimal form).
   */
  @Input() Variants: VariantPickerItem[] = [];

  /**
   * Override ID currently rendered. The picker highlights this entry. May be
   * null when the active form is a class-based @RegisterClass form (no
   * override is currently active) — in that case the picker still appears
   * with "Default form" as the leading row.
   */
  @Input() CurrentVariantID: string | null = null;

  // ---- Outputs ----

  /** Emitted for all navigation actions (the host app maps these to its routing) */
  @Output() Navigate = new EventEmitter<FormNavigationEvent>();

  /** Emitted when edit mode changes (only in standalone mode; FormComponent mode handled internally) */
  @Output() EditModeChange = new EventEmitter<boolean>();

  /** Emitted BEFORE save - can be cancelled by setting event.Cancel = true */
  @Output() BeforeSave = new EventEmitter<BeforeSaveEventArgs>();

  /** Emitted when save is requested (only in standalone mode) */
  @Output() SaveRequested = new EventEmitter<void>();

  /** Emitted BEFORE cancel - can be cancelled by setting event.Cancel = true */
  @Output() BeforeCancel = new EventEmitter<BeforeCancelEventArgs>();

  /** Emitted when cancel is requested (only in standalone mode) */
  @Output() CancelRequested = new EventEmitter<void>();

  /** Emitted BEFORE delete - can be cancelled by setting event.Cancel = true */
  @Output() BeforeDelete = new EventEmitter<BeforeDeleteEventArgs>();

  /** Emitted when delete is confirmed (host app handles actual deletion) */
  @Output() DeleteRequested = new EventEmitter<void>();

  /** Emitted when favorite toggle is requested */
  @Output() FavoriteToggled = new EventEmitter<void>();

  /** Emitted BEFORE history view - can be cancelled by setting event.Cancel = true */
  @Output() BeforeHistoryView = new EventEmitter<BeforeHistoryViewEventArgs>();

  /** Emitted when history view is requested */
  @Output() HistoryRequested = new EventEmitter<void>();

  /** Emitted BEFORE list management - can be cancelled by setting event.Cancel = true */
  @Output() BeforeListManagement = new EventEmitter<BeforeListManagementEventArgs>();

  /** Emitted when list management is requested */
  @Output() ListManagementRequested = new EventEmitter<void>();

  /** Emitted when show-changes is requested */
  @Output() ShowChangesRequested = new EventEmitter<void>();

  /** Emitted when a custom toolbar button is clicked */
  @Output() CustomButtonClick = new EventEmitter<CustomToolbarButtonClickEventArgs>();

  /**
   * Emitted when the user chooses a different form variant from the picker.
   * Carries the selected variant's override ID, or null when the user picks
   * the "Default form" row. The host is responsible for persisting the choice
   * (via FormResolverService.SetSelectedVariant) and reloading the record so
   * the new form mounts.
   */
  @Output() VariantChange = new EventEmitter<string | null>();

  @Output() BeforeLayoutResolve = new EventEmitter<BeforeLayoutResolveEventArgs>();
  @Output() AfterLayoutResolved = new EventEmitter<AfterLayoutResolvedEventArgs>();
  @Output() BeforeSectionActivate = new EventEmitter<BeforeSectionActivateEventArgs>();
  @Output() AfterSectionActivated = new EventEmitter<AfterSectionActivatedEventArgs>();

  // ---- Content Children ----

  @ContentChildren(MjCollapsiblePanelComponent, { descendants: true })
  Panels!: QueryList<MjCollapsiblePanelComponent>;

  // ---- FormComponent accessor ----

  /** Typed accessor for the form component reference */
  private get fc(): BaseFormComponent | null {
    return this.FormComponent;
  }

  // ---- Effective state (bridges FormComponent → toolbar inputs) ----

  get EffectiveRecord(): BaseEntity {
    return this.fc?.record ?? this.Record;
  }

  get EffectiveEditMode(): boolean {
    return this.fc?.EditMode ?? this.EditMode;
  }

  get EffectiveUserCanEdit(): boolean {
    return this.fc?.UserCanEdit ?? this.UserCanEdit;
  }

  get EffectiveUserCanDelete(): boolean {
    return this.fc?.UserCanDelete ?? this.UserCanDelete;
  }

  get EffectiveIsFavorite(): boolean {
    return this.fc?.IsFavorite ?? this.IsFavorite;
  }

  get EffectiveFavoriteInitDone(): boolean {
    return this.fc?.FavoriteInitDone ?? this.FavoriteInitDone;
  }

  get EffectiveEntityInfo(): EntityInfo | null {
    return (this.fc?.EntityInfo as EntityInfo) ?? this.EntityInfo;
  }

  get EffectiveIsDirty(): boolean {
    if (this.fc) {
      // OR'd with the form's own extra state: a section that owns an editor (a flow canvas, a
      // designer) holds edits no entity field reflects, and reporting the record clean would let
      // the navigate-away guard discard them without asking.
      return (this.fc.record?.Dirty ?? false) || this.fc.HasAdditionalUnsavedChanges;
    }
    return this.IsDirty;
  }

  get EffectiveDirtyFieldNames(): string[] {
    if (this.fc?.record?.Fields) {
      return this.fc.record.Fields.filter(f => f.Dirty).map(f => f.Name);
    }
    return this.DirtyFieldNames;
  }

  get EffectiveIsSaving(): boolean {
    return this.IsSaving;
  }

  get EffectiveWidthMode(): FormWidthMode {
    if (this.fc?.getFormWidthMode) {
      return this.fc.getFormWidthMode();
    }
    return this.WidthMode;
  }

  /**
   * Whether the in-form toolbar renders at all. Driven by the form's
   * `Config.Toolbar`: an explicit `null` (the dialog/slide-in default) hides
   * the entire toolbar so the surrounding chrome can own Save/Cancel/title.
   * Any other value (undefined or a partial config) keeps the toolbar.
   */
  get EffectiveShowToolbar(): boolean {
    return ResolveFormShowToolbar(this.fc?.Config);
  }

  /**
   * Effective toolbar config: the bound `ToolbarConfig` (or the default)
   * with the form's `Config.Toolbar` partial merged on top. This is the
   * no-regeneration bridge — generated templates never bind `[Config]`,
   * yet per-instance toolbar tweaks still take effect through `fc.Config`.
   */
  get EffectiveToolbarConfig(): FormToolbarConfig {
    return ResolveFormToolbarConfig(this.ToolbarConfig ?? DEFAULT_TOOLBAR_CONFIG, this.fc?.Config);
  }

  get EffectiveSearchFilter(): string {
    return this.fc?.searchFilter ?? '';
  }

  get EffectiveShowEmptyFields(): boolean {
    return this.fc?.showEmptyFields ?? false;
  }

  get EffectiveHasCustomSectionOrder(): boolean {
    if (this.fc?.hasCustomSectionOrder) {
      return this.fc.hasCustomSectionOrder();
    }
    return false;
  }

  // ---- Section counts ----

  get TotalSectionCount(): number {
    if (this.fc?.getTotalSectionCount) {
      return this.fc.getTotalSectionCount();
    }
    return this.Panels?.length ?? 0;
  }

  get VisibleSectionCount(): number {
    const filter = this.EffectiveSearchFilter.toLowerCase().trim();
    if (filter) {
      const fromPanels = this.allChromePanels().filter((p) => p.MatchesSearch(filter)).length;
      const fromRail = this.ChromeFirstClassGroups.length + this.ChromeMoreItems.length;
      return Math.max(fromPanels, fromRail);
    }
    if (this.fc?.getVisibleSectionCount) {
      return this.fc.getVisibleSectionCount();
    }
    return this.Panels?.filter((p) => p.IsVisible).length ?? 0;
  }

  /** True when the current section search matches nothing in this layout. */
  get SearchHasNoMatches(): boolean {
    const filter = this.EffectiveSearchFilter.toLowerCase().trim();
    if (!filter) return false;
    return this.ChromeFirstClassGroups.length === 0 && this.ChromeMoreItems.length === 0
      && this.allChromePanels().every((p) => !p.MatchesSearch(filter));
  }

  /** Left-nav rail stays up while searching even if only one group matches. */
  get ShowChromeRail(): boolean {
    if (this.ChromeLayout !== 'left-nav') return false;
    if (this.EffectiveSearchFilter.trim()) {
      return this.ChromeFirstClassGroups.length > 0 || this.ChromeMoreItems.length > 0;
    }
    return this.chrome.Spec.Groups.length > 1;
  }

  /**
   * SectionKeys of related-entity panels projected into the container
   * (CodeGen-baked or hand-written). View-children we mount as fill-ins are
   * not in this ContentChildren list.
   */
  get BakedRelatedSectionKeys(): string[] {
    if (!this.Panels) return [];
    return this.Panels
      .filter((panel) => panel.Variant === 'related-entity' && !!panel.SectionKey)
      .map((panel) => panel.SectionKey);
  }

  get EffectiveShowRelatedEntities(): boolean {
    return this.fc?.Config?.ShowRelatedEntities !== false;
  }

  get ChromeLayout(): 'accordion' | 'left-nav' {
    return this.chrome.Spec.Layout;
  }

  get ChromeGroups(): FormChromeGroup[] {
    const ordered = OrderChromeGroups(this.chrome.Spec.Groups, this.SectionManagerOrder);
    const filter = this.EffectiveSearchFilter.toLowerCase().trim();
    if (!filter) return ordered;
    return ordered.filter((group) => this.groupMatchesSearch(group, filter));
  }

  get ChromeFirstClassGroups(): FormChromeGroup[] {
    return this.ChromeGroups.filter((group) => !group.IsMore);
  }

  get ChromeMoreFolder(): FormChromeGroup | null {
    const folder = this.ChromeGroups.find((group) => group.IsMore) ?? null;
    if (!folder || folder.SectionKeys.length === 0) return null;
    return folder;
  }

  get ChromeMoreItems(): FormChromeGroup[] {
    const folder = this.ChromeMoreFolder;
    if (!folder) return [];
    const filter = this.EffectiveSearchFilter.toLowerCase().trim();
    const orderedKeys = OrderMoreSectionKeys(folder.SectionKeys, this.SectionManagerOrder);
    const items = orderedKeys.map((key) => this.moreItemFromKey(key));
    if (!filter) return items;
    return items.filter((item) => this.groupMatchesSearch(item, filter));
  }

  get ChromeActiveGroupKey(): string | null {
    return this.chrome.ActiveGroupKey;
  }

  get ChromeActiveGroup(): FormChromeGroup | null {
    const key = this.ChromeActiveGroupKey;
    if (!key) {
      return null;
    }
    return this.ChromeFirstClassGroups.find((group) => group.Key === key)
      ?? this.ChromeMoreItems.find((item) => item.Key === key)
      ?? null;
  }

  get ChromeActiveTitle(): string {
    return this.ChromeActiveGroup?.Title || 'Sections';
  }

  get ChromeActiveIcon(): string {
    return this.ChromeActiveGroup?.Icon || 'fa-solid fa-list';
  }

  /**
   * True when the rail is the thin rotated strip. Search keeps the full
   * list visible so matches stay clickable.
   */
  get ChromeRailCollapsed(): boolean {
    if (!this.ShowChromeRail) {
      return false;
    }
    if (this.EffectiveSearchFilter.trim()) {
      return false;
    }
    return !this.chromeRailExpanded;
  }

  get IsChromeMoreActive(): boolean {
    return this.chrome.IsMoreActive;
  }

  get ChromeReorderAllowed(): boolean {
    return this.fc?.formContext?.allowSectionReorder !== false;
  }

  get ShowMoreToggle(): boolean {
    return this.chrome.Spec.Layout === 'accordion' && this.ChromeMoreItems.length > 0;
  }

  get MoreExpanded(): boolean {
    return this.chrome.MoreExpanded;
  }

  get MorePreview(): string {
    return this.ChromeMoreItems.map((item) => item.Title).join(' · ');
  }

  get ExpandedSectionCount(): number {
    if (this.fc?.getExpandedCount) {
      return this.fc.getExpandedCount();
    }
    if (!this.Panels) return 0;
    return this.Panels.filter(p => p.Expanded && p.IsVisible).length;
  }

  // ---- IS-A Related Panel ----

  /** Whether the current record has IS-A related items to display in the side panel */
  get HasIsaRelatedItems(): boolean {
    const record = this.EffectiveRecord;
    if (!record?.EntityInfo) return false;

    const entityInfo = record.EntityInfo;

    // Child entity with overlapping parent — may have siblings
    if (entityInfo.IsChildType && entityInfo.ParentEntityInfo?.AllowMultipleSubtypes) {
      const parent = record.ISAParent;
      if (parent?.ISAChildren && parent.ISAChildren.length > 1) return true;
    }

    // Parent entity with children
    if (entityInfo.IsParentType) {
      if (entityInfo.AllowMultipleSubtypes && record.ISAChildren && record.ISAChildren.length > 0) return true;
      if (!entityInfo.AllowMultipleSubtypes && record.ISAChild) return true;
    }

    return false;
  }

  // ---- Section Manager ----

  /** Builds section info array from projected panels for the section manager drawer */
  get SectionManagerItems(): SectionManagerItem[] {
    return this.chromePanelSnapshots().map((p) => ({
      SectionKey: p.SectionKey,
      SectionName: HumanizeEntityTitle(p.SectionName),
      Variant: (p.Variant || 'default') as SectionManagerItem['Variant'],
      Icon: p.Icon || 'fa-solid fa-table',
    }));
  }

  get SectionManagerMoreKeys(): string[] {
    return this.chrome.Spec.MoreSectionKeys;
  }

  get SectionManagerLockedMoreKeys(): string[] {
    return this.chromePanelSnapshots()
      .filter((p) => IsAlwaysMoreSection(p.SectionKey, p.SectionName))
      .map((p) => p.SectionKey);
  }

  /** Current section order from the form component */
  get SectionManagerOrder(): string[] {
    if (this.fc?.getSectionOrder) {
      return this.fc.getSectionOrder();
    }
    return [];
  }

  // ---- Lifecycle ----

  ngAfterContentInit(): void {
    // Load saved tags panel width
    const savedWidth = UserInfoEngine.Instance.GetSetting(MjRecordFormContainerComponent.TAGS_WIDTH_KEY);
    if (savedWidth) this.TagsPanelWidth = parseInt(savedWidth, 10) || 0;

    // Subscribe to panel Navigate events and relay them
    this.SubscribeToPanelNavigateEvents();

    // Watch for panel changes to update counts and re-subscribe
    this.Panels.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.SubscribeToPanelNavigateEvents();
      this.scheduleChromeResolve();
      this.cdr.markForCheck();
    });

    // Slot remounts land after content init and are not ContentChildren —
    // rebuild the rail from the live DOM once they exist.
    this.slots.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.scheduleChromeResolve();
    });

    this.RestoreChromePrefs();
    this.scheduleChromeResolve();

    // Watch for changes to record dirty state
    this.watchRecordChanges();
  }

  ngOnDestroy(): void {
    if (this.chromeResolveTimer) {
      clearTimeout(this.chromeResolveTimer);
      this.chromeResolveTimer = null;
    }
    this.panelNavReset$.next();
    this.panelNavReset$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  public OnMoreFolderToggle(): void {
    this.chrome.ToggleMoreFolder();
    this.PersistChromePrefs();
    this.cdr.detectChanges();
  }

  public ChromeGroupRowCount(group: FormChromeGroup): number | undefined {
    if (!this.fc?.GetSectionRowCount) return undefined;
    let total = 0;
    let any = false;
    for (const key of group.SectionKeys) {
      const count = this.fc.GetSectionRowCount(key);
      if (count !== undefined) {
        total += count;
        any = true;
      }
    }
    return any ? total : undefined;
  }

  public OnChromeGroupActivate(groupKey: string): void {
    const before = new BeforeSectionActivateEventArgs(groupKey);
    this.BeforeSectionActivate.emit(before);
    if (before.Cancel) return;
    const previous = this.chrome.ActiveGroupKey;
    this.chrome.SetActiveGroup(groupKey);
    this.expandActiveGroupSections(groupKey);
    this.applyChromeVisibility();
    if (!this.ChromeRailPinned && previous !== groupKey) {
      this.chromeRailExpanded = false;
    }
    this.PersistChromePrefs();
    this.AfterSectionActivated.emit(new AfterSectionActivatedEventArgs(groupKey));
    this.cdr.detectChanges();
  }

  public OnChromeRailExpand(): void {
    this.chromeRailExpanded = true;
    this.cdr.detectChanges();
  }

  public OnChromeRailCollapse(): void {
    this.chromeRailExpanded = false;
    this.cdr.detectChanges();
  }

  public OnChromeRailPinToggle(): void {
    this.ChromeRailPinned = !this.ChromeRailPinned;
    if (this.ChromeRailPinned) {
      this.chromeRailExpanded = true;
    }
    this.PersistChromePrefs();
    this.cdr.detectChanges();
  }

  public RailDragOverKey: string | null = null;

  public OnRailDragStart(event: DragEvent, groupKey: string): void {
    if (!this.ChromeReorderAllowed) return;
    event.stopPropagation();
    event.dataTransfer?.setData('text/plain', groupKey);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  public OnRailDragEnd(): void {
    this.RailDragOverKey = null;
    this.cdr.markForCheck();
  }

  public OnRailDragOver(event: DragEvent, groupKey: string): void {
    if (!this.ChromeReorderAllowed) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (this.RailDragOverKey !== groupKey) {
      this.RailDragOverKey = groupKey;
      this.cdr.markForCheck();
    }
  }

  public OnRailDragLeave(_event: DragEvent, groupKey: string): void {
    if (this.RailDragOverKey === groupKey) {
      this.RailDragOverKey = null;
      this.cdr.markForCheck();
    }
  }

  public OnRailDrop(event: DragEvent, targetKey: string): void {
    if (!this.ChromeReorderAllowed) return;
    event.preventDefault();
    this.RailDragOverKey = null;
    const draggedKey = event.dataTransfer?.getData('text/plain');
    if (!draggedKey || draggedKey === targetKey) return;
    const groups = this.ChromeGroups;
    const moreItems = this.ChromeMoreItems;
    const draggedMore = moreItems.find((item) => item.Key === draggedKey);
    const targetMore = moreItems.find((item) => item.Key === targetKey);
    const dragged = draggedMore ?? groups.find((g) => g.Key === draggedKey);
    const target = targetMore ?? groups.find((g) => g.Key === targetKey);
    if (!dragged || !target) return;
    if (!draggedMore && (dragged.IsMore || target.IsMore)) return;
    if (!!draggedMore !== !!targetMore) return;
    const current = this.SectionManagerOrder;
    const next = MoveChromeGroupInSectionOrder(
      current.length > 0 ? current : groups.flatMap((g) => g.SectionKeys),
      dragged,
      target,
    );
    if (this.fc?.setSectionOrder) {
      this.fc.setSectionOrder(next);
      this.cdr.detectChanges();
    }
  }

  public OnMoreToggle(): void {
    const next = !this.chrome.MoreExpanded;
    const before = new BeforeSectionActivateEventArgs(MORE_SECTION_KEY);
    this.BeforeSectionActivate.emit(before);
    if (before.Cancel) return;
    this.chrome.ToggleMore(next);
    this.applyChromeVisibility();
    this.PersistChromePrefs();
    this.AfterSectionActivated.emit(new AfterSectionActivatedEventArgs(MORE_SECTION_KEY));
    this.cdr.detectChanges();
  }

  private scheduleChromeResolve(): void {
    if (this.chromeResolveTimer) {
      clearTimeout(this.chromeResolveTimer);
    }
    this.chromeResolveTimer = setTimeout(() => {
      this.chromeResolveTimer = null;
      this.ResolveChrome();
      this.applyChromeVisibility();
      this.cdr.markForCheck();
    }, 0);
  }

  private loadChromeRulesIfNeeded(): void {
    const entityId = this.EffectiveEntityInfo?.ID ?? null;
    if (!entityId || this.chromeRulesForEntityId === entityId) return;
    this.chromeRulesForEntityId = entityId;
    void this.loadChromeRules(entityId);
  }

  private async loadChromeRules(entityId: string): Promise<void> {
    const rules = await LoadFormChromeRules(entityId, this.ProviderToUse);
    if (this.chromeRulesForEntityId !== entityId) return;
    this.chromeRules = rules;
    this.scheduleChromeResolve();
  }

  private ResolveChrome(): void {
    const entity = this.EffectiveEntityInfo;
    if (!entity) return;
    this.loadChromeRulesIfNeeded();

    const result = ResolveFormChrome({
      Entity: entity,
      Panels: this.chromePanelSnapshots(),
      RelatedSchemaByEntityId: this.buildRelatedSchemaMap(entity),
      InboundRelationshipCountByEntityId: this.buildInboundRelationshipCounts(),
      HiddenSectionKeys: [...this.contributionHiddenSectionKeys()],
      ContributionSectionKeys: this.contributionSectionKeys(),
      ContributionChromeGroupByKey: this.contributionChromeGroupByKey(),
      ChromeRules: this.chromeRules,
      Membership: {
        moreSectionKeys: this.fc?.getMoreSectionKeys?.() ?? [],
        firstClassSectionKeys: this.fc?.getFirstClassSectionKeys?.() ?? [],
      },
    });

    const before = new BeforeLayoutResolveEventArgs(result.Spec.Layout);
    this.BeforeLayoutResolve.emit(before);
    if (before.Cancel) return;

    this.chrome.Apply(result.Spec);
    this.ensureActiveGroupVisible();
    if (this.chrome.ActiveGroupKey) {
      this.expandActiveGroupSections(this.chrome.ActiveGroupKey);
    }
    this.AfterLayoutResolved.emit(new AfterLayoutResolvedEventArgs(result.Spec.Layout));
  }

  private expandActiveGroupSections(groupKey: string): void {
    if (groupKey === MORE_SECTION_KEY) return;
    const group = this.chrome.Spec.Groups.find((g) => g.Key === groupKey);
    const keys = group && !group.IsMore ? group.SectionKeys : [groupKey];
    const form = this.fc as { SetSectionExpanded?: (key: string, expanded: boolean) => void } | null;
    if (!form?.SetSectionExpanded) return;
    for (const key of keys) {
      form.SetSectionExpanded(key, true);
    }
  }

  private ensureActiveGroupVisible(): void {
    const firstClass = this.ChromeFirstClassGroups;
    const moreItems = this.ChromeMoreItems;
    const active = this.chrome.ActiveGroupKey;
    if (active && moreItems.some((item) => item.Key === active)) {
      this.chrome.MoreExpanded = true;
      return;
    }
    if (active && firstClass.some((g) => g.Key === active)) return;
    const next = firstClass[0] ?? moreItems[0];
    if (next) this.chrome.SetActiveGroup(next.Key);
  }

  private groupMatchesSearch(group: FormChromeGroup, filter: string): boolean {
    if (!filter) return true;
    if (group.Title.toLowerCase().includes(filter)) return true;
    if (group.IsMore) {
      return group.SectionKeys.some((key) => {
        const item = this.moreItemFromKey(key);
        return this.groupMatchesSearch({ ...item, IsMore: false }, filter);
      });
    }
    return group.SectionKeys.some((key) => {
      const panel = this.allChromePanels().find((p) => p.SectionKey === key);
      if (panel) return panel.MatchesSearch(filter);
      const human = HumanizeEntityTitle(key).toLowerCase();
      return human.includes(filter) || key.toLowerCase().includes(filter);
    });
  }

  private moreItemFromKey(key: string): FormChromeGroup {
    const panel = this.allChromePanels().find((p) => p.SectionKey === key);
    return {
      Key: key,
      Title: HumanizeEntityTitle(panel?.SectionName || key),
      Icon: panel?.Icon || 'fa-solid fa-table',
      SectionKeys: [key],
      IsMore: true,
    };
  }

  private allChromePanels(): MjCollapsiblePanelComponent[] {
    const seen = new Set<MjCollapsiblePanelComponent>();
    const out: MjCollapsiblePanelComponent[] = [];
    const add = (list?: QueryList<MjCollapsiblePanelComponent>) => {
      list?.forEach((panel) => {
        if (!seen.has(panel)) {
          seen.add(panel);
          out.push(panel);
        }
      });
    };
    add(this.Panels);
    return out;
  }

  private applyChromeVisibility(): void {
    const layout = this.chrome.Spec.Layout;
    const claimed = this.contributionHiddenSectionKeys();
    for (const panel of this.allChromePanels()) {
      if (panel.SectionName) {
        const human = HumanizeEntityTitle(panel.SectionName);
        if (human !== panel.SectionName) {
          panel.SectionName = human;
        }
      }
      const titled = this.chrome.Spec.Groups.find(
        (g) => !g.IsMore && g.SectionKeys.length === 1 && g.SectionKeys[0] === panel.SectionKey,
      );
      if (titled?.Title) {
        panel.SectionName = titled.Title;
      }
      if (claimed.has(panel.SectionKey)) {
        panel.Hidden = true;
        continue;
      }
      if (layout === 'left-nav') {
        if (panel.Variant === 'related-entity') {
          panel.Hidden = !this.chrome.IsRelatedSectionVisible(panel.SectionKey);
        } else {
          panel.Hidden = !this.chrome.IsFirstClassSectionVisible(panel.SectionKey);
        }
      } else {
        panel.Hidden = !this.chrome.IsAccordionSectionVisible(panel.SectionKey);
      }
    }
    this.applyChromeDomVisibility();
  }

  /**
   * Slot-mounted panels are view children of the slot, not ContentChildren
   * of this container, and they cannot inject the container-provided
   * coordinator. Toggle host classes on every `mj-collapsible-panel` in
   * the live DOM so left-nav hide/show still reaches them.
   */
  private applyChromeDomVisibility(): void {
    const host = this.host.nativeElement;
    if (!host) return;
    const layout = this.chrome.Spec.Layout;
    host.querySelectorAll('mj-collapsible-panel').forEach((node: Element) => {
      const key = node.getAttribute('data-section-key') ?? '';
      const variant = node.getAttribute('data-variant') ?? 'default';
      const visible = this.isChromeKeyVisible(key, variant);
      const inMore = this.chrome.Spec.MoreSectionKeys.includes(key);
      node.classList.toggle('mj-chrome-show', layout === 'left-nav' && visible);
      node.classList.toggle('mj-chrome-hidden', !visible);
      node.classList.toggle('mj-form-role-more', inMore);
    });
  }

  private isChromeKeyVisible(sectionKey: string, variant: string): boolean {
    if (this.contributionHiddenSectionKeys().has(sectionKey)) return false;
    if (this.chrome.Spec.Layout === 'accordion') {
      return this.chrome.IsAccordionSectionVisible(sectionKey);
    }
    if (variant === 'related-entity') {
      return this.chrome.IsRelatedSectionVisible(sectionKey);
    }
    return this.chrome.IsFirstClassSectionVisible(sectionKey);
  }

  private contributionSectionKeys(): string[] {
    const entityName = this.EffectiveEntityInfo?.Name;
    if (!entityName) return [];
    const keys: string[] = [];
    for (const reg of CollectFormPanelRegistrations()) {
      const meta = reg.Metadata;
      if (!meta || meta.entity !== entityName) continue;
      if (meta.contributionKey === 'header') continue;
      if (meta.contributionKey) keys.push(meta.contributionKey);
      if (meta.relatedEntity && meta.contributionKey) continue;
      // Related claims use the widget SectionKey, which is usually the contributionKey
      // or a short camel name matching the template (contactMethods, addresses).
      if (meta.relatedEntity && !meta.contributionKey) {
        const derived = meta.relatedEntity.split(':').pop()?.trim();
        if (derived) {
          keys.push(derived.charAt(0).toLowerCase() + derived.slice(1).replace(/\s+/g, ''));
        }
      }
    }
    return keys;
  }

  private contributionChromeGroupByKey(): Map<string, 'details' | 'more'> {
    const entityName = this.EffectiveEntityInfo?.Name;
    const map = new Map<string, 'details' | 'more'>();
    if (!entityName) return map;
    for (const reg of CollectFormPanelRegistrations()) {
      const meta = reg.Metadata;
      if (!meta || meta.entity !== entityName) continue;
      if (meta.chromeGroup !== 'details' && meta.chromeGroup !== 'more') continue;
      const key = meta.contributionKey
        || (meta.relatedEntity
          ? (meta.relatedEntity.split(':').pop()?.trim() ?? '')
          : '');
      if (!key) continue;
      const sectionKey = meta.contributionKey
        || (key.charAt(0).toLowerCase() + key.slice(1).replace(/\s+/g, ''));
      map.set(sectionKey, meta.chromeGroup);
    }
    return map;
  }

  private contributionHiddenSectionKeys(): Set<string> {
    const hidden = this.hiddenChromeSectionKeys();
    const entity = this.EffectiveEntityInfo;
    if (!entity) return hidden;
    const claimed = ContributionHiddenSectionKeys(
      entity.Name,
      entity.RelatedEntities ?? [],
      (entity.ChildEntities ?? []).map((child) => child.ID),
      CollectFormPanelRegistrations(),
    );
    for (const key of claimed) hidden.add(key);
    return hidden;
  }

  private chromePanelSnapshots(): FormChromePanelSnapshot[] {
    const skip = this.contributionHiddenSectionKeys();
    const ctx = this.fc?.formContext;
    const byKey = new Map<string, FormChromePanelSnapshot>();
    const add = (snapshot: FormChromePanelSnapshot) => {
      if (!snapshot.SectionKey || skip.has(snapshot.SectionKey)) return;
      if (IsFormSectionHidden(ctx, snapshot.SectionKey, snapshot.Variant)) return;
      if (!byKey.has(snapshot.SectionKey)) {
        byKey.set(snapshot.SectionKey, snapshot);
      }
    };
    for (const panel of this.allChromePanels()) {
      // Include hidden field panels so Details still groups them. Left-nav
      // otherwise drops ungrouped leftovers and the Details rail looks empty.
      add({
        SectionKey: panel.SectionKey,
        SectionName: panel.SectionName,
        Variant: panel.Variant,
        Icon: panel.Icon,
      });
    }
    for (const snapshot of this.domPanelSnapshots()) {
      add(snapshot);
    }
    return [...byKey.values()];
  }

  private domPanelSnapshots(): FormChromePanelSnapshot[] {
    const host = this.host.nativeElement;
    if (!host) return [];
    const out: FormChromePanelSnapshot[] = [];
    host.querySelectorAll('mj-collapsible-panel').forEach((node: Element) => {
      const sectionKey = node.getAttribute('data-section-key') ?? '';
      if (!sectionKey) return;
      if (node.classList.contains('mj-panel-empty')) return;
      const title = node.querySelector('.mj-forms-panel-title span')?.textContent?.trim();
      out.push({
        SectionKey: sectionKey,
        SectionName: title || sectionKey,
        Variant: node.getAttribute('data-variant') || 'default',
        Icon: node.getAttribute('data-icon') || undefined,
      });
    });
    return out;
  }

  private hiddenChromeSectionKeys(): Set<string> {
    const entity = this.EffectiveEntityInfo;
    if (!entity) return new Set();
    const resolved = ResolveFormContributions({
      EntityName: entity.Name,
      RelatedEntities: entity.RelatedEntities ?? [],
      IsaChildEntityIDs: (entity.ChildEntities ?? []).map((child) => child.ID),
      Registrations: CollectFormPanelRegistrations(),
      BakedSectionKeys: this.BakedRelatedSectionKeys,
      ShowRelatedEntities: this.EffectiveShowRelatedEntities,
    });
    return new Set(resolved.HiddenBakedSectionKeys);
  }

  private buildRelatedSchemaMap(entity: EntityInfo): Map<string, string> {
    const map = new Map<string, string>();
    const provider = this.ProviderToUse;
    for (const rel of entity.RelatedEntities) {
      const related = provider.EntityByID(rel.RelatedEntityID);
      if (related?.SchemaName) {
        map.set((rel.RelatedEntityID ?? '').toLowerCase(), related.SchemaName);
      }
    }
    return map;
  }

  private buildInboundRelationshipCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const entity of this.ProviderToUse.Entities ?? []) {
      for (const rel of entity.RelatedEntities ?? []) {
        const id = (rel.RelatedEntityID ?? '').toLowerCase();
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }

  private chromePrefKey(suffix: string): string {
    const name = (this.EffectiveEntityInfo?.Name ?? 'entity').trim().toLowerCase();
    return `mj.formChrome.${name}.${suffix}`;
  }

  private RestoreChromePrefs(): void {
    const group = UserInfoEngine.Instance.GetSetting(this.chromePrefKey('activeGroup'));
    if (group) this.chrome.ActiveGroupKey = group;
    const more = UserInfoEngine.Instance.GetSetting(this.chromePrefKey('moreExpanded'));
    if (more === '1') this.chrome.MoreExpanded = true;
    if (more === '0') this.chrome.MoreExpanded = false;
    this.ChromeRailPinned = ParseRailPinnedSetting(
      UserInfoEngine.Instance.GetSetting(this.chromePrefKey('railPinned')),
    );
    this.chromeRailExpanded = this.ChromeRailPinned;
  }

  private PersistChromePrefs(): void {
    if (this.chrome.ActiveGroupKey) {
      UserInfoEngine.Instance.SetSettingDebounced(
        this.chromePrefKey('activeGroup'),
        this.chrome.ActiveGroupKey,
      );
    }
    UserInfoEngine.Instance.SetSettingDebounced(
      this.chromePrefKey('moreExpanded'),
      this.chrome.MoreExpanded ? '1' : '0',
    );
    UserInfoEngine.Instance.SetSettingDebounced(
      this.chromePrefKey('railPinned'),
      SerializeRailPinnedSetting(this.ChromeRailPinned),
    );
  }

  /**
   * Subscribes to Navigate events from all child collapsible panels
   * and relays them through this container's Navigate output.
   */
  private SubscribeToPanelNavigateEvents(): void {
    this.panelNavReset$.next(); // tear down previous subscriptions
    // Subscribe to RecordReady on the form component — fires once after record is fully initialized
    if (this.fc) {
      this.fc.RecordReady.pipe(takeUntil(this.panelNavReset$)).subscribe(() => {
        this.LoadBadgeCounts();
      });
    }

    this.Panels.forEach(panel => {
      panel.Navigate.pipe(takeUntil(this.panelNavReset$)).subscribe((event: FormNavigationEvent) => {
        this.Navigate.emit(event);
      });
    });
  }

  /**
   * Monitor record dirty state changes and trigger change detection.
   * This ensures the edit banner updates when fields are modified.
   */
  private watchRecordChanges(): void {
    // Poll for dirty state changes (BaseEntity doesn't expose observables)
    const checkInterval = setInterval(() => {
      if (this.EffectiveRecord?.Dirty !== undefined) {
        this.cdr.markForCheck();
      }
    }, 200);

    // Cleanup on destroy
    this.destroy$.subscribe(() => clearInterval(checkInterval));
  }

  // ---- Badge Count Loading ----

  /**
   * Loads tag count and record change version count for toolbar badges.
   * Both queries run in parallel for performance.
   */
  private badgeCountsLoaded = false;

  private LoadBadgeCounts(): void {
    if (this.badgeCountsLoaded) return;

    const record = this.EffectiveRecord;
    if (!record?.EntityInfo) return;

    this.badgeCountsLoaded = true;

    // Fire both queries in parallel — no await needed, they update state async
    this.LoadTagCount(record);
    this.LoadVersionCount(record);
  }

  /**
   * Queries the count of tagged items for the current entity + record
   * and updates the TagCount badge on the toolbar.
   */
  private async LoadTagCount(record: BaseEntity): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      // Don't narrow Fields — the server caches RunView results by entity+filter (ignoring Fields),
      // so a narrow query here would poison the cache for the subsequent full-field load in the Tags panel.
      const result = await rv.RunView({
        EntityName: 'MJ: Tagged Items',
        ExtraFilter: `EntityID='${record.EntityInfo.ID}' AND RecordID='${record.PrimaryKey.Values()}'`,
        ResultType: 'simple'
      });
      if (result.Success) {
        this.TagCount = result.Results.length;
        this.cdr.detectChanges();
      }
    } catch {
      // Non-critical — badge just stays at 0
    }
  }

  /**
   * Queries the count of record change entries for the current entity + record
   * and updates the VersionCount badge on the toolbar.
   */
  private async LoadVersionCount(record: BaseEntity): Promise<void> {
    if (!record.EntityInfo.TrackRecordChanges) return;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Record Changes',
        Fields: ['ID'],
        ExtraFilter: `EntityID='${record.EntityInfo.ID}' AND RecordID='${record.PrimaryKey.ToConcatenatedString()}'`,
        ResultType: 'simple'
      });
      if (result.Success) {
        this.VersionCount = result.Results.length;
        this.cdr.detectChanges();
      }
    } catch {
      // Non-critical — badge just stays at 0
    }
  }

  // ---- Toolbar Event Handlers ----

  /**
   * Navigation events are always re-emitted for the host app to handle.
   */
  OnNavigate(event: FormNavigationEvent): void {
    this.Navigate.emit(event);
  }

  /**
   * Edit mode change: delegate to FormComponent if available, otherwise re-emit.
   */
  OnEditModeChange(editMode: boolean): void {
    if (this.fc) {
      if (editMode) {
        this.fc.StartEditMode();
      } else {
        this.fc.EndEditMode();
      }
      this.cdr.markForCheck();
    } else {
      this.EditModeChange.emit(editMode);
    }
  }

  /**
   * Save: delegate to FormComponent if available, otherwise re-emit.
   */
  async OnSaveRequested(): Promise<void> {
    if (this.fc?.SaveRecord) {
      // Mark as saving to prevent double-click
      this.IsSaving = true;
      this.cdr.markForCheck();

      try {
        await this.fc.SaveRecord(true);

        // After successful save, refresh version count badge and record changes drawer
        this.RefreshAfterSave();
      } finally {
        // Use microtask timing to avoid ExpressionChangedAfterItHasBeenCheckedError
        await Promise.resolve();
        this.ngZone.run(() => {
          this.IsSaving = false;
          this.cdr.markForCheck();
        });
      }
    } else {
      this.SaveRequested.emit();
    }
  }

  /**
   * Refreshes the version count badge and record changes drawer after a save.
   * The save operation creates a new RecordChange entry server-side, so we need
   * to update the UI to reflect the new version.
   */
  private RefreshAfterSave(): void {
    const record = this.EffectiveRecord;
    if (!record?.EntityInfo?.TrackRecordChanges) return;

    // Refresh version count badge
    this.LoadVersionCount(record);

    // If the record changes drawer is open, refresh it too
    if (this.ShowRecordChanges && this.recordChangesDrawer) {
      this.recordChangesDrawer.Refresh();
    }
  }

  /**
   * Cancel: delegate to FormComponent if available, otherwise re-emit.
   */
  OnCancelRequested(): void {
    if (this.fc?.CancelEdit) {
      this.fc.CancelEdit();
      this.cdr.markForCheck();
    } else {
      this.CancelRequested.emit();
    }
  }

  /**
   * Delete, Favorite, History, Lists, ShowChanges: always re-emit for host app.
   */
  OnDeleteRequested(): void {
    this.DeleteRequested.emit();
  }

  OnFavoriteToggled(): void {
    this.FavoriteToggled.emit();
  }

  OnHistoryRequested(): void {
    // Check if event should be cancelled
    const beforeEvent = new BeforeHistoryViewEventArgs();
    this.BeforeHistoryView.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    // If not cancelled, show built-in record changes drawer
    this.ShowRecordChanges = true;
    this.cdr.markForCheck();

    // Also emit for backward compatibility
    this.HistoryRequested.emit();
  }

  OnListManagementRequested(): void {
    // Check if event should be cancelled
    const beforeEvent = new BeforeListManagementEventArgs();
    this.BeforeListManagement.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    // If not cancelled, show built-in list management dialog
    this.ShowListManagement = true;
    this.cdr.markForCheck();

    // Also emit for backward compatibility
    this.ListManagementRequested.emit();
  }

  OnTagsPanelToggled(): void {
    this.ShowTagsPanel = !this.ShowTagsPanel;
    this.cdr.detectChanges();
  }

  OnTagsPanelClosed(): void {
    this.ShowTagsPanel = false;
    this.cdr.detectChanges();

    // Refresh tag count — tags may have been added/removed while panel was open
    const record = this.EffectiveRecord;
    if (record?.EntityInfo) {
      this.LoadTagCount(record);
    }
  }

  /**
   * Handles live tag count updates from the tags panel component.
   */
  OnTagCountChanged(count: number): void {
    this.TagCount = count;
    this.cdr.markForCheck();
  }

  OnTagsPanelWidthChanged(width: number): void {
    this.TagsPanelWidth = width;
    UserInfoEngine.Instance.SetSettingDebounced(MjRecordFormContainerComponent.TAGS_WIDTH_KEY, String(width));
  }

  OnTagsRecordNavigate(event: { EntityName: string; RecordID: string }): void {
    const md = this.ProviderToUse;
    const entityInfo = md.Entities.find(e => e.Name === event.EntityName);
    const pkey = new CompositeKey();
    if (entityInfo) {
      pkey.LoadFromURLSegment(entityInfo, event.RecordID);
    } else {
      pkey.KeyValuePairs = [{ FieldName: 'ID', Value: event.RecordID }];
    }
    this.Navigate.emit({ Kind: 'record', EntityName: event.EntityName, PrimaryKey: pkey });
  }

  OnRecordChangesClosed(): void {
    this.ShowRecordChanges = false;
    this.cdr.markForCheck();

    // Refresh version count — new changes may have occurred
    const record = this.EffectiveRecord;
    if (record?.EntityInfo) {
      this.LoadVersionCount(record);
    }
  }

  /**
   * Handles a restore request from the record-changes panel.
   *
   * The event payload now carries the FULL snapshot the user opted to apply
   * (the panel computes current-vs-snapshot diffs using the source change's
   * FullRecordJSON, and the user can deselect individual fields). Setting
   * the restore context before Save() causes the data provider to write the
   * resulting RecordChange row with `Source='Restore'`, `RestoredFromID`,
   * and `RestoreReason` populated — building the auditable lineage chain.
   */
  async OnRestoreRequested(event: RestoreVersionEvent): Promise<void> {
    const record = this.EffectiveRecord;
    if (!record) return;

    try {
      // Apply each selected snapshot field
      for (const fv of event.FieldValues) {
        record.Set(fv.FieldName, fv.Value);
      }

      // Mark the next save as a restore so the provider populates the
      // lineage columns. ClearRestoreContext is called in finally{} below
      // so it doesn't leak into subsequent saves on this entity instance.
      record.SetRestoreContext(event.SourceChangeID, event.Reason);

      try {
        const saved = await record.Save();
        if (saved) {
          const fieldCount = event.FieldValues.length;
          const reasonSuffix = event.Reason ? ` — "${event.Reason}"` : '';
          this.notificationService.CreateSimpleNotification(
            `Restored ${fieldCount} field${fieldCount === 1 ? '' : 's'} from version dated ${new Date(event.ChangedAt).toLocaleDateString()}${reasonSuffix}`,
            'info', 3500,
          );

          // Refresh version count — the save just produced a new restore-tagged change.
          this.LoadVersionCount(record);
          this.cdr.markForCheck();
        } else {
          const errMsg = record.LatestResult?.CompleteMessage ?? 'unknown error';
          this.notificationService.CreateSimpleNotification(
            `Failed to save restored values: ${errMsg}`,
            'error', 4500,
          );
        }
      } finally {
        record.ClearRestoreContext();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.notificationService.CreateSimpleNotification(
        `Restore failed: ${message}`,
        'error', 4000,
      );
    }
  }

  OnListManagementClosed(): void {
    this.ShowListManagement = false;
    this.cdr.markForCheck();
  }

  /**
   * Fired when the list-management dialog applies changes. Surfaces the
   * outcome — especially silently-skipped duplicates and failures, which
   * users otherwise misread as "everything was added".
   */
  OnListManagementComplete(result: ListManagementResult): void {
    const s = result.summary;
    if (s && (s.added > 0 || s.removed > 0 || s.skipped > 0 || s.failed > 0)) {
      const parts: string[] = [];
      if (s.added > 0) parts.push(`added to ${result.added.length} list${result.added.length === 1 ? '' : 's'}`);
      if (s.removed > 0) parts.push(`removed from ${result.removed.length} list${result.removed.length === 1 ? '' : 's'}`);
      if (s.skipped > 0) parts.push(`${s.skipped} duplicate${s.skipped === 1 ? '' : 's'} skipped`);
      if (s.failed > 0) parts.push(`${s.failed} failed`);
      this.notificationService.CreateSimpleNotification(
        `List changes applied: ${parts.join(', ')}`,
        s.failed > 0 ? 'warning' : 'success',
        s.failed > 0 ? 5000 : 3500,
      );
    }
    this.OnListManagementClosed();
  }

  OnShowChangesRequested(): void {
    if (this.fc?.ShowChanges) {
      this.fc.ShowChanges();
    } else {
      this.ShowChangesRequested.emit();
    }
  }

  // ---- Section Control Handlers ----

  OnFilterChange(filter: string): void {
    if (this.fc?.onFilterChange) {
      this.fc.onFilterChange(filter);
      if (filter.trim() && this.ChromeMoreItems.length > 0) {
        this.chrome.MoreExpanded = true;
      }
      this.ensureActiveGroupVisible();
      this.applyChromeVisibility();
      this.cdr.markForCheck();
    }
  }

  OnExpandAll(): void {
    if (this.fc?.expandAllSections) {
      this.fc.expandAllSections();
      this.cdr.markForCheck();
    }
  }

  OnCollapseAll(): void {
    if (this.fc?.collapseAllSections) {
      this.fc.collapseAllSections();
      this.cdr.markForCheck();
    }
  }

  OnShowEmptyFieldsChange(show: boolean): void {
    if (this.fc) {
      this.fc.showEmptyFields = show;
      this.cdr.markForCheck();
    }
  }

  OnWidthModeChange(mode: FormWidthMode): void {
    if (this.fc?.setFormWidthMode) {
      this.fc.setFormWidthMode(mode);
      this.cdr.markForCheck();
    } else {
      this.WidthMode = mode;
      this.cdr.markForCheck();
    }
  }

  OnResetSectionOrder(): void {
    if (this.fc?.resetSectionOrder) {
      this.fc.resetSectionOrder();
      this.scheduleChromeResolve();
      this.cdr.markForCheck();
    }
  }

  // ---- Variant picker ----

  /** Whether the variant dropdown menu is currently open. Toggled by the
   *  control's click handler; closed on blur or after a row is picked. */
  _variantMenuOpen = false;

  /**
   * Effective variants — prefer the form component's list (set by the host
   * resolver) when present, fall back to the directly-bound @Input. This
   * means generated form templates don't need to bind [Variants] explicitly;
   * the host populates `instance.Variants` post-construction and the
   * container reads it through this accessor.
   */
  get EffectiveVariants(): VariantPickerItem[] {
    return (this.fc?.Variants as VariantPickerItem[] | undefined)
        ?? this.Variants
        ?? [];
  }

  get EffectiveCurrentVariantID(): string | null {
    return this.fc?.CurrentVariantID ?? this.CurrentVariantID;
  }

  /** Whether to show the variant picker at all. Hidden when the entity has
   *  zero or one applicable variant — there's nothing to switch between. */
  get ShowVariantPicker(): boolean {
    return (this.EffectiveVariants?.length ?? 0) > 1;
  }

  /** Label for the currently-selected variant (or "Default form" if none). */
  get CurrentVariantLabel(): string {
    const v = this.EffectiveVariants?.find(x => UUIDsEqual(x.ID, this.EffectiveCurrentVariantID));
    return v?.Label ?? 'Default form';
  }

  /** Compact subtitle: scope + status, e.g. "User · Active". */
  variantSubtitle(v: VariantPickerItem): string {
    return `${v.Scope} · ${v.Status}`;
  }

  /**
   * User picked an item from the variant menu. If the host installed a
   * handler via `instance.OnVariantChanged`, call it; otherwise emit the
   * VariantChange event for standalone consumers.
   */
  OnVariantPicked(variantID: string | null): void {
    if (variantID === this.EffectiveCurrentVariantID) return;
    if (this.fc && typeof this.fc.OnVariantChanged === 'function') {
      this.fc.OnVariantChanged(variantID);
    } else {
      this.VariantChange.emit(variantID);
    }
  }

  // ---- Section Manager Handlers ----

  OnManageSections(): void {
    this.ShowSectionManager = true;
    this.cdr.markForCheck();
  }

  OnSectionOrderChange(newOrder: string[]): void {
    if (this.fc?.setSectionOrder) {
      this.fc.setSectionOrder(newOrder);
      this.scheduleChromeResolve();
      this.cdr.markForCheck();
    }
  }

  OnChromeMembershipChange(change: ChromeMembershipChange): void {
    if (this.fc?.setChromeMembership) {
      this.fc.setChromeMembership(change.moreSectionKeys, change.firstClassSectionKeys);
      this.scheduleChromeResolve();
      this.cdr.markForCheck();
    }
  }

  OnSectionManagerReset(): void {
    this.OnResetSectionOrder();
  }

  OnSectionManagerClosed(): void {
    this.ShowSectionManager = false;
    this.cdr.markForCheck();
  }
}
