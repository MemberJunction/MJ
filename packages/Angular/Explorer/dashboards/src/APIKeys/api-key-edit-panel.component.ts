import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { APIKeyEntity, APIScopeEntity, APIKeyScopeEntity, APIKeyUsageLogEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLEncryptionClient } from '@memberjunction/graphql-dataprovider';
import { APIKeysEngineBase, parseAPIScopeUIConfig } from '@memberjunction/api-keys-base';

/** Tree shaking prevention function */
export function LoadAPIKeyEditPanel(): void {
    // This function prevents tree shaking
}

/** Scope with selection state */
interface ScopeItem {
    scope: APIScopeEntity;
    selected: boolean;
    originallySelected: boolean;
}

/** Grouped scopes by category */
interface ScopeCategory {
    name: string;
    icon: string;
    color: string;
    scopes: ScopeItem[];
    expanded: boolean;
    allSelected: boolean;
}

/** Usage log display item */
interface UsageLogItem {
    timestamp: Date;
    endpoint: string;
    method: string;
    statusCode: number;
    responseTime: number;
    ipAddress: string;
}

/**
 * Panel for viewing and editing existing API keys
 */
@Component({
  standalone: false,
    selector: 'mj-api-key-edit-panel',
    templateUrl: './api-key-edit-panel.component.html',
    styleUrls: ['./api-key-edit-panel.component.css']
})
export class APIKeyEditPanelComponent implements OnChanges {
    @Input() Visible = false;
    @Input() KeyId: string | null = null;
    @Output() VisibleChange = new EventEmitter<boolean>();
    @Output() Updated = new EventEmitter<APIKeyEntity>();
    @Output() Revoked = new EventEmitter<APIKeyEntity>();
    @Output() Closed = new EventEmitter<void>();

    private md = new Metadata();

    // Current key
    public APIKey: APIKeyEntity | null = null;
    public IsLoading = true;
    public IsSaving = false;
    public IsRevoking = false;

    // Edit mode
    public IsEditing = false;
    public EditLabel = '';
    public EditDescription = '';
    public EditExpiresAt: Date | null = null;

    // Scopes
    public ScopeCategories: ScopeCategory[] = [];
    public IsLoadingScopes = true;
    public HasScopeChanges = false;

    // Usage logs
    public UsageLogs: UsageLogItem[] = [];
    public IsLoadingLogs = true;

    // Tabs
    public ActiveTab: 'details' | 'scopes' | 'usage' = 'details';

    // Revoke confirmation
    public ShowRevokeConfirm = false;
    public RevokeConfirmText = '';

    // Messages
    public SuccessMessage = '';
    public ErrorMessage = '';

    // Default UI config for categories without explicit configuration
    private readonly defaultUIConfig = {
        icon: 'fa-solid fa-ellipsis',
        color: '#6b7280'
    };

    async ngOnChanges(changes: SimpleChanges): Promise<void> {
        if (changes['KeyId'] && this.KeyId) {
            await this.loadKey();
        }
    }

    /**
     * Handle escape key to close panel
     */
    @HostListener('document:keydown.escape')
    public onEscapeKey(): void {
        if (this.Visible && !this.IsSaving && !this.IsRevoking) {
            this.close();
        }
    }

    /**
     * Load the API key and related data
     */
    private async loadKey(): Promise<void> {
        this.IsLoading = true;
        this.resetState();

        try {
            const key = await this.md.GetEntityObject<APIKeyEntity>('MJ: API Keys');
            if (await key.Load(this.KeyId!)) {
                this.APIKey = key;
                this.EditLabel = key.Label;
                this.EditDescription = key.Description || '';
                this.EditExpiresAt = key.ExpiresAt;

                // Load scopes and usage in parallel
                await Promise.all([
                    this.loadScopes(),
                    this.loadUsageLogs()
                ]);
            }
        } catch (error) {
            console.error('Error loading API key:', error);
            this.ErrorMessage = 'Failed to load API key details';
        } finally {
            this.IsLoading = false;
        }
    }

