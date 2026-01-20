import { AfterViewInit, OnInit, OnDestroy, Directive, ViewChildren, QueryList, ElementRef, ViewChild, ChangeDetectorRef, ContentChildren, inject } from '@angular/core';

import { Subject, Subscription, debounceTime, fromEvent } from 'rxjs';
import { EntityInfo, ValidationResult, BaseEntity, EntityPermissionType,
         EntityRelationshipInfo, Metadata, RunViewParams, LogError,
         RecordDependency,
         BaseEntityEvent,
         CompositeKey,
         RunView,
         RunViewResult} from '@memberjunction/core';
import { BaseRecordComponent } from './base-record-component';
import { BaseFormSectionInfo } from './base-form-section-info';
import { BaseFormContext } from './base-form-context';
import { CollapsiblePanelComponent } from './collapsible-panel.component';
import { SharedService } from '@memberjunction/ng-shared';
import { ActivatedRoute, Router } from '@angular/router';
import { MJTabStripComponent, TabEvent } from '@memberjunction/ng-tabstrip';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { FormEditingCompleteEvent, PendingRecordItem, BaseFormComponentEventCodes } from '@memberjunction/ng-base-types';
import { ListEntity } from '@memberjunction/core-entities';
import { FormStateService } from './form-state.service';

@Directive() // this isn't really a directive, BUT we are doing this to avoid Angular compile errors that require a decorator in order to implement the lifecycle interfaces
export abstract class BaseFormComponent extends BaseRecordComponent implements AfterViewInit, OnInit, OnDestroy {
  public EditMode: boolean = false;
  public BottomMargin: number = 10;
  public TabHeight: string = '500px';
  /**
   * This property is automatically updated by the BaseFormComponent to reflect the height of the "Top Area" of the form. The Top Area is defined in a template by having
   * a #topArea element anywhere in the form. This property will automatically be updated AfterViewInit to reflect the height of the top area. This is useful for various things
   * like setting a pane in a splitter to a specific height based on the top area height.
   */
  public TopAreaHeight: string = '300px';
  public GridBottomMargin: number = 100;
  public FavoriteInitDone: boolean = false;
  public isHistoryDialogOpen: boolean = false;
  public showDeleteDialog: boolean = false;
  public showCreateDialog: boolean = false;
  private splitterLayoutChangeSubject = new Subject<void>();

  private _pendingRecords: PendingRecordItem[] = [];
  private _updatingBrowserUrl: boolean = false;

  private __debug: boolean = false;

  /** Form state service for persisting section states to User Settings */
  protected formStateService = inject(FormStateService);

  /** Subscription to form state changes */
  private formStateSubscription?: Subscription;

  constructor(protected elementRef: ElementRef, protected sharedService: SharedService, protected router: Router, protected route: ActivatedRoute, protected cdr: ChangeDetectorRef) {
    super();
    this.setupSplitterLayoutDebounce();
  }
  @ViewChild(MJTabStripComponent, { static: false }) tabComponent!: MJTabStripComponent;

  @ViewChildren(MJTabStripComponent) tabStrips!: QueryList<MJTabStripComponent>;

  @ViewChildren(CollapsiblePanelComponent) collapsiblePanels!: QueryList<CollapsiblePanelComponent>;

  public get TabStripComponent(): MJTabStripComponent {
    return this.tabComponent;
  }

  /**
   * Convenience method to resize application container when required
   */
  public InvokeManualResize(delay?: number) {
    this.sharedService.InvokeManualResize(delay);
  }

