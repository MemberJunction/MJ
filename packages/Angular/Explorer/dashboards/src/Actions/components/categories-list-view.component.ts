import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { RunView, LogError } from '@memberjunction/core';
import { ActionCategoryEntity, ActionEntity } from '@memberjunction/core-entities';
import { Subject, BehaviorSubject } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';

interface CategoryWithStats extends ActionCategoryEntity {
  actionCount?: number;
  activeActionCount?: number;
}

@Component({
  standalone: false,
  selector: 'mj-categories-list-view',
  template: `
    <div class="categories-list-view" mjFillContainer>
      <!-- Header with search -->
      <div class="list-header">
        <div class="header-title">
          <h2><i class="fa-solid fa-sitemap"></i> Action Categories</h2>
          <div class="results-count">{{ filteredCategories.length }} of {{ categories.length }} categories</div>
        </div>
        
        <div class="search-container">
          <kendo-textbox 
            placeholder="Search categories..." 
            [value]="searchTerm$.value"
            (valueChange)="onSearchChange($event)">
            <ng-template kendoTextBoxPrefixTemplate>
              <i class="fa-solid fa-search"></i>
            </ng-template>
          </kendo-textbox>
        </div>
      </div>

      <!-- Categories Grid -->
      <div class="categories-grid">
        @if (filteredCategories.length > 0) {
          @for (category of filteredCategories; track category.ID) {
            <div class="category-card" (click)="openCategory(category)">
              <div class="category-header">
                <div class="category-icon">
                  <i class="fa-solid fa-folder"></i>
                </div>
                <h3 class="category-name">{{ category.Name }}</h3>
              </div>
              
              @if (category.Description) {
                <div class="category-description">
                  {{ category.Description }}
                </div>
              }
              
              <div class="category-stats">
                <div class="stat-item">
                  <span class="stat-value">{{ category.actionCount || 0 }}</span>
                  <span class="stat-label">Total Actions</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value active">{{ category.activeActionCount || 0 }}</span>
                  <span class="stat-label">Active</span>
                </div>
              </div>
              
              <div class="category-footer">
                <button kendoButton 
                  [fillMode]="'outline'" 
                  [size]="'small'"
                  (click)="viewActions(category, $event)">
                  <i class="fa-solid fa-cogs"></i> View Actions
                </button>
              </div>
            </div>
          }
        } @else if (!isLoading) {
          <div class="empty-state">
            <i class="fa-solid fa-sitemap"></i>
            <h3>No categories found</h3>
            <p>Try adjusting your search criteria</p>
          </div>
        }
      </div>

      @if (isLoading) {
        <div class="loading-overlay">
          <mj-loading [showText]="false" size="large"></mj-loading>
        </div>
      }
    </div>
  `,
  styles: [`
    .categories-list-view {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding: 1.5rem;
      height: 100%;
      overflow-y: auto;

      .list-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;

        .header-title {
          display: flex;
          align-items: baseline;
          gap: 1rem;

          h2 {
            margin: 0;
            font-size: 1.5rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 0.5rem;

            i {
              color: var(--kendo-color-primary);
            }
          }

          .results-count {
            color: var(--kendo-color-subtle);
            font-size: 0.875rem;
          }
        }

        .search-container {
          min-width: 250px;
          
          kendo-textbox {
            width: 100%;
          }
        }
      }

      .categories-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1.5rem;
        flex: 1;
        align-content: start;

        .category-card {
          background: var(--kendo-color-surface);
          border: 1px solid var(--kendo-color-border);
          border-radius: 0.75rem;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 1rem;

          &:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            border-color: var(--kendo-color-primary);
          }

          .category-header {
            display: flex;
            align-items: center;
            gap: 1rem;

            .category-icon {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 3rem;
              height: 3rem;
              background: var(--kendo-color-primary-subtle);
              border-radius: 0.5rem;

              i {
                color: var(--kendo-color-primary);
                font-size: 1.25rem;
              }
            }

            .category-name {
              margin: 0;
              font-size: 1.125rem;
              font-weight: 600;
              flex: 1;
            }
          }

          .category-description {
            color: var(--kendo-color-subtle);
            font-size: 0.875rem;
            line-height: 1.5;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .category-stats {
            display: flex;
            gap: 2rem;
            padding: 1rem;
            background: var(--kendo-color-app-surface);
            border-radius: 0.5rem;

            .stat-item {
              display: flex;
              flex-direction: column;
              gap: 0.25rem;

              .stat-value {
                font-size: 1.5rem;
                font-weight: 700;
                color: var(--kendo-color-on-app-surface);

                &.active {
                  color: var(--kendo-color-success);
                }
              }

              .stat-label {
                font-size: 0.75rem;
                color: var(--kendo-color-subtle);
                font-weight: 600;
              }
            }
          }

          .category-footer {
            display: flex;
            justify-content: flex-end;
            margin-top: auto;
          }
        }
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 4rem;
        text-align: center;
        color: var(--kendo-color-subtle);

        i {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
          font-weight: 600;
        }

        p {
          margin: 0;
          font-size: 0.875rem;
        }
      }

      .loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
    }

    @media (max-width: 768px) {
      .categories-list-view {
        padding: 1rem;

        .list-header {
          flex-direction: column;
          align-items: stretch;

          .search-container {
            min-width: unset;
          }
        }

        .categories-grid {
          grid-template-columns: 1fr;
          gap: 1rem;
        }
      }
    }
  `]
})
export class CategoriesListViewComponent implements OnInit, OnDestroy {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();

