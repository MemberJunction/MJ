import {
    Metadata,
    RunView,
    UserInfo,
    LogError
} from '@memberjunction/core';
import {
    AIAgentEntity,
    AIAgentActionEntity,
    AIAgentRelationshipEntity
} from '@memberjunction/core-entities';
import {
    AgentSpec,
    AgentActionSpec,
    SubAgentSpec
} from '@memberjunction/ai-core-plus';

/**
 * AgentSpecSync provides a high-level interface for working with AI Agent metadata in MemberJunction.
 *
 * This class serves as a bi-directional bridge between the simple, serializable {@link AgentSpec}
 * format and the complex MemberJunction database metadata across three core entities:
 * - {@link AIAgentEntity} - Core agent configuration
 * - {@link AIAgentActionEntity} - Agent-action relationships
 * - {@link AIAgentRelationshipEntity} - Parent-child agent relationships
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
                StartingPayloadValidationMode: () => 'Fail',
                Actions: [],
                SubAgents: []
            };
        }
        this._contextUser = contextUser;
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
        const result = await rv.RunView<AIAgentEntity>({
            EntityName: 'AI Agents',
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
        const agentEntity = await md.GetEntityObject<AIAgentEntity>(
            'AI Agents',
            this._contextUser
        );
        const loaded = await agentEntity.Load(agentId);
        if (!loaded) {
            throw new Error(`Agent with ID ${agentId} not found`);
        }

        // Step 2: Batch load related entities using RunViews for optimal performance
        const [actionsResult, childAgentsResult, relatedAgentsResult] = await rv.RunViews([
            {
                EntityName: 'AI Agent Actions',
                ExtraFilter: `AgentID='${agentId}'`,
                OrderBy: 'Status, ActionID',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'AI Agents',
                ExtraFilter: `ParentID='${agentId}'`,
                OrderBy: 'ExecutionOrder, Name',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: AI Agent Relationships',
                ExtraFilter: `AgentID='${agentId}' AND Status='Active'`,
                OrderBy: '__mj_CreatedAt',
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

        // Step 3: Map entities to raw spec format
        this.spec = this.mapEntitiesToRawSpec(
            agentEntity,
            actionsResult.Results || [],
            childAgentsResult.Results || [],
            relatedAgentsResult.Results || []
        );

        // Step 4: Recursively load sub-agents if requested
        if (includeSubAgents && this.spec.SubAgents && this.spec.SubAgents.length > 0) {
            // Note: We don't recursively populate the full spec here since SubAgentSpec
            // only contains the ID and relationship metadata. To get full details,
            // users can call LoadFromDatabase on the SubAgentID separately if needed.
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
     * @returns Fully populated AgentSpec object
     */
    private mapEntitiesToRawSpec(
        agent: AIAgentEntity,
        actions: AIAgentActionEntity[],
        childAgents: AIAgentEntity[],
        relatedAgents: AIAgentRelationshipEntity[]
    ): AgentSpec {
        // Map all agent fields to spec
        const spec: AgentSpec = {
            ID: agent.ID,
            Name: agent.Name || '',
            Description: agent.Description || undefined,
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

            // Map actions
            Actions: actions.map(action => this.mapActionEntityToSpec(action)),

            // Map sub-agents (both child and related)
            SubAgents: [
                ...childAgents.map(child => this.mapChildAgentToSpec(child)),
                ...relatedAgents.map(rel => this.mapRelatedAgentToSpec(rel))
            ]
        };

        return spec;
    }

    /**
     * Map AIAgentActionEntity to AgentActionSpec format.
     *
     * @private
     * @param action - The agent action entity from the database
     * @returns Mapped action spec
     */
    private mapActionEntityToSpec(action: AIAgentActionEntity): AgentActionSpec {
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
    private mapChildAgentToSpec(childAgent: AIAgentEntity): SubAgentSpec {
        return {
            Type: 'child',
            SubAgentID: childAgent.ID
        };
    }

    /**
     * Map related agent (relationship-based) to SubAgentSpec format.
     *
     * @private
     * @param relationship - The agent relationship entity
     * @returns Mapped sub-agent spec
     */
    private mapRelatedAgentToSpec(relationship: AIAgentRelationshipEntity): SubAgentSpec {
        return {
            Type: 'related',
            SubAgentID: relationship.SubAgentID,
            AgentRelationshipID: relationship.ID,
            SubAgentInputMapping: this.parseJsonField<Record<string, string>>(relationship.SubAgentInputMapping),
            SubAgentOutputMapping: this.parseJsonField<Record<string, string>>(relationship.SubAgentOutputMapping),
            SubAgentContextPaths: this.parseJsonField<Record<string, string>>(relationship.SubAgentContextPaths)
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
     * @returns Promise resolving to the saved agent ID
     * @throws {Error} If validation fails or save operation fails
     *
     * @example
     * ```typescript
     * const spec = new AgentSpecSync({
     *     Name: 'New Agent',
     *     InvocationMode: 'Any'
     * }, contextUser);
     *
     * const agentId = await spec.SaveToDatabase();
     * console.log('Saved with ID:', agentId);
     * ```
     */
    async SaveToDatabase(validate: boolean = true): Promise<string> {
        if (!this._isDirty && this._isLoaded) {
            // No changes to save
            return this.spec.ID;
        }

        // Step 1: Save main agent entity
        const agentId = await this.saveAgentEntity(validate);

        // Step 2: Save actions
        await this.saveActions(agentId);

        // Step 3: Save sub-agents (both child and related)
        await this.saveSubAgents(agentId);

        this._isDirty = false;
        this._isLoaded = true;

        return agentId;
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
        const agentEntity = await md.GetEntityObject<AIAgentEntity>(
            'AI Agents',
            this._contextUser
        );

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
        agentEntity.StartingPayloadValidationMode = this.spec.StartingPayloadValidationMode?.() || 'Fail';

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
        if (this.spec.OwnerUserID) {
            agentEntity.OwnerUserID = this.spec.OwnerUserID;
        }
        agentEntity.InvocationMode = this.spec.InvocationMode || 'Any';

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
            const actionEntity = await md.GetEntityObject<AIAgentActionEntity>(
                'AI Agent Actions',
                this._contextUser
            );

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
     * on the child agent entity. If the SubAgentID is empty, this indicates a new
     * child agent that needs to be created.
     *
     * @private
     * @param parentId - The parent agent ID
     * @param SubAgentSpec - The sub-agent specification
     * @throws {Error} If child agent doesn't exist or save fails
     */
    private async saveChildSubAgent(parentId: string, SubAgentSpec: SubAgentSpec): Promise<void> {
        if (!SubAgentSpec.SubAgentID) {
            throw new Error('Child sub-agent must have a SubAgentID');
        }

        // For child agents, we just need to ensure the ParentID is set correctly
        // The sub-agent itself should already exist or be created separately
        const md = new Metadata();
        const childEntity = await md.GetEntityObject<AIAgentEntity>(
            'AI Agents',
            this._contextUser
        );

        const loaded = await childEntity.Load(SubAgentSpec.SubAgentID);
        if (!loaded) {
            throw new Error(`Child agent ${SubAgentSpec.SubAgentID} not found`);
        }

        // Update parent ID if needed
        if (childEntity.ParentID !== parentId) {
            childEntity.ParentID = parentId;
            const saved = await childEntity.Save();
            if (!saved) {
                throw new Error(`Failed to update ParentID for child agent ${SubAgentSpec.SubAgentID}`);
            }
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
        const relationshipEntity = await md.GetEntityObject<AIAgentRelationshipEntity>(
            'MJ: AI Agent Relationships',
            this._contextUser
        );

        // Load existing if ID provided
        if (SubAgentSpec.AgentRelationshipID) {
            await relationshipEntity.Load(SubAgentSpec.AgentRelationshipID);
        }

        // Map fields
        relationshipEntity.AgentID = agentId;
        relationshipEntity.SubAgentID = SubAgentSpec.SubAgentID;
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
            throw new Error(`Failed to save relationship for sub-agent ${SubAgentSpec.SubAgentID}`);
        }

        // Update spec with saved ID
        SubAgentSpec.AgentRelationshipID = relationshipEntity.ID;
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
            StartingPayloadValidationMode: partial.StartingPayloadValidationMode || (() => 'Fail'),
            DefaultPromptEffortLevel: partial.DefaultPromptEffortLevel,
            ChatHandlingOption: partial.ChatHandlingOption,
            DefaultArtifactTypeID: partial.DefaultArtifactTypeID,
            OwnerUserID: partial.OwnerUserID,
            InvocationMode: partial.InvocationMode || 'Any',
            Actions: partial.Actions || [],
            SubAgents: partial.SubAgents || []
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
}
