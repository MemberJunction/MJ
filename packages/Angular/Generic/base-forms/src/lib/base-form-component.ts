import {
  AfterViewInit, OnInit, OnDestroy, Directive,
  ViewChildren, QueryList, ElementRef, ChangeDetectorRef,
  Output, EventEmitter, inject
} from '@angular/core';

import { Subject, Subscription, debounceTime } from 'rxjs';
import {
  EntityInfo, ValidationResult, BaseEntity, EntityPermissionType,
  EntityRelationshipInfo, Metadata, RunViewParams, LogError,
  RecordDependency, BaseEntityEvent, CompositeKey, RunView, RunViewResult
} from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { FormEditingCompleteEvent, PendingRecordItem, BaseFormComponentEventCodes } from '@memberjunction/ng-base-types';
import { ListEntity } from '@memberjunction/core-entities';

import { BaseRecordComponent } from './base-record-component';
import { BaseFormSectionInfo } from './base-form-section-info';
import { MjCollapsiblePanelComponent } from './panel/collapsible-panel.component';
import { FormNavigationEvent } from './types/navigation-events';
import {
  FormContext,
  FormNotificationEvent,
  RecordSavedEvent,
  RecordDeletedEvent,
  RecordSaveFailedEvent,
  RecordDeleteFailedEvent,
  ValidationFailedEvent
} from './types/form-types';
import { FormStateService } from './form-state.service';

/**
 * Abstract base class for all entity record forms in MemberJunction.
 *
 * Generated forms (via CodeGen) and custom forms extend this class.
 * It provides core form logic — section management, validation, pending records,
 * permissions, favorites, related entity helpers — with ZERO Explorer dependencies.
 *
 * Instead of calling Explorer services directly, events are emitted via @Output:
 * - **Navigate**: Form navigation requests (record links, new records, external links)
 * - **Notification**: User-facing notifications (save success, validation errors, etc.)
 * - **RecordSaved**: Emitted after a successful save
 * - **RecordDeleted**: Emitted after a successful delete
 *
 * The host application (e.g. SingleRecordComponent in Explorer) subscribes to
 * these events and maps them to its own services (NavigationService, SharedService, etc.).
 */
@Directive()
export abstract class BaseFormComponent extends BaseRecordComponent implements AfterViewInit, OnInit, OnDestroy {
  public EditMode: boolean = false;
  public FavoriteInitDone: boolean = false;
  public isHistoryDialogOpen: boolean = false;
  public showDeleteDialog: boolean = false;
  public showCreateDialog: boolean = false;

  /**
   * Height of the top area when a splitter layout is used.
   * Referenced by CodeGen-generated templates for entities with "top area" sections.
   */
  public TopAreaHeight: string = '300px';

  /**
   * Called when the splitter layout changes (for entities with "top area" sections).
   * No-op in the generic version; override in host application if splitter resizing is needed.
   */
  public splitterLayoutChange(): void {
    // No-op — host application can override
  }

  private _pendingRecords: PendingRecordItem[] = [];

  // #region Injected Dependencies (no constructor params)

  protected elementRef = inject(ElementRef);
  public cdr = inject(ChangeDetectorRef);
  protected formStateService = inject(FormStateService);

  // #endregion

  // #region @Output Events

  /** Emitted when navigation is requested (record link, external link, email, new record, etc.) */
  @Output() Navigate = new EventEmitter<FormNavigationEvent>();

  /** Emitted when a user-facing notification should be shown */
  @Output() Notification = new EventEmitter<FormNotificationEvent>();

  /** Emitted after a record is saved successfully */
  @Output() RecordSaved = new EventEmitter<RecordSavedEvent>();

  /** Emitted after a record is deleted successfully */
  @Output() RecordDeleted = new EventEmitter<RecordDeletedEvent>();

  /** Emitted when a record save fails */
  @Output() RecordSaveFailed = new EventEmitter<RecordSaveFailedEvent>();

  /** Emitted when a record delete fails */
  @Output() RecordDeleteFailed = new EventEmitter<RecordDeleteFailedEvent>();

  /** Emitted when validation fails before save */
  @Output() ValidationFailed = new EventEmitter<ValidationFailedEvent>();

  // #endregion

  /** Subscription to form state changes */
  private formStateSubscription?: Subscription;

