import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { MJTemplateEntity, MJTemplateContentEntity, MJTemplateCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent, CUSTOM_LAYOUT_TOOLBAR_CONFIG } from '@memberjunction/ng-base-forms';
import { MJTemplateFormComponent } from '../../generated/Entities/MJTemplate/mjtemplate.form.component';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { Subject } from 'rxjs';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { CodeEditorComponent } from '@memberjunction/ng-code-editor';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { TemplateEditorConfig, TemplateEditorComponent } from '../../shared/components/template-editor.component';

@RegisterClass(BaseFormComponent, 'MJ: Templates') 
@Component({
  standalone: false,
    selector: 'mj-templates-form',
    templateUrl: './templates-form.component.html',
    styleUrls: ['../../../shared/form-styles.css', './templates-form.component.css']
})
export class MJTemplateFormComponentExtended extends MJTemplateFormComponent implements OnInit, OnDestroy, AfterViewInit {
    public record!: MJTemplateEntity;
    public readonly ToolbarConfig = CUSTOM_LAYOUT_TOOLBAR_CONFIG;

    /** @deprecated Use {@link ToolbarConfig}. */
    public get toolbarConfig() {
      return this.ToolbarConfig;
    }

    /** Custom-layout Template form looks best full-width on first open. */
    public override getDefaultFormWidthMode(): 'centered' | 'full-width' { return 'full-width'; }

    /**
     * The embedded editor OWNS the template content rows: it loads them, the user edits its
     * instances, and it saves them. This form delegates to it rather than holding a second copy —
     * a second, separately loaded copy is what silently discarded edits in MJ#4754.
     */
    @ViewChild(TemplateEditorComponent) TemplateEditor: TemplateEditorComponent | undefined;

    /**
     * Read-only mirror of the editor's rows (fed only by {@link OnSharedTemplateContentChange}),
     * kept for the count badges and unsaved-changes flag. Never load or save through it.
     */
    public TemplateContents: MJTemplateContentEntity[] = [];

    /** @deprecated Use {@link TemplateContents}. */
    public get templateContents(): MJTemplateContentEntity[] {
      return this.TemplateContents;
    }
    /** @deprecated Use {@link TemplateContents}. */
    public set templateContents(value: MJTemplateContentEntity[]) {
      this.TemplateContents = value;
    }
    public SelectedContentIndex: number = 0;

    /** @deprecated Use {@link SelectedContentIndex}. */
    public get selectedContentIndex(): number {
      return this.SelectedContentIndex;
    }
    /** @deprecated Use {@link SelectedContentIndex}. */
    public set selectedContentIndex(value: number) {
      this.SelectedContentIndex = value;
    }
    public IsAddingNewContent: boolean = false;

    /** @deprecated Use {@link IsAddingNewContent}. */
    public get isAddingNewContent(): boolean {
      return this.IsAddingNewContent;
    }
    /** @deprecated Use {@link IsAddingNewContent}. */
    public set isAddingNewContent(value: boolean) {
      this.IsAddingNewContent = value;
    }
    public NewTemplateContent: MJTemplateContentEntity | null = null;

    /** @deprecated Use {@link NewTemplateContent}. */
    public get newTemplateContent(): MJTemplateContentEntity | null {
      return this.NewTemplateContent;
    }
    /** @deprecated Use {@link NewTemplateContent}. */
    public set newTemplateContent(value: MJTemplateContentEntity | null) {
      this.NewTemplateContent = value;
    }
    public HasUnsavedChanges: boolean = false;

    /** @deprecated Use {@link HasUnsavedChanges}. */
    public get hasUnsavedChanges(): boolean {
      return this.HasUnsavedChanges;
    }
    /** @deprecated Use {@link HasUnsavedChanges}. */
    public set hasUnsavedChanges(value: boolean) {
      this.HasUnsavedChanges = value;
    }
    public TemplateInfoExpanded: boolean = true;

    /** @deprecated Use {@link TemplateInfoExpanded}. */
    public get templateInfoExpanded(): boolean {
      return this.TemplateInfoExpanded;
    }
    /** @deprecated Use {@link TemplateInfoExpanded}. */
    public set templateInfoExpanded(value: boolean) {
      this.TemplateInfoExpanded = value;
    }
    public TemplateContentsExpanded: boolean = true;

