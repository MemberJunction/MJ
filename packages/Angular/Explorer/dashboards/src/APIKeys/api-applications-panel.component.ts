import { Component, OnInit, OnDestroy, EventEmitter, Output, ChangeDetectorRef, HostListener } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { MJAPIApplicationEntity, MJAPIApplicationScopeEntity, MJAPIScopeEntity, MJUserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { APIKeysEngineBase, parseAPIScopeUIConfig } from '@memberjunction/api-keys-base';

const PANEL_WIDTH_SETTING_KEY = 'APIKeys.ApplicationsPanelWidth';
const DEFAULT_PANEL_WIDTH = 570;
const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_WIDTH = 800;
/** Application with scope count */
interface ApplicationWithScopes {
    application: MJAPIApplicationEntity;
    scopeCount: number;
    expanded: boolean;
    scopes: MJAPIApplicationScopeEntity[];
}

/** Scope with selection state for application assignment */
interface ScopeSelection {
    scope: MJAPIScopeEntity;
    selected: boolean;
    pattern: string;
    patternType: 'Include' | 'Exclude';
    isDeny: boolean;
    priority: number;
    displayName: string;  // Computed display name
}

/** Scope category for grouping */
interface ScopeCategory {
    name: string;
    icon: string;
    color: string;
    scopes: ScopeSelection[];
    expanded: boolean;
    allSelected: boolean;
}

/**
 * API Applications Panel Component
 * Manages API Applications and their scope assignments
 */
@Component({
  standalone: false,
    selector: 'mj-api-applications-panel',
    templateUrl: './api-applications-panel.component.html',
    styleUrls: ['./api-applications-panel.component.css']
})
export class APIApplicationsPanelComponent implements OnInit, OnDestroy {
    @Output() ApplicationUpdated = new EventEmitter<void>();

    private md = new Metadata();
    private cdr: ChangeDetectorRef;

    // Loading states
    public IsLoading = true;
    public IsSaving = false;

    // Data
    public Applications: ApplicationWithScopes[] = [];
    public AllScopes: MJAPIScopeEntity[] = [];

    // Edit state
    public EditingApplication: MJAPIApplicationEntity | null = null;
    public EditName = '';
    public EditDescription = '';
    public EditIsActive = true;
    public ScopeSelections: ScopeSelection[] = [];

    // Panel states (slide-out panels)
    public ShowCreatePanel = false;
    public ShowEditPanel = false;
    public SelectedApplication: ApplicationWithScopes | null = null;
    public EditTab: 'details' | 'scopes' = 'details';

    // Panel width and resizing
    public PanelWidth = DEFAULT_PANEL_WIDTH;
    public IsResizing = false;
    private resizeStartX = 0;
    private resizeStartWidth = 0;
    private widthSaveTimeout: ReturnType<typeof setTimeout> | null = null;

    // Track dirty state for unified save
    private DetailsChanged = false;
    private ScopesChanged = false;

    // Scope categories for display
    public ScopeCategories: ScopeCategory[] = [];

    // Messages
    public SuccessMessage = '';
    public ErrorMessage = '';

    // Default UI config for categories without explicit configuration
    private readonly defaultUIConfig = {
        icon: 'fa-solid fa-ellipsis',
        color: '#6b7280'
    };

    constructor(cdr: ChangeDetectorRef) {
        this.cdr = cdr;
    }

    async ngOnInit(): Promise<void> {
        await this.loadPanelWidth();
        this.loadData();
    }

    ngOnDestroy(): void {
        if (this.widthSaveTimeout) {
            clearTimeout(this.widthSaveTimeout);
        }
    }

    /**
     * Handle mouse move during resize
     */
    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent): void {
        if (!this.IsResizing) return;

        event.preventDefault();
        const deltaX = this.resizeStartX - event.clientX;
        const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, this.resizeStartWidth + deltaX));
        this.PanelWidth = newWidth;
        this.cdr.markForCheck();
    }

    /**
     * Handle mouse up to stop resize
     */
    @HostListener('document:mouseup')
    onMouseUp(): void {
        if (this.IsResizing) {
            this.IsResizing = false;
            this.debouncedSavePanelWidth();
            this.cdr.markForCheck();
        }
    }

    /**
     * Start resizing the panel
     */
    public startResize(event: MouseEvent): void {
        event.preventDefault();
        this.IsResizing = true;
        this.resizeStartX = event.clientX;
        this.resizeStartWidth = this.PanelWidth;
    }

    /**
     * Load saved panel width from user settings
     */
    private async loadPanelWidth(): Promise<void> {
        try {
            const engine = UserInfoEngine.Instance;
            const setting = engine.UserSettings.find(s => s.Setting === PANEL_WIDTH_SETTING_KEY);
            if (setting?.Value) {
                const width = parseInt(setting.Value, 10);
                if (!isNaN(width) && width >= MIN_PANEL_WIDTH && width <= MAX_PANEL_WIDTH) {
                    this.PanelWidth = width;
                }
            }
        } catch (error) {
            console.warn('Failed to load panel width setting:', error);
        }
    }

    /**
     * Debounced save of panel width
     */
    private debouncedSavePanelWidth(): void {
        if (this.widthSaveTimeout) {
            clearTimeout(this.widthSaveTimeout);
        }
        this.widthSaveTimeout = setTimeout(() => {
            this.savePanelWidth();
        }, 500);
    }

    /**
     * Save panel width to user settings
     */
    private async savePanelWidth(): Promise<void> {
        try {
            const userId = this.md.CurrentUser?.ID;
            if (!userId) return;

            const engine = UserInfoEngine.Instance;
            let setting = engine.UserSettings.find(s => s.Setting === PANEL_WIDTH_SETTING_KEY);

            if (!setting) {
                setting = await this.md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
                setting.UserID = userId;
                setting.Setting = PANEL_WIDTH_SETTING_KEY;
            }

            setting.Value = this.PanelWidth.toString();
            await setting.Save();
        } catch (error) {
            console.warn('Failed to save panel width setting:', error);
        }
    }

    /**
     * Load all applications and scopes
     * Uses cached data from APIKeysEngineBase for better performance
     */
    public loadData(): void {
        this.IsLoading = true;
        try {
            const base = APIKeysEngineBase.Instance;

            // Get cached applications and scopes
            const apps = base.Applications;
            this.AllScopes = base.Scopes;

            // Build application list with scope assignments from cache
            this.Applications = apps
                .sort((a, b) => a.Name.localeCompare(b.Name))
                .map(app => {
                    const scopes = base.GetApplicationScopesByApplicationId(app.ID);
                    return {
                        application: app,
                        scopeCount: scopes.length,
                        expanded: false,
                        scopes
                    };
                });
        } catch (error) {
            console.error('Error loading applications:', error);
            this.ErrorMessage = 'Failed to load applications';
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Open create panel (slide-out)
     */
    public openCreatePanel(): void {
        this.EditName = '';
        this.EditDescription = '';
        this.EditIsActive = true;
        this.EditingApplication = null;
        this.DetailsChanged = false;
        this.ScopesChanged = false;
        this.ShowCreatePanel = true;
    }

    /**
     * Save application (create only - for create panel)
     */
    public async saveApplication(): Promise<void> {
        this.IsSaving = true;
        this.ErrorMessage = '';

        try {
            const app = await this.md.GetEntityObject<MJAPIApplicationEntity>('MJ: API Applications');
            app.NewRecord();

            app.Name = this.EditName.trim();
            app.Description = this.EditDescription.trim() || null;
            app.IsActive = this.EditIsActive;

            const result = await app.Save();
            if (result) {
                this.SuccessMessage = 'Application created successfully';
                this.closePanel();
                // Refresh the cache before reloading display
                await APIKeysEngineBase.Instance.Config(true);
                this.loadData();
                this.ApplicationUpdated.emit();
                setTimeout(() => this.SuccessMessage = '', 3000);
            } else {
                this.ErrorMessage = 'Failed to create application';
            }
        } catch (error) {
            console.error('Error creating application:', error);
            this.ErrorMessage = 'An error occurred while creating';
        } finally {
            this.IsSaving = false;
        }
    }

    /**
     * Open edit panel (slide-out) with optional direct-to-scopes tab
     */
    public openEditPanel(appItem: ApplicationWithScopes, goToScopes = false): void {
        this.EditingApplication = appItem.application;
        this.SelectedApplication = appItem;
        this.EditName = appItem.application.Name;
        this.EditDescription = appItem.application.Description || '';
        this.EditIsActive = appItem.application.IsActive;
        this.EditTab = goToScopes ? 'scopes' : 'details';
        this.DetailsChanged = false;
        this.ScopesChanged = false;
        this.buildScopeCategories(appItem);
        this.ShowEditPanel = true;
    }

    /**
     * Build scope categories with proper display names.
     * Uses UIConfig from root scopes for category icons/colors.
     */
    private buildScopeCategories(appItem: ApplicationWithScopes): void {
        const assignedScopeIds = new Map(
            appItem.scopes.map(s => [s.ScopeID, s])
        );

        // Build a map for computing full paths
        const scopeMap = new Map<string, MJAPIScopeEntity>();
        for (const scope of this.AllScopes) {
            scopeMap.set(scope.ID, scope);
        }

        // Build a map of category -> root scope UIConfig
        // Root scopes (ParentID is null) define the UI appearance for their category
        const categoryUIConfigs = new Map<string, { icon: string; color: string }>();
        for (const scope of this.AllScopes) {
            if (!scope.ParentID) {
                const uiConfig = parseAPIScopeUIConfig(scope);
                categoryUIConfigs.set(scope.Category, {
                    icon: uiConfig.icon || this.defaultUIConfig.icon,
                    color: uiConfig.color || this.defaultUIConfig.color
                });
            }
        }

        // Compute display name for each scope
        const computeDisplayName = (scope: MJAPIScopeEntity): string => {
            // If FullPath is set and not empty, use it
            if (scope.FullPath && scope.FullPath.trim()) {
                return scope.FullPath;
            }
            // If Name is set, build the path by traversing parents
            if (scope.Name && scope.Name.trim()) {
                const parts: string[] = [scope.Name];
                let currentScope = scope;
                while (currentScope.ParentID) {
                    const parent = scopeMap.get(currentScope.ParentID);
                    if (parent && parent.Name) {
                        parts.unshift(parent.Name);
                        currentScope = parent;
                    } else {
                        break;
                    }
                }
                return parts.join(':');
            }
            return `Scope-${scope.ID.slice(0, 8)}`;
        };

        // Create scope selections with computed display names
        this.ScopeSelections = this.AllScopes
            .filter(scope => {
                // Filter out scopes with no name/path (shouldn't happen but be safe)
                const displayName = computeDisplayName(scope);
                return displayName && displayName.length > 0;
            })
            .map(scope => {
                const assigned = assignedScopeIds.get(scope.ID);
                return {
                    scope,
                    selected: !!assigned,
                    pattern: assigned?.ResourcePattern || '*',
                    patternType: (assigned?.PatternType || 'Include') as 'Include' | 'Exclude',
                    isDeny: assigned?.IsDeny || false,
                    priority: assigned?.Priority || 0,
                    displayName: computeDisplayName(scope)
                };
            });

        // Group by category
        const categoryMap = new Map<string, ScopeSelection[]>();
        for (const selection of this.ScopeSelections) {
            const category = selection.scope.Category || 'Other';
            if (!categoryMap.has(category)) {
                categoryMap.set(category, []);
            }
            categoryMap.get(category)!.push(selection);
        }

        // Build category objects - all collapsed by default
        this.ScopeCategories = Array.from(categoryMap.entries()).map(([name, scopes]) => {
            const config = categoryUIConfigs.get(name) || this.defaultUIConfig;
            const selectedCount = scopes.filter(s => s.selected).length;
            return {
                name,
                icon: config.icon,
                color: config.color,
                scopes: scopes.sort((a, b) => a.displayName.localeCompare(b.displayName)),
                expanded: false, // Always start collapsed - user can expand as needed
                allSelected: selectedCount === scopes.length && scopes.length > 0
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Toggle category expansion
     */
    public toggleScopeCategory(category: ScopeCategory): void {
        category.expanded = !category.expanded;
    }

    /**
     * Toggle all scopes in a category
     */
    public toggleCategoryAll(category: ScopeCategory): void {
        const newState = !category.allSelected;
        for (const scope of category.scopes) {
            scope.selected = newState;
        }
        category.allSelected = newState;
    }

    /**
     * Update category state when individual scope changes
     */
    public updateCategoryState(category: ScopeCategory): void {
        const selectedCount = category.scopes.filter(s => s.selected).length;
        category.allSelected = selectedCount === category.scopes.length && category.scopes.length > 0;
    }

    /**
     * Get total selected scope count
     */
    public getSelectedScopeCount(): number {
        return this.ScopeSelections.filter(s => s.selected).length;
    }

    /**
     * Get selected scope count for a category
     */
    public getCategorySelectedCount(category: ScopeCategory): number {
        return category.scopes.filter(s => s.selected).length;
    }

    /**
     * Save scope assignments (legacy - now handled by saveAll)
     */
    public async saveScopeAssignments(): Promise<void> {
        if (!this.SelectedApplication) return;

        this.IsSaving = true;
        this.ErrorMessage = '';

        try {
            await this.saveScopeAssignmentsInternal();

            this.SuccessMessage = 'Scope assignments saved successfully';
            this.closePanel();
            // Refresh the cache before reloading display
            await APIKeysEngineBase.Instance.Config(true);
            this.loadData();
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
     * Close all panels
     */
    public closePanel(): void {
        this.ShowCreatePanel = false;
        this.ShowEditPanel = false;
        this.EditingApplication = null;
        this.SelectedApplication = null;
        this.ScopeSelections = [];
        this.ScopeCategories = [];
        this.EditTab = 'details';
        this.DetailsChanged = false;
        this.ScopesChanged = false;
    }

    /**
     * Save all changes (both details and scopes)
     */
    public async saveAll(): Promise<void> {
        this.IsSaving = true;
        this.ErrorMessage = '';

        try {
            // Save application details
            if (this.EditingApplication) {
                this.EditingApplication.Name = this.EditName.trim();
                this.EditingApplication.Description = this.EditDescription.trim() || null;
                this.EditingApplication.IsActive = this.EditIsActive;

                const result = await this.EditingApplication.Save();
                if (!result) {
                    this.ErrorMessage = 'Failed to save application details';
                    return;
                }
            }

            // Save scope assignments
            if (this.SelectedApplication) {
                await this.saveScopeAssignmentsInternal();
            }

            this.SuccessMessage = 'Application saved successfully';
            this.closePanel();
            // Refresh the cache before reloading display
            await APIKeysEngineBase.Instance.Config(true);
            this.loadData();
            this.ApplicationUpdated.emit();
            setTimeout(() => this.SuccessMessage = '', 3000);
        } catch (error) {
            console.error('Error saving application:', error);
            this.ErrorMessage = 'An error occurred while saving';
        } finally {
            this.IsSaving = false;
        }
    }

    /**
     * Internal method to save scope assignments
     */
    private async saveScopeAssignmentsInternal(): Promise<void> {
        if (!this.SelectedApplication) return;

        const appId = this.SelectedApplication.application.ID;
        const existingScopes = new Map(
            this.SelectedApplication.scopes.map(s => [s.ScopeID, s])
        );

        for (const selection of this.ScopeSelections) {
            const existing = existingScopes.get(selection.scope.ID);

            if (selection.selected && !existing) {
                // Create new assignment
                const appScope = await this.md.GetEntityObject<MJAPIApplicationScopeEntity>('MJ: API Application Scopes');
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
