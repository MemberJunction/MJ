import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { QueryEntity, QueryParameterEntity, QueryCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { QueryFormComponent } from '../../generated/Entities/Query/query.form.component';
import { Metadata, RunView, RUN_QUERY_SQL_FILTERS } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CodeEditorComponent } from '@memberjunction/ng-code-editor';
import { Subject } from 'rxjs';

@RegisterClass(BaseFormComponent, 'Queries') 
@Component({
    selector: 'mj-query-form',
    templateUrl: './query-form.component.html',
    styleUrls: ['../../../shared/form-styles.css', './query-form.component.css']
})
export class QueryFormExtendedComponent extends QueryFormComponent implements OnInit, OnDestroy {
    public record!: QueryEntity;
    public queryParameters: QueryParameterEntity[] = [];
    public isLoadingParameters = false;
    public hasUnsavedChanges = false;
    public queryInfoExpanded = true;
    public queryParametersExpanded = true;
    public showFiltersHelp = false;
    public showRunDialog = false;
    
    public categoryOptions: Array<{text: string, value: string}> = [
        { text: 'Select Category...', value: '' }
    ];

    @ViewChild('sqlEditor') sqlEditor: CodeEditorComponent | null = null;
    private isUpdatingEditorValue = false;
    
    // SQL Filters for help display
    public sqlFilters = RUN_QUERY_SQL_FILTERS;
    
    private destroy$ = new Subject<void>();

    async ngOnInit() {
        await super.ngOnInit();
        await this.loadQueryParameters();
        await this.loadCategories();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    async loadQueryParameters() {
        if (this.record && this.record.ID) {
            this.isLoadingParameters = true;
            try {
                const rv = new RunView();
                const results = await rv.RunView<QueryParameterEntity>({
                    EntityName: 'Query Parameters',
                    ExtraFilter: `QueryID='${this.record.ID}'`,
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                });
                
                this.queryParameters = results.Results || [];
            } catch (error) {
                console.error('Error loading query parameters:', error);
            } finally {
                this.isLoadingParameters = false;
            }
        }
    }

    async loadCategories() {
        try {
            const rv = new RunView();
            const results = await rv.RunView({
                EntityName: 'Query Categories'
            });
            
            this.categoryOptions = [
                { text: 'Select Category...', value: '' },
                ...results.Results.map((cat: any) => ({
                    text: cat.Name,
                    value: cat.ID
                }))
            ];
        } catch (error) {
            console.error('Error loading categories:', error);
            this.categoryOptions = [{ text: 'Select Category...', value: '' }];
        }
    }

    async onCategoryChange(value: string) {
        // If it's a new category (string but not in existing options)
        if (value && !this.categoryOptions.find(opt => opt.value === value)) {
            // Check for duplicate category names (case-insensitive, trimmed)
            if (this.isDuplicateCategory(value)) {
                const existingCategory = this.categoryOptions.find(option => 
                    option.text && option.text.trim().toLowerCase() === value.trim().toLowerCase()
                );
                if (existingCategory) {
                    // Use the existing category instead
                    this.record.CategoryID = existingCategory.value;
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Category "${existingCategory.text}" already exists. Using existing category.`, 
                        'warning'
                    );
                }
                return;
            }

            try {
                // Create new category with trimmed name
                const md = new Metadata();
                const newCategory = await md.GetEntityObject<QueryCategoryEntity>('Query Categories');
                newCategory.Name = value.trim();
                const saved = await newCategory.Save();
                
                if (saved) {
                    // Add to options and set the ID
                    this.categoryOptions.push({
                        text: newCategory.Name,
                        value: newCategory.ID
                    });
                    this.record.CategoryID = newCategory.ID;
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `New category "${newCategory.Name}" created successfully.`, 
                        'success'
                    );
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Failed to create new category. ${newCategory.LatestResult?.Message || ''}`, 
                        'error'
                    );
                }
            } catch (error) {
                console.error('Error creating new category:', error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Error creating new category. Please try again.', 
                    'error'
                );
            }
        }
    }

    private isDuplicateCategory(categoryName: string): boolean {
        const normalizedName = categoryName.trim().toLowerCase();
        return this.categoryOptions.some(option => 
            option.text && option.text.trim().toLowerCase() === normalizedName
        );
    }

    onSQLChange(value: string | Event) {
        if (this.isUpdatingEditorValue) {
            return;
        }
        
        if (this.record) {
            // Handle both string and event types
            const sqlValue = typeof value === 'string' ? value : (value as any)?.target?.value || '';
            this.record.SQL = sqlValue;
            this.updateUnsavedChangesFlag();
        }
    }

    /**
     * Updates the hasUnsavedChanges flag based on entity dirty states
     */
    private updateUnsavedChangesFlag() {
        this.hasUnsavedChanges = this.queryParameters.some(param => param.Dirty) || 
                                this.record?.Dirty || false;
    }

    toggleFiltersHelp() {
        this.showFiltersHelp = !this.showFiltersHelp;
    }

    /**
     * Run the query with parameter dialog
     */
    async runQuery() {
        if (!this.record?.IsSaved) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the query before running it.', 
                'warning'
            );
            return;
        }

        // Save any unsaved changes first
        if (this.hasUnsavedChanges) {
            const saveResult = await this.SaveRecord(false); // Don't exit edit mode
            if (!saveResult) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to save query changes.', 
                    'error'
                );
                return;
            }
        }

        // Reload parameters in case they were updated
        await this.loadQueryParameters();

        // Show the run dialog
        this.showRunDialog = true;
    }

    /**
     * Handle run dialog close
     */
    onRunDialogClose() {
        this.showRunDialog = false;
    }

    async SaveRecord(StopEditModeAfterSave: boolean = true): Promise<boolean> {
        // Handle category creation before saving query
        if (this.record.CategoryID && !this.categoryOptions.find(opt => opt.value === this.record.CategoryID)) {
            if (this.isDuplicateCategory(this.record.CategoryID)) {
                const existingCategory = this.categoryOptions.find(option => 
                    option.text && option.text.trim().toLowerCase() === this.record.CategoryID?.trim().toLowerCase()
                );
                if (existingCategory) {
                    this.record.CategoryID = existingCategory.value;
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Category "${existingCategory.text}" already exists. Using existing category.`, 
                        'warning'
                    );
                }
            } else {
                try {
                    const md = new Metadata();
                    const newCategory = await md.GetEntityObject<QueryCategoryEntity>('Query Categories');
                    newCategory.Name = this.record.CategoryID.trim();
                    const saved = await newCategory.Save();
                    
                    if (saved) {
                        this.categoryOptions.push({
                            text: newCategory.Name,
                            value: newCategory.ID
                        });
                        this.record.CategoryID = newCategory.ID;
                    } else {
                        console.error('Failed to create new category');
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to create new category. ${newCategory.LatestResult?.Message || ''}`, 
                            'error'
                        );
                        return false;
                    }
                } catch (error) {
                    console.error('Error creating new category during save:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error creating new category during save. Please try again.', 
                        'error'
                    );
                    return false;
                }
            }
        }

        // Call the parent save method
        const result = await super.SaveRecord(StopEditModeAfterSave);
        
        if (result) {
            this.updateUnsavedChangesFlag();
        }
        
        return result;
    }

    getStatusBadgeColor(): string {
        switch (this.record?.Status) {
            case 'Approved':
                return '#28a745';
            case 'Pending':
                return '#ffc107';
            case 'Rejected':
                return '#dc3545';
            default:
                return '#6c757d';
        }
    }
}

export function LoadQueryFormExtendedComponent() {
    // prevents tree shaking
}