import { Component, OnInit, ViewChild, ChangeDetectorRef, ViewContainerRef, inject } from '@angular/core';
import { MJTemplateEntity, MJTemplateContentEntity, MJTemplateParamEntity, MJAIPromptModelEntity, MJAIVendorEntity, MJAIModelVendorEntity, MJAIPromptTypeEntity, MJAIConfigurationEntity } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseFormComponent, CUSTOM_LAYOUT_TOOLBAR_CONFIG } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { TemplateEditorConfig, TemplateEditorComponent } from '../../shared/components/template-editor.component';
import { MJAIPromptFormComponent } from '../../generated/Entities/MJAIPrompt/mjaiprompt.form.component';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { AIPromptManagementService } from './ai-prompt-management.service';
import { MJAIModelEntityExtended, MJAIPromptCategoryEntityExtended, MJAIPromptEntityExtended, MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';

@RegisterClass(BaseFormComponent, 'MJ: AI Prompts')
@Component({
  standalone: false,
    selector: 'mj-ai-prompt-form',
    templateUrl: './ai-prompt-form.component.html',
    styleUrls: ['./ai-prompt-form.component.css']
})
export class MJAIPromptFormComponentExtended extends MJAIPromptFormComponent implements OnInit {
    private testHarnessService = inject(AITestHarnessDialogService);
    private viewContainerRef = inject(ViewContainerRef);
    private promptManagementService = inject(AIPromptManagementService);

    public record!: MJAIPromptEntityExtended;
    public readonly ToolbarConfig = CUSTOM_LAYOUT_TOOLBAR_CONFIG;

    /** @deprecated Use {@link ToolbarConfig}. */
    public get toolbarConfig() {
      return this.ToolbarConfig;
    }

    /** Custom-layout AI Prompt form looks best full-width on first open. */
    public override getDefaultFormWidthMode(): 'centered' | 'full-width' { return 'full-width'; }
    public Template: MJTemplateEntity | null = null;

    /** @deprecated Use {@link Template}. */
    public get template(): MJTemplateEntity | null {
      return this.Template;
    }
    /** @deprecated Use {@link Template}. */
    public set template(value: MJTemplateEntity | null) {
      this.Template = value;
    }
    public TemplateContent: MJTemplateContentEntity | null = null;

    /** @deprecated Use {@link TemplateContent}. */
    public get templateContent(): MJTemplateContentEntity | null {
      return this.TemplateContent;
    }
    /** @deprecated Use {@link TemplateContent}. */
    public set templateContent(value: MJTemplateContentEntity | null) {
      this.TemplateContent = value;
    }
    public TemplateParams: MJTemplateParamEntity[] = [];

    /** @deprecated Use {@link TemplateParams}. */
    public get templateParams(): MJTemplateParamEntity[] {
      return this.TemplateParams;
    }
    /** @deprecated Use {@link TemplateParams}. */
    public set templateParams(value: MJTemplateParamEntity[]) {
      this.TemplateParams = value;
    }
    public IsLoadingTemplate = true;

    /** @deprecated Use {@link IsLoadingTemplate}. */
    public get isLoadingTemplate() {
      return this.IsLoadingTemplate;
    }
    /** @deprecated Use {@link IsLoadingTemplate}. */
    public set isLoadingTemplate(value) {
      this.IsLoadingTemplate = value;
    } // Default to loading state
    public IsLoadingTemplateParams = false;

    /** @deprecated Use {@link IsLoadingTemplateParams}. */
    public get isLoadingTemplateParams() {
      return this.IsLoadingTemplateParams;
    }
    /** @deprecated Use {@link IsLoadingTemplateParams}. */
    public set isLoadingTemplateParams(value) {
      this.IsLoadingTemplateParams = value;
    }
    public TemplateNotFoundInDatabase = false;

    /** @deprecated Use {@link TemplateNotFoundInDatabase}. */
    public get templateNotFoundInDatabase() {
      return this.TemplateNotFoundInDatabase;
    }
    /** @deprecated Use {@link TemplateNotFoundInDatabase}. */
    public set templateNotFoundInDatabase(value) {
      this.TemplateNotFoundInDatabase = value;
    }
    public ShowTestHarness = false;

    /** @deprecated Use {@link ShowTestHarness}. */
    public get showTestHarness() {
      return this.ShowTestHarness;
    }
    /** @deprecated Use {@link ShowTestHarness}. */
    public set showTestHarness(value) {
      this.ShowTestHarness = value;
    }
    
    // Model management
    public PromptModels: MJAIPromptModelEntity[] = [];

    /** @deprecated Use {@link PromptModels}. */
    public get promptModels(): MJAIPromptModelEntity[] {
      return this.PromptModels;
    }
    /** @deprecated Use {@link PromptModels}. */
    public set promptModels(value: MJAIPromptModelEntity[]) {
      this.PromptModels = value;
    }
    public AvailableModels: MJAIModelEntityExtended[] = [];

    /** @deprecated Use {@link AvailableModels}. */
    public get availableModels(): MJAIModelEntityExtended[] {
      return this.AvailableModels;
    }
    /** @deprecated Use {@link AvailableModels}. */
    public set availableModels(value: MJAIModelEntityExtended[]) {
      this.AvailableModels = value;
    }
    public AvailableVendors: MJAIVendorEntity[] = [];

    /** @deprecated Use {@link AvailableVendors}. */
    public get availableVendors(): MJAIVendorEntity[] {
      return this.AvailableVendors;
    }
    /** @deprecated Use {@link AvailableVendors}. */
    public set availableVendors(value: MJAIVendorEntity[]) {
      this.AvailableVendors = value;
    }
    public IsLoadingModels = false;

    /** @deprecated Use {@link IsLoadingModels}. */
    public get isLoadingModels() {
      return this.IsLoadingModels;
    }
    /** @deprecated Use {@link IsLoadingModels}. */
    public set isLoadingModels(value) {
      this.IsLoadingModels = value;
    }
    
    // Vendor management per model
    public ModelVendorsMap = new Map<string, { vendors: MJAIVendorEntity[], modelVendors: MJAIModelVendorEntity[] }>();

    /** @deprecated Use {@link ModelVendorsMap}. */
    public get modelVendorsMap() {
      return this.ModelVendorsMap;
    }
    /** @deprecated Use {@link ModelVendorsMap}. */
    public set modelVendorsMap(value) {
      this.ModelVendorsMap = value;
    }
    
    // AI Prompt Types
    public AvailablePromptTypes: MJAIPromptTypeEntity[] = [];

    /** @deprecated Use {@link AvailablePromptTypes}. */
    public get availablePromptTypes(): MJAIPromptTypeEntity[] {
      return this.AvailablePromptTypes;
    }
    /** @deprecated Use {@link AvailablePromptTypes}. */
    public set availablePromptTypes(value: MJAIPromptTypeEntity[]) {
      this.AvailablePromptTypes = value;
    }
    public IsLoadingPromptTypes = false;

    /** @deprecated Use {@link IsLoadingPromptTypes}. */
    public get isLoadingPromptTypes() {
      return this.IsLoadingPromptTypes;
    }
    /** @deprecated Use {@link IsLoadingPromptTypes}. */
    public set isLoadingPromptTypes(value) {
      this.IsLoadingPromptTypes = value;
    }
    
    // AI Configurations
    public AvailableConfigurations: MJAIConfigurationEntity[] = [];

    /** @deprecated Use {@link AvailableConfigurations}. */
    public get availableConfigurations(): MJAIConfigurationEntity[] {
      return this.AvailableConfigurations;
    }
    /** @deprecated Use {@link AvailableConfigurations}. */
    public set availableConfigurations(value: MJAIConfigurationEntity[]) {
      this.AvailableConfigurations = value;
    }
    public IsLoadingConfigurations = false;

    /** @deprecated Use {@link IsLoadingConfigurations}. */
    public get isLoadingConfigurations() {
      return this.IsLoadingConfigurations;
    }
    /** @deprecated Use {@link IsLoadingConfigurations}. */
    public set isLoadingConfigurations(value) {
      this.IsLoadingConfigurations = value;
    }
    
    // Result Selector Tree Data
    public ResultSelectorTreeData: any[] = [];

    /** @deprecated Use {@link ResultSelectorTreeData}. */
    public get resultSelectorTreeData(): any[] {
      return this.ResultSelectorTreeData;
    }
    /** @deprecated Use {@link ResultSelectorTreeData}. */
    public set resultSelectorTreeData(value: any[]) {
      this.ResultSelectorTreeData = value;
    }
    public IsLoadingResultSelectorData = false;

    /** @deprecated Use {@link IsLoadingResultSelectorData}. */
    public get isLoadingResultSelectorData() {
      return this.IsLoadingResultSelectorData;
    }
    /** @deprecated Use {@link IsLoadingResultSelectorData}. */
    public set isLoadingResultSelectorData(value) {
      this.IsLoadingResultSelectorData = value;
    }
    
    // Drag and drop state
    public DraggedIndex: number = -1;

    /** @deprecated Use {@link DraggedIndex}. */
    public get draggedIndex(): number {
      return this.DraggedIndex;
    }
    /** @deprecated Use {@link DraggedIndex}. */
    public set draggedIndex(value: number) {
      this.DraggedIndex = value;
    }
    
    // Execution History
    public ExecutionHistory: MJAIPromptRunEntityExtended[] = [];

    /** @deprecated Use {@link ExecutionHistory}. */
    public get executionHistory(): MJAIPromptRunEntityExtended[] {
      return this.ExecutionHistory;
    }
    /** @deprecated Use {@link ExecutionHistory}. */
    public set executionHistory(value: MJAIPromptRunEntityExtended[]) {
      this.ExecutionHistory = value;
    }
    public IsLoadingHistory = false;

    /** @deprecated Use {@link IsLoadingHistory}. */
    public get isLoadingHistory() {
      return this.IsLoadingHistory;
    }
    /** @deprecated Use {@link IsLoadingHistory}. */
    public set isLoadingHistory(value) {
      this.IsLoadingHistory = value;
    }
    public HistorySortField: 'runAt' | 'executionTime' | 'cost' | 'tokens' = 'runAt';

    /** @deprecated Use {@link HistorySortField}. */
    public get historySortField(): 'runAt' | 'executionTime' | 'cost' | 'tokens' {
      return this.HistorySortField;
    }
    /** @deprecated Use {@link HistorySortField}. */
    public set historySortField(value: 'runAt' | 'executionTime' | 'cost' | 'tokens') {
      this.HistorySortField = value;
    }
    public HistorySortDirection: 'asc' | 'desc' = 'desc';

    /** @deprecated Use {@link HistorySortDirection}. */
    public get historySortDirection(): 'asc' | 'desc' {
      return this.HistorySortDirection;
    }
    /** @deprecated Use {@link HistorySortDirection}. */
    public set historySortDirection(value: 'asc' | 'desc') {
      this.HistorySortDirection = value;
    }
    
    // Removed custom transaction tracking - we'll use base form's _pendingRecords instead
    public HasUnsavedChanges = false;

    /** @deprecated Use {@link HasUnsavedChanges}. */
    public get hasUnsavedChanges() {
      return this.HasUnsavedChanges;
    }
    /** @deprecated Use {@link HasUnsavedChanges}. */
    public set hasUnsavedChanges(value) {
      this.HasUnsavedChanges = value;
    }
    
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
    public ClearPermissionCache(): void {
        this._permissionCache.clear();
    }

    /** @deprecated Use {@link ClearPermissionCache}. */
    public clearPermissionCache(): void {
      return this.ClearPermissionCache();
    }
    
    // Template editor configuration
    public get TemplateEditorConfig(): TemplateEditorConfig {
        return {
            allowEdit: this.EditMode && this.UserCanUpdateTemplateContents,
            showRunButton: false,
            compactMode: false
        };
    }

    /** @deprecated Use {@link TemplateEditorConfig}. */
    public get templateEditorConfig(): TemplateEditorConfig {
      return this.TemplateEditorConfig;
    }

    private get _metadata() { return this.ProviderToUse; }
    private __inferenceProvider_VendorTypeDefinitionID: string = '';

    @ViewChild('templateEditor') templateEditor: TemplateEditorComponent | undefined;

    async ngOnInit() {
        await super.ngOnInit();

        // make sure AI Engine Base is configured, this will load stuff only if not already
        // loaded in the current process space
        await AIEngineBase.Instance.Config(false, this._metadata.CurrentUser);
        this.__inferenceProvider_VendorTypeDefinitionID = AIEngineBase.Instance.InferenceProviderTypeID || '';
        if (!this.__inferenceProvider_VendorTypeDefinitionID) {
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
            this.IsLoadingTemplate = false;
        }
        
        // Load available models, vendors, prompt types, configurations, prompt models, and result selector data
        await Promise.all([
            this.LoadAvailableModels(),
            this.LoadAvailableVendors(),
            this.LoadAvailablePromptTypes(),
            this.LoadAvailableConfigurations(),
            this.LoadPromptModels(),
            this.LoadResultSelectorTreeData()
        ]);
        
        // Load execution history if record is saved
        if (this.record?.IsSaved) {
            await this.LoadExecutionHistory();
        }
        
        // Set defaults for new records
        if (!this.record.IsSaved) {
            // Default to first prompt type if not set
            if (!this.record.TypeID && this.AvailablePromptTypes.length > 0) {
                this.record.TypeID = this.AvailablePromptTypes[0].ID;
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
            this.Template = null;
            this.TemplateNotFoundInDatabase = false;
            return;
        }

        // First check if we already have this template in pending records (newly created)
        const pendingTemplate = this.PendingRecords.find(p => 
            p.entityObject.EntityInfo.Name === 'MJ: Templates' && 
            p.entityObject.Get('ID') === this.record.TemplateID
        );
        
        if (pendingTemplate) {
            // Use the pending template
            this.Template = pendingTemplate.entityObject as MJTemplateEntity;
            this.TemplateNotFoundInDatabase = false;
            this.IsLoadingTemplate = false;

            // Clear template content and params since this is a new template
            this.TemplateContent = null;
            this.TemplateParams = [];
            this.cdr.detectChanges();
            return;
        }

        this.IsLoadingTemplate = true;
        this.TemplateNotFoundInDatabase = false; // Reset the flag
        try {
            this.Template = await this._metadata.GetEntityObject<MJTemplateEntity>('MJ: Templates');
            await this.Template.Load(this.record.TemplateID);
            
            if (!this.Template.IsSaved) {
                this.Template = null;
                this.TemplateNotFoundInDatabase = true; // Set flag when template not found
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
            this.Template = null;
            this.TemplateNotFoundInDatabase = true; // Set flag on error
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error loading associated template',
                'error',
                5000
            );
        } finally {
            this.IsLoadingTemplate = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Handles template ID changes in the form
     */
    public async OnTemplateIdChange() {
        if (this.record?.TemplateID) {
            await this.loadTemplate();
        } else {
            this.Template = null;
            this.TemplateParams = [];
        }
        this.HasUnsavedChanges = true;
    }

    /** @deprecated Use {@link OnTemplateIdChange}. */
    public async onTemplateIdChange() {
      return this.OnTemplateIdChange();
    }
    

    /**
     * Opens a dialog to link an existing template
     */
    public async LinkExistingTemplate() {
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
                        this.HasUnsavedChanges = true;
                        
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
                        await this.CreateNewTemplate();
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

    /** @deprecated Use {@link LinkExistingTemplate}. */
    public async linkExistingTemplate() {
      return this.LinkExistingTemplate();
    }

    /**
     * Opens the current template in a new window
     */
    public OpenTemplateInNewWindow() {
        if (!this.Template?.ID) return;
        
        // TODO: Get the proper URL for template editing
        const templateUrl = `/templates/${this.Template.ID}`;
        window.open(templateUrl, '_blank');
    }

    /** @deprecated Use {@link OpenTemplateInNewWindow}. */
    public openTemplateInNewWindow() {
      return this.OpenTemplateInNewWindow();
    }

    /**
     * Creates a new template for this AI prompt (deferred until save)
     */
    public async CreateNewTemplate() {
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
            this.HasUnsavedChanges = true;
            
            // Set the template for UI purposes
            this.Template = newTemplate;
            
            // Clear existing template content and params since we have a new template
            this.TemplateContent = null;
            this.TemplateParams = [];
            this.IsLoadingTemplate = false;
            this.TemplateNotFoundInDatabase = false;
            
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

    /** @deprecated Use {@link CreateNewTemplate}. */
    public async createNewTemplate() {
      return this.CreateNewTemplate();
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
        if (!this.Template?.ID) {
            this.TemplateContent = null;
            return;
        }

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const results = await rv.RunView<MJTemplateContentEntity>({
                EntityName: 'MJ: Template Contents',
                ExtraFilter: `TemplateID = '${this.Template.ID}'`,
                OrderBy: 'Priority ASC',
                ResultType: 'entity_object'
            });
            
            // Get the first content (highest priority)
            this.TemplateContent = results.Results?.[0] || null;
        } catch (error) {
            console.error('Error loading template content:', error);
            this.TemplateContent = null;
        }
    }

    /**
     * Loads template parameters for the current template
     */
    private async loadTemplateParams() {
        if (!this.Template?.ID) {
            this.TemplateParams = [];
            return;
        }

        this.IsLoadingTemplateParams = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const results = await rv.RunView<MJTemplateParamEntity>({
                EntityName: 'MJ: Template Params',
                ExtraFilter: `TemplateID = '${this.Template.ID}'`,
                OrderBy: 'Name ASC' 
            });
            
            this.TemplateParams = results.Results || [];
        } catch (error) {
            console.error('Error loading template params:', error);
            this.TemplateParams = [];
        } finally {
            this.IsLoadingTemplateParams = false;
        }
    }

    /**
     * Opens the AI prompt execution dialog
     */
    public ExecuteAIPrompt() {
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
        this.OpenTestHarness();
    }

    /** @deprecated Use {@link ExecuteAIPrompt}. */
    public executeAIPrompt() {
      return this.ExecuteAIPrompt();
    }

    /**
     * Opens the test harness
     */
    public OpenTestHarness() {
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
                    this.LoadExecutionHistory();
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

    /** @deprecated Use {@link OpenTestHarness}. */
    public openTestHarness() {
      return this.OpenTestHarness();
    }

    /**
     * Handles when test harness is closed
     */
    public OnTestHarnessVisibilityChanged(isVisible: boolean) {
        this.ShowTestHarness = isVisible;
    }

    /** @deprecated Use {@link OnTestHarnessVisibilityChanged}. */
    public onTestHarnessVisibilityChanged(isVisible: boolean) {
      return this.OnTestHarnessVisibilityChanged(isVisible);
    }

    /**
     * Handles template content changes from the editor
     */
    public OnTemplateContentChange(content: MJTemplateContentEntity[]) {
        // Handle template content changes if needed
        console.log('Template content changed:', content);
        
        // Mark as having unsaved changes
        this.HasUnsavedChanges = true;
        
        // If we have content changes, we need to ensure they're added to pending records
        // This is typically handled by the template editor component itself
    }

    /** @deprecated Use {@link OnTemplateContentChange}. */
    public onTemplateContentChange(content: MJTemplateContentEntity[]) {
      return this.OnTemplateContentChange(content);
    }
    
    /**
     * Handles template content record deletion
     * This method should be called by the template editor to properly manage deletions
     */
    public HandleTemplateContentDelete(templateContent: MJTemplateContentEntity) {
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
        this.HasUnsavedChanges = true;
    }

    /** @deprecated Use {@link HandleTemplateContentDelete}. */
    public handleTemplateContentDelete(templateContent: MJTemplateContentEntity) {
      return this.HandleTemplateContentDelete(templateContent);
    }
    
    /**
     * Handles template content record creation/modification
     * This method should be called by the template editor to properly manage saves
     */
    public HandleTemplateContentSave(templateContent: MJTemplateContentEntity) {
        if (templateContent.Dirty || !templateContent.IsSaved) {
            // Add to pending saves
            this.PendingRecords.push({
                entityObject: templateContent,
                action: 'save'
            });
        }
        this.HasUnsavedChanges = true;
    }

    /** @deprecated Use {@link HandleTemplateContentSave}. */
    public handleTemplateContentSave(templateContent: MJTemplateContentEntity) {
      return this.HandleTemplateContentSave(templateContent);
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
    public OnTemplateRun(template: MJTemplateEntity) {
        console.log('Template run requested:', template);
        // Could open the template parameter dialog here if needed
        MJNotificationService.Instance.CreateSimpleNotification(
            'Template run functionality coming soon',
            'info',
            3000
        );
    }

    /** @deprecated Use {@link OnTemplateRun}. */
    public onTemplateRun(template: MJTemplateEntity) {
      return this.OnTemplateRun(template);
    }

    /**
     * Gets the display text for parallelization mode
     */
    public GetParallelizationModeDisplay(): string {
        switch (this.record?.ParallelizationMode) {
            case 'None': return 'None';
            case 'StaticCount': return `Static count (${this.record.ParallelCount || 1})`;
            case 'ConfigParam': return `Config parameter (${this.record.ParallelConfigParam || 'not set'})`;
            case 'ModelSpecific': return 'Model-specific configuration';
            default: return 'Unknown';
        }
    }

    /** @deprecated Use {@link GetParallelizationModeDisplay}. */
    public getParallelizationModeDisplay(): string {
      return this.GetParallelizationModeDisplay();
    }

    /**
     * Gets the display text for output type
     */
    public GetOutputTypeDisplay(): string {
        const type = this.record?.OutputType || 'string';
        const validationBehavior = this.record?.ValidationBehavior || 'Warn';
        
        if (validationBehavior === 'None') {
            return type;
        } else {
            return `${type} (${validationBehavior})`;
        }
    }

    /** @deprecated Use {@link GetOutputTypeDisplay}. */
    public getOutputTypeDisplay(): string {
      return this.GetOutputTypeDisplay();
    }
    
    /**
     * Gets the color for validation behavior display
     */
    public GetValidationColor(): string {
        switch (this.record?.ValidationBehavior) {
            case 'Strict': return '#dc3545'; // red
            case 'Warn': return '#ffc107'; // yellow
            default: return '#6c757d'; // default gray
        }
    }

    /** @deprecated Use {@link GetValidationColor}. */
    public getValidationColor(): string {
      return this.GetValidationColor();
    }

    /**
     * Checks if ParallelCount field should be visible
     */
    public get ShowParallelCount(): boolean {
        return this.record?.ParallelizationMode === 'StaticCount';
    }

    /** @deprecated Use {@link ShowParallelCount}. */
    public get showParallelCount(): boolean {
      return this.ShowParallelCount;
    }

    /**
     * Checks if ParallelConfigParam field should be visible
     */
    public get ShowParallelConfigParam(): boolean {
        return this.record?.ParallelizationMode === 'ConfigParam';
    }

    /** @deprecated Use {@link ShowParallelConfigParam}. */
    public get showParallelConfigParam(): boolean {
      return this.ShowParallelConfigParam;
    }

    /**
     * Checks if OutputExample field should be visible
     */
    public get ShowOutputExample(): boolean {
        return this.record?.OutputType === 'object';
    }

    /** @deprecated Use {@link ShowOutputExample}. */
    public get showOutputExample(): boolean {
      return this.ShowOutputExample;
    }

    /**
     * Checks if the AI prompt can be executed
     */
    public get CanExecute(): boolean {
        return !!(this.record?.ID && 
                  this.record.Status === 'Active' && 
                  this.record.TemplateID && 
                  this.Template);
    }

    /** @deprecated Use {@link CanExecute}. */
    public get canExecute(): boolean {
      return this.CanExecute;
    }

    /**
     * Gets status badge color
     */
    public GetStatusBadgeColor(): string {
        switch (this.record?.Status) {
            case 'Active': return '#28a745';
            case 'Pending': return '#ffc107';
            case 'Disabled': return '#6c757d';
            default: return '#6c757d';
        }
    }

    /** @deprecated Use {@link GetStatusBadgeColor}. */
    public getStatusBadgeColor(): string {
      return this.GetStatusBadgeColor();
    }

    /**
     * Loads available AI models for selection
     */
    public async LoadAvailableModels() {
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const models = engine.Models;
            models.sort((a, b) => a.Name.localeCompare(b.Name));
            this.AvailableModels = models;
        } catch (error) {
            console.error('Error loading available models:', error);
        }
    }

    /** @deprecated Use {@link LoadAvailableModels}. */
    public async loadAvailableModels() {
      return this.LoadAvailableModels();
    }

    /**
     * Loads available AI vendors for selection
     */
    public async LoadAvailableVendors() {
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const vendors = engine.Vendors;
            vendors.sort((a, b) => a.Name.localeCompare(b.Name));
            this.AvailableVendors = vendors;
        } catch (error) {
            console.error('Error loading available vendors:', error);
        }
    }

    /** @deprecated Use {@link LoadAvailableVendors}. */
    public async loadAvailableVendors() {
      return this.LoadAvailableVendors();
    }

    /**
     * Loads available AI prompt types for selection
     */
    public async LoadAvailablePromptTypes() {
        this.IsLoadingPromptTypes = true;
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const promptTypes = engine.PromptTypes;
            promptTypes.sort((a, b) => a.Name.localeCompare(b.Name));
            this.AvailablePromptTypes = promptTypes;
        } catch (error) {
            console.error('Error loading available prompt types:', error);
        } finally {
            this.IsLoadingPromptTypes = false;
        }
    }

    /** @deprecated Use {@link LoadAvailablePromptTypes}. */
    public async loadAvailablePromptTypes() {
      return this.LoadAvailablePromptTypes();
    }

    /**
     * Loads available AI configurations for selection
     */
    public async LoadAvailableConfigurations() {
        this.IsLoadingConfigurations = true;
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const configurations = engine.Configurations;
            configurations.sort((a, b) => a.Name.localeCompare(b.Name));
            this.AvailableConfigurations = configurations;
        } catch (error) {
            console.error('Error loading available configurations:', error);
        } finally {
            this.IsLoadingConfigurations = false;
        }
    }

    /** @deprecated Use {@link LoadAvailableConfigurations}. */
    public async loadAvailableConfigurations() {
      return this.LoadAvailableConfigurations();
    }

    /**
     * Loads vendors available for a specific model
     */
    public async LoadVendorsForModel(modelId: string): Promise<{ vendors: MJAIVendorEntity[], modelVendors: MJAIModelVendorEntity[] }> {
        if (!modelId) {
            return { vendors: [], modelVendors: [] };
        }

        // Check cache first
        if (this.ModelVendorsMap.has(modelId)) {
            return this.ModelVendorsMap.get(modelId)!;
        }

        try {
            // Load model vendors for this model, filtering by TypeID for inference providers only
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            const modelVendors = engine.ModelVendors.filter(mv => UUIDsEqual(mv.ModelID, modelId) && engine.IsInferenceProvider(mv));
            
            // filter vendors to just the vendors in the modelVendors array in VendorID
            const vendors = engine.Vendors.filter(v => modelVendors.some(mv => UUIDsEqual(mv.VendorID, v.ID)));

            const result = { vendors, modelVendors };
            this.ModelVendorsMap.set(modelId, result);
            return result;

        } catch (error) {
            console.error('Error loading vendors for model:', error);
            return { vendors: [], modelVendors: [] };
        }
    }

    /** @deprecated Use {@link LoadVendorsForModel}. */
    public async loadVendorsForModel(modelId: string): Promise<{ vendors: MJAIVendorEntity[], modelVendors: MJAIModelVendorEntity[] }> {
      return this.LoadVendorsForModel(modelId);
    }

    /**
     * Gets vendors for a specific model from cache or loads them
     */
    public async GetVendorsForModel(modelId: string): Promise<MJAIVendorEntity[]> {
        const result = await this.LoadVendorsForModel(modelId);
        return result.vendors;
    }

    /** @deprecated Use {@link GetVendorsForModel}. */
    public async getVendorsForModel(modelId: string): Promise<MJAIVendorEntity[]> {
      return this.GetVendorsForModel(modelId);
    }

    /**
     * Gets the status for a model-vendor combination
     */
    public GetModelVendorStatus(modelId: string, vendorId: string): string {
        const modelVendorData = this.ModelVendorsMap.get(modelId);
        if (!modelVendorData) return 'Unknown';
        
        const modelVendor = modelVendorData.modelVendors.find(mv => UUIDsEqual(mv.VendorID, vendorId));
        return modelVendor?.Status || 'Unknown';
    }

    /** @deprecated Use {@link GetModelVendorStatus}. */
    public getModelVendorStatus(modelId: string, vendorId: string): string {
      return this.GetModelVendorStatus(modelId, vendorId);
    }

    /**
     * Gets the color for vendor status display
     */
    public GetVendorStatusColor(modelId: string, vendorId: string): string {
        const status = this.GetModelVendorStatus(modelId, vendorId);
        switch (status) {
            case 'Active': return '#28a745'; // green
            case 'Inactive': return '#dc3545'; // red  
            case 'Pending': return '#ffc107'; // yellow
            default: return '#6c757d'; // gray
        }
    }

    /** @deprecated Use {@link GetVendorStatusColor}. */
    public getVendorStatusColor(modelId: string, vendorId: string): string {
      return this.GetVendorStatusColor(modelId, vendorId);
    }

    /**
     * Handles model selection change and loads vendors for that model
     */
    public async OnModelChange(modelId: string, promptModelIndex: number) {
        const promptModel = this.PromptModels[promptModelIndex];
        if (!promptModel) return;

        // Clear the vendor selection when model changes
        promptModel.VendorID = null;
        this.HasUnsavedChanges = true;

        // Load vendors for the new model
        if (modelId) {
            const vendorData = await this.LoadVendorsForModel(modelId);
            
            // Auto-select first vendor if available
            if (vendorData.vendors.length > 0) {
                promptModel.VendorID = vendorData.vendors[0].ID;
            }
        }
        
        // Trigger change detection
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnModelChange}. */
    public async onModelChange(modelId: string, promptModelIndex: number) {
      return this.OnModelChange(modelId, promptModelIndex);
    }

    /**
     * Handles configuration change for a prompt model
     */
    public OnConfigurationChange(configurationId: string | null, promptModelIndex: number) {
        const promptModel = this.PromptModels[promptModelIndex];
        if (!promptModel) return;

        promptModel.ConfigurationID = configurationId;
        this.HasUnsavedChanges = true;
        
        // Trigger change detection
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnConfigurationChange}. */
    public onConfigurationChange(configurationId: string | null, promptModelIndex: number) {
      return this.OnConfigurationChange(configurationId, promptModelIndex);
    }

    /**
     * Gets vendors for a specific model
     */
    public GetVendorsForModelSync(modelId: string): MJAIVendorEntity[] {
        const modelVendorData = this.ModelVendorsMap.get(modelId);
        return modelVendorData?.vendors || [];
    }

    /** @deprecated Use {@link GetVendorsForModelSync}. */
    public getVendorsForModelSync(modelId: string): MJAIVendorEntity[] {
      return this.GetVendorsForModelSync(modelId);
    }

    /**
     * Checks if vendor dropdown should be shown (more than one vendor)
     */
    public ShouldShowVendorDropdown(modelId: string): boolean {
        if (!modelId) return false;
        const vendors = this.GetVendorsForModelSync(modelId);
        return vendors.length > 1;
    }

    /** @deprecated Use {@link ShouldShowVendorDropdown}. */
    public shouldShowVendorDropdown(modelId: string): boolean {
      return this.ShouldShowVendorDropdown(modelId);
    }

    /**
     * Loads prompt models for this AI prompt
     */
    public async LoadPromptModels() {
        if (!this.record?.ID) {
            this.PromptModels = [];
            return;
        }

        this.IsLoadingModels = true;
        try {
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            this.PromptModels = engine.PromptModels.filter(pm => UUIDsEqual(pm.PromptID, this.record.ID));
            this.PromptModels.sort((a, b) => {
                // first sort on priority (descending), then by created date (ascending)
                return b.Priority - a.Priority || new Date(a.__mj_CreatedAt).getTime() - new Date(b.__mj_CreatedAt).getTime();
            });

            // Load vendors for existing models
            const modelIds = this.PromptModels
                .map(pm => pm.ModelID)
                .filter(id => id); // Filter out null/undefined
            
            await Promise.all(modelIds.map(modelId => this.LoadVendorsForModel(modelId)));

        } catch (error) {
            console.error('Error loading prompt models:', error);
        } finally {
            this.IsLoadingModels = false;
        }
    }

    /** @deprecated Use {@link LoadPromptModels}. */
    public async loadPromptModels() {
      return this.LoadPromptModels();
    }

    /**
     * Adds a new model to the prompt (deferred until save)
     */
    public async AddNewModel() {
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
            
            this.PromptModels.push(newModel);
            this.HasUnsavedChanges = true;
            
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

    /** @deprecated Use {@link AddNewModel}. */
    public async addNewModel() {
      return this.AddNewModel();
    }

    /**
     * Removes a model from the prompt (deferred until save)
     */
    public async RemovePromptModel(index: number) {
        if (index < 0 || index >= this.PromptModels.length) return;
        
        const model = this.PromptModels[index];
        
        try {
            // If it's a saved model, add it to pending deletions
            if (model.IsSaved) {
                this.PendingRecords.push({
                    entityObject: model,
                    action: 'delete'
                });
            }

            // Remove from local array
            this.PromptModels.splice(index, 1);
            this.HasUnsavedChanges = true;

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

    /** @deprecated Use {@link RemovePromptModel}. */
    public async removePromptModel(index: number) {
      return this.RemovePromptModel(index);
    }

    /**
     * Gets the display name for a model ID
     */
    public GetModelDisplayName(modelId: string): string {
        if (!modelId) return '';
        const model = this.AvailableModels.find(m => UUIDsEqual(m.ID, modelId));
        return model ? model.Name : modelId;
    }

    /** @deprecated Use {@link GetModelDisplayName}. */
    public getModelDisplayName(modelId: string): string {
      return this.GetModelDisplayName(modelId);
    }

    /**
     * Gets the display name for a vendor ID
     */
    public GetVendorDisplayName(vendorId: string): string {
        if (!vendorId) return '';
        const vendor = this.AvailableVendors.find(v => UUIDsEqual(v.ID, vendorId));
        return vendor ? vendor.Name : vendorId;
    }

    /** @deprecated Use {@link GetVendorDisplayName}. */
    public getVendorDisplayName(vendorId: string): string {
      return this.GetVendorDisplayName(vendorId);
    }

    /**
     * Gets the display name for a prompt type ID
     */
    public GetPromptTypeDisplayName(typeId: string): string {
        if (!typeId) return '';
        const type = this.AvailablePromptTypes.find(t => UUIDsEqual(t.ID, typeId));
        return type ? type.Name : typeId;
    }

    /** @deprecated Use {@link GetPromptTypeDisplayName}. */
    public getPromptTypeDisplayName(typeId: string): string {
      return this.GetPromptTypeDisplayName(typeId);
    }

    /**
     * Gets the display name for a configuration ID
     */
    public GetConfigurationDisplayName(configurationId: string | null): string {
        if (!configurationId) return 'Default';
        const config = this.AvailableConfigurations.find(c => UUIDsEqual(c.ID, configurationId));
        return config ? config.Name : configurationId;
    }

    /** @deprecated Use {@link GetConfigurationDisplayName}. */
    public getConfigurationDisplayName(configurationId: string | null): string {
      return this.GetConfigurationDisplayName(configurationId);
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
        if (!UUIDsEqual(this.originalTemplateID, this.record.TemplateID)) {
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
        this.HasUnsavedChanges = false;
    }

    /**
     * Adds prompt model changes to the pending records
     */
    private addPromptModelsToPendingRecords() {
        // Add all prompt models that have been modified or are new
        for (const model of this.PromptModels) {
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
            const md = this.ProviderToUse;
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
                this.HasUnsavedChanges = false;
                
                // Reload prompt models to reflect database state
                await this.LoadPromptModels();
                
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
    public async LoadResultSelectorTreeData() {
        this.IsLoadingResultSelectorData = true;
        try {
            // Load categories and prompts
            const engine = AIEngineBase.Instance;
            await engine.Config(false);

            const categories = engine.PromptCategories;
            const prompts = engine.Prompts.filter(p => p.Status === 'Active');

            categories.sort((a, b) => a.Name.localeCompare(b.Name));
            prompts.sort((a, b) => a.Name.localeCompare(b.Name));
             
            // Build tree structure
            this.ResultSelectorTreeData = this.buildResultSelectorTree(categories, prompts);

        } catch (error) {
            console.error('Error loading result selector tree data:', error);
            this.ResultSelectorTreeData = [];
        } finally {
            this.IsLoadingResultSelectorData = false;
        }
    }

    /** @deprecated Use {@link LoadResultSelectorTreeData}. */
    public async loadResultSelectorTreeData() {
      return this.LoadResultSelectorTreeData();
    }

    /**
     * Builds the tree structure for result selector
     */
    private buildResultSelectorTree(categories: MJAIPromptCategoryEntityExtended[], prompts: MJAIPromptEntityExtended[]): any[] {
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
    public OnResultSelectorChange(value: string) {
        this.record.ResultSelectorPromptID = value || null;
    }

    /** @deprecated Use {@link OnResultSelectorChange}. */
    public onResultSelectorChange(value: string) {
      return this.OnResultSelectorChange(value);
    }

    /**
     * Gets the display name for a prompt ID from the tree data
     */
    public GetPromptDisplayName(promptId: string): string {
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

        return findPromptInTree(this.ResultSelectorTreeData);
    }

    /** @deprecated Use {@link GetPromptDisplayName}. */
    public getPromptDisplayName(promptId: string): string {
      return this.GetPromptDisplayName(promptId);
    }

    /**
     * Moves a model up in the list by swapping with the previous item
     */
    public MoveModelUp(index: number) {
        if (index > 0 && index < this.PromptModels.length) {
            // Create new array to ensure Angular detects the change
            const newModels = [...this.PromptModels];
            
            // Swap with previous item
            [newModels[index - 1], newModels[index]] = 
            [newModels[index], newModels[index - 1]];
            
            // Replace the array and force full re-render
            this.PromptModels = [...newModels];
            this.HasUnsavedChanges = true;
            
            this.updateModelPriorities();
            
            // Force Angular to re-evaluate all bindings
            this.cdr.detectChanges();
            
            // Additional force update for Kendo dropdowns
            setTimeout(() => {
                this.cdr.detectChanges();
            }, 0);
        }
    }

    /** @deprecated Use {@link MoveModelUp}. */
    public moveModelUp(index: number) {
      return this.MoveModelUp(index);
    }

    /**
     * Moves a model down in the list by swapping with the next item
     */
    public MoveModelDown(index: number) {
        if (index >= 0 && index < this.PromptModels.length - 1) {
            // Create new array to ensure Angular detects the change
            const newModels = [...this.PromptModels];
            
            // Swap with next item
            [newModels[index], newModels[index + 1]] = 
            [newModels[index + 1], newModels[index]];
            
            // Replace the array and force full re-render
            this.PromptModels = [...newModels];
            this.HasUnsavedChanges = true;
            
            this.updateModelPriorities();
            
            // Force Angular to re-evaluate all bindings
            this.cdr.detectChanges();
            
            // Additional force update for Kendo dropdowns
            setTimeout(() => {
                this.cdr.detectChanges();
            }, 0);
        }
    }

    /** @deprecated Use {@link MoveModelDown}. */
    public moveModelDown(index: number) {
      return this.MoveModelDown(index);
    }

    /**
     * Updates priority values based on array order
     */
    private updateModelPriorities() {
        // Update priorities based on position (higher priority for items at top)
        const maxPriority = this.PromptModels.length;
        this.PromptModels.forEach((model, index) => {
            model.Priority = maxPriority - index;
        });
    }
    
    /**
     * Gets a stable identifier for a model (for form tracking)
     */
    public GetModelTrackId(model: MJAIPromptModelEntity): string {
        return model.ID || (model as any)._tempId || '';
    }

    /** @deprecated Use {@link GetModelTrackId}. */
    public getModelTrackId(model: MJAIPromptModelEntity): string {
      return this.GetModelTrackId(model);
    }

    /**
     * Handles drag start event
     */
    public OnDragStart(event: DragEvent, index: number) {
        this.DraggedIndex = index;
        event.dataTransfer!.effectAllowed = 'move';
        event.dataTransfer!.setData('text/html', ''); // Required for Firefox
    }

    /** @deprecated Use {@link OnDragStart}. */
    public onDragStart(event: DragEvent, index: number) {
      return this.OnDragStart(event, index);
    }

    /**
     * Handles drag over event
     */
    public OnDragOver(event: DragEvent) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
    }

    /** @deprecated Use {@link OnDragOver}. */
    public onDragOver(event: DragEvent) {
      return this.OnDragOver(event);
    }

    /**
     * Handles drop event
     */
    public OnDrop(event: DragEvent, dropIndex: number) {
        event.preventDefault();
        
        if (this.DraggedIndex !== -1 && this.DraggedIndex !== dropIndex) {
            // Create new array to ensure Angular detects the change
            const newModels = [...this.PromptModels];
            
            // Remove dragged item
            const draggedItem = newModels.splice(this.DraggedIndex, 1)[0];
            
            // Insert at new position
            newModels.splice(dropIndex, 0, draggedItem);
            
            // Replace the array and force full re-render
            this.PromptModels = [...newModels];
            this.HasUnsavedChanges = true;
            
            // Update priorities
            this.updateModelPriorities();
            
            // Force Angular to re-evaluate all bindings
            this.cdr.detectChanges();
            
            // Additional force update for Kendo dropdowns
            setTimeout(() => {
                this.cdr.detectChanges();
            }, 0);
        }
        
        this.DraggedIndex = -1;
    }

    /** @deprecated Use {@link OnDrop}. */
    public onDrop(event: DragEvent, dropIndex: number) {
      return this.OnDrop(event, dropIndex);
    }

    /**
     * Handles drag end event
     */
    public OnDragEnd(_event: DragEvent) {
        this.DraggedIndex = -1;
    }

    /** @deprecated Use {@link OnDragEnd}. */
    public onDragEnd(_event: DragEvent) {
      return this.OnDragEnd(_event);
    }
    
    /**
     * Load execution history for this prompt
     */
    public async LoadExecutionHistory() {
        if (!this.record?.ID) return;
        
        this.IsLoadingHistory = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJAIPromptRunEntityExtended>({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `PromptID='${this.record.ID}'`,
                OrderBy: 'RunAt DESC' 
            });
            
            this.ExecutionHistory = result.Results;
            this.SortExecutionHistory();
        } catch (error) {
            console.error('Error loading execution history:', error);
            this.ExecutionHistory = [];
        } finally {
            this.IsLoadingHistory = false;
        }
    }

    /** @deprecated Use {@link LoadExecutionHistory}. */
    public async loadExecutionHistory() {
      return this.LoadExecutionHistory();
    }
    
    /**
     * Sort execution history based on current sort field and direction
     */
    public SortExecutionHistory() {
        if (!this.ExecutionHistory || this.ExecutionHistory.length === 0) return;
        
        this.ExecutionHistory.sort((a, b) => {
            let aVal: any, bVal: any;
            
            switch (this.HistorySortField) {
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
            
            if (this.HistorySortDirection === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });
    }

    /** @deprecated Use {@link SortExecutionHistory}. */
    public sortExecutionHistory() {
      return this.SortExecutionHistory();
    }
    
    /**
     * Change sort field and direction for execution history
     */
    public ChangeHistorySort(field: 'runAt' | 'executionTime' | 'cost' | 'tokens') {
        if (this.HistorySortField === field) {
            // Toggle direction if same field
            this.HistorySortDirection = this.HistorySortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // New field, default to desc
            this.HistorySortField = field;
            this.HistorySortDirection = 'desc';
        }
        this.SortExecutionHistory();
    }

    /** @deprecated Use {@link ChangeHistorySort}. */
    public changeHistorySort(field: 'runAt' | 'executionTime' | 'cost' | 'tokens') {
      return this.ChangeHistorySort(field);
    }
    
    /**
     * Navigate to a prompt run record
     */
    public NavigateToPromptRun(runId: string) {
        SharedService.Instance.OpenEntityRecord('MJ: AI Prompt Runs', CompositeKey.FromID(runId));
    }

    /** @deprecated Use {@link NavigateToPromptRun}. */
    public navigateToPromptRun(runId: string) {
      return this.NavigateToPromptRun(runId);
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
    public FormatCost(cost: number | null): string {
        if (!cost) return '-';
        return `$${cost.toFixed(4)}`;
    }

    /** @deprecated Use {@link FormatCost}. */
    public formatCost(cost: number | null): string {
      return this.FormatCost(cost);
    }
    
    /**
     * Format tokens for display
     */
    public FormatTokens(tokens: number | null): string {
        if (!tokens) return '-';
        return tokens.toLocaleString();
    }

    /** @deprecated Use {@link FormatTokens}. */
    public formatTokens(tokens: number | null): string {
      return this.FormatTokens(tokens);
    }
    
    /**
     * Get status color for execution
     */
    public GetExecutionStatusColor(success: boolean | null): string {
        if (success === true) return '#28a745';
        if (success === false) return '#dc3545';
        return '#ffc107';
    }

    /** @deprecated Use {@link GetExecutionStatusColor}. */
    public getExecutionStatusColor(success: boolean | null): string {
      return this.GetExecutionStatusColor(success);
    }
    
    /**
     * Get status icon for execution
     */
    public GetExecutionStatusIcon(success: boolean | null): string {
        if (success === true) return 'fa-check-circle';
        if (success === false) return 'fa-times-circle';
        return 'fa-spinner fa-spin';
    }

    /** @deprecated Use {@link GetExecutionStatusIcon}. */
    public getExecutionStatusIcon(success: boolean | null): string {
      return this.GetExecutionStatusIcon(success);
    }

    /**
     * Gets the icon for a template parameter type
     */
    public GetParamTypeIcon(type: string): string {
        switch (type) {
            case 'Scalar': return 'fa-font';
            case 'Array': return 'fa-list';
            case 'Object': return 'fa-cube';
            case 'Record': return 'fa-file-alt';
            case 'Entity': return 'fa-table';
            default: return 'fa-question';
        }
    }

    /** @deprecated Use {@link GetParamTypeIcon}. */
    public getParamTypeIcon(type: string): string {
      return this.GetParamTypeIcon(type);
    }

    /**
     * Gets the color for a template parameter type
     */
    public GetParamTypeColor(type: string): string {
        switch (type) {
            case 'Scalar': return '#17a2b8';
            case 'Array': return '#28a745';
            case 'Object': return '#6f42c1';
            case 'Record': return '#fd7e14';
            case 'Entity': return '#dc3545';
            default: return '#6c757d';
        }
    }

    /** @deprecated Use {@link GetParamTypeColor}. */
    public getParamTypeColor(type: string): string {
      return this.GetParamTypeColor(type);
    }

    /**
     * Gets a friendly description of the parameter type
     */
    public GetParamTypeDescription(param: MJTemplateParamEntity): string {
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

    /** @deprecated Use {@link GetParamTypeDescription}. */
    public getParamTypeDescription(param: MJTemplateParamEntity): string {
      return this.GetParamTypeDescription(param);
    }
}
