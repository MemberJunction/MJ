import { Component, OnInit, EventEmitter, Output, ChangeDetectorRef } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { APIApplicationEntity, APIApplicationScopeEntity, APIScopeEntity } from '@memberjunction/core-entities';

/** Tree shaking prevention function */
export function LoadAPIApplicationsPanel(): void {
    // This function prevents tree shaking
}

/** Application with scope count */
interface ApplicationWithScopes {
    application: APIApplicationEntity;
    scopeCount: number;
    expanded: boolean;
    scopes: APIApplicationScopeEntity[];
}

/** Scope with selection state for application assignment */
interface ScopeSelection {
    scope: APIScopeEntity;
    selected: boolean;
    pattern: string;
    patternType: 'Include' | 'Exclude';
    isDeny: boolean;
    priority: number;
}

/**
 * API Applications Panel Component
 * Manages API Applications and their scope assignments
 */
@Component({
    selector: 'mj-api-applications-panel',
    templateUrl: './api-applications-panel.component.html',
    styleUrls: ['./api-applications-panel.component.css']
})
export class APIApplicationsPanelComponent implements OnInit {
    @Output() ApplicationUpdated = new EventEmitter<void>();

    private md = new Metadata();
    private cdr: ChangeDetectorRef;

    // Loading states
    public IsLoading = true;
    public IsSaving = false;

    // Data
    public Applications: ApplicationWithScopes[] = [];
    public AllScopes: APIScopeEntity[] = [];

    // Edit state
    public EditingApplication: APIApplicationEntity | null = null;
    public EditName = '';
    public EditDescription = '';
    public EditIsActive = true;
    public ScopeSelections: ScopeSelection[] = [];

    // Dialog states
    public ShowCreateDialog = false;
    public ShowEditDialog = false;
    public ShowScopesDialog = false;
    public SelectedApplication: ApplicationWithScopes | null = null;

    // Messages
    public SuccessMessage = '';
    public ErrorMessage = '';

    constructor(cdr: ChangeDetectorRef) {
        this.cdr = cdr;
    }

    async ngOnInit(): Promise<void> {
        await this.loadData();
    }

    /**
     * Load all applications and scopes
     */
    public async loadData(): Promise<void> {
        this.IsLoading = true;
        try {
            const rv = new RunView();
            const [appsResult, scopesResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: API Applications',
                    OrderBy: 'Name',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: API Scopes',
                    OrderBy: 'FullPath',
                    ResultType: 'entity_object'
                }
            ]);

