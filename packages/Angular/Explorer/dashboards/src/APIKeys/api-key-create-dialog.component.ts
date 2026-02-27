import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { MJAPIScopeEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLEncryptionClient } from '@memberjunction/graphql-dataprovider';
import { APIKeysEngineBase, parseAPIScopeUIConfig } from '@memberjunction/api-keys-base';

/** Scope selection item */
interface ScopeItem {
    scope: MJAPIScopeEntity;
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
/**
 * Dialog for creating new API keys
 * Shows the raw key only once - it cannot be recovered after closing
 */
@Component({
  standalone: false,
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

    // Default UI config for categories without explicit configuration
    private readonly defaultUIConfig = {
        icon: 'fa-solid fa-ellipsis',
        color: '#6b7280'
    };

    ngOnInit(): void {
        this.loadScopes();
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
     * Load available scopes from cached data.
     * Uses UIConfig from root scopes for category icons/colors.
     */
    private loadScopes(): void {
        this.IsLoadingScopes = true;
        try {
            const base = APIKeysEngineBase.Instance;
            const scopes = base.Scopes;

            // Build a map of category -> root scope UIConfig
            // Root scopes (ParentID is null) define the UI appearance for their category
            const categoryUIConfigs = new Map<string, { icon: string; color: string }>();
            for (const scope of scopes) {
                if (!scope.ParentID) {
                    // This is a root scope - use its UIConfig for the category
                    const uiConfig = parseAPIScopeUIConfig(scope);
                    categoryUIConfigs.set(scope.Category, {
                        icon: uiConfig.icon || this.defaultUIConfig.icon,
                        color: uiConfig.color || this.defaultUIConfig.color
                    });
                }
            }

            // Group scopes by category
            const categoryMap = new Map<string, ScopeItem[]>();
            for (const scope of scopes) {
                const category = scope.Category || 'Other';
                if (!categoryMap.has(category)) {
                    categoryMap.set(category, []);
                }
                categoryMap.get(category)!.push({
                    scope,
                    selected: false
                });
            }

            // Build categories with UI config from root scopes
            this.ScopeCategories = Array.from(categoryMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, scopeItems]) => {
                    const config = categoryUIConfigs.get(name) || this.defaultUIConfig;
                    return {
                        name,
                        icon: config.icon,
                        color: config.color,
                        scopes: scopeItems.sort((a, b) => a.scope.Name.localeCompare(b.scope.Name)),
                        expanded: false,
                        allSelected: false
                    };
                });
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