  @ViewChildren(MjCollapsiblePanelComponent) collapsiblePanels!: QueryList<MjCollapsiblePanelComponent>;

  async ngOnInit() {
    if (this.record) {
      if (!this.record.IsSaved) {
        this.StartEditMode();
      }
      const md = new Metadata();
      this._isFavorite = await md.GetRecordFavoriteStatus(md.CurrentUser.ID, this.record.EntityInfo.Name, this.record.PrimaryKey);
      this.FavoriteInitDone = true;

      // Initialize form state from User Settings
      const entityName = this.getEntityName();
      if (entityName) {
        await this.formStateService.initializeState(entityName);
        this.formStateSubscription = this.formStateService.getState$(entityName).subscribe(state => {
          this.showEmptyFields = state.showEmptyFields;
          this.cdr.markForCheck();
        });
      }
    }

    // Set up debounced filter subscription
    this.filterSubscription = this.filterSubject
      .pipe(debounceTime(100))
      .subscribe(searchTerm => {
        this.searchFilter = searchTerm;
      });
  }

  ngAfterViewInit(): void {
    // Subclasses can override for post-view-init logic
  }

  ngOnDestroy(): void {
    if (this.filterSubscription) {
      this.filterSubscription.unsubscribe();
    }
    if (this.formStateSubscription) {
      this.formStateSubscription.unsubscribe();
    }
  }

  // #region Pending Records

  protected get PendingRecords(): PendingRecordItem[] {
    return this._pendingRecords;
  }

  protected PendingRecordsDirty(): boolean {
    this.PopulatePendingRecords();
    const pendingRecords = this.PendingRecords;
    if (pendingRecords && pendingRecords.length > 0) {
      for (const p of pendingRecords) {
        if (p.action === 'delete')
          return true;
        else if (p.entityObject.Dirty)
          return true;
      }
    }
    return false;
  }

  protected PopulatePendingRecords() {
    this._pendingRecords = [];
    this.RaiseEvent(BaseFormComponentEventCodes.EDITING_COMPLETE);
    const result = this.RaiseEvent(BaseFormComponentEventCodes.POPULATE_PENDING_RECORDS);
    if (result && result.pendingChanges) {
      for (const p of result.pendingChanges)
        this.PendingRecords.push(p);
    }
  }

  protected ValidatePendingRecords(): ValidationResult[] {
    const results: ValidationResult[] = [];
    for (let i = 0; i < this._pendingRecords.length; i++) {
      const pendingRecord = this._pendingRecords[i];
      results.push(pendingRecord.entityObject.Validate());
    }
    return results;
  }

  // #endregion

  // #region Edit Mode

  public StartEditMode(): void {
    this.EditMode = true;
  }

  public EndEditMode(): void {
    this.EditMode = false;
  }

  public handleHistoryDialog(): void {
    this.isHistoryDialogOpen = !this.isHistoryDialogOpen;
  }

  // #endregion

  // #region Core Form Operations

  public Validate(): ValidationResult {
    const valResults = (<BaseEntity>this.record).Validate();
    const pendingValResults = this.ValidatePendingRecords();
    for (let i = 0; i < pendingValResults.length; i++) {
      const pendingValResult = pendingValResults[i];
      if (!pendingValResult.Success) {
        valResults.Success = false;
        valResults.Errors.push(...pendingValResult.Errors);
      }
    }
    return valResults;
  }

  protected RaiseEvent(eventCode: BaseFormComponentEventCodes) {
    const event = new FormEditingCompleteEvent();
    event.elementRef = this.elementRef;
    event.subEventCode = eventCode;

    MJGlobal.Instance.RaiseEvent({
      event: MJEventType.ComponentEvent,
      component: this,
      eventCode: BaseFormComponentEventCodes.BASE_CODE,
      args: event
    });

    return event;
  }

