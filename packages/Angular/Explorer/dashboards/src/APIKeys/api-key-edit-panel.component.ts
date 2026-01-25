import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { APIKeyEntity, APIScopeEntity, APIKeyScopeEntity, APIKeyUsageLogEntity } from '@memberjunction/core-entities';

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

    // Category config
    private readonly categoryConfig: Record<string, { icon: string; color: string }> = {
        'Entities': { icon: 'fa-solid fa-database', color: '#6366f1' },
        'Agents': { icon: 'fa-solid fa-robot', color: '#10b981' },
        'Admin': { icon: 'fa-solid fa-shield-halved', color: '#f59e0b' },
        'Actions': { icon: 'fa-solid fa-bolt', color: '#8b5cf6' },
        'Queries': { icon: 'fa-solid fa-magnifying-glass', color: '#3b82f6' },
        'Reports': { icon: 'fa-solid fa-chart-bar', color: '#ef4444' },
        'Communication': { icon: 'fa-solid fa-envelope', color: '#ec4899' },
        'Other': { icon: 'fa-solid fa-ellipsis', color: '#6b7280' }
    };

    async ngOnChanges(changes: SimpleChanges): Promise<void> {
        if (changes['KeyId'] && this.KeyId) {
            await this.loadKey();
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

            // Load all scopes and assigned scopes in parallel
            const [allScopesResult, assignedScopesResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: API Scopes',
                    OrderBy: 'Category, Name',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: API Key Scopes',
                    ExtraFilter: `APIKeyID='${this.KeyId}'`,
                    ResultType: 'entity_object'
                }
            ]);

            if (allScopesResult.Success && assignedScopesResult.Success) {
                const assignedScopeIds = new Set(
                    (assignedScopesResult.Results as APIKeyScopeEntity[]).map(ks => ks.ScopeID)
                );

                const categoryMap = new Map<string, ScopeItem[]>();

                for (const scope of allScopesResult.Results as APIScopeEntity[]) {
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
                    const config = this.categoryConfig[name] || this.categoryConfig['Other'];
                    return {
                        name,
                        icon: config.icon,
                        color: config.color,
                        scopes,
                        expanded: scopes.some(s => s.selected)
                    };
                });
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
     * Check for scope changes
     */
    public onScopeChange(): void {
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
     * Confirm and execute revoke
     */
    public async confirmRevoke(): Promise<void> {
        if (!this.APIKey || this.RevokeConfirmText !== 'REVOKE') return;

        this.IsRevoking = true;
        this.ErrorMessage = '';

        try {
            this.APIKey.Status = 'Revoked';
            const result = await this.APIKey.Save();

            if (result) {
                this.ShowRevokeConfirm = false;
                this.SuccessMessage = 'API key has been revoked';
                this.Revoked.emit(this.APIKey);
            } else {
                this.ErrorMessage = 'Failed to revoke key';
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
