import { Component, OnInit, ViewChild, ChangeDetectorRef, ViewContainerRef, inject } from '@angular/core';
import { MJTemplateEntity, MJTemplateContentEntity, MJTemplateParamEntity, MJAIPromptModelEntity, MJAIVendorEntity, MJAIModelVendorEntity, MJAIPromptTypeEntity, MJAIConfigurationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { TemplateEditorConfig, TemplateEditorComponent } from '../../shared/components/template-editor.component';
import { MJAIPromptFormComponent } from '../../generated/Entities/MJAIPrompt/mjaiprompt.form.component';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { AIPromptManagementService } from './ai-prompt-management.service';
import { AIModelEntityExtended, AIPromptCategoryEntityExtended, AIPromptEntityExtended, AIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';

@RegisterClass(BaseFormComponent, 'MJ: AI Prompts')
@Component({
  standalone: false,
    selector: 'mj-ai-prompt-form',
    templateUrl: './ai-prompt-form.component.html',
    styleUrls: ['./ai-prompt-form.component.css']
})
export class AIPromptFormComponentExtended extends MJAIPromptFormComponent implements OnInit {
    private testHarnessService = inject(AITestHarnessDialogService);
    private viewContainerRef = inject(ViewContainerRef);
    private promptManagementService = inject(AIPromptManagementService);

    public record!: AIPromptEntityExtended;
    public template: MJTemplateEntity | null = null;
    public templateContent: MJTemplateContentEntity | null = null;
    public templateParams: MJTemplateParamEntity[] = [];
    public isLoadingTemplate = true; // Default to loading state
    public isLoadingTemplateParams = false;
    public templateNotFoundInDatabase = false;
    public showTestHarness = false;
    
    // Model management
    public promptModels: MJAIPromptModelEntity[] = [];
    public availableModels: AIModelEntityExtended[] = [];
    public availableVendors: MJAIVendorEntity[] = [];
    public isLoadingModels = false;
    
    // Vendor management per model
    public modelVendorsMap = new Map<string, { vendors: MJAIVendorEntity[], modelVendors: MJAIModelVendorEntity[] }>();
    
    // AI Prompt Types
    public availablePromptTypes: MJAIPromptTypeEntity[] = [];
    public isLoadingPromptTypes = false;
    
    // AI Configurations
    public availableConfigurations: MJAIConfigurationEntity[] = [];
    public isLoadingConfigurations = false;
    
    // Result Selector Tree Data
    public resultSelectorTreeData: any[] = [];
    public isLoadingResultSelectorData = false;
    
    // Drag and drop state
    public draggedIndex: number = -1;
    
    // Execution History
    public executionHistory: AIPromptRunEntityExtended[] = [];
    public isLoadingHistory = false;
    public historySortField: 'runAt' | 'executionTime' | 'cost' | 'tokens' = 'runAt';
    public historySortDirection: 'asc' | 'desc' = 'desc';
    
    // Removed custom transaction tracking - we'll use base form's _pendingRecords instead
    public hasUnsavedChanges = false;
    
    // Store original state for cancel/revert functionality
    private originalTemplateID: string | null = null;
    
    // === Permission Checks for Related Entities ===
    /** Cache for permission checks to avoid repeated calculations */
    private _permissionCache = new Map<string, boolean>();

    // Main AI Prompt permissions inherited from BaseFormComponent:
    // - UserCanEdit (Update permission)
    // - UserCanRead (Read permission) 
    // - UserCanCreate (Create permission)
    // - UserCanDelete (Delete permission)

    /** Check if user can create Templates */
    public get UserCanCreateTemplates(): boolean {
        return this.checkEntityPermission('Templates', 'Create');
    }

    /** Check if user can update Templates */
    public get UserCanUpdateTemplates(): boolean {
        return this.checkEntityPermission('Templates', 'Update');
    }

    /** Check if user can delete Templates */
    public get UserCanDeleteTemplates(): boolean {
        return this.checkEntityPermission('Templates', 'Delete');
    }

    /** Check if user can read Templates */
    public get UserCanReadTemplates(): boolean {
        return this.checkEntityPermission('Templates', 'Read');
    }

    /** Check if user can create Template Contents */
    public get UserCanCreateTemplateContents(): boolean {
        return this.checkEntityPermission('MJ: Template Contents', 'Create');
    }

    /** Check if user can update Template Contents */
    public get UserCanUpdateTemplateContents(): boolean {
        return this.checkEntityPermission('MJ: Template Contents', 'Update');
    }

    /** Check if user can create AI Prompt Models */
    public get UserCanCreatePromptModels(): boolean {
        return this.checkEntityPermission('MJ: AI Prompt Models', 'Create');
    }

    /** Check if user can update AI Prompt Models */
    public get UserCanUpdatePromptModels(): boolean {
        return this.checkEntityPermission('MJ: AI Prompt Models', 'Update');
    }

    /** Check if user can delete AI Prompt Models */
    public get UserCanDeletePromptModels(): boolean {
        return this.checkEntityPermission('MJ: AI Prompt Models', 'Delete');
    }

    /**
     * Helper method to check entity permissions with caching
     * @param entityName - The name of the entity to check permissions for
     * @param permissionType - The type of permission to check (Create, Read, Update, Delete)
     * @returns boolean indicating if user has the permission
     */
    private checkEntityPermission(entityName: string, permissionType: 'Create' | 'Read' | 'Update' | 'Delete'): boolean {
        const cacheKey = `${entityName}_${permissionType}`;
        
        if (this._permissionCache.has(cacheKey)) {
            return this._permissionCache.get(cacheKey)!;
        }

        try {
            const entityInfo = this._metadata.Entities.find(e => e.Name === entityName);
            
            if (!entityInfo) {
                console.warn(`Entity '${entityName}' not found for permission check`);
                this._permissionCache.set(cacheKey, false);
                return false;
            }

            const userPermissions = entityInfo.GetUserPermisions(this._metadata.CurrentUser);
            let hasPermission = false;

            switch (permissionType) {
                case 'Create':
                    hasPermission = userPermissions.CanCreate;
                    break;
                case 'Read':
                    hasPermission = userPermissions.CanRead;
                    break;
                case 'Update':
                    hasPermission = userPermissions.CanUpdate;
                    break;
                case 'Delete':
                    hasPermission = userPermissions.CanDelete;
                    break;
            }

            this._permissionCache.set(cacheKey, hasPermission);
            return hasPermission;
        } catch (error) {
            console.error(`Error checking ${permissionType} permission for ${entityName}:`, error);
            this._permissionCache.set(cacheKey, false);
            return false;
        }
    }

    /**
     * Clears the permission cache. Call this when user context changes or permissions are updated.
     */
    public clearPermissionCache(): void {
        this._permissionCache.clear();
    }
    
    // Template editor configuration
    public get templateEditorConfig(): TemplateEditorConfig {
        return {
            allowEdit: this.EditMode && this.UserCanUpdateTemplateContents,
            showRunButton: false,
            compactMode: false
        };
    }

    private _metadata = new Metadata();
    private __InferenceProvider_VendorTypeDefinitionID: string = '';

    @ViewChild('templateEditor') templateEditor: TemplateEditorComponent | undefined;

    async ngOnInit() {
        await super.ngOnInit();

        // make sure AI Engine Base is configured, this will load stuff only if not already
        // loaded in the current process space
        await AIEngineBase.Instance.Config(false, this._metadata.CurrentUser);
        this.__InferenceProvider_VendorTypeDefinitionID = AIEngineBase.Instance.VendorTypeDefinitions.find(
            vtd => vtd.Name.trim().toLowerCase() === 'inference provider')?.ID || '';
        if (!this.__InferenceProvider_VendorTypeDefinitionID) {
            console.error('Inference Provider Vendor Type Definition ID not found');
            MJNotificationService.Instance.CreateSimpleNotification(
                'Inference Provider Vendor Type Definition not found',
                'error',
                5000
            );
            return;
        }
        
        // Load template when record changes
        if (this.record?.TemplateID) {
            // isLoadingTemplate is already true by default
            this.loadTemplate(); // Don't await so other loads can happen in parallel
        } else {
            // No template ID, so we're not loading
            this.isLoadingTemplate = false;
        }
        
        // Load available models, vendors, prompt types, configurations, prompt models, and result selector data
        await Promise.all([
            this.loadAvailableModels(),
            this.loadAvailableVendors(),
            this.loadAvailablePromptTypes(),
            this.loadAvailableConfigurations(),
            this.loadPromptModels(),
            this.loadResultSelectorTreeData()
        ]);
        
        // Load execution history if record is saved
        if (this.record?.IsSaved) {
            await this.loadExecutionHistory();
        }
        
        // Set defaults for new records
        if (!this.record.IsSaved) {
            // Default to first prompt type if not set
            if (!this.record.TypeID && this.availablePromptTypes.length > 0) {
                this.record.TypeID = this.availablePromptTypes[0].ID;
            }
            
            // Default status to Pending if not set
            if (!this.record.Status) {
                this.record.Status = 'Pending';
            }
        }
    }

    /**
     * Loads the template associated with this AI prompt
     */
    public async loadTemplate() {
        if (!this.record?.TemplateID) {
            this.template = null;
            this.templateNotFoundInDatabase = false;
            return;
        }

        // First check if we already have this template in pending records (newly created)
        const pendingTemplate = this.PendingRecords.find(p => 
            p.entityObject.EntityInfo.Name === 'MJ: Templates' && 
            p.entityObject.Get('ID') === this.record.TemplateID
        );
        
        if (pendingTemplate) {
            // Use the pending template
            this.template = pendingTemplate.entityObject as MJTemplateEntity;
            this.templateNotFoundInDatabase = false;
            this.isLoadingTemplate = false;

            // Clear template content and params since this is a new template
            this.templateContent = null;
            this.templateParams = [];
            this.cdr.detectChanges();
            return;
        }

        this.isLoadingTemplate = true;
        this.templateNotFoundInDatabase = false; // Reset the flag
        try {
            this.template = await this._metadata.GetEntityObject<MJTemplateEntity>('MJ: Templates');
            await this.template.Load(this.record.TemplateID);
            
            if (!this.template.IsSaved) {
                this.template = null;
                this.templateNotFoundInDatabase = true; // Set flag when template not found
                console.warn(`Template with ID ${this.record.TemplateID} not found`);
            } else {
                // Load template content and parameters
                await Promise.all([
                    this.loadTemplateContent(),
                    this.loadTemplateParams()
                ]);
            }

        } catch (error) {
            console.error('Error loading template:', error);
            this.template = null;
            this.templateNotFoundInDatabase = true; // Set flag on error
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error loading associated template',
                'error',
                5000
            );
        } finally {
            this.isLoadingTemplate = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Handles template ID changes in the form
     */
    public async onTemplateIdChange() {
        if (this.record?.TemplateID) {
            await this.loadTemplate();
        } else {
            this.template = null;
            this.templateParams = [];
        }
        this.hasUnsavedChanges = true;
    }
    

    /**
     * Opens a dialog to link an existing template
     */
    public async linkExistingTemplate() {
        try {
            this.promptManagementService.openTemplateSelectorDialog({
                title: 'Link Existing Template',
                multiSelect: false,
                showCreateNew: true,
                showActiveOnly: true,
                selectedTemplateIds: this.record.TemplateID ? [this.record.TemplateID] : [],
                viewContainerRef: this.viewContainerRef
            }).subscribe({
                next: async (result) => {
                    if (result && result.selectedTemplates.length > 0) {
                        const selectedTemplate = result.selectedTemplates[0];
                        
                        // First, clean up any pending changes related to the old template
                        this.cleanupOldTemplateRecords();
                        
                        // Update the AI prompt to reference the selected template
                        this.record.TemplateID = selectedTemplate.ID;
                        this.hasUnsavedChanges = true;
                        
                        // Load the selected template
                        await this.loadTemplate();
                        
                        // Trigger change detection to update UI
                        this.cdr.detectChanges();
                        
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Template "${selectedTemplate.Name}" linked successfully`,
                            'success',
                            3000
                        );
                    } else if (result && result.createNew) {
                        // User wants to create a new template
                        await this.createNewTemplate();
                    }
                },
                error: (error) => {
                    console.error('Error opening template selector:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening template selector. Please try again.',
                        'error',
                        3000
                    );
                }
            });
        } catch (error) {
            console.error('Error in linkExistingTemplate:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error linking template. Please try again.',
                'error',
                3000
            );
        }
    }

    /**
     * Opens the current template in a new window
     */
    public openTemplateInNewWindow() {
        if (!this.template?.ID) return;
        
        // TODO: Get the proper URL for template editing
        const templateUrl = `/templates/${this.template.ID}`;
        window.open(templateUrl, '_blank');
    }

    /**
     * Creates a new template for this AI prompt (deferred until save)
     */
    public async createNewTemplate() {
        try {
            // First, clean up any pending changes related to the old template
            this.cleanupOldTemplateRecords();
            
            const newTemplate = await this._metadata.GetEntityObject<MJTemplateEntity>('MJ: Templates');
            console.log("Record Name:", this.record.Name);
            newTemplate.NewRecord();
            newTemplate.Name = `${this.record.Name || 'AI Prompt'} Template`;
            newTemplate.Description = `Template for AI Prompt: ${this.record.Name}`;
            newTemplate.UserID = this._metadata.CurrentUser.ID;
            
            // Add to pending records instead of saving immediately
            this.PendingRecords.push({
                entityObject: newTemplate,
                action: 'save'
            });
            
            // Update the AI prompt to reference the new template
            this.record.TemplateID = newTemplate.ID;
            this.hasUnsavedChanges = true;
            
            // Set the template for UI purposes
            this.template = newTemplate;
            
            // Clear existing template content and params since we have a new template
            this.templateContent = null;
            this.templateParams = [];
            this.isLoadingTemplate = false;
            this.templateNotFoundInDatabase = false;
            
            // Force UI update in next microtask to ensure template editor refreshes
            Promise.resolve().then(() => {
                this.cdr.detectChanges();
            });

            MJNotificationService.Instance.CreateSimpleNotification(
                'New template created and will be saved when you save the AI prompt',
                'info',
                4000
            );

        } catch (error) {
            console.error('Error creating new template:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            MJNotificationService.Instance.CreateSimpleNotification(
                `Error creating new template: ${errorMessage}`,
                'error',
                6000
            );
        }
    }

    /**
     * Cleans up any pending records related to the old template when changing templates
     */
    private cleanupOldTemplateRecords() {
        // Get current pending records and filter out template content/params from old template
        const currentPendingRecords = this.PendingRecords;
        
        // Remove template content and template param records
        for (let i = currentPendingRecords.length - 1; i >= 0; i--) {
            const record = currentPendingRecords[i];
            const entityName = record.entityObject.EntityInfo.Name;
            if (entityName === 'MJ: Template Contents' || entityName === 'MJ: Template Params') {
                currentPendingRecords.splice(i, 1);
            }
        }
    }

    /**
     * Loads template content for the current template
     */
    private async loadTemplateContent() {
        if (!this.template?.ID) {
            this.templateContent = null;
            return;
        }

        try {
            const rv = new RunView();
            const results = await rv.RunView<MJTemplateContentEntity>({
                EntityName: 'MJ: Template Contents',
                ExtraFilter: `TemplateID = '${this.template.ID}'`,
                OrderBy: 'Priority ASC',
                ResultType: 'entity_object'
            });
            
            // Get the first content (highest priority)
            this.templateContent = results.Results?.[0] || null;
        } catch (error) {
            console.error('Error loading template content:', error);
            this.templateContent = null;
        }
    }

    /**
     * Loads template parameters for the current template
     */
    private async loadTemplateParams() {
        if (!this.template?.ID) {
            this.templateParams = [];
            return;
        }

        this.isLoadingTemplateParams = true;
        try {
            const rv = new RunView();
            const results = await rv.RunView<MJTemplateParamEntity>({
                EntityName: 'MJ: Template Params',
                ExtraFilter: `TemplateID = '${this.template.ID}'`,
                OrderBy: 'Name ASC' 
            });
            
            this.templateParams = results.Results || [];
        } catch (error) {
            console.error('Error loading template params:', error);
            this.templateParams = [];
        } finally {
            this.isLoadingTemplateParams = false;
        }
    }

    /**
     * Opens the AI prompt execution dialog
     */
    public executeAIPrompt() {
        if (!this.record?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI prompt before executing',
                'warning',
                4000
            );
            return;
        }

        if (this.record.Status !== 'Active') {
            MJNotificationService.Instance.CreateSimpleNotification(
                'AI prompt must be Active to execute',
                'warning',
                4000
            );
            return;
        }

        // Use test harness instead
        this.openTestHarness();
    }

    /**
     * Opens the test harness
     */
    public openTestHarness() {
        if (!this.record?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI prompt before testing',
                'warning',
                4000
            );
            return;
        }

        // Use the dialog service instead of inline
        // Don't pass viewContainerRef so window is top-level
        this.testHarnessService.openForPrompt(this.record.ID).subscribe({
            next: (result) => {
                if (result.success) {
                    // Reload execution history
                    this.loadExecutionHistory();
                }
            },
            error: (error) => {
                console.error('Test harness error:', error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Test failed: ' + error.message,
                    'error',
                    5000
                );
            }
        });
    }

    /**
     * Handles when test harness is closed
     */
    public onTestHarnessVisibilityChanged(isVisible: boolean) {
        this.showTestHarness = isVisible;
    }

    /**
     * Handles template content changes from the editor
     */
    public onTemplateContentChange(content: MJTemplateContentEntity[]) {
        // Handle template content changes if needed
        console.log('Template content changed:', content);
        
        // Mark as having unsaved changes
        this.hasUnsavedChanges = true;
        
        // If we have content changes, we need to ensure they're added to pending records
        // This is typically handled by the template editor component itself
    }
    
    /**
     * Handles template content record deletion
     * This method should be called by the template editor to properly manage deletions
     */
    public handleTemplateContentDelete(templateContent: MJTemplateContentEntity) {
        if (templateContent.IsSaved) {
            // If it's saved, add to pending deletions
            this.PendingRecords.push({
                entityObject: templateContent,
                action: 'delete'
            });
        } else {
            // If it's not saved, remove it from pending records if it exists there
            const currentPendingRecords = this.PendingRecords;
            for (let i = currentPendingRecords.length - 1; i >= 0; i--) {
                const record = currentPendingRecords[i];
                if (record.entityObject === templateContent || 
                    (record.entityObject.EntityInfo.Name === 'MJ: Template Contents' && 
                     record.entityObject.Get('ID') === templateContent.Get('ID'))) {
                    currentPendingRecords.splice(i, 1);
                    break;
                }
            }
        }
        this.hasUnsavedChanges = true;
    }
    
    /**
     * Handles template content record creation/modification
     * This method should be called by the template editor to properly manage saves
     */
    public handleTemplateContentSave(templateContent: MJTemplateContentEntity) {
        if (templateContent.Dirty || !templateContent.IsSaved) {
            // Add to pending saves
            this.PendingRecords.push({
                entityObject: templateContent,
                action: 'save'
            });
        }
        this.hasUnsavedChanges = true;
    }
    
    /**
     * Adds template content changes to pending records
     */
    private addTemplateContentsToPendingRecords() {
        // This method would typically get pending changes from the template editor
        // The template editor should expose its pending changes through events or direct calls
        // For now, we'll rely on the template editor to manage its own pending records
        // and communicate them through the MJ event system
        
        // If the template editor has a method to get pending changes, we would call it here
        if (this.templateEditor && typeof (this.templateEditor as any).getPendingChanges === 'function') {
            try {
                const pendingChanges = (this.templateEditor as any).getPendingChanges();
                if (pendingChanges && pendingChanges.length > 0) {
                    this.PendingRecords.push(...pendingChanges);
                }
            } catch (error) {
                console.warn('Template editor does not support getPendingChanges method:', error);
            }
        }
    }

    /**
     * Handles template run requests from the editor
     */
    public onTemplateRun(template: MJTemplateEntity) {
        console.log('Template run requested:', template);
        // Could open the template parameter dialog here if needed
        MJNotificationService.Instance.CreateSimpleNotification(
            'Template run functionality coming soon',
            'info',
            3000
        );
    }

    /**
     * Gets the display text for parallelization mode
     */
    public getParallelizationModeDisplay(): string {
        switch (this.record?.ParallelizationMode) {
            case 'None': return 'None';
            case 'StaticCount': return `Static count (${this.record.ParallelCount || 1})`;
            case 'ConfigParam': return `Config parameter (${this.record.ParallelConfigParam || 'not set'})`;
            case 'ModelSpecific': return 'Model-specific configuration';
            default: return 'Unknown';
        }
    }

    /**
     * Gets the display text for output type
     */
    public getOutputTypeDisplay(): string {
        const type = this.record?.OutputType || 'string';
        const validationBehavior = this.record?.ValidationBehavior || 'Warn';
        
        if (validationBehavior === 'None') {
            return type;
        } else {
            return `${type} (${validationBehavior})`;
        }
    }
    
    /**
     * Gets the color for validation behavior display
     */
    public getValidationColor(): string {
        switch (this.record?.ValidationBehavior) {
            case 'Strict': return '#dc3545'; // red
            case 'Warn': return '#ffc107'; // yellow
            default: return '#6c757d'; // default gray
        }
    }

    /**
     * Checks if ParallelCount field should be visible
     */
    public get showParallelCount(): boolean {
        return this.record?.ParallelizationMode === 'StaticCount';
    }

    /**
     * Checks if ParallelConfigParam field should be visible
     */
    public get showParallelConfigParam(): boolean {
        return this.record?.ParallelizationMode === 'ConfigParam';
    }

    /**
     * Checks if OutputExample field should be visible
     */
    public get showOutputExample(): boolean {
        return this.record?.OutputType === 'object';
    }

    /**
     * Checks if the AI prompt can be executed
     */
    public get canExecute(): boolean {
        return !!(this.record?.ID && 
                  this.record.Status === 'Active' && 
                  this.record.TemplateID && 
                  this.template);
    }

    /**
     * Gets status badge color
     */
    public getStatusBadgeColor(): string {
        switch (this.record?.Status) {
            case 'Active': return '#28a745';
            case 'Pending': return '#ffc107';
            case 'Disabled': return '#6c757d';
            default: return '#6c757d';
        }
    }

    /**
     * Loads available AI models for selection
     */
    public async loadAvailableModels() {
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const models = engine.Models;
            models.sort((a, b) => a.Name.localeCompare(b.Name));
            this.availableModels = models;
        } catch (error) {
            console.error('Error loading available models:', error);
        }
    }

    /**
     * Loads available AI vendors for selection
     */
    public async loadAvailableVendors() {
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const vendors = engine.Vendors;
            vendors.sort((a, b) => a.Name.localeCompare(b.Name));
            this.availableVendors = vendors;
        } catch (error) {
            console.error('Error loading available vendors:', error);
        }
    }

    /**
     * Loads available AI prompt types for selection
     */
    public async loadAvailablePromptTypes() {
        this.isLoadingPromptTypes = true;
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const promptTypes = engine.PromptTypes;
            promptTypes.sort((a, b) => a.Name.localeCompare(b.Name));
            this.availablePromptTypes = promptTypes;
        } catch (error) {
            console.error('Error loading available prompt types:', error);
        } finally {
            this.isLoadingPromptTypes = false;
        }
    }

    /**
     * Loads available AI configurations for selection
     */
    public async loadAvailableConfigurations() {
        this.isLoadingConfigurations = true;
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const configurations = engine.Configurations;
            configurations.sort((a, b) => a.Name.localeCompare(b.Name));
            this.availableConfigurations = configurations;
        } catch (error) {
            console.error('Error loading available configurations:', error);
        } finally {
            this.isLoadingConfigurations = false;
        }
    }

    /**
     * Loads vendors available for a specific model
     */
    public async loadVendorsForModel(modelId: string): Promise<{ vendors: MJAIVendorEntity[], modelVendors: MJAIModelVendorEntity[] }> {
        if (!modelId) {
            return { vendors: [], modelVendors: [] };
        }

        // Check cache first
        if (this.modelVendorsMap.has(modelId)) {
            return this.modelVendorsMap.get(modelId)!;
        }

        try {
            // Load model vendors for this model, filtering by TypeID for inference providers only
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const modelVendors = engine.ModelVendors.filter(mv => mv.ModelID === modelId && mv.TypeID === this.__InferenceProvider_VendorTypeDefinitionID);
            
            // filter vendors to just the vendors in the modelVendors array in VendorID
            const vendors = engine.Vendors.filter(v => modelVendors.some(mv => mv.VendorID === v.ID));

            const result = { vendors, modelVendors };
            this.modelVendorsMap.set(modelId, result);
            return result;

        } catch (error) {
            console.error('Error loading vendors for model:', error);
            return { vendors: [], modelVendors: [] };
        }
    }

    /**
     * Gets vendors for a specific model from cache or loads them
     */
    public async getVendorsForModel(modelId: string): Promise<MJAIVendorEntity[]> {
        const result = await this.loadVendorsForModel(modelId);
        return result.vendors;
    }

    /**
     * Gets the status for a model-vendor combination
     */
    public getModelVendorStatus(modelId: string, vendorId: string): string {
        const modelVendorData = this.modelVendorsMap.get(modelId);
        if (!modelVendorData) return 'Unknown';
        
        const modelVendor = modelVendorData.modelVendors.find(mv => mv.VendorID === vendorId);
        return modelVendor?.Status || 'Unknown';
    }

    /**
     * Gets the color for vendor status display
     */
    public getVendorStatusColor(modelId: string, vendorId: string): string {
        const status = this.getModelVendorStatus(modelId, vendorId);
        switch (status) {
            case 'Active': return '#28a745'; // green
            case 'Inactive': return '#dc3545'; // red  
            case 'Pending': return '#ffc107'; // yellow
            default: return '#6c757d'; // gray
        }
    }

    /**
     * Handles model selection change and loads vendors for that model
     */
    public async onModelChange(modelId: string, promptModelIndex: number) {
        const promptModel = this.promptModels[promptModelIndex];
        if (!promptModel) return;

        // Clear the vendor selection when model changes
        promptModel.VendorID = null;
        this.hasUnsavedChanges = true;

        // Load vendors for the new model
        if (modelId) {
            const vendorData = await this.loadVendorsForModel(modelId);
            
            // Auto-select first vendor if available
            if (vendorData.vendors.length > 0) {
                promptModel.VendorID = vendorData.vendors[0].ID;
            }
        }
        
        // Trigger change detection
        this.cdr.detectChanges();
    }

    /**
     * Handles configuration change for a prompt model
     */
    public onConfigurationChange(configurationId: string | null, promptModelIndex: number) {
        const promptModel = this.promptModels[promptModelIndex];
        if (!promptModel) return;

        promptModel.ConfigurationID = configurationId;
        this.hasUnsavedChanges = true;
        
        // Trigger change detection
        this.cdr.detectChanges();
    }

    /**
     * Gets vendors for a specific model
     */
    public getVendorsForModelSync(modelId: string): MJAIVendorEntity[] {
        const modelVendorData = this.modelVendorsMap.get(modelId);
        return modelVendorData?.vendors || [];
    }

    /**
     * Checks if vendor dropdown should be shown (more than one vendor)
     */
    public shouldShowVendorDropdown(modelId: string): boolean {
        if (!modelId) return false;
        const vendors = this.getVendorsForModelSync(modelId);
        return vendors.length > 1;
    }

    /**
     * Loads prompt models for this AI prompt
     */
    public async loadPromptModels() {
        if (!this.record?.ID) {
            this.promptModels = [];
            return;
        }

        this.isLoadingModels = true;
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            this.promptModels = engine.PromptModels.filter(pm => pm.PromptID === this.record.ID);
            this.promptModels.sort((a, b) => {
                // first sort on priority (descending), then by created date (ascending)
                return b.Priority - a.Priority || new Date(a.__mj_CreatedAt).getTime() - new Date(b.__mj_CreatedAt).getTime();
            });

            // Load vendors for existing models
            const modelIds = this.promptModels
                .map(pm => pm.ModelID)
                .filter(id => id); // Filter out null/undefined
            
            await Promise.all(modelIds.map(modelId => this.loadVendorsForModel(modelId)));

        } catch (error) {
            console.error('Error loading prompt models:', error);
        } finally {
            this.isLoadingModels = false;
        }
    }

    /**
     * Adds a new model to the prompt (deferred until save)
     */
    public async addNewModel() {
        if (!this.record?.ID) return;
        
        try {
            const newModel = await this._metadata.GetEntityObject<MJAIPromptModelEntity>('MJ: AI Prompt Models');
            newModel.PromptID = this.record.ID;
            
            // Set priority to 1 (lowest) for new models added at the end
            newModel.Priority = 1;
            
            // Generate a temporary ID for tracking if the model doesn't have one
            if (!newModel.ID) {
                (newModel as any)._tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
            }
            
            // ModelID will be set by user
            
            this.promptModels.push(newModel);
            this.hasUnsavedChanges = true;
            
            // Update priorities after adding
            this.updateModelPriorities();
            
            // Trigger change detection
            this.cdr.detectChanges();
            
            MJNotificationService.Instance.CreateSimpleNotification(
                'New model added. Select a model and save to persist changes.',
                'info',
                3000
            );
        } catch (error) {
            console.error('Error creating new model:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error creating new model',
                'error',
                5000
            );
        }
    }

    /**
     * Removes a model from the prompt (deferred until save)
     */
    public async removePromptModel(index: number) {
        if (index < 0 || index >= this.promptModels.length) return;
        
        const model = this.promptModels[index];
        
        try {
            // If it's a saved model, add it to pending deletions
            if (model.IsSaved) {
                this.PendingRecords.push({
                    entityObject: model,
                    action: 'delete'
                });
            }

            // Remove from local array
            this.promptModels.splice(index, 1);
            this.hasUnsavedChanges = true;

            // Update priorities after removal
            this.updateModelPriorities();

            // Trigger change detection
            this.cdr.detectChanges();

            MJNotificationService.Instance.CreateSimpleNotification(
                'Model will be removed when you save the prompt',
                'info',
                3000
            );

        } catch (error) {
            console.error('Error removing model:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error removing model',
                'error',
                5000
            );
        }
    }

    /**
     * Gets the display name for a model ID
     */
    public getModelDisplayName(modelId: string): string {
        if (!modelId) return '';
        const model = this.availableModels.find(m => m.ID === modelId);
        return model ? model.Name : modelId;
    }

    /**
     * Gets the display name for a vendor ID
     */
    public getVendorDisplayName(vendorId: string): string {
        if (!vendorId) return '';
        const vendor = this.availableVendors.find(v => v.ID === vendorId);
        return vendor ? vendor.Name : vendorId;
    }

    /**
     * Gets the display name for a prompt type ID
     */
    public getPromptTypeDisplayName(typeId: string): string {
        if (!typeId) return '';
        const type = this.availablePromptTypes.find(t => t.ID === typeId);
        return type ? type.Name : typeId;
    }

    /**
     * Gets the display name for a configuration ID
     */
    public getConfigurationDisplayName(configurationId: string | null): string {
        if (!configurationId) return 'Default';
        const config = this.availableConfigurations.find(c => c.ID === configurationId);
        return config ? config.Name : configurationId;
    }

    /**
     * Override PopulatePendingRecords to add AI prompt model changes
     */
    protected PopulatePendingRecords() {
        // IMPORTANT: The parent method clears the pending records array, so we need to preserve
        // any records we've added (like templates) before calling the parent method
        const currentPendingRecords = [...this.PendingRecords]; // Make a copy
        
        // Call parent first to get child component pending records (this clears the array)
        super.PopulatePendingRecords();
        
        // Re-add our preserved records
        for (const record of currentPendingRecords) {
            this.PendingRecords.push(record);
        }
        
        // Add prompt model changes to pending records
        this.addPromptModelsToPendingRecords();
        
        // Handle template content changes through the template editor
        this.addTemplateContentsToPendingRecords();
    }

    /**
     * Override StartEditMode to capture original state for cancel functionality
     */
    public StartEditMode(): void {
        // Store original template ID for cancel functionality
        this.originalTemplateID = this.record.TemplateID;
        
        // Call parent implementation
        super.StartEditMode();
    }

    /**
     * Override CancelEdit to restore original state
     */
    public CancelEdit() {
        // Call parent implementation first
        super.CancelEdit();
        
        // Restore original template state
        if (this.originalTemplateID !== this.record.TemplateID) {
            this.record.TemplateID = this.originalTemplateID || '';
            
            // Reload the template to reflect the reverted state
            this.loadTemplate().then(() => {
                this.cdr.detectChanges();
            });
        } else if (this.templateEditor) {
            // Even if template didn't change, refresh the template editor to discard any unsaved content changes
            this.templateEditor.refreshAndDiscardChanges();
        }
        
        // Clear the stored original state
        this.originalTemplateID = null;
        this.hasUnsavedChanges = false;
    }

    /**
     * Adds prompt model changes to the pending records
     */
    private addPromptModelsToPendingRecords() {
        // Add all prompt models that have been modified or are new
        for (const model of this.promptModels) {
            if (model.ModelID && (model.Dirty || !model.IsSaved)) {
                // Set the PromptID if it's not already set
                if (!model.PromptID) {
                    model.PromptID = this.record.ID;
                }
                
                this.PendingRecords.push({
                    entityObject: model,
                    action: 'save'
                });
            }
        }
    }

    /**
     * Override InternalSaveRecord to handle template dependencies and related entity changes
     * Templates must be saved before AI Prompts to avoid foreign key constraint errors
     */
    protected async InternalSaveRecord(): Promise<boolean> {
        if (!this.record) {
            return false;
        }

        try {
            const md = new Metadata();
            const transactionGroup = await md.CreateTransactionGroup();

            // First, save any templates that need to be saved (they must be saved before AI Prompts)
            const templateRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name === 'MJ: Templates'
            );
            
            for (const templateRecord of templateRecords) {
                templateRecord.entityObject.TransactionGroup = transactionGroup;
                if (templateRecord.action === 'save') {
                    const saveResult = await templateRecord.entityObject.Save();
                    if (!saveResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            'Failed to save template. Please check the template data.',
                            'error',
                            4000
                        );
                        return false;
                    }
                } else {
                    await templateRecord.entityObject.Delete();
                }
            }

            // Now save the main AI Prompt record
            this.record.TransactionGroup = transactionGroup;
            const agentSaveResult = await this.record.Save();
            if (!agentSaveResult) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to save AI prompt details. Please check the form data.',
                    'error',
                    4000
                );
                return false;
            }

            // Then save all other pending records (excluding templates which we already saved)
            const otherRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name !== 'MJ: Templates'
            );
            
            for (const record of otherRecords) {
                record.entityObject.TransactionGroup = transactionGroup;
                if (record.action === 'save') {
                    await record.entityObject.Save();
                } else {
                    await record.entityObject.Delete();
                }
            }

            // Execute all operations atomically
            const success = await transactionGroup.Submit();
            if (success) {
                // Clear our local state since save was successful
                this.hasUnsavedChanges = false;
                
                // Reload prompt models to reflect database state
                await this.loadPromptModels();
                
                // Reload template to reflect any changes
                if (this.record.TemplateID) {
                    await this.loadTemplate();
                }

                MJNotificationService.Instance.CreateSimpleNotification(
                    'AI Prompt saved successfully',
                    'success',
                    3000
                );
                
                return true;
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Save failed. Please try again.',
                    'error',
                    4000
                );
                return false;
            }
        } catch (error) {
            console.error('Error in AI prompt save:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                'error',
                5000
            );
            return false;
        }
    }

    /**
     * Loads the result selector tree data (categories and prompts)
     */
    public async loadResultSelectorTreeData() {
        this.isLoadingResultSelectorData = true;
        try {
            // Load categories and prompts
            const engine = AIEngineBase.Instance;
            await engine.Config(false);

            const categories = engine.PromptCategories;
            const prompts = engine.Prompts.filter(p => p.Status === 'Active');

            categories.sort((a, b) => a.Name.localeCompare(b.Name));
            prompts.sort((a, b) => a.Name.localeCompare(b.Name));
             
            // Build tree structure
            this.resultSelectorTreeData = this.buildResultSelectorTree(categories, prompts);

        } catch (error) {
            console.error('Error loading result selector tree data:', error);
            this.resultSelectorTreeData = [];
        } finally {
            this.isLoadingResultSelectorData = false;
        }
    }

    /**
     * Builds the tree structure for result selector
     */
    private buildResultSelectorTree(categories: AIPromptCategoryEntityExtended[], prompts: AIPromptEntityExtended[]): any[] {
        const tree: any[] = [];

        // Add "Clear Selection" option at the top
        tree.push({
            text: '(Clear Selection)',
            value: null,
            hasChildren: false,
            isCategory: false,
            isClearOption: true
        });

        // Create category nodes
        const categoryMap = new Map<string, any>();
        categories.forEach(category => {
            const node = {
                text: category.Name,
                value: null, // Categories don't have values
                expanded: true,
                hasChildren: true,
                items: [],
                isCategory: true,
                categoryId: category.ID
            };
            categoryMap.set(category.ID, node);
            
            // Handle parent-child relationships
            if (category.ParentID) {
                const parentNode = categoryMap.get(category.ParentID);
                if (parentNode) {
                    parentNode.items.push(node);
                } else {
                    tree.push(node); // Parent not found, add to root
                }
            } else {
                tree.push(node); // Root category
            }
        });

        // Collect uncategorized prompts
        const uncategorizedPrompts: any[] = [];

        // Add prompts to their categories
        prompts.forEach(prompt => {
            const promptNode = {
                text: prompt.Name,
                value: prompt.ID,
                hasChildren: false,
                isCategory: false,
                promptId: prompt.ID
            };

            if (prompt.CategoryID) {
                const categoryNode = categoryMap.get(prompt.CategoryID);
                if (categoryNode) {
                    categoryNode.items.push(promptNode);
                } else {
                    // Category not found, add to uncategorized
                    uncategorizedPrompts.push(promptNode);
                }
            } else {
                // No category, add to uncategorized
                uncategorizedPrompts.push(promptNode);
            }
        });

        // If there are uncategorized prompts, add them to a special section
        if (uncategorizedPrompts.length > 0) {
            tree.push({
                text: 'Uncategorized',
                value: null,
                expanded: true,
                hasChildren: true,
                items: uncategorizedPrompts,
                isCategory: true,
                categoryId: 'uncategorized'
            });
        }

        return tree;
    }

    /**
     * Handles result selector selection
     */
    public onResultSelectorChange(value: string) {
        this.record.ResultSelectorPromptID = value || null;
    }

    /**
     * Gets the display name for a prompt ID from the tree data
     */
    public getPromptDisplayName(promptId: string): string {
        if (!promptId) return '';
        
        const findPromptInTree = (nodes: any[]): string => {
            for (const node of nodes) {
                if (!node.isCategory && node.value === promptId) {
                    return node.text;
                }
                if (node.items && node.items.length > 0) {
                    const found = findPromptInTree(node.items);
                    if (found) return found;
                }
            }
            return '';
        };

        return findPromptInTree(this.resultSelectorTreeData);
    }

    /**
     * Moves a model up in the list by swapping with the previous item
     */
    public moveModelUp(index: number) {
        if (index > 0 && index < this.promptModels.length) {
            // Create new array to ensure Angular detects the change
            const newModels = [...this.promptModels];
            
            // Swap with previous item
            [newModels[index - 1], newModels[index]] = 
            [newModels[index], newModels[index - 1]];
            
            // Replace the array and force full re-render
            this.promptModels = [...newModels];
            this.hasUnsavedChanges = true;
            
            this.updateModelPriorities();
            
            // Force Angular to re-evaluate all bindings
            this.cdr.detectChanges();
            
            // Additional force update for Kendo dropdowns
            setTimeout(() => {
                this.cdr.detectChanges();
            }, 0);
        }
    }

    /**
     * Moves a model down in the list by swapping with the next item
     */
    public moveModelDown(index: number) {
        if (index >= 0 && index < this.promptModels.length - 1) {
            // Create new array to ensure Angular detects the change
            const newModels = [...this.promptModels];
            
            // Swap with next item
            [newModels[index], newModels[index + 1]] = 
            [newModels[index + 1], newModels[index]];
            
            // Replace the array and force full re-render
            this.promptModels = [...newModels];
            this.hasUnsavedChanges = true;
            
            this.updateModelPriorities();
            
            // Force Angular to re-evaluate all bindings
            this.cdr.detectChanges();
            
            // Additional force update for Kendo dropdowns
            setTimeout(() => {
                this.cdr.detectChanges();
            }, 0);
        }
    }

    /**
     * Updates priority values based on array order
     */
    private updateModelPriorities() {
        // Update priorities based on position (higher priority for items at top)
        const maxPriority = this.promptModels.length;
        this.promptModels.forEach((model, index) => {
            model.Priority = maxPriority - index;
        });
    }
    
    /**
     * Gets a stable identifier for a model (for form tracking)
     */
    public getModelTrackId(model: MJAIPromptModelEntity): string {
        return model.ID || (model as any)._tempId || '';
    }

    /**
     * Handles drag start event
     */
    public onDragStart(event: DragEvent, index: number) {
        this.draggedIndex = index;
        event.dataTransfer!.effectAllowed = 'move';
        event.dataTransfer!.setData('text/html', ''); // Required for Firefox
    }

    /**
     * Handles drag over event
     */
    public onDragOver(event: DragEvent) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
    }

    /**
     * Handles drop event
     */
    public onDrop(event: DragEvent, dropIndex: number) {
        event.preventDefault();
        
        if (this.draggedIndex !== -1 && this.draggedIndex !== dropIndex) {
            // Create new array to ensure Angular detects the change
            const newModels = [...this.promptModels];
            
            // Remove dragged item
            const draggedItem = newModels.splice(this.draggedIndex, 1)[0];
            
            // Insert at new position
            newModels.splice(dropIndex, 0, draggedItem);
            
            // Replace the array and force full re-render
            this.promptModels = [...newModels];
            this.hasUnsavedChanges = true;
            
            // Update priorities
            this.updateModelPriorities();
            
            // Force Angular to re-evaluate all bindings
            this.cdr.detectChanges();
            
            // Additional force update for Kendo dropdowns
            setTimeout(() => {
                this.cdr.detectChanges();
            }, 0);
        }
        
        this.draggedIndex = -1;
    }

    /**
     * Handles drag end event
     */
    public onDragEnd(_event: DragEvent) {
        this.draggedIndex = -1;
    }
    
    /**
     * Load execution history for this prompt
     */
    public async loadExecutionHistory() {
        if (!this.record?.ID) return;
        
        this.isLoadingHistory = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<AIPromptRunEntityExtended>({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `PromptID='${this.record.ID}'`,
                OrderBy: 'RunAt DESC' 
            });
            
            this.executionHistory = result.Results;
            this.sortExecutionHistory();
        } catch (error) {
            console.error('Error loading execution history:', error);
            this.executionHistory = [];
        } finally {
            this.isLoadingHistory = false;
        }
    }
    
    /**
     * Sort execution history based on current sort field and direction
     */
    public sortExecutionHistory() {
        if (!this.executionHistory || this.executionHistory.length === 0) return;
        
        this.executionHistory.sort((a, b) => {
            let aVal: any, bVal: any;
            
            switch (this.historySortField) {
                case 'runAt':
                    aVal = a.RunAt ? new Date(a.RunAt).getTime() : 0;
                    bVal = b.RunAt ? new Date(b.RunAt).getTime() : 0;
                    break;
                case 'executionTime':
                    aVal = a.ExecutionTimeMS || 0;
                    bVal = b.ExecutionTimeMS || 0;
                    break;
                case 'cost':
                    aVal = a.TotalCost || a.Cost || 0;
                    bVal = b.TotalCost || b.Cost || 0;
                    break;
                case 'tokens':
                    aVal = a.TokensUsed || 0;
                    bVal = b.TokensUsed || 0;
                    break;
            }
            
            if (this.historySortDirection === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });
    }
    
    /**
     * Change sort field and direction for execution history
     */
    public changeHistorySort(field: 'runAt' | 'executionTime' | 'cost' | 'tokens') {
        if (this.historySortField === field) {
            // Toggle direction if same field
            this.historySortDirection = this.historySortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // New field, default to desc
            this.historySortField = field;
            this.historySortDirection = 'desc';
        }
        this.sortExecutionHistory();
    }
    
    /**
     * Navigate to a prompt run record
     */
    public navigateToPromptRun(runId: string) {
        SharedService.Instance.OpenEntityRecord('MJ: AI Prompt Runs', CompositeKey.FromID(runId));
    }
    
    /**
     * Format duration for display
     */
    public formatDuration(ms: number | null): string {
        if (!ms) return '-';
        
        if (ms < 1000) {
            return `${ms}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(0);
            return `${minutes}m ${seconds}s`;
        }
    }
    
    /**
     * Format cost for display
     */
    public formatCost(cost: number | null): string {
        if (!cost) return '-';
        return `$${cost.toFixed(4)}`;
    }
    
    /**
     * Format tokens for display
     */
    public formatTokens(tokens: number | null): string {
        if (!tokens) return '-';
        return tokens.toLocaleString();
    }
    
    /**
     * Get status color for execution
     */
    public getExecutionStatusColor(success: boolean | null): string {
        if (success === true) return '#28a745';
        if (success === false) return '#dc3545';
        return '#ffc107';
    }
    
    /**
     * Get status icon for execution
     */
    public getExecutionStatusIcon(success: boolean | null): string {
        if (success === true) return 'fa-check-circle';
        if (success === false) return 'fa-times-circle';
        return 'fa-spinner fa-spin';
    }

    /**
     * Gets the icon for a template parameter type
     */
    public getParamTypeIcon(type: string): string {
        switch (type) {
            case 'Scalar': return 'fa-font';
            case 'Array': return 'fa-list';
            case 'Object': return 'fa-cube';
            case 'Record': return 'fa-file-alt';
            case 'Entity': return 'fa-table';
            default: return 'fa-question';
        }
    }

    /**
     * Gets the color for a template parameter type
     */
    public getParamTypeColor(type: string): string {
        switch (type) {
            case 'Scalar': return '#17a2b8';
            case 'Array': return '#28a745';
            case 'Object': return '#6f42c1';
            case 'Record': return '#fd7e14';
            case 'Entity': return '#dc3545';
            default: return '#6c757d';
        }
    }

    /**
     * Gets a friendly description of the parameter type
     */
    public getParamTypeDescription(param: MJTemplateParamEntity): string {
        switch (param.Type) {
            case 'Scalar': 
                return 'Single value (text, number, date, etc.)';
            case 'Array': 
                return 'List of values';
            case 'Object': 
                return 'JSON object with multiple properties';
            case 'Record': 
                if (param.EntityID) {
                    return `Single record from entity`;
                }
                return 'Single database record';
            case 'Entity': 
                if (param.EntityID) {
                    return `Multiple records from entity`;
                }
                return 'Entity data collection';
            default: 
                return 'Unknown type';
        }
    }
}
