import { AfterViewInit, OnInit, OnDestroy, Directive, ViewChildren, QueryList, ElementRef, ViewChild } from '@angular/core';

import { Subject, Subscription, debounceTime, fromEvent } from 'rxjs';
import { EntityInfo, ValidationResult, BaseEntity, EntityPermissionType, 
         EntityRelationshipInfo, Metadata, RunViewParams, LogError } from '@memberjunction/core';
import { UserViewGridComponent } from '@memberjunction/ng-user-view-grid';
import { BaseRecordComponent } from './base-record-component';
import { SharedService } from '../../shared/shared.service';
import { ActivatedRoute, Router } from '@angular/router';
import { TabStripComponent } from '@progress/kendo-angular-layout';

@Directive() // this isn't really a directive, BUT we are doing this to avoid Angular compile errors that require a decorator in order to implement the lifecycle interfaces
export abstract class BaseFormComponent extends BaseRecordComponent implements AfterViewInit, OnInit, OnDestroy {
  public activeTabIndex = 0;
  public selectedTab = 0;
  public EditMode: boolean = false;
  public BottomMargin: number = 53;
  public TabHeight: string = '500px';
  public GridBottomMargin: number = 100;
  public FavoriteInitDone: boolean = false;
  public isHistoryDialogOpen: boolean = false;
  private splitterLayoutChangeSubject = new Subject<void>();

  private _pendingRecords: BaseEntity[] = [];
  private _updatingBrowserUrl: boolean = false;

  constructor(protected elementRef: ElementRef, protected sharedService: SharedService, protected router: Router, protected route: ActivatedRoute) {
    super();
    this.setupSplitterLayoutDebounce();
  }
  @ViewChild(TabStripComponent, { static: false }) tabComponent!: TabStripComponent;

  async ngOnInit() {
    if (this.record) {
      const md: Metadata = new Metadata();
   
      this._isFavorite = await md.GetRecordFavoriteStatus(md.CurrentUser.ID, this.record.EntityInfo.Name, this.record.PrimaryKeys.map(pk => {return {FieldName: pk.Name, Value: pk.Value}}))
      this.FavoriteInitDone = true;
    }
  }

  ngAfterViewInit(): void {
    this.setTabHeight();

    this.route.queryParams.subscribe(params => {
      if (!this._updatingBrowserUrl) {
        // only do this if WE didn't invoke the browser URL update
        const tabName = params['tab'];
        if (tabName && tabName.length > 0) {
          // Select the proper tab based on the tabName
          const tabIndex = this.GetTabIndex(tabName);
          if (tabIndex >=0) {
            // found the tab index, if we don't find it, do nothing
            this.activeTabIndex = tabIndex;
            this.tabComponent.selectTab(tabIndex);
    
            // now resize after a pause to allow the UI to settle
            setTimeout(() => {
              this.sharedService.InvokeManualResize();
            }, 100);  
          }
        }
      }
    });
  }

  private resizeSub: Subscription | null = null;
  ngOnDestroy(): void {
    if (this.resizeSub) {
      this.resizeSub.unsubscribe();
    }
  }

  @ViewChildren(UserViewGridComponent) userViewGridComponents!: QueryList<UserViewGridComponent>;

  protected get PendingRecords(): BaseEntity[] {
    return this._pendingRecords;
  }   
 
  public onTabSelect(e: any) {
    this.activeTabIndex = e.index;
    this.sharedService.InvokeManualResize();

    // now that we've updated our state and re-sized, also update the browser URL to add the tab name as a query parameter to the URL
    const tabName = this._tabIndexes[this.activeTabIndex];
    this._updatingBrowserUrl = true;
    this.router.navigate([], { queryParams: { tab: tabName }, queryParamsHandling: 'merge' });
    this._updatingBrowserUrl = true;
  }

  public StartEditMode(): void {
    this.EditMode = true;
  }

  public handleHistoryDialog(): void {
    this.isHistoryDialogOpen = !this.isHistoryDialogOpen;
  }

  public async RemoveFavorite(): Promise<void> {
    return this.SetFavoriteStatus(false)
  }

