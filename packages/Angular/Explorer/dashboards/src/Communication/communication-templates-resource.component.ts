import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData, MJTemplateEntity, MJTemplateContentEntity } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';

interface TemplateCardData {
    Entity: MJTemplateEntity;
    ContentTypes: string[];
    LastUpdated: Date | null;
    CategoryName: string;
}
@RegisterClass(BaseResourceComponent, 'CommunicationTemplatesResource')
@Component({
  standalone: false,
    selector: 'mj-communication-templates-resource',
    template: `
    <mj-page-layout>
      <mj-page-header Title="Templates" Icon="fa-solid fa-file-lines" Subtitle="Manage reusable message templates">
        <div actions class="header-actions">
          <button mjButton variant="primary" size="sm" (click)="addNewTemplate()">
            <i class="fa-solid fa-plus"></i> New Template
          </button>
        </div>
        <div toolbar class="header-toolbar">
          <mj-page-search
            Placeholder="Search templates..."
            (ValueChange)="onSearchValue($event)">
          </mj-page-search>
          @if (!isLoading) {
            <mj-filter-chip
              Label="All"
              [Count]="allTemplates.length"
              [Active]="categoryFilter === ''"
              (Clicked)="onCategoryFilter('')">
            </mj-filter-chip>
            @for (cat of categories; track cat) {
              <mj-filter-chip
                [Label]="cat"
                [Count]="getCategoryCount(cat)"
                [Active]="categoryFilter === cat"
                (Clicked)="onCategoryFilter(cat)">
              </mj-filter-chip>
            }
          }
        </div>
      </mj-page-header>

      <div class="templates-body">
        @if (isLoading) {
          <div class="loading-state">
            <mj-loading text="Loading templates..."></mj-loading>
          </div>
        } @else {
          <div class="templates-grid">
            @for (card of filteredTemplates; track card) {
              <div class="template-card" (click)="openTemplate(card.Entity)">
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
    </mj-page-layout>
    `,
    styles: [`
    /* Body sits below <mj-page-header> inside <mj-page-layout>. */
    .templates-body {
        flex: 1;
        min-height: 0;
        padding: 24px;
        overflow-y: auto;
    }

    /* Header slots projected into <mj-page-header> */
    .header-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        width: 100%;
    }
    .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 80px 0;
    }

    /* GRID */
    .templates-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
    }

    .template-card {
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .template-card:hover {
        box-shadow: 0 2px 8px var(--mj-shadow-md);
        border-color: var(--mj-border-strong);
    }

    .template-card-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 12px;
    }
    .template-icon {
        width: 40px; height: 40px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; flex-shrink: 0;
    }
    .template-title-area { flex: 1; min-width: 0; }
    .template-name {
        font-size: 14px; font-weight: 700;
        color: var(--mj-text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .template-category {
        font-size: 11px;
        color: var(--mj-text-muted);
        margin-top: 2px;
    }

    .template-description {
        font-size: 12px;
        color: var(--mj-text-muted);
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
        background: var(--mj-bg-surface);
        color: var(--mj-text-muted);
    }
    .content-type-chip.empty {
        font-style: italic;
    }
    .template-updated {
        font-size: 10px;
        color: var(--mj-text-muted);
        white-space: nowrap;
    }

    /* EMPTY STATE */
    .empty-state {
        grid-column: 1 / -1;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 64px 0; color: var(--mj-text-muted);
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
        super.ngOnInit();
        await this.loadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    public async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [templatesResult, contentsResult] = await Promise.all([
                rv.RunView<MJTemplateEntity>({
                    EntityName: 'MJ: Templates',
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                }),
                rv.RunView<MJTemplateContentEntity>({
                    EntityName: 'MJ: Template Contents',
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

    private buildTemplateCard(template: MJTemplateEntity, allContents: MJTemplateContentEntity[]): TemplateCardData {
        const templateContents = allContents.filter(c => UUIDsEqual(c.TemplateID, template.ID));
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

    public onSearchValue(value: string): void {
        this.searchTerm = (value ?? '').toLowerCase();
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

    public openTemplate(template: MJTemplateEntity): void {
        const pk = new CompositeKey();
        pk.LoadFromEntityInfoAndRecord(this.ProviderToUse.Entities.find(e => e.Name === 'MJ: Templates')!, template);
        this.navService.OpenEntityRecord('MJ: Templates', pk);
    }

    public addNewTemplate(): void {
        this.navService.OpenEntityRecord('MJ: Templates', new CompositeKey());
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