  async ngOnInit() {
    if (this.record) {
      if (!this.record.IsSaved) {
        // we have a new record so by definition we are in edit mode
        this.StartEditMode();
      }
      const md: Metadata = new Metadata();

      this._isFavorite = await md.GetRecordFavoriteStatus(md.CurrentUser.ID, this.record.EntityInfo.Name, this.record.PrimaryKey);
      this.FavoriteInitDone = true;

      // Initialize form state from User Settings
      const entityName = this.getEntityName();
      if (entityName) {
        await this.formStateService.initializeState(entityName);

        // Subscribe to state changes for reactive updates
        this.formStateSubscription = this.formStateService.getState$(entityName).subscribe(state => {
          this.showEmptyFields = state.showEmptyFields;
          this.cdr.markForCheck();
        });
      }

      // DEBUG ONLY output to console our full record info for debugging
      if (this.__debug) {
        const start = new Date().getTime();
        console.log('Full Record Info: ' + this.record.EntityInfo.Name + ' ' + this.record.PrimaryKey.ToString());
        const dataObject = await this.record.GetDataObject({
          includeRelatedEntityData: true,
          oldValues: false,
          omitEmptyStrings: false,
          omitNullValues: false,
          excludeFields: [],
          relatedEntityList: this.record.EntityInfo.RelatedEntities.map(x => {
            return {
              relatedEntityName: x.RelatedEntity
            }
          })
        })
        const end = new Date().getTime();
        console.log(dataObject);
        console.log('Time to get full record info: ' + (end - start) + 'ms');
      }
    }

    // Set up debounced filter subscription
    this.filterSubscription = this.filterSubject
      .pipe(debounceTime(100))
      .subscribe(searchTerm => {
        this.searchFilter = searchTerm;
      });
  }

  @ViewChild('topArea') topArea!: ElementRef;
  ngAfterViewInit(): void {
    this.setTabHeight();
    //this.route.queryParams doesnt seem to be picking up the query params
    // so we're going to get teh tab query param from the URLSearchParams class
    const url: string = window.location.href;
    const urlObj = new URL(url);
    const tabName: string | null = urlObj.searchParams.get('tab');
    // only do this if WE didn't invoke the browser URL update
    if(tabName && !this._updatingBrowserUrl){
      // Select the proper tab based on the tabName
      this.tabComponent?.SelectTabByName(tabName);
    }

    // now resize after a pause to allow the UI to settle
    setTimeout(() => {
      this.sharedService.InvokeManualResize();
    }, 250);  

    this.CalcTopAreaHeight();
  }

  /**
   * This method can be called at anytime to re-calculate the height of the top area and set the TopAreaHeight property. This is useful if the top area height changes dynamically
   */
  public CalcTopAreaHeight(): void {
    // calculate the top area height and set it to our TopAreaHeight property, sub-classes can then do whatever they want with that property
    if (this.topArea && this.topArea.nativeElement) {
      // give it a brief pause to let the UI settle
      setTimeout(() => {
        let height = this.topArea.nativeElement.offsetHeight;
        if (height === 0) {
          // if we get here, still probably a timing issue so chekc our immediate parent which might be a splitter pane, if it is, use it's height
          const parent = this.topArea.nativeElement.parentElement;
          if (parent && parent.offsetHeight > 0 && parent.nodeName === "KENDO-SPLITTER-PANE") {
            height = parent.offsetHeight;
          }
        }
        if (height > 0)
          this.TopAreaHeight = `${height}px`;
      }, 100);
    }
  }

  private resizeSub: Subscription | null = null;
  ngOnDestroy(): void {
    if (this.resizeSub) {
      this.resizeSub.unsubscribe();
    }
    if (this.filterSubscription) {
      this.filterSubscription.unsubscribe();
    }
    if (this.formStateSubscription) {
      this.formStateSubscription.unsubscribe();
    }
  }

  protected get PendingRecords(): PendingRecordItem[] {
    return this._pendingRecords;
  }   
 
  public onTabSelect(e: TabEvent) {
    this.sharedService.InvokeManualResize();

    // now that we've updated our state and re-sized, also update the browser URL to add the tab name as a query parameter to the URL
    this._updatingBrowserUrl = true;
    this.router.navigate([], { queryParams: { tab: e.tab?.Name }, queryParamsHandling: 'merge' });
    this._updatingBrowserUrl = false;
  }

  public StartEditMode(): void {
    this.EditMode = true;
  }

  public EndEditMode(): void {
    this.EditMode = false;
  }

  public handleHistoryDialog(): void {
    this.isHistoryDialogOpen = !this.isHistoryDialogOpen;
  }

  public ShowChanges(): void {
    if (this.record) {
      const changes = this.record.GetAll(false, true);
      const oldValues = this.record.GetAll(true, true);
      console.log('Changes for: ' + this.record.EntityInfo.Name + ' ' + this.record.PrimaryKey.ToString())
      console.log(changes);
      console.log('Old Values');
      console.log(oldValues);
      this.sharedService.CreateSimpleNotification('Changes for: ' + this.record.EntityInfo.Name + ' ' + this.record.PrimaryKey.ToString() + '\n\n' + JSON.stringify(changes, null, 2) + '\n\nOld Values\n\n' + JSON.stringify(oldValues, null, 2), 'info', 30000);
    }
  }

