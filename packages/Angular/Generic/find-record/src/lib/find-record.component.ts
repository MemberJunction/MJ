import { Component,  EventEmitter,  Input, Output } from '@angular/core';
import { BaseEntity, EntityFieldInfo, EntityInfo, LogError, Metadata, RunView } from '@memberjunction/core';

 
@Component({
  selector: 'mj-find-record',
  templateUrl: './find-record.component.html',
  styleUrls: ['./find-record.component.css']
})
export class FindRecordComponent  {
  /**
   * The name of the entity to show records for.
   */
  @Input() EntityName: string = '';

  /**
   * Optional, list of fields to be displayed in the grid of search results, if not specified, the default fields will be displayed
   */
  @Input() public DisplayFields: EntityFieldInfo[] = []; // Fields to display in the grid

  /**
   * When a record is selected, this event is emitted with the selected record
   */
  @Output() OnRecordSelected = new EventEmitter<BaseEntity>();

  public searchTerm: string = ''; // User search term
  public records: any[] = []; // Store search results

  public loading = false; // Loading state for search
  public searchHasRun: boolean = false; // has a search been run
  private entityInfo: EntityInfo | undefined; // Entity metadata

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
  }

  onFind() {
    this.loading = true;

    this.doSearch(this.searchTerm).then((results: any[]) => {
      this.records = results;
      this.loading = false;
    });
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
