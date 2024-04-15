import { Component, ViewChild, Input, Output, EventEmitter, AfterViewInit, OnInit } from '@angular/core';
import { GridRowClickedEvent } from '@memberjunction/ng-user-view-grid';
import { UserViewGridWithAnalysisComponent } from '@memberjunction/ng-ask-skip';
import { Metadata, EntityInfo, LogError, PrimaryKeyValueBase } from '@memberjunction/core';
import { ActivatedRoute, Router } from '@angular/router'
import { distinctUntilChanged, Subject} from "rxjs";
import { debounceTime} from "rxjs/operators";
import { UserViewEntity, ViewInfo } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'mj-single-view',
  templateUrl: './single-view.component.html',
  styleUrls: ['./single-view.component.css']
})
export class SingleViewComponent implements AfterViewInit, OnInit  {
  @ViewChild(UserViewGridWithAnalysisComponent, {static: true}) viewGridWithAnalysis!: UserViewGridWithAnalysisComponent;

  @Input() public viewId: number | null = null;
  @Input() public viewName: string| null = null;
  @Input() public selectedView: UserViewEntity | null = null;
  @Input() public extraFilter: string | null = null;
  @Input() public entityName: string | null = null;

  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();

  public selectedEntity: EntityInfo | null = null;
  public showSearch: boolean = false;
  public searchText: string = '';
  private searchDebounce$: Subject<string> = new Subject();
  private _deferLoadCount: number = 0;

  constructor(private router: Router, private route: ActivatedRoute, private sharedService: SharedService) {

  }

  ngAfterViewInit() { 
    this.initialLoad();
  }
  ngOnInit(): void {
    this.setupSearchDebounce();
  }

  private async initialLoad() {
    const md = new Metadata();
    if (this.viewId || this.viewName) {
      let view: UserViewEntity | null = null;
      if (this.viewId)
        view = <UserViewEntity>await ViewInfo.GetViewEntity(this.viewId);
      else if (this.viewName)
        view = <UserViewEntity>await ViewInfo.GetViewEntityByName(this.viewName)

      if (view)  {
        await this.LoadView(view);
        const e = md.Entities.find(e => e.ID === view?.EntityID)
        if (e) {
          this.selectedEntity = e
          this.showSearch = e.AllowUserSearchAPI
        }

        //hard coded data for testing
        let testIDs: number[] = [1, 6, 7 ,8, 13, 18];
        const recordIDs: PrimaryKeyValueBase[] = testIDs.map((id: number) => {
          let pk = new PrimaryKeyValueBase();
          pk.PrimaryKeyValues = [{ FieldName: 'ID', Value: id.toString() }];
          return pk;
        });
        let result = await md.GetRecordDuplicates({ EntityID: view.EntityID, RecordIDs: recordIDs }, md.CurrentUser);
      }
    }
    else if (this.entityName && this.entityName.length > 0) {
      // we are running a dynamic view here, not a view by ID
      const e = md.Entities.find(e => e.Name.trim().toLowerCase() === this.entityName?.trim().toLowerCase())
      if (e) {
        this.selectedEntity = e
        this.showSearch = e.AllowUserSearchAPI
        await this.LoadDynamicView();
      }
      else {
        // problem, we don't have a valid entity name
        LogError(`Invalid entity name: ${this.entityName}`)
        this.sharedService.CreateSimpleNotification(`The entity name ${this.entityName} is not valid. Please check the URL and try again.`,"error",5000);
      }
    }
  }

  public async handleRowClick(args: GridRowClickedEvent) {
      // tell the router to navigate instead of raising an event directly. router will in turn handle raising the event as required
      this.router.navigate(['resource', 'record', SharedService.GeneratePrimaryKeyValueString(args.primaryKeyValues)], { queryParams: { Entity: args.entityName } })
  }

  public async LoadView(viewInfo: UserViewEntity) {
    // load up the view
    if (viewInfo && viewInfo.ID && viewInfo.ID > 0)
      this.selectedView = viewInfo
      await this.viewGridWithAnalysis.Refresh({
        ViewEntity: viewInfo,
        ViewID: viewInfo.ID,
        UserSearchString: this.searchText
      })
      this.loadComplete.emit();
  }

  public async LoadDynamicView() {
    this.selectedView = null;
    await this.viewGridWithAnalysis.Refresh({
      EntityName: this.entityName!,
      ExtraFilter: this.extraFilter!,
      UserSearchString: this.searchText
    })
    this.loadComplete.emit();
  }

  async Refresh() {
    if (this.selectedView)
      await this.LoadView(this.selectedView)
    else  
      await this.LoadDynamicView();
  }

  public onSearch(inputValue: string): void {
    this.searchDebounce$.next(inputValue);
  }


  private setupSearchDebounce(): void {
    this.searchDebounce$.pipe(
      debounceTime(500), // updated to 500ms to reduce API calls and since most people don't type super fast
      distinctUntilChanged(),
    ).subscribe((inputValue: string) => {
      this.search(inputValue);
    });
  }

  private async search(inputValue: string) {
    this.searchText = inputValue;
    await this.Refresh();
  }

  public viewPropertiesDialogClosed(args: any) {
    if (args && args.Saved && args.ViewEntity) {
      this.selectedView = args.ViewEntity
      this.Refresh();
    }
  }

}