  public async RemoveFavorite(): Promise<void> {
    return this.SetFavoriteStatus(false)
  }

  public async MakeFavorite(): Promise<void> {
    return this.SetFavoriteStatus(true)
  }

  public async SetFavoriteStatus(isFavorite: boolean) {
    const md: Metadata = new Metadata();
    await md.SetRecordFavoriteStatus(md.CurrentUser.ID, this.record.EntityInfo.Name, this.record.PrimaryKey, isFavorite)
    this._isFavorite = isFavorite;
  }

  private _isFavorite: boolean = false;
  public get IsFavorite(): boolean {
    return this._isFavorite;
  }

  private _userPermissions: {permission: EntityPermissionType, canDo: boolean}[] = [];
  public CheckUserPermission(type: EntityPermissionType): boolean {
    try {
      if (this.record) {
        const perm = this._userPermissions.find(x => x.permission === type);
        if (perm)
          return perm.canDo;
        else {
          const result = this.record.CheckPermissions(type, false);
          this._userPermissions.push({permission: type, canDo: result});
          return result;
        }
      }
      else
        return false;
    }
    catch (e) {
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

  public GridEditMode(): "None" | "Save" | "Queue" {
    return this.EditMode ? "Queue" : "None";
  }

   /**
   * Returns true if the tabName specified is the currently displayed tab, otherwise returns false
   * @param tabName
   * @returns
   */
  public IsCurrentTab(tabName: string): boolean {
    if (this.tabComponent) {
      const tab = this.tabComponent.GetTabByName(tabName);
      if (tab) {
        return tab.index === this.tabComponent.SelectedTabIndex;
      }
    }
    // if we get here we are not in a state where we can determine the current tab, so return false
    return false;
  }
 
  public BuildRelationshipViewParams(item: EntityRelationshipInfo): RunViewParams {
    return EntityInfo.BuildRelationshipViewParams(this.record, item); // new helper method in EntityInfo
  }

  /**
   * Builds a RunViewParams object for a related entity based on the relationship between the current entity and the related entity
   * @param relatedEntityName - the name of the entity that is related to the current entity where we're building the view params from
   * @param relatedEntityJoinField - the name of the foreign key field in the current entity that links to the related entity, only required if there are multiple relationships between the entities
   * @returns 
   */
  public BuildRelationshipViewParamsByEntityName(relatedEntityName: string, relatedEntityJoinField?: string): RunViewParams {
    const eri = this.GetEntityRelationshipByRelatedEntityName(relatedEntityName, relatedEntityJoinField);
    if (eri)
      return this.BuildRelationshipViewParams(eri);
    else
      return {}
  }

  /**
   * Looks up and returns the EntityRelationshipInfo object for the related entity name
   * @param relatedEntityName - the name of the related entity to look up the relationship for
   * @param relatedEntityJoinField - the name of the foreign key field in the current entity that links to the related entity, only required if there are multiple relationships between the entities
   * @returns 
   */
  public GetEntityRelationshipByRelatedEntityName(relatedEntityName: string, relatedEntityJoinField?: string): EntityRelationshipInfo | undefined {
    if (this.record) {
      const r = <BaseEntity>this.record;
      const ret = r.EntityInfo.RelatedEntities.filter(x => x.RelatedEntity.trim().toLowerCase() === relatedEntityName.trim().toLowerCase());
      // now if ret.length > 1, we need to find the one that matches the foreign key field name
      if (ret.length > 1 && relatedEntityJoinField) {
        const ret2 = ret.find(x => x.RelatedEntityJoinField.trim().toLowerCase() === relatedEntityJoinField.trim().toLowerCase());
        if (ret2)
          return ret2;
      }
      else if (ret.length === 1) {
        return ret[0];
      }
      else
        return undefined;
    }
    return undefined;
  }

  /**
   * Builds new record values for a related entity based on the relationship between the current entity and the related entity
   * @param relatedEntityName 
   * @returns 
   */
  public NewRecordValues(relatedEntityName: string): any { 
    const eri = this.GetEntityRelationshipByRelatedEntityName(relatedEntityName);
    if (eri)
      return this.NewRecordValuesByEntityRelationship(eri);
    else
      return {}
  }

  public NewRecordValuesByEntityRelationship(item: EntityRelationshipInfo): any {
    return EntityInfo.BuildRelationshipNewRecordValues(this.record, item); // new helper method in EntityInfo
  }
 
  public GetRelatedEntityTabDisplayName(relatedEntityName: string): string {
    if (this.record) {
      const eri = (<BaseEntity>this.record).EntityInfo.RelatedEntities.find(x => x.RelatedEntity === relatedEntityName);
      if (eri)
        return eri.DisplayName;
    }
    return relatedEntityName;
  }

  protected ValidatePendingRecords(): ValidationResult[] {
    const results: ValidationResult[] = [];
    for (let i = 0; i < this._pendingRecords.length; i++) {
      const pendingRecord = this._pendingRecords[i];
      results.push(pendingRecord.entityObject.Validate());
    }
    return results;
  }

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
    return valResults
  }

  protected RaiseEvent(eventCode: BaseFormComponentEventCodes) {
    const event: FormEditingCompleteEvent = new FormEditingCompleteEvent(); 
    event.elementRef = this.elementRef;
    event.subEventCode = eventCode;

    MJGlobal.Instance.RaiseEvent({
      event: MJEventType.ComponentEvent,
      component: this,
      eventCode: BaseFormComponentEventCodes.BASE_CODE,
      args: event
    })
    
    return event; // if the recipients of the event provided any values, we have them now 
  }
  public async SaveRecord(StopEditModeAfterSave: boolean): Promise<boolean> {
    try {
      try {
        // atempt to blur the active element to force any pending changes to be committed
        (document.activeElement as HTMLElement).blur(); 
        // notify child components of this component that they must stop editing with an EDITING_COMPLETE message via MJ_global
        this.RaiseEvent(BaseFormComponentEventCodes.EDITING_COMPLETE);
      }
      catch (e2) {
        // ignore
      }
      
      if (this.record) {
        this.PopulatePendingRecords(); // do this before we validate as we must validate pending records too
        const valResults = this.Validate();
        if (valResults.Success) {
          const result = await this.InternalSaveRecord();
          if (result) {
            // we have saved the record, so clear the pending records
            this._pendingRecords = [];
            if (StopEditModeAfterSave)
              this.EndEditMode();

            this.sharedService.CreateSimpleNotification('Record saved succesfully', 'success', 2500)
            return true;
          }
          else{
            this.sharedService.CreateSimpleNotification('Error saving record', 'error', 5000)
          }
        }
        else {
          this.sharedService.CreateSimpleNotification('Validation Errors\n' + valResults.Errors.map(x => x.Message).join('\n'), 'warning', 5000);
        }
      }

      LogError("Could not save reocrd: Record not found");
      return false; // if we get here, we have failed/validation error/etc
    }
    catch (e) {
      this.sharedService.CreateSimpleNotification('Error saving record: ' + e, 'error', 5000)
      return false;
    }
  }

  public async Wait(duration: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, duration));
  }

  public CancelEdit() {
    if (this.record) {
        const r = <BaseEntity>this.record;
        if (r.Dirty || this.PendingRecordsDirty() ) {
            // ask the user to make sure they want to throw out changes
            if (!confirm('Are you sure you want to cancel your changes?')) {
                return;
            }
            r.Revert();

            const pendingRecords = this.PendingRecords;
            if (pendingRecords && pendingRecords.length > 0) {
                // we have pending records, so we need to revert them as well
                pendingRecords.forEach(p => {
                  if (p.action === 'save')  
                    p.entityObject.Revert(); // only do this if we are saving the record, ignore deletes
                });
            }
            this.RaiseEvent(BaseFormComponentEventCodes.REVERT_PENDING_CHANGES);
        }

        // if we get here we are good to go
        this.EndEditMode();
    }
  }

  protected PendingRecordsDirty(): boolean {
      this.PopulatePendingRecords();
      const pendingRecords = this.PendingRecords;
      if (pendingRecords && pendingRecords.length > 0) {
        for (const p of pendingRecords) {
          if (p.action==='delete')
            return true;
          else if (p.entityObject.Dirty)
            return true;
        }
      }
      return false;   
  }   

  protected PopulatePendingRecords() {
    // this method is called by the parent class at the right time to populate all of the pending records for a transaction
    // all we do is talk to all of our child compoennts and get their pending records and xfer them over to the PendingRecords array
    // the parent class will then take care of the rest...

    this._pendingRecords = []; // wipe out our array first
    this.RaiseEvent(BaseFormComponentEventCodes.EDITING_COMPLETE); // first tell the child components to finish up their editing
    const result = this.RaiseEvent(BaseFormComponentEventCodes.POPULATE_PENDING_RECORDS);
    if (result && result.pendingChanges) {
      for (const p of result.pendingChanges) 
        this.PendingRecords.push(p);
    }
  }


  protected async InternalSaveRecord(): Promise<boolean> {
    if (this.record) {
        // DONT POPULATE PENDING RECORDS AGAIN HERE AS IT WAS DONE before Validate() was called
        if (this._pendingRecords.length > 0) {
            // we need to create a transaction group
            const md = new Metadata();
            const tg = await md.CreateTransactionGroup();
            this.record.TransactionGroup = tg;
            await this.record.Save();  

            // now add to the rest of the pending records
            for (const x of this._pendingRecords) {
              x.entityObject.TransactionGroup = tg;
              if (x.action === 'save') {
                await x.entityObject.Save();
              }
              else {
                await x.entityObject.Delete();
              }
            }
            // finally submit the TG
            return await tg.Submit();
        }
        else
            return await this.record.Save();
    }
    else
        return false;
  }

  protected GetTabTopPosition(): number {
    if (this.elementRef && this.elementRef.nativeElement) {
      const tabs = this.elementRef.nativeElement.getElementsByClassName('k-tabstrip');
      if (tabs && tabs.length > 0) {
        const tabElement = tabs[0];
        const tabRect = tabElement.getBoundingClientRect();
        const bodyRect = document.body.getBoundingClientRect();
        
        return tabRect.top - bodyRect.top;
      }
    }
    return 0;
  }

  
  private _tabMargin = 10;
  setTabHeight(): void {
    // Subscribe to the window resize event
    this.resizeSub = fromEvent(window, 'resize').pipe(
      debounceTime(100) // Debounce the resize event to avoid frequent updates
    ).subscribe(() => {
      // Update the grid height when the window is resized
      this.ResizeTab();
    });

    // Set the initial grid height with a slight delay to allow stuff to get set
    setTimeout(() => {
      this.ResizeTab();
    }, 100);
  }

  protected get ContainerObjectHeight(): number {
    return window.innerHeight; // default, can be overriden by subclasses
  }

  protected ResizeTab(): void {
    this._tabMargin = this.GetTabTopPosition();
    const height = this.ContainerObjectHeight - this._tabMargin - this.BottomMargin
    this.TabHeight = height.toString() + 'px';  
    this.GridBottomMargin = 40;
  }

  protected setupSplitterLayoutDebounce() {
    this.splitterLayoutChangeSubject.pipe(
      debounceTime(300)
    ).subscribe(() => {
      this.setTabHeight(); // set the height of the tab first
      
      // then wait through the timeout so the tab height change actually takes effect in the DOM - that's why we have the timeout
      setTimeout(() => {
        this.sharedService.InvokeManualResize();  
      }, 100);
    });  
  }
  public splitterLayoutChange(): void {
    this.splitterLayoutChangeSubject.next();
  }

  public async ShowDependencies() {
    // for now dump to console
    const md = new Metadata();
    const dep = await md.GetRecordDependencies(this.record.EntityInfo.Name, this.record.PrimaryKey)
    console.log('Dependencies for: ' + this.record.EntityInfo.Name + ' ' + this.record.PrimaryKey.ToString());
    console.log(dep);

    // if (confirm('Do you want to merge records test?') == true) {
    //   const mergeResult = await md.MergeRecords({
    //     EntityName: this.record.EntityInfo.Name,
    //     SurvivingRecordID: this.record.PrimaryKey.Value,
    //     RecordsToMerge: [4],
    //   })
    //   console.log(mergeResult);
    // }
  }

  public async GetListsCanAddTo(): Promise<ListEntity[]> {
    if(!this.record){
      LogError('Unable to fetch List records: Record not found');
      return [];
    }

    const rv: RunView = new RunView();
    const md: Metadata = new Metadata();

    const rvResult: RunViewResult<ListEntity> = await rv.RunView({
      EntityName: 'Lists',
      ExtraFilter: `UserID = '${md.CurrentUser.ID}' AND EntityID = '${this.record.EntityInfo.ID}'`,
      ResultType: 'entity_object'
    });

    if(!rvResult.Success){
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

  public get EntityInfo(): EntityInfo | undefined {
    try {
      const r = <BaseEntity>this.record;
      if (r)
        return r.EntityInfo;
      else
        return undefined;
    }
    catch (e) {
      LogError(e);
      return undefined;
    }
  }

  // #region Collapsible Section Management

  /**
   * Array of section information including expanded state and row counts.
   * Initialized by subclasses via initSections().
   */
  protected sections: BaseFormSectionInfo[] = [];

  /**
   * Map for fast section lookup by key.
   */
  private sectionMap: Map<string, BaseFormSectionInfo> = new Map();

  /**
   * Current search filter text for filtering sections.
   */
  public searchFilter: string = '';

  /**
   * Controls whether empty fields should be shown in read-only mode.
   * When false (default), empty fields are hidden to reduce visual clutter.
   */
  public showEmptyFields: boolean = false;

  /**
   * Returns the current form context containing all form-level state.
   * This is a computed property that creates a fresh context object on each access,
   * ensuring child components always have the latest values.
   */
  public get formContext(): BaseFormContext {
    return {
      sectionFilter: this.searchFilter,
      showEmptyFields: this.showEmptyFields
    };
  }

  /**
   * Subject for debouncing filter changes.
   */
  private filterSubject = new Subject<string>();
  private filterSubscription?: Subscription;

  /**
   * Initializes the sections array. Called by subclasses in ngOnInit.
   * Accepts either BaseFormSectionInfo instances or plain objects that will be converted.
   * @param sections Array of section information or plain objects
   */
  protected initSections(sections: (BaseFormSectionInfo | { sectionKey: string; sectionName: string; isExpanded: boolean; rowCount?: number; metadata?: any })[]): void {
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

  /**
   * Gets the section info by key.
   * @param sectionKey The section key
   * @returns The section info or undefined
   */
  protected getSection(sectionKey: string): BaseFormSectionInfo | undefined {
    return this.sectionMap.get(sectionKey);
  }

  /**
   * Checks if a section is expanded.
   * Uses FormStateService for persisted state.
   * @param sectionKey The section key
   * @param defaultExpanded Optional default value to use when no persisted state exists
   * @returns True if expanded, false otherwise
   */
  public IsSectionExpanded(sectionKey: string, defaultExpanded?: boolean): boolean {
    const entityName = this.getEntityName();
    if (entityName) {
      return this.formStateService.isSectionExpanded(entityName, sectionKey, defaultExpanded);
    }
    // Fallback to in-memory state if no entity name
    const section = this.sectionMap.get(sectionKey);
    return section ? section.isExpanded : (defaultExpanded !== undefined ? defaultExpanded : true);
  }

  /**
   * Sets the expanded state of a section.
   * Persists to User Settings via FormStateService.
   * @param sectionKey The section key
   * @param isExpanded The new expanded state
   */
  public SetSectionExpanded(sectionKey: string, isExpanded: boolean): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.setSectionExpanded(entityName, sectionKey, isExpanded);
    }
    // Also update in-memory state for immediate UI response
    const section = this.sectionMap.get(sectionKey);
    if (section) {
      section.isExpanded = isExpanded;
    }
  }

  /**
   * Gets the row count for a section.
   * @param sectionKey The section key
   * @returns The row count or undefined
   */
  public GetSectionRowCount(sectionKey: string): number | undefined {
    const section = this.sectionMap.get(sectionKey);
    return section?.rowCount;
  }

  /**
   * Sets the row count for a section.
   * @param sectionKey The section key
   * @param rowCount The row count
   */
  public SetSectionRowCount(sectionKey: string, rowCount: number): void {
    const section = this.sectionMap.get(sectionKey);
    if (section) {
      section.rowCount = rowCount;
    }
  }

  /**
   * Toggles the expanded state of a section.
   * Persists to User Settings via FormStateService.
   * @param sectionKey The section key to toggle
   */
  public toggleSection(sectionKey: string): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.toggleSection(entityName, sectionKey);
    }
    // Also update in-memory state
    const section = this.sectionMap.get(sectionKey);
    if (section) {
      section.isExpanded = !section.isExpanded;
    }
  }

  /**
   * Expands all sections.
   * Persists to User Settings via FormStateService.
   */
  public expandAllSections(): void {
    const entityName = this.getEntityName();
    const sectionKeys = this.sections.map(s => s.sectionKey);
    if (entityName && sectionKeys.length > 0) {
      this.formStateService.expandAllSections(entityName, sectionKeys);
    }
    // Also update in-memory state
    this.sections.forEach(section => {
      section.isExpanded = true;
    });
  }

  /**
   * Collapses all sections.
   * Persists to User Settings via FormStateService.
   */
  public collapseAllSections(): void {
    const entityName = this.getEntityName();
    const sectionKeys = this.sections.map(s => s.sectionKey);
    if (entityName && sectionKeys.length > 0) {
      this.formStateService.collapseAllSections(entityName, sectionKeys);
    }
    // Also update in-memory state
    this.sections.forEach(section => {
      section.isExpanded = false;
    });
  }

  /**
   * Gets the count of currently expanded sections.
   * @returns Number of expanded sections
   */
  public getExpandedCount(): number {
    const entityName = this.getEntityName();
    const sectionKeys = this.sections.map(s => s.sectionKey);
    if (entityName && sectionKeys.length > 0) {
      return this.formStateService.getExpandedCount(entityName, sectionKeys);
    }
    return this.sections.filter(section => section.isExpanded).length;
  }

  /**
   * Gets the count of visible sections after filtering.
   * @returns Number of sections currently visible (not hidden by search filter)
   */
  public getVisibleSectionCount(): number {
    if (!this.collapsiblePanels || this.collapsiblePanels.length === 0) {
      return this.sections.length;
    }
    return this.collapsiblePanels.filter(panel => panel.isVisible).length;
  }

  /**
   * Gets the total count of all sections (regardless of filter).
   * @returns Total number of sections
   */
  public getTotalSectionCount(): number {
    return this.sections.length;
  }

  /**
   * Handles filter change events from the section controls.
   * Debounces the filter updates by 250ms to avoid excessive re-rendering during typing.
   * @param searchTerm The search term to filter sections
   */
  public onFilterChange(searchTerm: string): void {
    this.filterSubject.next(searchTerm);
  }

  /**
   * Gets the entity name for the current record (used for state persistence keys).
   * @returns Entity name or empty string
   */
  public getEntityName(): string {
    return this.record?.EntityInfo?.Name || '';
  }

  /**
   * Gets the width mode for a section from persisted state.
   * @param sectionKey The section key
   * @returns Width mode ('normal' or 'full-width')
   */
  public getSectionWidthMode(sectionKey: string): 'normal' | 'full-width' {
    const entityName = this.getEntityName();
    if (entityName) {
      return this.formStateService.getSectionWidthMode(entityName, sectionKey);
    }
    return 'normal';
  }

  /**
   * Sets the width mode for a section.
   * Persists to User Settings via FormStateService.
   * @param sectionKey The section key
   * @param widthMode The width mode
   */
  public setSectionWidthMode(sectionKey: string, widthMode: 'normal' | 'full-width'): void {
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.setSectionWidthMode(entityName, sectionKey, widthMode);
    }
  }

  /**
   * Resets all panel width modes to normal for the current entity.
   * Persists to User Settings via FormStateService.
   */
  public resetAllPanelWidths(): void {
    const entityName = this.getEntityName();
    if (!entityName) return;

    this.formStateService.resetAllPanelWidths(entityName);

    // Trigger re-render if we have collapsible panels
    if (this.collapsiblePanels) {
      this.collapsiblePanels.forEach(panel => {
        panel.widthMode = 'normal';
        panel['cdr'].markForCheck();
      });
    }
  }

  // #endregion
}

 