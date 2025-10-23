/**
 * This interface defines a simple serializable structure that represents the 
 * raw specification of an agent including its actions, sub-agents, etc. It pairs with
 * the AgentSpec class which provides methods to manipulate and synchronize this spec with
 * the underlying agent metadata in the database.
 */
export interface AgentSpec {
    /**
     * Detailed markdown formatted requirements that explain the business goals of the agent without
     * specific technical implementation details.
     */
    FunctionalRequirement?: string;

    /**
     * Detailed markdown that explains the structure of the agent including agent architecture,
     * actions, sub-agents, prompts, and payload structure. Information will include:
     * - Agent architecture overview - basic top level info like name, description, agent type
     * - Actions included in the agent
     * - Sub-agents included in the agent
     * - Prompt(s) for the agent
     * - Payload structure including input and output JSON example
     */
    TechnicalDesign?: string;

    // Stuff below here is metadata that goes directly into the AI Agents entity
    ID: string;
    Name: string;
    Description?: string;

    /**
     * Agent type ID - references MJ: AI Agent Types entity. Common values:
     * - Loop: for iterative, LLM-driven agents
     * - Flow: for deterministic, graph-based workflows
     */
    TypeID?: string;

    /**
     * Agent status - Active, Inactive, or Pending
     */
    Status?: 'Active' | 'Inactive' | 'Pending';

    /**
    * Font Awesome icon class (e.g., fa-robot, fa-brain) for the agent. Used as fallback when LogoURL is not set or fails to load.
    */
    IconClass?: string;

    /**
     * URL to an image file or base64 data URI (e.g., data:image/png;base64,...) for the agent logo. Takes precedence over IconClass in UI display.
     */
    LogoURL?: string;

    /**
     * Used only when this agent is a child sub-agent of another agent. Specifies the parent agent's ID.
     */
    ParentID?: string;

    /**
    * Optional override for the class name used by the MemberJunction class factory to instantiate this specific agent. If specified, this overrides the agent type's DriverClass. Useful for specialized agent implementations.
    */
    DriverClass?: string; 

    /**
    * Controls whether model selection is driven by the Agent Type's system prompt or the Agent's specific prompt. Default is Agent Type for backward compatibility.
    */
    ModelSelectionMode?: 'Agent' | 'Agent Type';
    
    /**
    * Array of paths that define which parts of the payload should be sent downstream to sub-agents. Use ["*"] to send entire payload, or specify paths like ["customer.id", "campaign.*", "analysis.sentiment"]
    */
    PayloadDownstreamPaths?: string[]; 

    /**
    * Array of paths that define which parts of the payload sub-agents are allowed to write back upstream. Use ["*"] to allow all writes, or specify paths like ["analysis.results", "recommendations.*"]
    */
    PayloadUpstreamPaths?: string[];

    /**
    * Array of paths that specify what parts of the payload the agent's own prompt can read. Controls downstream data flow when the agent executes its own prompt step.
    */
    PayloadSelfReadPaths?: string[]; 

    /**
    * Array of paths that specify what parts of the payload the agent's own prompt can write back. Controls upstream data flow when the agent executes its own prompt step.
    */
    PayloadSelfWritePaths?: string[];

    /**
    * Defines the scope/path within the parent payload that this sub-agent operates on. When set, the sub-agent receives only this portion of the payload and all change requests are relative to this scope. Format: /path/to/scope (e.g. /PropA/SubProp1)
    */
    PayloadScope?: string;

    /**
    * Optional JSON schema or requirements that define the expected structure and content of the agent's final payload. Used to validate the output when the agent declares success. Similar to OutputExample in AI Prompts.
    */
    FinalPayloadValidation?: string | null; 

    /**
    * Determines how to handle validation failures when FinalPayloadValidation is specified. Options: Retry (default) - retry the agent with validation feedback, Fail - fail the agent run immediately, Warn - log a warning but allow success.
    */
    FinalPayloadValidationMode?: 'Fail' | 'Retry' | 'Warn'; 

    /** 
    * Maximum number of retry attempts allowed when FinalPayloadValidation fails with Retry mode. After reaching this limit, the validation will fail permanently.
    */
    FinalPayloadValidationMaxRetries?: number;

