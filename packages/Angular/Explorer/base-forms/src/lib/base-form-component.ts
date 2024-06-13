import { AfterViewInit, OnInit, OnDestroy, Directive, ViewChildren, QueryList, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';

import { Subject, Subscription, debounceTime, fromEvent } from 'rxjs';
import { EntityInfo, ValidationResult, BaseEntity, EntityPermissionType, 
         EntityRelationshipInfo, Metadata, RunViewParams, LogError, 
         RecordDependency,
         BaseEntityEvent,
         CompositeKey} from '@memberjunction/core';
import { BaseRecordComponent } from './base-record-component';
import { BaseFormComponentEvent, BaseFormComponentEventCodes, SharedService } from '@memberjunction/ng-shared';
import { ActivatedRoute, Router } from '@angular/router';
import { MJTabStripComponent, TabEvent } from '@memberjunction/ng-tabstrip';
import { MJEventType, MJGlobal } from '@memberjunction/global';

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

  private _pendingRecords: BaseEntity[] = [];
  private _updatingBrowserUrl: boolean = false;

  private __debug: boolean = false;

  constructor(protected elementRef: ElementRef, protected sharedService: SharedService, protected router: Router, protected route: ActivatedRoute, protected cdr: ChangeDetectorRef) {
    super();
    this.setupSplitterLayoutDebounce();
  }
  @ViewChild(MJTabStripComponent, { static: false }) tabComponent!: MJTabStripComponent;

  @ViewChildren(MJTabStripComponent) tabStrips!: QueryList<MJTabStripComponent>;

  public get TabStripComponent(): MJTabStripComponent {
    return this.tabComponent;
  }

  async ngOnInit() {
    if (this.record) {
      const md: Metadata = new Metadata();
   
      this._isFavorite = await md.GetRecordFavoriteStatus(md.CurrentUser.ID, this.record.EntityInfo.Name, this.record.PrimaryKey);
      this.FavoriteInitDone = true;

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
  }

  @ViewChild('topArea') topArea!: ElementRef;
  ngAfterViewInit(): void {
    this.setTabHeight();

    this.route.queryParams.subscribe(params => {
      if (!this._updatingBrowserUrl) {
        // only do this if WE didn't invoke the browser URL update
        const tabName = params['tab'];
        if (tabName && tabName.length > 0) {
          // Select the proper tab based on the tabName
          this.tabComponent?.SelectTabByName(tabName);
        }
      }
      // now resize after a pause to allow the UI to settle
      setTimeout(() => {
        this.sharedService.InvokeManualResize();
      }, 250);  
    });

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
  }

  protected get PendingRecords(): BaseEntity[] {
    return this._pendingRecords;
  }   
 
  public onTabSelect(e: any) {
    this.sharedService.InvokeManualResize();

    // now that we've updated our state and re-sized, also update the browser URL to add the tab name as a query parameter to the URL
    this._updatingBrowserUrl = true;
    this.router.navigate([], { queryParams: { tab: e.tab?.Name }, queryParamsHandling: 'merge' });
    this._updatingBrowserUrl = true;
  }

  public StartEditMode(): void {
    this.EditMode = true;
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
      alert('Changes for: ' + this.record.EntityInfo.Name + ' ' + this.record.PrimaryKey.ToString() + '\n\n' + JSON.stringify(changes, null, 2) + '\n\nOld Values\n\n' + JSON.stringify(oldValues, null, 2));
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
    const tab = this.tabComponent?.GetTabByName(tabName);
    return tab?.index === this.tabComponent?.SelectedTabIndex;
  }

  public BuildRelationshipViewParams(item: EntityRelationshipInfo): RunViewParams {
    return EntityInfo.BuildRelationshipViewParams(this.record, item); // new helper method in EntityInfo
  }

  /**
   * Builds a RunViewParams object for a related entity based on the relationship between the current entity and the related entity
   * @param relatedEntityName 
   * @returns 
   */
  public BuildRelationshipViewParamsByEntityName(relatedEntityName: string): RunViewParams {
    const eri = this.GetEntityRelationshipByRelatedEntityName(relatedEntityName);
    if (eri)
      return this.BuildRelationshipViewParams(eri);
    else
      return {}
  }

  /**
   * Looks up and returns the EntityRelationshipInfo object for the related entity name
   * @param relatedEntityName 
   * @returns 
   */
  public GetEntityRelationshipByRelatedEntityName(relatedEntityName: string): EntityRelationshipInfo | undefined {
    if (this.record) {
      return (<BaseEntity>this.record).EntityInfo.RelatedEntities.find(x => x.RelatedEntity.trim().toLowerCase() === relatedEntityName.trim().toLowerCase());
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
      results.push(pendingRecord.Validate());
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
    const p: BaseEntity[] = [];

    const event: BaseFormComponentEvent = {
      subEventCode: eventCode,
      elementRef: this.elementRef,
      returnValue: {
        pendingRecords: p
      }
    }

    MJGlobal.Instance.RaiseEvent({
      event: MJEventType.ComponentEvent,
      component: this,
      eventCode: BaseFormComponentEventCodes.BASE_CODE,
      args: event
    })
    
    return event.returnValue; // if the recipients of the event provided any values, we have them now 
  }
  public async SaveRecord(StopEditModeAfterSave: boolean): Promise<boolean> {
    try {
      try {
        // atempt to blur the active element to force any pending changes to be committed
        (document.activeElement as HTMLElement).blur(); 
        // notify child components of this component that they must stop editing with an EDITING_COMPLETE message via MJ_global
        this.RaiseEvent('EDITING_COMPLETE');
      }
      catch (e2) {
        // ignore
      }
      
      if (this.record) {
        await this.PopulatePendingRecords(); // do this before we validate as we must validate pending records too
        const valResults = this.Validate();
        if (valResults.Success) {
          const result = await this.InternalSaveRecord();
          if (result) {
            // we have saved the record, so clear the pending records
            this._pendingRecords = [];
            if (StopEditModeAfterSave)
              this.EditMode = false;

            this.sharedService.CreateSimpleNotification('Record saved succesfully', 'success', 2500)

            return true;
          }
          else  
            this.sharedService.CreateSimpleNotification('Error saving record', 'error', 5000)
        }
        else {
          this.sharedService.CreateSimpleNotification('Validation Errors\n' + valResults.Errors.map(x => x.Message).join('\n'), 'warning', 10000);
        }
      }

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
                    p.Revert();
                });
            }
            this.RaiseEvent('REVERT_PENDING_CHANGES');
        }

        // if we get here we are good to go
        this.EditMode = false;
    }
  }

  protected PendingRecordsDirty(): boolean {
      this.PopulatePendingRecords();
      const pendingRecords = this.PendingRecords;
      if (pendingRecords && pendingRecords.length > 0) {
          for (let i = 0; i < pendingRecords.length; i++) {
              if (pendingRecords[i].Dirty)
                  return true;
          }
      }
      return false;   
  }   

  protected async PopulatePendingRecords(): Promise<void> {
    // this method is called by the parent class at the right time to populate all of the pending records for a transaction
    // all we do is talk to all of our child compoennts and get their pending records and xfer them over to the PendingRecords array
    // the parent class will then take care of the rest...

    this._pendingRecords = []; // wipe out our array first
    this.RaiseEvent('EDITING_COMPLETE'); // first tell the child components to finish up their editing
    const result = this.RaiseEvent('POPULATE_PENDING_RECORDS');
    if (result && result.pendingRecords) {
      for (const p of result.pendingRecords) 
        this.PendingRecords.push(p);
    }
  }


  protected async InternalSaveRecord(): Promise<boolean> {
    if (this.record) {
      // save the record, but first create a transaction group if we have any other stuf to submit
        await this.PopulatePendingRecords();
        if (this._pendingRecords.length > 0) {
            // we need to create a transaction group
            const md = new Metadata();
            const tg = await md.CreateTransactionGroup();
            this.record.TransactionGroup = tg;
            this.record.Save(); // DO NOT USE await - trans group.submit() is where we await

            // now add to the rest of the pending records
            for (let i = 0; i < this._pendingRecords.length; i++) {
            const x = this._pendingRecords[i];
            x.TransactionGroup = tg;
            x.Save(); // DO NOT USE await - trans group.submit() is where we await
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
} 

 