  public async MakeFavorite(): Promise<void> {
    return this.SetFavoriteStatus(true)
  }

  public async SetFavoriteStatus(isFavorite: boolean) {
    const md: Metadata = new Metadata();
    await md.SetRecordFavoriteStatus(md.CurrentUser.ID, this.record.EntityInfo.Name, this.record.PrimaryKeys.map(pk => {return {FieldName: pk.Name, Value: pk.Value}}), isFavorite)
    this._isFavorite = isFavorite;
  }

  private _isFavorite: boolean = false;
  public get IsFavorite(): boolean {
    return this._isFavorite;
  }

  public CheckUserPermission(type: EntityPermissionType): boolean {
    try {
      if (this.record)
        return (<BaseEntity>this.record).CheckPermissions(type, false);
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

  private _tabIndexes: string[] = [];
  public GetTabIndex(tabName: string): number {
    return this._tabIndexes.indexOf(tabName);
  }

  public RegisterTabs(tabs: string[]) {
    // copy the array, clear existing array and copy all elements
    this._tabIndexes.splice(0, this._tabIndexes.length);
    for (let i = 0; i < tabs.length; i++) 
      this.RegisterTab(tabs[i]);
  }

  public RegisterTab(tabName: string): number {
    const currentIndex = this._tabIndexes.indexOf(tabName);
    if (currentIndex === -1) {
      this._tabIndexes.push(tabName);
      return this._tabIndexes.length - 1;
    }
    else
      return currentIndex;
  }

  public IsCurrentTab(tabName: string): boolean {
    if (this._tabIndexes.length === 0 || this._tabIndexes.indexOf(tabName) === -1)
      return false;
    else
      return this.activeTabIndex === this.GetTabIndex(tabName);
  }

  public RegisterAndCheckIfCurrentTab(tabName: string): boolean {
    this.RegisterTab(tabName);
    return this.IsCurrentTab(tabName);
  }

  protected BuildRelationshipViewParams(item: EntityRelationshipInfo): RunViewParams {
    return EntityInfo.BuildRelationshipViewParams(this.record, item); // new helper method in EntityInfo
  }

  public BuildRelationshipViewParamsByEntityName(relatedEntityName: string): RunViewParams {
    if (this.record) {
      const eri = (<BaseEntity>this.record).EntityInfo.RelatedEntities.find(x => x.RelatedEntity === relatedEntityName);
      if (eri)
        return this.BuildRelationshipViewParams(eri);
    }
    return {};
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

  public async SaveRecord(StopEditModeAfterSave: boolean): Promise<boolean> {
    try {
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
            if (this.userViewGridComponents && this.userViewGridComponents.length > 0) {
                // we have grids, so we need to revert them as well
                this.userViewGridComponents.forEach(grid => {
                    grid.RevertPendingChanges();
                });
            }
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
    // all we do is talk to all of our grids and get their pending records and xfer them over to the PendingRecords array
    // the parent class will then take care of the rest...
    this._pendingRecords = []; // wipe out our array first
    const grids = this.userViewGridComponents;
    if (grids && grids.length > 0) {
      for (let i = 0; i < grids.length; i++) {
        const grid = grids.get(i);
        if (grid) {
          await grid.EditingComplete() // need to check this and wait for it to make sure grid editing is done before we try to save
          grid.PendingRecords.forEach(p => {
            // populate our pending grids array from the composite of all the grids
            this.PendingRecords.push(p.record)
          })  
        }
      }
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

  protected ResizeGrids(): void {
    // do with a little timeout to let the visible grid show up and the DOM settle
    setTimeout(() => {
      if (this.userViewGridComponents && this.userViewGridComponents.length > 0) {
        this.userViewGridComponents.forEach(grid => {
          //grid.ResizeGrid(); // automatic now via mjFillContainer
        });
      }
    }, 10);
  }

  public async ShowDependencies() {
    // for now dump to console
    const md = new Metadata();
    const dep = await md.GetRecordDependencies(this.record.EntityInfo.Name, this.record.PrimaryKey.Value)
    console.log('Dependencies for: ' + this.record.EntityInfo.Name + ' ' + this.record.PrimaryKey.Value);
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

 
