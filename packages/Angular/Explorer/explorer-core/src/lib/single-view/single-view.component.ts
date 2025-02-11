import { Component, ViewChild, Input, Output, EventEmitter, AfterViewInit, OnInit } from '@angular/core';
import { GridRowClickedEvent } from '@memberjunction/ng-user-view-grid';
import { UserViewGridWithAnalysisComponent } from '@memberjunction/ng-ask-skip';
import { Metadata, EntityInfo, LogError, BaseEntity, EntityPermissionType } from '@memberjunction/core';
import { ActivatedRoute, Router } from '@angular/router'
import { distinctUntilChanged, Subject} from "rxjs";
import { debounceTime} from "rxjs/operators";
import { UserViewEntity, UserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'mj-single-view',
  templateUrl: './single-view.component.html',
  styleUrls: ['./single-view.component.css']
})
export class SingleViewComponent implements AfterViewInit, OnInit  {
  @ViewChild(UserViewGridWithAnalysisComponent, {static: true}) viewGridWithAnalysis!: UserViewGridWithAnalysisComponent;

  @Input() public viewId: string | null = null;
  @Input() public viewName: string| null = null;
  @Input() public selectedView: UserViewEntityExtended | null = null;
  @Input() public extraFilter: string | null = null;
  @Input() public entityName: string | null = null;

  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();

  public selectedEntity: EntityInfo | null = null;
  public showSearch: boolean = false;
  public searchText: string = '';
  public entityObjectName: string = '';
  public canCreateRecord: boolean = false;
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
        this.selectedView = <UserViewEntityExtended>view;
        await this.LoadView(view);
        const e = md.Entities.find(e => e.ID === view?.EntityID)
        if (e) {
          this.selectedEntity = e
          this.showSearch = e.AllowUserSearchAPI
        }
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

    if(this.selectedEntity) {
      const entityObj: BaseEntity = await md.GetEntityObject(this.selectedEntity.Name);
      this.canCreateRecord = entityObj.CheckPermissions(EntityPermissionType.Create, false);
      this.entityObjectName = this.selectedEntity.Name;
    }
  }

  public async handleRowClick(args: GridRowClickedEvent) {
    // tell the router to navigate instead of raising an event directly. router will in turn handle raising the event as required
    this.router.navigate(['resource', 'record', args.CompositeKey.ToURLSegment()], { queryParams: { Entity: args.entityName } })
  }


  public async LoadView(viewInfo: UserViewEntity) {
    // load up the view
    if (this.viewGridWithAnalysis && 
        viewInfo && viewInfo.ID && viewInfo.ID.length > 0)
      this.selectedView = <UserViewEntityExtended>viewInfo; // didn't change the param type of this variable because we didn't want a breaking change in the 2.x era of the system, when we go to 3.0 we can change this to UserViewEntityExtended
      await this.viewGridWithAnalysis.Refresh({
        ViewEntity: viewInfo,
        ViewID: viewInfo.ID,
        UserSearchString: this.searchText
      })
      this.loadComplete.emit();
  }

  public async LoadDynamicView() {
    if (this.viewGridWithAnalysis) {
      this.selectedView = null;
      await this.viewGridWithAnalysis.Refresh({
        EntityName: this.entityName!,
        ExtraFilter: this.extraFilter!,
        UserSearchString: this.searchText
      })
      this.loadComplete.emit();  
    }
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

  public get UserCanView(): boolean {
    if (this.selectedView) 
      return this.selectedView.UserCanView;
    else
      return true;
  }

  public dynamicWrapperStyle(): any {
    if (this.UserCanView)
      return {};
    else
      return {
        "display": "none"
      };
  }
}
