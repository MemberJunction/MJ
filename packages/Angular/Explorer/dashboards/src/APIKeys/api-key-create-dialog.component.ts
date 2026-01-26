import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { APIScopeEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLEncryptionClient } from '@memberjunction/graphql-dataprovider';

/** Scope selection item */
interface ScopeItem {
    scope: APIScopeEntity;
    selected: boolean;
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

/** Result of key creation */
export interface APIKeyCreateResult {
    success: boolean;
    apiKeyId?: string;
    rawKey?: string;
    error?: string;
}

/** Tree shaking prevention function */
export function LoadAPIKeyCreateDialog(): void {
    // This function prevents tree shaking
}

/**
 * Dialog for creating new API keys
 * Shows the raw key only once - it cannot be recovered after closing
 */
@Component({
    selector: 'mj-api-key-create-dialog',
    templateUrl: './api-key-create-dialog.component.html',
    styleUrls: ['./api-key-create-dialog.component.css']
})
export class APIKeyCreateDialogComponent implements OnInit {
    @Input() Visible = false;
    @Output() VisibleChange = new EventEmitter<boolean>();
    @Output() Created = new EventEmitter<APIKeyCreateResult>();
    @Output() Closed = new EventEmitter<void>();

    // Form fields
    public Label = '';
    public Description = '';
    public ExpiresAt: Date | null = null;
    public NeverExpires = true;

    // Expiration presets
    public ExpirationPresets = [
        { label: '30 days', days: 30 },
        { label: '90 days', days: 90 },
        { label: '1 year', days: 365 },
        { label: 'Custom', days: -1 }
    ];
    public SelectedPreset: { label: string; days: number } | null = null;

    // Scopes
    public ScopeCategories: ScopeCategory[] = [];
    public IsLoadingScopes = true;

    // State
    public IsCreating = false;
    public Step: 'configure' | 'scopes' | 'success' = 'configure';
    public RawApiKey = '';
    public KeyCopied = false;
    public Error = '';

    // Category icons and colors
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

    async ngOnInit(): Promise<void> {
        await this.loadScopes();
    }

    /**
     * Handle escape key to close dialog
     */
    @HostListener('document:keydown.escape')
    public onEscapeKey(): void {
        if (this.Visible && !this.IsCreating) {
            this.close();
        }
    }

    /**
     * Load available scopes
     */
    private async loadScopes(): Promise<void> {
        this.IsLoadingScopes = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<APIScopeEntity>({
                EntityName: 'MJ: API Scopes',
                OrderBy: 'Category, Name',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                const categoryMap = new Map<string, ScopeItem[]>();

                for (const scope of result.Results) {
                    const category = scope.Category || 'Other';
                    if (!categoryMap.has(category)) {
                        categoryMap.set(category, []);
                    }
                    categoryMap.get(category)!.push({
                        scope,
                        selected: false
                    });
                }

                this.ScopeCategories = Array.from(categoryMap.entries()).map(([name, scopes]) => {
                    const config = this.categoryConfig[name] || this.categoryConfig['Other'];
                    return {
                        name,
                        icon: config.icon,
                        color: config.color,
                        scopes,
                        expanded: false,
                        allSelected: false
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
     * Handle expiration preset selection
     */
    public onPresetSelect(preset: { label: string; days: number }): void {
        this.SelectedPreset = preset;
        this.NeverExpires = false;

        if (preset.days > 0) {
            const date = new Date();
            date.setDate(date.getDate() + preset.days);
            this.ExpiresAt = date;
        } else {
            this.ExpiresAt = null;
        }
    }

    /**
     * Handle never expires toggle
     */
    public onNeverExpiresChange(): void {
        if (this.NeverExpires) {
            this.ExpiresAt = null;
            this.SelectedPreset = null;
        }
    }

    /**
     * Toggle category expansion
     */
    public toggleCategory(category: ScopeCategory): void {
        category.expanded = !category.expanded;
    }

    /**
     * Toggle all scopes in a category
     */
    public toggleCategoryAll(category: ScopeCategory): void {
        category.allSelected = !category.allSelected;
        for (const item of category.scopes) {
            item.selected = category.allSelected;
        }
    }

    /**
     * Update category allSelected state
     */
    public updateCategoryState(category: ScopeCategory): void {
        category.allSelected = category.scopes.every(s => s.selected);
    }

    /**
     * Get selected scope count
     */
    public getSelectedScopeCount(): number {
        return this.ScopeCategories.reduce((sum, cat) =>
            sum + cat.scopes.filter(s => s.selected).length, 0);
    }

    /**
     * Proceed to scopes step
     */
    public goToScopes(): void {
        if (!this.Label.trim()) {
            this.Error = 'Please enter a label for the API key';
            return;
        }
        this.Error = '';
        this.Step = 'scopes';
    }

    /**
     * Go back to configure step
     */
    public goBack(): void {
        this.Step = 'configure';
    }

    /**
     * Create the API key using server-side cryptographic hashing
     */
    public async createKey(): Promise<void> {
        this.IsCreating = true;
        this.Error = '';

        try {
            // Get selected scope IDs
            const selectedScopeIds = this.ScopeCategories
                .flatMap(cat => cat.scopes)
                .filter(s => s.selected)
                .map(s => s.scope.ID);

            // Get the GraphQL provider and create the encryption client
            const provider = Metadata.Provider as GraphQLDataProvider;
            const encryptionClient = new GraphQLEncryptionClient(provider);

            // Call the server to create the API key with proper crypto hashing
            const result = await encryptionClient.CreateAPIKey({
                Label: this.Label.trim(),
                Description: this.Description.trim() || undefined,
                ExpiresAt: this.NeverExpires ? undefined : (this.ExpiresAt || undefined),
                ScopeIDs: selectedScopeIds.length > 0 ? selectedScopeIds : undefined
            });

            if (result.Success && result.RawKey) {
                this.RawApiKey = result.RawKey;
                this.Step = 'success';

                this.Created.emit({
                    success: true,
                    rawKey: result.RawKey
                });
            } else {
                this.Error = result.Error || 'Failed to create API key. Please try again.';
            }
        } catch (error) {
            console.error('Error creating API key:', error);
            this.Error = 'An error occurred while creating the API key.';
        } finally {
            this.IsCreating = false;
        }
    }

    /**
     * Copy the API key to clipboard
     */
    public async copyKey(): Promise<void> {
        try {
            await navigator.clipboard.writeText(this.RawApiKey);
            this.KeyCopied = true;
            setTimeout(() => this.KeyCopied = false, 3000);
        } catch (error) {
            console.error('Failed to copy key:', error);
        }
    }

    /**
     * Close the dialog
     */
    public close(): void {
        this.reset();
        this.Visible = false;
        this.VisibleChange.emit(false);
        this.Closed.emit();
    }

    /**
     * Reset form state
     */
    private reset(): void {
        this.Label = '';
        this.Description = '';
        this.ExpiresAt = null;
        this.NeverExpires = true;
        this.SelectedPreset = null;
        this.Step = 'configure';
        this.RawApiKey = '';
        this.KeyCopied = false;
        this.Error = '';

        // Reset scope selections
        for (const category of this.ScopeCategories) {
            category.expanded = false;
            category.allSelected = false;
            for (const scope of category.scopes) {
                scope.selected = false;
            }
        }
    }

    /**
     * Get minimum date for expiration (tomorrow)
     */
    public getMinDate(): Date {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    }
}