    /** @deprecated Use {@link TemplateContentsExpanded}. */
    public get templateContentsExpanded(): boolean {
      return this.TemplateContentsExpanded;
    }
    /** @deprecated Use {@link TemplateContentsExpanded}. */
    public set templateContentsExpanded(value: boolean) {
      this.TemplateContentsExpanded = value;
    }
    public CategoryOptions: Array<{text: string, value: string}> = [
        { text: 'Select Category...', value: '' },
        // TODO: Load from database
    ];

    /** @deprecated Use {@link CategoryOptions}. */
    public get categoryOptions(): Array<{text: string, value: string}> {
      return this.CategoryOptions;
    }
    /** @deprecated Use {@link CategoryOptions}. */
    public set categoryOptions(value: Array<{text: string, value: string}>) {
      this.CategoryOptions = value;
    }
    public ContentTypeOptions: Array<{text: string, value: string}> = [];

    /** @deprecated Use {@link ContentTypeOptions}. */
    public get contentTypeOptions(): Array<{text: string, value: string}> {
      return this.ContentTypeOptions;
    }
    /** @deprecated Use {@link ContentTypeOptions}. */
    public set contentTypeOptions(value: Array<{text: string, value: string}>) {
      this.ContentTypeOptions = value;
    }
    public SupportedLanguages: LanguageDescription[] = languages;

    /** @deprecated Use {@link SupportedLanguages}. */
    public get supportedLanguages(): LanguageDescription[] {
      return this.SupportedLanguages;
    }
    /** @deprecated Use {@link SupportedLanguages}. */
    public set supportedLanguages(value: LanguageDescription[]) {
      this.SupportedLanguages = value;
    }
    
    @ViewChild('codeEditor') CodeEditor: CodeEditorComponent | null = null;

    /** @deprecated Use {@link CodeEditor}. */
    get codeEditor(): CodeEditorComponent | null {
      return this.CodeEditor;
    }
    /** @deprecated Use {@link CodeEditor}. */
    set codeEditor(value: CodeEditorComponent | null) {
      this.CodeEditor = value;
    }
    private isUpdatingEditorValue = false;
    public IsRunningTemplate = false;

    /** @deprecated Use {@link IsRunningTemplate}. */
    public get isRunningTemplate() {
      return this.IsRunningTemplate;
    }
    /** @deprecated Use {@link IsRunningTemplate}. */
    public set isRunningTemplate(value) {
      this.IsRunningTemplate = value;
    }
    public TemplateTestResult: string | null = null;

    /** @deprecated Use {@link TemplateTestResult}. */
    public get templateTestResult(): string | null {
      return this.TemplateTestResult;
    }
    /** @deprecated Use {@link TemplateTestResult}. */
    public set templateTestResult(value: string | null) {
      this.TemplateTestResult = value;
    }
    public TemplateTestError: string | null = null;

    /** @deprecated Use {@link TemplateTestError}. */
    public get templateTestError(): string | null {
      return this.TemplateTestError;
    }
    /** @deprecated Use {@link TemplateTestError}. */
    public set templateTestError(value: string | null) {
      this.TemplateTestError = value;
    }
    public ShowParamDialog = false;

    /** @deprecated Use {@link ShowParamDialog}. */
    public get showParamDialog() {
      return this.ShowParamDialog;
    }
    /** @deprecated Use {@link ShowParamDialog}. */
    public set showParamDialog(value) {
      this.ShowParamDialog = value;
    }
    
    // Template editor configuration for shared component
    public TemplateEditorConfig: TemplateEditorConfig = {
        allowEdit: true,
        showRunButton: true,
        compactMode: false
    };

    /** @deprecated Use {@link TemplateEditorConfig}. */
    public get templateEditorConfig(): TemplateEditorConfig {
      return this.TemplateEditorConfig;
    }
    /** @deprecated Use {@link TemplateEditorConfig}. */
    public set templateEditorConfig(value: TemplateEditorConfig) {
      this.TemplateEditorConfig = value;
    }
    
