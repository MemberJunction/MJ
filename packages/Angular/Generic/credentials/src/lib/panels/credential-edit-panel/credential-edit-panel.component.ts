import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { CredentialEntity, CredentialTypeEntity, CredentialCategoryEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

export function LoadCredentialEditPanel() {
    // Prevents tree-shaking
}

interface FieldSchemaProperty {
    name: string;
    type: string;
    title: string;
    description: string;
    isSecret: boolean;
    required: boolean;
    order: number;
}

interface CredentialValues {
    [key: string]: string | number | boolean;
}

@Component({
    selector: 'mj-credential-edit-panel',
    templateUrl: './credential-edit-panel.component.html',
    styleUrls: ['./credential-edit-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialEditPanelComponent implements OnInit, OnDestroy {
    @Input() credential: CredentialEntity | null = null;
    @Input() credentialTypes: CredentialTypeEntity[] = [];
    @Input() isOpen = false;

    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<CredentialEntity>();
    @Output() deleted = new EventEmitter<string>();

    public isLoading = false;
    public isSaving = false;
    public isNew = false;
    public categories: CredentialCategoryEntity[] = [];

    // Form fields
    public name = '';
    public description = '';
    public selectedTypeId = '';
    public selectedCategoryId = '';
    public isActive = true;
    public isDefault = false;
    public expiresAt: Date | null = null;

    // Dynamic credential values based on type schema
    public credentialValues: CredentialValues = {};
    public schemaFields: FieldSchemaProperty[] = [];
    public showSecretFields: Set<string> = new Set();

    private _metadata = new Metadata();

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        this.loadCategories();
    }

    ngOnDestroy(): void {
        // Cleanup
    }

    public get selectedType(): CredentialTypeEntity | null {
        return this.credentialTypes.find(t => t.ID === this.selectedTypeId) || null;
    }

    public get panelTitle(): string {
        return this.isNew ? 'Create Credential' : 'Edit Credential';
    }

    public get canSave(): boolean {
        if (!this.name.trim() || !this.selectedTypeId) {
            return false;
        }
        // Check required fields
        for (const field of this.schemaFields) {
            if (field.required && !this.credentialValues[field.name]) {
                return false;
            }
        }
        return true;
    }

    public async open(credential: CredentialEntity | null, preselectedTypeId?: string, preselectedCategoryId?: string): Promise<void> {
        this.isLoading = true;
        this.isOpen = true;
        this.credential = credential;
        this.isNew = !credential || !credential.ID;
        this.cdr.markForCheck();

        // Reset form
        this.resetForm();

        if (credential && credential.ID) {
            // Edit mode - populate from existing credential
            this.populateFromCredential(credential);
        } else {
            // Create mode with optional preselections
            if (preselectedTypeId) {
                this.selectedTypeId = preselectedTypeId;
                this.onTypeChange();
            }
            if (preselectedCategoryId) {
                this.selectedCategoryId = preselectedCategoryId;
            }
        }

        this.isLoading = false;
        this.cdr.markForCheck();
    }

    private resetForm(): void {
        this.name = '';
        this.description = '';
        this.selectedTypeId = '';
        this.selectedCategoryId = '';
        this.isActive = true;
        this.isDefault = false;
        this.expiresAt = null;
        this.credentialValues = {};
        this.schemaFields = [];
        this.showSecretFields.clear();
    }

    private populateFromCredential(credential: CredentialEntity): void {
        this.name = credential.Name || '';
        this.description = credential.Description || '';
        this.selectedTypeId = credential.CredentialTypeID || '';
        this.selectedCategoryId = credential.CategoryID || '';
        this.isActive = credential.IsActive;
        this.isDefault = credential.IsDefault;
        this.expiresAt = credential.ExpiresAt ? new Date(credential.ExpiresAt) : null;

        // Parse the type schema
        this.onTypeChange();

        // Parse stored values
        try {
            if (credential.Values) {
                this.credentialValues = JSON.parse(credential.Values) as CredentialValues;
            }
        } catch (e) {
            console.error('Error parsing credential values:', e);
            this.credentialValues = {};
        }
    }

    private async loadCategories(): Promise<void> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<CredentialCategoryEntity>({
                EntityName: 'MJ: Credential Categories',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.categories = result.Results;
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
        this.cdr.markForCheck();
    }

    public onTypeChange(): void {
        const type = this.selectedType;
        if (!type || !type.FieldSchema) {
            this.schemaFields = [];
            return;
        }

        try {
            const schema = JSON.parse(type.FieldSchema) as {
                properties?: Record<string, Record<string, unknown>>;
                required?: string[]
            };
            const properties = schema.properties || {};
            const required = schema.required || [];

            this.schemaFields = Object.entries(properties).map(([name, prop]) => ({
                name,
                type: (prop.type as string) || 'string',
                title: (prop.title as string) || name,
                description: (prop.description as string) || '',
                isSecret: prop.isSecret === true,
                required: required.includes(name),
                order: typeof prop.order === 'number' ? prop.order : 999
            }));

            // Sort by order
            this.schemaFields.sort((a, b) => a.order - b.order);

            // Initialize any missing values
            for (const field of this.schemaFields) {
                if (!(field.name in this.credentialValues)) {
                    this.credentialValues[field.name] = '';
                }
            }
        } catch (e) {
            console.error('Error parsing field schema:', e);
            this.schemaFields = [];
        }
        this.cdr.markForCheck();
    }

    public toggleSecretVisibility(fieldName: string): void {
        if (this.showSecretFields.has(fieldName)) {
            this.showSecretFields.delete(fieldName);
        } else {
            this.showSecretFields.add(fieldName);
        }
        this.cdr.markForCheck();
    }

    public isSecretVisible(fieldName: string): boolean {
        return this.showSecretFields.has(fieldName);
    }

    public async save(): Promise<void> {
        if (!this.canSave) {
            MJNotificationService.Instance.CreateSimpleNotification('Please fill in all required fields', 'warning', 3000);
            return;
        }

        this.isSaving = true;
        this.cdr.markForCheck();

        try {
            let entity: CredentialEntity;

            if (this.isNew) {
                // Create new credential
                entity = await this._metadata.GetEntityObject<CredentialEntity>('MJ: Credentials');
            } else {
                entity = this.credential!;
            }

            // Set all fields
            entity.Name = this.name.trim();
            entity.Description = this.description.trim() || null;
            entity.CredentialTypeID = this.selectedTypeId;
            entity.CategoryID = this.selectedCategoryId || null;
            entity.IsActive = this.isActive;
            entity.IsDefault = this.isDefault;
            entity.ExpiresAt = this.expiresAt;
            entity.Values = JSON.stringify(this.credentialValues);

            const success = await entity.Save();

            if (success) {
                const action = this.isNew ? 'created' : 'updated';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Credential "${entity.Name}" ${action} successfully`,
                    'success',
                    3000
                );
                this.saved.emit(entity);
                this.closePanel();
            } else {
                // Use CompleteMessage for full error details, fall back to Message
                const errorMessage = entity.LatestResult?.CompleteMessage || entity.LatestResult?.Message || 'Unknown error';
                console.error('Credential save failed:', errorMessage, entity.LatestResult);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save credential: ${errorMessage}`,
                    'error',
                    8000
                );
            }
        } catch (error) {
            console.error('Error saving credential:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving credential',
                'error',
                3000
            );
        } finally {
            this.isSaving = false;
            this.cdr.markForCheck();
        }
    }

    public async deleteCredential(): Promise<void> {
        if (this.isNew || !this.credential) return;

        const confirmed = confirm(`Are you sure you want to delete "${this.credential.Name}"? This action cannot be undone.`);
        if (!confirmed) return;

        this.isSaving = true;
        this.cdr.markForCheck();

        try {
            const success = await this.credential.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Credential "${this.credential.Name}" deleted successfully`,
                    'success',
                    3000
                );
                this.deleted.emit(this.credential.ID);
                this.closePanel();
            } else {
                // Use CompleteMessage for full error details, fall back to Message
                const errorMessage = this.credential.LatestResult?.CompleteMessage || this.credential.LatestResult?.Message || 'Unknown error';
                console.error('Credential delete failed:', errorMessage, this.credential.LatestResult);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to delete credential: ${errorMessage}`,
                    'error',
                    8000
                );
            }
        } catch (error) {
            console.error('Error deleting credential:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error deleting credential',
                'error',
                3000
            );
        } finally {
            this.isSaving = false;
            this.cdr.markForCheck();
        }
    }

    public closePanel(): void {
        this.isOpen = false;
        this.credential = null;
        this.resetForm();
        this.close.emit();
        this.cdr.markForCheck();
    }

    public onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('panel-backdrop')) {
            this.closePanel();
        }
    }

    public get groupedCredentialTypes(): Array<{ category: string; types: CredentialTypeEntity[] }> {
        const grouped = new Map<string, CredentialTypeEntity[]>();
        for (const type of this.credentialTypes) {
            const category = type.Category || 'Other';
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category)!.push(type);
        }
        return Array.from(grouped.entries()).map(([category, types]) => ({ category, types }));
    }

    public getTypeIcon(type: CredentialTypeEntity): string {
        const iconMap: Record<string, string> = {
            'AI': 'fa-solid fa-brain',
            'Communication': 'fa-solid fa-envelope',
            'Storage': 'fa-solid fa-cloud',
            'Database': 'fa-solid fa-database',
            'Authentication': 'fa-solid fa-shield-halved',
            'Integration': 'fa-solid fa-plug'
        };
        return type.IconClass || iconMap[type.Category] || 'fa-solid fa-key';
    }

    public getTypeColor(type: CredentialTypeEntity): string {
        const colorMap: Record<string, string> = {
            'AI': '#8b5cf6',
            'Communication': '#3b82f6',
            'Storage': '#06b6d4',
            'Database': '#f59e0b',
            'Authentication': '#10b981',
            'Integration': '#ec4899'
        };
        return colorMap[type.Category] || '#6366f1';
    }

    public onValueChange(fieldName: string, value: string): void {
        this.credentialValues[fieldName] = value;
        this.cdr.markForCheck();
    }

    public formatDateForInput(date: Date | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    }

    public onExpiresAtChange(value: string): void {
        this.expiresAt = value ? new Date(value) : null;
        this.cdr.markForCheck();
    }
}
