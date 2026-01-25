import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { APIKeyEntity, APIScopeEntity } from '@memberjunction/core-entities';

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
    apiKey?: APIKeyEntity;
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

    private md = new Metadata();

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
    public CreatedKey: APIKeyEntity | null = null;
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
     * Create the API key
     */
    public async createKey(): Promise<void> {
        this.IsCreating = true;
        this.Error = '';

        try {
            // Generate a secure random key
            const rawKey = this.generateSecureKey();
            const hash = await this.hashKey(rawKey);

            // Create the API key entity
            const apiKey = await this.md.GetEntityObject<APIKeyEntity>('MJ: API Keys');
            apiKey.NewRecord();
            apiKey.Label = this.Label.trim();
            apiKey.Description = this.Description.trim() || null;
            apiKey.Hash = hash;
            apiKey.Status = 'Active';
            apiKey.ExpiresAt = this.NeverExpires ? null : this.ExpiresAt;
            apiKey.UserID = this.md.CurrentUser.ID;
            apiKey.CreatedByUserID = this.md.CurrentUser.ID;

            const saveResult = await apiKey.Save();

            if (saveResult) {
                // Save scope associations
                await this.saveKeyScopes(apiKey.ID);

                this.CreatedKey = apiKey;
                this.RawApiKey = rawKey;
                this.Step = 'success';

                this.Created.emit({
                    success: true,
                    apiKey,
                    rawKey
                });
            } else {
                this.Error = 'Failed to create API key. Please try again.';
            }
        } catch (error) {
            console.error('Error creating API key:', error);
            this.Error = 'An error occurred while creating the API key.';
        } finally {
            this.IsCreating = false;
        }
    }

    /**
     * Generate a secure random API key
     */
    private generateSecureKey(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const prefix = 'mj_';
        let key = prefix;

        // Generate 48 random characters for a total of 51 chars
        const randomValues = new Uint8Array(48);
        crypto.getRandomValues(randomValues);

        for (let i = 0; i < 48; i++) {
            key += chars[randomValues[i] % chars.length];
        }

        return key;
    }

    /**
     * Hash the API key using SHA-256
     */
    private async hashKey(key: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(key);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Save key-scope associations
     */
    private async saveKeyScopes(keyId: string): Promise<void> {
        const selectedScopes = this.ScopeCategories
            .flatMap(cat => cat.scopes)
            .filter(s => s.selected);

        for (const item of selectedScopes) {
            try {
                const keyScope = await this.md.GetEntityObject('MJ: API Key Scopes');
                keyScope.NewRecord();
                keyScope.Set('APIKeyID', keyId);
                keyScope.Set('APIScopeID', item.scope.ID);
                await keyScope.Save();
            } catch (error) {
                console.error('Error saving scope association:', error);
            }
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
        this.CreatedKey = null;
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