    private destroy$ = new Subject<void>();
    private activeTimeouts: number[] = [];
    private confirmService = inject(MJConfirmService);
    private notificationService = inject(MJNotificationService);

    async ngOnInit() {
        await super.ngOnInit();
        // Template contents are loaded by the embedded editor (see TemplateEditor), not here.
        await this.LoadCategories();
        this.LoadContentTypes();
    }

    /** Also discards the content edits held by the editor, so a later Save cannot persist them. */
    public override CancelEdit(): void {
        super.CancelEdit();
        this.TemplateEditor?.RefreshAndDiscardChanges().catch((error: unknown) => {
            console.error(`Failed to discard template content changes for template ${this.record?.ID}:`, error);
        });
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

    /**
     * Reloads the template contents in the embedded editor (discarding unsaved content edits); the
     * editor's ContentChange then refreshes {@link TemplateContents}. No-op while the editor is not
     * rendered, since it loads the contents itself when it is.
     */
    async LoadTemplateContents() {
        await this.TemplateEditor?.RefreshAndDiscardChanges();
    }

    /** @deprecated Use {@link LoadTemplateContents}. */
    async loadTemplateContents() {
      return this.LoadTemplateContents();
    }

    async CreateDefaultTemplateContent() {
        const md = this.ProviderToUse;
        const defaultContent = await md.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents');
        defaultContent.TemplateID = this.record.ID;
        defaultContent.Priority = 1;
        defaultContent.IsActive = true;
        
        // Set default to first real content type (skip "Select Type..." if it exists)
        const validContentTypes = this.ContentTypeOptions.filter(option => option.value !== '');
        if (validContentTypes.length > 0) {
            defaultContent.TypeID = validContentTypes[0].value;
        }
        
        this.TemplateContents = [defaultContent];
        this.SelectedContentIndex = 0;
        
        // Sync editor value after creating default content
        this.syncEditorValue();
    }

    /** @deprecated Use {@link CreateDefaultTemplateContent}. */
    async createDefaultTemplateContent() {
      return this.CreateDefaultTemplateContent();
    }

    async SelectTemplateContent(index: number, confirmSwitch: boolean = true): Promise<void> {
        // If we're adding new content and user clicks on existing content, ask for confirmation
        if (this.IsAddingNewContent && confirmSwitch) {
            if (!(await this.confirmService.Confirm({
                title: 'Discard changes?',
                message: 'Switch content version and lose your unsaved changes?',
                detail: 'Your changes to the new content version will be lost.'
            }))) {
                return;
            }
        }
        
        if (index >= 0 && index < this.TemplateContents.length) {
            this.SelectedContentIndex = index;
            this.IsAddingNewContent = false;
            // Don't clear newTemplateContent to preserve the work in progress
            
            // Sync editor value when switching content
            this.syncEditorValue();
        }
    }

    /** @deprecated Use {@link SelectTemplateContent}. */
    async selectTemplateContent(index: number, confirmSwitch: boolean = true): Promise<void> {
      return this.SelectTemplateContent(index, confirmSwitch);
    }

    async LoadCategories() {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const results = await rv.RunView({
                EntityName: 'MJ: Template Categories' 
            });
            
            this.CategoryOptions = [
                { text: 'Select Category...', value: '' },
                ...results.Results.map((cat: any) => ({
                    text: cat.Name,
                    value: cat.ID
                }))
            ];
        } catch (error) {
            console.error('Error loading categories:', error);
            this.CategoryOptions = [{ text: 'Select Category...', value: '' }];
        }
    }

    /** @deprecated Use {@link LoadCategories}. */
    async loadCategories() {
      return this.LoadCategories();
    }

    LoadContentTypes() {
        try {
            // Get content types from TemplateEngine cache
            const contentTypes = TemplateEngineBase.Instance.TemplateContentTypes;
            this.ContentTypeOptions = [
                { text: 'Select Type...', value: '' },
                ...contentTypes.map(ct => ({
                    text: ct.Name,
                    value: ct.ID
                }))
            ];
        } catch (error) {
            console.error('Error loading content types:', error);
            // Fallback to basic types
            this.ContentTypeOptions = [
                { text: 'Select Type...', value: '' },
                { text: 'HTML', value: 'HTML' },
                { text: 'Plain Text', value: 'Text' },
                { text: 'Markdown', value: 'Markdown' }
            ];
        }
    }

