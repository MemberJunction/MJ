import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData, TemplateEntity, TemplateContentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';

interface TemplateCardData {
    Entity: TemplateEntity;
    ContentTypes: string[];
    LastUpdated: Date | null;
    CategoryName: string;
}
@RegisterClass(BaseResourceComponent, 'CommunicationTemplatesResource')
@Component({
  standalone: false,
    selector: 'mj-communication-templates-resource',
    template: `
    <div class="templates-wrapper">
      <!-- HEADER -->
      <div class="templates-header">
        <div>
          <h2>Communication Templates</h2>
          <p>Manage reusable message templates</p>
        </div>
        <div class="header-actions">
          <div class="search-input-wrapper">
            <i class="fa-solid fa-search"></i>
            <input type="text" placeholder="Search templates..." (input)="onSearch($event)">
          </div>
          <button class="tb-btn primary" (click)="addNewTemplate()">
            <i class="fa-solid fa-plus"></i> New Template
          </button>
        </div>
      </div>
    
      <!-- LOADING -->
      @if (isLoading) {
        <div class="loading-state">
          <mj-loading text="Loading templates..."></mj-loading>
        </div>
      }
    
      <!-- CATEGORY FILTERS -->
      @if (!isLoading) {
        <div class="category-filters">
          <div class="filter-chip" [class.active]="categoryFilter === ''"
            (click)="onCategoryFilter('')">
            All ({{allTemplates.length}})
          </div>
          @for (cat of categories; track cat) {
            <div class="filter-chip"
              [class.active]="categoryFilter === cat"
              (click)="onCategoryFilter(cat)">
              {{cat}} ({{getCategoryCount(cat)}})
            </div>
          }
        </div>
      }
    
      <!-- TEMPLATES GRID -->
      @if (!isLoading) {
        <div class="templates-grid">
          @for (card of filteredTemplates; track card) {
            <div class="template-card"
              (click)="openTemplate(card.Entity)">
              <div class="template-card-header">
                <div class="template-icon">
                  <i class="fa-solid fa-file-lines"></i>
                </div>
                <div class="template-title-area">
                  <div class="template-name">{{card.Entity.Name}}</div>
                  <div class="template-category">{{card.CategoryName}}</div>
                </div>
              </div>
              @if (card.Entity.Description) {
                <div class="template-description">
                  {{card.Entity.Description}}
                </div>
              }
              <div class="template-meta">
                <div class="template-content-types">
                  @for (ct of card.ContentTypes; track ct) {
                    <span class="content-type-chip">
                      <i [class]="getContentTypeIcon(ct)"></i> {{ct}}
                    </span>
                  }
                  @if (card.ContentTypes.length === 0) {
                    <span class="content-type-chip empty">
                      No content
                    </span>
                  }
                </div>
                @if (card.LastUpdated) {
                  <div class="template-updated">
                    Updated {{card.LastUpdated | date:'mediumDate'}}
                  </div>
                }
              </div>
            </div>
          }
          @if (filteredTemplates.length === 0) {
            <div class="empty-state">
              <i class="fa-solid fa-file-lines"></i>
              <p>No templates found matching your criteria</p>
            </div>
          }
        </div>
      }
    </div>
    `,
    styles: [`
    .templates-wrapper {
        height: 100%;
        padding: 24px;
        overflow-y: auto;
        background: var(--mat-sys-surface-container);
    }

    /* HEADER */
    .templates-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
    }
    .templates-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        color: var(--mat-sys-on-surface);
    }
    .templates-header p {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
    }
    .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .search-input-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: var(--mat-sys-corner-small, 8px);
        background: var(--mat-sys-surface-container-lowest);
        transition: border-color 0.15s, box-shadow 0.15s;
        min-width: 220px;
    }
    .search-input-wrapper:focus-within {
        border-color: var(--mat-sys-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--mat-sys-primary) 15%, transparent);
    }
    .search-input-wrapper i { color: var(--mat-sys-on-surface-variant); font-size: 12px; }
    .search-input-wrapper input {
        flex: 1; border: none; outline: none;
        background: transparent; font-size: 12px;
        font-family: inherit; color: var(--mat-sys-on-surface);
    }
    .search-input-wrapper input::placeholder { color: var(--mat-sys-on-surface-variant); }

    .tb-btn {
        display: inline-flex; align-items: center;
        gap: 6px; padding: 8px 16px;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: var(--mat-sys-corner-extra-small, 4px);
        background: var(--mat-sys-surface-container-lowest);
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px; font-weight: 600;
        cursor: pointer; transition: all 0.15s ease;
        font-family: inherit;
    }
    .tb-btn.primary {
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary, #fff);
        border-color: var(--mat-sys-primary);
    }
    .tb-btn.primary:hover { filter: brightness(1.1); }

    .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 80px 0;
    }

    /* CATEGORY FILTERS */
    .category-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 20px;
    }
    .filter-chip {
        display: inline-flex; align-items: center;
        gap: 4px; padding: 5px 14px;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 16px;
        background: var(--mat-sys-surface-container-lowest);
        font-size: 12px; font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
        cursor: pointer; transition: all 0.15s;
    }
    .filter-chip:hover {
        border-color: var(--mat-sys-outline);
        background: var(--mat-sys-surface-container);
    }
    .filter-chip.active {
        border-color: var(--mat-sys-primary);
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
    }

    /* GRID */
    .templates-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
    }

    .template-card {
        background: var(--mat-sys-surface-container-lowest);
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: var(--mat-sys-corner-medium, 12px);
        padding: 20px;
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .template-card:hover {
        box-shadow: 0 2px 6px 2px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
        border-color: var(--mat-sys-outline);
    }

    .template-card-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 12px;
    }
    .template-icon {
        width: 40px; height: 40px;
        border-radius: var(--mat-sys-corner-small, 8px);
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; flex-shrink: 0;
    }
    .template-title-area { flex: 1; min-width: 0; }
    .template-name {
        font-size: 14px; font-weight: 700;
        color: var(--mat-sys-on-surface);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .template-category {
        font-size: 11px;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 2px;
    }

    .template-description {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        line-height: 1.5;
        margin-bottom: 12px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .template-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .template-content-types {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .content-type-chip {
        display: inline-flex; align-items: center;
        gap: 4px; padding: 3px 8px;
        border-radius: 10px; font-size: 10px; font-weight: 500;
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface-variant);
    }
    .content-type-chip.empty {
        font-style: italic;
    }
    .template-updated {
        font-size: 10px;
        color: var(--mat-sys-on-surface-variant);
        white-space: nowrap;
    }

    /* EMPTY STATE */
    .empty-state {
        grid-column: 1 / -1;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 64px 0; color: var(--mat-sys-on-surface-variant);
    }
    .empty-state i { font-size: 2rem; margin-bottom: 12px; opacity: 0.5; }
    .empty-state p { margin: 0; font-size: 13px; }
  `]
})
export class CommunicationTemplatesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public allTemplates: TemplateCardData[] = [];
    public filteredTemplates: TemplateCardData[] = [];
    public categories: string[] = [];
    public categoryFilter = '';
    public isLoading = false;
    private searchTerm = '';

    constructor(private cdr: ChangeDetectorRef, private navService: NavigationService) {
        super();
    }

    async ngOnInit(): Promise<void> {
        await this.loadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void { }

    public async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const rv = new RunView();
            const [templatesResult, contentsResult] = await Promise.all([
                rv.RunView<TemplateEntity>({
                    EntityName: 'Templates',
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                }),
                rv.RunView<TemplateContentEntity>({
                    EntityName: 'Template Contents',
                    ResultType: 'entity_object'
                })
            ]);

            if (templatesResult.Success) {
                const contents = contentsResult.Success ? contentsResult.Results : [];
                this.allTemplates = templatesResult.Results.map(t => this.buildTemplateCard(t, contents));
                this.categories = this.extractCategories(this.allTemplates);
                this.applyFilter();
            }
        } catch (error) {
            console.error('Error loading templates:', error);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    private buildTemplateCard(template: TemplateEntity, allContents: TemplateContentEntity[]): TemplateCardData {
        const templateContents = allContents.filter(c => c.TemplateID === template.ID);
        const contentTypes = [...new Set(templateContents.map(c => c.TypeID ? 'Content' : 'Text'))];
        const category = template.Category || 'Uncategorized';
        const lastUpdated = template.Get('__mj_UpdatedAt') as Date | null;

        return {
            Entity: template,
            ContentTypes: contentTypes.length > 0 ? contentTypes : [],
            LastUpdated: lastUpdated,
            CategoryName: category
        };
    }

    private extractCategories(cards: TemplateCardData[]): string[] {
        const cats = new Set(cards.map(c => c.CategoryName));
        return Array.from(cats).sort();
    }

    public getCategoryCount(category: string): number {
        return this.allTemplates.filter(t => t.CategoryName === category).length;
    }

    public onSearch(event: Event): void {
        this.searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
        this.applyFilter();
    }

    public onCategoryFilter(category: string): void {
        this.categoryFilter = category;
        this.applyFilter();
    }

    private applyFilter(): void {
        let filtered = this.allTemplates;

        if (this.categoryFilter) {
            filtered = filtered.filter(t => t.CategoryName === this.categoryFilter);
        }

        if (this.searchTerm) {
            filtered = filtered.filter(t =>
                t.Entity.Name?.toLowerCase().includes(this.searchTerm) ||
                t.Entity.Description?.toLowerCase().includes(this.searchTerm) ||
                t.CategoryName.toLowerCase().includes(this.searchTerm)
            );
        }

        this.filteredTemplates = filtered;
        this.cdr.detectChanges();
    }

    public openTemplate(template: TemplateEntity): void {
        const pk = new CompositeKey();
        pk.LoadFromEntityInfoAndRecord(new Metadata().Entities.find(e => e.Name === 'Templates')!, template);
        this.navService.OpenEntityRecord('Templates', pk);
    }

    public addNewTemplate(): void {
        this.navService.OpenEntityRecord('Templates', new CompositeKey());
    }

    public getContentTypeIcon(type: string): string {
        const t = type.toLowerCase();
        if (t.includes('html')) return 'fa-solid fa-code';
        if (t.includes('text') || t.includes('plain')) return 'fa-solid fa-align-left';
        if (t.includes('sms')) return 'fa-solid fa-comment-sms';
        return 'fa-solid fa-file';
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Templates';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-file-lines';
    }
}
