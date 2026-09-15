import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, ViewChild, AfterViewInit } from '@angular/core';
import { MJTemplateEntity, MJTemplateContentEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { CodeEditorComponent } from '@memberjunction/ng-code-editor';
import { Subject } from 'rxjs';
import { DEFAULT_SYSTEM_PLACEHOLDERS, SystemPlaceholder, SYSTEM_PLACEHOLDER_CATEGORIES, SystemPlaceholderCategory } from '@memberjunction/ai-core-plus';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface TemplateEditorConfig {
    allowEdit?: boolean;
    showRunButton?: boolean;
    compactMode?: boolean;
}

@Component({
  standalone: false,
    selector: 'mj-template-editor',
    templateUrl: './template-editor.component.html',
    styleUrls: ['./template-editor.component.css']
})
export class TemplateEditorComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
    @Input() Template: MJTemplateEntity | null = null;

    /** @deprecated Use {@link Template}. */
    @Input() set template(value: MJTemplateEntity | null) {
      this.Template = value;
    }
    /** @deprecated Use {@link Template}. */
    get template(): MJTemplateEntity | null {
      return this.Template;
    }
    @Input() config: TemplateEditorConfig = {
        allowEdit: true,
        showRunButton: false,
        compactMode: false
    };
    
    @Output() ContentChange = new EventEmitter<MJTemplateContentEntity[]>();

    /**
     * @deprecated Use {@link ContentChange}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (contentChange) keeps working. Must stay AFTER ContentChange: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() contentChange = this.ContentChange;
    @Output() RunTemplate = new EventEmitter<MJTemplateEntity>();

    /**
     * @deprecated Use {@link RunTemplate}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (runTemplate) keeps working. Must stay AFTER RunTemplate: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() runTemplate = this.RunTemplate;
    
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
    public IsRunningTemplate = false;

    /** @deprecated Use {@link IsRunningTemplate}. */
    public get isRunningTemplate() {
      return this.IsRunningTemplate;
    }
    /** @deprecated Use {@link IsRunningTemplate}. */
    public set isRunningTemplate(value) {
      this.IsRunningTemplate = value;
    }
    public ActiveHelpTab: 'syntax' | 'placeholders' = 'syntax';

    /** @deprecated Use {@link ActiveHelpTab}. */
    public get activeHelpTab(): 'syntax' | 'placeholders' {
      return this.ActiveHelpTab;
    }
    /** @deprecated Use {@link ActiveHelpTab}. */
    public set activeHelpTab(value: 'syntax' | 'placeholders') {
      this.ActiveHelpTab = value;
    }
    public ActivePlaceholderCategory: string = '';

    /** @deprecated Use {@link ActivePlaceholderCategory}. */
    public get activePlaceholderCategory(): string {
      return this.ActivePlaceholderCategory;
    }
    /** @deprecated Use {@link ActivePlaceholderCategory}. */
    public set activePlaceholderCategory(value: string) {
      this.ActivePlaceholderCategory = value;
    }
    
    // System placeholders organized by category
    public PlaceholderCategories: Array<{
        category: SystemPlaceholderCategory;
        placeholders: SystemPlaceholder[];
    }> = [];

    /** @deprecated Use {@link PlaceholderCategories}. */
    public get placeholderCategories(): Array<{
        category: SystemPlaceholderCategory;
        placeholders: SystemPlaceholder[];
    }> {
      return this.PlaceholderCategories;
    }
    /** @deprecated Use {@link PlaceholderCategories}. */
    public set placeholderCategories(value: Array<{
        category: SystemPlaceholderCategory;
        placeholders: SystemPlaceholder[];
    }>) {
      this.PlaceholderCategories = value;
    }
    
    @ViewChild('codeEditor') codeEditor: CodeEditorComponent | null = null;
    private isUpdatingEditorValue = false;
    private destroy$ = new Subject<void>();
    private get _metadata() { return this.ProviderToUse; }
    private activeTimeouts: number[] = [];
    
    constructor(private notificationService: MJNotificationService, private confirmService: MJConfirmService) {
    super();}

    async ngOnInit() {
        this.LoadContentTypes();
        this.organizePlaceholdersByCategory();
        if (this.Template) {
            await this.LoadTemplateContents();
        }
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes['template']) {
            // Template input has changed, reload contents
            if (this.Template) {
                await this.LoadTemplateContents();
            } else {
                // Template cleared, reset state
                this.TemplateContents = [];
                this.SelectedContentIndex = 0;
                this.IsAddingNewContent = false;
                this.NewTemplateContent = null;
                this.HasUnsavedChanges = false;
            }
        }
    }
    
    private organizePlaceholdersByCategory() {
        // Group placeholders by their category
        this.PlaceholderCategories = SYSTEM_PLACEHOLDER_CATEGORIES.map(category => {
            const categoryPlaceholders = DEFAULT_SYSTEM_PLACEHOLDERS.filter(
                placeholder => placeholder.category === category.name
            );
            
            return {
                category: category,
                placeholders: categoryPlaceholders
            };
        }).filter(cat => cat.placeholders.length > 0); // Only include categories that have placeholders
        
        // Add any uncategorized placeholders to a misc category if needed
        const categorized = DEFAULT_SYSTEM_PLACEHOLDERS.filter(p => p.category);
        const uncategorized = DEFAULT_SYSTEM_PLACEHOLDERS.filter(p => !p.category);
        
        if (uncategorized.length > 0) {
            this.PlaceholderCategories.push({
                category: {
                    name: 'Other',
                    icon: 'fa-ellipsis-h',
                    color: 'var(--mj-text-muted)'
                },
                placeholders: uncategorized
            });
        }
        
        // Set the first category as active
        if (this.PlaceholderCategories.length > 0) {
            this.ActivePlaceholderCategory = this.PlaceholderCategories[0].category.name;
        }
    }
    
    /**
     * Copies a placeholder to the clipboard
     */
    public async CopyPlaceholder(placeholderName: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(`{{ ${placeholderName} }}`);
            this.notificationService.CreateSimpleNotification('Placeholder copied to clipboard!', 'success', 2000);
        } catch (error) {
            console.error('Failed to copy placeholder:', error);
            this.notificationService.CreateSimpleNotification('Failed to copy placeholder', 'error', 3000);
        }
    }

    /** @deprecated Use {@link CopyPlaceholder}. */
    public async copyPlaceholder(placeholderName: string): Promise<void> {
      return this.CopyPlaceholder(placeholderName);
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

    async LoadTemplateContents() {
        if (this.Template) {
            // Reset state first
            this.TemplateContents = [];
            this.SelectedContentIndex = 0;
            this.IsAddingNewContent = false;
            this.NewTemplateContent = null;
            this.HasUnsavedChanges = false;
            
            if (this.Template.IsSaved && this.Template.ID) {
                // Load existing template contents for saved templates
                try {
                    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
                    const results = await rv.RunView<MJTemplateContentEntity>({
                        EntityName: 'MJ: Template Contents',
                        ExtraFilter: `TemplateID='${this.Template.ID}'`,
                        OrderBy: 'Priority ASC, __mj_CreatedAt ASC',
                        ResultType: 'entity_object'
                    });
                    
                    this.TemplateContents = results.Results;
                } catch (error) {
                    console.error('Error loading template contents:', error);
                }
            }
            
            // If we have contents but no selection, select the first one
            if (this.TemplateContents.length > 0) {
                this.SelectedContentIndex = 0;
            }
            
            // If no template contents exist (either new template or saved template with no content), 
            // create a default one for single-content optimization
            if (this.TemplateContents.length === 0) {
                await this.CreateDefaultTemplateContent();
            }

            // Sync editor value after loading content
            this.syncEditorValue();
            this.ContentChange.emit(this.TemplateContents);
        }
    }

    /** @deprecated Use {@link LoadTemplateContents}. */
    async loadTemplateContents() {
      return this.LoadTemplateContents();
    }

    /**
     * Public method to refresh the template editor and discard unsaved changes
     * This should be called when canceling edits to restore the original state
     */
    public async RefreshAndDiscardChanges() {
        await this.LoadTemplateContents();
    }

    /** @deprecated Use {@link RefreshAndDiscardChanges}. */
    public async refreshAndDiscardChanges() {
      return this.RefreshAndDiscardChanges();
    }

    async CreateDefaultTemplateContent() {
        const defaultContent = await this._metadata.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents');
        defaultContent.TemplateID = this.Template!.ID;
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

    async SelectTemplateContent(index: number, confirmSwitch: boolean = true) {
        // If we're adding new content and user clicks on existing content, ask for confirmation
        if (this.IsAddingNewContent && confirmSwitch) {
            if (!(await this.confirmService.Confirm({ title: 'Discard changes?', message: 'Switch content version and lose your unsaved changes?', detail: 'Your changes to the new content version will be lost.' }))) {
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
    async selectTemplateContent(index: number, confirmSwitch: boolean = true) {
      return this.SelectTemplateContent(index, confirmSwitch);
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

    async AddNewTemplateContent() {
        if (!this.config.allowEdit) return;
        
        this.NewTemplateContent = await this._metadata.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents');
        this.NewTemplateContent.TemplateID = this.Template!.ID;
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

    async DeleteTemplateContent(index: number) {
        if (!this.config.allowEdit || index < 0 || index >= this.TemplateContents.length) return;
        
        const contentToDelete = this.TemplateContents[index];
        
        // Check if the entity is actually saved, not just if it has an ID
        if (contentToDelete.IsSaved) {
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
                    
                    this.ContentChange.emit(this.TemplateContents);
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(`Failed to delete template content. ${contentToDelete.LatestResult?.Message}`, 'error');
                }
            } catch (error) {
                console.error('Error deleting template content:', error);
                MJNotificationService.Instance.CreateSimpleNotification(`Error deleting template content: ${error}`, 'error');
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
            
            this.ContentChange.emit(this.TemplateContents);
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
                                this.IsAddingNewContent;
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
                if (!this.codeEditor) {
                    return;
                }
                
                this.isUpdatingEditorValue = true;
                const newValue = this.CurrentTemplateContent?.TemplateText || '';
                
                // Use the setValue method from mj-code-editor component
                this.codeEditor.setValue(newValue);  
                this.isUpdatingEditorValue = false;
            }, 0);
        });
    }

    async SaveTemplateContents(): Promise<boolean> {
        if (!this.config.allowEdit) return false;

        try {
            // Ensure FK is set on all contents, then persist the dirty/new ones atomically
            for (const content of this.TemplateContents) {
                content.TemplateID = this.Template!.ID;
            }
            const toSave = this.TemplateContents.filter(c => c.Dirty || !c.ID);

            if (toSave.length > 0) {
                const tg = await this._metadata.CreateTransactionGroup();
                for (const content of toSave) {
                    content.TransactionGroup = tg;
                    await content.Save();
                }
                const success = await tg.Submit();
                if (!success) {
                    console.error('Failed to save template contents transaction');
                    return false;
                }
            }

            this.IsAddingNewContent = false;
            this.NewTemplateContent = null;
            this.updateUnsavedChangesFlag();
            this.ContentChange.emit(this.TemplateContents);
            return true;
        } catch (error) {
            console.error('Error saving template contents:', error);
            return false;
        }
    }

    /** @deprecated Use {@link SaveTemplateContents}. */
    async saveTemplateContents(): Promise<boolean> {
      return this.SaveTemplateContents();
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

    /**
     * Test run the current template using the parameter dialog
     */
    async OnRunTemplate() {
        if (!this.Template?.IsSaved || !this.CurrentTemplateContent) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the template before running it.', 
                'warning'
            );
            return;
        }

        // Save any unsaved changes first
        if (this.HasUnsavedChanges) {
            const saveResult = await this.SaveTemplateContents();
            if (!saveResult) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to save template changes.', 
                    'error'
                );
                return;
            }
        }

        // Emit the run template event
        this.RunTemplate.emit(this.Template);
    }

    /** @deprecated Use {@link OnRunTemplate}. */
    async onRunTemplate() {
      return this.OnRunTemplate();
    }

    GetContentTypeOptionsForContent(): Array<{text: string, value: string}> {
        // Always exclude "Select Type..." option for all content
        return this.ContentTypeOptions.filter(option => option.value !== '');
    }

    /** @deprecated Use {@link GetContentTypeOptionsForContent}. */
    getContentTypeOptionsForContent(): Array<{text: string, value: string}> {
      return this.GetContentTypeOptionsForContent();
    }
}