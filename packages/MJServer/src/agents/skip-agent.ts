/**
 * Skip Proxy Agent
 *
 * A proxy agent that integrates Skip SaaS API into the MemberJunction agent framework.
 * This agent acts as a bridge, allowing Skip to be invoked like any other MJ agent
 * while maintaining compatibility with the existing Skip infrastructure.
 */

import { BaseAgent } from "@memberjunction/ai-agents";
import {
    ExecuteAgentParams,
    AgentConfiguration,
    BaseAgentNextStep
} from "@memberjunction/ai-core-plus";
import {
    SkipAPIResponse,
    SkipAPIAnalysisCompleteResponse,
    SkipAPIClarifyingQuestionResponse,
    SkipMessage
} from "@memberjunction/skip-types";
import { SkipSDK, SkipCallOptions } from "./skip-sdk.js";
import { DataContext } from "@memberjunction/data-context";
import { LogStatus, LogError, RunView, UserInfo } from "@memberjunction/core";
import { ChatMessage } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { ComponentSpec } from "@memberjunction/interactive-component-types";

/**
 * Context type for Skip agent execution
 */
export interface SkipAgentContext {
    /**
     * Optional data context ID to load
     */
    dataContextId?: string;

    /**
     * Optional pre-loaded data context
     */
    dataContext?: DataContext;

    /**
     * Conversation ID for tracking Skip conversations
     */
    conversationId?: string;

    /**
     * Force entity metadata refresh
     */
    forceEntityRefresh?: boolean;

    /**
     * Database connection (injected by caller)
     */
    dataSource?: any;
}

/**
 * Payload returned from Skip agent execution
 * Contains the full Skip API response for downstream consumers
 */
export interface SkipAgentPayload {
    /**
     * The full Skip API response
     */
    skipResponse: SkipAPIResponse;

    /**
     * Response phase from Skip
     */
    responsePhase: string;

    /**
     * Conversation ID
     */
    conversationId: string;

    /**
     * User-facing message (title or clarifying question)
     */
    message?: string;
}

/**
 * Skip Proxy Agent
 *
 * This agent provides a simple proxy to the Skip SaaS API, allowing Skip to be
 * invoked through the standard MJ agent framework. It handles:
 * - Converting MJ conversation messages to Skip format
 * - Streaming progress updates from Skip
 * - Mapping Skip responses to MJ agent next steps
 * - Returning full Skip responses in the payload
 */
@RegisterClass(BaseAgent, 'SkipProxyAgent')
export class SkipProxyAgent extends BaseAgent {
    private skipSDK: SkipSDK;

    constructor() {
        super();
        this.skipSDK = new SkipSDK();
    }

    /**
     * Execute the Skip agent - proxies to Skip SaaS API
     */
    protected override async executeAgentInternal<P = SkipAgentPayload>(
        params: ExecuteAgentParams<SkipAgentContext, P>,
        config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number; }> {

        LogStatus(`[SkipProxyAgent] Starting Skip agent execution`);

        // Extract context
        const context = params.context || {} as SkipAgentContext;
        const conversationId = params.data?.conversationId;

        if (!params.contextUser) {
            LogError('[SkipProxyAgent] contextUser is required');
            return {
                finalStep: {
                    terminate: true,
                    step: 'Failed',
                    message: 'Missing required contextUser',
                    errorMessage: 'Missing required contextUser'
                } as BaseAgentNextStep<P>,
                stepCount: 1
            };
        }

        // Load conversation messages from database if conversationId is provided
        // This ensures we get real UUIDs from MJConversationDetailEntity records
        let skipMessages: SkipMessage[];
        if (conversationId && params.contextUser) {
            skipMessages = await this.loadMessagesFromDatabase(conversationId, params.contextUser);
        } else {
            // Fallback to converting provided conversation messages
            skipMessages = this.convertMessagesToSkipFormat(params.conversationMessages || []);
        }

        // Prepare Skip SDK call options
        const skipOptions: SkipCallOptions = {
            payload: params.payload,
            messages: skipMessages,
            conversationId,
            dataContext: context.dataContext,
            requestPhase: 'initial_request', // Could be parameterized if needed
            contextUser: params.contextUser,
            dataSource: context.dataSource,
            includeEntities: true,
            includeQueries: true,
            includeNotes: true,
            includeRequests: false,
            forceEntityRefresh: context.forceEntityRefresh || false,
            includeCallbackAuth: true,
            onStatusUpdate: (message: string, responsePhase?: string) => {
                // Forward Skip status updates to MJ progress callback
                if (params.onProgress) {
                    params.onProgress({
                        step: 'prompt_execution', // Skip execution is essentially a prompt to an external service
                        message,
                        percentage: 0, // Skip doesn't provide percentage
                        metadata: {
                            conversationId,
                            responsePhase
                        }
                    });
                }
            }
        };

        // Call Skip API
        const result = await this.skipSDK.chat(skipOptions);

        // Handle Skip API errors
        if (!result.success || !result.response) {
            LogError(`[SkipProxyAgent] Skip API call failed: ${result.error}`);
            return {
                finalStep: {
                    terminate: true,
                    step: 'Failed',
                    message: 'Skip API call failed',
                    errorMessage: result.error
                } as BaseAgentNextStep<P>,
                stepCount: 1
            };
        }

        // Map Skip response to MJ agent next step
        const nextStep = this.mapSkipResponseToNextStep(result.response, conversationId);

        LogStatus(`[SkipProxyAgent] Skip execution completed with phase: ${result.responsePhase}`);

        return {
            finalStep: nextStep as BaseAgentNextStep<P>,
            stepCount: 1 // Skip is a single-step proxy
        };
    }

    /**
     * Load conversation messages from database with real UUIDs using MemberJunction's RunView pattern
     * This is the preferred method as it ensures all messages have proper conversationDetailIDs
     */
    private async loadMessagesFromDatabase(conversationId: string, contextUser: UserInfo): Promise<SkipMessage[]> {
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `ConversationID='${conversationId}'`,
                OrderBy: '__mj_CreatedAt ASC'
            }, contextUser);

            if (!result.Success) {
                throw new Error(`Failed to load conversation details: ${result.ErrorMessage}`);
            }

            const allMessages = (result.Results || []).map((r: any) => {
                // Map database role to Skip role
                const dbRole = (r.Role || '').trim().toLowerCase();
                const skipRole: 'user' | 'system' =
                    (dbRole === 'ai' || dbRole === 'system' || dbRole === 'assistant') ? 'system' : 'user';

                // For system messages, always send the raw Message from database
                // Skip Brain needs the full JSON response to extract component specs for modification
                // For user messages, use the message as-is
                const content = r.Message;

                const message: SkipMessage = {
                    content: content,
                    role: skipRole,
                    conversationDetailID: r.ID,
                    hiddenToUser: r.HiddenToUser,
                    userRating: r.UserRating,
                    userFeedback: r.UserFeedback,
                    reflectionInsights: r.ReflectionInsights,
                    summaryOfEarlierConveration: r.SummaryOfEarlierConversation,
                    createdAt: r.__mj_CreatedAt,
                    updatedAt: r.__mj_UpdatedAt,
                };
                return message;
            });

            // Find the index of the last user message
            // We only want to include messages up to and including the most recent user message
            // This filters out status messages and incomplete AI responses
            const lastUserMessageIndex = allMessages.reduce((lastIndex, msg, currentIndex) => {
                return msg.role === 'user' ? currentIndex : lastIndex;
            }, -1);

            if (lastUserMessageIndex === -1) {
                // No user messages found, return all messages (shouldn't happen in practice)
                return allMessages;
            }

            // Return messages up to and including the last user message
            return allMessages.slice(0, lastUserMessageIndex + 1);
        } catch (error) {
            LogError(`[SkipProxyAgent] Error loading messages from database: ${error}`);
            throw error;
        }
    }

    /**
     * Convert MJ ChatMessage format to Skip SkipMessage format
     * This is a fallback method when database loading is not available
     */
    private convertMessagesToSkipFormat(messages: ChatMessage[]): SkipMessage[] {
        return messages.map((msg, index) => {
            // Extract conversationDetailID from metadata if available
            const conversationDetailID = msg.metadata?.conversationDetailID || `temp-${index}`;

            return {
                // Skip only accepts 'user' or 'system' roles, map 'assistant' to 'system'
                role: (msg.role === 'assistant' ? 'system' : msg.role) as 'user' | 'system',
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                conversationDetailID,
                // Include other SkipMessage fields from metadata if available
                hiddenToUser: msg.metadata?.hiddenToUser,
                userRating: msg.metadata?.userRating,
                userFeedback: msg.metadata?.userFeedback,
                reflectionInsights: msg.metadata?.reflectionInsights,
                summaryOfEarlierConveration: msg.metadata?.summaryOfEarlierConversation,
                createdAt: msg.metadata?.createdAt,
                updatedAt: msg.metadata?.updatedAt
            };
        });
    }

    /**
     * Map Skip API response to MJ agent next step
     */
    private mapSkipResponseToNextStep(
        apiResponse: SkipAPIResponse,
        conversationId: string
    ): BaseAgentNextStep<ComponentSpec> {
      //return this.tempHack();

      switch (apiResponse.responsePhase) {
        case 'analysis_complete': {
            // Skip has completed analysis and returned results
            const completeResponse = apiResponse as SkipAPIAnalysisCompleteResponse;
            const componentSpec = completeResponse.componentOptions[0].option;
            // Filter on system message and get the last one
            const skipMessage = completeResponse.messages.filter(msg => msg.role === 'system').pop();
            return {
                terminate: true,
                step: 'Success',
                message: skipMessage?.content || completeResponse.title || 'Analysis complete',
                newPayload: componentSpec
            };
        }

        case 'clarifying_question': {
            // Skip needs more information from the user
            const clarifyResponse = apiResponse as SkipAPIClarifyingQuestionResponse;

            return {
                terminate: true,
                step: 'Chat',
                message: clarifyResponse.clarifyingQuestion,
                responseForm: clarifyResponse.responseForm,
                // Pass through payload for incremental artifact building (e.g., PRD in progress)
                // The client will render this as an artifact and pass it back in the next request
                newPayload: apiResponse.payload as any
            };
        }

        default: {
            // Unknown or unexpected response phase
            LogError(`[SkipProxyAgent] Unknown Skip response phase: ${apiResponse.responsePhase}`);
            return {
                terminate: true,
                step: 'Failed',
                message: `Unknown Skip response phase: ${apiResponse.responsePhase}`,
                errorMessage: `Unknown Skip response phase: ${apiResponse.responsePhase}`,
                newPayload: undefined
            };
        }
      }
    }

    private tempHack(): BaseAgentNextStep<SkipAgentPayload> {
        return {
            terminate: true,
            step: 'Success',
            message: "Demo Report (not real)",
            newPayload: demoSpecJson as unknown as SkipAgentPayload
        };
    }
}

