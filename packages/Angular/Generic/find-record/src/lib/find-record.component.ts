import { Component,  EventEmitter,  Input, OnDestroy, OnInit, Output } from '@angular/core';
import { BaseEntity, EntityFieldInfo, EntityInfo, LogError, Metadata, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
 
@Component({
  standalone: false,
  selector: 'mj-find-record',
  templateUrl: './find-record.component.html',
  styleUrls: ['./find-record.component.css']
})
export class FindRecordComponent implements OnInit, OnDestroy {
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
  public records: any[] = []; // Store search results

  public loading = false; // Loading state for search
  public searchHasRun: boolean = false; // has a search been run
  private entityInfo: EntityInfo | undefined; // Entity metadata

  private searchSubject = new Subject<string>(); // Subject to emit search term changes
  private searchSubscription: any;

 
  ngOnInit() {
    // Fetch the entity metadata based on EntityName
    const md = new Metadata();
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

    // Subscribe to the searchSubject with debounce
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(this.SearchDebounceTime), // Delay search execution by 300ms
      distinctUntilChanged(), // Only proceed if the search term has changed
      switchMap(term => {
        this.loading = true;
        return this.doSearch(term);
      })
    ).subscribe({
      next: (results: any[]) => {
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

  public onSelectionChange(event: any) {
    // Emit the selected record
    this.OnRecordSelected.emit(event.selectedRows[0].dataItem);
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
