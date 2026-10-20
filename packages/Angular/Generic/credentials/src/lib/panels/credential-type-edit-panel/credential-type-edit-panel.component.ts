import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { MJCredentialTypeEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

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
export class CredentialTypeEditPanelComponent extends BaseAngularComponent implements OnInit {
    @Input() CredentialType: MJCredentialTypeEntity | null = null;

    /** @deprecated Use {@link CredentialType}. */
    @Input() set credentialType(value: MJCredentialTypeEntity | null) {
      this.CredentialType = value;
    }
    /** @deprecated Use {@link CredentialType}. */
    get credentialType(): MJCredentialTypeEntity | null {
      return this.CredentialType;
    }
    @Input() IsOpen = false;

    /** @deprecated Use {@link IsOpen}. */
    @Input() set isOpen(value: CredentialTypeEditPanelComponent['IsOpen']) {
      this.IsOpen = value;
    }
    /** @deprecated Use {@link IsOpen}. */
    get isOpen(): CredentialTypeEditPanelComponent['IsOpen'] {
      return this.IsOpen;
    }

    @Output() close = new EventEmitter<void>();
    @Output() Saved = new EventEmitter<MJCredentialTypeEntity>();

    /**
     * @deprecated Use {@link Saved}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (saved) keeps working. Must stay AFTER Saved: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() saved = this.Saved;
    @Output() Deleted = new EventEmitter<string>();

    /**
     * @deprecated Use {@link Deleted}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (deleted) keeps working. Must stay AFTER Deleted: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() deleted = this.Deleted;

    public isLoading = false;
    public IsSaving = false;

    /** @deprecated Use {@link IsSaving}. */
    public get isSaving() {
      return this.IsSaving;
    }
    /** @deprecated Use {@link IsSaving}. */
    public set isSaving(value) {
      this.IsSaving = value;
    }
    public IsNew = false;

    /** @deprecated Use {@link IsNew}. */
    public get isNew() {
      return this.IsNew;
    }
    /** @deprecated Use {@link IsNew}. */
    public set isNew(value) {
      this.IsNew = value;
    }

    // Form fields
    public name = '';
    public description = '';
    public category: CategoryType = 'Integration';
    public IconClass = '';

    /** @deprecated Use {@link IconClass}. */
    public get iconClass() {
      return this.IconClass;
    }
    /** @deprecated Use {@link IconClass}. */
    public set iconClass(value) {
      this.IconClass = value;
    }
    public ValidationEndpoint = '';

    /** @deprecated Use {@link ValidationEndpoint}. */
    public get validationEndpoint() {
      return this.ValidationEndpoint;
    }
    /** @deprecated Use {@link ValidationEndpoint}. */
    public set validationEndpoint(value) {
      this.ValidationEndpoint = value;
    }
    public SchemaFields: SchemaField[] = [];

    /** @deprecated Use {@link SchemaFields}. */
    public get schemaFields(): SchemaField[] {
      return this.SchemaFields;
    }
    /** @deprecated Use {@link SchemaFields}. */
    public set schemaFields(value: SchemaField[]) {
      this.SchemaFields = value;
    }

    // Available categories
    public Categories: CategoryType[] = ['AI', 'Authentication', 'Communication', 'Database', 'Integration', 'Storage'];

    /** @deprecated Use {@link Categories}. */
    public get categories(): CategoryType[] {
      return this.Categories;
    }
    /** @deprecated Use {@link Categories}. */
    public set categories(value: CategoryType[]) {
      this.Categories = value;
    }

    private get _metadata() { return this.ProviderToUse; }

    constructor(private cdr: ChangeDetectorRef, private confirmService: MJConfirmService) { super(); }

    ngOnInit(): void {}

    public get PanelTitle(): string {
        return this.IsNew ? 'Create Credential Type' : 'Edit Credential Type';
    }

    /** @deprecated Use {@link PanelTitle}. */
    public get panelTitle(): string {
      return this.PanelTitle;
    }

    public get CanSave(): boolean {
        return this.name.trim().length > 0 && this.category.length > 0;
    }

    /** @deprecated Use {@link CanSave}. */
    public get canSave(): boolean {
      return this.CanSave;
    }

    public async Open(credentialType: MJCredentialTypeEntity | null): Promise<void> {
        this.isLoading = true;
        this.IsOpen = true;
        this.CredentialType = credentialType;
        this.IsNew = !credentialType || !credentialType.ID;
        this.cdr.markForCheck();

        this.resetForm();

        if (credentialType && credentialType.ID) {
            this.populateFromType(credentialType);
        }

        this.isLoading = false;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link Open}. */
    public async open(credentialType: MJCredentialTypeEntity | null): Promise<void> {
      return this.Open(credentialType);
    }

    private resetForm(): void {
        this.name = '';
        this.description = '';
        this.category = 'Integration';
        this.IconClass = '';
        this.ValidationEndpoint = '';
        this.SchemaFields = [];
    }

    private populateFromType(credentialType: MJCredentialTypeEntity): void {
        this.name = credentialType.Name || '';
        this.description = credentialType.Description || '';
        this.category = credentialType.Category || 'Integration';
        this.IconClass = credentialType.IconClass || '';
        this.ValidationEndpoint = credentialType.ValidationEndpoint || '';

        // Parse field schema
        this.parseFieldSchema(credentialType.FieldSchema);
    }

    private parseFieldSchema(schemaJson: string): void {
        try {
            if (!schemaJson) {
                this.SchemaFields = [];
                return;
            }
            const schema = JSON.parse(schemaJson) as {
                properties?: Record<string, Record<string, unknown>>;
                required?: string[]
            };
            const properties = schema.properties || {};
            const required = schema.required || [];

            this.SchemaFields = Object.entries(properties).map(([name, prop]) => ({
                name,
                type: (prop.type as string) || 'string',
                title: (prop.title as string) || name,
                description: (prop.description as string) || '',
                isSecret: prop.isSecret === true,
                required: required.includes(name),
                order: typeof prop.order === 'number' ? prop.order : 999
            }));

            this.SchemaFields.sort((a, b) => a.order - b.order);
        } catch (e) {
            console.error('Error parsing field schema:', e);
            this.SchemaFields = [];
        }
    }

    private buildFieldSchema(): string {
        if (this.SchemaFields.length === 0) {
            return JSON.stringify({ type: 'object', properties: {}, required: [] });
        }

        const properties: Record<string, Record<string, unknown>> = {};
        const required: string[] = [];

        for (let i = 0; i < this.SchemaFields.length; i++) {
            const field = this.SchemaFields[i];
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
    public AddSchemaField(): void {
        this.SchemaFields.push({
            name: '',
            type: 'string',
            title: '',
            description: '',
            isSecret: false,
            required: false,
            order: this.SchemaFields.length
        });
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link AddSchemaField}. */
    public addSchemaField(): void {
      return this.AddSchemaField();
    }

    public RemoveSchemaField(index: number): void {
        this.SchemaFields.splice(index, 1);
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link RemoveSchemaField}. */
    public removeSchemaField(index: number): void {
      return this.RemoveSchemaField(index);
    }

    public MoveFieldUp(index: number): void {
        if (index > 0) {
            const temp = this.SchemaFields[index];
            this.SchemaFields[index] = this.SchemaFields[index - 1];
            this.SchemaFields[index - 1] = temp;
            this.cdr.markForCheck();
        }
    }

    /** @deprecated Use {@link MoveFieldUp}. */
    public moveFieldUp(index: number): void {
      return this.MoveFieldUp(index);
    }

    public MoveFieldDown(index: number): void {
        if (index < this.SchemaFields.length - 1) {
            const temp = this.SchemaFields[index];
            this.SchemaFields[index] = this.SchemaFields[index + 1];
            this.SchemaFields[index + 1] = temp;
            this.cdr.markForCheck();
        }
    }

    /** @deprecated Use {@link MoveFieldDown}. */
    public moveFieldDown(index: number): void {
      return this.MoveFieldDown(index);
    }

    public async save(): Promise<void> {
        if (!this.CanSave) {
            MJNotificationService.Instance.CreateSimpleNotification('Please fill in all required fields', 'warning', 3000);
            return;
        }

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            let entity: MJCredentialTypeEntity;

            if (this.IsNew) {
                entity = await this._metadata.GetEntityObject<MJCredentialTypeEntity>('MJ: Credential Types');
            } else {
                entity = this.CredentialType!;
            }

            entity.Name = this.name.trim();
            entity.Description = this.description.trim() || null;
            entity.Category = this.category;
            entity.IconClass = this.IconClass.trim() || null;
            entity.ValidationEndpoint = this.ValidationEndpoint.trim() || null;
            entity.FieldSchema = this.buildFieldSchema();

            const success = await entity.Save();

            if (success) {
                const action = this.IsNew ? 'created' : 'updated';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Credential type "${entity.Name}" ${action} successfully`,
                    'success',
                    3000
                );
                this.Saved.emit(entity);
                this.ClosePanel();
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
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    public async DeleteType(): Promise<void> {
        if (this.IsNew || !this.CredentialType) return;

        const confirmed = await this.confirmService.ConfirmDelete({ title: 'Delete Type', message: `Delete "${this.CredentialType.Name}"?`, detail: 'This action cannot be undone.' });
        if (!confirmed) return;

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            const success = await this.CredentialType.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Credential type "${this.CredentialType.Name}" deleted successfully`,
                    'success',
                    3000
                );
                this.Deleted.emit(this.CredentialType.ID);
                this.ClosePanel();
            } else {
                const errorMessage = this.CredentialType.LatestResult?.Message || 'Unknown error';
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
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    /** @deprecated Use {@link DeleteType}. */
    public async deleteType(): Promise<void> {
      return this.DeleteType();
    }

    public ClosePanel(): void {
        this.IsOpen = false;
        this.CredentialType = null;
        this.resetForm();
        this.close.emit();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ClosePanel}. */
    public closePanel(): void {
      return this.ClosePanel();
    }

    public OnBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('panel-backdrop')) {
            this.ClosePanel();
        }
    }

    /** @deprecated Use {@link OnBackdropClick}. */
    public onBackdropClick(event: MouseEvent): void {
      return this.OnBackdropClick(event);
    }

    public GetCategoryIcon(category: string): string {
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

    /** @deprecated Use {@link GetCategoryIcon}. */
    public getCategoryIcon(category: string): string {
      return this.GetCategoryIcon(category);
    }

    public GetCategoryColor(category: string): string {
        const colorMap: Record<string, string> = {
            'AI': 'var(--mj-brand-primary)',
            'Communication': 'var(--mj-brand-primary)',
            'Storage': 'var(--mj-brand-primary)',
            'Database': 'var(--mj-status-warning)',
            'Authentication': 'var(--mj-status-success)',
            'Integration': 'var(--mj-brand-primary)'
        };
        return colorMap[category] || 'var(--mj-brand-primary)';
    }

    /** @deprecated Use {@link GetCategoryColor}. */
    public getCategoryColor(category: string): string {
      return this.GetCategoryColor(category);
    }
}
