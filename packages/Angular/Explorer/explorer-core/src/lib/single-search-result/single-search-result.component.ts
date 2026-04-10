import { Component, EventEmitter, Input, Output, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { RunView, CompositeKey, EntityInfo, EntityFieldTSType, Metadata } from '@memberjunction/core';
import { NavigationService } from '@memberjunction/ng-shared';
import { DataLoadedEvent, RecordOpenedEvent, EntityViewerConfig, EntityViewMode, GridToolbarConfig } from '@memberjunction/ng-entity-viewer';

type SearchState = 'loading' | 'no-results' | 'single-result' | 'viewer';

@Component({
  standalone: false,
  selector: 'mj-single-search-result',
  templateUrl: './single-search-result.component.html',
  styleUrls: ['./single-search-result.component.css']
})
export class SingleSearchResultComponent implements OnChanges {
  @Input() public entity: string = '';
  @Input() public searchInput: string = '';
  @Output() public loadComplete = new EventEmitter<boolean>();
  @Output() public loadStarted = new EventEmitter<boolean>();

  public SearchState: SearchState = 'loading';
  public ResultCount = 0;
  public EntityInfo: EntityInfo | null = null;
  public CurrentViewMode: EntityViewMode = 'grid';

  /** Whether the current entity has date fields (enables timeline view toggle) */
  public get HasDateFields(): boolean {
    if (!this.EntityInfo) return false;
    return this.EntityInfo.Fields.some(f => f.TSType === EntityFieldTSType.Date);
  }

  /** Resolved icon class for the entity, matching Data Explorer's format */
  public get EntityIcon(): string {
    if (this.EntityInfo?.Icon) {
      return this.formatEntityIcon(this.EntityInfo.Icon);
    }
    return 'fa-solid fa-table';
  }

  /** Configuration for the entity-viewer — matches the Data Explorer's setup */
  public ViewerConfig: Partial<EntityViewerConfig> = {
    showFilter: false,
    showViewModeToggle: false,
    showRecordCount: false,
    showPagination: true,
    serverSideFiltering: true,
    serverSideSorting: true,
    height: '100%'
  };

  /** Grid toolbar config — minimal action bar (no search, no column chooser) */
  public GridToolbarConfig: Partial<GridToolbarConfig> = {
    showSearch: false,
    showRefresh: true,
    showAdd: true,
    showExport: true,
    showDelete: false,
    showColumnChooser: false,
    showRowCount: false,
    showSelectionCount: false
  };

  constructor(
    private navigationService: NavigationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['entity'] || changes['searchInput']) && this.entity && this.searchInput) {
      this.ExecuteSearch();
    }
  }

  /**
   * Runs a lightweight pre-query (MaxRows: 2, PK fields only) to determine result count,
   * then routes to the appropriate state: no-results, single-result auto-nav, or viewer.
   */
  private async ExecuteSearch(): Promise<void> {
    this.SearchState = 'loading';
    this.ResultCount = 0;
    this.CurrentViewMode = 'grid';
    this.loadStarted.emit(true);

    // Resolve EntityInfo early so the header can show icon + display name during loading
    const entityInfo = this.findEntityInfo();
    this.EntityInfo = entityInfo ?? null;
    this.cdr.detectChanges();

    if (!entityInfo) {
      this.setNoResults();
      return;
    }

    const result = await this.runPreQuery(entityInfo);
    if (!result.Success || result.Results.length === 0) {
      this.setNoResults();
      return;
    }

    if (result.Results.length === 1) {
      this.navigateToSingleResult(entityInfo, result.Results[0]);
      return;
    }

    // 2+ results — show the entity-viewer
    this.SearchState = 'viewer';
    this.cdr.detectChanges();
  }

  private findEntityInfo(): EntityInfo | undefined {
    const md = new Metadata();
    return md.Entities.find(e =>
      e.Name.trim().toLowerCase() === this.entity.trim().toLowerCase()
    );
  }

  private async runPreQuery(entityInfo: EntityInfo) {
    const rv = new RunView();
    const pkFields = entityInfo.PrimaryKeys.map(pk => pk.Name);
    return rv.RunView<Record<string, unknown>>({
      EntityName: this.entity,
      ExtraFilter: 'ID IS NOT NULL',
      UserSearchString: this.searchInput,
      Fields: pkFields,
      ResultType: 'simple',
      MaxRows: 2,
    });
  }

  private setNoResults(): void {
    this.SearchState = 'no-results';
    this.ResultCount = 0;
    this.loadComplete.emit(true);
    this.cdr.detectChanges();
  }

  private navigateToSingleResult(entityInfo: EntityInfo, record: Record<string, unknown>): void {
    this.SearchState = 'single-result';
    this.ResultCount = 1;
    this.cdr.detectChanges();

    const compositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(entityInfo, record);
    this.navigationService.OpenEntityRecord(entityInfo.Name, compositeKey);
    this.loadComplete.emit(true);
  }

  // ── Header action handlers ──

  public SetViewMode(mode: EntityViewMode): void {
    this.CurrentViewMode = mode;
    this.cdr.detectChanges();
  }

  public OnViewModeChanged(mode: EntityViewMode): void {
    this.CurrentViewMode = mode;
    this.cdr.detectChanges();
  }

  public OnCreateNewRecord(): void {
    if (this.EntityInfo) {
      this.navigationService.OpenNewEntityRecord(this.EntityInfo.Name);
    }
  }

  // ── Entity-viewer event handlers ──

  public OnDataLoaded(event: DataLoadedEvent): void {
    this.ResultCount = event.totalRowCount;
    this.loadComplete.emit(true);
    this.cdr.detectChanges();
  }

  public OnRecordOpened(event: RecordOpenedEvent): void {
    this.navigationService.OpenEntityRecord(event.entity.Name, event.compositeKey);
  }

  /** Format entity icon to ensure proper Font Awesome class format */
  private formatEntityIcon(icon: string): string {
    if (!icon) {
      return 'fa-solid fa-table';
    }
    if (icon.startsWith('fa-solid') || icon.startsWith('fa-regular') ||
        icon.startsWith('fa-light') || icon.startsWith('fa-brands') ||
        icon.startsWith('fa ')) {
      return icon;
    }
    if (icon.startsWith('fa-')) {
      return `fa-solid ${icon}`;
    }
    return `fa-solid fa-${icon}`;
  }
}
