import { Component, ViewContainerRef, ElementRef, ChangeDetectorRef, ViewChild, AfterViewInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ActionEntity, AIAgentActionEntity, AIAgentEntity, AIAgentLearningCycleEntity, AIAgentNoteEntity, AIAgentPromptEntity, AIAgentRunEntity, AIPromptEntity, AIPromptEntityExtended, AIAgentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { BaseFormComponent, BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIAgentFormComponent } from '../../generated/Entities/AIAgent/aiagent.form.component';
import { DialogService } from '@progress/kendo-angular-dialog';
import { SharedService } from '@memberjunction/ng-shared';
import { AIAgentManagementService } from './ai-agent-management.service';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { firstValueFrom } from 'rxjs';


/**
 * Enhanced AI Agent form component that extends the auto-generated base form
 * with comprehensive agent management capabilities including test harness integration,
 * related entity management, and execution history tracking.
 * 
 * ## Key Features:
 * - **Integrated Test Harness**: Built-in access to agent testing capabilities
 * - **Related Entity Management**: Display and manage sub-agents, prompts, and actions
 * - **Execution History**: View recent agent runs with status and timing information
 * - **Rich UI Components**: Enhanced cards, badges, and status indicators
 * - **Navigation Support**: Links to related entities and management functions
 * 
 * ## Form Sections:
 * - **Agent Details**: Basic agent configuration and settings
 * - **Sub-Agents**: Hierarchical agent relationships
 * - **Prompts**: Associated prompts with priority ordering
 * - **Actions**: Available actions and configurations
 * - **Execution History**: Recent runs with detailed status information
 * 
 * ## Usage:
 * This component is automatically loaded when editing AI Agent entities through
 * the MemberJunction form system. It extends the base generated form with
 * additional functionality while maintaining full compatibility.
 * 
 * @example
 * ```html
 * <!-- Automatically used by form system -->
 * <mj-ai-agent-form [recordId]="agentId"></mj-ai-agent-form>
 * ```
 */
@RegisterClass(BaseFormComponent, 'AI Agents')
@Component({
    selector: 'mj-ai-agent-form',
    templateUrl: './ai-agent-form.component.html',
    styleUrls: ['./ai-agent-form.component.css']
})
export class AIAgentFormComponentExtended extends AIAgentFormComponent implements AfterViewInit {
    /** The AI Agent entity being edited */
    public record!: AIAgentEntity;
    
    /** ViewChild for dynamic custom section container */
    private _customSectionContainer!: ViewContainerRef;
    @ViewChild('customSectionContainer', { read: ViewContainerRef }) 
    set customSectionContainer(container: ViewContainerRef) {
        this._customSectionContainer = container;
        // When the container becomes available, load the custom section if needed
        if (container && this.agentType?.UIFormSectionKey && !this.customSectionLoaded) {
            setTimeout(() => this.loadCustomFormSection(), 0);
        }
    }
    get customSectionContainer(): ViewContainerRef {
        return this._customSectionContainer;
    }
    
    /** The agent type entity for this agent */
    public agentType: AIAgentTypeEntity | null = null;
    
    /** Reference to the dynamically loaded custom section component */
    private customSectionComponent: BaseFormSectionComponent | null = null;
    
    /** Track if custom section has been loaded to avoid reloading */
    private customSectionLoaded = false;
    
    /** Track the component reference to check if it still exists */
    private customSectionComponentRef: any = null;
    
    /** Update custom section when EditMode changes */
    ngDoCheck() {
        if (this.customSectionComponent && this.customSectionComponent.EditMode !== this.EditMode) {
            this.customSectionComponent.EditMode = this.EditMode;
        }
    }
    
    
    
    // === Related Entity Counts ===
    /** Number of sub-agents under this agent */
    public subAgentCount = 0;
    
    /** Number of prompts associated with this agent */
    public promptCount = 0;
    
    /** Number of actions configured for this agent */
    public actionCount = 0;
    
    
    /** Number of learning cycles for this agent */
    public learningCycleCount = 0;
    
    /** Number of notes associated with this agent */
    public noteCount = 0;
    
    /** Number of execution history records */
    public executionHistoryCount = 0;
    
    // === Related Entity Data for Display ===
    /** Array of sub-agent entities for card display */
    public subAgents: AIAgentEntity[] = [];
    
    /** Array of agent prompt entities for card display */
    public agentPrompts: AIPromptEntityExtended[] = [];
    
    /** Array of agent action entities for card display */
    public agentActions: ActionEntity[] = [];
    
    
    /** Array of learning cycle entities for display */
    public learningCycles: AIAgentLearningCycleEntity[] = [];
    
    /** Array of agent note entities for display */
    public agentNotes: AIAgentNoteEntity[] = [];
    
    /** Array of recent execution records for history display */
    public recentExecutions: AIAgentRunEntity[] = [];
    
    /** Track which execution cards are expanded */
    public expandedExecutions: { [key: string]: boolean } = {};

    // === Dropdown Data ===
    /** Model selection mode options for the dropdown */
    public modelSelectionModes = [
        { text: 'Agent Type', value: 'Agent Type' },
        { text: 'Agent', value: 'Agent' }
    ];

    // === Permission Checks for Related Entities ===
    /** Cache for permission checks to avoid repeated calculations */
    private _permissionCache = new Map<string, boolean>();

    // Main AI Agent permissions inherited from BaseFormComponent:
    // - UserCanEdit (Update permission)
    // - UserCanRead (Read permission) 
    // - UserCanCreate (Create permission)
    // - UserCanDelete (Delete permission)

    /** Check if user can create AI Agent Actions */
    public get UserCanCreateActions(): boolean {
        return this.checkEntityPermission('AI Agent Actions', 'Create');
    }

    /** Check if user can update AI Agent Actions */
    public get UserCanUpdateActions(): boolean {
        return this.checkEntityPermission('AI Agent Actions', 'Update');
    }

    /** Check if user can delete AI Agent Actions */
    public get UserCanDeleteActions(): boolean {
        return this.checkEntityPermission('AI Agent Actions', 'Delete');
    }

    /** Check if user can create AI Agent Prompts */
    public get UserCanCreatePrompts(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Prompts', 'Create');
    }

    /** Check if user can update AI Agent Prompts */
    public get UserCanUpdatePrompts(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Prompts', 'Update');
    }

    /** Check if user can delete AI Agent Prompts */
    public get UserCanDeletePrompts(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Prompts', 'Delete');
    }

    /** Check if user can create AI Agents (for sub-agents) */
    public get UserCanCreateSubAgents(): boolean {
        return this.checkEntityPermission('AI Agents', 'Create');
    }

    /** Check if user can update AI Agents (for sub-agents) */
    public get UserCanUpdateSubAgents(): boolean {
        return this.checkEntityPermission('AI Agents', 'Update');
    }

    /** Check if user can delete AI Agents (for sub-agents) */
    public get UserCanDeleteSubAgents(): boolean {
        return this.checkEntityPermission('AI Agents', 'Delete');
    }

    /** Check if user can create AI Agent Notes */
    public get UserCanCreateNotes(): boolean {
        return this.checkEntityPermission('AI Agent Notes', 'Create');
    }

    /** Check if user can update AI Agent Notes */
    public get UserCanUpdateNotes(): boolean {
        return this.checkEntityPermission('AI Agent Notes', 'Update');
    }

    /** Check if user can delete AI Agent Notes */
    public get UserCanDeleteNotes(): boolean {
        return this.checkEntityPermission('AI Agent Notes', 'Delete');
    }

    /** Check if user can view AI Agent Learning Cycles */
    public get UserCanViewLearningCycles(): boolean {
        return this.checkEntityPermission('AI Agent Learning Cycles', 'Read');
    }

    /** Check if user can view AI Agent Runs (execution history) */
    public get UserCanViewExecutionHistory(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Runs', 'Read');
    }

    /** Check if user can create AI Prompts (needed for creating new prompts) */
    public get UserCanCreateAIPrompts(): boolean {
        return this.checkEntityPermission('AI Prompts', 'Create');
    }

    /** Check if user can create both AI Prompts and AI Agent Prompts (for createNewPrompt functionality) */
    public get UserCanCreateNewPrompts(): boolean {
        return this.UserCanCreateAIPrompts && this.UserCanCreatePrompts;
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
            const md = new Metadata();
            const entityInfo = md.Entities.find(e => e.Name === entityName);
            
            if (!entityInfo) {
                console.warn(`Entity '${entityName}' not found for permission check`);
                this._permissionCache.set(cacheKey, false);
                return false;
            }

            const userPermissions = entityInfo.GetUserPermisions(md.CurrentUser);
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

    // === Transaction-based editing support ===
    /** Now using BaseFormComponent's PendingRecords system exclusively */
    
    /** Flag to indicate if there are unsaved changes */
    public hasUnsavedChanges = false;

    // === Original State for Cancel/Revert ===
    /** Snapshots of original data for reverting UI changes */
    private originalSnapshots: {
        agentPrompts: AIPromptEntityExtended[];
        agentActions: ActionEntity[];
        subAgents: AIAgentEntity[];
        promptCount: number;
        actionCount: number;
        subAgentCount: number;
        learningCycleCount: number;
        noteCount: number;
        executionHistoryCount: number;
    } | null = null;

    constructor(
        elementRef: ElementRef,
        protected override sharedService: SharedService,
        router: Router,
        route: ActivatedRoute,
        cdr: ChangeDetectorRef,
        private dialogService: DialogService,
        private viewContainerRef: ViewContainerRef,
        private agentManagementService: AIAgentManagementService,
        private testHarnessService: AITestHarnessDialogService
    ) {
        super(elementRef, sharedService, router, route, cdr);
    }
    
    /**
     * After view initialization, load any custom form section if defined
     */
    async ngAfterViewInit() {
        // Use Promise to defer loading to avoid change detection issues
        if (this.record?.ID) {
            await this.loadRelatedCounts();
            await this.loadAgentType();
            
            // Force change detection to render the panel bar item
            this.cdr.detectChanges();
            
            // Defer custom section loading to next tick after DOM updates
            setTimeout(() => {
                this.loadCustomFormSection();
            }, 0);
        }
    }




    /**
     * Loads counts and preview data for all related entities including sub-agents,
     * prompts, actions, learning cycles, notes, and execution history. 
     * This data populates the various expander panels in the enhanced form interface.
     * @private
     */
    private async loadRelatedCounts(): Promise<void> {
        if (!this.record?.ID) return;
        
        try {
            const rv = new RunView();
            
            // Execute all queries in a single batch for better performance
            const results = await rv.RunViews([
                // Sub-agents
                {
                    EntityName: 'AI Agents',
                    ExtraFilter: `ParentID='${this.record.ID}'`,
                    OrderBy: 'Name ASC'
                },
                // Prompts
                {
                    EntityName: 'AI Prompts',
                    ExtraFilter: `ID IN (SELECT PromptID FROM __mj.vwAIAgentPrompts WHERE AgentID='${this.record.ID}')`
                },
                // Actions
                {
                    EntityName: 'Actions',
                    ExtraFilter: `ID IN (SELECT ActionID FROM __mj.vwAIAgentActions WHERE AgentID='${this.record.ID}')`,
                    OrderBy: 'Name ASC'
                },
                // Learning cycles
                {
                    EntityName: 'AI Agent Learning Cycles',
                    ExtraFilter: `AgentID='${this.record.ID}'`,
                    OrderBy: 'StartedAt DESC'
                },
                // Notes
                {
                    EntityName: 'AI Agent Notes',
                    ExtraFilter: `AgentID='${this.record.ID}'`
                },
                // Execution history
                {
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: `AgentID='${this.record.ID}'`,
                    OrderBy: '__mj_CreatedAt DESC'
                }
            ]);
            
            // Process results in the same order as queries
            if (results.length >= 6) {
                // Sub-agents (index 0)
                this.subAgents = results[0].Results as AIAgentEntity[] || [];
                this.subAgentCount = results[0].TotalRowCount || 0;
                
                // Prompts (index 1)
                this.agentPrompts = results[1].Results as AIPromptEntityExtended[] || [];
                this.promptCount = results[1].TotalRowCount || 0;
                
                // Actions (index 2)
                this.agentActions = results[2].Results as ActionEntity[] || [];
                this.actionCount = results[2].TotalRowCount || 0;
                
                // Learning cycles (index 3)
                this.learningCycles = results[3].Results as AIAgentLearningCycleEntity[] || [];
                this.learningCycleCount = results[3].TotalRowCount || 0;
                
                // Notes (index 4)
                this.agentNotes = results[4].Results as AIAgentNoteEntity[] || [];
                this.noteCount = results[4].TotalRowCount || 0;
                
                // Execution history (index 5)
                this.recentExecutions = results[5].Results as AIAgentRunEntity[] || [];
                this.executionHistoryCount = results[5].TotalRowCount || 0;
            }

            // Create snapshot for cancel/revert functionality
            this.createOriginalSnapshot();
        } catch (error) {
            console.error('Error loading related data:', error);
            // Set all counts to 0 on error to ensure UI shows proper empty states
            this.subAgentCount = 0;
            this.promptCount = 0;
            this.actionCount = 0;
            this.learningCycleCount = 0;
            this.noteCount = 0;
            this.executionHistoryCount = 0;
        }
    }

    /**
     * Creates a snapshot of the current UI state for cancel/revert functionality
     * @private
     */
    private createOriginalSnapshot() {
        this.originalSnapshots = {
            agentPrompts: [...this.agentPrompts], // Deep copy of arrays
            agentActions: [...this.agentActions],
            subAgents: [...this.subAgents],
            promptCount: this.promptCount,
            actionCount: this.actionCount,
            subAgentCount: this.subAgentCount,
            learningCycleCount: this.learningCycleCount,
            noteCount: this.noteCount,
            executionHistoryCount: this.executionHistoryCount
        };
    }
    
    /**
     * Loads the agent type entity for this agent
     * @private
     */
    private async loadAgentType(): Promise<void> {
        if (!this.record?.TypeID) {
            return;
        }
        
        try {
            const md = new Metadata();
            this.agentType = await md.GetEntityObject<AIAgentTypeEntity>('MJ: AI Agent Types');
            if (this.agentType) {
                await this.agentType.Load(this.record.TypeID);
            }
        } catch (error) {
            console.error('Error loading agent type:', error);
            this.agentType = null;
        }
    }
    
    /**
     * Dynamically loads a custom form section if the agent type defines one
     * @private
     */
    private loadCustomFormSection(): void {
        if (!this.agentType?.UIFormSectionKey || !this.customSectionContainer) {
            return;
        }
        
        // Check if component still exists in container
        if (this.customSectionLoaded && this.customSectionContainer.length > 0) {
            return;
        }
        
        try {
            // Build the full registration key (Entity.Section pattern)
            const sectionKey = `AI Agents.${this.agentType.UIFormSectionKey}`;
            
            // Get the component registration from the class factory
            const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormSectionComponent, sectionKey);
            
            if (registration && registration.SubClass) {
                // Clear any existing custom section
                this.customSectionContainer.clear();
                
                // Create the component
                const componentRef = this.customSectionContainer.createComponent(registration.SubClass);
                this.customSectionComponent = componentRef.instance as BaseFormSectionComponent;
                this.customSectionComponentRef = componentRef;
                
                // Pass the record and edit mode to the custom section
                this.customSectionComponent.record = this.record;
                this.customSectionComponent.EditMode = this.EditMode;
                
                // Mark as loaded
                this.customSectionLoaded = true;
                
                // Trigger change detection
                this.cdr.detectChanges();
            }
        } catch (error) {
            console.error('Error loading custom form section:', error);
        }
    }

    /**
     * Handles state change events for the custom section panel
     * @param event The panel bar state change event
     */
    public onCustomSectionStateChange(event: any): void {
        console.log('Panel state change:', event.expanded, 'Container:', this.customSectionContainer, 'Loaded:', this.customSectionLoaded);
        
        // When panel is expanded, check if we need to load or reload the custom section
        if (event.expanded && this.agentType?.UIFormSectionKey) {
            // Always try to load on expand to handle cases where container might have been recreated
            setTimeout(() => {
                this.loadCustomFormSection();
            }, 0);
        }
    }

    /**
     * Restores the UI to its original state using saved snapshots
     * @private
     */
    private restoreFromSnapshots() {
        if (this.originalSnapshots) {
            console.log('Restoring UI from snapshots...');
            
            // Restore arrays (create new copies to ensure reactivity)
            this.agentPrompts = [...this.originalSnapshots.agentPrompts];
            this.agentActions = [...this.originalSnapshots.agentActions];
            this.subAgents = [...this.originalSnapshots.subAgents];
            
            // Restore counts
            this.promptCount = this.originalSnapshots.promptCount;
            this.actionCount = this.originalSnapshots.actionCount;
            this.subAgentCount = this.originalSnapshots.subAgentCount;
            this.learningCycleCount = this.originalSnapshots.learningCycleCount;
            this.noteCount = this.originalSnapshots.noteCount;
            this.executionHistoryCount = this.originalSnapshots.executionHistoryCount;
            
            // Reset other UI state
            this.hasUnsavedChanges = false;
            
            console.log('UI restored - Prompts:', this.promptCount, 'Actions:', this.actionCount, 'SubAgents:', this.subAgentCount);
            
            // Force change detection to update the UI
            this.cdr.detectChanges();
        } else {
            console.warn('No snapshots available to restore from');
        }
    }

    /**
     * Override CancelEdit to restore UI state when user cancels changes
     */
    public override CancelEdit(): void {
        console.log('=== AI Agent CancelEdit called ===');
        console.log('Pending records before clear:', this.PendingRecords.length);
        
        // Set flag to indicate we're performing a cancel operation
        this.isPerformingCancel = true;
        
        try {
            // CRITICAL: Clear our pending records BEFORE calling parent
            // This ensures that any prompt/action/sub-agent changes we added don't persist
            this.PendingRecords.length = 0;
            console.log('Pending records after clear:', this.PendingRecords.length);
            
            // Call the parent CancelEdit first (this handles main record revert and pending records)
            super.CancelEdit();
            
            // Restore our UI state after parent cancel
            this.restoreFromSnapshots();
            
            // Reset the unsaved changes flag
            this.hasUnsavedChanges = false;
            
            console.log('Cancel completed successfully');
        } finally {
            // Always reset the flag
            this.isPerformingCancel = false;
        }
    }


    /**
     * Opens the integrated test harness for the current agent.
     * Validates that the agent has been saved before allowing testing.
     * Shows a notification if the agent needs to be saved first.
     */
    public openTestHarness() {
        if (!this.record?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI agent before testing',
                'warning',
                4000
            );
            return;
        }

        // Use the new test harness dialog service
        // Don't pass viewContainerRef so window is top-level
        this.testHarnessService.openForAgent(this.record.ID);
    }

    /**
     * Returns the appropriate color for the agent status badge.
     * Uses standard color coding: green for active, yellow for pending, gray for disabled.
     * @returns CSS color value for the status badge
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
     * Event handler for test harness visibility changes.
     * Updates the component state when the test harness is opened or closed.
     * @param isVisible - Whether the test harness is currently visible
     */

    /**
     * Gets the count of sub-agents
     */
    public getSubAgentCount(): number {
        return this.subAgentCount;
    }

    /**
     * Gets the count of prompts
     */
    public getPromptCount(): number {
        return this.promptCount;
    }

    /**
     * Gets the count of actions
     */
    public getActionCount(): number {
        return this.actionCount;
    }

    /**
     * Gets the icon for the execution mode
     */
    public getExecutionModeIcon(mode: string): string {
        switch (mode) {
            case 'Sequential':
                return 'fa-solid fa-list-ol';
            case 'Parallel':
                return 'fa-solid fa-layer-group';
            default:
                return 'fa-solid fa-robot';
        }
    }

    /**
     * Gets the agent's display icon
     * Prioritizes LogoURL, falls back to IconClass, then default robot icon
     */
    public getAgentIcon(): string {
        if (this.record?.LogoURL) {
            // LogoURL is used in img tag, not here
            return '';
        }
        return this.record?.IconClass || 'fa-solid fa-robot';
    }

    /**
     * Checks if the agent has a logo URL (for image display)
     */
    public hasLogoURL(): boolean {
        return !!this.record?.LogoURL;
    }

    /**
     * Gets the icon for a sub-agent
     * Prioritizes LogoURL, falls back to IconClass, then default robot icon
     */
    public getSubAgentIcon(subAgent: AIAgentEntity): string {
        if (subAgent?.LogoURL) {
            // LogoURL is used in img tag, not here
            return '';
        }
        return subAgent?.IconClass || 'fa-solid fa-robot';
    }
    
    /**
     * Gets the icon class for an action
     * Falls back to default bolt icon if no IconClass is set
     */
    public getActionIcon(action: ActionEntity): string {
        return action?.IconClass || 'fa-solid fa-bolt';
    }

    /**
     * Checks if a sub-agent has a logo URL
     */
    public hasSubAgentLogoURL(subAgent: AIAgentEntity): boolean {
        return !!subAgent?.LogoURL;
    }

    /**
     * Creates a new sub-agent using the create sub-agent dialog
     */
    public async createSubAgent() {
        try {
            this.agentManagementService.openCreateSubAgentDialog({
                title: `Create Sub-Agent for ${this.record.Name || 'Agent'}`,
                initialName: '',
                parentAgentId: this.record.ID,
                parentAgentName: this.record.Name || 'Agent',
                viewContainerRef: this.viewContainerRef
            }).subscribe({
                next: async (result) => {
                    if (result && result.subAgent) {
                        try {
                            // Handle deferred sub-agent creation if parent is not saved
                            if (!this.record.IsSaved) {
                                // Store a temporary reference to the parent - will be resolved during save
                                result.subAgent.Set('_tempParentId', this.record.ID);
                            }

                            // Add the sub-agent to pending records
                            this.PendingRecords.push({
                                entityObject: result.subAgent,
                                action: 'save'
                            });

                            // Add any newly created prompts to pending records
                            if (result.newPrompts) {
                                for (const prompt of result.newPrompts) {
                                    this.PendingRecords.push({
                                        entityObject: prompt,
                                        action: 'save'
                                    });
                                }
                            }

                            // Add any newly created prompt templates to pending records
                            if (result.newPromptTemplates) {
                                for (const template of result.newPromptTemplates) {
                                    this.PendingRecords.push({
                                        entityObject: template,
                                        action: 'save'
                                    });
                                }
                            }

                            // Add any newly created template contents to pending records
                            if (result.newTemplateContents) {
                                for (const content of result.newTemplateContents) {
                                    this.PendingRecords.push({
                                        entityObject: content,
                                        action: 'save'
                                    });
                                }
                            }

                            // Add agent prompt links to pending records
                            if (result.agentPrompts) {
                                for (const agentPrompt of result.agentPrompts) {
                                    this.PendingRecords.push({
                                        entityObject: agentPrompt,
                                        action: 'save'
                                    });
                                }
                            }

                            // Add agent action links to pending records
                            if (result.agentActions) {
                                for (const agentAction of result.agentActions) {
                                    this.PendingRecords.push({
                                        entityObject: agentAction,
                                        action: 'save'
                                    });
                                }
                            }

                            // Update UI to show the new sub-agent
                            this.subAgents.push(result.subAgent);
                            this.subAgentCount = this.subAgents.length;
                            this.hasUnsavedChanges = true;

                            // Trigger change detection
                            this.cdr.detectChanges();

                            MJNotificationService.Instance.CreateSimpleNotification(
                                `Sub-agent "${result.subAgent.Name}" created and will be saved when you save the parent agent`,
                                'success',
                                4000
                            );
                        } catch (error) {
                            console.error('Error processing created sub-agent:', error);
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'Error processing created sub-agent. Please try again.',
                                'error',
                                3000
                            );
                        }
                    }
                },
                error: (error) => {
                    console.error('Error in create sub-agent dialog:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening sub-agent creation dialog. Please try again.',
                        'error',
                        3000
                    );
                }
            });
        } catch (error) {
            console.error('Error in createSubAgent:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error creating sub-agent. Please try again.',
                'error',
                3000
            );
        }
    }

    /**
     * Adds a new prompt to the agent (deferred until save)
     */
    public async addPrompt() {
        // Get currently linked and pending prompt IDs for pre-selection
        const currentPromptIds = this.agentPrompts.map(ap => ap.ID);
        const pendingAddIds = this.PendingRecords
            .filter(p => p.entityObject.EntityInfo.Name === 'MJ: AI Agent Prompts' && p.action === 'save')
            .map(p => p.entityObject.Get('PromptID'));
        const allLinkedIds = [...currentPromptIds, ...pendingAddIds];
        
        try {
            this.agentManagementService.openPromptSelectorDialog({
                title: 'Add Prompts to Agent',
                multiSelect: true,
                selectedPromptIds: [],
                showCreateNew: true,
                linkedPromptIds: allLinkedIds,
                viewContainerRef: this.viewContainerRef
            }).subscribe({
                next: async (result) => {
                    if (result && result.selectedPrompts.length > 0) {
                        // Filter out already linked or pending prompts
                        const newPrompts = result.selectedPrompts.filter(prompt => 
                            !allLinkedIds.includes(prompt.ID)
                        );
                        
                        if (newPrompts.length === 0) {
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'All selected prompts are already linked to this agent',
                                'info',
                                3000
                            );
                            return;
                        }
                        
                        // Add to pending changes (defer until save)
                        const md = new Metadata();
                        for (const prompt of newPrompts) {
                            const agentPrompt = await md.GetEntityObject<AIAgentPromptEntity>('MJ: AI Agent Prompts');
                            agentPrompt.NewRecord();
                            agentPrompt.AgentID = this.record.ID;
                            agentPrompt.PromptID = prompt.ID;
                            agentPrompt.Status = 'Active';
                            agentPrompt.ExecutionOrder = 1;
                            
                            this.PendingRecords.push({
                                entityObject: agentPrompt,
                                action: 'save'
                            });
                        }
                        
                        this.hasUnsavedChanges = true;
                        
                        // Update UI to show the new prompts (cast to extended type for display)
                        this.agentPrompts.push(...(newPrompts as AIPromptEntityExtended[]));
                        this.promptCount = this.agentPrompts.length;
                        
                        // Trigger change detection to update UI
                        this.cdr.detectChanges();
                        
                        // Show success notification
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `${newPrompts.length} prompt${newPrompts.length === 1 ? '' : 's'} will be added when you save the agent`,
                            'info',
                            4000
                        );
                    } else if (result && result.createNew) {
                        // User wants to create a new prompt
                        await this.createNewPrompt();
                    }
                },
                error: (error) => {
                    console.error('Error opening prompt selector:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening prompt selector. Please try again.',
                        'error',
                        3000
                    );
                }
            });
        } catch (error) {
            console.error('Error in addPrompt:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error adding prompts. Please try again.',
                'error',
                3000
            );
        }
    }

    /**
     * Handle context compression toggle and reset related fields when disabled
     */
    public onContextCompressionToggle(value: any) {
        const enabled = value === true || value === 'true';
        if (!enabled) {
            // Reset context compression related fields to null when disabled
            this.record.ContextCompressionMessageThreshold = null;
            this.record.ContextCompressionPromptID = null;
            this.record.ContextCompressionMessageRetentionCount = null;
            
            // Trigger change detection to update the UI
            this.cdr.detectChanges();
        }
    }

    /**
     * Opens the modern Add Action dialog for selecting actions (deferred until save)
     */
    public async configureActions() {
        // Get currently linked and pending action IDs for pre-selection
        const currentActionIds = this.agentActions.map(aa => aa.ID);
        const pendingAddIds = this.PendingRecords
            .filter(p => p.entityObject.EntityInfo.Name === 'AI Agent Actions' && p.action === 'save')
            .map(p => p.entityObject.Get('ActionID'));
        const allLinkedIds = [...currentActionIds, ...pendingAddIds];
        
        this.agentManagementService.openAddActionDialog({
            agentId: this.record.ID,
            agentName: this.record.Name || 'Agent',
            existingActionIds: allLinkedIds,
            viewContainerRef: this.viewContainerRef
        }).subscribe({
            next: async (selectedActions) => {
                if (selectedActions && selectedActions.length > 0) {
                    // Filter out already linked or pending actions
                    const newActions = selectedActions.filter(action => 
                        !allLinkedIds.includes(action.ID)
                    );
                    
                    if (newActions.length === 0) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            'All selected actions are already linked to this agent',
                            'info',
                            3000
                        );
                        return;
                    }
                    
                    // Add to pending changes (defer until save)
                    const md = new Metadata();
                    for (const action of newActions) {
                        const agentAction = await md.GetEntityObject<AIAgentActionEntity>('AI Agent Actions');
                        agentAction.NewRecord();
                        agentAction.AgentID = this.record.ID;
                        agentAction.ActionID = action.ID;
                        agentAction.Status = 'Active';
                        
                        this.PendingRecords.push({
                            entityObject: agentAction,
                            action: 'save'
                        });
                    }
                    
                    this.hasUnsavedChanges = true;
                    
                    // Update UI to show the new actions
                    this.agentActions.push(...newActions);
                    this.actionCount = this.agentActions.length;
                    
                    // Trigger change detection to update UI
                    this.cdr.detectChanges();
                    
                    // Show success notification
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `${newActions.length} action${newActions.length === 1 ? '' : 's'} will be added when you save the agent`,
                        'info',
                        4000
                    );
                }
            },
            error: (error) => {
                console.error('Error in add action dialog:', error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Error opening action selection dialog. Please try again.',
                    'error',
                    3000
                );
            }
        });
    }

    /**
     * Gets the status icon for execution runs
     */
    public getExecutionStatusIcon(status: string): string {
        switch (status?.toLowerCase()) {
            case 'completed':
            case 'success':
                return 'fa-solid fa-check-circle';
            case 'failed':
            case 'error':
                return 'fa-solid fa-exclamation-triangle';
            case 'running':
            case 'in_progress':
                return 'fa-solid fa-spinner fa-spin';
            case 'pending':
                return 'fa-solid fa-clock';
            default:
                return 'fa-solid fa-question-circle';
        }
    }

    /**
     * Gets the status color for execution runs
     */
    public getExecutionStatusColor(status: string): string {
        switch (status?.toLowerCase()) {
            case 'completed':
            case 'success':
                return '#28a745';
            case 'failed':
            case 'error':
                return '#dc3545';
            case 'running':
            case 'in_progress':
                return '#17a2b8';
            case 'pending':
                return '#ffc107';
            default:
                return '#6c757d';
        }
    }

    public formatExecutionTimeFromDates(startDate: Date, endDate: Date): string {
        if (!startDate || !endDate) return 'N/A';

        // check to see if we have dates or timestamps
        let startTime;
        let endTime;
        if (typeof startDate === 'string') {
            startTime = new Date(startDate).getTime();
        }
        else if (typeof startDate === 'number') {   
            startTime = startDate;
        }
        else {
            startTime = startDate.getTime();
        }
        if (typeof endDate === 'string') {
            endTime = new Date(endDate).getTime();
        }
        else if (typeof endDate === 'number') {
            endTime = endDate;
        }
        else {
            endTime = endDate.getTime();
        }

        if (isNaN(startTime) || isNaN(endTime)) 
            return 'N/A';        
        const milliseconds = endTime - startTime;
        return this.formatExecutionTime(milliseconds);
    }

    /**
     * Formats execution time
     */
    public formatExecutionTime(milliseconds: number): string {
        if (!milliseconds) return 'N/A';
        
        if (milliseconds >= 60000) {
            const minutes = Math.floor(milliseconds / 60000);
            const seconds = ((milliseconds % 60000) / 1000).toFixed(1);
            return `${minutes}m ${seconds}s`;
        } else if (milliseconds >= 1000) {
            return `${(milliseconds / 1000).toFixed(1)}s`;
        } else {
            return `${milliseconds}ms`;
        }
    }

    /**
     * Gets the priority badge color
     */
    public getPriorityBadgeColor(priority: number): string {
        if (priority <= 1) return '#dc3545'; // High priority - red
        if (priority <= 5) return '#ffc107'; // Medium priority - yellow
        return '#28a745'; // Low priority - green
    }

    /**
     * Gets the priority label
     */
    public getPriorityLabel(priority: number): string {
        if (priority <= 1) return 'High';
        if (priority <= 5) return 'Medium';
        return 'Low';
    }

    /**
     * Navigates to a related entity
     */
    public navigateToEntity(entityName: string, recordId: string) {
        this.sharedService.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
    }
    
    /**
     * Toggles the expanded state of an execution card
     */
    public toggleExecutionExpanded(executionId: string) {
        this.expandedExecutions[executionId] = !this.expandedExecutions[executionId];
    }
    
    /**
     * Opens the full execution record in a new view
     */
    public openExecutionRecord(executionId: string) {
        this.sharedService.OpenEntityRecord('MJ: AI Agent Runs', CompositeKey.FromID(executionId));
    }
    
    /**
     * Gets a preview of the execution result for collapsed view
     */
    public getExecutionResultPreview(execution: AIAgentRunEntity, trimLongMessages: boolean): string {
        try {
            if (!execution.Result) return 'No result';
            
            // Try to parse the result as JSON
            const parsed = JSON.parse(execution.Result);
            
            // Extract the user message if it exists
            if (parsed.returnValue?.nextStep?.userMessage) {
                const message = parsed.returnValue.nextStep.userMessage;
                if (trimLongMessages)
                    return message.length > 120 ? message.substring(0, 120) + '...' : message;
                else
                    return message;
            }
            
            // Otherwise return the stringified result
            const stringified = JSON.stringify(parsed, null, 2);
            if (trimLongMessages)
                return stringified.length > 120 ? stringified.substring(0, 120) + '...' : stringified;
            else
                return stringified;
        } catch {
            // If not JSON, just return the string
            const result = execution.Result || '';
            if (trimLongMessages)
                return result.length > 120 ? result.substring(0, 120) + '...' : result;
            else
                return result;
        }
    }
    
    /**
     * Gets the full execution result message for expanded view
     */
    public getExecutionResultMessage(execution: AIAgentRunEntity): string {
        try {
            if (!execution.Result) return 'No result';
            
            // Try to parse the result as JSON
            const parsed = JSON.parse(execution.Result);
            
            // Extract the user message if it exists
            if (parsed.returnValue?.nextStep?.userMessage) {
                return parsed.returnValue.nextStep.userMessage;
            }
            
            // Otherwise return the pretty-printed JSON
            return JSON.stringify(parsed, null, 2);
        } catch {
            // If not JSON, just return the string
            return execution.Result || '';
        }
    }

    /**
     * Refreshes the related data and updates snapshots
     */
    public async refreshRelatedData() {
        if (this.record?.ID) {
            await this.loadRelatedCounts();
            MJNotificationService.Instance.CreateSimpleNotification(
                'Related data refreshed',
                'success',
                2000
            );
        }
    }

    /**
     * Manually refreshes the snapshot for cancel/revert functionality
     * Useful when you want to reset the "original state" to the current state
     */
    public refreshSnapshot() {
        this.createOriginalSnapshot();
        MJNotificationService.Instance.CreateSimpleNotification(
            'Current state saved as new baseline',
            'info',
            2000
        );
    }

    /**
     * Debug method to check current pending records state
     * Useful for troubleshooting cancel/revert issues
     */
    public debugPendingRecords() {
        console.log('=== Pending Records Debug ===');
        console.log('Pending Records Count:', this.PendingRecords.length);
        console.log('Has Unsaved Changes:', this.hasUnsavedChanges);
        console.log('Is Performing Cancel:', this.isPerformingCancel);
        console.log('Pending Records:', this.PendingRecords.map(p => ({
            entityName: p.entityObject.EntityInfo.Name,
            id: p.entityObject.Get('ID'),
            action: p.action,
            isDirty: p.entityObject.Dirty
        })));
        console.log('=============================');
    }


    /**
     * Adds a new note to the agent
     */
    public addNote() {
        MJNotificationService.Instance.CreateSimpleNotification(
            'Opening new note form...',
            'info',
            2000
        );
        
        // In a full implementation, this would open a new AI Agent Note form
        // with AgentID pre-populated to this.record.ID
    }

    /**
     * Creates a new prompt and links it to the agent
     */
    private async createNewPrompt() {
        try {
            this.agentManagementService.openCreatePromptDialog({
                title: `Create New Prompt for ${this.record.Name || 'Agent'}`,
                initialName: '',
                viewContainerRef: this.viewContainerRef
            }).subscribe({
                next: async (result) => {
                    if (result && result.prompt) {
                        try {
                            // Get current user using proper MJ pattern
                            const md = new Metadata();
                            const currentUserId = md.CurrentUser.ID;

                            // Add the prompt to PendingRecords (will be saved with agent)
                            this.PendingRecords.push({
                                entityObject: result.prompt,
                                action: 'save'
                            });

                            // Add template to PendingRecords if created
                            if (result.template) {
                                // Set UserID on template (required field)
                                result.template.UserID = currentUserId;
                                this.PendingRecords.push({
                                    entityObject: result.template,
                                    action: 'save'
                                });
                            }

                            // Add template contents to PendingRecords if created
                            if (result.templateContents && result.templateContents.length > 0) {
                                for (const content of result.templateContents) {
                                    // Template content does not have UserID field, no manual user assignment needed
                                    this.PendingRecords.push({
                                        entityObject: content,
                                        action: 'save'
                                    });
                                }
                            }

                            // Create the AI Agent Prompt link
                            const agentPrompt = await md.GetEntityObject<AIAgentPromptEntity>('MJ: AI Agent Prompts');
                            agentPrompt.NewRecord();
                            agentPrompt.AgentID = this.record.ID;
                            agentPrompt.PromptID = result.prompt.ID;
                            agentPrompt.Status = 'Active';
                            agentPrompt.ExecutionOrder = 1;
                            
                            // AI Agent Prompt does not have UserID field, no manual user assignment needed
                            
                            this.PendingRecords.push({
                                entityObject: agentPrompt,
                                action: 'save'
                            });

                            this.hasUnsavedChanges = true;

                            // Update UI to show the new prompt
                            this.agentPrompts.push(result.prompt as AIPromptEntityExtended);
                            this.promptCount = this.agentPrompts.length;

                            // Trigger change detection to update UI
                            this.cdr.detectChanges();

                            MJNotificationService.Instance.CreateSimpleNotification(
                                `New prompt "${result.prompt.Name}" will be created and linked when you save the agent`,
                                'success',
                                4000
                            );
                        } catch (error) {
                            console.error('Error processing created prompt:', error);
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'Error processing created prompt. Please try again.',
                                'error',
                                3000
                            );
                        }
                    }
                },
                error: (error) => {
                    console.error('Error in create prompt dialog:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening prompt creation dialog. Please try again.',
                        'error',
                        3000
                    );
                }
            });
        } catch (error) {
            console.error('Error in createNewPrompt:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error creating new prompt. Please try again.',
                'error',
                3000
            );
        }
    }

    /**
     * Removes a prompt from the agent (deferred until save)
     */
    public async removePrompt(prompt: AIPromptEntityExtended, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        const confirmDialog = this.dialogService.open({
            title: 'Remove Prompt',
            content: `Are you sure you want to remove the prompt "${prompt.Name}" from this agent?`,
            actions: [
                { text: 'Cancel' },
                { text: 'Remove', themeColor: 'error' }
            ],
            width: 450,
            height: 200
        });

        try {
            const result = await firstValueFrom(confirmDialog.result);
            if (result && (result as any).text === 'Remove') {
                try {
                    // Check if this is a pending add (not yet in database)
                    const pendingAddIndex = this.PendingRecords.findIndex(
                        p => p.entityObject.EntityInfo.Name === 'MJ: AI Agent Prompts' && 
                             p.action === 'save' && 
                             p.entityObject.Get('PromptID') === prompt.ID
                    );

                    if (pendingAddIndex >= 0) {
                        // Remove from pending adds
                        this.PendingRecords.splice(pendingAddIndex, 1);
                    } else {
                        // Find the existing AI Agent Prompt link record for deferred deletion
                        const rv = new RunView();
                        const linkResult = await rv.RunView<AIAgentPromptEntity>({
                            EntityName: 'MJ: AI Agent Prompts',
                            ExtraFilter: `AgentID='${this.record.ID}' AND PromptID='${prompt.ID}'`,
                            ResultType: 'entity_object'
                        });

                        if (linkResult.Success && linkResult.Results && linkResult.Results.length > 0) {
                            const agentPromptToDelete = linkResult.Results[0];
                            
                            // Add to pending deletions
                            this.PendingRecords.push({
                                entityObject: agentPromptToDelete,
                                action: 'delete'
                            });
                        } else {
                            throw new Error('AI Agent Prompt link not found');
                        }
                    }

                    // Remove from UI immediately
                    const promptIndex = this.agentPrompts.findIndex(p => p.ID === prompt.ID);
                    if (promptIndex >= 0) {
                        this.agentPrompts.splice(promptIndex, 1);
                        this.promptCount = this.agentPrompts.length;
                    }

                    this.hasUnsavedChanges = true;

                    // Trigger change detection to update UI
                    this.cdr.detectChanges();

                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Prompt "${prompt.Name}" will be removed when you save the agent`,
                        'info',
                        4000
                    );
                } catch (error) {
                    console.error('Error removing prompt from agent:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to remove prompt',
                        'error',
                        3000
                    );
                }
            }
        } catch (dialogError) {
            console.error('Error with dialog:', dialogError);
        }
    }

    /**
     * Updates payload field values from code editor
     */
    public updatePayloadField(fieldName: string, value: any) {
        if (this.record) {
            // Handle the value - it might be a string or an event
            const newValue = typeof value === 'string' ? value : value?.target?.value || value;
            (this.record as any)[fieldName] = newValue;
        }
    }

    /**    
     * Opens the sub-agent selector dialog for adding sub-agents (deferred until save)
     */
    public async addSubAgents() {
        try {
            // Get list of already pending sub-agent IDs to filter duplicates
            const pendingSubAgentIds = this.PendingRecords
                .filter(p => p.entityObject.EntityInfo.Name === 'AI Agents' && 
                            p.action === 'save' && 
                            p.entityObject.Get('ParentID') === this.record.ID)
                .map(p => p.entityObject.Get('ID'));
            const existingSubAgentIds = this.subAgents.map(agent => agent.ID);
            const allLinkedIds = [...pendingSubAgentIds, ...existingSubAgentIds];

            this.agentManagementService.openSubAgentSelectorDialog({
                title: 'Add Sub-Agents',
                multiSelect: true,
                parentAgentId: this.record.ID,
                showCreateNew: true,
                viewContainerRef: this.viewContainerRef
            }).subscribe({
                next: async (result) => {
                    if (result && result.selectedAgents && result.selectedAgents.length > 0) {
                        // Filter out already linked or pending agents
                        const newAgents = result.selectedAgents.filter(agent => 
                            !allLinkedIds.includes(agent.ID)
                        );
                        
                        if (newAgents.length === 0) {
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'All selected agents are already linked to this agent',
                                'info',
                                3000
                            );
                            return;
                        }
                        
                        // Add to pending changes (defer until save)
                        const md = new Metadata();
                        for (const agent of newAgents) {
                            const subAgentToUpdate = await md.GetEntityObject<AIAgentEntity>('AI Agents');
                            await subAgentToUpdate.Load(agent.ID);
                            subAgentToUpdate.ParentID = this.record.ID;
                            // Database constraint requires ExposeAsAction = false for sub-agents
                            subAgentToUpdate.ExposeAsAction = false;
                            
                            this.PendingRecords.push({
                                entityObject: subAgentToUpdate,
                                action: 'save'
                            });
                        }
                        
                        this.hasUnsavedChanges = true;
                        
                        // Update UI to show the new sub-agents
                        this.subAgents.push(...newAgents);
                        this.subAgentCount = this.subAgents.length;
                        
                        // Trigger change detection to update UI
                        this.cdr.detectChanges();
                        
                        // Show success notification
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `${newAgents.length} agent${newAgents.length === 1 ? '' : 's'} will be converted to sub-agent${newAgents.length === 1 ? '' : 's'} when you save`,
                            'info',
                            4000
                        );
                    } else if (result && result.createNew) {
                        // User wants to create a new sub-agent
                        await this.createSubAgent();
                    }
                },
                error: (error) => {
                    console.error('Error opening sub-agent selector:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening sub-agent selector. Please try again.',
                        'error',
                        3000
                    );
                }
            });
        } catch (error) {
            console.error('Error in addSubAgents:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error adding sub-agents. Please try again.',
                'error',
                3000
            );
        }
    }

    /**
     * Removes a sub-agent from this agent (deferred until save)
     */
    public async removeSubAgent(subAgent: AIAgentEntity, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        const confirmDialog = this.dialogService.open({
            title: 'Remove Sub-Agent',
            content: `Are you sure you want to remove "${subAgent.Name}" as a sub-agent? This will make it an independent root agent.`,
            actions: [
                { text: 'Cancel' },
                { text: 'Remove', themeColor: 'error' }
            ],
            width: 450,
            height: 200
        });

        try {
            const result = await firstValueFrom(confirmDialog.result);
            if (result && (result as any).text === 'Remove') {
                try {
                    // Check if this is a pending add (not yet in database)
                    const pendingAddIndex = this.PendingRecords.findIndex(
                        p => p.entityObject.EntityInfo.Name === 'AI Agents' && 
                             p.action === 'save' && 
                             p.entityObject.Get('ID') === subAgent.ID &&
                             p.entityObject.Get('ParentID') === this.record.ID
                    );

                    if (pendingAddIndex >= 0) {
                        // Remove from pending adds
                        this.PendingRecords.splice(pendingAddIndex, 1);
                    } else {
                        // Add to pending removals (will restore to root agent)
                        const md = new Metadata();
                        const subAgentToUpdate = await md.GetEntityObject<AIAgentEntity>('AI Agents');
                        await subAgentToUpdate.Load(subAgent.ID);
                        subAgentToUpdate.ParentID = null; // Will become a root agent
                        
                        this.PendingRecords.push({
                            entityObject: subAgentToUpdate,
                            action: 'save'
                        });
                    }

                    // Remove from UI immediately
                    const subAgentIndex = this.subAgents.findIndex(sa => sa.ID === subAgent.ID);
                    if (subAgentIndex >= 0) {
                        this.subAgents.splice(subAgentIndex, 1);
                        this.subAgentCount = this.subAgents.length;
                    }

                    this.hasUnsavedChanges = true;

                    // Trigger change detection to update UI
                    this.cdr.detectChanges();

                    MJNotificationService.Instance.CreateSimpleNotification(
                        `"${subAgent.Name}" will be removed as a sub-agent when you save`,
                        'info',
                        4000
                    );
                } catch (error) {
                    console.error('Error removing sub-agent:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to remove sub-agent',
                        'error',
                        3000
                    );
                }
            }
        } catch (dialogError) {
            console.error('Error with dialog:', dialogError);
        }
    }

    /**
     * Removes an action from the agent (deferred until save)
     */
    public async removeAction(action: ActionEntity, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        const confirmDialog = this.dialogService.open({
            title: 'Remove Action',
            content: `Are you sure you want to remove the action "${action.Name}" from this agent?`,
            actions: [
                { text: 'Cancel' },
                { text: 'Remove', themeColor: 'error' }
            ],
            width: 450,
            height: 200
        });

        try {
            const result = await firstValueFrom(confirmDialog.result);
            if (result && (result as any).text === 'Remove') {
                try {
                // Check if this is a pending add (not yet in database)
                const pendingAddIndex = this.PendingRecords.findIndex(
                    p => p.entityObject.EntityInfo.Name === 'AI Agent Actions' && 
                         p.action === 'save' && 
                         p.entityObject.Get('ActionID') === action.ID
                );

                if (pendingAddIndex >= 0) {
                    // Remove from pending adds
                    this.PendingRecords.splice(pendingAddIndex, 1);
                } else {
                    // Find the existing AI Agent Action link record for deferred deletion
                    const rv = new RunView();
                    const linkResult = await rv.RunView<AIAgentActionEntity>({
                        EntityName: 'AI Agent Actions',
                        ExtraFilter: `AgentID='${this.record.ID}' AND ActionID='${action.ID}'`,
                        ResultType: 'entity_object'
                    });

                    if (linkResult.Success && linkResult.Results && linkResult.Results.length > 0) {
                        const agentActionToDelete = linkResult.Results[0];
                        
                        // Add to pending deletions
                        this.PendingRecords.push({
                            entityObject: agentActionToDelete,
                            action: 'delete'
                        });
                    } else {
                        throw new Error('AI Agent Action link not found');
                    }
                }

                // Remove from UI immediately
                const actionIndex = this.agentActions.findIndex(a => a.ID === action.ID);
                if (actionIndex >= 0) {
                    this.agentActions.splice(actionIndex, 1);
                    this.actionCount = this.agentActions.length;
                }

                this.hasUnsavedChanges = true;

                // Trigger change detection to update UI
                this.cdr.detectChanges();

                MJNotificationService.Instance.CreateSimpleNotification(
                    `Action "${action.Name}" will be removed when you save the agent`,
                    'info',
                    4000
                );
                } catch (error) {
                    console.error('Error removing action from agent:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to remove action',
                        'error',
                        3000
                    );
                }
            }
        } catch (dialogError) {
            console.error('Error with action dialog:', dialogError);
        }
    }

    /**
     * Opens the advanced settings dialog for a prompt
     */
    public async openPromptAdvancedSettings(prompt: AIPromptEntityExtended, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        try {
            // Find the corresponding AIAgentPromptEntity for this prompt
            const rv = new RunView();
            const agentPromptResult = await rv.RunView<AIAgentPromptEntity>({
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID='${this.record.ID}' AND PromptID='${prompt.ID}'`,
                ResultType: 'entity_object'
            });

            if (!agentPromptResult.Success || !agentPromptResult.Results?.length) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Unable to find prompt configuration for advanced settings',
                    'error',
                    3000
                );
                return;
            }

            const agentPrompt = agentPromptResult.Results[0];

            // Get all agent prompts for validation
            const allAgentPromptsResult = await rv.RunView<AIAgentPromptEntity>({
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID='${this.record.ID}'`,
                ResultType: 'entity_object'
            });

            const allAgentPrompts = allAgentPromptsResult.Success ? (allAgentPromptsResult.Results || []) : [];

            this.agentManagementService.openAgentPromptAdvancedSettingsDialog({
                agentPrompt: agentPrompt,
                allAgentPrompts: allAgentPrompts,
                viewContainerRef: this.viewContainerRef
            }).subscribe({
                next: async (formData) => {
                    if (formData) {
                        try {
                            // Update the agent prompt entity with new values
                            agentPrompt.ExecutionOrder = formData.executionOrder;
                            agentPrompt.Purpose = formData.purpose;
                            agentPrompt.ConfigurationID = formData.configurationID;
                            agentPrompt.ContextBehavior = formData.contextBehavior;
                            agentPrompt.ContextMessageCount = formData.contextMessageCount;
                            agentPrompt.Status = formData.status;

                            // Save immediately to database
                            const saveResult = await agentPrompt.Save();
                            if (saveResult) {
                                MJNotificationService.Instance.CreateSimpleNotification(
                                    'Prompt settings updated successfully',
                                    'success',
                                    3000
                                );

                                // Refresh the related data to reflect changes
                                await this.loadRelatedCounts();
                            } else {
                                MJNotificationService.Instance.CreateSimpleNotification(
                                    'Failed to save prompt settings. Please try again.',
                                    'error',
                                    3000
                                );
                            }
                        } catch (error) {
                            console.error('Error saving prompt advanced settings:', error);
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'Error saving prompt settings. Please try again.',
                                'error',
                                3000
                            );
                        }
                    }
                },
                error: (error) => {
                    console.error('Error opening prompt advanced settings dialog:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening advanced settings. Please try again.',
                        'error',
                        3000
                    );
                }
            });

        } catch (error) {
            console.error('Error in openPromptAdvancedSettings:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error opening prompt advanced settings. Please try again.',
                'error',
                3000
            );
        }
    }

    /**
     * Opens the advanced settings dialog for a sub-agent
     */
    public async openSubAgentAdvancedSettings(subAgent: AIAgentEntity, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        try {
            // Load the full sub-agent entity for editing
            const md = new Metadata();
            const subAgentEntity = await md.GetEntityObject<AIAgentEntity>('AI Agents');
            await subAgentEntity.Load(subAgent.ID);

            // Get all sub-agents under the same parent for validation
            const rv = new RunView();
            const allSubAgentsResult = await rv.RunView<AIAgentEntity>({
                EntityName: 'AI Agents',
                ExtraFilter: `ParentID='${this.record.ID}'`,
                ResultType: 'entity_object'
            });

            const allSubAgents = allSubAgentsResult.Success ? (allSubAgentsResult.Results || []) : [];

            this.agentManagementService.openSubAgentAdvancedSettingsDialog({
                subAgent: subAgentEntity,
                allSubAgents: allSubAgents,
                viewContainerRef: this.viewContainerRef
            }).subscribe({
                next: async (formData) => {
                    if (formData) {
                        try {
                            // Update the sub-agent entity with new values
                            subAgentEntity.ExecutionOrder = formData.executionOrder;
                            subAgentEntity.ExecutionMode = formData.executionMode;
                            subAgentEntity.Status = formData.status;
                            subAgentEntity.TypeID = formData.typeID;
                            subAgentEntity.ExposeAsAction = formData.exposeAsAction;

                            // Save immediately to database
                            const saveResult = await subAgentEntity.Save();
                            if (saveResult) {
                                MJNotificationService.Instance.CreateSimpleNotification(
                                    'Sub-agent settings updated successfully',
                                    'success',
                                    3000
                                );

                                // Update the local sub-agent data to reflect changes
                                const localSubAgent = this.subAgents.find(sa => sa.ID === subAgent.ID);
                                if (localSubAgent) {
                                    localSubAgent.ExecutionOrder = formData.executionOrder;
                                    localSubAgent.ExecutionMode = formData.executionMode;
                                    localSubAgent.Status = formData.status;
                                    localSubAgent.TypeID = formData.typeID;
                                    localSubAgent.ExposeAsAction = formData.exposeAsAction;
                                }

                                // Trigger change detection to update UI
                                this.cdr.detectChanges();
                            } else {
                                MJNotificationService.Instance.CreateSimpleNotification(
                                    'Failed to save sub-agent settings. Please try again.',
                                    'error',
                                    3000
                                );
                            }
                        } catch (error) {
                            console.error('Error saving sub-agent advanced settings:', error);
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'Error saving sub-agent settings. Please try again.',
                                'error',
                                3000
                            );
                        }
                    }
                },
                error: (error) => {
                    console.error('Error opening sub-agent advanced settings dialog:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening advanced settings. Please try again.',
                        'error',
                        3000
                    );
                }
            });

        } catch (error) {
            console.error('Error in openSubAgentAdvancedSettings:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error opening sub-agent advanced settings. Please try again.',
                'error',
                3000
            );
        }
    }

    /**
     * Override PopulatePendingRecords to preserve our pending records before parent clears them
     * However, during cancel operations, we want to clear all pending records completely
     */
    protected PopulatePendingRecords() {
        // If we're in the middle of a cancel operation, don't preserve pending records
        // The base class CancelEdit will handle reverting pending records appropriately
        if (this.isPerformingCancel) {
            super.PopulatePendingRecords();
            return;
        }

        // IMPORTANT: The parent method clears the pending records array, so we need to preserve
        // any records we've added before calling the parent method during normal operations
        const currentPendingRecords = [...this.PendingRecords]; // Make a copy
        
        // Call parent first to get child component pending records (this clears the array)
        super.PopulatePendingRecords();
        
        // Re-add our preserved records (only during normal save operations)
        for (const record of currentPendingRecords) {
            this.PendingRecords.push(record);
        }
    }

    /** Flag to track if we're currently performing a cancel operation */
    private isPerformingCancel = false;

    /**
     * Override InternalSaveRecord to handle agent-specific transaction logic
     * AI Agent must be saved first since related entities depend on it
     */
    /**
     * The base SaveRecord() method will call this InternalSaveRecord() method
     * after handling validation and pending record population
     */

    protected async InternalSaveRecord(): Promise<boolean> {
        if (!this.record) {
            return false;
        }

        try {
            const md = new Metadata();
            const transactionGroup = await md.CreateTransactionGroup();

            // Set transaction group on main record first
            this.record.TransactionGroup = transactionGroup;

            // Save entities in dependency order to avoid foreign key constraint errors
            // We need to save Templates and Template Contents BEFORE the main AI Agent
            // since AI Prompts depend on Templates, and AI Agent Prompts depend on AI Agents
            
            // 1. First save Templates (they have no dependencies)
            const templateRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name === 'Templates'
            );
            for (const templateRecord of templateRecords) {
                templateRecord.entityObject.TransactionGroup = transactionGroup;
                if (templateRecord.action === 'save') {
                    const saveResult = await templateRecord.entityObject.Save();
                    if (!saveResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to save Template "${templateRecord.entityObject.Get('Name')}". Please check the data and try again.`,
                            'error',
                            4000
                        );
                        return false;
                    }
                } else {
                    await templateRecord.entityObject.Delete();
                }
            }

            // 2. Save Template Contents (depend on Templates)
            const templateContentRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name === 'Template Contents'
            );
            for (const contentRecord of templateContentRecords) {
                contentRecord.entityObject.TransactionGroup = transactionGroup;
                if (contentRecord.action === 'save') {
                    const saveResult = await contentRecord.entityObject.Save();
                    if (!saveResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to save Template Content. Please check the data and try again.`,
                            'error',
                            4000
                        );
                        return false;
                    }
                } else {
                    await contentRecord.entityObject.Delete();
                }
            }

            // 3. Save AI Prompts (depend on Templates)
            const promptRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name === 'AI Prompts'
            );
            for (const promptRecord of promptRecords) {
                promptRecord.entityObject.TransactionGroup = transactionGroup;
                if (promptRecord.action === 'save') {
                    const saveResult = await promptRecord.entityObject.Save();
                    if (!saveResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to save AI Prompt "${promptRecord.entityObject.Get('Name')}". Please check the data and try again.`,
                            'error',
                            4000
                        );
                        return false;
                    }
                } else {
                    await promptRecord.entityObject.Delete();
                }
            }

            // 4. Save the main AI Agent record (other entity links depend on it)
            // The record transaction group was already set above
            const agentSaveResult = await this.record.Save();
            if (!agentSaveResult) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save AI agent "${this.record.Name}". Please check the data and try again.`,
                    'error',
                    4000
                );
                return false;
            }

            // 4.1. Handle deferred sub-agent creation - set ParentID on any sub-agents created before parent was saved
            const subAgentRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name === 'AI Agents' && 
                p.action === 'save' && 
                p.entityObject.Get('_tempParentId') === this.record.ID
            );
            
            for (const subAgentRecord of subAgentRecords) {
                // Cast to AIAgentEntity to access ParentID property
                const subAgent = subAgentRecord.entityObject as AIAgentEntity;
                // Set the proper ParentID now that parent is saved
                subAgent.ParentID = this.record.ID;
                // Clear the temporary reference
                subAgent.Set('_tempParentId', null);
            }

            // 5. Save all other pending records (AI Agent Actions, AI Agent Prompts, etc.)
            const otherRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name !== 'Templates' &&
                p.entityObject.EntityInfo.Name !== 'Template Contents' &&
                p.entityObject.EntityInfo.Name !== 'AI Prompts'
            );
            for (const record of otherRecords) {
                record.entityObject.TransactionGroup = transactionGroup;
                if (record.action === 'save') {
                    const saveResult = await record.entityObject.Save();
                    if (!saveResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to save ${record.entityObject.EntityInfo.Name}. Transaction will be rolled back.`,
                            'error',
                            4000
                        );
                        return false;
                    }
                } else {
                    await record.entityObject.Delete();
                }
            }

            // Execute all operations atomically
            const success = await transactionGroup.Submit();
            if (success) {
                // Clear our local state since save was successful
                this.hasUnsavedChanges = false;
                
                // Clear pending records since they've been saved
                this.PendingRecords.length = 0;
                
                // Reload related data to reflect database state
                await this.loadRelatedCounts();

                MJNotificationService.Instance.CreateSimpleNotification(
                    'AI Agent and all related changes saved successfully',
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
            MJNotificationService.Instance.CreateSimpleNotification(
                `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                'error',
                5000
            );
            return false;
        }
    }
    
}

export function LoadAIAgentFormComponentExtended() {
    // This function is called to ensure the component is loaded and registered
}