import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CredentialTypeEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

export function LoadCredentialTypeEditPanel() {
    // Prevents tree-shaking
}

type CategoryType = 'AI' | 'Authentication' | 'Communication' | 'Database' | 'Integration' | 'Storage';

interface SchemaField {
    name: string;
    type: string;
    title: string;
    description: string;
    isSecret: boolean;
    required: boolean;
    order: number;
}

@Component({
  standalone: false,
    selector: 'mj-credential-type-edit-panel',
    templateUrl: './credential-type-edit-panel.component.html',
    styleUrls: ['./credential-type-edit-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialTypeEditPanelComponent implements OnInit {
    @Input() credentialType: CredentialTypeEntity | null = null;
    @Input() isOpen = false;

    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<CredentialTypeEntity>();
    @Output() deleted = new EventEmitter<string>();

    public isLoading = false;
    public isSaving = false;
    public isNew = false;

    // Form fields
    public name = '';
    public description = '';
    public category: CategoryType = 'Integration';
    public iconClass = '';
    public validationEndpoint = '';
    public schemaFields: SchemaField[] = [];

    // Available categories
    public categories: CategoryType[] = ['AI', 'Authentication', 'Communication', 'Database', 'Integration', 'Storage'];

    private _metadata = new Metadata();

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {}

    public get panelTitle(): string {
        return this.isNew ? 'Create Credential Type' : 'Edit Credential Type';
    }

    public get canSave(): boolean {
        return this.name.trim().length > 0 && this.category.length > 0;
    }

    public async open(credentialType: CredentialTypeEntity | null): Promise<void> {
        this.isLoading = true;
        this.isOpen = true;
        this.credentialType = credentialType;
        this.isNew = !credentialType || !credentialType.ID;
        this.cdr.markForCheck();

        this.resetForm();

        if (credentialType && credentialType.ID) {
            this.populateFromType(credentialType);
        }

        this.isLoading = false;
        this.cdr.markForCheck();
    }

    private resetForm(): void {
        this.name = '';
        this.description = '';
        this.category = 'Integration';
        this.iconClass = '';
        this.validationEndpoint = '';
        this.schemaFields = [];
    }

    private populateFromType(credentialType: CredentialTypeEntity): void {
        this.name = credentialType.Name || '';
        this.description = credentialType.Description || '';
        this.category = credentialType.Category || 'Integration';
        this.iconClass = credentialType.IconClass || '';
        this.validationEndpoint = credentialType.ValidationEndpoint || '';

        // Parse field schema
        this.parseFieldSchema(credentialType.FieldSchema);
    }

    private parseFieldSchema(schemaJson: string): void {
        try {
            if (!schemaJson) {
                this.schemaFields = [];
                return;
            }
            const schema = JSON.parse(schemaJson) as {
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

            this.schemaFields.sort((a, b) => a.order - b.order);
        } catch (e) {
            console.error('Error parsing field schema:', e);
            this.schemaFields = [];
        }
    }

    private buildFieldSchema(): string {
        if (this.schemaFields.length === 0) {
            return JSON.stringify({ type: 'object', properties: {}, required: [] });
        }

        const properties: Record<string, Record<string, unknown>> = {};
        const required: string[] = [];

        for (let i = 0; i < this.schemaFields.length; i++) {
            const field = this.schemaFields[i];
            properties[field.name] = {
                type: field.type,
                title: field.title,
                description: field.description,
                isSecret: field.isSecret,
                order: i
            };
            if (field.required) {
                required.push(field.name);
            }
        }

        return JSON.stringify({
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties,
            required
        }, null, 2);
    }

    // Schema field management
    public addSchemaField(): void {
        this.schemaFields.push({
            name: '',
            type: 'string',
            title: '',
            description: '',
            isSecret: false,
            required: false,
            order: this.schemaFields.length
        });
        this.cdr.markForCheck();
    }

    public removeSchemaField(index: number): void {
        this.schemaFields.splice(index, 1);
        this.cdr.markForCheck();
    }

    public moveFieldUp(index: number): void {
        if (index > 0) {
            const temp = this.schemaFields[index];
            this.schemaFields[index] = this.schemaFields[index - 1];
            this.schemaFields[index - 1] = temp;
            this.cdr.markForCheck();
        }
    }

    public moveFieldDown(index: number): void {
        if (index < this.schemaFields.length - 1) {
            const temp = this.schemaFields[index];
            this.schemaFields[index] = this.schemaFields[index + 1];
            this.schemaFields[index + 1] = temp;
            this.cdr.markForCheck();
        }
    }

    public async save(): Promise<void> {
        if (!this.canSave) {
            MJNotificationService.Instance.CreateSimpleNotification('Please fill in all required fields', 'warning', 3000);
            return;
        }

        this.isSaving = true;
        this.cdr.markForCheck();

        try {
            let entity: CredentialTypeEntity;

            if (this.isNew) {
                entity = await this._metadata.GetEntityObject<CredentialTypeEntity>('MJ: Credential Types');
            } else {
                entity = this.credentialType!;
            }

            entity.Name = this.name.trim();
            entity.Description = this.description.trim() || null;
            entity.Category = this.category;
            entity.IconClass = this.iconClass.trim() || null;
            entity.ValidationEndpoint = this.validationEndpoint.trim() || null;
            entity.FieldSchema = this.buildFieldSchema();

            const success = await entity.Save();

            if (success) {
                const action = this.isNew ? 'created' : 'updated';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Credential type "${entity.Name}" ${action} successfully`,
                    'success',
                    3000
                );
                this.saved.emit(entity);
                this.closePanel();
            } else {
                const errorMessage = entity.LatestResult?.Message || 'Unknown error';
                console.error('Save failed:', errorMessage);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save credential type: ${errorMessage}`,
                    'error',
                    5000
                );
            }
        } catch (error) {
            console.error('Error saving credential type:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving credential type',
                'error',
                3000
            );
        } finally {
            this.isSaving = false;
            this.cdr.markForCheck();
        }
    }

    public async deleteType(): Promise<void> {
        if (this.isNew || !this.credentialType) return;

        const confirmed = confirm(`Are you sure you want to delete "${this.credentialType.Name}"? This action cannot be undone.`);
        if (!confirmed) return;

        this.isSaving = true;
        this.cdr.markForCheck();

        try {
            const success = await this.credentialType.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Credential type "${this.credentialType.Name}" deleted successfully`,
                    'success',
                    3000
                );
                this.deleted.emit(this.credentialType.ID);
                this.closePanel();
            } else {
                const errorMessage = this.credentialType.LatestResult?.Message || 'Unknown error';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to delete credential type: ${errorMessage}`,
                    'error',
                    5000
                );
            }
        } catch (error) {
            console.error('Error deleting credential type:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error deleting credential type',
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
        this.credentialType = null;
        this.resetForm();
        this.close.emit();
        this.cdr.markForCheck();
    }

    public onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('panel-backdrop')) {
            this.closePanel();
        }
    }

    public getCategoryIcon(category: string): string {
        const iconMap: Record<string, string> = {
            'AI': 'fa-solid fa-brain',
            'Communication': 'fa-solid fa-envelope',
            'Storage': 'fa-solid fa-cloud',
            'Database': 'fa-solid fa-database',
            'Authentication': 'fa-solid fa-shield-halved',
            'Integration': 'fa-solid fa-plug'
        };
        return iconMap[category] || 'fa-solid fa-key';
    }

    public getCategoryColor(category: string): string {
        const colorMap: Record<string, string> = {
            'AI': '#8b5cf6',
            'Communication': '#3b82f6',
            'Storage': '#06b6d4',
            'Database': '#f59e0b',
            'Authentication': '#10b981',
            'Integration': '#ec4899'
        };
        return colorMap[category] || '#6366f1';
    }
}