    /**
    * Maximum cost in dollars allowed for a single agent run. Run will be terminated if this limit is exceeded.
    */
    MaxCostPerRun?: number | null;

    /**
    * Maximum total tokens (input + output) allowed for a single agent run. Run will be terminated if this limit is exceeded.
    */
    MaxTokensPerRun?: number | null; 

    /**
    * Maximum number of prompt iterations allowed for a single agent run. Run will be terminated if this limit is exceeded.
    */
    MaxIterationsPerRun?: number | null;

    /**
    * Maximum time in seconds allowed for a single agent run. Run will be terminated if this limit is exceeded.
    */
    MaxTimePerRun?: number;

    /**
    * When acting as a sub-agent, minimum number of times this agent must be executed per parent agent run
    */
    MinExecutionsPerRun?: number;

    /**
    * When acting as a sub-agent, maximum number of times this agent can be executed per parent agent run
    */
    MaxExecutionsPerRun?: number;

    /**
    * Optional JSON schema validation to apply to the input payload before agent execution begins. Uses the same JSONValidator format as FinalPayloadValidation.
    */
    StartingPayloadValidation?: string | null;
 
    /**
    * Determines how to handle StartingPayloadValidation failures. Fail = reject invalid input, Warn = log warning but proceed.
    */
    StartingPayloadValidationMode: 'Fail' | 'Warn';

    /**
    * Default effort level for all prompts executed by this agent (1-100, where 1=minimal effort, 100=maximum effort). Takes precedence over individual prompt EffortLevel settings but can be overridden by runtime parameters. Inherited by sub-agents unless explicitly overridden.
    */
    DefaultPromptEffortLevel?: number;

    /**
    * Controls how Chat next steps are handled. When null (default), Chat propagates to caller. When set to Success, Failed, or Retry, Chat steps are remapped to that value and re-validated.
    */
    ChatHandlingOption?: 'Failed' | 'Retry' | 'Success';

    /**
    * Default artifact type produced by this agent. This is the primary artifact type; additional artifact types can be linked via AIAgentArtifactType junction table. Can be NULL if agent does not produce artifacts by default.
    */
    DefaultArtifactTypeID?: string;
    
    /**
    * The user who owns and created this AI agent. Automatically set to the current user if not specified. Owner has full permissions (view, run, edit, delete) regardless of ACL entries.
    */
    OwnerUserID?: string;

    /**
    * Controls how the agent can be invoked: Any (default - can be top-level or sub-agent), Top-Level (only callable as primary agent), Sub-Agent (only callable as sub-agent). Used to filter available agents in tools like Sage.
    */
    InvocationMode?: 'Any' | 'Sub-Agent' | 'Top-Level';

    /**
     * Array of actions that are included within this agent
     */
    Actions?: Array<AgentActionSpec>;
    /**
     * Array of sub-agents that are included within this agent
     */
    SubAgents?: Array<SubAgentSpec>;

    /**
     * At least one prompt is mandatory for Loop agents, and prompts are optional for flow
     * agents
     */
    Prompts?: Array<AgentPromptSpec>;

    /**
     * For flow agents only, this defines the steps that make up the flow
     */
    Steps?: Array<AgentStep>;

    /**
     * For flow agents only, this defines the paths between steps
     */
    Paths?: Array<AgentStepPath>;
}

/**
 * Details of an action within an agent
 */
export interface AgentActionSpec {
    /**
     * The unique ID of the AIAgentAction record in the database
     */
    AgentActionID: string;
    /**
     * The unique ID of the Action that this agent action maps to
     */
    ActionID: string;

    /**
     * Status of Active means 
     */
    Status: 'Active' | 'Pending' | 'Revoked';

    /**
    * Maximum number of times this action can be executed per agent run
    */
    MaxExecutionsPerRun?: number; 

    /**
    * Description: Number of conversation turns before action results expire from conversation context. NULL = never expire (default). 0 = expire immediately after next turn.
    */
    ResultExpirationTurns?: number; 

    /**
    * How to handle expired action results: None (no expiration, default), Remove (delete message entirely), Compact (reduce size via CompactMode while preserving key information).
    */
    ResultExpirationMode?: 'Compact' | 'None' | 'Remove';