const demoSpecJson = {
  "name": "EntityBrowser",
  "title": "Entity Browser",
  "description": "A comprehensive entity browser with multi-panel display showing entities in a grid or card view with a sliding details panel, collapsible filters, sorting, and entity record opening capability.",
  "type": "dashboard",
  "functionalRequirements": "## Entity Browser Requirements\n\n### Core Functionality\n- Display entities in a responsive grid or card layout based on user preference\n- Allow users to select view mode (grid vs card)\n- Click on an entity to slide in a details panel from the right\n- Show entity metadata including fields and relationships in the details panel\n- Provide a collapsible filter panel on the left side\n- Support sorting by multiple fields with visual indicators\n- Include a search bar for quick entity filtering\n- Provide an 'Open' button to trigger the OpenEntityRecord callback\n- Remember user's last selected entity and view preferences\n\n### UX Considerations\n- Smooth animations for panel transitions\n- Responsive design that works on different screen sizes\n- Loading states while fetching data\n- Empty states with helpful messages\n- Keyboard navigation support (arrow keys, tab, enter)\n- Visual feedback for hover and selection states\n- Maintain scroll position when switching between entities",
  "dataRequirements": {
    "mode": "views",
    "entities": [
      {
        "name": "Entities",
        "description": "Metadata about all entities in the system",
        "displayFields": [
          "ID",
          "Name",
          "DisplayName",
          "NameSuffix",
          "Description",
          "SchemaName",
          "BaseTable",
          "BaseView"
        ],
        "filterFields": [
          "SchemaName",
          "BaseTable"
        ],
        "sortFields": [
          "Name",
          "DisplayName"
        ],
        "fieldMetadata": [
          {
            "name": "ID",
            "sequence": 1,
            "defaultInView": false,
            "type": "uniqueidentifier",
            "allowsNull": false,
            "isPrimaryKey": true,
            "description": "Unique identifier for the entity"
          },
          {
            "name": "Name",
            "sequence": 2,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "System name of the entity"
          },
          {
            "name": "DisplayName",
            "sequence": 3,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": true,
            "isPrimaryKey": false,
            "description": "User-friendly display name for the entity"
          },
          {
            "name": "NameSuffix",
            "sequence": 4,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": true,
            "isPrimaryKey": false,
            "description": "Optional suffix appended to entity names for display purposes"
          },
          {
            "name": "Description",
            "sequence": 5,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": true,
            "isPrimaryKey": false,
            "description": "Description of the entity"
          },
          {
            "name": "SchemaName",
            "sequence": 6,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": true,
            "isPrimaryKey": false,
            "description": "Database schema name"
          },
          {
            "name": "BaseTable",
            "sequence": 7,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": true,
            "isPrimaryKey": false,
            "description": "Base table in the database"
          },
          {
            "name": "BaseView",
            "sequence": 8,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Base view used for the entity"
          }
        ],
        "permissionLevelNeeded": [
          "read"
        ],
        "usageContext": "Main entity list display and filtering"
      },
      {
        "name": "MJ: Entity Fields",
        "description": "Fields belonging to each entity",
        "displayFields": [
          "Name",
          "DisplayName",
          "Type",
          "Length",
          "AllowsNull",
          "IsPrimaryKey",
          "IsUnique"
        ],
        "filterFields": [
          "EntityID"
        ],
        "sortFields": [
          "Sequence",
          "Name"
        ],
        "fieldMetadata": [
          {
            "name": "EntityID",
            "sequence": 1,
            "defaultInView": false,
            "type": "uniqueidentifier",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Reference to parent entity"
          },
          {
            "name": "Name",
            "sequence": 2,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Field name"
          },
          {
            "name": "DisplayName",
            "sequence": 3,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": true,
            "isPrimaryKey": false,
            "description": "User-friendly field name"
          },
          {
            "name": "Type",
            "sequence": 4,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Data type of the field"
          },
          {
            "name": "Length",
            "sequence": 5,
            "defaultInView": true,
            "type": "int",
            "allowsNull": true,
            "isPrimaryKey": false,
            "description": "Maximum length for string fields"
          },
          {
            "name": "AllowsNull",
            "sequence": 6,
            "defaultInView": true,
            "type": "bit",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Whether field allows null values"
          },
          {
            "name": "IsPrimaryKey",
            "sequence": 7,
            "defaultInView": true,
            "type": "bit",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Whether field is part of primary key"
          },
          {
            "name": "IsUnique",
            "sequence": 8,
            "defaultInView": true,
            "type": "bit",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Whether field must be unique"
          },
          {
            "name": "Sequence",
            "sequence": 9,
            "defaultInView": false,
            "type": "int",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Display order of the field"
          }
        ],
        "permissionLevelNeeded": [
          "read"
        ],
        "usageContext": "Details panel to show entity fields"
      },
      {
        "name": "MJ: Entity Relationships",
        "description": "Relationships between entities",
        "displayFields": [
          "RelatedEntity",
          "Type",
          "DisplayName",
          "RelatedEntityJoinField"
        ],
        "filterFields": [
          "EntityID"
        ],
        "sortFields": [
          "Sequence",
          "RelatedEntity"
        ],
        "fieldMetadata": [
          {
            "name": "EntityID",
            "sequence": 1,
            "defaultInView": false,
            "type": "uniqueidentifier",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Reference to parent entity"
          },
          {
            "name": "RelatedEntity",
            "sequence": 2,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "The related entity in the relationship"
          },
          {
            "name": "Type",
            "sequence": 3,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Type of relationship (One to Many, Many to One, etc.)"
          },
          {
            "name": "DisplayName",
            "sequence": 4,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": true,
            "isPrimaryKey": false,
            "description": "User-friendly name for the relationship"
          },
          {
            "name": "RelatedEntityJoinField",
            "sequence": 5,
            "defaultInView": true,
            "type": "nvarchar",
            "allowsNull": true,
            "isPrimaryKey": false,
            "description": "The field in the related entity that joins to this entity"
          },
          {
            "name": "Sequence",
            "sequence": 6,
            "defaultInView": false,
            "type": "int",
            "allowsNull": false,
            "isPrimaryKey": false,
            "description": "Display order"
          }
        ],
        "permissionLevelNeeded": [
          "read"
        ],
        "usageContext": "Details panel to show entity relationships"
      }
    ],
    "queries": [],
    "description": "This component requires access to entity metadata including entities, their fields, and relationships to provide a comprehensive entity browsing experience"
  },
  "technicalDesign": "## Technical Architecture\n\n### Component Structure\n- **Root Component (EntityBrowser)**: Manages overall layout and state coordination\n- **EntityList (Child)**: Displays entities in grid/card view with sorting\n- **EntityDetails (Child)**: Sliding panel showing entity fields and relationships\n- **EntityFilter (Child)**: Collapsible filter panel with dynamic filters\n\n### State Management\n- Selected entity ID (persisted in savedUserSettings)\n- View mode (grid/card) (persisted)\n- Active filters (persisted)\n- Sort configuration (persisted)\n- Panel visibility states (details open, filters collapsed)\n- Search query\n- Loading states for async operations\n\n### Layout\n```\n+------------------+------------------------+------------------+\n|                  |                        |                  |\n|   Filter Panel   |    Entity Grid/Cards   |  Details Panel   |\n|   (Collapsible)  |    (Main Content)      |    (Sliding)     |\n|                  |                        |                  |\n|  [Schema Filter] |  +-----+  +-----+      |  Entity: Orders  |\n|  [Table Filter]  |  | Card |  | Card |     |                  |\n|  [Search Box]    |  +-----+  +-----+      |  Fields:         |\n|                  |                        |  - ID            |\n|  Sort By:        |  +-----+  +-----+      |  - CustomerID    |\n|  [Name ↓]        |  | Card |  | Card |     |  - OrderDate     |\n|                  |  +-----+  +-----+      |                  |\n|                  |                        |  Relationships:  |\n|                  |                        |  → Customers     |\n|                  |                        |  → OrderItems    |\n|                  |                        |                  |\n|                  |                        |  [Open Record]   |\n+------------------+------------------------+------------------+\n```\n\n### Data Flow\n1. Root component loads entities on mount\n2. Passes entity data to EntityList\n3. EntityList handles selection and passes selectedId up\n4. Root loads fields/relationships for selected entity\n5. Passes detailed data to EntityDetails\n6. Filter changes trigger data reload\n7. All user preferences saved via onSaveUserSettings\n\n### Interaction Patterns\n- Click entity card → Select and open details\n- Click filter → Apply and reload data\n- Click sort → Update sort and reload\n- Click 'Open' → Trigger OpenEntityRecord callback\n- Press Escape → Close details panel\n- Click outside → Close details panel",
  "properties": [],
  "events": [],
  "exampleUsage": "<EntityBrowser\n  utilities={utilities}\n  styles={styles}\n  components={components}\n  callbacks={callbacks}\n  savedUserSettings={savedUserSettings}\n  onSaveUserSettings={onSaveUserSettings}\n/>",
  "dependencies": [
    {
      "name": "EntityList",
      "title": "Entity List",
      "description": "Displays entities in a grid or card layout with sorting capabilities",
      "type": "table",
      "functionalRequirements": "## Entity List Requirements\n\n- Display entities in grid or card view based on viewMode prop\n- Support sorting by multiple fields\n- Handle entity selection and notify parent\n- Show loading state while data loads\n- Display record count badges\n- Highlight selected entity\n- Support keyboard navigation",
      "dataRequirements": {
        "mode": "views",
        "entities": [
          {
            "name": "Entities",
            "description": "Metadata about all entities in the system",
            "displayFields": [
              "ID",
              "Name",
              "DisplayName",
              "NameSuffix",
              "Description",
              "SchemaName",
              "BaseTable",
              "BaseView"
            ],
            "filterFields": [
              "SchemaName",
              "BaseTable"
            ],
            "sortFields": [
              "Name",
              "DisplayName"
            ],
            "fieldMetadata": [
              {
                "name": "ID",
                "sequence": 1,
                "defaultInView": false,
                "type": "uniqueidentifier",
                "allowsNull": false,
                "isPrimaryKey": true,
                "description": "Unique identifier for the entity"
              },
              {
                "name": "Name",
                "sequence": 2,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "System name of the entity"
              },
              {
                "name": "DisplayName",
                "sequence": 3,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "User-friendly display name for the entity"
              },
              {
                "name": "NameSuffix",
                "sequence": 4,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Optional suffix appended to entity names for display purposes"
              },
              {
                "name": "Description",
                "sequence": 5,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Description of the entity"
              },
              {
                "name": "SchemaName",
                "sequence": 6,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Database schema name"
              },
              {
                "name": "BaseTable",
                "sequence": 7,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Base table in the database"
              },
              {
                "name": "BaseView",
                "sequence": 8,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Base view used for the entity"
              }
            ],
            "permissionLevelNeeded": [
              "read"
            ],
            "usageContext": "Main entity list display and filtering"
          },
          {
            "name": "MJ: Entity Fields",
            "description": "Fields belonging to each entity",
            "displayFields": [
              "Name",
              "DisplayName",
              "Type",
              "Length",
              "AllowsNull",
              "IsPrimaryKey",
              "IsUnique"
            ],
            "filterFields": [
              "EntityID"
            ],
            "sortFields": [
              "Sequence",
              "Name"
            ],
            "fieldMetadata": [
              {
                "name": "EntityID",
                "sequence": 1,
                "defaultInView": false,
                "type": "uniqueidentifier",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Reference to parent entity"
              },
              {
                "name": "Name",
                "sequence": 2,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Field name"
              },
              {
                "name": "DisplayName",
                "sequence": 3,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "User-friendly field name"
              },
              {
                "name": "Type",
                "sequence": 4,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Data type of the field"
              },
              {
                "name": "Length",
                "sequence": 5,
                "defaultInView": true,
                "type": "int",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Maximum length for string fields"
              },
              {
                "name": "AllowsNull",
                "sequence": 6,
                "defaultInView": true,
                "type": "bit",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Whether field allows null values"
              },
              {
                "name": "IsPrimaryKey",
                "sequence": 7,
                "defaultInView": true,
                "type": "bit",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Whether field is part of primary key"
              },
              {
                "name": "IsUnique",
                "sequence": 8,
                "defaultInView": true,
                "type": "bit",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Whether field must be unique"
              },
              {
                "name": "Sequence",
                "sequence": 9,
                "defaultInView": false,
                "type": "int",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Display order of the field"
              }
            ],
            "permissionLevelNeeded": [
              "read"
            ],
            "usageContext": "Details panel to show entity fields"
          },
          {
            "name": "MJ: Entity Relationships",
            "description": "Relationships between entities",
            "displayFields": [
              "RelatedEntity",
              "Type",
              "DisplayName",
              "RelatedEntityJoinField"
            ],
            "filterFields": [
              "EntityID"
            ],
            "sortFields": [
              "Sequence",
              "RelatedEntity"
            ],
            "fieldMetadata": [
              {
                "name": "EntityID",
                "sequence": 1,
                "defaultInView": false,
                "type": "uniqueidentifier",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Reference to parent entity"
              },
              {
                "name": "RelatedEntity",
                "sequence": 2,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "The related entity in the relationship"
              },
              {
                "name": "Type",
                "sequence": 3,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Type of relationship (One to Many, Many to One, etc.)"
              },
              {
                "name": "DisplayName",
                "sequence": 4,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "User-friendly name for the relationship"
              },
              {
                "name": "RelatedEntityJoinField",
                "sequence": 5,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "The field in the related entity that joins to this entity"
              },
              {
                "name": "Sequence",
                "sequence": 6,
                "defaultInView": false,
                "type": "int",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Display order"
              }
            ],
            "permissionLevelNeeded": [
              "read"
            ],
            "usageContext": "Details panel to show entity relationships"
          }
        ],
        "queries": [],
        "description": "This component requires access to entity metadata including entities, their fields, and relationships to provide a comprehensive entity browsing experience"
      },
      "technicalDesign": "## Technical Design\n\n### Props\n- entities: Array of entity objects\n- viewMode: 'grid' | 'card'\n- selectedEntityId: Currently selected entity\n- onSelectEntity: Callback when entity selected\n- sortBy: Current sort field\n- sortDirection: 'asc' | 'desc'\n- onSortChange: Callback for sort changes\n\n### Rendering\n- Grid mode: Compact table with columns\n- Card mode: Cards with entity info\n- Sort indicators in headers\n- Selection highlighting",
      "properties": [
        {
          "name": "entities",
          "description": "Array of entity objects to display",
          "type": "array",
          "required": true
        },
        {
          "name": "viewMode",
          "description": "Display mode - grid or card view",
          "type": "string",
          "required": true,
          "possibleValues": [
            "grid",
            "card"
          ]
        },
        {
          "name": "selectedEntityId",
          "description": "ID of the currently selected entity",
          "type": "string",
          "required": true
        },
        {
          "name": "onSelectEntity",
          "description": "Callback when an entity is selected",
          "type": "function",
          "required": true
        },
        {
          "name": "sortBy",
          "description": "Field to sort by",
          "type": "string",
          "required": true,
          "defaultValue": "Name"
        },
        {
          "name": "sortDirection",
          "description": "Sort direction",
          "type": "string",
          "required": true,
          "defaultValue": "asc",
          "possibleValues": [
            "asc",
            "desc"
          ]
        },
        {
          "name": "onSortChange",
          "description": "Callback when sort changes",
          "type": "function",
          "required": true
        }
      ],
      "events": [
        {
          "name": "onSelectEntity",
          "description": "Fired when an entity is selected",
          "parameters": [
            {
              "name": "entityId",
              "description": "ID of the selected entity",
              "type": "string"
            }
          ]
        },
        {
          "name": "onSortChange",
          "description": "Fired when sort configuration changes",
          "parameters": [
            {
              "name": "sortBy",
              "description": "Field to sort by",
              "type": "string"
            },
            {
              "name": "sortDirection",
              "description": "Sort direction",
              "type": "string"
            }
          ]
        }
      ],
      "exampleUsage": "<EntityList\n  entities={entities}\n  viewMode={viewMode}\n  selectedEntityId={selectedEntityId}\n  onSelectEntity={handleSelectEntity}\n  sortBy={sortBy}\n  sortDirection={sortDirection}\n  onSortChange={handleSortChange}\n  utilities={utilities}\n  styles={styles}\n  components={components}\n  callbacks={callbacks}\n/>",
      "code": "function EntityList({\n  entities,\n  viewMode,\n  selectedEntityId,\n  onSelectEntity,\n  sortBy,\n  sortDirection,\n  onSortChange,\n  utilities,\n  styles,\n  components,\n  callbacks,\n  savedUserSettings,\n  onSaveUserSettings\n}) {\n  // Load DataGrid component from registry\n  const DataGrid = components['DataGrid'];\n\n  // Helper function to get border radius value\n  const getBorderRadius = (size) => {\n    return typeof styles.borders.radius === 'object' ? styles.borders.radius[size] : styles.borders.radius;\n  };\n\n  // Handle entity selection\n  const handleEntityClick = useCallback((entityId) => {\n    onSelectEntity?.(entityId);\n  }, [onSelectEntity]);\n\n  // Define columns for DataGrid\n  const gridColumns = [\n    {\n      field: 'Name',\n      header: 'Name',\n      sortable: true,\n      width: '150px'\n    },\n    {\n      field: 'DisplayName',\n      header: 'Display Name',\n      sortable: true,\n      width: '150px',\n      render: (value, row) => value || row.Name\n    },\n    {\n      field: 'Description',\n      header: 'Description',\n      sortable: false,\n      width: '300px',\n      render: (value) => value || '-'\n    },\n    {\n      field: 'SchemaName',\n      header: 'Schema',\n      sortable: false,\n      width: '120px',\n      render: (value) => value || '-'\n    },\n    {\n      field: 'BaseTable',\n      header: 'Table',\n      sortable: false,\n      width: '150px',\n      render: (value) => value || '-'\n    },\n    {\n      field: 'BaseView',\n      header: 'Base View',\n      sortable: false,\n      width: '150px',\n      render: (value) => value || '-'\n    }\n  ];\n\n  // Handle row click to open entity details\n  const handleRowClick = useCallback((row) => {\n    // When a row is clicked, select the entity and open its details\n    handleEntityClick(row.ID);\n  }, [handleEntityClick]);\n\n  // Grid View\n  if (viewMode === 'grid') {\n    return (\n      <div style={{\n        width: '100%',\n        overflowX: 'auto'\n      }}>\n        {DataGrid ? (\n          <DataGrid\n            data={entities}\n            columns={gridColumns}\n            pageSize={50}\n            showFilters={true}\n            showExport={false}\n            selectionMode=\"none\"  // Disable selection mode since we're using row clicks\n            onRowClick={handleRowClick}  // Handle row clicks to open the entity\n            sortBy={sortBy}\n            sortDirection={sortDirection}\n            onSortChange={onSortChange}\n            utilities={utilities}\n            styles={styles}\n            components={components}\n            callbacks={callbacks}\n            savedUserSettings={savedUserSettings}\n            onSaveUserSettings={onSaveUserSettings}\n          />\n        ) : (\n          <div style={{\n            padding: styles.spacing.lg,\n            textAlign: 'center',\n            color: styles.colors.textSecondary\n          }}>\n            DataGrid component not available\n          </div>\n        )}\n      </div>\n    );\n  }\n  \n  // Card View\n  return (\n    <div style={{\n      display: 'grid',\n      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',\n      gap: styles.spacing.lg\n    }}>\n      {entities.map((entity) => (\n        <div\n          key={entity.ID}\n          onClick={() => handleEntityClick(entity.ID)}\n          style={{\n            padding: styles.spacing.lg,\n            backgroundColor: selectedEntityId === entity.ID \n              ? styles.colors.primary + '20'\n              : styles.colors.surface,\n            border: selectedEntityId === entity.ID\n              ? `2px solid ${styles.colors.primary}`\n              : `1px solid ${styles.colors.border}`,\n            borderRadius: getBorderRadius('md'),\n            cursor: 'pointer',\n            transition: 'all 0.2s',\n            position: 'relative'\n          }}\n          onMouseEnter={(e) => {\n            if (selectedEntityId !== entity.ID) {\n              e.currentTarget.style.transform = 'translateY(-2px)';\n              e.currentTarget.style.boxShadow = `0 4px 12px ${styles.colors.shadow || 'rgba(0, 0, 0, 0.1)'}`;\n            }\n          }}\n          onMouseLeave={(e) => {\n            if (selectedEntityId !== entity.ID) {\n              e.currentTarget.style.transform = 'translateY(0)';\n              e.currentTarget.style.boxShadow = 'none';\n            }\n          }}\n        >\n          {/* Card Header */}\n          <div style={{\n            marginBottom: styles.spacing.md,\n            paddingBottom: styles.spacing.md,\n            borderBottom: `1px solid ${styles.colors.borderLight || styles.colors.border}`\n          }}>\n            <h3 style={{\n              margin: 0,\n              fontSize: styles.typography.fontSize.lg,\n              fontWeight: styles.typography.fontWeight?.semibold || '600',\n              color: styles.colors.text,\n              marginBottom: styles.spacing.xs\n            }}>\n              {entity.DisplayName || entity.Name}\n            </h3>\n            {entity.DisplayName && entity.DisplayName !== entity.Name && (\n              <div style={{\n                fontSize: styles.typography.fontSize.sm,\n                color: styles.colors.textSecondary\n              }}>\n                {entity.Name}\n              </div>\n            )}\n          </div>\n          \n          {/* Card Body */}\n          {entity.Description && (\n            <p style={{\n              margin: 0,\n              marginBottom: styles.spacing.md,\n              fontSize: styles.typography.fontSize.md,\n              color: styles.colors.textSecondary,\n              lineHeight: 1.5,\n              display: '-webkit-box',\n              WebkitLineClamp: 2,\n              WebkitBoxOrient: 'vertical',\n              overflow: 'hidden'\n            }}>\n              {entity.Description}\n            </p>\n          )}\n          \n          {/* Card Footer */}\n          <div style={{\n            display: 'flex',\n            justifyContent: 'space-between',\n            alignItems: 'center',\n            fontSize: styles.typography.fontSize.sm,\n            color: styles.colors.textSecondary\n          }}>\n            <div>\n              {entity.SchemaName && (\n                <span style={{ marginRight: styles.spacing.md }}>\n                  Schema: <strong>{entity.SchemaName}</strong>\n                </span>\n              )}\n              {entity.BaseTable && (\n                <span>\n                  Table: <strong>{entity.BaseTable}</strong>\n                </span>\n              )}\n            </div>\n            {entity.BaseView && (\n              <div style={{\n                fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                color: styles.colors.textSecondary\n              }}>\n                View: {entity.BaseView}\n              </div>\n            )}\n          </div>\n          \n          {/* Selection Indicator */}\n          {selectedEntityId === entity.ID && (\n            <div style={{\n              position: 'absolute',\n              top: styles.spacing.sm,\n              right: styles.spacing.sm,\n              width: '8px',\n              height: '8px',\n              backgroundColor: styles.colors.primary,\n              borderRadius: '50%'\n            }} />\n          )}\n        </div>\n      ))}\n    </div>\n  );\n}",
      "dependencies": [
        {
          "name": "DataGrid",
          "location": "registry",
          "namespace": "Generic/UI/Table",
          "version": "^1.0.0"
        }
      ],
      "libraries": []
    },
    {
      "name": "EntityDetails",
      "title": "Entity Details Panel",
      "description": "Sliding panel that displays detailed information about a selected entity including fields and relationships",
      "type": "form",
      "functionalRequirements": "## Entity Details Requirements\n\n- Slide in from the right when an entity is selected\n- Display entity metadata at the top\n- Show fields in a formatted table\n- Display relationships with icons\n- Include 'Open Record' button\n- Support closing via X button or Escape key\n- Smooth slide animation\n- Scrollable content area",
      "technicalDesign": "## Technical Design\n\n### Props\n- entity: Selected entity object\n- fields: Array of entity fields\n- relationships: Array of entity relationships\n- isOpen: Whether panel is visible\n- onClose: Callback to close panel\n- onOpenRecord: Callback to open entity record\n\n### Layout\n- Fixed position overlay\n- Slide animation using transform\n- Header with entity name and close button\n- Sections for metadata, fields, relationships\n- Sticky 'Open Record' button at bottom",
      "dataRequirements": {
        "mode": "views",
        "entities": [
          {
            "name": "Entities",
            "description": "Metadata about all entities in the system",
            "displayFields": [
              "ID",
              "Name",
              "DisplayName",
              "NameSuffix",
              "Description",
              "SchemaName",
              "BaseTable",
              "BaseView"
            ],
            "filterFields": [
              "SchemaName",
              "BaseTable"
            ],
            "sortFields": [
              "Name",
              "DisplayName"
            ],
            "fieldMetadata": [
              {
                "name": "ID",
                "sequence": 1,
                "defaultInView": false,
                "type": "uniqueidentifier",
                "allowsNull": false,
                "isPrimaryKey": true,
                "description": "Unique identifier for the entity"
              },
              {
                "name": "Name",
                "sequence": 2,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "System name of the entity"
              },
              {
                "name": "DisplayName",
                "sequence": 3,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "User-friendly display name for the entity"
              },
              {
                "name": "NameSuffix",
                "sequence": 4,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Optional suffix appended to entity names for display purposes"
              },
              {
                "name": "Description",
                "sequence": 5,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Description of the entity"
              },
              {
                "name": "SchemaName",
                "sequence": 6,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Database schema name"
              },
              {
                "name": "BaseTable",
                "sequence": 7,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Base table in the database"
              },
              {
                "name": "BaseView",
                "sequence": 8,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Base view used for the entity"
              }
            ],
            "permissionLevelNeeded": [
              "read"
            ],
            "usageContext": "Main entity list display and filtering"
          },
          {
            "name": "MJ: Entity Fields",
            "description": "Fields belonging to each entity",
            "displayFields": [
              "Name",
              "DisplayName",
              "Type",
              "Length",
              "AllowsNull",
              "IsPrimaryKey",
              "IsUnique"
            ],
            "filterFields": [
              "EntityID"
            ],
            "sortFields": [
              "Sequence",
              "Name"
            ],
            "fieldMetadata": [
              {
                "name": "EntityID",
                "sequence": 1,
                "defaultInView": false,
                "type": "uniqueidentifier",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Reference to parent entity"
              },
              {
                "name": "Name",
                "sequence": 2,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Field name"
              },
              {
                "name": "DisplayName",
                "sequence": 3,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "User-friendly field name"
              },
              {
                "name": "Type",
                "sequence": 4,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Data type of the field"
              },
              {
                "name": "Length",
                "sequence": 5,
                "defaultInView": true,
                "type": "int",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "Maximum length for string fields"
              },
              {
                "name": "AllowsNull",
                "sequence": 6,
                "defaultInView": true,
                "type": "bit",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Whether field allows null values"
              },
              {
                "name": "IsPrimaryKey",
                "sequence": 7,
                "defaultInView": true,
                "type": "bit",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Whether field is part of primary key"
              },
              {
                "name": "IsUnique",
                "sequence": 8,
                "defaultInView": true,
                "type": "bit",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Whether field must be unique"
              },
              {
                "name": "Sequence",
                "sequence": 9,
                "defaultInView": false,
                "type": "int",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Display order of the field"
              }
            ],
            "permissionLevelNeeded": [
              "read"
            ],
            "usageContext": "Details panel to show entity fields"
          },
          {
            "name": "MJ: Entity Relationships",
            "description": "Relationships between entities",
            "displayFields": [
              "RelatedEntity",
              "Type",
              "DisplayName",
              "RelatedEntityJoinField"
            ],
            "filterFields": [
              "EntityID"
            ],
            "sortFields": [
              "Sequence",
              "RelatedEntity"
            ],
            "fieldMetadata": [
              {
                "name": "EntityID",
                "sequence": 1,
                "defaultInView": false,
                "type": "uniqueidentifier",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Reference to parent entity"
              },
              {
                "name": "RelatedEntity",
                "sequence": 2,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "The related entity in the relationship"
              },
              {
                "name": "Type",
                "sequence": 3,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Type of relationship (One to Many, Many to One, etc.)"
              },
              {
                "name": "DisplayName",
                "sequence": 4,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "User-friendly name for the relationship"
              },
              {
                "name": "RelatedEntityJoinField",
                "sequence": 5,
                "defaultInView": true,
                "type": "nvarchar",
                "allowsNull": true,
                "isPrimaryKey": false,
                "description": "The field in the related entity that joins to this entity"
              },
              {
                "name": "Sequence",
                "sequence": 6,
                "defaultInView": false,
                "type": "int",
                "allowsNull": false,
                "isPrimaryKey": false,
                "description": "Display order"
              }
            ],
            "permissionLevelNeeded": [
              "read"
            ],
            "usageContext": "Details panel to show entity relationships"
          }
        ],
        "queries": [],
        "description": "This component requires access to entity metadata including entities, their fields, and relationships to provide a comprehensive entity browsing experience"
      },
      "properties": [
        {
          "name": "entity",
          "description": "The selected entity object",
          "type": "object",
          "required": true
        },
        {
          "name": "fields",
          "description": "Array of fields for the entity",
          "type": "array",
          "required": true,
          "defaultValue": []
        },
        {
          "name": "relationships",
          "description": "Array of relationships for the entity",
          "type": "array",
          "required": true,
          "defaultValue": []
        },
        {
          "name": "isOpen",
          "description": "Whether the panel is open",
          "type": "boolean",
          "required": true
        },
        {
          "name": "onClose",
          "description": "Callback to close the panel",
          "type": "function",
          "required": true
        },
        {
          "name": "onOpenRecord",
          "description": "Callback to open the entity record",
          "type": "function",
          "required": true
        }
      ],
      "events": [
        {
          "name": "onClose",
          "description": "Fired when the panel should close",
          "parameters": []
        },
        {
          "name": "onOpenRecord",
          "description": "Fired when the open record button is clicked",
          "parameters": [
            {
              "name": "entityName",
              "description": "Name of the entity to open",
              "type": "string"
            }
          ]
        }
      ],
      "exampleUsage": "<EntityDetails\n  entity={selectedEntity}\n  fields={entityFields}\n  relationships={entityRelationships}\n  isOpen={detailsPanelOpen}\n  onClose={handleCloseDetails}\n  onOpenRecord={handleOpenRecord}\n  utilities={utilities}\n  styles={styles}\n  components={components}\n  callbacks={callbacks}\n/>",
      "code": "function EntityDetails({ \n  entity, \n  fields, \n  relationships, \n  isOpen, \n  onClose, \n  onOpenRecord,\n  utilities, \n  styles, \n  components, \n  callbacks, \n  savedUserSettings, \n  onSaveUserSettings \n}) {\n  // Helper function to get border radius value\n  const getBorderRadius = (size) => {\n    return typeof styles.borders.radius === 'object' ? styles.borders.radius[size] : styles.borders.radius;\n  };\n  \n  // Handle escape key to close panel\n  useEffect(() => {\n    const handleEscape = (e) => {\n      if (e.key === 'Escape' && isOpen) {\n        onClose?.();\n      }\n    };\n    \n    document.addEventListener('keydown', handleEscape);\n    return () => document.removeEventListener('keydown', handleEscape);\n  }, [isOpen, onClose]);\n  \n  // Load OpenRecordButton component\n  const OpenRecordButton = components['OpenRecordButton'];\n  \n  // Render field type badge\n  const renderFieldType = (type) => {\n    const typeColors = {\n      'nvarchar': styles.colors.info || styles.colors.primary,\n      'varchar': styles.colors.info || styles.colors.primary,\n      'int': styles.colors.success || styles.colors.primary,\n      'bigint': styles.colors.success || styles.colors.primary,\n      'decimal': styles.colors.success || styles.colors.primary,\n      'float': styles.colors.success || styles.colors.primary,\n      'bit': styles.colors.warning || styles.colors.secondary,\n      'datetime': styles.colors.secondary,\n      'uniqueidentifier': styles.colors.primary,\n      'text': styles.colors.info || styles.colors.primary,\n      'ntext': styles.colors.info || styles.colors.primary\n    };\n    \n    const color = typeColors[type?.toLowerCase()] || styles.colors.textSecondary;\n    \n    return (\n      <span style={{\n        display: 'inline-block',\n        padding: `${styles.spacing.xs} ${styles.spacing.sm}`,\n        backgroundColor: color + '15',\n        color: color,\n        borderRadius: getBorderRadius('sm'),\n        fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n        fontWeight: styles.typography.fontWeight?.medium || '500'\n      }}>\n        {type}\n      </span>\n    );\n  };\n  \n  // Render relationship type icon\n  const renderRelationshipIcon = (type) => {\n    const icons = {\n      'One to Many': '1:N',\n      'Many to One': 'N:1',\n      'Many to Many': 'N:N',\n      'One to One': '1:1'\n    };\n    \n    return (\n      <span style={{\n        display: 'inline-block',\n        padding: `${styles.spacing.xs} ${styles.spacing.sm}`,\n        backgroundColor: styles.colors.primary + '15',\n        color: styles.colors.primary,\n        borderRadius: getBorderRadius('sm'),\n        fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n        fontWeight: styles.typography.fontWeight?.bold || '700',\n        fontFamily: 'monospace'\n      }}>\n        {icons[type] || type}\n      </span>\n    );\n  };\n  \n  return (\n    <>\n      {/* Backdrop */}\n      {isOpen && (\n        <div\n          onClick={onClose}\n          style={{\n            position: 'fixed',\n            top: 0,\n            left: 0,\n            right: 0,\n            bottom: 0,\n            backgroundColor: 'rgba(0, 0, 0, 0.3)',\n            zIndex: 99999,\n            opacity: isOpen ? 1 : 0,\n            transition: 'opacity 0.3s',\n            pointerEvents: isOpen ? 'auto' : 'none'\n          }}\n        />\n      )}\n      \n      {/* Panel */}\n      <div style={{\n        position: 'fixed',\n        top: '75px',\n        right: 0,\n        bottom: 0,\n        width: '480px',\n        backgroundColor: styles.colors.background,\n        boxShadow: isOpen ? `-4px 0 24px ${styles.colors.shadow || 'rgba(0, 0, 0, 0.1)'}` : 'none',\n        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',\n        transition: 'transform 0.3s ease-out',\n        zIndex: 100000,\n        display: 'flex',\n        flexDirection: 'column',\n        overflow: 'hidden'\n      }}>\n        {/* Header */}\n        <div style={{\n          padding: styles.spacing.lg,\n          borderBottom: `1px solid ${styles.colors.border}`,\n          backgroundColor: styles.colors.surface\n        }}>\n          <div style={{\n            display: 'flex',\n            justifyContent: 'space-between',\n            alignItems: 'flex-start'\n          }}>\n            <div style={{ flex: 1 }}>\n              <h2 style={{\n                margin: 0,\n                fontSize: styles.typography.fontSize.xl,\n                fontWeight: styles.typography.fontWeight?.bold || '700',\n                color: styles.colors.text,\n                marginBottom: styles.spacing.xs\n              }}>\n                {entity?.DisplayName || entity?.Name || 'No Entity Selected'}\n              </h2>\n              {entity?.DisplayName && entity?.Name && entity.DisplayName !== entity.Name && (\n                <div style={{\n                  fontSize: styles.typography.fontSize.sm,\n                  color: styles.colors.textSecondary,\n                  fontFamily: 'monospace'\n                }}>\n                  {entity.Name}\n                </div>\n              )}\n            </div>\n            <button\n              onClick={onClose}\n              style={{\n                width: '32px',\n                height: '32px',\n                borderRadius: getBorderRadius('sm'),\n                border: 'none',\n                backgroundColor: 'transparent',\n                color: styles.colors.textSecondary,\n                fontSize: styles.typography.fontSize.lg,\n                cursor: 'pointer',\n                display: 'flex',\n                alignItems: 'center',\n                justifyContent: 'center',\n                transition: 'background-color 0.2s'\n              }}\n              onMouseEnter={(e) => {\n                e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;\n              }}\n              onMouseLeave={(e) => {\n                e.currentTarget.style.backgroundColor = 'transparent';\n              }}\n            >\n              ✕\n            </button>\n          </div>\n        </div>\n        \n        {/* Content */}\n        <div style={{\n          flex: 1,\n          overflow: 'auto',\n          padding: styles.spacing.lg\n        }}>\n          {entity ? (\n            <>\n              {/* Entity Metadata */}\n              {entity.Description && (\n                <div style={{\n                  marginBottom: styles.spacing.xl,\n                  padding: styles.spacing.md,\n                  backgroundColor: styles.colors.surface,\n                  borderRadius: getBorderRadius('md'),\n                  borderLeft: `3px solid ${styles.colors.primary}`\n                }}>\n                  <div style={{\n                    fontSize: styles.typography.fontSize.md,\n                    color: styles.colors.textSecondary,\n                    lineHeight: 1.6\n                  }}>\n                    {entity.Description}\n                  </div>\n                </div>\n              )}\n              \n              {/* Quick Info */}\n              <div style={{\n                display: 'grid',\n                gridTemplateColumns: 'repeat(2, 1fr)',\n                gap: styles.spacing.md,\n                marginBottom: styles.spacing.xl\n              }}>\n                <div style={{\n                  padding: styles.spacing.md,\n                  backgroundColor: styles.colors.surface,\n                  borderRadius: getBorderRadius('sm')\n                }}>\n                  <div style={{\n                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                    color: styles.colors.textSecondary,\n                    marginBottom: styles.spacing.xs\n                  }}>\n                    Schema\n                  </div>\n                  <div style={{\n                    fontSize: styles.typography.fontSize.md,\n                    fontWeight: styles.typography.fontWeight?.semibold || '600',\n                    color: styles.colors.text\n                  }}>\n                    {entity.SchemaName || '-'}\n                  </div>\n                </div>\n                <div style={{\n                  padding: styles.spacing.md,\n                  backgroundColor: styles.colors.surface,\n                  borderRadius: getBorderRadius('sm')\n                }}>\n                  <div style={{\n                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                    color: styles.colors.textSecondary,\n                    marginBottom: styles.spacing.xs\n                  }}>\n                    Base Table\n                  </div>\n                  <div style={{\n                    fontSize: styles.typography.fontSize.md,\n                    fontWeight: styles.typography.fontWeight?.semibold || '600',\n                    color: styles.colors.text\n                  }}>\n                    {entity.BaseTable || '-'}\n                  </div>\n                </div>\n                <div style={{\n                  padding: styles.spacing.md,\n                  backgroundColor: styles.colors.surface,\n                  borderRadius: getBorderRadius('sm')\n                }}>\n                  <div style={{\n                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                    color: styles.colors.textSecondary,\n                    marginBottom: styles.spacing.xs\n                  }}>\n                    Base View\n                  </div>\n                  <div style={{\n                    fontSize: styles.typography.fontSize.md,\n                    fontWeight: styles.typography.fontWeight?.semibold || '600',\n                    color: styles.colors.text\n                  }}>\n                    {entity.BaseView || '-'}\n                  </div>\n                </div>\n                <div style={{\n                  padding: styles.spacing.md,\n                  backgroundColor: styles.colors.surface,\n                  borderRadius: getBorderRadius('sm')\n                }}>\n                  <div style={{\n                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                    color: styles.colors.textSecondary,\n                    marginBottom: styles.spacing.xs\n                  }}>\n                    Field Count\n                  </div>\n                  <div style={{\n                    fontSize: styles.typography.fontSize.md,\n                    fontWeight: styles.typography.fontWeight?.semibold || '600',\n                    color: styles.colors.text\n                  }}>\n                    {fields?.length || 0}\n                  </div>\n                </div>\n              </div>\n              \n              {/* Fields Section */}\n              <div style={{ marginBottom: styles.spacing.xl }}>\n                <h3 style={{\n                  margin: 0,\n                  marginBottom: styles.spacing.md,\n                  fontSize: styles.typography.fontSize.lg,\n                  fontWeight: styles.typography.fontWeight?.semibold || '600',\n                  color: styles.colors.text\n                }}>\n                  Fields ({fields?.length || 0})\n                </h3>\n                <div style={{\n                  backgroundColor: styles.colors.surface,\n                  borderRadius: getBorderRadius('md'),\n                  overflow: 'hidden'\n                }}>\n                  {fields && fields.length > 0 ? (\n                    <table style={{\n                      width: '100%',\n                      borderCollapse: 'collapse'\n                    }}>\n                      <thead>\n                        <tr style={{\n                          borderBottom: `1px solid ${styles.colors.border}`\n                        }}>\n                          <th style={{\n                            padding: styles.spacing.sm,\n                            textAlign: 'left',\n                            fontSize: styles.typography.fontSize.sm,\n                            fontWeight: styles.typography.fontWeight?.medium || '500',\n                            color: styles.colors.textSecondary\n                          }}>\n                            Field\n                          </th>\n                          <th style={{\n                            padding: styles.spacing.sm,\n                            textAlign: 'left',\n                            fontSize: styles.typography.fontSize.sm,\n                            fontWeight: styles.typography.fontWeight?.medium || '500',\n                            color: styles.colors.textSecondary\n                          }}>\n                            Type\n                          </th>\n                          <th style={{\n                            padding: styles.spacing.sm,\n                            textAlign: 'center',\n                            fontSize: styles.typography.fontSize.sm,\n                            fontWeight: styles.typography.fontWeight?.medium || '500',\n                            color: styles.colors.textSecondary\n                          }}>\n                            Attributes\n                          </th>\n                        </tr>\n                      </thead>\n                      <tbody>\n                        {fields.map((field, index) => (\n                          <tr\n                            key={index}\n                            style={{\n                              borderBottom: index < fields.length - 1 \n                                ? `1px solid ${styles.colors.borderLight || styles.colors.border}` \n                                : 'none'\n                            }}\n                          >\n                            <td style={{\n                              padding: styles.spacing.sm,\n                              fontSize: styles.typography.fontSize.sm,\n                              color: styles.colors.text\n                            }}>\n                              <div>\n                                <div style={{\n                                  fontWeight: field.IsPrimaryKey \n                                    ? (styles.typography.fontWeight?.semibold || '600')\n                                    : (styles.typography.fontWeight?.regular || '400')\n                                }}>\n                                  {field.DisplayName || field.Name}\n                                </div>\n                                {field.DisplayName && (\n                                  <div style={{\n                                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                                    color: styles.colors.textSecondary,\n                                    fontFamily: 'monospace'\n                                  }}>\n                                    {field.Name}\n                                  </div>\n                                )}\n                              </div>\n                            </td>\n                            <td style={{\n                              padding: styles.spacing.sm\n                            }}>\n                              {renderFieldType(field.Type)}\n                              {field.Length && (\n                                <span style={{\n                                  marginLeft: styles.spacing.xs,\n                                  fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                                  color: styles.colors.textSecondary\n                                }}>\n                                  ({field.Length})\n                                </span>\n                              )}\n                            </td>\n                            <td style={{\n                              padding: styles.spacing.sm,\n                              textAlign: 'center'\n                            }}>\n                              <div style={{\n                                display: 'flex',\n                                gap: styles.spacing.xs,\n                                justifyContent: 'center',\n                                flexWrap: 'wrap'\n                              }}>\n                                {field.IsPrimaryKey && (\n                                  <span style={{\n                                    padding: `2px ${styles.spacing.xs}`,\n                                    backgroundColor: (styles.colors.warning || styles.colors.secondary) + '15',\n                                    color: styles.colors.warning || styles.colors.secondary,\n                                    borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),\n                                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                                    fontWeight: styles.typography.fontWeight?.bold || '700'\n                                  }}>\n                                    PK\n                                  </span>\n                                )}\n                                {field.IsUnique && (\n                                  <span style={{\n                                    padding: `2px ${styles.spacing.xs}`,\n                                    backgroundColor: (styles.colors.info || styles.colors.primary) + '15',\n                                    color: styles.colors.info || styles.colors.primary,\n                                    borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),\n                                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                                    fontWeight: styles.typography.fontWeight?.bold || '700'\n                                  }}>\n                                    UQ\n                                  </span>\n                                )}\n                                {!field.AllowsNull && !field.IsPrimaryKey && (\n                                  <span style={{\n                                    padding: `2px ${styles.spacing.xs}`,\n                                    backgroundColor: (styles.colors.error || styles.colors.secondary) + '15',\n                                    color: styles.colors.error || styles.colors.secondary,\n                                    borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),\n                                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                                    fontWeight: styles.typography.fontWeight?.bold || '700'\n                                  }}>\n                                    NN\n                                  </span>\n                                )}\n                              </div>\n                            </td>\n                          </tr>\n                        ))}\n                      </tbody>\n                    </table>\n                  ) : (\n                    <div style={{\n                      padding: styles.spacing.lg,\n                      textAlign: 'center',\n                      color: styles.colors.textSecondary,\n                      fontSize: styles.typography.fontSize.sm\n                    }}>\n                      No fields available\n                    </div>\n                  )}\n                </div>\n              </div>\n              \n              {/* Relationships Section */}\n              <div style={{ marginBottom: styles.spacing.xl }}>\n                <h3 style={{\n                  margin: 0,\n                  marginBottom: styles.spacing.md,\n                  fontSize: styles.typography.fontSize.lg,\n                  fontWeight: styles.typography.fontWeight?.semibold || '600',\n                  color: styles.colors.text\n                }}>\n                  Relationships ({relationships?.length || 0})\n                </h3>\n                <div style={{\n                  display: 'flex',\n                  flexDirection: 'column',\n                  gap: styles.spacing.sm\n                }}>\n                  {relationships && relationships.length > 0 ? (\n                    relationships.map((rel, index) => (\n                      <div\n                        key={index}\n                        style={{\n                          padding: styles.spacing.md,\n                          backgroundColor: styles.colors.surface,\n                          borderRadius: getBorderRadius('sm'),\n                          display: 'flex',\n                          alignItems: 'center',\n                          gap: styles.spacing.md\n                        }}\n                      >\n                        {renderRelationshipIcon(rel.Type)}\n                        <div style={{ flex: 1 }}>\n                          <div style={{\n                            fontSize: styles.typography.fontSize.md,\n                            fontWeight: styles.typography.fontWeight?.medium || '500',\n                            color: styles.colors.text\n                          }}>\n                            {rel.DisplayName || rel.RelatedEntity}\n                          </div>\n                          {rel.RelatedEntityJoinField && (\n                            <div style={{\n                              fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,\n                              color: styles.colors.textSecondary,\n                              fontFamily: 'monospace'\n                            }}>\n                              via {rel.RelatedEntityJoinField}\n                            </div>\n                          )}\n                        </div>\n                      </div>\n                    ))\n                  ) : (\n                    <div style={{\n                      padding: styles.spacing.lg,\n                      backgroundColor: styles.colors.surface,\n                      borderRadius: getBorderRadius('sm'),\n                      textAlign: 'center',\n                      color: styles.colors.textSecondary,\n                      fontSize: styles.typography.fontSize.sm\n                    }}>\n                      No relationships defined\n                    </div>\n                  )}\n                </div>\n              </div>\n            </>\n          ) : (\n            <div style={{\n              display: 'flex',\n              flexDirection: 'column',\n              alignItems: 'center',\n              justifyContent: 'center',\n              height: '100%',\n              color: styles.colors.textSecondary\n            }}>\n              <div style={{\n                fontSize: styles.typography.fontSize.lg,\n                marginBottom: styles.spacing.md\n              }}>\n                No Entity Selected\n              </div>\n              <div style={{\n                fontSize: styles.typography.fontSize.md\n              }}>\n                Select an entity from the list to view its details\n              </div>\n            </div>\n          )}\n        </div>\n        \n        {/* Footer with Open Record Button */}\n        {entity && OpenRecordButton && (\n          <div style={{\n            padding: styles.spacing.lg,\n            borderTop: `1px solid ${styles.colors.border}`,\n            backgroundColor: styles.colors.surface\n          }}>\n            <OpenRecordButton\n              entityName=\"Entities\"\n              record={entity}\n              buttonText=\"Open Entity Record\"\n              utilities={utilities}\n              styles={styles}\n              components={components}\n              callbacks={callbacks}\n              savedUserSettings={savedUserSettings}\n              onSaveUserSettings={onSaveUserSettings}\n              buttonStyle={{\n                width: '100%',\n                padding: styles.spacing.md,\n                backgroundColor: styles.colors.primary,\n                color: 'white',\n                border: 'none',\n                borderRadius: getBorderRadius('md'),\n                fontSize: styles.typography.fontSize.md,\n                fontWeight: styles.typography.fontWeight?.semibold || '600',\n                cursor: 'pointer',\n                transition: 'background-color 0.2s'\n              }}\n            />\n          </div>\n        )}\n      </div>\n    </>\n  );\n}",
      "dependencies": [
        {
          "name": "OpenRecordButton",
          "location": "registry",
          "namespace": "Generic/Navigation",
          "version": "^1.0.0"
        }
      ],
      "libraries": []
    },
    {
      "name": "EntityFilter",
      "title": "Entity Filter Panel",
      "description": "Collapsible filter panel for filtering entities by various criteria",
      "type": "form",
      "functionalRequirements": "## Entity Filter Requirements\n\n- Collapsible panel on the left side\n- Filter by schema name (dropdown)\n- Filter by base table (dropdown)\n- Search box for text search\n- Clear all filters button\n- Show active filter count\n- Smooth collapse/expand animation\n- Remember collapsed state",
      "dataRequirements": {
        "mode": "views",
        "description": "Receives filter options derived from Entities metadata",
        "entities": [
          {
            "name": "Entities",
            "description": "Source of schema and table filter options",
            "displayFields": [
              "SchemaName",
              "BaseTable"
            ],
            "filterFields": [],
            "sortFields": [],
            "fieldMetadata": [],
            "permissionLevelNeeded": [
              "read"
            ],
            "usageContext": "Extracts unique schema names and base tables for filter dropdowns"
          }
        ],
        "queries": []
      },
      "technicalDesign": "## Technical Design\n\n### Props\n- filters: Current filter values\n- onFilterChange: Callback when filters change\n- schemas: Available schema options\n- tables: Available table options\n- isCollapsed: Whether panel is collapsed\n- onToggleCollapse: Callback to toggle collapse\n\n### Components\n- Collapse toggle button\n- Schema dropdown\n- Table dropdown\n- Search input\n- Clear filters button\n- Active filter badges",
      "properties": [
        {
          "name": "filters",
          "description": "Current filter values",
          "type": "{schema?: string, table?: string, search?: string}",
          "required": true
        },
        {
          "name": "onFilterChange",
          "description": "Callback when filters change",
          "type": "(filters: {schema?: string, table?: string, search?: string}) => void",
          "required": true
        },
        {
          "name": "schemas",
          "description": "Available schema options",
          "type": "Array<string>",
          "required": true
        },
        {
          "name": "tables",
          "description": "Available table options",
          "type": "Array<string>",
          "required": true
        },
        {
          "name": "isCollapsed",
          "description": "Whether the panel is collapsed",
          "type": "boolean",
          "required": true
        },
        {
          "name": "onToggleCollapse",
          "description": "Callback to toggle collapse state",
          "type": "() => void",
          "required": true
        }
      ],
      "events": [
        {
          "name": "onFilterChange",
          "description": "Fired when filter values change",
          "parameters": [
            {
              "name": "filters",
              "description": "Updated filter object",
              "type": "object"
            }
          ]
        },
        {
          "name": "onToggleCollapse",
          "description": "Fired when collapse state should toggle",
          "parameters": []
        }
      ],
      "exampleUsage": "<EntityFilter\n  filters={filters}\n  onFilterChange={handleFilterChange}\n  schemas={uniqueSchemas}\n  tables={uniqueTables}\n  isCollapsed={filterPanelCollapsed}\n  onToggleCollapse={handleToggleFilter}\n  utilities={utilities}\n  styles={styles}\n  components={components}\n  callbacks={callbacks}\n/>",
      "code": "function EntityFilter({ \n  filters, \n  onFilterChange, \n  schemas, \n  tables, \n  isCollapsed, \n  onToggleCollapse,\n  utilities, \n  styles, \n  components, \n  callbacks, \n  savedUserSettings, \n  onSaveUserSettings \n}) {\n  // Helper function to get border radius value\n  const getBorderRadius = (size) => {\n    return typeof styles.borders.radius === 'object' ? styles.borders.radius[size] : styles.borders.radius;\n  };\n  \n  // Calculate active filter count\n  const activeFilterCount = Object.values(filters || {}).filter(Boolean).length;\n  \n  // Handle schema filter change\n  const handleSchemaChange = useCallback((e) => {\n    const newFilters = {\n      ...filters,\n      schema: e.target.value || undefined\n    };\n    onFilterChange?.(newFilters);\n  }, [filters, onFilterChange]);\n  \n  // Handle table filter change\n  const handleTableChange = useCallback((e) => {\n    const newFilters = {\n      ...filters,\n      table: e.target.value || undefined\n    };\n    onFilterChange?.(newFilters);\n  }, [filters, onFilterChange]);\n  \n  // Handle clear all filters\n  const handleClearFilters = useCallback(() => {\n    onFilterChange?.({});\n  }, [onFilterChange]);\n  \n  // Handle toggle collapse\n  const handleToggle = useCallback(() => {\n    onToggleCollapse?.();\n  }, [onToggleCollapse]);\n  \n  return (\n    <div style={{\n      width: isCollapsed ? '48px' : '280px',\n      minWidth: isCollapsed ? '48px' : '280px',\n      backgroundColor: styles.colors.surface,\n      borderRight: `1px solid ${styles.colors.border}`,\n      transition: 'width 0.3s ease-out',\n      display: 'flex',\n      flexDirection: 'column',\n      position: 'relative',\n      overflow: 'hidden'\n    }}>\n      {/* Toggle Button */}\n      <button\n        onClick={handleToggle}\n        style={{\n          position: 'absolute',\n          top: styles.spacing.md,\n          right: styles.spacing.md,\n          width: '32px',\n          height: '32px',\n          borderRadius: getBorderRadius('sm'),\n          border: `1px solid ${styles.colors.border}`,\n          backgroundColor: styles.colors.background,\n          color: styles.colors.text,\n          fontSize: styles.typography.fontSize.md,\n          cursor: 'pointer',\n          display: 'flex',\n          alignItems: 'center',\n          justifyContent: 'center',\n          zIndex: 1,\n          transition: 'all 0.2s'\n        }}\n        onMouseEnter={(e) => {\n          e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;\n        }}\n        onMouseLeave={(e) => {\n          e.currentTarget.style.backgroundColor = styles.colors.background;\n        }}\n      >\n        {isCollapsed ? '→' : '←'}\n      </button>\n      \n      {/* Filter Icon when collapsed */}\n      {isCollapsed && (\n        <div style={{\n          display: 'flex',\n          flexDirection: 'column',\n          alignItems: 'center',\n          justifyContent: 'center',\n          flex: 1,\n          opacity: 1,\n          transition: 'opacity 0.3s'\n        }}>\n          <div style={{\n            fontSize: styles.typography.fontSize.xl,\n            color: styles.colors.textSecondary,\n            marginBottom: styles.spacing.sm\n          }}>\n            🔍\n          </div>\n          {activeFilterCount > 0 && (\n            <div style={{\n              width: '24px',\n              height: '24px',\n              borderRadius: '50%',\n              backgroundColor: styles.colors.primary,\n              color: 'white',\n              display: 'flex',\n              alignItems: 'center',\n              justifyContent: 'center',\n              fontSize: styles.typography.fontSize.xs,\n              fontWeight: styles.typography.fontWeight?.bold || '700'\n            }}>\n              {activeFilterCount}\n            </div>\n          )}\n        </div>\n      )}\n      \n      {/* Filter Content */}\n      <div style={{\n        padding: styles.spacing.lg,\n        opacity: isCollapsed ? 0 : 1,\n        transition: 'opacity 0.3s',\n        pointerEvents: isCollapsed ? 'none' : 'auto',\n        flex: 1,\n        display: 'flex',\n        flexDirection: 'column'\n      }}>\n        {/* Header */}\n        <div style={{\n          marginBottom: styles.spacing.xl,\n          paddingRight: '40px'\n        }}>\n          <h2 style={{\n            margin: 0,\n            fontSize: styles.typography.fontSize.lg,\n            fontWeight: styles.typography.fontWeight?.semibold || '600',\n            color: styles.colors.text,\n            marginBottom: styles.spacing.xs\n          }}>\n            Filters\n          </h2>\n          {activeFilterCount > 0 && (\n            <div style={{\n              fontSize: styles.typography.fontSize.sm,\n              color: styles.colors.textSecondary\n            }}>\n              {activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}\n            </div>\n          )}\n        </div>\n        \n        {/* Filter Controls */}\n        <div style={{\n          flex: 1,\n          display: 'flex',\n          flexDirection: 'column',\n          gap: styles.spacing.lg\n        }}>\n          {/* Schema Filter */}\n          <div>\n            <label style={{\n              display: 'block',\n              marginBottom: styles.spacing.sm,\n              fontSize: styles.typography.fontSize.sm,\n              fontWeight: styles.typography.fontWeight?.medium || '500',\n              color: styles.colors.textSecondary\n            }}>\n              Schema\n            </label>\n            <select\n              value={filters?.schema || ''}\n              onChange={handleSchemaChange}\n              style={{\n                width: '100%',\n                padding: styles.spacing.sm,\n                fontSize: styles.typography.fontSize.md,\n                border: `1px solid ${styles.colors.border}`,\n                borderRadius: getBorderRadius('sm'),\n                backgroundColor: styles.colors.background,\n                color: styles.colors.text,\n                cursor: 'pointer'\n              }}\n            >\n              <option value=\"\">All Schemas</option>\n              {schemas.map((schema) => (\n                <option key={schema} value={schema}>\n                  {schema}\n                </option>\n              ))}\n            </select>\n          </div>\n          \n          {/* Table Filter */}\n          <div>\n            <label style={{\n              display: 'block',\n              marginBottom: styles.spacing.sm,\n              fontSize: styles.typography.fontSize.sm,\n              fontWeight: styles.typography.fontWeight?.medium || '500',\n              color: styles.colors.textSecondary\n            }}>\n              Base Table\n            </label>\n            <select\n              value={filters?.table || ''}\n              onChange={handleTableChange}\n              style={{\n                width: '100%',\n                padding: styles.spacing.sm,\n                fontSize: styles.typography.fontSize.md,\n                border: `1px solid ${styles.colors.border}`,\n                borderRadius: getBorderRadius('sm'),\n                backgroundColor: styles.colors.background,\n                color: styles.colors.text,\n                cursor: 'pointer'\n              }}\n            >\n              <option value=\"\">All Tables</option>\n              {tables.map((table) => (\n                <option key={table} value={table}>\n                  {table}\n                </option>\n              ))}\n            </select>\n          </div>\n          \n          {/* Active Filters Display */}\n          {activeFilterCount > 0 && (\n            <div>\n              <div style={{\n                marginBottom: styles.spacing.sm,\n                fontSize: styles.typography.fontSize.sm,\n                fontWeight: styles.typography.fontWeight?.medium || '500',\n                color: styles.colors.textSecondary\n              }}>\n                Active Filters\n              </div>\n              <div style={{\n                display: 'flex',\n                flexDirection: 'column',\n                gap: styles.spacing.xs\n              }}>\n                {filters?.schema && (\n                  <div style={{\n                    padding: styles.spacing.sm,\n                    backgroundColor: styles.colors.primary + '15',\n                    borderRadius: getBorderRadius('sm'),\n                    display: 'flex',\n                    justifyContent: 'space-between',\n                    alignItems: 'center'\n                  }}>\n                    <div style={{\n                      fontSize: styles.typography.fontSize.sm,\n                      color: styles.colors.text\n                    }}>\n                      <span style={{\n                        color: styles.colors.textSecondary,\n                        marginRight: styles.spacing.xs\n                      }}>\n                        Schema:\n                      </span>\n                      <strong>{filters.schema}</strong>\n                    </div>\n                    <button\n                      onClick={() => handleSchemaChange({ target: { value: '' } })}\n                      style={{\n                        width: '20px',\n                        height: '20px',\n                        borderRadius: '50%',\n                        border: 'none',\n                        backgroundColor: 'transparent',\n                        color: styles.colors.textSecondary,\n                        fontSize: styles.typography.fontSize.sm,\n                        cursor: 'pointer',\n                        display: 'flex',\n                        alignItems: 'center',\n                        justifyContent: 'center',\n                        padding: 0\n                      }}\n                      onMouseEnter={(e) => {\n                        e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;\n                      }}\n                      onMouseLeave={(e) => {\n                        e.currentTarget.style.backgroundColor = 'transparent';\n                      }}\n                    >\n                      ✕\n                    </button>\n                  </div>\n                )}\n                {filters?.table && (\n                  <div style={{\n                    padding: styles.spacing.sm,\n                    backgroundColor: styles.colors.primary + '15',\n                    borderRadius: getBorderRadius('sm'),\n                    display: 'flex',\n                    justifyContent: 'space-between',\n                    alignItems: 'center'\n                  }}>\n                    <div style={{\n                      fontSize: styles.typography.fontSize.sm,\n                      color: styles.colors.text\n                    }}>\n                      <span style={{\n                        color: styles.colors.textSecondary,\n                        marginRight: styles.spacing.xs\n                      }}>\n                        Table:\n                      </span>\n                      <strong>{filters.table}</strong>\n                    </div>\n                    <button\n                      onClick={() => handleTableChange({ target: { value: '' } })}\n                      style={{\n                        width: '20px',\n                        height: '20px',\n                        borderRadius: '50%',\n                        border: 'none',\n                        backgroundColor: 'transparent',\n                        color: styles.colors.textSecondary,\n                        fontSize: styles.typography.fontSize.sm,\n                        cursor: 'pointer',\n                        display: 'flex',\n                        alignItems: 'center',\n                        justifyContent: 'center',\n                        padding: 0\n                      }}\n                      onMouseEnter={(e) => {\n                        e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;\n                      }}\n                      onMouseLeave={(e) => {\n                        e.currentTarget.style.backgroundColor = 'transparent';\n                      }}\n                    >\n                      ✕\n                    </button>\n                  </div>\n                )}\n              </div>\n            </div>\n          )}\n        </div>\n        \n        {/* Clear All Button */}\n        {activeFilterCount > 0 && (\n          <div style={{\n            marginTop: styles.spacing.xl,\n            paddingTop: styles.spacing.lg,\n            borderTop: `1px solid ${styles.colors.borderLight || styles.colors.border}`\n          }}>\n            <button\n              onClick={handleClearFilters}\n              style={{\n                width: '100%',\n                padding: styles.spacing.md,\n                backgroundColor: styles.colors.surface,\n                color: styles.colors.text,\n                border: `1px solid ${styles.colors.border}`,\n                borderRadius: getBorderRadius('md'),\n                fontSize: styles.typography.fontSize.md,\n                fontWeight: styles.typography.fontWeight?.medium || '500',\n                cursor: 'pointer',\n                transition: 'background-color 0.2s'\n              }}\n              onMouseEnter={(e) => {\n                e.currentTarget.style.backgroundColor = styles.colors.error + '15';\n                e.currentTarget.style.color = styles.colors.error;\n              }}\n              onMouseLeave={(e) => {\n                e.currentTarget.style.backgroundColor = styles.colors.surface;\n                e.currentTarget.style.color = styles.colors.text;\n              }}\n            >\n              Clear All Filters\n            </button>\n          </div>\n        )}\n      </div>\n    </div>\n  );\n}",
      "dependencies": [],
      "libraries": []
    },
    {
      "name": "OpenRecordButton",
      "location": "registry",
      "namespace": "Generic/Navigation",
      "version": "^1.0.0"
    }
  ],
  "libraries": [],
  "code": "function EntityBrowser({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {\n  // Extract child components\n  const { EntityList, EntityDetails, EntityFilter } = components;\n  \n  // Initialize state from saved settings where appropriate\n  const [selectedEntityId, setSelectedEntityId] = useState(savedUserSettings?.selectedEntityId);\n  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'grid');\n  const [filters, setFilters] = useState(savedUserSettings?.filters || {});\n  const [sortBy, setSortBy] = useState(savedUserSettings?.sortBy || 'Name');\n  const [sortDirection, setSortDirection] = useState(savedUserSettings?.sortDirection || 'asc');\n  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(savedUserSettings?.filterPanelCollapsed || false);\n  \n  // Runtime UI state (not persisted)\n  const [entities, setEntities] = useState([]);\n  const [entityFields, setEntityFields] = useState([]);\n  const [entityRelationships, setEntityRelationships] = useState([]);\n  const [loading, setLoading] = useState(true);\n  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);\n  const [searchQuery, setSearchQuery] = useState('');\n  const [uniqueSchemas, setUniqueSchemas] = useState([]);\n  const [uniqueTables, setUniqueTables] = useState([]);\n  \n  // Load entities on mount and when filters/sort change\n  useEffect(() => {\n    const loadEntities = async () => {\n      setLoading(true);\n      try {\n        // Build filter string\n        let filterParts = [];\n        if (filters.schema) {\n          filterParts.push(`SchemaName = '${filters.schema}'`);\n        }\n        if (filters.table) {\n          filterParts.push(`BaseTable = '${filters.table}'`);\n        }\n        if (searchQuery) {\n          filterParts.push(`(Name LIKE '%${searchQuery}%' OR DisplayName LIKE '%${searchQuery}%' OR Description LIKE '%${searchQuery}%')`);\n        }\n        \n        const result = await utilities.rv.RunView({\n          EntityName: 'MJ: Entities',\n          Fields: ['ID', 'Name', 'DisplayName', 'NameSuffix', 'Description', 'SchemaName', 'BaseTable', 'BaseView'],\n          OrderBy: `${sortBy} ${sortDirection.toUpperCase()}`,\n          ExtraFilter: filterParts.length > 0 ? filterParts.join(' AND ') : undefined\n        });\n        \n        if (result?.Success && result?.Results) {\n          setEntities(result.Results);\n          \n          // Extract unique schemas and tables for filter dropdowns\n          const schemas = [...new Set(result.Results.map(e => e.SchemaName).filter(Boolean))];\n          const tables = [...new Set(result.Results.map(e => e.BaseTable).filter(Boolean))];\n          setUniqueSchemas(schemas);\n          setUniqueTables(tables);\n        } else {\n          console.error('Failed to load entities:', result?.ErrorMessage);\n          setEntities([]);\n        }\n      } catch (error) {\n        console.error('Error loading entities:', error);\n        setEntities([]);\n      } finally {\n        setLoading(false);\n      }\n    };\n    \n    loadEntities();\n  }, [filters, sortBy, sortDirection, searchQuery, utilities.rv]);\n  \n  // Load entity details when selection changes\n  useEffect(() => {\n    const loadEntityDetails = async () => {\n      if (!selectedEntityId) {\n        setEntityFields([]);\n        setEntityRelationships([]);\n        return;\n      }\n      \n      try {\n        // Load fields\n        const fieldsResult = await utilities.rv.RunView({\n          EntityName: 'MJ: Entity Fields',\n          Fields: ['Name', 'DisplayName', 'Type', 'Length', 'AllowsNull', 'IsPrimaryKey', 'IsUnique', 'Sequence'],\n          OrderBy: 'Sequence ASC, Name ASC',\n          ExtraFilter: `EntityID = '${selectedEntityId}'`\n        });\n        \n        if (fieldsResult?.Success && fieldsResult?.Results) {\n          setEntityFields(fieldsResult.Results);\n        } else {\n          setEntityFields([]);\n        }\n        \n        // Load relationships\n        const relationshipsResult = await utilities.rv.RunView({\n          EntityName: 'MJ: Entity Relationships',\n          Fields: ['RelatedEntity', 'Type', 'DisplayName', 'RelatedEntityJoinField', 'Sequence'],\n          OrderBy: 'Sequence ASC, RelatedEntity ASC',\n          ExtraFilter: `EntityID = '${selectedEntityId}'`\n        });\n        \n        if (relationshipsResult?.Success && relationshipsResult?.Results) {\n          setEntityRelationships(relationshipsResult.Results);\n        } else {\n          setEntityRelationships([]);\n        }\n      } catch (error) {\n        console.error('Error loading entity details:', error);\n        setEntityFields([]);\n        setEntityRelationships([]);\n      }\n    };\n    \n    loadEntityDetails();\n  }, [selectedEntityId, utilities.rv]);\n  \n  // Handle entity selection\n  const handleSelectEntity = useCallback((entityId) => {\n    setSelectedEntityId(entityId);\n    setDetailsPanelOpen(true);\n    \n    // Save user preference\n    onSaveUserSettings?.({\n      ...savedUserSettings,\n      selectedEntityId: entityId\n    });\n  }, [savedUserSettings, onSaveUserSettings]);\n  \n  // Handle view mode change\n  const handleViewModeChange = useCallback((mode) => {\n    setViewMode(mode);\n    \n    // Save preference\n    onSaveUserSettings?.({\n      ...savedUserSettings,\n      viewMode: mode\n    });\n  }, [savedUserSettings, onSaveUserSettings]);\n  \n  // Handle filter changes\n  const handleFilterChange = useCallback((newFilters) => {\n    setFilters(newFilters);\n    \n    // Save filter preferences\n    onSaveUserSettings?.({\n      ...savedUserSettings,\n      filters: newFilters\n    });\n  }, [savedUserSettings, onSaveUserSettings]);\n  \n  // Handle sort changes\n  const handleSortChange = useCallback((newSortBy, newSortDirection) => {\n    setSortBy(newSortBy);\n    setSortDirection(newSortDirection);\n    \n    // Save sort preferences\n    onSaveUserSettings?.({\n      ...savedUserSettings,\n      sortBy: newSortBy,\n      sortDirection: newSortDirection\n    });\n  }, [savedUserSettings, onSaveUserSettings]);\n  \n  // Handle filter panel toggle\n  const handleToggleFilter = useCallback(() => {\n    const newCollapsed = !filterPanelCollapsed;\n    setFilterPanelCollapsed(newCollapsed);\n    \n    // Save collapsed state\n    onSaveUserSettings?.({\n      ...savedUserSettings,\n      filterPanelCollapsed: newCollapsed\n    });\n  }, [filterPanelCollapsed, savedUserSettings, onSaveUserSettings]);\n  \n  // Handle opening entity record (kept for backward compatibility with details panel)\n  const handleOpenRecord = useCallback((entityName) => {\n    console.log('Root handleOpenRecord called with entityName:', entityName);\n    console.log('Callbacks object:', callbacks);\n    if (callbacks?.OpenEntityRecord && entityName) {\n      console.log('Calling OpenEntityRecord callback with:', 'MJ: Entities', entityName);\n      // Open the Entities entity record for the selected entity\n      callbacks.OpenEntityRecord('MJ: Entities', [{ FieldName: 'Name', Value: entityName }]);\n    } else {\n      console.error('OpenEntityRecord callback not available or entityName missing');\n    }\n  }, [callbacks]);\n  \n  // Handle closing details panel\n  const handleCloseDetails = useCallback(() => {\n    setDetailsPanelOpen(false);\n  }, []);\n  \n  // Handle search\n  const handleSearch = useCallback((query) => {\n    setSearchQuery(query);\n  }, []);\n  \n  // Get selected entity object\n  const selectedEntity = entities.find(e => e.ID === selectedEntityId);\n  \n  // Helper function to get border radius value\n  const getBorderRadius = (size) => {\n    return typeof styles.borders.radius === 'object' ? styles.borders.radius[size] : styles.borders.radius;\n  };\n  \n  // Loading state\n  if (loading && entities.length === 0) {\n    return (\n      <div style={{\n        display: 'flex',\n        justifyContent: 'center',\n        alignItems: 'center',\n        height: '100vh',\n        fontSize: styles.typography.fontSize.lg,\n        color: styles.colors.textSecondary\n      }}>\n        Loading entities...\n      </div>\n    );\n  }\n  \n  return (\n    <div style={{\n      display: 'flex',\n      height: '100vh',\n      backgroundColor: styles.colors.background,\n      overflow: 'hidden'\n    }}>\n      {/* Filter Panel */}\n      {EntityFilter && (\n        <EntityFilter\n          filters={filters}\n          onFilterChange={handleFilterChange}\n          schemas={uniqueSchemas}\n          tables={uniqueTables}\n          isCollapsed={filterPanelCollapsed}\n          onToggleCollapse={handleToggleFilter}\n          savedUserSettings={savedUserSettings?.filterPanel}\n          onSaveUserSettings={(settings) => onSaveUserSettings?.({\n            ...savedUserSettings,\n            filterPanel: settings\n          })}\n          utilities={utilities}\n          styles={styles}\n          components={components}\n          callbacks={callbacks}\n        />\n      )}\n      \n      {/* Main Content Area */}\n      <div style={{\n        flex: 1,\n        display: 'flex',\n        flexDirection: 'column',\n        overflow: 'hidden'\n      }}>\n        {/* Header */}\n        <div style={{\n          padding: styles.spacing.lg,\n          borderBottom: `1px solid ${styles.colors.border}`,\n          backgroundColor: styles.colors.surface\n        }}>\n          <div style={{\n            display: 'flex',\n            justifyContent: 'space-between',\n            alignItems: 'center',\n            marginBottom: styles.spacing.md\n          }}>\n            <h1 style={{\n              margin: 0,\n              fontSize: styles.typography.fontSize.xxl || styles.typography.fontSize.xl,\n              fontWeight: styles.typography.fontWeight?.bold || '700',\n              color: styles.colors.text\n            }}>\n              Entity Browser\n            </h1>\n            \n            {/* View Mode Toggle */}\n            <div style={{\n              display: 'flex',\n              gap: styles.spacing.sm,\n              alignItems: 'center'\n            }}>\n              <span style={{\n                fontSize: styles.typography.fontSize.md,\n                color: styles.colors.textSecondary\n              }}>\n                View:\n              </span>\n              <button\n                onClick={() => handleViewModeChange('grid')}\n                style={{\n                  padding: `${styles.spacing.sm} ${styles.spacing.md}`,\n                  backgroundColor: viewMode === 'grid' ? styles.colors.primary : styles.colors.background,\n                  color: viewMode === 'grid' ? 'white' : styles.colors.text,\n                  border: `1px solid ${styles.colors.border}`,\n                  borderRadius: getBorderRadius('sm'),\n                  cursor: 'pointer',\n                  fontSize: styles.typography.fontSize.md\n                }}\n              >\n                Grid\n              </button>\n              <button\n                onClick={() => handleViewModeChange('card')}\n                style={{\n                  padding: `${styles.spacing.sm} ${styles.spacing.md}`,\n                  backgroundColor: viewMode === 'card' ? styles.colors.primary : styles.colors.background,\n                  color: viewMode === 'card' ? 'white' : styles.colors.text,\n                  border: `1px solid ${styles.colors.border}`,\n                  borderRadius: getBorderRadius('sm'),\n                  cursor: 'pointer',\n                  fontSize: styles.typography.fontSize.md\n                }}\n              >\n                Cards\n              </button>\n            </div>\n          </div>\n          \n          {/* Search Bar */}\n          <div style={{\n            display: 'flex',\n            gap: styles.spacing.md\n          }}>\n            <input\n              type=\"text\"\n              placeholder=\"Search entities...\"\n              value={searchQuery}\n              onChange={(e) => handleSearch(e.target.value)}\n              style={{\n                flex: 1,\n                padding: styles.spacing.md,\n                fontSize: styles.typography.fontSize.md,\n                border: `1px solid ${styles.colors.border}`,\n                borderRadius: getBorderRadius('sm'),\n                backgroundColor: styles.colors.background\n              }}\n            />\n            {searchQuery && (\n              <button\n                onClick={() => handleSearch('')}\n                style={{\n                  padding: `${styles.spacing.sm} ${styles.spacing.md}`,\n                  backgroundColor: styles.colors.surfaceHover || styles.colors.surface,\n                  color: styles.colors.text,\n                  border: `1px solid ${styles.colors.border}`,\n                  borderRadius: getBorderRadius('sm'),\n                  cursor: 'pointer',\n                  fontSize: styles.typography.fontSize.md\n                }}\n              >\n                Clear\n              </button>\n            )}\n          </div>\n        </div>\n        \n        {/* Entity List */}\n        <div style={{\n          flex: 1,\n          overflow: 'auto',\n          padding: styles.spacing.lg\n        }}>\n          {EntityList && (\n            <EntityList\n              entities={entities}\n              viewMode={viewMode}\n              selectedEntityId={selectedEntityId}\n              onSelectEntity={handleSelectEntity}\n              sortBy={sortBy}\n              sortDirection={sortDirection}\n              onSortChange={handleSortChange}\n              savedUserSettings={savedUserSettings?.entityList}\n              onSaveUserSettings={(settings) => onSaveUserSettings?.({\n                ...savedUserSettings,\n                entityList: settings\n              })}\n              utilities={utilities}\n              styles={styles}\n              components={components}\n              callbacks={callbacks}\n            />\n          )}\n          \n          {/* Empty State */}\n          {entities.length === 0 && !loading && (\n            <div style={{\n              display: 'flex',\n              flexDirection: 'column',\n              alignItems: 'center',\n              justifyContent: 'center',\n              padding: styles.spacing.xxl || styles.spacing.xl,\n              color: styles.colors.textSecondary\n            }}>\n              <div style={{\n                fontSize: styles.typography.fontSize.xl,\n                marginBottom: styles.spacing.md\n              }}>\n                No entities found\n              </div>\n              <div style={{\n                fontSize: styles.typography.fontSize.md\n              }}>\n                {searchQuery || Object.keys(filters).length > 0\n                  ? 'Try adjusting your filters or search query'\n                  : 'No entities are available'}\n              </div>\n            </div>\n          )}\n        </div>\n      </div>\n      \n      {/* Details Panel */}\n      {EntityDetails && (\n        <EntityDetails\n          entity={selectedEntity}\n          fields={entityFields}\n          relationships={entityRelationships}\n          isOpen={detailsPanelOpen}\n          onClose={handleCloseDetails}\n          onOpenRecord={() => handleOpenRecord(selectedEntity?.Name)}\n          savedUserSettings={savedUserSettings?.detailsPanel}\n          onSaveUserSettings={(settings) => onSaveUserSettings?.({\n            ...savedUserSettings,\n            detailsPanel: settings\n          })}\n          utilities={utilities}\n          styles={styles}\n          components={components}\n          callbacks={callbacks}\n        />\n      )}\n    </div>\n  );\n}"
}