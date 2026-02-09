import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CredentialCategoryEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

@Component({
  standalone: false,
    selector: 'mj-credential-category-edit-panel',
    templateUrl: './credential-category-edit-panel.component.html',
    styleUrls: ['./credential-category-edit-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialCategoryEditPanelComponent implements OnInit {
    @Input() category: CredentialCategoryEntity | null = null;
    @Input() isOpen = false;

    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<CredentialCategoryEntity>();
    @Output() deleted = new EventEmitter<string>();

    public isLoading = false;
    public isSaving = false;
    public isNew = false;

    // All categories for parent selection
    public allCategories: CredentialCategoryEntity[] = [];

    // Form fields
    public name = '';
    public description = '';
    public parentId = '';
    public iconClass = '';

    // Icon suggestions
    public iconSuggestions: { icon: string; label: string }[] = [
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

    private _metadata = new Metadata();

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        this.loadCategories();
    }

    public get panelTitle(): string {
        return this.isNew ? 'Create Category' : 'Edit Category';
    }

    public get canSave(): boolean {
        return this.name.trim().length > 0;
    }

    public get availableParentCategories(): CredentialCategoryEntity[] {
        // Exclude the current category and its descendants from parent options
        if (!this.category || this.isNew) {
            return this.allCategories;
        }

        const currentId = this.category.ID;
        const descendantIds = this.getDescendantIds(currentId);
        descendantIds.add(currentId);

        return this.allCategories.filter(c => !descendantIds.has(c.ID));
    }

    private getDescendantIds(categoryId: string): Set<string> {
        const descendants = new Set<string>();
        const findChildren = (parentId: string): void => {
            for (const cat of this.allCategories) {
                if (cat.ParentID === parentId) {
                    descendants.add(cat.ID);
                    findChildren(cat.ID);
                }
            }
        };
        findChildren(categoryId);
        return descendants;
    }

    public async open(category: CredentialCategoryEntity | null, preselectedParentId?: string): Promise<void> {
        this.isLoading = true;
        this.isOpen = true;
        this.category = category;
        this.isNew = !category || !category.ID;
        this.cdr.markForCheck();

        await this.loadCategories();
        this.resetForm();

        if (category && category.ID) {
            this.populateFromCategory(category);
        } else if (preselectedParentId) {
            this.parentId = preselectedParentId;
        }

        this.isLoading = false;
        this.cdr.markForCheck();
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
                this.allCategories = result.Results;
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
        this.cdr.markForCheck();
    }

    private resetForm(): void {
        this.name = '';
        this.description = '';
        this.parentId = '';
        this.iconClass = '';
    }

    private populateFromCategory(category: CredentialCategoryEntity): void {
        this.name = category.Name || '';
        this.description = category.Description || '';
        this.parentId = category.ParentID || '';
        this.iconClass = category.IconClass || '';
    }

    public selectIcon(icon: string): void {
        this.iconClass = icon;
        this.cdr.markForCheck();
    }

    public async save(): Promise<void> {
        if (!this.canSave) {
            MJNotificationService.Instance.CreateSimpleNotification('Please enter a category name', 'warning', 3000);
            return;
        }

        this.isSaving = true;
        this.cdr.markForCheck();

        try {
            let entity: CredentialCategoryEntity;

            if (this.isNew) {
                entity = await this._metadata.GetEntityObject<CredentialCategoryEntity>('MJ: Credential Categories');
            } else {
                entity = this.category!;
            }

            entity.Name = this.name.trim();
            entity.Description = this.description.trim() || null;
            entity.ParentID = this.parentId || null;
            entity.IconClass = this.iconClass.trim() || null;

            const success = await entity.Save();

            if (success) {
                const action = this.isNew ? 'created' : 'updated';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Category "${entity.Name}" ${action} successfully`,
                    'success',
                    3000
                );
                this.saved.emit(entity);
                this.closePanel();
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
            this.isSaving = false;
            this.cdr.markForCheck();
        }
    }

    public async deleteCategory(): Promise<void> {
        if (this.isNew || !this.category) return;

        const confirmed = confirm(`Are you sure you want to delete "${this.category.Name}"? This action cannot be undone.`);
        if (!confirmed) return;

        this.isSaving = true;
        this.cdr.markForCheck();

        try {
            const success = await this.category.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Category "${this.category.Name}" deleted successfully`,
                    'success',
                    3000
                );
                this.deleted.emit(this.category.ID);
                this.closePanel();
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
            this.isSaving = false;
            this.cdr.markForCheck();
        }
    }

    public closePanel(): void {
        this.isOpen = false;
        this.category = null;
        this.resetForm();
        this.close.emit();
        this.cdr.markForCheck();
    }

    public onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('panel-backdrop')) {
            this.closePanel();
        }
    }

    public getParentPath(categoryId: string): string {
        const parts: string[] = [];
        let current = this.allCategories.find(c => c.ID === categoryId);

        while (current) {
            parts.unshift(current.Name);
            current = current.ParentID ? this.allCategories.find(c => c.ID === current!.ParentID) : undefined;
        }

        return parts.join(' / ');
    }
}