    /**
    * How to compact results when ResultExpirationMode=Compact: FirstNChars (truncate to CompactLength characters, fast and free), AISummary (use LLM to intelligently summarize with CompactPromptID or Action.DefaultCompactPromptID).
    */
    CompactMode?: 'AI Summary' | 'First N Chars';

    /**
    * Number of characters to keep when CompactMode=FirstNChars. Required when CompactMode is FirstNChars, ignored otherwise.
    */
    CompactLength?: number;

    /**
    * Optional override for AI summarization prompt when CompactMode=AISummary. Lookup hierarchy: this field -> Action.DefaultCompactPromptID -> system default. Allows agent-specific summarization focus (e.g., technical vs. marketing perspective).
    */
    CompactPromptID?: string | null; 
}

/**
 * Details of a sub-agent that is included within a parent agent. Sub-agents can either be 'child' agents
 * which have a direct parent-child relationship via ParentID, or 'related' agents which are linked via
 * the AIAgentRelationship table.
 */
export interface SubAgentSpec {
    /**
     * When Type == 'child' this means that the sub-agent has a ParentID set to the parent's ID, in comparison when Type=='related'
     * there is no ParentID relationship and instead the relationship is done via the AIAgentRelationship table where the AgentID and SubAgentID are
     * specified. Child sub-agents use the same paylaod structure as the parent and use PayloadDownstreamPaths and 
     * PayloadUpstreamPaths to define how data flows between the parent and child. Related agents do not have this relationship and instead
     * use SubAgentInputMapping, SubAgentOutputMapping and SubAgentContextPaths for mapping data from the parent agent
     * payload to the sub-agent for execution and back. 
     */
    Type: 'child' | 'related';

    SubAgent: AgentSpec;

    /**
     * Only used when type=='related'. This is the ID of the AIAgentRelationship that links the parent and sub-agent.
     */
    AgentRelationshipID?: string;
    /**
     * Used when type =='related', this defines how data from the parent agent's payload is mapped to the sub-agent's payload
     */
    SubAgentInputMapping?: Record<string, string>;
    /**
     * Used when type =='related', this defines how data from the sub-agent's payload is mapped back to the parent agent's payload
     */
    SubAgentOutputMapping?: Record<string, string>;
    /**
     * Used when type =='related', this defines data that does **not** go to the sub-agents payload but **instead** goes into a user message
     * that is shared with the sub-agent to add to its context during execution. If a sub-agent needs more info but it is semi-structured or just
     * doesn't fit the sub-agent's payload structure, this is where that info can go.
     */
    SubAgentContextPaths?: Record<string, string>;
}

/**
 * Details of a prompt within an agent
 */
export interface AgentPromptSpec {
    ID: string;
    PromptID: string;
    PromptName: string;
    PromptDescription: string;

    /**
     * Text that will end up going into the Prompt.TemplateText property
     */
    PromptText: string;

    /**
     * 
     */
    PromptTypeID: string; 

    /**
     * Optional configuration ID that specifies 
     * which AI configuration to use when executing 
     * this prompt.
     */
    ConfigurationID?: string;
}

/**
 * For flow agents, this defines a single step
 */
export interface AgentStep {
    ID: string;
    Name: string;
    Description?: string;
    StepType: 'Prompt' | 'Action' | 'Sub-Agent';
    /**
     * If this is the first step of the flow agent or not
     */
    StartingStep: boolean;

    ActionID?: string;
    SubAgentID?: string;
    PromptID?: string;
    PromptText?: string;
    PromptName?: string;
    PromptDescription?: string;

    ActionOutputMapping?: string;
    ActionInputMapping?: string;

    Paths?: Array<AgentStepPath>
}

export interface AgentStepPath {
    ID: string;
    OriginStepID: string;
    DestinationStepID: string;
    /**
     * Boolean expression to evaluate. If null, path is always taken. Evaluated against payload and step results.
     */
    Condition?: string;
    Description?: string;
    /**
     * Path evaluation priority. Higher values are evaluated first. Use 0 or negative values for default/fallback paths that execute when no other conditions match.
     */
    Priority: number;
}