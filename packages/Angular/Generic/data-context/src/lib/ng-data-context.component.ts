import { Component, Input, OnInit } from '@angular/core';
import { IMetadataProvider, LogError, Metadata, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJDataContextEntity, MJDataContextItemEntity } from '@memberjunction/core-entities';

@Component({
  standalone: false,
  selector: 'mj-data-context',
  templateUrl: './ng-data-context.component.html',
  styleUrls: ['./ng-data-context.component.css']
})
export class DataContextComponent implements OnInit {
  @Input() DataContextId!: string;

  /** @deprecated Use {@link DataContextId}. */
  @Input() set dataContextId(value: string) {
    this.DataContextId = value;
  }
  /** @deprecated Use {@link DataContextId}. */
  get dataContextId(): string {
    return this.DataContextId;
  }
  @Input() Provider: IMetadataProvider | null = null;
 
  public dataContextRecord?: MJDataContextEntity;
  public DataContextItems: MJDataContextItemEntity[] = [];

  /** @deprecated Use {@link DataContextItems}. */
  public get dataContextItems(): MJDataContextItemEntity[] {
    return this.DataContextItems;
  }
  /** @deprecated Use {@link DataContextItems}. */
  public set dataContextItems(value: MJDataContextItemEntity[]) {
    this.DataContextItems = value;
  }
  public ShowLoader: boolean = false;

  /** @deprecated Use {@link ShowLoader}. */
  public get showLoader(): boolean {
    return this.ShowLoader;
  }
  /** @deprecated Use {@link ShowLoader}. */
  public set showLoader(value: boolean) {
    this.ShowLoader = value;
  }
  public errorMessage: string = '';
  public SearchTerm: string = '';

  /** @deprecated Use {@link SearchTerm}. */
  public get searchTerm(): string {
    return this.SearchTerm;
  }
  /** @deprecated Use {@link SearchTerm}. */
  public set searchTerm(value: string) {
    this.SearchTerm = value;
  }
  
  // UI state
  public ShowSQLPreview: boolean = false;

  /** @deprecated Use {@link ShowSQLPreview}. */
  public get showSQLPreview(): boolean {
    return this.ShowSQLPreview;
  }
  /** @deprecated Use {@link ShowSQLPreview}. */
  public set showSQLPreview(value: boolean) {
    this.ShowSQLPreview = value;
  }
  public PreviewSQL: string = '';

  /** @deprecated Use {@link PreviewSQL}. */
  public get previewSQL(): string {
    return this.PreviewSQL;
  }
  /** @deprecated Use {@link PreviewSQL}. */
  public set previewSQL(value: string) {
    this.PreviewSQL = value;
  }
  public CopiedField: string = '';

  /** @deprecated Use {@link CopiedField}. */
  public get copiedField(): string {
    return this.CopiedField;
  }
  /** @deprecated Use {@link CopiedField}. */
  public set copiedField(value: string) {
    this.CopiedField = value;
  }
  public ExpandedItems: { [key: string]: boolean } = {};

  /** @deprecated Use {@link ExpandedItems}. */
  public get expandedItems(): { [key: string]: boolean } {
    return this.ExpandedItems;
  }
  /** @deprecated Use {@link ExpandedItems}. */
  public set expandedItems(value: { [key: string]: boolean }) {
    this.ExpandedItems = value;
  }

  public get ProviderToUse(): IMetadataProvider {
    return this.Provider ?? Metadata.Provider;
  }

  public get FilteredItems(): MJDataContextItemEntity[] {
    if (!this.SearchTerm) {
      return this.DataContextItems;
    }
    
    const term = this.SearchTerm.toLowerCase();
    return this.DataContextItems.filter(item => 
      item.Type?.toLowerCase().includes(term) ||
      item.SQL?.toLowerCase().includes(term) ||
      (item.EntityID ? this.getEntityName(item.EntityID)?.toLowerCase().includes(term) : false) ||
      item.Description?.toLowerCase().includes(term)
    );
  }

  /** @deprecated Use {@link FilteredItems}. */
  public get filteredItems(): MJDataContextItemEntity[] {
    return this.FilteredItems;
  }

  public get ItemCount(): number {
    return this.FilteredItems.length;
  }

  /** @deprecated Use {@link ItemCount}. */
  public get itemCount(): number {
    return this.ItemCount;
  }

  ngOnInit(): void {
    if(this.DataContextId){
      this.ShowLoader = true;
      this.LoadDataContext(this.DataContextId);
    }
  }

  async LoadDataContext(dataContextId: string) {
    try {
      if (dataContextId) {
        const p = this.ProviderToUse;
        this.dataContextRecord = await p.GetEntityObject<MJDataContextEntity>("MJ: Data Contexts", p.CurrentUser);
        await this.dataContextRecord.Load(dataContextId);

        const rv = RunView.FromMetadataProvider(p);
        const response = await rv.RunView<MJDataContextItemEntity>(
          { 
            EntityName: "MJ: Data Context Items", 
            ExtraFilter: `DataContextID='${dataContextId}'`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object'
          });
          
        if(response.Success){
          this.DataContextItems = response.Results;
          this.ShowLoader = false;
        } else {
          this.errorMessage = response.ErrorMessage || 'Failed to load data context items';
          LogError(response.ErrorMessage);
          this.ShowLoader = false;
        }
      }
    } catch (error) {
      this.errorMessage = 'An error occurred while loading the data context';
      LogError(error);
      this.ShowLoader = false;
    }
  }