  public isLoading = true;
  public categories: CategoryWithStats[] = [];
  public filteredCategories: CategoryWithStats[] = [];
  public searchTerm$ = new BehaviorSubject<string>('');

  private destroy$ = new Subject<void>();

  constructor() {}

  ngOnInit(): void {
    this.setupSearch();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch(): void {
    this.searchTerm$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilter();
    });
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      console.log('Loading categories data...');
      
      const rv = new RunView();
      const [categoriesResult, actionsResult] = await rv.RunViews([
        {
          EntityName: 'Action Categories', 
          OrderBy: 'Name' 
        },
        {
          EntityName: 'Actions', 
          OrderBy: 'Name'
        }
      ]);
      
      console.log('Categories result:', categoriesResult);
      console.log('Actions result for categories:', actionsResult);
      
      if (!categoriesResult.Success) {
        throw new Error('Failed to load categories: ' + categoriesResult.ErrorMessage);
      }
      
      const categories = (categoriesResult.Results || []) as ActionCategoryEntity[];
      const actions = (actionsResult.Results || []) as ActionEntity[];
      
      console.log(`Loaded ${categories.length} categories and ${actions.length} actions`);

      // Calculate stats for each category
      this.categories = categories.map(category => {
        const categoryActions = actions.filter(a => a.CategoryID === category.ID);
        return {
          ...category,
          actionCount: categoryActions.length,
          activeActionCount: categoryActions.filter(a => a.Status === 'Active').length
        } as CategoryWithStats;
      });

      this.applyFilter();

    } catch (error) {
      console.error('Error loading categories data:', error);
      LogError('Failed to load categories data', undefined, error);
      this.categories = [];
      this.filteredCategories = [];
    } finally {
      this.isLoading = false;
    }
  }

  private applyFilter(): void {
    const searchTerm = this.searchTerm$.value.toLowerCase();
    
    if (!searchTerm) {
      this.filteredCategories = [...this.categories];
    } else {
      this.filteredCategories = this.categories.filter(category => 
        category.Name.toLowerCase().includes(searchTerm) ||
        (category.Description || '').toLowerCase().includes(searchTerm)
      );
    }
  }

  public onSearchChange(searchTerm: string): void {
    this.searchTerm$.next(searchTerm);
  }

  public openCategory(category: ActionCategoryEntity): void {
    this.openEntityRecord.emit({
      entityName: 'Action Categories',
      recordId: category.ID
    });
  }

  public viewActions(category: ActionCategoryEntity, event: Event): void {
    event.stopPropagation();
    // This could navigate to the actions list with a pre-applied category filter
    // For now, just open the category
    this.openCategory(category);
  }
}