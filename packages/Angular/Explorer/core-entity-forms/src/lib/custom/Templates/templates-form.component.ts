import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { TemplateEntity, TemplateContentEntity, TemplateCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { TemplateFormComponent } from '../../generated/Entities/Template/template.form.component';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { Subject } from 'rxjs';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { CodeEditorComponent } from '@memberjunction/ng-code-editor';
import { TemplateEditorConfig } from '../../shared/components/template-editor.component';

@RegisterClass(BaseFormComponent, 'Templates') 
@Component({
    selector: 'mj-templates-form',
    templateUrl: './templates-form.component.html',
    styleUrls: ['../../../shared/form-styles.css']
})
export class TemplatesFormExtendedComponent extends TemplateFormComponent implements OnInit, OnDestroy, AfterViewInit {
    public record!: TemplateEntity;
    public templateContents: TemplateContentEntity[] = [];
    public selectedContentIndex: number = 0;
    public isAddingNewContent: boolean = false;
    public newTemplateContent: TemplateContentEntity | null = null;
    public hasUnsavedChanges: boolean = false;
    public templateInfoExpanded: boolean = true;
    public templateContentsExpanded: boolean = true;
    public categoryOptions: Array<{text: string, value: string}> = [
        { text: 'Select Category...', value: '' },
        // TODO: Load from database
    ];
    public contentTypeOptions: Array<{text: string, value: string}> = [];
    public supportedLanguages: LanguageDescription[] = languages;
    
    @ViewChild('codeEditor') codeEditor: CodeEditorComponent | null = null;
    private isUpdatingEditorValue = false;
    public isRunningTemplate = false;
    public templateTestResult: string | null = null;
    public templateTestError: string | null = null;
    public showParamDialog = false;
    
    // Template editor configuration for shared component
    public templateEditorConfig: TemplateEditorConfig = {
        allowEdit: true,
        showRunButton: true,
        compactMode: false
    };
    
    private destroy$ = new Subject<void>();
    private activeTimeouts: number[] = [];

    async ngOnInit() {
        await super.ngOnInit();
        await this.loadTemplateContents();
        await this.loadCategories();
        this.loadContentTypes();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
        
        // Clean up any active timeouts
        this.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.activeTimeouts.length = 0;
    }

    ngAfterViewInit() {
        // Initial sync when view is ready
        this.syncEditorValue();
    }

    async loadTemplateContents() {
        if (this.record && this.record.ID) {
            try {
                const rv = new RunView();
                const results = await rv.RunView<TemplateContentEntity>({
                    EntityName: 'Template Contents',
                    ExtraFilter: `TemplateID='${this.record.ID}'`,
                    OrderBy: 'Priority ASC, __mj_CreatedAt ASC',
                    ResultType: 'entity_object'
                });
                
                this.templateContents = results.Results;
                
                // If we have contents but no selection, select the first one
                if (this.templateContents.length > 0 && this.selectedContentIndex === 0) {
                    this.selectedContentIndex = 0;
                }
                
                // If no template contents exist, create a default one for single-content optimization
                if (this.templateContents.length === 0) {
                    await this.createDefaultTemplateContent();
                }

                // Entity change tracking is handled automatically by BaseEntity
                
                // Sync editor value after loading content
                this.syncEditorValue();
            } catch (error) {
                console.error('Error loading template contents:', error);
            }
        }
    }

    async createDefaultTemplateContent() {
        const md = new Metadata();
        const defaultContent = await md.GetEntityObject<TemplateContentEntity>('Template Contents');
        defaultContent.TemplateID = this.record.ID;
        defaultContent.Priority = 1;
        defaultContent.IsActive = true;
        
        // Set default to first real content type (skip "Select Type..." if it exists)
        const validContentTypes = this.contentTypeOptions.filter(option => option.value !== '');
        if (validContentTypes.length > 0) {
            defaultContent.TypeID = validContentTypes[0].value;
        }
        
        this.templateContents = [defaultContent];
        this.selectedContentIndex = 0;
        
        // Sync editor value after creating default content
        this.syncEditorValue();
    }

    selectTemplateContent(index: number, confirmSwitch: boolean = true) {
        // If we're adding new content and user clicks on existing content, ask for confirmation
        if (this.isAddingNewContent && confirmSwitch) {
            if (!confirm('You have unsaved changes to a new content version. Are you sure you want to switch? Your changes will be lost.')) {
                return;
            }
        }
        
        if (index >= 0 && index < this.templateContents.length) {
            this.selectedContentIndex = index;
            this.isAddingNewContent = false;
            // Don't clear newTemplateContent to preserve the work in progress
            
            // Sync editor value when switching content
            this.syncEditorValue();
        }
    }

    async loadCategories() {
        try {
            const rv = new RunView();
            const results = await rv.RunView({
                EntityName: 'Template Categories' 
            });
            
            this.categoryOptions = [
                { text: 'Select Category...', value: '' },
                ...results.Results.map((cat: any) => ({
                    text: cat.Name,
                    value: cat.ID
                }))
            ];
        } catch (error) {
            console.error('Error loading categories:', error);
            this.categoryOptions = [{ text: 'Select Category...', value: '' }];
        }
    }

    loadContentTypes() {
        try {
            // Get content types from TemplateEngine cache
            const contentTypes = TemplateEngineBase.Instance.TemplateContentTypes;
            this.contentTypeOptions = [
                { text: 'Select Type...', value: '' },
                ...contentTypes.map(ct => ({
                    text: ct.Name,
                    value: ct.ID
                }))
            ];
        } catch (error) {
            console.error('Error loading content types:', error);
            // Fallback to basic types
            this.contentTypeOptions = [
                { text: 'Select Type...', value: '' },
                { text: 'HTML', value: 'HTML' },
                { text: 'Plain Text', value: 'Text' },
                { text: 'Markdown', value: 'Markdown' }
            ];
        }
    }

    async onCategoryChange(value: string) {
        // If it's a new category (string but not in existing options)
        if (value && !this.categoryOptions.find(opt => opt.value === value)) {
            // Check for duplicate category names (case-insensitive, trimmed)
            if (this.isDuplicateCategory(value)) {
                const existingCategory = this.categoryOptions.find(option => 
                    option.text && option.text.trim().toLowerCase() === value.trim().toLowerCase()
                );
                if (existingCategory) {
                    // Use the existing category instead
                    this.record.CategoryID = existingCategory.value;
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Category "${existingCategory.text}" already exists. Using existing category.`, 
                        'warning'
                    );
                }
                return;
            }

            try {
                // Create new category with trimmed name
                const md = new Metadata();
                const newCategory = await md.GetEntityObject<TemplateCategoryEntity>('Template Categories');
                newCategory.Name = value.trim();
                newCategory.UserID = this.record.UserID || md.CurrentUser.ID;
                const saved = await newCategory.Save();
                
                if (saved) {
                    // Add to options and set the ID
                    this.categoryOptions.push({
                        text: newCategory.Name,
                        value: newCategory.ID
                    });
                    this.record.CategoryID = newCategory.ID;
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `New category "${newCategory.Name}" created successfully.`, 
                        'success'
                    );
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Failed to create new category. ${newCategory.LatestResult?.CompleteMessage || ''}`, 
                        'error'
                    );
                }
            } catch (error) {
                console.error('Error creating new category:', error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Error creating new category. Please try again.', 
                    'error'
                );
            }
        }
    }

    async addNewTemplateContent() {
        const md = new Metadata();
        this.newTemplateContent = await md.GetEntityObject<TemplateContentEntity>('Template Contents');
        this.newTemplateContent.TemplateID = this.record.ID;
        this.newTemplateContent.Priority = this.templateContents.length + 1;
        this.newTemplateContent.IsActive = true;
        
        // Set default to first real content type (skip "Select Type..." if it exists)
        const validContentTypes = this.contentTypeOptions.filter(option => option.value !== '');
        if (validContentTypes.length > 0) {
            this.newTemplateContent.TypeID = validContentTypes[0].value;
        }
        this.newTemplateContent.TemplateText = '';
        
        // Add immediately to the array
        this.templateContents.push(this.newTemplateContent);
        this.selectedContentIndex = this.templateContents.length - 1;
        this.isAddingNewContent = true;
        
        // Sync editor value when adding new content
        this.syncEditorValue();
    }

    cancelNewTemplateContent() {
        this.isAddingNewContent = false;
        this.newTemplateContent = null;
    }

    async deleteTemplateContent(index: number) {
        console.log('deleteTemplateContent called with index:', index);
        console.log('templateContents length:', this.templateContents.length);
        
        if (index >= 0 && index < this.templateContents.length) {
            const contentToDelete = this.templateContents[index];
            console.log('Content to delete:', contentToDelete);
            
            if (contentToDelete.ID) {
                try {
                    console.log('Attempting to delete content with ID:', contentToDelete.ID);
                    const result = await contentToDelete.Delete();
                    console.log('Delete result:', result);
                    if (result) {
                        this.templateContents.splice(index, 1);
                        
                        // Adjust selected index if necessary
                        if (this.selectedContentIndex >= this.templateContents.length) {
                            this.selectedContentIndex = Math.max(0, this.templateContents.length - 1);
                        }
                        
                        // If no contents remain, create a default one
                        if (this.templateContents.length === 0) {
                            await this.createDefaultTemplateContent();
                        }
                        console.log('Content deleted successfully');
                    } else {
                        console.error('Delete returned false');
                        MJNotificationService.Instance.CreateSimpleNotification(`Failed to delete template content. ${contentToDelete.LatestResult.CompleteMessage}`, 'error');
                    }
                } catch (error) {
                    console.error('Error deleting template content:', error);
                }
            } else {
                // Not saved yet, just remove from array
                console.log('Removing unsaved content from array');
                this.templateContents.splice(index, 1);
                if (this.selectedContentIndex >= this.templateContents.length) {
                    this.selectedContentIndex = Math.max(0, this.templateContents.length - 1);
                }
                
                // Reset adding new content state if we're deleting the new content
                if (this.isAddingNewContent && index === this.templateContents.length) {
                    this.isAddingNewContent = false;
                    this.newTemplateContent = null;
                }
                console.log('Unsaved content removed successfully');
            }
        } else {
            console.error('Invalid index for deletion:', index);
        }
    }


    get currentTemplateContent(): TemplateContentEntity | null {
        if (this.isAddingNewContent) {
            return this.newTemplateContent;
        }
        return this.templateContents[this.selectedContentIndex] || null;
    }

    get hasMultipleContents(): boolean {
        return this.templateContents.length > 1 || this.isAddingNewContent;
    }

    onContentTypeChange() {
        // Content type changes just modify the current content, no new record creation
        this.updateUnsavedChangesFlag();
    }

    onContentChange() {
        this.updateUnsavedChangesFlag();
    }

    /**
     * Updates the hasUnsavedChanges flag based on entity dirty states
     */
    private updateUnsavedChangesFlag() {
        this.hasUnsavedChanges = this.templateContents.some(content => content.Dirty) || 
                                this.isAddingNewContent ||
                                this.record?.Dirty || false;
    }

    onTemplateTextChange(event: any) {
        if (this.isUpdatingEditorValue) {
            // Ignore change events when we're programmatically updating the editor
            return;
        }
        
        if (this.currentTemplateContent) {
            // Extract value from event - might be event.target.value or just event depending on component
            const value = typeof event === 'string' ? event : (event.target?.value || event);
            this.currentTemplateContent.TemplateText = value;
            // hasUnsavedChanges is automatically handled by entity's IsDirty flag
            this.updateUnsavedChangesFlag();
        }
    }

    /**
     * Helper method to track setTimeout calls for cleanup
     */
    private setTrackedTimeout(callback: () => void, delay: number): number {
        const timeoutId = setTimeout(() => {
            // Remove from tracking when it executes
            const index = this.activeTimeouts.indexOf(timeoutId);
            if (index > -1) {
                this.activeTimeouts.splice(index, 1);
            }
            callback();
        }, delay) as any as number;
        this.activeTimeouts.push(timeoutId);
        return timeoutId;
    }

    /**
     * Manually sync the editor value without triggering change events
     */
    private syncEditorValue() {
        // Use Promise.resolve() to wait for the next microtask after any pending changes
        Promise.resolve().then(() => {
            // Then tracked setTimeout for the next macrotask to ensure DOM is updated
            this.setTrackedTimeout(() => {
                if (!this.codeEditor) {
                    console.log('Code editor ViewChild is null - element may not be rendered yet');
                    console.log('currentTemplateContent exists:', !!this.currentTemplateContent);
                    return;
                }
                
                this.isUpdatingEditorValue = true;
                const newValue = this.currentTemplateContent?.TemplateText || '';
                
                // Use the setValue method from mj-code-editor component
                this.codeEditor.setValue(newValue);  
                this.isUpdatingEditorValue = false;
            }, 0);
        });
    }

    async saveTemplateContents(): Promise<boolean> {
        try {
            // Save all template contents that have changes
            for (const content of this.templateContents) {
                content.TemplateID = this.record.ID; // Ensure FK is set
                if (content.Dirty || !content.ID) {
                    const contentResult = await content.Save();
                    if (!contentResult) {
                        console.error('Failed to save template content:', content);
                        return false;
                    }
                }
            }

            this.isAddingNewContent = false;
            this.newTemplateContent = null;
            this.updateUnsavedChangesFlag(); // Update based on current entity states
            return true;
        } catch (error) {
            console.error('Error saving template contents:', error);
            return false;
        }
    }

    async SaveRecord(StopEditModeAfterSave: boolean = true): Promise<boolean> {
        // Check if we need to create a new category first
        if (this.record.CategoryID && !this.categoryOptions.find(opt => opt.value === this.record.CategoryID)) {
            // Check for duplicate category names (case-insensitive, trimmed)
            if (this.isDuplicateCategory(this.record.CategoryID)) {
                const existingCategory = this.categoryOptions.find(option => 
                    option.text && option.text.trim().toLowerCase() === this.record.CategoryID?.trim().toLowerCase()
                );
                if (existingCategory) {
                    // Use the existing category instead
                    this.record.CategoryID = existingCategory.value;
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Category "${existingCategory.text}" already exists. Using existing category.`, 
                        'warning'
                    );
                }
            } else {
                try {
                    // Create new category with trimmed name
                    const md = new Metadata();
                    const newCategory = await md.GetEntityObject<TemplateCategoryEntity>('Template Categories');
                    newCategory.Name = this.record.CategoryID.trim(); // CategoryID contains the new category name, trim it
                    newCategory.UserID = this.record.UserID || md.CurrentUser.ID;  
                    const saved = await newCategory.Save();
                    
                    if (saved) {
                        // Add to options and set the ID
                        this.categoryOptions.push({
                            text: newCategory.Name,
                            value: newCategory.ID
                        });
                        this.record.CategoryID = newCategory.ID;
                    } else {
                        console.error('Failed to create new category');
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to create new category. ${newCategory.LatestResult?.CompleteMessage || ''}`, 
                            'error'
                        );
                        return false;
                    }
                } catch (error) {
                    console.error('Error creating new category during save:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error creating new category during save. Please try again.', 
                        'error'
                    );
                    return false;
                }
            }
        }

        // Call the parent save method to save the template
        // Before saving, if a new record, make sure the UserID is set
        if (!this.record.IsSaved && !this.record.UserID) {
            const md = new Metadata();
            this.record.UserID = md.CurrentUser.ID;
        }
        const templateSaved = await super.SaveRecord(StopEditModeAfterSave);
        
        if (templateSaved) {
            // Then save all template contents
            return await this.saveTemplateContents();
        }
        
        return false;
    }


    getContentTypeDisplayText(typeId: string): string {
        if (!typeId) return '-';
        const option = this.contentTypeOptions.find(opt => opt.value === typeId);
        return option ? option.text : typeId;
    }

    getEditorLanguage(): string {
        if (!this.currentTemplateContent?.TypeID) {
            return 'jinja2'; // default to jinja2 for template syntax (compatible with Nunjucks)
        }

        const contentType = this.currentTemplateContent.TypeID.toLowerCase();
        
        // Map content types to CodeMirror language modes
        switch (contentType) {
            case 'html':
                return 'jinja2'; // Use jinja2 for HTML templates to get template syntax highlighting
            case 'markdown':
            case 'md':
                return 'markdown';
            case 'javascript':
            case 'js':
                return 'javascript';
            case 'css':
                return 'css';
            case 'json':
                return 'json';
            case 'xml':
                return 'xml';
            case 'sql':
                return 'sql';
            case 'text':
            case 'plain':
            default:
                return 'jinja2'; // Default to jinja2 since templates often contain template syntax
        }
    }

    private isDuplicateCategory(categoryName: string): boolean {
        const normalizedName = categoryName.trim().toLowerCase();
        return this.categoryOptions.some(option => 
            option.text && option.text.trim().toLowerCase() === normalizedName
        );
    }

    /**
     * Test run the current template using the parameter dialog
     */
    async runTemplate() {
        if (!this.record?.IsSaved || !this.currentTemplateContent) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the template before running it.', 
                'warning'
            );
            return;
        }

        // Save any unsaved changes first
        if (this.hasUnsavedChanges) {
            const saveResult = await this.SaveRecord(false); // Don't exit edit mode
            if (!saveResult) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to save template changes.', 
                    'error'
                );
                return;
            }
        }

        // Show the parameter dialog
        this.showParamDialog = true;
    }

    /**
     * Handle parameter dialog close
     */
    onParamDialogClose() {
        this.showParamDialog = false;
    }

    getContentTypeOptionsForContent(): Array<{text: string, value: string}> {
        // Always exclude "Select Type..." option for all content
        return this.contentTypeOptions.filter(option => option.value !== '');
    }

    /**
     * Handles template content changes from the shared editor
     */
    public onSharedTemplateContentChange(content: TemplateContentEntity[]) {
        this.templateContents = content;
        this.updateUnsavedChangesFlag();
    }

    /**
     * Handles template run requests from the shared editor
     */
    public onSharedTemplateRun(template: TemplateEntity) {
        this.runTemplate();
    }

} 

export function LoadTemplatesFormExtendedComponent() {
    // prevents tree shaking
}