  public async SaveRecord(StopEditModeAfterSave: boolean): Promise<boolean> {
    try {
      try {
        (document.activeElement as HTMLElement).blur();
        this.RaiseEvent(BaseFormComponentEventCodes.EDITING_COMPLETE);
      } catch (_e) {
        // ignore blur errors
      }

      if (this.record) {
        this.PopulatePendingRecords();
        const valResults = this.Validate();
        if (valResults.Success) {
          const result = await this.InternalSaveRecord();
          if (result) {
            this._pendingRecords = [];
            if (StopEditModeAfterSave)
              this.EndEditMode();

            this.Notification.emit({ Message: 'Record saved successfully', Type: 'success', Duration: 2500 });
            this.RecordSaved.emit({
              EntityName: this.record.EntityInfo.Name,
              RecordId: this.record.PrimaryKey.ToString(),
              Result: { Success: true }
            });
            return true;
          } else {
            const errorMsg = 'Error saving record';
            this.Notification.emit({ Message: errorMsg, Type: 'error', Duration: 5000 });
            this.RecordSaveFailed.emit({ EntityName: this.record.EntityInfo.Name, ErrorMessage: errorMsg });
          }
        } else {
          const errorMessages = valResults.Errors.map(x => x.Message);
          this.Notification.emit({
            Message: 'Validation Errors\n' + errorMessages.join('\n'),
            Type: 'warning',
            Duration: 5000
          });
          this.ValidationFailed.emit({ EntityName: this.record.EntityInfo.Name, Errors: errorMessages });
        }
      }

      LogError("Could not save record: Record not found");
      return false;
    } catch (e) {
      const errorMsg = 'Error saving record: ' + e;
      this.Notification.emit({ Message: errorMsg, Type: 'error', Duration: 5000 });
      if (this.record) {
        this.RecordSaveFailed.emit({ EntityName: this.record.EntityInfo.Name, ErrorMessage: errorMsg });
      }
      return false;
    }
  }

  public CancelEdit() {
    if (this.record) {
      const r = <BaseEntity>this.record;
      if (r.Dirty || this.PendingRecordsDirty()) {
        if (!confirm('Are you sure you want to cancel your changes?')) {
          return;
        }
        r.Revert();

        const pendingRecords = this.PendingRecords;
        if (pendingRecords && pendingRecords.length > 0) {
          pendingRecords.forEach(p => {
            if (p.action === 'save')
              p.entityObject.Revert();
          });
        }
        this.RaiseEvent(BaseFormComponentEventCodes.REVERT_PENDING_CHANGES);
      }
      this.EndEditMode();
    }
  }

  protected async InternalSaveRecord(): Promise<boolean> {
    if (this.record) {
      if (this._pendingRecords.length > 0) {
        const md = new Metadata();
        const tg = await md.CreateTransactionGroup();
        this.record.TransactionGroup = tg;
        await this.record.Save();

        for (const x of this._pendingRecords) {
          x.entityObject.TransactionGroup = tg;
          if (x.action === 'save') {
            await x.entityObject.Save();
          } else {
            await x.entityObject.Delete();
          }
        }
        return await tg.Submit();
      } else {
        return await this.record.Save();
      }
    } else {
      return false;
    }
  }