  public GetTypeIcon(type: string): string {
    const typeIcons: Record<string, string> = {
      'sql': 'fa-solid fa-database',
      'view': 'fa-solid fa-table',
      'query': 'fa-solid fa-magnifying-glass',
      'entity': 'fa-solid fa-cube',
      'record': 'fa-solid fa-file'
    };
    
    return typeIcons[type?.toLowerCase()] || 'fa-solid fa-question';
  }

  /** @deprecated Use {@link GetTypeIcon}. */
  public getTypeIcon(type: string): string {
    return this.GetTypeIcon(type);
  }

  public GetTypeColor(type: string): string {
    const typeColors: Record<string, string> = {
      'sql': '#2196f3',
      'view': '#4caf50',
      'query': '#ff9800',
      'entity': '#9c27b0',
      'record': '#f44336'
    };
    
    return typeColors[type?.toLowerCase()] || '#757575';
  }

  /** @deprecated Use {@link GetTypeColor}. */
  public getTypeColor(type: string): string {
    return this.GetTypeColor(type);
  }

  public getEntityName(entityId: string | null): string | undefined {
    if (!entityId) return undefined;
    const md = this.ProviderToUse;
    return md.Entities.find(e => UUIDsEqual(e.ID, entityId))?.Name;
  }

  public async GetViewName(viewId: string): Promise<string | undefined> {
    try {
      const p = this.ProviderToUse;
      const view = await p.GetEntityObject("Views", p.CurrentUser);
      await (view as any).Load(viewId);
      return (view as any).Get('Name');
    } catch {
      return undefined;
    }
  }

  /** @deprecated Use {@link GetViewName}. */
  public async getViewName(viewId: string): Promise<string | undefined> {
    return this.GetViewName(viewId);
  }

  public async GetQueryName(queryId: string): Promise<string | undefined> {
    try {
      const p = this.ProviderToUse;
      const query = await p.GetEntityObject("MJ: Queries", p.CurrentUser);
      await (query as any).Load(queryId);
      return (query as any).Get('Name');
    } catch {
      return undefined;
    }
  }

  /** @deprecated Use {@link GetQueryName}. */
  public async getQueryName(queryId: string): Promise<string | undefined> {
    return this.GetQueryName(queryId);
  }

  public OnSearchChange(): void {
    // Reset expanded items when searching
    this.ExpandedItems = {};
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(): void {
    return this.OnSearchChange();
  }

  public ToggleItemExpansion(itemId: string): void {
    this.ExpandedItems[itemId] = !this.ExpandedItems[itemId];
  }

  /** @deprecated Use {@link ToggleItemExpansion}. */
  public toggleItemExpansion(itemId: string): void {
    return this.ToggleItemExpansion(itemId);
  }

  public async CopyToClipboard(text: string, fieldName: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.CopiedField = fieldName;
      setTimeout(() => {
        this.CopiedField = '';
      }, 2000);
    } catch (err) {
      LogError(`Failed to copy to clipboard: ${err}`);
    }
  }

  /** @deprecated Use {@link CopyToClipboard}. */
  public async copyToClipboard(text: string, fieldName: string): Promise<void> {
    return this.CopyToClipboard(text, fieldName);
  }

  public PreviewSQLCode(sql: string): void {
    this.PreviewSQL = sql;
    this.ShowSQLPreview = true;
  }

  /** @deprecated Use {@link PreviewSQLCode}. */
  public previewSQLCode(sql: string): void {
    return this.PreviewSQLCode(sql);
  }

  public CloseSQLPreview(): void {
    this.ShowSQLPreview = false;
    this.PreviewSQL = '';
  }

  /** @deprecated Use {@link CloseSQLPreview}. */
  public closeSQLPreview(): void {
    return this.CloseSQLPreview();
  }

  public NavigateToEntity(entityId: string): void {
    // This would be implemented based on your navigation system
    console.log('Navigate to entity:', entityId);
  }

  /** @deprecated Use {@link NavigateToEntity}. */
  public navigateToEntity(entityId: string): void {
    return this.NavigateToEntity(entityId);
  }

  public NavigateToView(viewId: string): void {
    // This would be implemented based on your navigation system
    console.log('Navigate to view:', viewId);
  }

  /** @deprecated Use {@link NavigateToView}. */
  public navigateToView(viewId: string): void {
    return this.NavigateToView(viewId);
  }

  public NavigateToQuery(queryId: string): void {
    // This would be implemented based on your navigation system
    console.log('Navigate to query:', queryId);
  }

  /** @deprecated Use {@link NavigateToQuery}. */
  public navigateToQuery(queryId: string): void {
    return this.NavigateToQuery(queryId);
  }

  public async Refresh(): Promise<void> {
    this.ShowLoader = true;
    await this.LoadDataContext(this.DataContextId);
  }

  /** @deprecated Use {@link Refresh}. */
  public async refresh(): Promise<void> {
    return this.Refresh();
  }

  public ExportToCSV(): void {
    // Implement CSV export functionality
    const headers = ['Type', 'SQL', 'View', 'Query', 'Entity', 'Record ID', 'Description'];
    const rows = this.FilteredItems.map(item => [
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
    a.download = `data-context-${this.dataContextRecord?.Name || this.DataContextId}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  /** @deprecated Use {@link ExportToCSV}. */
  public exportToCSV(): void {
    return this.ExportToCSV();
  }
}