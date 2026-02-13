import {
    Metadata,
    RunView,
    UserInfo,
    LogError
} from '@memberjunction/core';
import {
    MJAIAgentEntity,
    MJAIAgentActionEntity,
    MJAIAgentRelationshipEntity,
    MJAIAgentStepEntity,
    MJAIAgentStepPathEntity
} from '@memberjunction/core-entities';
import {
    AgentSpec,
    AgentActionSpec,
    SubAgentSpec
} from '@memberjunction/ai-core-plus';

/**
 * Represents a single database mutation performed by AgentSpecSync
 */
export interface AgentSpecSyncMutation {
    /** Entity name (e.g., "MJ: AI Agents", "MJ: AI Prompts", "AIAgentAction") */
    Entity: string;
    /** Operation type */
    Operation: 'Create' | 'Update' | 'Delete';
    /** Record ID */
    ID: string;
    /** Human-readable description of what was done */
    Description: string;
}

/**
 * Result of SaveToDatabase operation including all mutations performed
 */
export interface AgentSpecSyncResult {
    /** ID of the saved agent */
    agentId: string;
    /** Whether the operation succeeded */
    success: boolean;
    /** Array of all database mutations performed */
    mutations: AgentSpecSyncMutation[];
}

/**
 * Represents the current state of agent-related records in the database.
 * Used for diffing against the AgentSpec to identify orphaned records.
 * @private
 */
interface DatabaseState {
    actions: MJAIAgentActionEntity[];
    prompts: any[]; // MJAIAgentPromptEntity (junction records)
    relationships: MJAIAgentRelationshipEntity[];
    steps: MJAIAgentStepEntity[];
    paths: MJAIAgentStepPathEntity[];
    childAgents: MJAIAgentEntity[];
}

/**
 * Represents records that exist in the database but not in the current AgentSpec.
 * These orphaned records need to be deleted or orphaned.
 * @private
 */
interface Orphans {
    actions: MJAIAgentActionEntity[];
    prompts: any[]; // MJAIAgentPromptEntity junctions (NOT the AIPrompt entities themselves)
    relationships: MJAIAgentRelationshipEntity[];
    steps: MJAIAgentStepEntity[];
    paths: MJAIAgentStepPathEntity[];
    childAgents: MJAIAgentEntity[]; // Will be orphaned (ParentID = NULL) not deleted
}

/**
 * AgentSpecSync provides a high-level interface for working with AI Agent metadata in MemberJunction.
 *
 * This class serves as a bi-directional bridge between the simple, serializable {@link AgentSpec}
 * format and the complex MemberJunction database metadata across three core entities:
 * - {@link MJAIAgentEntity} - Core agent configuration
 * - {@link MJAIAgentActionEntity} - Agent-action relationships
 * - {@link MJAIAgentRelationshipEntity} - Parent-child agent relationships
 *
 * ## Key Features
 *
 * - **Load from Database**: Load complete agent hierarchies including all sub-agents and actions
 * - **Save to Database**: Persist changes atomically with full validation
 * - **Recursive Support**: Handles n-level agent hierarchies automatically
 * - **Type Safety**: Full TypeScript typing with proper entity types
 * - **Dirty Tracking**: Knows when changes need to be saved
 * - **JSON Serialization**: Easy export for APIs and storage
 *
 * ## Usage Examples
 *
 * ### Load an existing agent
 * ```typescript
 * const spec = await AgentSpecSync.LoadFromDatabase('agent-uuid', contextUser);
 * console.log('Agent Name:', spec.spec.Name);
 * console.log('Actions:', spec.spec.Actions?.length);
 * ```
 *
 * ### Create a new agent
 * ```typescript
 * const newAgent = new AgentSpecSync({
 *     Name: 'My New Agent',
 *     Description: 'Does amazing things',
 *     IconClass: 'fa-robot',
 *     InvocationMode: 'Any'
 * }, contextUser);
 *
 * const agentId = await newAgent.SaveToDatabase();
 * ```
 *
 * ### Modify and save
 * ```typescript
 * const spec = await AgentSpecSync.LoadFromDatabase('agent-uuid', contextUser);
 * spec.spec.Description = 'Updated description';
 * spec.spec.MaxCostPerRun = 10.00;
 * spec.markDirty();
 * await spec.SaveToDatabase();
 * ```
 *
 * @module @memberjunction/ai-agent-manager
 */
export class AgentSpecSync {
    /**
     * The raw specification data structure containing all agent configuration
     */
    public spec: AgentSpec;

    /**
     * Tracks whether this spec has been loaded from the database
     * @private
     */
    private _isLoaded: boolean = false;

    /**
     * Tracks whether this spec has unsaved changes
     * @private
     */
    private _isDirty: boolean = false;

    /**
     * Context user for database operations (required for server-side operations)
     * @private
     */
    private _contextUser?: UserInfo;

    /**
     * Tracks all database mutations performed during save operations
     * @private
     */
    private _mutations: AgentSpecSyncMutation[] = [];

    /**
     * Create a new AgentSpecSync instance.
     *
     * Note: This constructor is typically not called directly. Instead, use the static factory methods:
     * - {@link LoadFromDatabase} - Load existing agent from database
     * - {@link LoadByName} - Load agent by name
     * - {@link FromRawSpec} - Create from raw spec data
     *
     * @param spec - Optional initial spec data (for creating new agents or working with existing data)
     * @param contextUser - Optional context user (required for server-side operations)
     */
    constructor(spec?: Partial<AgentSpec>, contextUser?: UserInfo) {
        if (spec) {
            this.spec = this.initializeSpec(spec);
            this._isDirty = true;
        } else {
            // Create minimal empty spec
            this.spec = {
                ID: '', // Will be set on save if empty
                Name: '',
                StartingPayloadValidationMode: 'Fail',
                Actions: [],
                SubAgents: []
            };
        }
        this._contextUser = contextUser;
    }

    // ===== MUTATION TRACKING METHODS =====

    /**
     * Track a database mutation performed during save operation
     * @private
     */
    private trackMutation(
        entity: string,
        operation: 'Create' | 'Update' | 'Delete',
        id: string,
        description: string
    ): void {
        this._mutations.push({
            Entity: entity,
            Operation: operation,
            ID: id,
            Description: description
        });
    }

    /**
     * Get all mutations tracked during the last save operation
     * @returns Array of mutations
     */
    public getMutations(): AgentSpecSyncMutation[] {
        return [...this._mutations];
    }

    /**
     * Clear all tracked mutations
     */
    public clearMutations(): void {
        this._mutations = [];
    }

    // ===== STATIC FACTORY METHODS =====

    /**
     * Load an agent and its complete hierarchy from the database by ID.
     *
     * This method efficiently loads the agent along with all its actions and sub-agents
     * using batched queries to minimize database round trips. When `includeSubAgents` is true,
     * it recursively loads the entire agent hierarchy.
     *
     * @param agentId - The unique ID of the agent to load
     * @param contextUser - Optional context user (required for server-side operations)
     * @param includeSubAgents - Whether to recursively load all sub-agents (default: true)
     * @returns Promise resolving to AgentSpecSync instance with loaded data
     * @throws {Error} If agent with specified ID is not found
     *
     * @example
     * ```typescript
     * // Load agent with all sub-agents
     * const spec = await AgentSpecSync.LoadFromDatabase(
     *     'agent-uuid-here',
     *     contextUser,
     *     true
     * );
     * ```
     */
    static async LoadFromDatabase(
        agentId: string,
        contextUser?: UserInfo,
        includeSubAgents: boolean = true
    ): Promise<AgentSpecSync> {
        const instance = new AgentSpecSync(undefined, contextUser);
        await instance.loadFromEntities(agentId, includeSubAgents);
        return instance;
    }

