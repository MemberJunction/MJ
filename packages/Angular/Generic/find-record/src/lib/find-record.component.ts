import { Component,  EventEmitter,  Input, OnDestroy, OnInit, Output } from '@angular/core';
import { BaseEntity, EntityFieldInfo, EntityInfo, LogError, RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import {
  ColDef,
  GridReadyEvent,
  GridApi,
  ModuleRegistry,
  AllCommunityModule,
  RowSelectionOptions,
  SelectionChangedEvent,
  themeAlpine,
  colorSchemeVariable,
  type Theme
} from 'ag-grid-community';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);
 
@Component({
  standalone: false,
  selector: 'mj-find-record',
  templateUrl: './find-record.component.html',
  styleUrls: ['./find-record.component.css']
})
export class FindRecordComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  /**
   * The name of the entity to show records for.
   */
  @Input() EntityName: string = '';

  /**
   * Optional, list of fields to be displayed in the grid of search results, if not specified, the default fields will be displayed
   */
  @Input() public DisplayFields: EntityFieldInfo[] = []; // Fields to display in the grid

  /**
   * Optional, the number of milliseconds to wait after the last keypress before triggering a search. Default is 300ms
   */
  @Input() public SearchDebounceTime: number = 300; // Debounce time for search


  /**
   * When a record is selected, this event is emitted with the selected record
   */
  @Output() OnRecordSelected = new EventEmitter<BaseEntity>();

  public searchTerm: string = ''; // User search term
  public records: BaseEntity[] = []; // Store search results

  public loading = false; // Loading state for search
  public searchHasRun: boolean = false; // has a search been run
  private entityInfo: EntityInfo | undefined; // Entity metadata

  private searchSubject = new Subject<string>(); // Subject to emit search term changes
  private searchSubscription: Subscription | undefined;

  // AG Grid configuration
  public ColumnDefs: ColDef[] = [];
  public DefaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: false
  };
  public RowSelectionConfig: RowSelectionOptions = {
    mode: 'singleRow',
    checkboxes: false,
    enableClickSelection: true
  };
  public GridTheme: Theme = themeAlpine.withPart(colorSchemeVariable);
  private gridApi: GridApi | null = null;

 
  ngOnInit() {
    // Fetch the entity metadata based on EntityName
    const md = this.ProviderToUse;
    this.entityInfo = md.EntityByName(this.EntityName);
    if (!this.entityInfo) {
      LogError(`Entity ${this.EntityName} not found`);
      return;
    }

    // Set display fields (you can adjust the logic based on your entity structure)
    if (this.DisplayFields.length === 0) {
      this.DisplayFields = this.entityInfo.Fields.filter(
        (field: EntityFieldInfo) => field.DefaultInView || field.IsPrimaryKey || field.IsNameField || field.IncludeInUserSearchAPI
      );
    }

    // Build AG Grid column definitions from display fields
    this.ColumnDefs = this.buildColumnDefs();

    // Subscribe to the searchSubject with debounce
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(this.SearchDebounceTime), // Delay search execution by 300ms
      distinctUntilChanged(), // Only proceed if the search term has changed
      switchMap(term => {
        this.loading = true;
        return this.doSearch(term);
      })
    ).subscribe({
      next: (results: BaseEntity[]) => {
        this.records = results;
        this.loading = false;
        this.searchHasRun = true;
      },
      error: (error) => {
        LogError(error.message);
        this.loading = false;
        this.searchHasRun = true;
      }
    });    
  }

  ngOnDestroy() {
    // Cleanup the subscription
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }


  onFind() {
    this.searchSubject.next(this.searchTerm); // Trigger the debounced search
  }  

  onSearchTermChange(term: string) {
    this.searchTerm = term;
    this.searchSubject.next(term); // Emit the new search term
  }

  public onSelectionChange(event: SelectionChangedEvent) {
    const selectedRows = event.api.getSelectedRows();
    if (selectedRows.length > 0) {
      this.OnRecordSelected.emit(selectedRows[0]);
    }
  }

  public onGridReady(event: GridReadyEvent) {
    this.gridApi = event.api;
  }

  private buildColumnDefs(): ColDef[] {
    return this.DisplayFields.map((field: EntityFieldInfo) => ({
      field: field.Name,
      headerName: field.DisplayNameOrName
    }));
  }

  // Stub function for simulating a database search (replace with actual search logic)
  protected async doSearch(searchTerm: string): Promise<BaseEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: this.EntityName, 
      UserSearchString: searchTerm, 
      ResultType: 'entity_object'
    });
    if (result && result.Success) {
      return result.Results;
      this.searchHasRun = true;
    }
    else  {
      const errorMessage = `Error searching for ${this.EntityName}: ${result.ErrorMessage}`;
      LogError(errorMessage);
      throw new Error(errorMessage);
    }
  }  
}
