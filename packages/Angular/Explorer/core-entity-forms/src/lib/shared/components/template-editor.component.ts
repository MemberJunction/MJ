import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, ViewChild, AfterViewInit } from '@angular/core';
import { TemplateEntity, TemplateContentEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { CodeEditorComponent } from '@memberjunction/ng-code-editor';
import { Subject } from 'rxjs';
import { DEFAULT_SYSTEM_PLACEHOLDERS, SystemPlaceholder, SYSTEM_PLACEHOLDER_CATEGORIES, SystemPlaceholderCategory } from '@memberjunction/ai-core-plus';

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
export class TemplateEditorComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
    @Input() template: TemplateEntity | null = null;
    @Input() config: TemplateEditorConfig = {
        allowEdit: true,
        showRunButton: false,
        compactMode: false
    };
    
    @Output() contentChange = new EventEmitter<TemplateContentEntity[]>();
    @Output() runTemplate = new EventEmitter<TemplateEntity>();
    
    public templateContents: TemplateContentEntity[] = [];
    public selectedContentIndex: number = 0;
    public isAddingNewContent: boolean = false;
    public newTemplateContent: TemplateContentEntity | null = null;
    public hasUnsavedChanges: boolean = false;
    public contentTypeOptions: Array<{text: string, value: string}> = [];
    public supportedLanguages: LanguageDescription[] = languages;
    public isRunningTemplate = false;
    public activeHelpTab: 'syntax' | 'placeholders' = 'syntax';
    public activePlaceholderCategory: string = '';
    
    // System placeholders organized by category
    public placeholderCategories: Array<{
        category: SystemPlaceholderCategory;
        placeholders: SystemPlaceholder[];
    }> = [];
    
    @ViewChild('codeEditor') codeEditor: CodeEditorComponent | null = null;
    private isUpdatingEditorValue = false;
    private destroy$ = new Subject<void>();
    private _metadata = new Metadata();
    private activeTimeouts: number[] = [];
    
    constructor(private notificationService: MJNotificationService) {}

    async ngOnInit() {
        this.loadContentTypes();
        this.organizePlaceholdersByCategory();
        if (this.template) {
            await this.loadTemplateContents();
        }
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes['template']) {
            // Template input has changed, reload contents
            if (this.template) {
                await this.loadTemplateContents();
            } else {
                // Template cleared, reset state
                this.templateContents = [];
                this.selectedContentIndex = 0;
                this.isAddingNewContent = false;
                this.newTemplateContent = null;
                this.hasUnsavedChanges = false;
            }
        }
    }
    
    private organizePlaceholdersByCategory() {
        // Group placeholders by their category
        this.placeholderCategories = SYSTEM_PLACEHOLDER_CATEGORIES.map(category => {
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
            this.placeholderCategories.push({
                category: {
                    name: 'Other',
                    icon: 'fa-ellipsis-h',
                    color: '#6c757d'
                },
                placeholders: uncategorized
            });
        }
        
        // Set the first category as active
        if (this.placeholderCategories.length > 0) {
            this.activePlaceholderCategory = this.placeholderCategories[0].category.name;
        }
    }
    
    /**
     * Copies a placeholder to the clipboard
     */
    public async copyPlaceholder(placeholderName: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(`{{ ${placeholderName} }}`);
            this.notificationService.CreateSimpleNotification('Placeholder copied to clipboard!', 'success', 2000);
        } catch (error) {
            console.error('Failed to copy placeholder:', error);
            this.notificationService.CreateSimpleNotification('Failed to copy placeholder', 'error', 3000);
        }
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
        if (this.template) {
            // Reset state first
            this.templateContents = [];
            this.selectedContentIndex = 0;
            this.isAddingNewContent = false;
            this.newTemplateContent = null;
            this.hasUnsavedChanges = false;
            
            if (this.template.IsSaved && this.template.ID) {
                // Load existing template contents for saved templates
                try {
                    const rv = new RunView();
                    const results = await rv.RunView<TemplateContentEntity>({
                        EntityName: 'Template Contents',
                        ExtraFilter: `TemplateID='${this.template.ID}'`,
                        OrderBy: 'Priority ASC, __mj_CreatedAt ASC',
                        ResultType: 'entity_object'
                    });
                    
                    this.templateContents = results.Results;
                } catch (error) {
                    console.error('Error loading template contents:', error);
                }
            }
            
            // If we have contents but no selection, select the first one
            if (this.templateContents.length > 0) {
                this.selectedContentIndex = 0;
            }
            
            // If no template contents exist (either new template or saved template with no content), 
            // create a default one for single-content optimization
            if (this.templateContents.length === 0) {
                await this.createDefaultTemplateContent();
            }

            // Sync editor value after loading content
            this.syncEditorValue();
            this.contentChange.emit(this.templateContents);
        }
    }

    /**
     * Public method to refresh the template editor and discard unsaved changes
     * This should be called when canceling edits to restore the original state
     */
    public async refreshAndDiscardChanges() {
        await this.loadTemplateContents();
    }

    async createDefaultTemplateContent() {
        const defaultContent = await this._metadata.GetEntityObject<TemplateContentEntity>('Template Contents');
        defaultContent.TemplateID = this.template!.ID;
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

    async addNewTemplateContent() {
        if (!this.config.allowEdit) return;
        
        this.newTemplateContent = await this._metadata.GetEntityObject<TemplateContentEntity>('Template Contents');
        this.newTemplateContent.TemplateID = this.template!.ID;
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

    async deleteTemplateContent(index: number) {
        if (!this.config.allowEdit || index < 0 || index >= this.templateContents.length) return;
        
        const contentToDelete = this.templateContents[index];
        
        // Check if the entity is actually saved, not just if it has an ID
        if (contentToDelete.IsSaved) {
            try {
                const result = await contentToDelete.Delete();
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
                    
                    this.contentChange.emit(this.templateContents);
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(`Failed to delete template content. ${contentToDelete.LatestResult?.Message}`, 'error');
                }
            } catch (error) {
                console.error('Error deleting template content:', error);
                MJNotificationService.Instance.CreateSimpleNotification(`Error deleting template content: ${error}`, 'error');
            }
        } else {
            // Not saved yet, just remove from array
            this.templateContents.splice(index, 1);
            if (this.selectedContentIndex >= this.templateContents.length) {
                this.selectedContentIndex = Math.max(0, this.templateContents.length - 1);
            }
            
            // Reset adding new content state if we're deleting the new content
            if (this.isAddingNewContent && index === this.templateContents.length) {
                this.isAddingNewContent = false;
                this.newTemplateContent = null;
            }
            
            this.contentChange.emit(this.templateContents);
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
                                this.isAddingNewContent;
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
        if (!this.config.allowEdit) return false;
        
        try {
            // Save all template contents that have changes
            for (const content of this.templateContents) {
                content.TemplateID = this.template!.ID; // Ensure FK is set
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
            this.updateUnsavedChangesFlag();
            this.contentChange.emit(this.templateContents);
            return true;
        } catch (error) {
            console.error('Error saving template contents:', error);
            return false;
        }
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

    /**
     * Test run the current template using the parameter dialog
     */
    async onRunTemplate() {
        if (!this.template?.IsSaved || !this.currentTemplateContent) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the template before running it.', 
                'warning'
            );
            return;
        }

        // Save any unsaved changes first
        if (this.hasUnsavedChanges) {
            const saveResult = await this.saveTemplateContents();
            if (!saveResult) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to save template changes.', 
                    'error'
                );
                return;
            }
        }

        // Emit the run template event
        this.runTemplate.emit(this.template);
    }

    getContentTypeOptionsForContent(): Array<{text: string, value: string}> {
        // Always exclude "Select Type..." option for all content
        return this.contentTypeOptions.filter(option => option.value !== '');
    }
}