            if (appsResult.Success) {
                const apps = appsResult.Results as APIApplicationEntity[];
                this.AllScopes = (scopesResult.Success ? scopesResult.Results : []) as APIScopeEntity[];

                // Load scope assignments for each application
                const appPromises = apps.map(async (app) => {
                    const scopeResult = await rv.RunView<APIApplicationScopeEntity>({
                        EntityName: 'MJ: API Application Scopes',
                        ExtraFilter: `ApplicationID='${app.ID}'`,
                        ResultType: 'entity_object'
                    });
                    return {
                        application: app,
                        scopeCount: scopeResult.Success ? scopeResult.Results.length : 0,
                        expanded: false,
                        scopes: scopeResult.Success ? scopeResult.Results : []
                    };
                });

                this.Applications = await Promise.all(appPromises);
            }
        } catch (error) {
            console.error('Error loading applications:', error);
            this.ErrorMessage = 'Failed to load applications';
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Open create dialog
     */
    public openCreateDialog(): void {
        this.EditName = '';
        this.EditDescription = '';
        this.EditIsActive = true;
        this.EditingApplication = null;
        this.ShowCreateDialog = true;
    }

    /**
     * Open edit dialog
     */
    public openEditDialog(appItem: ApplicationWithScopes): void {
        this.EditingApplication = appItem.application;
        this.EditName = appItem.application.Name;
        this.EditDescription = appItem.application.Description || '';
        this.EditIsActive = appItem.application.IsActive;
        this.ShowEditDialog = true;
    }

    /**
     * Save application (create or update)
     */
    public async saveApplication(): Promise<void> {
        this.IsSaving = true;
        this.ErrorMessage = '';

        try {
            let app: APIApplicationEntity;

            if (this.EditingApplication) {
                app = this.EditingApplication;
            } else {
                app = await this.md.GetEntityObject<APIApplicationEntity>('MJ: API Applications');
                app.NewRecord();
            }

            app.Name = this.EditName.trim();
            app.Description = this.EditDescription.trim() || null;
            app.IsActive = this.EditIsActive;

            const result = await app.Save();
            if (result) {
                this.SuccessMessage = this.EditingApplication
                    ? 'Application updated successfully'
                    : 'Application created successfully';
                this.closeDialogs();
                await this.loadData();
                this.ApplicationUpdated.emit();
                setTimeout(() => this.SuccessMessage = '', 3000);
            } else {
                this.ErrorMessage = 'Failed to save application';
            }
        } catch (error) {
            console.error('Error saving application:', error);
            this.ErrorMessage = 'An error occurred while saving';
        } finally {
            this.IsSaving = false;
        }
    }

    /**
     * Open scopes dialog for an application
     */
    public openScopesDialog(appItem: ApplicationWithScopes): void {
        this.SelectedApplication = appItem;
        const assignedScopeIds = new Map(
            appItem.scopes.map(s => [s.ScopeID, s])
        );

        this.ScopeSelections = this.AllScopes.map(scope => {
            const assigned = assignedScopeIds.get(scope.ID);
            return {
                scope,
                selected: !!assigned,
                pattern: assigned?.ResourcePattern || '*',
                patternType: (assigned?.PatternType || 'Include') as 'Include' | 'Exclude',
                isDeny: assigned?.IsDeny || false,
                priority: assigned?.Priority || 0
            };
        });

        this.ShowScopesDialog = true;
    }

    /**
     * Save scope assignments
     */
    public async saveScopeAssignments(): Promise<void> {
        if (!this.SelectedApplication) return;

        this.IsSaving = true;
        this.ErrorMessage = '';

        try {
            const appId = this.SelectedApplication.application.ID;
            const existingScopes = new Map(
                this.SelectedApplication.scopes.map(s => [s.ScopeID, s])
            );

            for (const selection of this.ScopeSelections) {
                const existing = existingScopes.get(selection.scope.ID);

                if (selection.selected && !existing) {
                    // Create new assignment
                    const appScope = await this.md.GetEntityObject<APIApplicationScopeEntity>('MJ: API Application Scopes');
                    appScope.NewRecord();
                    appScope.ApplicationID = appId;
                    appScope.ScopeID = selection.scope.ID;
                    appScope.ResourcePattern = selection.pattern;
                    appScope.PatternType = selection.patternType;
                    appScope.IsDeny = selection.isDeny;
                    appScope.Priority = selection.priority;
                    await appScope.Save();
                } else if (selection.selected && existing) {
                    // Update existing
                    if (existing.ResourcePattern !== selection.pattern ||
                        existing.PatternType !== selection.patternType ||
                        existing.IsDeny !== selection.isDeny ||
                        existing.Priority !== selection.priority) {
                        existing.ResourcePattern = selection.pattern;
                        existing.PatternType = selection.patternType;
                        existing.IsDeny = selection.isDeny;
                        existing.Priority = selection.priority;
                        await existing.Save();
                    }
                } else if (!selection.selected && existing) {
                    // Delete assignment
                    await existing.Delete();
                }
            }

            this.SuccessMessage = 'Scope assignments saved successfully';
            this.closeDialogs();
            await this.loadData();
            this.ApplicationUpdated.emit();
            setTimeout(() => this.SuccessMessage = '', 3000);
        } catch (error) {
            console.error('Error saving scope assignments:', error);
            this.ErrorMessage = 'Failed to save scope assignments';
        } finally {
            this.IsSaving = false;
        }
    }

    /**
     * Toggle application expansion
     */
    public toggleExpanded(appItem: ApplicationWithScopes): void {
        appItem.expanded = !appItem.expanded;
    }

    /**
     * Close all dialogs
     */
    public closeDialogs(): void {
        this.ShowCreateDialog = false;
        this.ShowEditDialog = false;
        this.ShowScopesDialog = false;
        this.EditingApplication = null;
        this.SelectedApplication = null;
        this.ScopeSelections = [];
    }

    /**
     * Get icon for pattern type
     */
    public getPatternIcon(patternType: string, isDeny: boolean): string {
        if (isDeny) return 'fa-solid fa-ban';
        return patternType === 'Include' ? 'fa-solid fa-check' : 'fa-solid fa-minus';
    }

    /**
     * Get class for pattern type
     */
    public getPatternClass(patternType: string, isDeny: boolean): string {
        if (isDeny) return 'pattern-deny';
        return patternType === 'Include' ? 'pattern-include' : 'pattern-exclude';
    }

    /**
     * Get scope name by ID
     */
    public getScopeName(scopeId: string): string {
        const scope = this.AllScopes.find(s => s.ID === scopeId);
        return scope?.FullPath || scope?.Name || 'Unknown';
    }
}