    /** @deprecated Use {@link LoadContentTypes}. */
    loadContentTypes() {
      return this.LoadContentTypes();
    }

    async OnCategoryChange(value: string) {
        // If it's a new category (string but not in existing options)
        if (value && !this.CategoryOptions.find(opt => opt.value === value)) {
            // Check for duplicate category names (case-insensitive, trimmed)
            if (this.isDuplicateCategory(value)) {
                const existingCategory = this.CategoryOptions.find(option => 
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
                const md = this.ProviderToUse;
                const newCategory = await md.GetEntityObject<MJTemplateCategoryEntity>('MJ: Template Categories');
                newCategory.Name = value.trim();
                newCategory.UserID = this.record.UserID || md.CurrentUser.ID;
                const saved = await newCategory.Save();
                
                if (saved) {
                    // Add to options and set the ID
                    this.CategoryOptions.push({
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

    /** @deprecated Use {@link OnCategoryChange}. */
    async onCategoryChange(value: string) {
      return this.OnCategoryChange(value);
    }

    async AddNewTemplateContent() {
        const md = this.ProviderToUse;
        this.NewTemplateContent = await md.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents');
        this.NewTemplateContent.TemplateID = this.record.ID;
        this.NewTemplateContent.Priority = this.TemplateContents.length + 1;
        this.NewTemplateContent.IsActive = true;
        
        // Set default to first real content type (skip "Select Type..." if it exists)
        const validContentTypes = this.ContentTypeOptions.filter(option => option.value !== '');
        if (validContentTypes.length > 0) {
            this.NewTemplateContent.TypeID = validContentTypes[0].value;
        }
        this.NewTemplateContent.TemplateText = '';
        
        // Add immediately to the array
        this.TemplateContents.push(this.NewTemplateContent);
        this.SelectedContentIndex = this.TemplateContents.length - 1;
        this.IsAddingNewContent = true;
        
        // Sync editor value when adding new content
        this.syncEditorValue();
    }

    /** @deprecated Use {@link AddNewTemplateContent}. */
    async addNewTemplateContent() {
      return this.AddNewTemplateContent();
    }

    CancelNewTemplateContent() {
        this.IsAddingNewContent = false;
        this.NewTemplateContent = null;
    }

    /** @deprecated Use {@link CancelNewTemplateContent}. */
    cancelNewTemplateContent() {
      return this.CancelNewTemplateContent();
    }

    async DeleteTemplateContent(index: number) {
        if (index >= 0 && index < this.TemplateContents.length) {
            const contentToDelete = this.TemplateContents[index];

            if (contentToDelete.ID) {
                try {
                    const result = await contentToDelete.Delete();
                    if (result) {
                        this.TemplateContents.splice(index, 1);
                        
                        // Adjust selected index if necessary
                        if (this.SelectedContentIndex >= this.TemplateContents.length) {
                            this.SelectedContentIndex = Math.max(0, this.TemplateContents.length - 1);
                        }
                        
                        // If no contents remain, create a default one
                        if (this.TemplateContents.length === 0) {
                            await this.CreateDefaultTemplateContent();
                        }
                    } else {
                        console.error('Delete returned false');
                        MJNotificationService.Instance.CreateSimpleNotification(`Failed to delete template content. ${contentToDelete.LatestResult.CompleteMessage}`, 'error');
                    }
                } catch (error) {
                    console.error('Error deleting template content:', error);
                }
            } else {
                // Not saved yet, just remove from array
                this.TemplateContents.splice(index, 1);
                if (this.SelectedContentIndex >= this.TemplateContents.length) {
                    this.SelectedContentIndex = Math.max(0, this.TemplateContents.length - 1);
                }
                
                // Reset adding new content state if we're deleting the new content
                if (this.IsAddingNewContent && index === this.TemplateContents.length) {
                    this.IsAddingNewContent = false;
                    this.NewTemplateContent = null;
                }
            }
        } else {
            console.error('Invalid index for deletion:', index);
        }
    }

    /** @deprecated Use {@link DeleteTemplateContent}. */
    async deleteTemplateContent(index: number) {
      return this.DeleteTemplateContent(index);
    }

    get CurrentTemplateContent(): MJTemplateContentEntity | null {
        if (this.IsAddingNewContent) {
            return this.NewTemplateContent;
        }
        return this.TemplateContents[this.SelectedContentIndex] || null;
    }

    /** @deprecated Use {@link CurrentTemplateContent}. */
    get currentTemplateContent(): MJTemplateContentEntity | null {
      return this.CurrentTemplateContent;
    }

    get HasMultipleContents(): boolean {
        return this.TemplateContents.length > 1 || this.IsAddingNewContent;
    }

    /** @deprecated Use {@link HasMultipleContents}. */
    get hasMultipleContents(): boolean {
      return this.HasMultipleContents;
    }

    OnContentTypeChange() {
        // Content type changes just modify the current content, no new record creation
        this.updateUnsavedChangesFlag();
    }

    /** @deprecated Use {@link OnContentTypeChange}. */
    onContentTypeChange() {
      return this.OnContentTypeChange();
    }

    OnContentChange() {
        this.updateUnsavedChangesFlag();
    }

    /** @deprecated Use {@link OnContentChange}. */
    onContentChange() {
      return this.OnContentChange();
    }

    /**
     * Updates the hasUnsavedChanges flag based on entity dirty states
     */
    private updateUnsavedChangesFlag() {
        this.HasUnsavedChanges = this.TemplateContents.some(content => content.Dirty) || 
                                this.IsAddingNewContent ||
                                this.record?.Dirty || false;
    }

    OnTemplateTextChange(event: any) {
        if (this.isUpdatingEditorValue) {
            // Ignore change events when we're programmatically updating the editor
            return;
        }
        
        if (this.CurrentTemplateContent) {
            // Extract value from event - might be event.target.value or just event depending on component
            const value = typeof event === 'string' ? event : (event.target?.value || event);
            this.CurrentTemplateContent.TemplateText = value;
            // hasUnsavedChanges is automatically handled by entity's IsDirty flag
            this.updateUnsavedChangesFlag();
        }
    }

    /** @deprecated Use {@link OnTemplateTextChange}. */
    onTemplateTextChange(event: any) {
      return this.OnTemplateTextChange(event);
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
                if (!this.CodeEditor) {
                    return;
                }
                
                this.isUpdatingEditorValue = true;
                const newValue = this.CurrentTemplateContent?.TemplateText || '';
                
                // Use the setValue method from mj-code-editor component
                this.CodeEditor.setValue(newValue);  
                this.isUpdatingEditorValue = false;
            }, 0);
        });
    }

    /**
     * Saves the template contents through the embedded editor, which owns the rows the user edited
     * and reports its own failures.
     */
    async SaveTemplateContents(): Promise<boolean> {
        if (this.TemplateEditor) {
            return this.TemplateEditor.SaveTemplateContents();
        }
        // No editor rendered means no edits were made through one. Unsaved rows here anyway mean
        // something outside the editor changed them; saving this mirror is what lost edits before
        // (MJ#4754), so refuse loudly rather than guess.
        if (!this.TemplateContents.some(c => c.Dirty || !c.ID)) {
            return true;
        }
        console.error(`Cannot save template contents for template ${this.record?.ID}: the template editor is not rendered, but there are unsaved content rows`);
        this.notificationService.CreateSimpleNotification('Template contents could not be saved: the template editor is not available. Reload the template and try again.', 'error', 5000);
        return false;
    }

    /** @deprecated Use {@link SaveTemplateContents}. */
    async saveTemplateContents(): Promise<boolean> {
      return this.SaveTemplateContents();
    }

    async SaveRecord(StopEditModeAfterSave: boolean = true): Promise<boolean> {
        // Check if we need to create a new category first
        if (this.record.CategoryID && !this.CategoryOptions.find(opt => opt.value === this.record.CategoryID)) {
            // Check for duplicate category names (case-insensitive, trimmed)
            if (this.isDuplicateCategory(this.record.CategoryID)) {
                const existingCategory = this.CategoryOptions.find(option => 
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
                    const md = this.ProviderToUse;
                    const newCategory = await md.GetEntityObject<MJTemplateCategoryEntity>('MJ: Template Categories');
                    newCategory.Name = this.record.CategoryID.trim(); // CategoryID contains the new category name, trim it
                    newCategory.UserID = this.record.UserID || md.CurrentUser.ID;  
                    const saved = await newCategory.Save();
                    
                    if (saved) {
                        // Add to options and set the ID
                        this.CategoryOptions.push({
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
            const md = this.ProviderToUse;
            this.record.UserID = md.CurrentUser.ID;
        }
        const templateSaved = await super.SaveRecord(StopEditModeAfterSave);
        
        if (templateSaved) {
            // Then save all template contents
            return await this.SaveTemplateContents();
        }
        
        return false;
    }

    GetContentTypeDisplayText(typeId: string): string {
        if (!typeId) return '-';
        const option = this.ContentTypeOptions.find(opt => opt.value === typeId);
        return option ? option.text : typeId;
    }

    /** @deprecated Use {@link GetContentTypeDisplayText}. */
    getContentTypeDisplayText(typeId: string): string {
      return this.GetContentTypeDisplayText(typeId);
    }

    GetEditorLanguage(): string {
        if (!this.CurrentTemplateContent?.TypeID) {
            return 'jinja2'; // default to jinja2 for template syntax (compatible with Nunjucks)
        }

        const contentType = this.CurrentTemplateContent.TypeID.toLowerCase();
        
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

    /** @deprecated Use {@link GetEditorLanguage}. */
    getEditorLanguage(): string {
      return this.GetEditorLanguage();
    }

    private isDuplicateCategory(categoryName: string): boolean {
        const normalizedName = categoryName.trim().toLowerCase();
        return this.CategoryOptions.some(option => 
            option.text && option.text.trim().toLowerCase() === normalizedName
        );
    }

    /**
     * Test run the current template using the parameter dialog
     */
    async RunTemplate() {
        if (!this.record?.IsSaved || !this.CurrentTemplateContent) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the template before running it.', 
                'warning'
            );
            return;
        }

        // Save any unsaved changes first
        if (this.HasUnsavedChanges) {
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
        this.ShowParamDialog = true;
    }

    /** @deprecated Use {@link RunTemplate}. */
    async runTemplate() {
      return this.RunTemplate();
    }

    /**
     * Handle parameter dialog close
     */
    OnParamDialogClose() {
        this.ShowParamDialog = false;
    }

    /** @deprecated Use {@link OnParamDialogClose}. */
    onParamDialogClose() {
      return this.OnParamDialogClose();
    }

    GetContentTypeOptionsForContent(): Array<{text: string, value: string}> {
        // Always exclude "Select Type..." option for all content
        return this.ContentTypeOptions.filter(option => option.value !== '');
    }

    /** @deprecated Use {@link GetContentTypeOptionsForContent}. */
    getContentTypeOptionsForContent(): Array<{text: string, value: string}> {
      return this.GetContentTypeOptionsForContent();
    }

    /**
     * Handles template content changes from the shared editor
     */
    public OnSharedTemplateContentChange(content: MJTemplateContentEntity[]) {
        this.TemplateContents = content;
        this.updateUnsavedChangesFlag();
    }

    /** @deprecated Use {@link OnSharedTemplateContentChange}. */
    public onSharedTemplateContentChange(content: MJTemplateContentEntity[]) {
      return this.OnSharedTemplateContentChange(content);
    }

    /**
     * Handles template run requests from the shared editor
     */
    public OnSharedTemplateRun(template: MJTemplateEntity) {
        this.RunTemplate();
    }

    /** @deprecated Use {@link OnSharedTemplateRun}. */
    public onSharedTemplateRun(template: MJTemplateEntity) {
      return this.OnSharedTemplateRun(template);
    }

} 