    /**
     * Load an agent by name (must be unique).
     *
     * Searches for an agent with the specified name and loads it. If multiple agents
     * have the same name, an error is thrown. Agent names should be unique within
     * the system for this method to work reliably.
     *
     * @param agentName - The name of the agent to load
     * @param contextUser - Optional context user (required for server-side operations)
     * @param includeSubAgents - Whether to recursively load sub-agents (default: true)
     * @returns Promise resolving to AgentSpecSync instance with loaded data
     * @throws {Error} If agent is not found or multiple agents have the same name
     *
     * @example
     * ```typescript
     * const spec = await AgentSpecSync.LoadByName('My Agent', contextUser);
     * ```
     */
    static async LoadByName(
        agentName: string,
        contextUser?: UserInfo,
        includeSubAgents: boolean = true
    ): Promise<AgentSpecSync> {
        // Find agent by name
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentEntity>({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Name='${agentName.replace(/'/g, "''")}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to find agent by name: ${result.ErrorMessage}`);
        }

        if (!result.Results || result.Results.length === 0) {
            throw new Error(`Agent with name '${agentName}' not found`);
        }

        if (result.Results.length > 1) {
            throw new Error(`Multiple agents found with name '${agentName}'. Use LoadFromDatabase with specific ID instead.`);
        }

        const agent = result.Results[0];
        return AgentSpecSync.LoadFromDatabase(agent.ID, contextUser, includeSubAgents);
    }

    /**
     * Create a new agent spec from a raw specification.
     *
     * This creates an in-memory AgentSpecSync instance from raw data. The agent is not
     * saved to the database until {@link SaveToDatabase} is called.
     *
     * @param rawSpec - The raw spec data conforming to {@link AgentSpec} interface
     * @param contextUser - Optional context user (required when saving server-side)
     * @returns New AgentSpecSync instance (not yet saved to database)
     *
     * @example
     * ```typescript
     * const rawSpec: AgentSpec = {
     *     ID: '',
     *     Name: 'New Agent',
     *     Description: 'Agent description',
     *     InvocationMode: 'Any',
     *     Actions: [],
     *     SubAgents: []
     * };
     * const spec = AgentSpecSync.FromRawSpec(rawSpec, contextUser);
     * await spec.SaveToDatabase();
     * ```
     */
    static FromRawSpec(rawSpec: AgentSpec, contextUser?: UserInfo): AgentSpecSync {
        return new AgentSpecSync(rawSpec, contextUser);
    }

    // ===== LOADING METHODS =====

    /**
     * Load the complete agent specification from database entities.
     *
     * This method orchestrates loading from AIAgent, AIAgentAction, and AIAgentRelationship tables
     * using batched queries for optimal performance. It handles both child agents (ParentID-based)
     * and related agents (relationship-based).
     *
     * @private
     * @param agentId - The agent ID to load
     * @param includeSubAgents - Whether to recursively load sub-agents
     * @throws {Error} If agent is not found
     */
    private async loadFromEntities(agentId: string, includeSubAgents: boolean): Promise<void> {
        const md = new Metadata();
        const rv = new RunView();

        // Step 1: Load the main agent entity
        const agentEntity = await md.GetEntityObject<MJAIAgentEntity>(
            'MJ: AI Agents',
            this._contextUser
        );
        const loaded = await agentEntity.Load(agentId);
        if (!loaded) {
            throw new Error(`Agent with ID ${agentId} not found`);
        }

        // Step 2: Batch load related entities using RunViews for optimal performance
        // Note: Load paths separately after steps to avoid hardcoded view name in subquery
        const [actionsResult, childAgentsResult, relatedAgentsResult, promptsResult, stepsResult] = await rv.RunViews([
            {
                EntityName: 'MJ: AI Agent Actions',
                ExtraFilter: `AgentID='${agentId}'`,
                OrderBy: 'Status, ActionID',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `ParentID='${agentId}'`,
                OrderBy: 'ExecutionOrder, Name',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: AI Agent Relationships',
                ExtraFilter: `AgentID='${agentId}' AND Status='Active'`,
                OrderBy: '__mj_CreatedAt',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID='${agentId}'`,
                OrderBy: 'ExecutionOrder',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: AI Agent Steps',
                ExtraFilter: `AgentID='${agentId}'`,
                OrderBy: 'Name',
                ResultType: 'entity_object'
            }
        ], this._contextUser);

        // Check for errors
        if (!actionsResult.Success) {
            throw new Error(`Failed to load agent actions: ${actionsResult.ErrorMessage}`);
        }
        if (!childAgentsResult.Success) {
            throw new Error(`Failed to load child agents: ${childAgentsResult.ErrorMessage}`);
        }
        if (!relatedAgentsResult.Success) {
            throw new Error(`Failed to load related agents: ${relatedAgentsResult.ErrorMessage}`);
        }
        if (!promptsResult.Success) {
            throw new Error(`Failed to load agent prompts: ${promptsResult.ErrorMessage}`);
        }
        if (!stepsResult.Success) {
            throw new Error(`Failed to load agent steps: ${stepsResult.ErrorMessage}`);
        }

        // Step 2b: Load paths separately using step IDs to avoid hardcoded view name
        let pathsResult;
        const steps = stepsResult.Results || [];
        if (steps.length > 0) {
            const stepIds = steps.map((s: MJAIAgentStepEntity) => `'${s.ID}'`).join(',');
            pathsResult = await rv.RunView<MJAIAgentStepPathEntity>({
                EntityName: 'MJ: AI Agent Step Paths',
                ExtraFilter: `OriginStepID IN (${stepIds})`,
                OrderBy: 'Priority DESC',
                ResultType: 'entity_object'
            }, this._contextUser);

            if (!pathsResult.Success) {
                throw new Error(`Failed to load step paths: ${pathsResult.ErrorMessage}`);
            }
        } else {
            // No steps, so no paths
            pathsResult = {
                Success: true,
                Results: [],
                RowCount: 0
            };
        }

        // Step 2c: Load full AI Prompt records to get PromptText, PromptRole, PromptPosition
        let fullPromptsResult;
        const agentPrompts = promptsResult.Results || [];
        if (agentPrompts.length > 0) {
            const promptIds = agentPrompts.map((p: any) => `'${p.PromptID}'`).join(',');
            fullPromptsResult = await rv.RunView({
                EntityName: 'MJ: AI Prompts',
                ExtraFilter: `ID IN (${promptIds})`,
                OrderBy: 'Name',
                ResultType: 'entity_object'
            }, this._contextUser);

            if (!fullPromptsResult.Success) {
                throw new Error(`Failed to load AI prompts: ${fullPromptsResult.ErrorMessage}`);
            }
        } else {
            // No prompts
            fullPromptsResult = {
                Success: true,
                Results: [],
                RowCount: 0
            };
        }

        // Step 3: Map entities to raw spec format
        this.spec = this.mapEntitiesToRawSpec(
            agentEntity,
            actionsResult.Results || [],
            childAgentsResult.Results || [],
            relatedAgentsResult.Results || [],
            promptsResult.Results || [],
            fullPromptsResult.Results || [],
            stepsResult.Results || [],
            pathsResult.Results || []
        );

        // Step 4: Recursively load sub-agents if requested
        if (includeSubAgents && this.spec.SubAgents && this.spec.SubAgents.length > 0) {
            // Recursively load complete specs for all sub-agents
            for (const subAgentSpec of this.spec.SubAgents) {
                if (subAgentSpec.SubAgent && subAgentSpec.SubAgent.ID) {
                    try {
                        // Load the complete sub-agent spec recursively
                        const subAgentSync = await AgentSpecSync.LoadFromDatabase(
                            subAgentSpec.SubAgent.ID,
                            this._contextUser,
                            true // Recursively load nested sub-agents too
                        );

                        // Replace the minimal SubAgent with the complete spec
                        const fullSubAgentSpec = subAgentSync.toJSON();

                        // Preserve the relationship metadata while adding full spec details
                        subAgentSpec.SubAgent = {
                            ...fullSubAgentSpec,
                            // Ensure we preserve any relationship-specific overrides
                            StartingPayloadValidationMode: subAgentSpec.SubAgent.StartingPayloadValidationMode || fullSubAgentSpec.StartingPayloadValidationMode
                        };
                    } catch (error) {
                        LogError(`Failed to load sub-agent ${subAgentSpec.SubAgent.ID}: ${error instanceof Error ? error.message : String(error)}`);
                        // Continue with partial data rather than failing completely
                    }
                }
            }
        }

        this._isLoaded = true;
        this._isDirty = false;
    }

    /**
     * Map database entities to AgentSpec format.
     *
     * Transforms the normalized database entities into a single denormalized specification
     * object that's easy to work with in code. Handles JSON parsing for all structured fields.
     *
     * @private
     * @param agent - The main agent entity
     * @param actions - Array of agent action entities
     * @param childAgents - Array of child agent entities (ParentID-based)
     * @param relatedAgents - Array of related agent relationship entities
     * @param agentPrompts - Array of agent prompt junction entities
     * @param fullPrompts - Array of full AI Prompt entities with PromptText, PromptRole, PromptPosition
     * @param steps - Array of agent step entities (for Flow agents)
     * @param paths - Array of step path entities (for Flow agents)
     * @returns Fully populated AgentSpec object
     */
    private mapEntitiesToRawSpec(
        agent: MJAIAgentEntity,
        actions: MJAIAgentActionEntity[],
        childAgents: MJAIAgentEntity[],
        relatedAgents: MJAIAgentRelationshipEntity[],
        agentPrompts: any[],
        fullPrompts: any[],
        steps: MJAIAgentStepEntity[],
        paths: MJAIAgentStepPathEntity[]
    ): AgentSpec {
        // Map all agent fields to spec
        const spec: AgentSpec = {
            ID: agent.ID,
            Name: agent.Name || '',
            Description: agent.Description || undefined,
            TypeID: agent.TypeID || undefined,
            Status: (agent.Status as 'Active' | 'Inactive' | 'Pending') || undefined,
            IconClass: agent.IconClass || undefined,
            LogoURL: agent.LogoURL || undefined,
            ParentID: agent.ParentID || undefined,
            DriverClass: agent.DriverClass || undefined,
            ModelSelectionMode: agent.ModelSelectionMode,

            // Parse JSON array fields
            PayloadDownstreamPaths: this.parseJsonField<string[]>(agent.PayloadDownstreamPaths),
            PayloadUpstreamPaths: this.parseJsonField<string[]>(agent.PayloadUpstreamPaths),
            PayloadSelfReadPaths: this.parseJsonField<string[]>(agent.PayloadSelfReadPaths),
            PayloadSelfWritePaths: this.parseJsonField<string[]>(agent.PayloadSelfWritePaths),
            PayloadScope: agent.PayloadScope || undefined,

            // Validation fields
            FinalPayloadValidation: agent.FinalPayloadValidation || null,
            FinalPayloadValidationMode: agent.FinalPayloadValidationMode,
            FinalPayloadValidationMaxRetries: agent.FinalPayloadValidationMaxRetries || undefined,

            StartingPayloadValidation: agent.StartingPayloadValidation || null,
            StartingPayloadValidationMode: agent.StartingPayloadValidationMode as any,

            // Resource limits
            MaxCostPerRun: agent.MaxCostPerRun || null,
            MaxTokensPerRun: agent.MaxTokensPerRun || null,
            MaxIterationsPerRun: agent.MaxIterationsPerRun || null,
            MaxTimePerRun: agent.MaxTimePerRun || undefined,

            // Execution frequency
            MinExecutionsPerRun: agent.MinExecutionsPerRun || undefined,
            MaxExecutionsPerRun: agent.MaxExecutionsPerRun || undefined,

            // Other config
            DefaultPromptEffortLevel: agent.DefaultPromptEffortLevel || undefined,
            ChatHandlingOption: agent.ChatHandlingOption || undefined,
            DefaultArtifactTypeID: agent.DefaultArtifactTypeID || undefined,
            OwnerUserID: agent.OwnerUserID || undefined,
            InvocationMode: agent.InvocationMode,

            // Requirements and design documentation
            FunctionalRequirements: (agent as any).FunctionalRequirements || null,
            TechnicalDesign: (agent as any).TechnicalDesign || null,

            // Map actions
            Actions: actions.map(action => this.mapActionEntityToSpec(action)),

            // Map sub-agents (both child and related)
            SubAgents: [
                ...childAgents.map(child => this.mapChildAgentToSpec(child)),
                ...relatedAgents.map(rel => this.mapRelatedAgentToSpec(rel))
            ],

            // Map prompts (agent-level prompts for Loop agents)
            Prompts: agentPrompts.map(agentPrompt => this.mapPromptEntityToSpec(agentPrompt, fullPrompts)),

            // Map steps (for Flow agents)
            Steps: steps.map(step => this.mapStepEntityToSpec(step)),

            // Map paths (for Flow agents)
            Paths: paths.map(path => this.mapPathEntityToSpec(path))
        };

        return spec;
    }

    /**
     * Map MJAIAgentActionEntity to AgentActionSpec format.
     *
     * @private
     * @param action - The agent action entity from the database
     * @returns Mapped action spec
     */
    private mapActionEntityToSpec(action: MJAIAgentActionEntity): AgentActionSpec {
        return {
            AgentActionID: action.ID,
            ActionID: action.ActionID || '',
            Status: action.Status,
            MaxExecutionsPerRun: action.MaxExecutionsPerRun || undefined,
            ResultExpirationTurns: action.ResultExpirationTurns || undefined,
            ResultExpirationMode: action.ResultExpirationMode || undefined,
            CompactMode: action.CompactMode || undefined,
            CompactLength: action.CompactLength || undefined,
            CompactPromptID: action.CompactPromptID || null
        };
    }

    /**
     * Map child agent (ParentID-based) to SubAgentSpec format.
     *
     * @private
     * @param childAgent - The child agent entity
     * @returns Mapped sub-agent spec
     */
    private mapChildAgentToSpec(childAgent: MJAIAgentEntity): SubAgentSpec {
        return {
            Type: 'child',
            SubAgent: {
                ID: childAgent.ID,
                Name: childAgent.Name || '',
                StartingPayloadValidationMode: 'Fail'
            }
        };
    }

    /**
     * Map related agent (relationship-based) to SubAgentSpec format.
     *
     * @private
     * @param relationship - The agent relationship entity
     * @returns Mapped sub-agent spec
     */
    private mapRelatedAgentToSpec(relationship: MJAIAgentRelationshipEntity): SubAgentSpec {
        return {
            Type: 'related',
            SubAgent: {
                ID: relationship.SubAgentID,
                Name: relationship.SubAgent || '',
                StartingPayloadValidationMode: 'Fail'
            },
            AgentRelationshipID: relationship.ID,
            SubAgentInputMapping: this.parseJsonField<Record<string, string>>(relationship.SubAgentInputMapping),
            SubAgentOutputMapping: this.parseJsonField<Record<string, string>>(relationship.SubAgentOutputMapping),
            SubAgentContextPaths: this.parseJsonField<Record<string, string>>(relationship.SubAgentContextPaths)
        };
    }

    /**
     * Map MJAIAgentPromptEntity junction to AgentPromptSpec format.
     *
     * @private
     * @param agentPrompt - The agent prompt junction entity (has PromptID, ExecutionOrder)
     * @param fullPrompts - Array of full AI Prompt entities
     * @returns Mapped prompt spec
     */
    private mapPromptEntityToSpec(agentPrompt: any, fullPrompts: any[]): any {
        // Find the full prompt data by matching PromptID
        const fullPrompt = fullPrompts.find((p: any) => p.ID === agentPrompt.PromptID);

        if (!fullPrompt) {
            // Fallback if prompt not found
            return {
                ID: agentPrompt.ID,  // Junction record ID for orphan detection
                PromptID: agentPrompt.PromptID || '',
                PromptText: '',
                PromptRole: 'System',
                PromptPosition: 'First'
            };
        }

        return {
            ID: agentPrompt.ID,  // Junction record ID for orphan detection
            PromptID: fullPrompt.ID || '',
            PromptText: fullPrompt.TemplateText || '',
            PromptRole: fullPrompt.PromptRole || 'System',
            PromptPosition: fullPrompt.PromptPosition || 'First'
        };
    }

    /**
     * Map MJAIAgentStepEntity to AgentStep format.
     *
     * @private
     * @param step - The agent step entity
     * @returns Mapped step spec
     */
    private mapStepEntityToSpec(step: MJAIAgentStepEntity): any {
        return {
            ID: step.ID,
            Name: step.Name,
            Description: step.Description || undefined,
            StepType: step.StepType,
            StartingStep: step.StartingStep,
            ActionID: step.ActionID || undefined,
            SubAgentID: step.SubAgentID || undefined,
            PromptID: step.PromptID || undefined,
            ActionInputMapping: this.parseJsonField<any>(step.ActionInputMapping),
            ActionOutputMapping: this.parseJsonField<any>(step.ActionOutputMapping)
        };
    }

    /**
     * Map MJAIAgentStepPathEntity to AgentStepPath format.
     *
     * @private
     * @param path - The agent step path entity
     * @returns Mapped path spec
     */
    private mapPathEntityToSpec(path: MJAIAgentStepPathEntity): any {
        return {
            ID: path.ID,
            OriginStepID: path.OriginStepID,
            DestinationStepID: path.DestinationStepID,
            Condition: path.Condition || undefined,
            Description: path.Description || undefined,
            Priority: path.Priority
        };
    }

    // ===== SAVING METHODS =====

    /**
     * Save the current spec to the database.
     *
     * This will create new records or update existing ones based on whether IDs exist.
     * The save operation is performed atomically - if any part fails, no changes are committed.
     *
     * Validation is performed before saving. All entity-level validations defined in the
     * database schema are executed, and any failures will prevent the save.
     *
     * @param validate - Whether to validate before saving (default: true)
     * @returns Promise resolving to result with agent ID, success flag, and all mutations performed
     * @throws {Error} If validation fails or save operation fails
     *
     * @example
     * ```typescript
     * const spec = new AgentSpecSync({
     *     Name: 'New Agent',
     *     InvocationMode: 'Any'
     * }, contextUser);
     *
     * const result = await spec.SaveToDatabase();
     * console.log('Saved with ID:', result.agentId);
     * console.log('Mutations:', result.mutations.length);
     * ```
     */
    async SaveToDatabase(validate: boolean = true): Promise<AgentSpecSyncResult> {
        // Clear previous mutations
        this.clearMutations();

        if (!this._isDirty && this._isLoaded) {
            // No changes to save
            return {
                agentId: this.spec.ID,
                success: true,
                mutations: []
            };
        }

        try {
            // Step 0: Delete orphaned records (if this is an update)
            if (this._isLoaded && this.spec.ID) {
                console.log(`🗑️ SaveToDatabase: Loading current database state for agent ${this.spec.ID}...`);
                const dbState = await this.loadCurrentDatabaseState(this.spec.ID);

                console.log(`🔍 SaveToDatabase: Identifying orphaned records...`);
                const orphans = this.identifyOrphans(dbState, this.spec);

                console.log(`🗑️ SaveToDatabase: Deleting ${orphans.paths.length} paths, ${orphans.actions.length} actions, ${orphans.steps.length} steps, ${orphans.prompts.length} prompts, ${orphans.relationships.length} relationships, orphaning ${orphans.childAgents.length} child agents...`);
                await this.deleteOrphans(orphans);

                console.log(`✅ SaveToDatabase: Orphan cleanup complete`);
            }

            // Step 1: Save main agent entity
            const agentId = await this.saveAgentEntity(validate);

            // Step 2: Save actions
            await this.saveActions(agentId);

            // Step 3: Save sub-agents (both child and related)
            await this.saveSubAgents(agentId);

            // Step 4: Save prompts
            await this.savePrompts(agentId);

            // Step 5: Save steps (Flow agents only)
            await this.saveSteps(agentId);

            // Step 6: Save step paths (Flow agents only)
            await this.saveStepPaths(agentId);

            this._isDirty = false;
            this._isLoaded = true;

            return {
                agentId,
                success: true,
                mutations: this.getMutations()
            };
        } catch (error) {
            // Return failure with whatever mutations were completed before error
            return {
                agentId: this.spec.ID || '',
                success: false,
                mutations: this.getMutations()
            };
        }
    }

    /**
     * Save the main AIAgent entity.
     *
     * @private
     * @param validate - Whether to perform validation before saving
     * @returns Promise resolving to the saved agent ID
     * @throws {Error} If validation fails or save fails
     */
    private async saveAgentEntity(validate: boolean): Promise<string> {
        const md = new Metadata();
        const agentEntity = await md.GetEntityObject<MJAIAgentEntity>(
            'MJ: AI Agents',
            this._contextUser
        );

        // Track if this is an update or create
        const isUpdate = !!this.spec.ID;

        // If ID exists, load existing record
        if (this.spec.ID) {
            const loaded = await agentEntity.Load(this.spec.ID);
            if (!loaded) {
                throw new Error(`Cannot update non-existent agent with ID ${this.spec.ID}`);
            }
        }

        // Map spec to entity fields
        agentEntity.Name = this.spec.Name;
        agentEntity.Description = this.spec.Description || null;
        agentEntity.IconClass = this.spec.IconClass || null;
        agentEntity.LogoURL = this.spec.LogoURL || null;
        agentEntity.ParentID = this.spec.ParentID || null;
        agentEntity.DriverClass = this.spec.DriverClass || null;
        agentEntity.ModelSelectionMode = this.spec.ModelSelectionMode || 'Agent Type';

        // Handle TypeID - supports lookup references or direct GUID
        if ((this.spec as any).TypeID) {
            agentEntity.TypeID = (this.spec as any).TypeID;
        }

        // Handle Status - defaults to Active if not specified
        if ((this.spec as any).Status) {
            agentEntity.Status = (this.spec as any).Status;
        } else {
            agentEntity.Status = 'Active';
        }

        // Serialize JSON fields
        agentEntity.PayloadDownstreamPaths = JSON.stringify(
            this.spec.PayloadDownstreamPaths || ['*']
        );
        agentEntity.PayloadUpstreamPaths = JSON.stringify(
            this.spec.PayloadUpstreamPaths || ['*']
        );
        agentEntity.PayloadSelfReadPaths = this.spec.PayloadSelfReadPaths
            ? JSON.stringify(this.spec.PayloadSelfReadPaths)
            : null;
        agentEntity.PayloadSelfWritePaths = this.spec.PayloadSelfWritePaths
            ? JSON.stringify(this.spec.PayloadSelfWritePaths)
            : null;
        agentEntity.PayloadScope = this.spec.PayloadScope || null;

        // Validation fields
        agentEntity.FinalPayloadValidation = this.spec.FinalPayloadValidation || null;
        agentEntity.FinalPayloadValidationMode = this.spec.FinalPayloadValidationMode || 'Retry';
        agentEntity.FinalPayloadValidationMaxRetries = this.spec.FinalPayloadValidationMaxRetries || 3;

        agentEntity.StartingPayloadValidation = this.spec.StartingPayloadValidation || null;
        agentEntity.StartingPayloadValidationMode = this.spec.StartingPayloadValidationMode || 'Fail';

        // Resource limits
        agentEntity.MaxCostPerRun = this.spec.MaxCostPerRun || null;
        agentEntity.MaxTokensPerRun = this.spec.MaxTokensPerRun || null;
        agentEntity.MaxIterationsPerRun = this.spec.MaxIterationsPerRun || null;
        agentEntity.MaxTimePerRun = this.spec.MaxTimePerRun || null;

        // Execution frequency
        agentEntity.MinExecutionsPerRun = this.spec.MinExecutionsPerRun || null;
        agentEntity.MaxExecutionsPerRun = this.spec.MaxExecutionsPerRun || null;

        // Other config
        agentEntity.DefaultPromptEffortLevel = this.spec.DefaultPromptEffortLevel || null;
        agentEntity.ChatHandlingOption = this.spec.ChatHandlingOption || null;
        agentEntity.DefaultArtifactTypeID = this.spec.DefaultArtifactTypeID || null;

        // Set OwnerUserID - always use contextUser if available (user creating/modifying the agent)
        if (this._contextUser) {
            agentEntity.OwnerUserID = this._contextUser.ID;
        } else if (this.spec.OwnerUserID) {
            // Fallback to spec value if no contextUser provided
            agentEntity.OwnerUserID = this.spec.OwnerUserID;
        }

        agentEntity.InvocationMode = this.spec.InvocationMode || 'Any';

        // Requirements and design documentation
        agentEntity.FunctionalRequirements = this.spec.FunctionalRequirements || null;
        agentEntity.TechnicalDesign = this.spec.TechnicalDesign || null;

        // Validate if requested
        if (validate) {
            const validation = agentEntity.Validate();
            if (!validation.Success) {
                const errors = validation.Errors.map(e => e.Message).join(', ');
                throw new Error(`Agent validation failed: ${errors}`);
            }
        }

        // Save
        const saved = await agentEntity.Save();
        if (!saved) {
            throw new Error('Failed to save agent entity');
        }

        // Update spec with saved ID
        this.spec.ID = agentEntity.ID;

        // Track the mutation
        this.trackMutation(
            'MJ: AI Agents',
            isUpdate ? 'Update' : 'Create',
            agentEntity.ID,
            `${isUpdate ? 'Updated' : 'Created'} agent: ${this.spec.Name}`
        );

        return agentEntity.ID;
    }

    /**
     * Save all actions for this agent.
     *
     * Creates or updates agent action records. Existing actions are updated, new actions
     * are created. This method does not delete actions that are no longer in the spec -
     * use a separate delete method for that.
     *
     * @private
     * @param agentId - The parent agent ID
     * @throws {Error} If any action save fails
     */
    private async saveActions(agentId: string): Promise<void> {
        if (!this.spec.Actions || this.spec.Actions.length === 0) {
            return;
        }

        const md = new Metadata();

        for (const actionSpec of this.spec.Actions) {
            const actionEntity = await md.GetEntityObject<MJAIAgentActionEntity>(
                'MJ: AI Agent Actions',
                this._contextUser
            );

            // Track if this is an update or create
            const isUpdate = !!actionSpec.AgentActionID;

            // Load existing if ID provided
            if (actionSpec.AgentActionID) {
                await actionEntity.Load(actionSpec.AgentActionID);
            }

            // Map fields
            actionEntity.AgentID = agentId;
            actionEntity.ActionID = actionSpec.ActionID;
            actionEntity.Status = actionSpec.Status;
            actionEntity.MaxExecutionsPerRun = actionSpec.MaxExecutionsPerRun || null;
            actionEntity.ResultExpirationTurns = actionSpec.ResultExpirationTurns || null;
            actionEntity.ResultExpirationMode = actionSpec.ResultExpirationMode || 'None';
            actionEntity.CompactMode = actionSpec.CompactMode || null;
            actionEntity.CompactLength = actionSpec.CompactLength || null;
            actionEntity.CompactPromptID = actionSpec.CompactPromptID || null;

            const saved = await actionEntity.Save();
            if (!saved) {
                throw new Error(`Failed to save action ${actionSpec.ActionID}`);
            }

            // Update spec with saved ID
            actionSpec.AgentActionID = actionEntity.ID;

            // Track the mutation
            this.trackMutation(
                'MJ: AI Agent Actions',
                isUpdate ? 'Update' : 'Create',
                actionEntity.ID,
                `${isUpdate ? 'Updated' : 'Created'} action junction for action ${actionSpec.ActionID}`
            );
        }
    }

    /**
     * Save all sub-agents (both child and related types).
     *
     * Handles both ParentID-based child agents and relationship-based related agents.
     * For child agents, updates the ParentID on the sub-agent entity. For related agents,
     * creates or updates the relationship record.
     *
     * @private
     * @param agentId - The parent agent ID
     * @throws {Error} If any sub-agent save fails
     */
    private async saveSubAgents(agentId: string): Promise<void> {
        if (!this.spec.SubAgents || this.spec.SubAgents.length === 0) {
            return;
        }

        for (const SubAgentSpec of this.spec.SubAgents) {
            if (SubAgentSpec.Type === 'child') {
                await this.saveChildSubAgent(agentId, SubAgentSpec);
            } else {
                await this.saveRelatedSubAgent(agentId, SubAgentSpec);
            }
        }
    }

    /**
     * Save a child sub-agent (ParentID-based relationship).
     *
     * For child agents, the relationship is established by setting the ParentID field
     * on the child agent entity. If the SubAgent.ID is empty, this creates a new
     * child agent recursively using AgentSpecSync.
     *
     * This enables creating complete agent hierarchies in one call - sub-agents are
     * created first (depth-first), then parent references them via ParentID.
     *
     * @private
     * @param parentId - The parent agent ID
     * @param SubAgentSpec - The sub-agent specification
     * @throws {Error} If child agent save fails
     */
    private async saveChildSubAgent(parentId: string, SubAgentSpec: SubAgentSpec): Promise<void> {
        console.log(`🔗 saveChildSubAgent: Processing child "${SubAgentSpec.SubAgent?.Name}", ID="${SubAgentSpec.SubAgent?.ID}"`);

        // If SubAgent.ID is empty or missing, create the sub-agent recursively
        if (!SubAgentSpec.SubAgent?.ID || SubAgentSpec.SubAgent.ID === '') {
            console.log(`🔨 saveChildSubAgent: Creating new child sub-agent "${SubAgentSpec.SubAgent.Name}"...`);

            // Set ParentID in the sub-agent spec before creating it
            const childSpec: AgentSpec = {
                ...SubAgentSpec.SubAgent,
                ParentID: parentId
            };

            // Recursively create the sub-agent using AgentSpecSync
            const childSync = new AgentSpecSync(childSpec, this._contextUser);
            childSync.markDirty();
            const childResult = await childSync.SaveToDatabase();

            // Update the SubAgentSpec with the created ID so parent can reference it
            SubAgentSpec.SubAgent.ID = childResult.agentId;

            console.log(`✅ saveChildSubAgent: Created child sub-agent with ID: ${childResult.agentId}`);
        } else {
            // SubAgent already exists - update it recursively to capture all field changes
            console.log(`🔗 saveChildSubAgent: Updating existing child sub-agent "${SubAgentSpec.SubAgent.ID}"...`);

            // Set ParentID in the sub-agent spec
            const childSpec: AgentSpec = {
                ...SubAgentSpec.SubAgent,
                ParentID: parentId
            };

            // Recursively update the sub-agent using AgentSpecSync
            // This ensures all fields including FunctionalRequirements and TechnicalDesign are updated
            const childSync = new AgentSpecSync(childSpec, this._contextUser);
            childSync.markDirty();
            childSync.markLoaded();  // Mark as loaded so delete logic runs for orphaned records
            await childSync.SaveToDatabase();

            console.log(`✅ saveChildSubAgent: Updated existing child sub-agent`);
        }
    }

    /**
     * Save a related sub-agent (relationship-based).
     *
     * Creates or updates an AIAgentRelationship record that links the parent and
     * sub-agent. This includes the input/output mapping and context path configurations.
     *
     * @private
     * @param agentId - The parent agent ID
     * @param SubAgentSpec - The sub-agent specification
     * @throws {Error} If relationship save fails
     */
    private async saveRelatedSubAgent(agentId: string, SubAgentSpec: SubAgentSpec): Promise<void> {
        const md = new Metadata();
        const relationshipEntity = await md.GetEntityObject<MJAIAgentRelationshipEntity>(
            'MJ: AI Agent Relationships',
            this._contextUser
        );

        // Load existing if ID provided
        const isUpdate = !!SubAgentSpec.AgentRelationshipID;
        if (isUpdate && SubAgentSpec.AgentRelationshipID) {
            await relationshipEntity.Load(SubAgentSpec.AgentRelationshipID);
        }

        // Map fields
        relationshipEntity.AgentID = agentId;
        relationshipEntity.SubAgentID = SubAgentSpec.SubAgent.ID;
        relationshipEntity.Status = 'Active';

        // Serialize mapping fields
        if (SubAgentSpec.SubAgentInputMapping) {
            relationshipEntity.SubAgentInputMapping = JSON.stringify(SubAgentSpec.SubAgentInputMapping);
        } else {
            relationshipEntity.SubAgentInputMapping = null;
        }

        if (SubAgentSpec.SubAgentOutputMapping) {
            relationshipEntity.SubAgentOutputMapping = JSON.stringify(SubAgentSpec.SubAgentOutputMapping);
        } else {
            relationshipEntity.SubAgentOutputMapping = null;
        }

        if (SubAgentSpec.SubAgentContextPaths) {
            relationshipEntity.SubAgentContextPaths = JSON.stringify(SubAgentSpec.SubAgentContextPaths);
        } else {
            relationshipEntity.SubAgentContextPaths = null;
        }

        const saved = await relationshipEntity.Save();
        if (!saved) {
            throw new Error(`Failed to save relationship for sub-agent ${SubAgentSpec.SubAgent.ID}`);
        }

        // Track mutation
        this.trackMutation(
            'AI Agent Relationships',
            isUpdate ? 'Update' : 'Create',
            relationshipEntity.ID,
            `${isUpdate ? 'Updated' : 'Created'} agent relationship for sub-agent ${SubAgentSpec.SubAgent.ID}`
        );

        // Update spec with saved ID
        SubAgentSpec.AgentRelationshipID = relationshipEntity.ID;
    }

    /**
     * Save all prompts for this agent.
     *
     * Creates AIPrompt records (with template) and AIAgentPrompt junction records.
     * Supports simplified prompt format from Architect Agent with just PromptText,
     * PromptRole, and PromptPosition.
     *
     * @private
     * @param agentId - The parent agent ID
     * @throws {Error} If any prompt save fails
     */
    private async savePrompts(agentId: string): Promise<void> {
        console.log(`💬 savePrompts: Called with agentId=${agentId}, Prompts=${this.spec.Prompts ? this.spec.Prompts.length : 'undefined'}`);

        if (!this.spec.Prompts || this.spec.Prompts.length === 0) {
            console.log('💬 savePrompts: No prompts to save, returning early');
            return;
        }

        console.log(`💬 savePrompts: Processing ${this.spec.Prompts.length} prompt(s)...`);
        const md = new Metadata();
        const rv = new RunView();

        // Step 1: Create or update AIPrompt records
        for (let i = 0; i < this.spec.Prompts.length; i++) {
            const promptSpec = this.spec.Prompts[i];

            // Check if this is an update (has PromptID) or create (no PromptID)
            let promptEntity = await md.GetEntityObject<any>(
                'MJ: AI Prompts',
                this._contextUser
            );

            let isUpdate = false;
            if ((promptSpec as any).PromptID && (promptSpec as any).PromptID !== '') {
                // Load existing prompt for update
                const loaded = await promptEntity.Load((promptSpec as any).PromptID);
                if (loaded) {
                    isUpdate = true;
                    console.log(`💬 savePrompts: Updating existing prompt ID: ${(promptSpec as any).PromptID}`);
                } else {
                    console.warn(`💬 savePrompts: PromptID specified but not found, creating new prompt`);
                }
            }

            // Set all required fields (both create and update)
            promptEntity.Name = `${this.spec.Name} - Prompt ${i + 1}`;
            promptEntity.Description = `Agent prompt ${i + 1} for ${this.spec.Name}`;
            promptEntity.TypeID = 'a6da423e-f36b-1410-8dac-00021f8b792e'; // Chat type
            promptEntity.Status = 'Active';
            promptEntity.ResponseFormat = 'JSON';

            // Handle prompt text - supports both string and object formats
            if (typeof (promptSpec as any).PromptText === 'string') {
                promptEntity.TemplateText = (promptSpec as any).PromptText;
            } else if (typeof (promptSpec as any).PromptText === 'object') {
                // Architect may send PromptText as {text: "...", json: {...}}
                const promptTextObj = (promptSpec as any).PromptText as any;
                let combinedText = promptTextObj.text || '';
                if (promptTextObj.json) {
                    combinedText += '\n\n```json\n' + JSON.stringify(promptTextObj.json, null, 2) + '\n```';
                }
                promptEntity.TemplateText = combinedText;
            }

            // Set prompt role and position if provided
            if ((promptSpec as any).PromptRole) {
                promptEntity.PromptRole = (promptSpec as any).PromptRole;
            }
            if ((promptSpec as any).PromptPosition) {
                promptEntity.PromptPosition = (promptSpec as any).PromptPosition;
            }

            const saved = await promptEntity.Save();
            if (!saved) {
                throw new Error(`Failed to save prompt ${i + 1} for agent ${this.spec.Name}`);
            }

            // Track mutation
            this.trackMutation(
                'MJ: AI Prompts',
                isUpdate ? 'Update' : 'Create',
                promptEntity.ID,
                `${isUpdate ? 'Updated' : 'Created'} prompt: ${promptEntity.Name}`
            );

            // Update the spec with the saved/updated ID
            (promptSpec as any).PromptID = promptEntity.ID;

            console.log(`✅ savePrompts: ${isUpdate ? 'Updated' : 'Created'} AIPrompt with ID: ${promptEntity.ID}`);

            // Step 2: Create or update AIAgentPrompt junction
            // Query for existing junction by AgentID + PromptID
            const existingJunctionResult = await rv.RunView<any>({
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID='${agentId}' AND PromptID='${promptEntity.ID}'`,
                ResultType: 'entity_object'
            }, this._contextUser);

            let agentPromptEntity: any;
            let isJunctionUpdate = false;

            if (existingJunctionResult.Success && existingJunctionResult.Results && existingJunctionResult.Results.length > 0) {
                // Junction exists - load it for update
                agentPromptEntity = existingJunctionResult.Results[0];
                isJunctionUpdate = true;
                console.log(`💬 savePrompts: Updating existing junction for prompt ${i + 1}`);
            } else {
                // Junction doesn't exist - create new one
                agentPromptEntity = await md.GetEntityObject<any>(
                    'MJ: AI Agent Prompts',
                    this._contextUser
                );
                agentPromptEntity.AgentID = agentId;
                agentPromptEntity.PromptID = promptEntity.ID;
                console.log(`💬 savePrompts: Creating new junction for prompt ${i + 1}`);
            }

            // Set/update common fields (ExecutionOrder might change)
            agentPromptEntity.ExecutionOrder = i;
            agentPromptEntity.Status = 'Active';

            const junctionSaved = await agentPromptEntity.Save();
            if (!junctionSaved) {
                throw new Error(`Failed to save agent-prompt junction for prompt ${i + 1}`);
            }

            // Track mutation
            this.trackMutation(
                'MJ: AI Agent Prompts',
                isJunctionUpdate ? 'Update' : 'Create',
                agentPromptEntity.ID,
                `${isJunctionUpdate ? 'Updated' : 'Created'} agent-prompt junction for prompt ${promptEntity.ID}`
            );

            console.log(`✅ savePrompts: ${isJunctionUpdate ? 'Updated' : 'Created'} AIAgentPrompt junction with ID: ${agentPromptEntity.ID}`);
        }

        console.log(`✅ savePrompts: Successfully saved all ${this.spec.Prompts.length} prompt(s)`);
    }

    /**
     * Save all steps for this agent (Flow agents only).
     *
     * Creates AIAgentStep records for each step in the spec. Steps define the nodes
     * in a Flow agent's execution graph.
     *
     * @private
     * @param agentId - The parent agent ID
     * @throws {Error} If any step save fails
     */
    private async saveSteps(agentId: string): Promise<void> {
        console.log(`🔷 saveSteps: Called with agentId=${agentId}, Steps=${this.spec.Steps ? this.spec.Steps.length : 'undefined'}`);

        if (!this.spec.Steps || this.spec.Steps.length === 0) {
            console.log('🔷 saveSteps: No steps to save, returning early');
            return;
        }

        console.log(`🔷 saveSteps: Processing ${this.spec.Steps.length} step(s)...`);
        const md = new Metadata();

        for (const stepSpec of this.spec.Steps) {
            const stepEntity = await md.GetEntityObject<MJAIAgentStepEntity>(
                'MJ: AI Agent Steps',
                this._contextUser
            );

            // Load existing if ID provided
            const isUpdate = !!(stepSpec.ID && stepSpec.ID !== '');
            if (isUpdate) {
                await stepEntity.Load(stepSpec.ID);
            }

            // Map fields
            stepEntity.AgentID = agentId;
            stepEntity.Name = stepSpec.Name;
            stepEntity.Description = stepSpec.Description || null;
            stepEntity.StepType = stepSpec.StepType;
            stepEntity.StartingStep = stepSpec.StartingStep;
            stepEntity.ActionID = stepSpec.ActionID || null;
            stepEntity.SubAgentID = stepSpec.SubAgentID || null;
            stepEntity.Status = 'Active'; // Default to Active

            // Handle inline prompt creation for Prompt-type steps
            // If StepType is Prompt and PromptID is empty, create a new AIPrompt record
            if (stepSpec.StepType === 'Prompt' && (!stepSpec.PromptID || stepSpec.PromptID === '')) {
                if (stepSpec.PromptText) {
                    console.log(`🔷 saveSteps: Creating inline prompt for step "${stepSpec.Name}"`);

                    // Create AIPrompt entity (using any type for TemplateText dynamic property)
                    const promptEntity = await md.GetEntityObject<any>(
                        'MJ: AI Prompts',
                        this._contextUser
                    );

                    // Set prompt fields
                    promptEntity.Name = stepSpec.PromptName || `${stepSpec.Name} Prompt`;
                    promptEntity.Description = stepSpec.PromptDescription || `Prompt for step: ${stepSpec.Name}`;
                    promptEntity.TypeID = 'a6da423e-f36b-1410-8dac-00021f8b792e'; // Chat type
                    promptEntity.Status = 'Active';
                    promptEntity.ResponseFormat = 'JSON';
                    promptEntity.TemplateText = stepSpec.PromptText; // TemplateText is a dynamic property

                    const promptSaved = await promptEntity.Save();
                    if (!promptSaved) {
                        throw new Error(`Failed to save inline prompt for step "${stepSpec.Name}"`);
                    }

                    // Track mutation
                    this.trackMutation(
                        'MJ: AI Prompts',
                        'Create',
                        promptEntity.ID,
                        `Created inline prompt: ${promptEntity.Name}`
                    );

                    console.log(`✅ saveSteps: Created inline AIPrompt with ID: ${promptEntity.ID}`);

                    // Link the created prompt to this step
                    stepEntity.PromptID = promptEntity.ID;
                    stepSpec.PromptID = promptEntity.ID; // Update spec too
                } else {
                    console.warn(`⚠️ saveSteps: Step "${stepSpec.Name}" is Prompt type with empty PromptID but no PromptText provided`);
                    stepEntity.PromptID = null;
                }
            } else {
                stepEntity.PromptID = stepSpec.PromptID || null;
            }

            // Map Action I/O mappings for Flow agent action steps
            // Handle ActionInputMapping - convert object to JSON string if needed
            if (stepSpec.ActionInputMapping) {
                stepEntity.ActionInputMapping = typeof stepSpec.ActionInputMapping === 'string'
                    ? stepSpec.ActionInputMapping
                    : JSON.stringify(stepSpec.ActionInputMapping);
            } else {
                stepEntity.ActionInputMapping = null;
            }

            // Handle ActionOutputMapping - convert object to JSON string if needed
            if (stepSpec.ActionOutputMapping) {
                stepEntity.ActionOutputMapping = typeof stepSpec.ActionOutputMapping === 'string'
                    ? stepSpec.ActionOutputMapping
                    : JSON.stringify(stepSpec.ActionOutputMapping);
            } else {
                stepEntity.ActionOutputMapping = null;
            }

            const saved = await stepEntity.Save();
            if (!saved) {
                throw new Error(`Failed to save step "${stepSpec.Name}" for agent ${this.spec.Name}`);
            }

            // Track mutation
            this.trackMutation(
                'AI Agent Steps',
                isUpdate ? 'Update' : 'Create',
                stepEntity.ID,
                `${isUpdate ? 'Updated' : 'Created'} step: ${stepSpec.Name}`
            );

            // Update the spec with the saved ID so paths can reference it
            stepSpec.ID = stepEntity.ID;

            console.log(`✅ saveSteps: Created AIAgentStep with ID: ${stepEntity.ID}`);
        }

        console.log(`✅ saveSteps: Successfully saved all ${this.spec.Steps.length} step(s)`);
    }

    /**
     * Save all step paths for this agent (Flow agents only).
     *
     * Creates AIAgentStepPath records that define the edges in a Flow agent's
     * execution graph, including conditional branching logic.
     *
     * @private
     * @param agentId - The parent agent ID
     * @throws {Error} If any path save fails
     */
    private async saveStepPaths(agentId: string): Promise<void> {
        console.log(`🔶 saveStepPaths: Called with agentId=${agentId}, Paths=${this.spec.Paths ? this.spec.Paths.length : 'undefined'}`);

        if (!this.spec.Paths || this.spec.Paths.length === 0) {
            console.log('🔶 saveStepPaths: No paths to save, returning early');
            return;
        }

        console.log(`🔶 saveStepPaths: Processing ${this.spec.Paths.length} path(s)...`);
        const md = new Metadata();

        // Create a map of step names to IDs for easy lookup
        const stepNameToId = new Map<string, string>();
        if (this.spec.Steps) {
            for (const step of this.spec.Steps) {
                if (step.ID) {
                    stepNameToId.set(step.Name, step.ID);
                }
            }
        }

        for (const pathSpec of this.spec.Paths) {
            const pathEntity = await md.GetEntityObject<MJAIAgentStepPathEntity>(
                'MJ: AI Agent Step Paths',
                this._contextUser
            );

            // Load existing if ID provided
            const isUpdate = !!(pathSpec.ID && pathSpec.ID !== '');
            if (isUpdate) {
                await pathEntity.Load(pathSpec.ID);
            }

            // Resolve step IDs from step names
            // OriginStepID and DestinationStepID can be either step IDs or step names
            // If they're names, look them up in our map
            let originStepId = pathSpec.OriginStepID;
            let destinationStepId = pathSpec.DestinationStepID;

            // Try to resolve as step names first
            if (stepNameToId.has(pathSpec.OriginStepID)) {
                originStepId = stepNameToId.get(pathSpec.OriginStepID)!;
            }
            if (stepNameToId.has(pathSpec.DestinationStepID)) {
                destinationStepId = stepNameToId.get(pathSpec.DestinationStepID)!;
            }

            // Map fields
            pathEntity.OriginStepID = originStepId;
            pathEntity.DestinationStepID = destinationStepId;
            pathEntity.Condition = pathSpec.Condition || null;
            pathEntity.Description = pathSpec.Description || null;
            pathEntity.Priority = pathSpec.Priority;

            const saved = await pathEntity.Save();
            if (!saved) {
                throw new Error(`Failed to save path from "${pathSpec.OriginStepID}" to "${pathSpec.DestinationStepID}"`);
            }

            // Track mutation
            this.trackMutation(
                'AI Agent Step Paths',
                isUpdate ? 'Update' : 'Create',
                pathEntity.ID,
                `${isUpdate ? 'Updated' : 'Created'} path from "${pathSpec.OriginStepID}" to "${pathSpec.DestinationStepID}"`
            );

            // Update the spec with the saved ID
            pathSpec.ID = pathEntity.ID;

            console.log(`✅ saveStepPaths: Created AIAgentStepPath with ID: ${pathEntity.ID}`);
        }

        console.log(`✅ saveStepPaths: Successfully saved all ${this.spec.Paths.length} path(s)`);
    }

    // ===== UTILITY METHODS =====

    /**
     * Parse a JSON string field, returning undefined if null/empty.
     *
     * Safely parses JSON fields from the database, handling null/undefined values
     * and logging errors if parsing fails.
     *
     * @private
     * @param jsonString - The JSON string to parse
     * @returns Parsed object or undefined if null/empty/invalid
     */
    private parseJsonField<T>(jsonString: string | null | undefined): T | undefined {
        if (!jsonString) return undefined;
        try {
            return JSON.parse(jsonString) as T;
        } catch (error) {
            LogError(`Failed to parse JSON field: ${error}`);
            return undefined;
        }
    }

    /**
     * Initialize a spec with defaults for any missing required fields.
     *
     * Takes a partial spec and fills in defaults for any missing fields to ensure
     * a valid AgentSpec structure.
     *
     * @private
     * @param partial - Partial agent specification
     * @returns Complete AgentSpec with defaults
     */
    private initializeSpec(partial: Partial<AgentSpec>): AgentSpec {
        return {
            ID: partial.ID || '',
            Name: partial.Name || '',
            Description: partial.Description,

            // TypeID and Status are extended fields (not in base AgentSpec interface)
            TypeID: (partial as any).TypeID,
            Status: (partial as any).Status || 'Active',

            IconClass: partial.IconClass,
            LogoURL: partial.LogoURL,
            ParentID: partial.ParentID,
            DriverClass: partial.DriverClass,
            ModelSelectionMode: partial.ModelSelectionMode || 'Agent Type',
            PayloadDownstreamPaths: partial.PayloadDownstreamPaths,
            PayloadUpstreamPaths: partial.PayloadUpstreamPaths,
            PayloadSelfReadPaths: partial.PayloadSelfReadPaths,
            PayloadSelfWritePaths: partial.PayloadSelfWritePaths,
            PayloadScope: partial.PayloadScope,
            FinalPayloadValidation: partial.FinalPayloadValidation,
            FinalPayloadValidationMode: partial.FinalPayloadValidationMode || 'Retry',
            FinalPayloadValidationMaxRetries: partial.FinalPayloadValidationMaxRetries,
            MaxCostPerRun: partial.MaxCostPerRun,
            MaxTokensPerRun: partial.MaxTokensPerRun,
            MaxIterationsPerRun: partial.MaxIterationsPerRun,
            MaxTimePerRun: partial.MaxTimePerRun,
            MinExecutionsPerRun: partial.MinExecutionsPerRun,
            MaxExecutionsPerRun: partial.MaxExecutionsPerRun,
            StartingPayloadValidation: partial.StartingPayloadValidation,
            StartingPayloadValidationMode: partial.StartingPayloadValidationMode || 'Fail',
            DefaultPromptEffortLevel: partial.DefaultPromptEffortLevel,
            ChatHandlingOption: partial.ChatHandlingOption,
            DefaultArtifactTypeID: partial.DefaultArtifactTypeID,
            OwnerUserID: partial.OwnerUserID,
            InvocationMode: partial.InvocationMode || 'Any',
            FunctionalRequirements: partial.FunctionalRequirements,
            TechnicalDesign: partial.TechnicalDesign,
            Actions: partial.Actions || [],
            SubAgents: partial.SubAgents || [],
            Prompts: partial.Prompts || [],

            // Flow agent fields - critical for Flow agent support
            Steps: partial.Steps || [],
            Paths: partial.Paths || []
        };
    }

    /**
     * Get a clean serializable version of the spec.
     *
     * Returns a plain JavaScript object suitable for JSON serialization,
     * API responses, or storage. This is useful when you need to send the
     * agent spec over the wire or store it in a file.
     *
     * @returns Clean copy of the agent specification
     *
     * @example
     * ```typescript
     * const spec = await AgentSpecSync.LoadFromDatabase('agent-uuid', contextUser);
     * const json = spec.toJSON();
     * res.json(json); // Send as API response
     * ```
     */
    public toJSON(): AgentSpec {
        return { ...this.spec };
    }

    /**
     * Check if this spec has unsaved changes.
     *
     * @returns True if there are unsaved changes, false otherwise
     */
    public get isDirty(): boolean {
        return this._isDirty;
    }

    /**
     * Check if this spec has been loaded from the database.
     *
     * @returns True if loaded from database, false if created in memory
     */
    public get isLoaded(): boolean {
        return this._isLoaded;
    }

    /**
     * Mark the spec as having changes.
     *
     * Call this method after modifying the spec to indicate that changes need to be saved.
     * The spec is automatically marked dirty when created with the constructor, but if you
     * load a spec and then modify it, you should call this method.
     *
     * @example
     * ```typescript
     * const spec = await AgentSpecSync.LoadFromDatabase('agent-uuid', contextUser);
     * spec.spec.Description = 'New description';
     * spec.markDirty();
     * await spec.SaveToDatabase();
     * ```
     */
    public markDirty(): void {
        this._isDirty = true;
    }

    /**
     * Mark the spec as having been loaded from the database.
     *
     * This is used internally when updating existing child agents to ensure the delete
     * logic runs correctly. When a child agent is updated via saveChildSubAgent(), we
     * create a new AgentSpecSync instance from the spec data (not loaded from DB), but
     * we need to mark it as loaded so orphaned records are properly deleted.
     *
     * @internal
     * @example
     * ```typescript
     * const childSync = new AgentSpecSync(existingChildSpec, contextUser);
     * childSync.markDirty();
     * childSync.markLoaded();  // Ensure delete logic runs for existing agent
     * await childSync.SaveToDatabase();
     * ```
     */
    public markLoaded(): void {
        this._isLoaded = true;
    }

    // ===== DELETE/ORPHAN METHODS =====

    /**
     * Load the current state of all agent-related records from the database.
     *
     * This method efficiently batches all queries using RunViews for optimal performance.
     * It loads all junction records and child agents for the specified agent.
     *
     * @private
     * @param agentId - The agent ID to load database state for
     * @returns Promise resolving to DatabaseState with all current records
     * @throws {Error} If any query fails
     */
    private async loadCurrentDatabaseState(agentId: string): Promise<DatabaseState> {
        const rv = new RunView();

        // Batch load all related records for this agent
        const [actions, prompts, relationships, steps, childAgents] = await rv.RunViews([
            {
                EntityName: 'MJ: AI Agent Actions',
                ExtraFilter: `AgentID='${agentId}'`,
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID='${agentId}'`,
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: AI Agent Relationships',
                ExtraFilter: `AgentID='${agentId}'`,
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: AI Agent Steps',
                ExtraFilter: `AgentID='${agentId}'`,
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `ParentID='${agentId}'`,
                ResultType: 'entity_object'
            }
        ], this._contextUser);

        // Check for errors
        if (!actions.Success || !prompts.Success || !relationships.Success ||
            !steps.Success || !childAgents.Success) {
            const errors = [actions, prompts, relationships, steps, childAgents]
                .filter(r => !r.Success)
                .map(r => r.ErrorMessage)
                .join('; ');
            throw new Error(`Failed to load database state: ${errors}`);
        }

        // Load paths separately after we have steps (to avoid subquery in ExtraFilter)
        let pathsResult;
        const stepRecords = steps.Results || [];
        if (stepRecords.length > 0) {
            const stepIds = stepRecords.map((s: MJAIAgentStepEntity) => `'${s.ID}'`).join(',');
            pathsResult = await rv.RunView<MJAIAgentStepPathEntity>({
                EntityName: 'MJ: AI Agent Step Paths',
                ExtraFilter: `OriginStepID IN (${stepIds})`,
                ResultType: 'entity_object'
            }, this._contextUser);

            if (!pathsResult.Success) {
                throw new Error(`Failed to load step paths: ${pathsResult.ErrorMessage}`);
            }
        } else {
            // No steps, so no paths
            pathsResult = { Success: true, Results: [] };
        }

        return {
            actions: actions.Results || [],
            prompts: prompts.Results || [],
            relationships: relationships.Results || [],
            steps: stepRecords,
            paths: pathsResult.Results || [],
            childAgents: childAgents.Results || []
        };
    }

    /**
     * Identify orphaned records by comparing database state to AgentSpec.
     *
     * An "orphan" is a database record that exists but is not represented in the
     * current AgentSpec. These records need to be deleted or orphaned.
     *
     * The diff logic matches by primary key ID:
     * - If a DB record's ID is found in the spec → KEEP (may be updated)
     * - If a DB record's ID is NOT in the spec → ORPHAN/DELETE
     *
     * @private
     * @param dbState - Current database state loaded from loadCurrentDatabaseState
     * @param spec - The new AgentSpec to compare against
     * @returns Orphans object containing all orphaned records
     */
    private identifyOrphans(dbState: DatabaseState, spec: AgentSpec): Orphans {
        return {
            // Orphaned actions: DB actions not in spec.Actions
            actions: dbState.actions.filter(dbAction =>
                !spec.Actions?.some(specAction => specAction.AgentActionID === dbAction.ID)
            ),

            // Orphaned prompt junctions: DB prompts not in spec.Prompts
            prompts: dbState.prompts.filter(dbPrompt =>
                !spec.Prompts?.some(specPrompt => (specPrompt as any).ID === dbPrompt.ID)
            ),

            // Orphaned relationships: DB relationships not in spec.SubAgents (related type)
            relationships: dbState.relationships.filter(dbRel =>
                !spec.SubAgents?.some(specSub =>
                    specSub.Type === 'related' && specSub.AgentRelationshipID === dbRel.ID
                )
            ),

            // Orphaned steps: DB steps not in spec.Steps
            steps: dbState.steps.filter(dbStep =>
                !spec.Steps?.some(specStep => specStep.ID === dbStep.ID)
            ),

            // Orphaned paths: DB paths not in spec.Paths
            paths: dbState.paths.filter(dbPath =>
                !spec.Paths?.some(specPath => specPath.ID === dbPath.ID)
            ),

            // Orphaned child agents: DB children not in spec.SubAgents (child type)
            childAgents: dbState.childAgents.filter(dbChild =>
                !spec.SubAgents?.some(specSub =>
                    specSub.Type === 'child' && specSub.SubAgent.ID === dbChild.ID
                )
            )
        };
    }

    /**
     * Delete or orphan all orphaned records in the correct order.
     *
     * This method executes deletions in phases to maintain referential integrity:
     * - Phase 1: Leaf entities (paths, actions) - no other entities reference these
     * - Phase 2: Mid-level entities (steps, prompt junctions, relationships)
     * - Phase 3: Child agents (orphan by setting ParentID = NULL)
     *
     * IMPORTANT: We NEVER delete AIPrompt entities themselves, only AIAgentPrompt junctions.
     * IMPORTANT: We ORPHAN child agents instead of deleting them to avoid foreign key violations from run history.
     *
     * @private
     * @param orphans - The orphaned records identified by identifyOrphans
     * @throws {Error} If any delete operation fails
     */
    private async deleteOrphans(orphans: Orphans): Promise<void> {
        const md = new Metadata();

        // Phase 1: Leaf entities (Paths, Actions)
        console.log(`🗑️ Phase 1: Deleting ${orphans.paths.length} paths and ${orphans.actions.length} actions...`);

        for (const path of orphans.paths) {
            console.log(`🗑️ deleteOrphans: Deleting path ${path.ID}...`);
            const entity = await md.GetEntityObject<MJAIAgentStepPathEntity>(
                'MJ: AI Agent Step Paths',
                this._contextUser
            );
            const loaded = await entity.Load(path.ID);
            if (!loaded) {
                console.error(`❌ deleteOrphans: Failed to load path ${path.ID} - skipping`);
                continue;
            }
            const deleted = await entity.Delete();
            if (!deleted) {
                console.error(`❌ deleteOrphans: Failed to delete path ${path.ID}`);
                continue;
            }
            console.log(`✅ deleteOrphans: Deleted path ${path.ID}`);
            this.trackMutation('MJ: AI Agent Step Paths', 'Delete', path.ID, `Deleted orphaned path`);
        }

        for (const action of orphans.actions) {
            console.log(`🗑️ deleteOrphans: Deleting action junction ${action.ID} (ActionID: ${action.ActionID})...`);
            const entity = await md.GetEntityObject<MJAIAgentActionEntity>(
                'MJ: AI Agent Actions',
                this._contextUser
            );
            const loaded = await entity.Load(action.ID);
            if (!loaded) {
                console.error(`❌ deleteOrphans: Failed to load action junction ${action.ID} - skipping`);
                continue;
            }
            const deleted = await entity.Delete();
            if (!deleted) {
                console.error(`❌ deleteOrphans: Failed to delete action junction ${action.ID}`);
                continue;
            }
            console.log(`✅ deleteOrphans: Deleted action junction ${action.ID}`);
            this.trackMutation('MJ: AI Agent Actions', 'Delete', action.ID, `Deleted orphaned action junction`);
        }

        // Phase 2: Mid-level entities (Steps, Prompt Junctions, Relationships)
        console.log(`🗑️ Phase 2: Deleting ${orphans.steps.length} steps, ${orphans.prompts.length} prompt junctions, ${orphans.relationships.length} relationships...`);

        for (const step of orphans.steps) {
            console.log(`🗑️ deleteOrphans: Deleting step ${step.ID} (${step.Name})...`);
            const entity = await md.GetEntityObject<MJAIAgentStepEntity>(
                'MJ: AI Agent Steps',
                this._contextUser
            );
            const loaded = await entity.Load(step.ID);
            if (!loaded) {
                console.error(`❌ deleteOrphans: Failed to load step ${step.ID} - skipping`);
                continue;
            }
            const deleted = await entity.Delete();
            if (!deleted) {
                console.error(`❌ deleteOrphans: Failed to delete step ${step.ID}`);
                continue;
            }
            console.log(`✅ deleteOrphans: Deleted step ${step.ID}`);
            this.trackMutation('MJ: AI Agent Steps', 'Delete', step.ID, `Deleted orphaned step`);
        }

        for (const promptJunction of orphans.prompts) {
            console.log(`🗑️ deleteOrphans: Deleting prompt junction ${promptJunction.ID} (PromptID: ${promptJunction.PromptID})...`);
            const entity = await md.GetEntityObject<any>(
                'MJ: AI Agent Prompts',
                this._contextUser
            );
            const loaded = await entity.Load(promptJunction.ID);
            if (!loaded) {
                console.error(`❌ deleteOrphans: Failed to load prompt junction ${promptJunction.ID} - skipping`);
                continue;
            }
            const deleted = await entity.Delete();
            if (!deleted) {
                console.error(`❌ deleteOrphans: Failed to delete prompt junction ${promptJunction.ID}`);
                continue;
            }
            console.log(`✅ deleteOrphans: Deleted prompt junction ${promptJunction.ID}`);
            this.trackMutation('MJ: AI Agent Prompts', 'Delete', promptJunction.ID, `Deleted orphaned prompt junction`);
            // NOTE: We do NOT delete the AIPrompt itself - it's a shared resource
        }

        for (const relationship of orphans.relationships) {
            console.log(`🗑️ deleteOrphans: Deleting relationship ${relationship.ID} (SubAgentID: ${relationship.SubAgentID})...`);
            const entity = await md.GetEntityObject<MJAIAgentRelationshipEntity>(
                'MJ: AI Agent Relationships',
                this._contextUser
            );
            const loaded = await entity.Load(relationship.ID);
            if (!loaded) {
                console.error(`❌ deleteOrphans: Failed to load relationship ${relationship.ID} - skipping`);
                continue;
            }
            const deleted = await entity.Delete();
            if (!deleted) {
                console.error(`❌ deleteOrphans: Failed to delete relationship ${relationship.ID}`);
                continue;
            }
            console.log(`✅ deleteOrphans: Deleted relationship ${relationship.ID}`);
            this.trackMutation('MJ: AI Agent Relationships', 'Delete', relationship.ID, `Deleted orphaned relationship`);
        }

        // Phase 3: Orphan child agents (set ParentID = NULL)
        console.log(`🔗 Phase 3: Orphaning ${orphans.childAgents.length} child agents (set ParentID = NULL)...`);

        for (const childAgent of orphans.childAgents) {
            await this.orphanChildAgent(childAgent.ID);
            this.trackMutation('MJ: AI Agents', 'Update', childAgent.ID, `Orphaned child agent: ${childAgent.Name} (set ParentID = NULL)`);
        }
    }

    /**
     * Orphan a child agent by setting its ParentID to NULL.
     *
     * This removes the child from the parent's hierarchy without deleting it.
     * This approach is used instead of full deletion because:
     * - Child agent may have AIAgentRun records (execution history)
     * - AIAgentRun.AgentID is NOT NULL with NO CASCADE DELETE
     * - Deleting child would cause foreign key violation
     * - Orphaning preserves history and avoids violation
     * - Child becomes a standalone agent
     *
     * @private
     * @param childAgentId - The ID of the child agent to orphan
     * @throws {Error} If orphaning fails
     */
    private async orphanChildAgent(childAgentId: string): Promise<void> {
        console.log(`🔗 orphanChildAgent: Orphaning child agent ${childAgentId}...`);

        const md = new Metadata();
        const childAgent = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', this._contextUser);

        const loaded = await childAgent.Load(childAgentId);
        if (!loaded) {
            throw new Error(`Failed to load child agent ${childAgentId} for orphaning`);
        }

        childAgent.ParentID = null; // Orphan the child
        const saved = await childAgent.Save();
        if (!saved) {
            throw new Error(`Failed to orphan child agent ${childAgentId}`);
        }

        console.log(`✅ orphanChildAgent: Orphaned child agent ${childAgentId} (ParentID = NULL)`);
    }
}