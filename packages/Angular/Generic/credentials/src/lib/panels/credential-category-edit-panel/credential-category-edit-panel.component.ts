import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { MJCredentialCategoryEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

@Component({
  standalone: false,
    selector: 'mj-credential-category-edit-panel',
    templateUrl: './credential-category-edit-panel.component.html',
    styleUrls: ['./credential-category-edit-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialCategoryEditPanelComponent extends BaseAngularComponent implements OnInit {
    @Input() category: MJCredentialCategoryEntity | null = null;
    @Input() IsOpen = false;

    /** @deprecated Use {@link IsOpen}. */
    @Input() set isOpen(value: CredentialCategoryEditPanelComponent['IsOpen']) {
      this.IsOpen = value;
    }
    /** @deprecated Use {@link IsOpen}. */
    get isOpen(): CredentialCategoryEditPanelComponent['IsOpen'] {
      return this.IsOpen;
    }

    @Output() close = new EventEmitter<void>();
    @Output() Saved = new EventEmitter<MJCredentialCategoryEntity>();

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

    // All categories for parent selection
    public AllCategories: MJCredentialCategoryEntity[] = [];

    /** @deprecated Use {@link AllCategories}. */
    public get allCategories(): MJCredentialCategoryEntity[] {
      return this.AllCategories;
    }
    /** @deprecated Use {@link AllCategories}. */
    public set allCategories(value: MJCredentialCategoryEntity[]) {
      this.AllCategories = value;
    }

    // Form fields
    public name = '';
    public description = '';
    public ParentId = '';

    /** @deprecated Use {@link ParentId}. */
    public get parentId() {
      return this.ParentId;
    }
    /** @deprecated Use {@link ParentId}. */
    public set parentId(value) {
      this.ParentId = value;
    }
    public IconClass = '';

    /** @deprecated Use {@link IconClass}. */
    public get iconClass() {
      return this.IconClass;
    }
    /** @deprecated Use {@link IconClass}. */
    public set iconClass(value) {
      this.IconClass = value;
    }

    // Icon suggestions
    public IconSuggestions: { icon: string; label: string }[] = [
        { icon: 'fa-solid fa-folder', label: 'Folder' },
        { icon: 'fa-solid fa-lock', label: 'Lock' },
        { icon: 'fa-solid fa-shield-halved', label: 'Shield' },
        { icon: 'fa-solid fa-key', label: 'Key' },
        { icon: 'fa-solid fa-cloud', label: 'Cloud' },
        { icon: 'fa-solid fa-database', label: 'Database' },
        { icon: 'fa-solid fa-brain', label: 'AI' },
        { icon: 'fa-solid fa-envelope', label: 'Email' },
        { icon: 'fa-solid fa-plug', label: 'Integration' },
        { icon: 'fa-solid fa-server', label: 'Server' },
        { icon: 'fa-solid fa-code', label: 'Code' },
        { icon: 'fa-solid fa-globe', label: 'Web' }
    ];

    /** @deprecated Use {@link IconSuggestions}. */
    public get iconSuggestions(): { icon: string; label: string }[] {
      return this.IconSuggestions;
    }
    /** @deprecated Use {@link IconSuggestions}. */
    public set iconSuggestions(value: { icon: string; label: string }[]) {
      this.IconSuggestions = value;
    }

    private get _metadata() { return this.ProviderToUse; }

    constructor(private cdr: ChangeDetectorRef, private confirmService: MJConfirmService) { super(); }

    ngOnInit(): void {
        this.loadCategories();
    }

    public get PanelTitle(): string {
        return this.IsNew ? 'Create Category' : 'Edit Category';
    }

    /** @deprecated Use {@link PanelTitle}. */
    public get panelTitle(): string {
      return this.PanelTitle;
    }

    public get CanSave(): boolean {
        return this.name.trim().length > 0;
    }

    /** @deprecated Use {@link CanSave}. */
    public get canSave(): boolean {
      return this.CanSave;
    }

    public get AvailableParentCategories(): MJCredentialCategoryEntity[] {
        // Exclude the current category and its descendants from parent options
        if (!this.category || this.IsNew) {
            return this.AllCategories;
        }

        const currentId = this.category.ID;
        const descendantIds = this.getDescendantIds(currentId);
        descendantIds.add(currentId);

        return this.AllCategories.filter(c => !descendantIds.has(c.ID));
    }

    /** @deprecated Use {@link AvailableParentCategories}. */
    public get availableParentCategories(): MJCredentialCategoryEntity[] {
      return this.AvailableParentCategories;
    }

    private getDescendantIds(categoryId: string): Set<string> {
        const descendants = new Set<string>();
        const findChildren = (parentId: string): void => {
            for (const cat of this.AllCategories) {
                if (UUIDsEqual(cat.ParentID, parentId)) {
                    descendants.add(cat.ID);
                    findChildren(cat.ID);
                }
            }
        };
        findChildren(categoryId);
        return descendants;
    }

    public async Open(category: MJCredentialCategoryEntity | null, preselectedParentId?: string): Promise<void> {
        this.isLoading = true;
        this.IsOpen = true;
        this.category = category;
        this.IsNew = !category || !category.ID;
        this.cdr.markForCheck();

        await this.loadCategories();
        this.resetForm();

        if (category && category.ID) {
            this.populateFromCategory(category);
        } else if (preselectedParentId) {
            this.ParentId = preselectedParentId;
        }

        this.isLoading = false;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link Open}. */
    public async open(category: MJCredentialCategoryEntity | null, preselectedParentId?: string): Promise<void> {
      return this.Open(category, preselectedParentId);
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
                this.AllCategories = result.Results;
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
        this.cdr.markForCheck();
    }

    private resetForm(): void {
        this.name = '';
        this.description = '';
        this.ParentId = '';
        this.IconClass = '';
    }

    private populateFromCategory(category: MJCredentialCategoryEntity): void {
        this.name = category.Name || '';
        this.description = category.Description || '';
        this.ParentId = category.ParentID || '';
        this.IconClass = category.IconClass || '';
    }

    public SelectIcon(icon: string): void {
        this.IconClass = icon;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link SelectIcon}. */
    public selectIcon(icon: string): void {
      return this.SelectIcon(icon);
    }

    public async save(): Promise<void> {
        if (!this.CanSave) {
            MJNotificationService.Instance.CreateSimpleNotification('Please enter a category name', 'warning', 3000);
            return;
        }

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            let entity: MJCredentialCategoryEntity;

            if (this.IsNew) {
                entity = await this._metadata.GetEntityObject<MJCredentialCategoryEntity>('MJ: Credential Categories');
            } else {
                entity = this.category!;
            }

            entity.Name = this.name.trim();
            entity.Description = this.description.trim() || null;
            entity.ParentID = this.ParentId || null;
            entity.IconClass = this.IconClass.trim() || null;

            const success = await entity.Save();

            if (success) {
                const action = this.IsNew ? 'created' : 'updated';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Category "${entity.Name}" ${action} successfully`,
                    'success',
                    3000
                );
                this.Saved.emit(entity);
                this.ClosePanel();
            } else {
                const errorMessage = entity.LatestResult?.Message || 'Unknown error';
                console.error('Save failed:', errorMessage);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save category: ${errorMessage}`,
                    'error',
                    5000
                );
            }
        } catch (error) {
            console.error('Error saving category:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving category',
                'error',
                3000
            );
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    public async DeleteCategory(): Promise<void> {
        if (this.IsNew || !this.category) return;

        const confirmed = await this.confirmService.ConfirmDelete({ title: 'Delete Category', message: `Delete "${this.category.Name}"?`, detail: 'This action cannot be undone.' });
        if (!confirmed) return;

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            const success = await this.category.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Category "${this.category.Name}" deleted successfully`,
                    'success',
                    3000
                );
                this.Deleted.emit(this.category.ID);
                this.ClosePanel();
            } else {
                const errorMessage = this.category.LatestResult?.Message || 'Unknown error';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to delete category: ${errorMessage}`,
                    'error',
                    5000
                );
            }
        } catch (error) {
            console.error('Error deleting category:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error deleting category',
                'error',
                3000
            );
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    /** @deprecated Use {@link DeleteCategory}. */
    public async deleteCategory(): Promise<void> {
      return this.DeleteCategory();
    }

    public ClosePanel(): void {
        this.IsOpen = false;
        this.category = null;
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

    public GetParentPath(categoryId: string): string {
        const parts: string[] = [];
        let current = this.AllCategories.find(c => UUIDsEqual(c.ID, categoryId));

        while (current) {
            parts.unshift(current.Name);
            current = current.ParentID ? this.AllCategories.find(c => UUIDsEqual(c.ID, current!.ParentID)) : undefined;
        }

        return parts.join(' / ');
    }

    /** @deprecated Use {@link GetParentPath}. */
    public getParentPath(categoryId: string): string {
      return this.GetParentPath(categoryId);
    }
}