    /**
     * Load all scopes and mark assigned ones
     */
    private async loadScopes(): Promise<void> {
        this.IsLoadingScopes = true;
        try {
            const rv = new RunView();
            const base = APIKeysEngineBase.Instance;

            // Get all scopes from cache, load assigned scopes from DB
            const allScopes = base.Scopes;
            const assignedScopesResult = await rv.RunView<APIKeyScopeEntity>({
                EntityName: 'MJ: API Key Scopes',
                ExtraFilter: `APIKeyID='${this.KeyId}'`,
                ResultType: 'entity_object'
            });

            if (assignedScopesResult.Success) {
                const assignedScopeIds = new Set(
                    assignedScopesResult.Results.map(ks => ks.ScopeID)
                );

                // Build category UI config from root scopes
                const categoryUIConfigs = new Map<string, { icon: string; color: string }>();
                for (const scope of allScopes) {
                    if (!scope.ParentID) {
                        const uiConfig = parseAPIScopeUIConfig(scope);
                        categoryUIConfigs.set(scope.Category, {
                            icon: uiConfig.icon || this.defaultUIConfig.icon,
                            color: uiConfig.color || this.defaultUIConfig.color
                        });
                    }
                }

                const categoryMap = new Map<string, ScopeItem[]>();

                for (const scope of allScopes) {
                    const category = scope.Category || 'Other';
                    if (!categoryMap.has(category)) {
                        categoryMap.set(category, []);
                    }
                    const isSelected = assignedScopeIds.has(scope.ID);
                    categoryMap.get(category)!.push({
                        scope,
                        selected: isSelected,
                        originallySelected: isSelected
                    });
                }

                this.ScopeCategories = Array.from(categoryMap.entries()).map(([name, scopes]) => {
                    const config = categoryUIConfigs.get(name) || this.defaultUIConfig;
                    return {
                        name,
                        icon: config.icon,
                        color: config.color,
                        scopes: scopes.sort((a, b) => a.scope.Name.localeCompare(b.scope.Name)),
                        expanded: scopes.some(s => s.selected),
                        allSelected: scopes.length > 0 && scopes.every(s => s.selected)
                    };
                }).sort((a, b) => a.name.localeCompare(b.name));
            }
        } catch (error) {
            console.error('Error loading scopes:', error);
        } finally {
            this.IsLoadingScopes = false;
        }
    }

