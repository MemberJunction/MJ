import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, OnInit, OnDestroy, HostListener } from '@angular/core';
import { MJCredentialEntity, MJCredentialTypeEntity, MJCredentialCategoryEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

interface FieldSchemaProperty {
    name: string;
    type: string;
    title: string;
    description: string;
    isSecret: boolean;
    required: boolean;
    order: number;
    // JSON Schema constraint properties
    enum?: string[];       // List of allowed values
    const?: unknown;           // Fixed immutable value
    default?: unknown;         // Pre-filled value
    format?: string;       // Format validation (uri, email, date, etc.)
    pattern?: string;      // Regex pattern
    minLength?: number;    // Minimum string length
    maxLength?: number;    // Maximum string length
    minimum?: number;      // Minimum numeric value
    maximum?: number;      // Maximum numeric value
}

interface CredentialValues {
    [key: string]: string | number | boolean;
}

@Component({
  standalone: false,
    selector: 'mj-credential-edit-panel',
    templateUrl: './credential-edit-panel.component.html',
    styleUrls: ['./credential-edit-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialEditPanelComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    @Input() Credential: MJCredentialEntity | null = null;

    /** @deprecated Use {@link Credential}. */
    @Input() set credential(value: MJCredentialEntity | null) {
      this.Credential = value;
    }
    /** @deprecated Use {@link Credential}. */
    get credential(): MJCredentialEntity | null {
      return this.Credential;
    }
    @Input() CredentialTypes: MJCredentialTypeEntity[] = [];

    /** @deprecated Use {@link CredentialTypes}. */
    @Input() set credentialTypes(value: MJCredentialTypeEntity[]) {
      this.CredentialTypes = value;
    }
    /** @deprecated Use {@link CredentialTypes}. */
    get credentialTypes(): MJCredentialTypeEntity[] {
      return this.CredentialTypes;
    }
    @Input() IsOpen = false;

    /** @deprecated Use {@link IsOpen}. */
    @Input() set isOpen(value: CredentialEditPanelComponent['IsOpen']) {
      this.IsOpen = value;
    }
    /** @deprecated Use {@link IsOpen}. */
    get isOpen(): CredentialEditPanelComponent['IsOpen'] {
      return this.IsOpen;
    }

    @Output() close = new EventEmitter<void>();
    @Output() Saved = new EventEmitter<MJCredentialEntity>();

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
    public Categories: MJCredentialCategoryEntity[] = [];

    /** @deprecated Use {@link Categories}. */
    public get categories(): MJCredentialCategoryEntity[] {
      return this.Categories;
    }
    /** @deprecated Use {@link Categories}. */
    public set categories(value: MJCredentialCategoryEntity[]) {
      this.Categories = value;
    }

    // Form fields
    public name = '';
    public description = '';
    public SelectedTypeId = '';

    /** @deprecated Use {@link SelectedTypeId}. */
    public get selectedTypeId() {
      return this.SelectedTypeId;
    }
    /** @deprecated Use {@link SelectedTypeId}. */
    public set selectedTypeId(value) {
      this.SelectedTypeId = value;
    }
    public SelectedCategoryId = '';

    /** @deprecated Use {@link SelectedCategoryId}. */
    public get selectedCategoryId() {
      return this.SelectedCategoryId;
    }
    /** @deprecated Use {@link SelectedCategoryId}. */
    public set selectedCategoryId(value) {
      this.SelectedCategoryId = value;
    }
    public IsActive = true;

    /** @deprecated Use {@link IsActive}. */
    public get isActive() {
      return this.IsActive;
    }
    /** @deprecated Use {@link IsActive}. */
    public set isActive(value) {
      this.IsActive = value;
    }
    public IsDefault = false;

    /** @deprecated Use {@link IsDefault}. */
    public get isDefault() {
      return this.IsDefault;
    }
    /** @deprecated Use {@link IsDefault}. */
    public set isDefault(value) {
      this.IsDefault = value;
    }
    public ExpiresAt: Date | null = null;

    /** @deprecated Use {@link ExpiresAt}. */
    public get expiresAt(): Date | null {
      return this.ExpiresAt;
    }
    /** @deprecated Use {@link ExpiresAt}. */
    public set expiresAt(value: Date | null) {
      this.ExpiresAt = value;
    }

    // Dynamic credential values based on type schema
    public CredentialValues: CredentialValues = {};

    /** @deprecated Use {@link CredentialValues}. */
    public get credentialValues(): CredentialValues {
      return this.CredentialValues;
    }
    /** @deprecated Use {@link CredentialValues}. */
    public set credentialValues(value: CredentialValues) {
      this.CredentialValues = value;
    }
    public SchemaFields: FieldSchemaProperty[] = [];

    /** @deprecated Use {@link SchemaFields}. */
    public get schemaFields(): FieldSchemaProperty[] {
      return this.SchemaFields;
    }
    /** @deprecated Use {@link SchemaFields}. */
    public set schemaFields(value: FieldSchemaProperty[]) {
      this.SchemaFields = value;
    }
    public ShowSecretFields: Set<string> = new Set();

    /** @deprecated Use {@link ShowSecretFields}. */
    public get showSecretFields(): Set<string> {
      return this.ShowSecretFields;
    }
    /** @deprecated Use {@link ShowSecretFields}. */
    public set showSecretFields(value: Set<string>) {
      this.ShowSecretFields = value;
    }

    // Friendly inline error shown beneath the Name field (e.g. duplicate-name conflict)
    public NameError: string | null = null;

    /** @deprecated Use {@link NameError}. */
    public get nameError(): string | null {
      return this.NameError;
    }
    /** @deprecated Use {@link NameError}. */
    public set nameError(value: string | null) {
      this.NameError = value;
    }

    private get _metadata() { return this.ProviderToUse; }

    constructor(private cdr: ChangeDetectorRef, private confirmService: MJConfirmService) { super(); }

    ngOnInit(): void {
        this.loadCategories();
    }

    ngOnDestroy(): void {
        // Cleanup
    }

    public get SelectedType(): MJCredentialTypeEntity | null {
        return this.CredentialTypes.find(t => UUIDsEqual(t.ID, this.SelectedTypeId)) || null;
    }

    /** @deprecated Use {@link SelectedType}. */
    public get selectedType(): MJCredentialTypeEntity | null {
      return this.SelectedType;
    }

    public get PanelTitle(): string {
        return this.IsNew ? 'Create Credential' : 'Edit Credential';
    }

    /** @deprecated Use {@link PanelTitle}. */
    public get panelTitle(): string {
      return this.PanelTitle;
    }

    public get CanSave(): boolean {
        if (!this.name.trim() || !this.SelectedTypeId) {
            return false;
        }
        // Check required fields
        for (const field of this.SchemaFields) {
            if (field.required && !this.CredentialValues[field.name]) {
                return false;
            }
        }
        return true;
    }

    /** @deprecated Use {@link CanSave}. */
    public get canSave(): boolean {
      return this.CanSave;
    }

    public async Open(credential: MJCredentialEntity | null, preselectedTypeId?: string, preselectedCategoryId?: string): Promise<void> {
        this.isLoading = true;
        this.IsOpen = true;
        this.Credential = credential;
        this.IsNew = !credential || !credential.ID;
        this.cdr.markForCheck();

        // Reset form
        this.resetForm();

        if (credential && credential.ID) {
            // Edit mode - populate from existing credential
            this.populateFromCredential(credential);
        } else {
            // Create mode with optional preselections
            if (preselectedTypeId) {
                this.SelectedTypeId = preselectedTypeId;
                this.OnTypeChange();
            }
            if (preselectedCategoryId) {
                this.SelectedCategoryId = preselectedCategoryId;
            }
        }

        this.isLoading = false;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link Open}. */
    public async open(credential: MJCredentialEntity | null, preselectedTypeId?: string, preselectedCategoryId?: string): Promise<void> {
      return this.Open(credential, preselectedTypeId, preselectedCategoryId);
    }

    private resetForm(): void {
        this.name = '';
        this.description = '';
        this.SelectedTypeId = '';
        this.SelectedCategoryId = '';
        this.IsActive = true;
        this.IsDefault = false;
        this.ExpiresAt = null;
        this.CredentialValues = {};
        this.SchemaFields = [];
        this.ShowSecretFields.clear();
        this.NameError = null;
    }

    private populateFromCredential(credential: MJCredentialEntity): void {
        this.name = credential.Name || '';
        this.description = credential.Description || '';
        this.SelectedTypeId = credential.CredentialTypeID || '';
        this.SelectedCategoryId = credential.CategoryID || '';
        this.IsActive = credential.IsActive;
        this.IsDefault = credential.IsDefault;
        this.ExpiresAt = credential.ExpiresAt ? new Date(credential.ExpiresAt) : null;

        // Parse the type schema
        this.OnTypeChange();

        // Parse stored values and filter out "undefined" strings
        try {
            if (credential.Values) {
                const parsedValues = JSON.parse(credential.Values) as CredentialValues;

                // Filter out "undefined" string values that may have been stored
                this.CredentialValues = {};
                for (const [key, value] of Object.entries(parsedValues)) {
                    if (value !== 'undefined' && value !== undefined && value !== null) {
                        this.CredentialValues[key] = value;
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing credential values:', e);
            this.CredentialValues = {};
        }
    }

    private async loadCategories(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJCredentialCategoryEntity>({
                EntityName: 'MJ: Credential Categories',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.Categories = result.Results;
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
        this.cdr.markForCheck();
    }

    public OnTypeChange(): void {
        // Uniqueness is scoped to (CredentialTypeID, Name); changing the type can
        // resolve or introduce a conflict, so any prior inline name error is now stale.
        this.NameError = null;

        const type = this.SelectedType;
        if (!type || !type.FieldSchema) {
            this.SchemaFields = [];
            return;
        }

        try {
            const schema = JSON.parse(type.FieldSchema) as {
                properties?: Record<string, Record<string, unknown>>;
                required?: string[]
            };
            const properties = schema.properties || {};
            const required = schema.required || [];

            this.SchemaFields = Object.entries(properties).map(([name, prop]) => {
                const field: FieldSchemaProperty = {
                    name,
                    type: (prop.type as string) || 'string',
                    title: (prop.title as string) || name,
                    description: (prop.description as string) || '',
                    isSecret: prop.isSecret === true,
                    required: required.includes(name),
                    order: typeof prop.order === 'number' ? prop.order : 999
                };

                // Extract JSON Schema constraint properties
                if ('enum' in prop && Array.isArray(prop.enum)) {
                    field.enum = prop.enum as string[];
                }
                if ('const' in prop) {
                    field.const = prop.const;
                }
                if ('default' in prop) {
                    field.default = prop.default;
                }
                if ('format' in prop) {
                    field.format = prop.format as string;
                }
                if ('pattern' in prop) {
                    field.pattern = prop.pattern as string;
                }
                if ('minLength' in prop) {
                    field.minLength = prop.minLength as number;
                }
                if ('maxLength' in prop) {
                    field.maxLength = prop.maxLength as number;
                }
                if ('minimum' in prop) {
                    field.minimum = prop.minimum as number;
                }
                if ('maximum' in prop) {
                    field.maximum = prop.maximum as number;
                }

                return field;
            });

            // Sort by order
            this.SchemaFields.sort((a, b) => a.order - b.order);

            // Initialize any missing values with defaults or const values
            for (const field of this.SchemaFields) {
                if (!(field.name in this.CredentialValues)) {
                    // Priority: const > default > empty
                    if (field.const !== undefined) {
                        this.CredentialValues[field.name] = String(field.const);
                    } else if (field.default !== undefined) {
                        this.CredentialValues[field.name] = String(field.default);
                    } else {
                        this.CredentialValues[field.name] = '';
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing field schema:', e);
            this.SchemaFields = [];
        }
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnTypeChange}. */
    public onTypeChange(): void {
      return this.OnTypeChange();
    }

    public ToggleSecretVisibility(fieldName: string): void {
        if (this.ShowSecretFields.has(fieldName)) {
            this.ShowSecretFields.delete(fieldName);
        } else {
            this.ShowSecretFields.add(fieldName);
        }
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ToggleSecretVisibility}. */
    public toggleSecretVisibility(fieldName: string): void {
      return this.ToggleSecretVisibility(fieldName);
    }

    public IsSecretVisible(fieldName: string): boolean {
        return this.ShowSecretFields.has(fieldName);
    }

    /** @deprecated Use {@link IsSecretVisible}. */
    public isSecretVisible(fieldName: string): boolean {
      return this.IsSecretVisible(fieldName);
    }

    public async save(): Promise<void> {
        if (!this.CanSave) {
            MJNotificationService.Instance.CreateSimpleNotification('Please fill in all required fields', 'warning', 3000);
            return;
        }

        // Validate all fields against schema constraints
        const validationErrors = this.validateAllFields();
        if (validationErrors.length > 0) {
            const errorMessage = validationErrors.length === 1
                ? validationErrors[0]
                : `Validation errors:\n${validationErrors.map(e => `• ${e}`).join('\n')}`;
            MJNotificationService.Instance.CreateSimpleNotification(errorMessage, 'error', 5000);
            return;
        }

        // Pre-save uniqueness check: the DB enforces UNIQUE (CredentialTypeID, Name).
        // Catch the conflict here so the user sees a friendly inline message instead
        // of a raw unique-constraint error from the database.
        const nameTaken = await this.isNameAlreadyTaken();
        if (nameTaken) {
            this.NameError = `A credential named "${this.name.trim()}" already exists for this type. Choose a different name.`;
            MJNotificationService.Instance.CreateSimpleNotification(this.NameError, 'warning', 5000);
            this.cdr.markForCheck();
            return;
        }

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            let entity: MJCredentialEntity;

            if (this.IsNew) {
                // Create new credential
                entity = await this._metadata.GetEntityObject<MJCredentialEntity>('MJ: Credentials');
                entity.NewRecord();
            } else {
                entity = this.Credential!;
            }

            // Set all fields
            entity.Name = this.name.trim();
            entity.Description = this.description.trim() || null;
            entity.CredentialTypeID = this.SelectedTypeId;
            entity.CategoryID = this.SelectedCategoryId || null;
            entity.IsActive = this.IsActive;
            entity.IsDefault = this.IsDefault;
            entity.ExpiresAt = this.ExpiresAt;

            // Clean credential values before saving (remove "undefined" strings and empty non-required fields)
            const cleanedValues = this.cleanCredentialValues();
            entity.Values = JSON.stringify(cleanedValues);

            const success = await entity.Save();

            if (success) {
                const action = this.IsNew ? 'created' : 'updated';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Credential "${entity.Name}" ${action} successfully`,
                    'success',
                    3000
                );
                this.Saved.emit(entity);
                this.ClosePanel();
            } else {
                // Use CompleteMessage for full error details, fall back to Message
                const rawError = entity.LatestResult?.CompleteMessage || 'Unknown error';
                console.error('Credential save failed:', rawError, entity.LatestResult);

                // Defense-in-depth: a concurrent save can still trip the DB UNIQUE (CredentialTypeID, Name)
                // constraint after our pre-save check. Translate that into the same friendly message
                // rather than showing the raw constraint text.
                if (this.isDuplicateNameError(rawError)) {
                    this.NameError = `A credential named "${this.name.trim()}" already exists for this type. Choose a different name.`;
                    MJNotificationService.Instance.CreateSimpleNotification(this.NameError, 'warning', 5000);
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Failed to save credential: ${rawError}`,
                        'error',
                        8000
                    );
                }
            }
        } catch (error) {
            console.error('Error saving credential:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving credential',
                'error',
                3000
            );
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    public async DeleteCredential(): Promise<void> {
        if (this.IsNew || !this.Credential) return;

        const confirmed = await this.confirmService.ConfirmDelete({ title: 'Delete Credential', message: `Delete "${this.Credential.Name}"?`, detail: 'This action cannot be undone.' });
        if (!confirmed) return;

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            const success = await this.Credential.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Credential "${this.Credential.Name}" deleted successfully`,
                    'success',
                    3000
                );
                this.Deleted.emit(this.Credential.ID);
                this.ClosePanel();
            } else {
                // Use CompleteMessage for full error details, fall back to Message
                const errorMessage = this.Credential.LatestResult?.CompleteMessage || 'Unknown error';
                console.error('Credential delete failed:', errorMessage, this.Credential.LatestResult);
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
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    /** @deprecated Use {@link DeleteCredential}. */
    public async deleteCredential(): Promise<void> {
      return this.DeleteCredential();
    }

    public ClosePanel(): void {
        this.IsOpen = false;
        this.Credential = null;
        this.resetForm();
        this.close.emit();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ClosePanel}. */
    public closePanel(): void {
      return this.ClosePanel();
    }

    public OnBackdropClick(): void {
        // Backdrop click disabled - panel only closeable via Cancel button or ESC key
        // This prevents accidental closes when clicking outside the panel
    }

    /** @deprecated Use {@link OnBackdropClick}. */
    public onBackdropClick(): void {
      return this.OnBackdropClick();
    }

    @HostListener('document:keydown.escape', ['$event'])
    public onEscapeKey(event: Event): void {
        if (this.IsOpen && !this.IsSaving) {
            event.preventDefault();
            this.ClosePanel();
        }
    }

    private _cachedGroupedTypes: Array<{ category: string; types: MJCredentialTypeEntity[] }> = [];
    private _lastCredentialTypesRef: MJCredentialTypeEntity[] = [];

    public get GroupedCredentialTypes(): Array<{ category: string; types: MJCredentialTypeEntity[] }> {
        // Only rebuild when the input array reference changes
        if (this.CredentialTypes !== this._lastCredentialTypesRef) {
            this._lastCredentialTypesRef = this.CredentialTypes;
            const grouped = new Map<string, MJCredentialTypeEntity[]>();
            for (const type of this.CredentialTypes) {
                const category = type.Category || 'Other';
                if (!grouped.has(category)) {
                    grouped.set(category, []);
                }
                grouped.get(category)!.push(type);
            }
            this._cachedGroupedTypes = Array.from(grouped.entries()).map(([category, types]) => ({ category, types }));
        }
        return this._cachedGroupedTypes;
    }

    /** @deprecated Use {@link GroupedCredentialTypes}. */
    public get groupedCredentialTypes(): Array<{ category: string; types: MJCredentialTypeEntity[] }> {
      return this.GroupedCredentialTypes;
    }

    public GetTypeIcon(type: MJCredentialTypeEntity): string {
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

    /** @deprecated Use {@link GetTypeIcon}. */
    public getTypeIcon(type: MJCredentialTypeEntity): string {
      return this.GetTypeIcon(type);
    }

    public GetTypeColor(type: MJCredentialTypeEntity): string {
        const colorMap: Record<string, string> = {
            'AI': 'var(--mj-brand-primary)',
            'Communication': 'var(--mj-brand-primary)',
            'Storage': 'var(--mj-brand-primary)',
            'Database': 'var(--mj-status-warning)',
            'Authentication': 'var(--mj-status-success)',
            'Integration': 'var(--mj-brand-primary)'
        };
        return colorMap[type.Category] || 'var(--mj-brand-primary)';
    }

    /** @deprecated Use {@link GetTypeColor}. */
    public getTypeColor(type: MJCredentialTypeEntity): string {
      return this.GetTypeColor(type);
    }

    public OnValueChange(fieldName: string, value: string): void {
        this.CredentialValues[fieldName] = value;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnValueChange}. */
    public onValueChange(fieldName: string, value: string): void {
      return this.OnValueChange(fieldName, value);
    }

    /**
     * Clears the inline duplicate-name error as soon as the user edits the Name field,
     * so a stale conflict message doesn't linger after they've started fixing it.
     */
    public OnNameChange(): void {
        if (this.NameError) {
            this.NameError = null;
            this.cdr.markForCheck();
        }
    }

    /** @deprecated Use {@link OnNameChange}. */
    public onNameChange(): void {
      return this.OnNameChange();
    }

    public FormatDateForInput(date: Date | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    }

    /** @deprecated Use {@link FormatDateForInput}. */
    public formatDateForInput(date: Date | null): string {
      return this.FormatDateForInput(date);
    }

    public OnExpiresAtChange(value: string): void {
        this.ExpiresAt = value ? new Date(value) : null;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnExpiresAtChange}. */
    public onExpiresAtChange(value: string): void {
      return this.OnExpiresAtChange(value);
    }

    /**
     * Validates a field value against format constraints.
     */
    private validateFormat(fieldTitle: string, value: string, format: string): string | null {
        if (!value || !format) return null;

        switch (format) {
            case 'uri':
            case 'url':
                try {
                    new URL(value);
                    return null;
                } catch {
                    return `${fieldTitle} must be a valid URL`;
                }

            case 'email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(value) ? null : `${fieldTitle} must be a valid email`;

            case 'date':
                return isNaN(Date.parse(value)) ? `${fieldTitle} must be a valid date` : null;

            case 'date-time':
                return isNaN(Date.parse(value)) ? `${fieldTitle} must be a valid date-time` : null;

            case 'uuid':
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(value) ? null : `${fieldTitle} must be a valid UUID`;

            default:
                return null;
        }
    }

    /**
     * Checks whether another credential with the same Name already exists for the
     * selected credential type. Mirrors the DB constraint UNIQUE (CredentialTypeID, Name).
     * The current record is excluded so re-saving an unchanged credential never reports a conflict.
     * Fails open (returns false) on query errors, so a transient lookup failure surfaces the
     * underlying save error rather than incorrectly blocking the user.
     */
    private async isNameAlreadyTaken(): Promise<boolean> {
        const trimmedName = this.name.trim();
        if (!trimmedName || !this.SelectedTypeId) {
            return false;
        }

        const escapedName = trimmedName.replace(/'/g, "''");
        let filter = `CredentialTypeID='${this.SelectedTypeId}' AND Name='${escapedName}'`;

        // In edit mode, exclude the record being edited from the conflict check.
        const currentId = this.Credential?.ID;
        if (!this.IsNew && currentId) {
            filter += ` AND ID<>'${currentId}'`;
        }

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<MJCredentialEntity>({
            EntityName: 'MJ: Credentials',
            ExtraFilter: filter,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple'
        });

        if (!result.Success) {
            console.error('Credential name uniqueness check failed:', result.ErrorMessage);
            return false;
        }

        return result.Results.length > 0;
    }

    /**
     * Heuristic detection of a unique-constraint violation on the credential Name from a raw
     * save error. Covers SQL Server (UQ_Credential_TypeName / "duplicate key" / 2627 / 2601)
     * and PostgreSQL ("duplicate key value violates unique constraint" / 23505) wording.
     */
    private isDuplicateNameError(rawError: string): boolean {
        const message = rawError.toLowerCase();
        const mentionsUniqueViolation =
            message.includes('uq_credential_typename') ||
            message.includes('duplicate key') ||
            message.includes('unique constraint') ||
            message.includes('unique index') ||
            message.includes('violation of unique') ||
            message.includes('2627') ||
            message.includes('2601') ||
            message.includes('23505');
        return mentionsUniqueViolation;
    }

    /**
     * Validates all credential fields against their schema constraints.
     * Returns array of error messages (empty if all valid).
     */
    private validateAllFields(): string[] {
        const errors: string[] = [];

        for (const field of this.SchemaFields) {
            const value = this.CredentialValues[field.name];
            const stringValue = String(value || '');

            // Skip validation for const fields (they're auto-populated and read-only)
            if (field.const !== undefined) {
                continue;
            }

            // Required field validation (already handled by canSave, but included for completeness)
            if (field.required && !stringValue) {
                errors.push(`${field.title} is required`);
                continue;
            }

            // Skip further validation if field is empty and not required
            if (!stringValue) {
                continue;
            }

            // Enum validation
            if (field.enum && field.enum.length > 0) {
                if (!field.enum.includes(stringValue)) {
                    errors.push(`${field.title} must be one of: ${field.enum.join(', ')}`);
                }
            }

            // Format validation
            if (field.format) {
                const formatError = this.validateFormat(field.title, stringValue, field.format);
                if (formatError) {
                    errors.push(formatError);
                }
            }

            // Pattern validation
            if (field.pattern) {
                try {
                    const regex = new RegExp(field.pattern);
                    if (!regex.test(stringValue)) {
                        errors.push(`${field.title} does not match required pattern`);
                    }
                } catch (e) {
                    console.error(`Invalid regex pattern for ${field.name}:`, e);
                }
            }

            // Length validation
            if (field.minLength !== undefined && stringValue.length < field.minLength) {
                errors.push(`${field.title} must be at least ${field.minLength} characters`);
            }
            if (field.maxLength !== undefined && stringValue.length > field.maxLength) {
                errors.push(`${field.title} must be no more than ${field.maxLength} characters`);
            }

            // Numeric range validation (if type is number or integer)
            if (field.type === 'number' || field.type === 'integer') {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                    if (field.minimum !== undefined && numValue < field.minimum) {
                        errors.push(`${field.title} must be at least ${field.minimum}`);
                    }
                    if (field.maximum !== undefined && numValue > field.maximum) {
                        errors.push(`${field.title} must be no more than ${field.maximum}`);
                    }
                }
            }
        }

        return errors;
    }

    /**
     * Cleans credential values before saving by removing:
     * - "undefined" string values
     * - Empty strings for non-required fields
     * - null and undefined values
     */
    private cleanCredentialValues(): CredentialValues {
        const cleaned: CredentialValues = {};

        for (const field of this.SchemaFields) {
            const value = this.CredentialValues[field.name];

            // Skip "undefined" strings
            if (value === 'undefined') {
                continue;
            }

            // Skip null and undefined
            if (value === null || value === undefined) {
                continue;
            }

            // Skip empty strings for non-required fields (but keep empty strings for required fields)
            if (value === '' && !field.required) {
                continue;
            }

            // Keep all other values
            cleaned[field.name] = value;
        }

        return cleaned;
    }
}