  public async Wait(duration: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, duration));
  }

  // #endregion

  // #region Permissions

  private _userPermissions: { permission: EntityPermissionType; canDo: boolean }[] = [];

  public CheckUserPermission(type: EntityPermissionType): boolean {
    try {
      if (this.record) {
        const perm = this._userPermissions.find(x => x.permission === type);
        if (perm)
          return perm.canDo;
        else {
          const result = this.record.CheckPermissions(type, false);
          this._userPermissions.push({ permission: type, canDo: result });
          return result;
        }
      } else {
        return false;
      }
    } catch (e) {
      LogError(e);
      return false;
    }
  }

  public get UserCanEdit(): boolean {
    return this.CheckUserPermission(EntityPermissionType.Update);
  }

  public get UserCanRead(): boolean {
    return this.CheckUserPermission(EntityPermissionType.Read);
  }

  public get UserCanCreate(): boolean {
    return this.CheckUserPermission(EntityPermissionType.Create);
  }

  public get UserCanDelete(): boolean {
    return this.CheckUserPermission(EntityPermissionType.Delete);
  }

  // #endregion

  // #region Grid Edit Mode

  public GridEditMode(): "None" | "Save" | "Queue" {
    return this.EditMode ? "Queue" : "None";
  }

  // #endregion

  // #region Favorites

  private _isFavorite: boolean = false;

  public get IsFavorite(): boolean {
    return this._isFavorite;
  }

  public async RemoveFavorite(): Promise<void> {
    return this.SetFavoriteStatus(false);
  }

  public async MakeFavorite(): Promise<void> {
    return this.SetFavoriteStatus(true);
  }

  public async SetFavoriteStatus(isFavorite: boolean) {
    const md = new Metadata();
    await md.SetRecordFavoriteStatus(md.CurrentUser.ID, this.record.EntityInfo.Name, this.record.PrimaryKey, isFavorite);
    this._isFavorite = isFavorite;
  }

  // #endregion

  // #region Related Entity Helpers

  public BuildRelationshipViewParams(item: EntityRelationshipInfo): RunViewParams {
    return EntityInfo.BuildRelationshipViewParams(this.record, item);
  }

  public BuildRelationshipViewParamsByEntityName(relatedEntityName: string, relatedEntityJoinField?: string): RunViewParams {
    const eri = this.GetEntityRelationshipByRelatedEntityName(relatedEntityName, relatedEntityJoinField);
    if (eri)
      return this.BuildRelationshipViewParams(eri);
    else
      return {};
  }

  public GetEntityRelationshipByRelatedEntityName(relatedEntityName: string, relatedEntityJoinField?: string): EntityRelationshipInfo | undefined {
    if (this.record) {
      const r = <BaseEntity>this.record;
      const ret = r.EntityInfo.RelatedEntities.filter(x => x.RelatedEntity.trim().toLowerCase() === relatedEntityName.trim().toLowerCase());
      if (ret.length > 1 && relatedEntityJoinField) {
        const ret2 = ret.find(x => x.RelatedEntityJoinField.trim().toLowerCase() === relatedEntityJoinField.trim().toLowerCase());
        if (ret2)
          return ret2;
      } else if (ret.length === 1) {
        return ret[0];
      } else {
        return undefined;
      }
    }
    return undefined;
  }

  public NewRecordValues(relatedEntityName: string): Record<string, unknown> {
    const eri = this.GetEntityRelationshipByRelatedEntityName(relatedEntityName);
    if (eri)
      return this.NewRecordValuesByEntityRelationship(eri);
    else
      return {};
  }

  public NewRecordValuesByEntityRelationship(item: EntityRelationshipInfo): Record<string, unknown> {
    return EntityInfo.BuildRelationshipNewRecordValues(this.record, item);
  }

  public GetRelatedEntityTabDisplayName(relatedEntityName: string): string {
    if (this.record) {
      const eri = (<BaseEntity>this.record).EntityInfo.RelatedEntities.find(x => x.RelatedEntity === relatedEntityName);
      if (eri)
        return eri.DisplayName;
    }
    return relatedEntityName;
  }

  public get HasRelatedEntities(): boolean {
    if (this.record) {
      const relatedEntities = (<BaseEntity>this.record).EntityInfo.RelatedEntities;
      return relatedEntities && relatedEntities.length > 0;
    }
    return false;
  }

  // #endregion

  // #region Entity Info & Dependencies

  public get EntityInfo(): EntityInfo | undefined {
    try {
      const r = <BaseEntity>this.record;
      if (r)
        return r.EntityInfo;
      else
        return undefined;
    } catch (e) {
      LogError(e);
      return undefined;
    }
  }

  public async ShowDependencies() {
    const md = new Metadata();
    const dep = await md.GetRecordDependencies(this.record.EntityInfo.Name, this.record.PrimaryKey);
    console.log('Dependencies for: ' + this.record.EntityInfo.Name + ' ' + this.record.PrimaryKey.ToString());
    console.log(dep);
  }

  public ShowChanges(): void {
    if (this.record) {
      const changes = this.record.GetAll(false, true);
      const oldValues = this.record.GetAll(true, true);
      const message =
        'Changes for: ' + this.record.EntityInfo.Name + ' ' + this.record.PrimaryKey.ToString() +
        '\n\n' + JSON.stringify(changes, null, 2) +
        '\n\nOld Values\n\n' + JSON.stringify(oldValues, null, 2);
      console.log(message);
      this.Notification.emit({ Message: message, Type: 'info', Duration: 30000 });
    }
  }

  public async GetListsCanAddTo(): Promise<ListEntity[]> {
    if (!this.record) {
      LogError('Unable to fetch List records: Record not found');
      return [];
    }

    const rv = new RunView();
    const md = new Metadata();

    const rvResult: RunViewResult<ListEntity> = await rv.RunView({
      EntityName: 'Lists',
      ExtraFilter: `UserID = '${md.CurrentUser.ID}' AND EntityID = '${this.record.EntityInfo.ID}'`,
      ResultType: 'entity_object'
    });

    if (!rvResult.Success) {
      LogError('Error running view to fetch lists', undefined, rvResult.ErrorMessage);
      return [];
    }

    return rvResult.Results;
  }

  public async GetRecordDependencies(): Promise<RecordDependency[]> {
    const md = new Metadata();
    const dependencies: RecordDependency[] = await md.GetRecordDependencies(this.record.EntityInfo.Name, this.record.PrimaryKey);
    return dependencies;
  }

  // #endregion

  // #region Collapsible Section Management

  protected sections: BaseFormSectionInfo[] = [];
  private sectionMap: Map<string, BaseFormSectionInfo> = new Map();

  public searchFilter: string = '';
  public showEmptyFields: boolean = false;

  public get formContext(): FormContext {
    return {
      sectionFilter: this.searchFilter,
      showEmptyFields: this.showEmptyFields
    };
  }

  private filterSubject = new Subject<string>();
  private filterSubscription?: Subscription;

  protected initSections(sections: (BaseFormSectionInfo | { sectionKey: string; sectionName: string; isExpanded: boolean; rowCount?: number; metadata?: unknown })[]): void {
    this.sections = sections.map(s =>
      s instanceof BaseFormSectionInfo
        ? s
        : new BaseFormSectionInfo(s.sectionKey, s.sectionName, s.isExpanded, s.rowCount, s.metadata)
    );
    this.sectionMap.clear();
    this.sections.forEach(section => {
      this.sectionMap.set(section.sectionKey, section);
    });
  }

  protected getSection(sectionKey: string): BaseFormSectionInfo | undefined {
    return this.sectionMap.get(sectionKey);
  }

  public IsSectionExpanded(sectionKey: string, defaultExpanded?: boolean): boolean {
    const entityName = this.getEntityName();
    if (entityName) {
      return this.formStateService.isSectionExpanded(entityName, sectionKey, defaultExpanded);
    }
    const section = this.sectionMap.get(sectionKey);
    return section ? section.isExpanded : (defaultExpanded !== undefined ? defaultExpanded : true);
  }

  public SetSectionExpanded(sectionKey: string, isExpanded: boolean): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.setSectionExpanded(entityName, sectionKey, isExpanded);
    }
    const section = this.sectionMap.get(sectionKey);
    if (section) {
      section.isExpanded = isExpanded;
    }
  }

  public GetSectionRowCount(sectionKey: string): number | undefined {
    const section = this.sectionMap.get(sectionKey);
    return section?.rowCount;
  }

  public SetSectionRowCount(sectionKey: string, rowCount: number): void {
    const section = this.sectionMap.get(sectionKey);
    if (section) {
      section.rowCount = rowCount;
    }
  }

  public GetSectionPanelHeight(sectionKey: string): number | undefined {
    const entityName = this.getEntityName();
    if (entityName) {
      return this.formStateService.getSectionPanelHeight(entityName, sectionKey);
    }
    return undefined;
  }

  public SetSectionPanelHeight(sectionKey: string, height: number): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.setSectionPanelHeight(entityName, sectionKey, height);
    }
  }

  public toggleSection(sectionKey: string): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.toggleSection(entityName, sectionKey);
    }
    const section = this.sectionMap.get(sectionKey);
    if (section) {
      section.isExpanded = !section.isExpanded;
    }
  }

  public expandAllSections(): void {
    const entityName = this.getEntityName();
    const sectionKeys = this.sections.map(s => s.sectionKey);
    if (entityName && sectionKeys.length > 0) {
      this.formStateService.expandAllSections(entityName, sectionKeys);
    }
    this.sections.forEach(section => {
      section.isExpanded = true;
    });
  }

  public collapseAllSections(): void {
    const entityName = this.getEntityName();
    const sectionKeys = this.sections.map(s => s.sectionKey);
    if (entityName && sectionKeys.length > 0) {
      this.formStateService.collapseAllSections(entityName, sectionKeys);
    }
    this.sections.forEach(section => {
      section.isExpanded = false;
    });
  }

  public getExpandedCount(): number {
    const entityName = this.getEntityName();
    const sectionKeys = this.sections.map(s => s.sectionKey);
    if (entityName && sectionKeys.length > 0) {
      return this.formStateService.getExpandedCount(entityName, sectionKeys);
    }
    return this.sections.filter(section => section.isExpanded).length;
  }

  public getVisibleSectionCount(): number {
    if (!this.collapsiblePanels || this.collapsiblePanels.length === 0) {
      return this.sections.length;
    }
    return this.collapsiblePanels.filter(panel => panel.IsVisible).length;
  }

  public getTotalSectionCount(): number {
    return this.sections.length;
  }

  public onFilterChange(searchTerm: string): void {
    this.filterSubject.next(searchTerm);
  }

  public getEntityName(): string {
    return this.record?.EntityInfo?.Name || '';
  }

  public getFormWidthMode(): 'centered' | 'full-width' {
    const entityName = this.getEntityName();
    if (entityName) {
      return this.formStateService.getWidthMode(entityName);
    }
    return 'centered';
  }

  public setFormWidthMode(widthMode: 'centered' | 'full-width'): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.setWidthMode(entityName, widthMode);
    }
  }

  public toggleFormWidthMode(): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.toggleWidthMode(entityName);
    }
  }

  // #endregion

  // #region Section Ordering

  public getSectionOrder(): string[] {
    const entityName = this.getEntityName();
    if (entityName) {
      const customOrder = this.formStateService.getSectionOrder(entityName);
      if (customOrder && customOrder.length > 0) {
        return customOrder;
      }
    }
    return this.sections.map(s => s.sectionKey);
  }

  public setSectionOrder(sectionOrder: string[]): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.setSectionOrder(entityName, sectionOrder);
    }
  }

  public resetSectionOrder(): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.resetSectionOrder(entityName);
    }
  }

  public hasCustomSectionOrder(): boolean {
    const entityName = this.getEntityName();
    if (entityName) {
      return this.formStateService.hasCustomSectionOrder(entityName);
    }
    return false;
  }

  public getSectionDisplayOrder(sectionKey: string): number {
    const order = this.getSectionOrder();
    const index = order.indexOf(sectionKey);
    return index >= 0 ? index : this.sections.length;
  }

  // #endregion

  // #region Form Container Event Handlers

  /**
   * Handles navigation events from the form container and related entity grids.
   * Relays the event upward via the Navigate @Output for the host application to handle.
   * Generated form templates bind this as: (Navigate)="OnFormNavigate($event)"
   */
  public OnFormNavigate(event: FormNavigationEvent): void {
    this.Navigate.emit(event);
  }

  /**
   * Handles delete requests from the form container.
   * Emits RecordDeleted on success, RecordDeleteFailed on failure.
   * Generated form templates bind this as: (DeleteRequested)="OnDeleteRequested()"
   */
  public async OnDeleteRequested(): Promise<void> {
    if (!this.record || !this.record.IsSaved) return;
    try {
      const result = await this.record.Delete();
      if (result) {
        this.Notification.emit({ Message: 'Record deleted successfully', Type: 'success', Duration: 2500 });
        this.RecordDeleted.emit({
          EntityName: this.record.EntityInfo.Name,
          RecordId: this.record.PrimaryKey.ToString()
        });
      } else {
        const errorMsg = 'Error deleting record';
        this.Notification.emit({ Message: errorMsg, Type: 'error', Duration: 5000 });
        this.RecordDeleteFailed.emit({ EntityName: this.record.EntityInfo.Name, ErrorMessage: errorMsg });
      }
    } catch (e) {
      const errorMsg = 'Error deleting record: ' + e;
      this.Notification.emit({ Message: errorMsg, Type: 'error', Duration: 5000 });
      this.RecordDeleteFailed.emit({ EntityName: this.record.EntityInfo.Name, ErrorMessage: errorMsg });
    }
  }

  /**
   * Handles favorite toggle from the form container.
   * Generated form templates bind this as: (FavoriteToggled)="OnFavoriteToggled()"
   */
  public async OnFavoriteToggled(): Promise<void> {
    await this.SetFavoriteStatus(!this.IsFavorite);
  }

  /**
   * Handles history view requests from the form container.
   * Generated form templates bind this as: (HistoryRequested)="OnHistoryRequested()"
   */
  public OnHistoryRequested(): void {
    this.handleHistoryDialog();
  }

  /**
   * Handles list management requests from the form container.
   * Generated form templates bind this as: (ListManagementRequested)="OnListManagementRequested()"
   */
  public OnListManagementRequested(): void {
    // List management dialog is handled by the host application
    // Subclasses can override this to implement custom list management
  }

  // #endregion
}