    /**
     * Load usage logs for this key
     */
    private async loadUsageLogs(): Promise<void> {
        this.IsLoadingLogs = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<APIKeyUsageLogEntity>({
                EntityName: 'MJ: API Key Usage Logs',
                ExtraFilter: `APIKeyID='${this.KeyId}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 100,
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.UsageLogs = result.Results.map(log => ({
                    timestamp: log.__mj_CreatedAt,
                    endpoint: log.Endpoint || '/unknown',
                    method: log.Method || 'GET',
                    statusCode: log.StatusCode || 200,
                    responseTime: log.ResponseTimeMs || 0,
                    ipAddress: log.IPAddress || 'Unknown'
                }));
            }
        } catch (error) {
            console.error('Error loading usage logs:', error);
        } finally {
            this.IsLoadingLogs = false;
        }
    }

    /**
     * Reset component state
     */
    private resetState(): void {
        this.IsEditing = false;
        this.ShowRevokeConfirm = false;
        this.RevokeConfirmText = '';
        this.SuccessMessage = '';
        this.ErrorMessage = '';
        this.HasScopeChanges = false;
        this.ActiveTab = 'details';
    }

    /**
     * Toggle edit mode
     */
    public toggleEdit(): void {
        if (this.IsEditing) {
            // Cancel edit
            this.EditLabel = this.APIKey!.Label;
            this.EditDescription = this.APIKey!.Description || '';
            this.EditExpiresAt = this.APIKey!.ExpiresAt;
        }
        this.IsEditing = !this.IsEditing;
    }

    /**
     * Save changes to the key
     */
    public async saveChanges(): Promise<void> {
        if (!this.APIKey) return;

        this.IsSaving = true;
        this.ErrorMessage = '';

        try {
            this.APIKey.Label = this.EditLabel.trim();
            this.APIKey.Description = this.EditDescription.trim() || null;
            this.APIKey.ExpiresAt = this.EditExpiresAt;

            const result = await this.APIKey.Save();
            if (result) {
                this.IsEditing = false;
                this.SuccessMessage = 'API key updated successfully';
                this.Updated.emit(this.APIKey);
                setTimeout(() => this.SuccessMessage = '', 3000);
            } else {
                this.ErrorMessage = 'Failed to save changes';
            }
        } catch (error) {
            console.error('Error saving key:', error);
            this.ErrorMessage = 'An error occurred while saving';
        } finally {
            this.IsSaving = false;
        }
    }

    /**
     * Save scope changes
     */
    public async saveScopeChanges(): Promise<void> {
        if (!this.APIKey) return;

        this.IsSaving = true;
        this.ErrorMessage = '';

        try {
            const allScopes = this.ScopeCategories.flatMap(cat => cat.scopes);

            // Find scopes to add and remove
            const toAdd = allScopes.filter(s => s.selected && !s.originallySelected);
            const toRemove = allScopes.filter(s => !s.selected && s.originallySelected);

            // Add new scope assignments
            for (const item of toAdd) {
                const keyScope = await this.md.GetEntityObject<APIKeyScopeEntity>('MJ: API Key Scopes');
                keyScope.NewRecord();
                keyScope.APIKeyID = this.APIKey.ID;
                keyScope.ScopeID = item.scope.ID;
                await keyScope.Save();
                item.originallySelected = true;
            }

            // Remove scope assignments
            const rv = new RunView();
            for (const item of toRemove) {
                const result = await rv.RunView<APIKeyScopeEntity>({
                    EntityName: 'MJ: API Key Scopes',
                    ExtraFilter: `APIKeyID='${this.APIKey.ID}' AND ScopeID='${item.scope.ID}'`,
                    ResultType: 'entity_object'
                });
                if (result.Success && result.Results.length > 0) {
                    await result.Results[0].Delete();
                }
                item.originallySelected = false;
            }

            this.HasScopeChanges = false;
            this.SuccessMessage = 'Permissions updated successfully';
            setTimeout(() => this.SuccessMessage = '', 3000);
        } catch (error) {
            console.error('Error saving scopes:', error);
            this.ErrorMessage = 'Failed to update permissions';
        } finally {
            this.IsSaving = false;
        }
    }

    /**
     * Check for scope changes and update category allSelected states
     */
    public onScopeChange(): void {
        // Update allSelected state for each category
        for (const category of this.ScopeCategories) {
            category.allSelected = category.scopes.length > 0 && category.scopes.every(s => s.selected);
        }

        // Track overall changes
        const allScopes = this.ScopeCategories.flatMap(cat => cat.scopes);
        this.HasScopeChanges = allScopes.some(s => s.selected !== s.originallySelected);
    }

    /**
     * Toggle category expansion
     */
    public toggleCategory(category: ScopeCategory): void {
        category.expanded = !category.expanded;
    }

    /**
     * Toggle all scopes in a category on/off
     */
    public toggleCategoryAll(category: ScopeCategory): void {
        // Toggle to opposite of current allSelected state
        const newState = !category.allSelected;
        category.allSelected = newState;

        // Apply to all scopes in category
        for (const item of category.scopes) {
            item.selected = newState;
        }

        // Update change tracking
        this.onScopeChange();
    }

    /**
     * Start revoke flow
     */
    public startRevoke(): void {
        this.ShowRevokeConfirm = true;
        this.RevokeConfirmText = '';
    }

    /**
     * Cancel revoke
     */
    public cancelRevoke(): void {
        this.ShowRevokeConfirm = false;
        this.RevokeConfirmText = '';
    }

    /**
     * Confirm and execute revoke using GraphQL client
     */
    public async confirmRevoke(): Promise<void> {
        if (!this.APIKey || this.RevokeConfirmText !== 'REVOKE') return;

        this.IsRevoking = true;
        this.ErrorMessage = '';

        try {
            const provider = Metadata.Provider as GraphQLDataProvider;
            const encryptionClient = new GraphQLEncryptionClient(provider);

            const result = await encryptionClient.RevokeAPIKey(this.APIKey.ID);

            if (result.Success) {
                // Update local state to reflect the change
                this.APIKey.Status = 'Revoked';
                this.ShowRevokeConfirm = false;
                this.SuccessMessage = 'API key has been revoked';
                this.Revoked.emit(this.APIKey);
            } else {
                this.ErrorMessage = result.Error || 'Failed to revoke key';
            }
        } catch (error) {
            console.error('Error revoking key:', error);
            this.ErrorMessage = 'An error occurred while revoking';
        } finally {
            this.IsRevoking = false;
        }
    }

    /**
     * Format date for display
     */
    public formatDate(date: Date | null): string {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Format relative time
     */
    public formatRelativeTime(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        return new Date(date).toLocaleDateString();
    }

    /**
     * Get status class for HTTP status code
     */
    public getStatusClass(statusCode: number): string {
        if (statusCode >= 200 && statusCode < 300) return 'status-success';
        if (statusCode >= 400 && statusCode < 500) return 'status-warning';
        if (statusCode >= 500) return 'status-error';
        return '';
    }

    /**
     * Get assigned scope count
     */
    public getAssignedScopeCount(): number {
        return this.ScopeCategories.reduce((sum, cat) =>
            sum + cat.scopes.filter(s => s.selected).length, 0);
    }

    /**
     * Get selected scope count for a category (for template use)
     */
    public getSelectedCount(category: ScopeCategory): number {
        return category.scopes.filter(s => s.selected).length;
    }

    /**
     * Get minimum date for expiration (tomorrow)
     */
    public getMinDate(): Date {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    }

    /**
     * Close the panel
     */
    public close(): void {
        this.Visible = false;
        this.VisibleChange.emit(false);
        this.Closed.emit();
    }
}
