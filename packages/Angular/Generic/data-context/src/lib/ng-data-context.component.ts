import { Component, Input, OnInit } from '@angular/core';
import { IMetadataProvider, IRunViewProvider, LogError, Metadata, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJDataContextEntity, MJDataContextItemEntity } from '@memberjunction/core-entities';

@Component({
  standalone: false,
  selector: 'mj-data-context',
  templateUrl: './ng-data-context.component.html',
  styleUrls: ['./ng-data-context.component.css']
})
export class DataContextComponent implements OnInit {
  @Input() dataContextId!: string;
  @Input() Provider: IMetadataProvider | null = null;
 
  public dataContextRecord?: MJDataContextEntity;
  public dataContextItems: MJDataContextItemEntity[] = [];
  public showLoader: boolean = false;
  public errorMessage: string = '';
  public searchTerm: string = '';
  
  // UI state
  public showSQLPreview: boolean = false;
  public previewSQL: string = '';
  public copiedField: string = '';
  public expandedItems: { [key: string]: boolean } = {};

  public get ProviderToUse(): IMetadataProvider {
    return this.Provider || Metadata.Provider;
  }

  public get filteredItems(): MJDataContextItemEntity[] {
    if (!this.searchTerm) {
      return this.dataContextItems;
    }
    
    const term = this.searchTerm.toLowerCase();
    return this.dataContextItems.filter(item => 
      item.Type?.toLowerCase().includes(term) ||
      item.SQL?.toLowerCase().includes(term) ||
      (item.EntityID ? this.getEntityName(item.EntityID)?.toLowerCase().includes(term) : false) ||
      item.Description?.toLowerCase().includes(term)
    );
  }

  public get itemCount(): number {
    return this.filteredItems.length;
  }

  ngOnInit(): void {
    if(this.dataContextId){
      this.showLoader = true;
      this.LoadDataContext(this.dataContextId);
    }
  }

  async LoadDataContext(dataContextId: string) {
    try {
      if (dataContextId) {
        const p = this.ProviderToUse;
        this.dataContextRecord = await p.GetEntityObject<MJDataContextEntity>("MJ: Data Contexts", p.CurrentUser);
        await this.dataContextRecord.Load(dataContextId);

        const rv = new RunView(<IRunViewProvider><any>p);
        const response = await rv.RunView<MJDataContextItemEntity>(
          { 
            EntityName: "MJ: Data Context Items", 
            ExtraFilter: `DataContextID='${dataContextId}'`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object'
          });
          
        if(response.Success){
          this.dataContextItems = response.Results;
          this.showLoader = false;
        } else {
          this.errorMessage = response.ErrorMessage || 'Failed to load data context items';
          LogError(response.ErrorMessage);
          this.showLoader = false;
        }
      }
    } catch (error) {
      this.errorMessage = 'An error occurred while loading the data context';
      LogError(error);
      this.showLoader = false;
    }
  }

  public getTypeIcon(type: string): string {
    const typeIcons: Record<string, string> = {
      'sql': 'fa-solid fa-database',
      'view': 'fa-solid fa-table',
      'query': 'fa-solid fa-magnifying-glass',
      'entity': 'fa-solid fa-cube',
      'record': 'fa-solid fa-file'
    };
    
    return typeIcons[type?.toLowerCase()] || 'fa-solid fa-question';
  }

  public getTypeColor(type: string): string {
    const typeColors: Record<string, string> = {
      'sql': '#2196f3',
      'view': '#4caf50',
      'query': '#ff9800',
      'entity': '#9c27b0',
      'record': '#f44336'
    };
    
    return typeColors[type?.toLowerCase()] || '#757575';
  }

  public getEntityName(entityId: string | null): string | undefined {
    if (!entityId) return undefined;
    const md = new Metadata();
    return md.Entities.find(e => UUIDsEqual(e.ID, entityId))?.Name;
  }

  public async getViewName(viewId: string): Promise<string | undefined> {
    try {
      const p = this.ProviderToUse;
      const view = await p.GetEntityObject("Views", p.CurrentUser);
      await (view as any).Load(viewId);
      return (view as any).Get('Name');
    } catch {
      return undefined;
    }
  }

  public async getQueryName(queryId: string): Promise<string | undefined> {
    try {
      const p = this.ProviderToUse;
      const query = await p.GetEntityObject("MJ: Queries", p.CurrentUser);
      await (query as any).Load(queryId);
      return (query as any).Get('Name');
    } catch {
      return undefined;
    }
  }

  public onSearchChange(): void {
    // Reset expanded items when searching
    this.expandedItems = {};
  }

  public toggleItemExpansion(itemId: string): void {
    this.expandedItems[itemId] = !this.expandedItems[itemId];
  }

  public async copyToClipboard(text: string, fieldName: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedField = fieldName;
      setTimeout(() => {
        this.copiedField = '';
      }, 2000);
    } catch (err) {
      LogError(`Failed to copy to clipboard: ${err}`);
    }
  }

  public previewSQLCode(sql: string): void {
    this.previewSQL = sql;
    this.showSQLPreview = true;
  }

  public closeSQLPreview(): void {
    this.showSQLPreview = false;
    this.previewSQL = '';
  }

  public navigateToEntity(entityId: string): void {
    // This would be implemented based on your navigation system
    console.log('Navigate to entity:', entityId);
  }

  public navigateToView(viewId: string): void {
    // This would be implemented based on your navigation system
    console.log('Navigate to view:', viewId);
  }

  public navigateToQuery(queryId: string): void {
    // This would be implemented based on your navigation system
    console.log('Navigate to query:', queryId);
  }

  public async refresh(): Promise<void> {
    this.showLoader = true;
    await this.LoadDataContext(this.dataContextId);
  }

  public exportToCSV(): void {
    // Implement CSV export functionality
    const headers = ['Type', 'SQL', 'View', 'Query', 'Entity', 'Record ID', 'Description'];
    const rows = this.filteredItems.map(item => [
      item.Type,
      item.SQL,
      item.ViewID,
      item.QueryID,
      this.getEntityName(item.EntityID) || item.EntityID,
      item.RecordID,
      item.Description || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-context-${this.dataContextRecord?.Name || this.dataContextId}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}