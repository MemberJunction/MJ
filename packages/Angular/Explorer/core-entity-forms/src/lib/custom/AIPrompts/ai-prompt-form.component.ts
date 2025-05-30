import { Component, OnInit, ViewChild } from '@angular/core';
import { AIPromptEntity, TemplateEntity, TemplateContentEntity, AIPromptModelEntity, AIModelEntity, AIVendorEntity, AIPromptCategoryEntity, AIModelVendorEntity, AIPromptTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { TemplateEditorConfig, TemplateEditorComponent } from '../../shared/components/template-editor.component';
import { AIPromptFormComponent } from '../../generated/Entities/AIPrompt/aiprompt.form.component';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

@RegisterClass(BaseFormComponent, 'AI Prompts')
@Component({
    selector: 'mj-ai-prompt-form',
    templateUrl: './ai-prompt-form.component.html',
    styleUrls: ['./ai-prompt-form.component.css']
})
export class AIPromptFormComponentExtended extends AIPromptFormComponent implements OnInit {
    public record!: AIPromptEntity;
    public template: TemplateEntity | null = null;
    public isLoadingTemplate = false;
    public showExecutionDialog = false;
    
    // Model management
    public promptModels: AIPromptModelEntity[] = [];
    public availableModels: AIModelEntity[] = [];
    public availableVendors: AIVendorEntity[] = [];
    public isLoadingModels = false;
    
    // Vendor management per model
    public modelVendorsMap = new Map<string, { vendors: AIVendorEntity[], modelVendors: AIModelVendorEntity[] }>();
    
    // AI Prompt Types
    public availablePromptTypes: AIPromptTypeEntity[] = [];
    public isLoadingPromptTypes = false;
    
    // Result Selector Tree Data
    public resultSelectorTreeData: any[] = [];
    public isLoadingResultSelectorData = false;
    
    // Template editor configuration
    public get templateEditorConfig(): TemplateEditorConfig {
        return {
            allowEdit: this.EditMode,
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
            this.loadTemplate();
        }
        
        // Load available models, vendors, prompt types, prompt models, and result selector data
        await Promise.all([
            this.loadAvailableModels(),
            this.loadAvailableVendors(),
            this.loadAvailablePromptTypes(),
            this.loadPromptModels(),
            this.loadResultSelectorTreeData()
        ]);
        
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
            return;
        }

        this.isLoadingTemplate = true;
        try {
            this.template = await this._metadata.GetEntityObject<TemplateEntity>('Templates');
            await this.template.Load(this.record.TemplateID);
            
            if (!this.template.IsSaved) {
                this.template = null;
                console.warn(`Template with ID ${this.record.TemplateID} not found`);
            }

        } catch (error) {
            console.error('Error loading template:', error);
            this.template = null;
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error loading associated template',
                'error',
                5000
            );
        } finally {
            this.isLoadingTemplate = false;
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
        }
    }

    /**
     * Opens a dialog to link an existing template
     */
    public async linkExistingTemplate() {
        // TODO: Implement template selection dialog
        MJNotificationService.Instance.CreateSimpleNotification(
            'Template linking functionality coming soon',
            'info',
            3000
        );
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
     * Creates a new template for this AI prompt
     */
    public async createNewTemplate() {
        try {
            const newTemplate = await this._metadata.GetEntityObject<TemplateEntity>('Templates');
            newTemplate.NewRecord();
            newTemplate.Name = `${this.record.Name || 'AI Prompt'} Template`;
            newTemplate.Description = `Template for AI Prompt: ${this.record.Name}`;
            newTemplate.UserID = this._metadata.CurrentUser.ID;
            
            const saveResult = await newTemplate.Save();
            if (!saveResult) {
                const errorMessage = newTemplate.LatestResult?.Message || newTemplate.LatestResult?.Errors || 'Unknown error';
                console.error('Template save failed:', errorMessage);
                throw new Error(`Failed to save new template: ${errorMessage}`);
            }

            // Update the AI prompt to reference the new template
            this.record.TemplateID = newTemplate.ID;
            
            // Load the new template
            await this.loadTemplate();

            MJNotificationService.Instance.CreateSimpleNotification(
                'New template created and linked successfully',
                'success',
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

        this.showExecutionDialog = true;
    }

    /**
     * Handles template content changes from the editor
     */
    public onTemplateContentChange(content: TemplateContentEntity[]) {
        // Handle template content changes if needed
        console.log('Template content changed:', content);
    }

    /**
     * Handles template run requests from the editor
     */
    public onTemplateRun(template: TemplateEntity) {
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
            const rv = new RunView();
            const results = await rv.RunView<AIModelEntity>({
                EntityName: 'AI Models',
                OrderBy: 'Name ASC',
                ResultType: 'entity_object'
            });
            
            this.availableModels = results.Results;
        } catch (error) {
            console.error('Error loading available models:', error);
        }
    }

    /**
     * Loads available AI vendors for selection
     */
    public async loadAvailableVendors() {
        try {
            const rv = new RunView();
            const results = await rv.RunView<AIVendorEntity>({
                EntityName: 'MJ: AI Vendors',
                OrderBy: 'Name ASC',
                ResultType: 'entity_object'
            });
            
            this.availableVendors = results.Results;
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
            const rv = new RunView();
            const results = await rv.RunView<AIPromptTypeEntity>({
                EntityName: 'AI Prompt Types',
                OrderBy: '__mj_CreatedAt ASC',
                ResultType: 'entity_object'
            });
            
            this.availablePromptTypes = results.Results;
        } catch (error) {
            console.error('Error loading available prompt types:', error);
        } finally {
            this.isLoadingPromptTypes = false;
        }
    }

    /**
     * Loads vendors available for a specific model
     */
    public async loadVendorsForModel(modelId: string): Promise<{ vendors: AIVendorEntity[], modelVendors: AIModelVendorEntity[] }> {
        if (!modelId) {
            return { vendors: [], modelVendors: [] };
        }

        // Check cache first
        if (this.modelVendorsMap.has(modelId)) {
            return this.modelVendorsMap.get(modelId)!;
        }

        try {
            // Load model vendors for this model, filtering by TypeID for inference providers only
            const rv = new RunView();
            const modelVendorsResult = await rv.RunView<AIModelVendorEntity>({
                EntityName: 'MJ: AI Model Vendors',
                ExtraFilter: `ModelID='${modelId}' AND TypeID='${this.__InferenceProvider_VendorTypeDefinitionID}'`,
                OrderBy: 'VendorID ASC',
                ResultType: 'entity_object'
            });

            const modelVendors = modelVendorsResult.Results || [];
            
            // Get unique vendor IDs
            const vendorIds = [...new Set(modelVendors.map(mv => mv.VendorID))];
            
            // Load vendor details
            const vendors: AIVendorEntity[] = [];
            if (vendorIds.length > 0) {
                const vendorFilter = vendorIds.map(id => `ID='${id}'`).join(' OR ');
                const vendorsResult = await rv.RunView<AIVendorEntity>({
                    EntityName: 'MJ: AI Vendors',
                    ExtraFilter: vendorFilter,
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                });
                vendors.push(...(vendorsResult.Results || []));
            }

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
    public async getVendorsForModel(modelId: string): Promise<AIVendorEntity[]> {
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

        // Load vendors for the new model
        if (modelId) {
            const vendorData = await this.loadVendorsForModel(modelId);
            
            // Auto-select first vendor if available
            if (vendorData.vendors.length > 0) {
                promptModel.VendorID = vendorData.vendors[0].ID;
            }
        }
    }

    /**
     * Gets vendors for a specific model
     */
    public getVendorsForModelSync(modelId: string): AIVendorEntity[] {
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
            const rv = new RunView();
            const results = await rv.RunView<AIPromptModelEntity>({
                EntityName: 'MJ: AI Prompt Models',
                ExtraFilter: `PromptID='${this.record.ID}'`,
                OrderBy: 'Priority ASC, __mj_CreatedAt ASC',
                ResultType: 'entity_object'
            });
            
            this.promptModels = results.Results;

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
     * Adds a new model to the prompt
     */
    public async addNewModel() {
        if (!this.record?.ID) return;
        
        try {
            const newModel = await this._metadata.GetEntityObject<AIPromptModelEntity>('MJ: AI Prompt Models');
            newModel.PromptID = this.record.ID;
            
            // Set priority to highest existing priority + 1
            const maxPriority = this.promptModels.length > 0 
                ? Math.max(...this.promptModels.map(pm => pm.Priority || 0))
                : 0;
            newModel.Priority = maxPriority + 1;
            
            // ModelID will be set by user
            
            this.promptModels.push(newModel);
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
     * Removes a model from the prompt
     */
    public async removePromptModel(index: number) {
        if (index < 0 || index >= this.promptModels.length) return;
        
        const model = this.promptModels[index];
        
        try {
            // If it's a saved model, delete it from the database
            if (model.IsSaved) {
                const deleteResult = await model.Delete();
                if (!deleteResult) {
                    throw new Error('Failed to delete model from database');
                }
            }

            // Remove from local array
            this.promptModels.splice(index, 1);

            MJNotificationService.Instance.CreateSimpleNotification(
                'Model removed successfully',
                'success',
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
     * Override SaveRecord to auto-save template contents and prompt models
     */
    async SaveRecord(StopEditModeAfterSave: boolean = true): Promise<boolean> {
        try {
            // If this is a new prompt with a new template, we need to save the template first
            if (!this.record.IsSaved && this.template && !this.template.IsSaved) {
                const templateSaved = await this.template.Save();
                if (!templateSaved) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to save template',
                        'error',
                        5000
                    );
                    return false;
                }
                // Set the template ID on the AI prompt before saving
                this.record.TemplateID = this.template.ID;
            }

            // Save the AI prompt itself
            const promptSaved = await super.SaveRecord(StopEditModeAfterSave);
            
            if (promptSaved) {
                // Save template contents if we have a template
                if (this.template && this.templateEditor) {
                    const templateContentsSaved = await this.templateEditor.saveTemplateContents();
                    if (!templateContentsSaved) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            'AI prompt saved, but template contents failed to save',
                            'warning',
                            5000
                        );
                    }
                }
                
                // Then save all prompt models
                return await this.savePromptModels();
            }
            
            return false;
        } catch (error) {
            console.error('Error in SaveRecord:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving AI prompt',
                'error',
                5000
            );
            return false;
        }
    }

    /**
     * Saves all prompt models (creates, updates, deletes)
     */
    private async savePromptModels(): Promise<boolean> {
        try {
            let allSuccessful = true;

            // Save each prompt model
            for (const model of this.promptModels) {
                if (model.ModelID) { // Only save if a model is selected
                    // Set the PromptID if it's not already set
                    if (!model.PromptID) {
                        model.PromptID = this.record.ID;
                    }

                    const saved = await model.Save();
                    if (!saved) {
                        console.error('Failed to save prompt model:', model);
                        allSuccessful = false;
                    }
                }
            }

            if (allSuccessful) {
                // Reload the prompt models to get the updated state
                await this.loadPromptModels();
                
                MJNotificationService.Instance.CreateSimpleNotification(
                    'AI prompt and models saved successfully',
                    'success',
                    4000
                );
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'AI prompt saved, but some models failed to save',
                    'warning',
                    5000
                );
            }

            return allSuccessful;
        } catch (error) {
            console.error('Error saving prompt models:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving prompt models',
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
            const [categoriesResult, promptsResult] = await Promise.all([
                new RunView().RunView<AIPromptCategoryEntity>({
                    EntityName: 'AI Prompt Categories',
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                }),
                new RunView().RunView<AIPromptEntity>({
                    EntityName: 'AI Prompts',
                    ExtraFilter: 'Status=\'Active\'',
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                })
            ]);

            const categories = categoriesResult.Results || [];
            const prompts = promptsResult.Results || [];

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
    private buildResultSelectorTree(categories: AIPromptCategoryEntity[], prompts: AIPromptEntity[]): any[] {
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
     * Moves a model up in the list
     */
    public moveModelUp(index: number) {
        if (index > 0 && index < this.promptModels.length) {
            const model = this.promptModels[index];
            this.promptModels.splice(index, 1);
            this.promptModels.splice(index - 1, 0, model);
            this.updateModelPriorities();
        }
    }

    /**
     * Moves a model down in the list
     */
    public moveModelDown(index: number) {
        if (index >= 0 && index < this.promptModels.length - 1) {
            const model = this.promptModels[index];
            this.promptModels.splice(index, 1);
            this.promptModels.splice(index + 1, 0, model);
            this.updateModelPriorities();
        }
    }

    /**
     * Updates priority values based on array order
     */
    private updateModelPriorities() {
        this.promptModels.forEach((model, index) => {
            model.Priority = index + 1;
        });
    }
}

export function LoadAIPromptFormComponentExtended() {
    // This function ensures the class isn't tree-shaken and registers it with MemberJunction
}