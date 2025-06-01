/**
 * @fileoverview AI Agent and learning cycle types for Skip API
 * 
 * This file contains types related to AI agent functionality, learning cycles, and
 * human-in-the-loop interactions within the Skip API system. These types define the structure for:
 * 
 * - Agent notes and note types (SkipAPIAgentNote, SkipAPIAgentNoteType)
 * - Agent requests for human approval/feedback (SkipAPIAgentRequest)
 * - Learning cycle processes (SkipAPILearningCycleRequest, SkipAPILearningCycleResponse)
 * - Change tracking for learning cycles (various SkipLearningCycle*Change types)
 * 
 * The learning cycle functionality allows Skip to analyze conversation history and improve
 * its performance over time by generating notes, updating queries, and creating agent
 * requests based on patterns it discovers in user interactions.
 * 
 * Agent requests enable human-in-the-loop workflows where Skip can ask for approval or
 * guidance on specific actions, ensuring that AI decisions align with organizational
 * policies and user preferences.
 * 
 * Notes provide a way for Skip to store and retrieve organizational knowledge, user
 * preferences, and contextual information that improves future interactions.
 * 
 * @author MemberJunction
 * @since 2.0.0
 */

import type { SkipConversation } from './conversation-types';
import type { SkipEntityInfo } from './entity-metadata-types';
import type { SkipQueryInfo, SkipLearningCycleQueryChange } from './query-types';
import type { SkipAPIRequestAPIKey } from './auth-types';

/**
 * Type that defines a possible note type from the source system that invoked Skip
 */
export class SkipAPIAgentNoteType {
    id: string;
    name: string;
    description: string;
}

/**
 * Defines the shape of an individual Agent note that is stored in MJ that can be passed to Skip for additional context.
 */
export class SkipAPIAgentNote {
    /**
     * Unique identifier for the note
     */
    id: string;
    /**
     * Unique type id (UUID) for the note type, maps to a SkipAPIAgentNoteType that was passed in the SkipAPIRequest
     */
    agentNoteTypeId: string;
    /**
     * Text name for the note type
     */
    agentNoteType: string;
    /**
     * Date/Time the note was initially created
     */
    createdAt: Date;
    /**
     * Date/Time the note was last updated
     */
    updatedAt: Date;
    /**
     * The text of the note
     */
    note: string; 
    /**
     * This type field contains the scope of the note, either Global or User
     */
    type: 'User' | 'Global';
    /**
     * The unique identifier for the user that the note is associated with, only populated if type === 'User'
     */
    userId: string | null;
    /**
     * The name of the user that the note is associated with, only populated if type === 'User'
     */
    user: string | null;
}

/**
 * Whenever an agent is interested in getting human-in-the-loop style feedback/approval, this type is used
 */
export class SkipAPIAgentRequest {
    /**
     * The unique identifier for the request
     */
    id: string;

    /**
     * The unique identifier for the agent that made the request
     */
    agentId: string;
    /**
     * The name of the agent that made the request
     */
    agent: string;
    /**
     * The date and time the request was made
     */
    requestedAt: Date;
    /**
     * Optional, the unique identifier for the user that the request was made for by the Agent
     */
    requestForUserId?: string;
    /**
     * Only populated if the request was made for a user, the name of the user that the request was made for
     */
    requestForUser?: string;
    /**
     * Status of the request: 'Requested' | 'Approved' | 'Rejected' | 'Canceled'
     */
    status: 'Requested' | 'Approved' | 'Rejected' | 'Canceled';
    /**
     * Text body of the request the AI Agent is making
     */
    request: string;
    /**
     * Text body of the response that is being sent back to the AI Agent
     */
    response: string;
    /**
     * The unique identifier for the user that responded to the request
     */
    responseByUserId: string;
    /**
     * The name of the user that responded to the request
     */
    responseByUser: string;
    /**
     * The date and time the user responded to the request
     */
    respondedAt: Date;
    /**
     * Internal comments that are not intended to be shared with the AI Agent
     */
    comments: string;
    /**
     * The date and time the request record was created in the database
     */
    createdAt: Date;
    /**
     * The date and time the request record was last updated in the database
     */
    updatedAt: Date;
}

/**
 * Represents a change to agent notes during the learning cycle process, allowing Skip
 * to add new notes, update existing ones, or mark notes for deletion based on
 * its analysis of conversation patterns and organizational learning.
 */
export class SkipLearningCycleNoteChange {
    note: SkipAPIAgentNote;
    changeType: 'add' | 'update' | 'delete';
}

/**
 * Represents a change to agent requests during the learning cycle process, allowing Skip
 * to add new requests, update existing ones, or mark requests for deletion based on
 * its analysis of conversation patterns and user feedback.
 */
export class SkipLearningCycleRequestChange {
    request: SkipAPIAgentRequest;
    changeType: 'add' | 'update' | 'delete';
}

/**
 * API Request shape to ask the /learn end point to learn from conversation history and pass back "notes" that can be stored in the database for future requests
 */
export class SkipAPILearningCycleRequest {
    /**
     * OrganizationID for Skip to identify the organization
     */
    organizationId: string

    /**
     * This is an optional string parameter where you can tell Skip anything you'd like to share about your organization, structure, database schema, and anything else
     * that might be helpful for him to be aware of. Keep in mind that this organizationInfo will be incorprorated into every request Skip makes to the underlying AI
     * services which can add cost and processing time to your requests. Including this information is extremely helpful as a very simple method of 
     * contextualizing Skip for your organization. In the Pro and above Skip plans, there are far more granular and effect methods of training Skip beyond this organizationInfo parameter, contact
     * the team at MemberJunction.com for more information if you're interested.
     */
    organizationInfo?: string;

     /**
     * Learning Cycle ID is a unique identifier from the MJ AI Agent Learning Cycles table that will track the details of the API calls and the results for logging purposes and 
     * also to track the timestamps for each run to batch the conversations that are being sent
     */
    learningCycleId: string;

    /**
     * An array of conversations that have taken place since the last learning cycle
     */
    newConversations: SkipConversation[];

    /**
     * Summary entity metadata that is passed into the Skip Server so that Skip has knowledge of the schema of the calling MJAPI environment
     */
    entities: SkipEntityInfo[];

    /**
     * Stored queries in the MJ metadata that Skip can use and learn from
     */
    queries: SkipQueryInfo[];

    /**
     * An array of notes that have been generated by the Skip API server during the learning cycle process in the past
     */
    notes: SkipAPIAgentNote[];

    /**
     * An array of the possible note types that can be stored in the source MJ system
     */
    noteTypes: SkipAPIAgentNoteType[];

    /**
     * An array of the requests that Skip has previously made. Full history provided including requests of all status conditions.
     */
    requests: SkipAPIAgentRequest[];

    /**
     * Optional, the date/time of the last learning cycle performed on this dataset
     */
    lastLearningCycleDate: Date;

    /**
     * One or more API keys that are used for AI systems that Skip will access on behalf of the API caller
     * NOTE: This is not where you put in the bearer token for the Skip API server itself, that goes in the header of the request
     */
    apiKeys: SkipAPIRequestAPIKey[];
}

/**
 * API Response shape to ask the /learn end point to learn from conversation history and pass back "notes", an array of notes are provided that should be stored in the database
 * to then be passed into future Skip API requests for analysis/etc.
 */
export class SkipAPILearningCycleResponse {
    /**
     * Indicates if the learning cycle was successful or not
     */
    success: boolean;

    /**
     * If a learning cycle is skipped because there is no new conversation data to learn from, this property will be set to true
     */
    learningCycleSkipped?: boolean;

    /** 
     * If the learning cycle was not successful, this property will contain an error message that describes the reason for the failure
     */
    error?: string;
 
    /**
     * The number of milliseconds that have elapsed since the learning cycle process started
     */
    elapsedTime: number;
    
    /**
     * The notes that were generated by the Skip API server during the learning cycle process
     */
    noteChanges: SkipLearningCycleNoteChange[];

    /**
     * This provides an array of changes requested by Skip to the MJ database for queries, adding, updating and/or deleting.
     */
    queryChanges: SkipLearningCycleQueryChange[];

    /**
     * This array should be populated by the agent with any changes to requests - deleting existing requests that have not been responded to yet and for whatever reason are not relevant anymore, updating existing requests that haven't yet been responded to, and adding new requests to help the agent learn.
     */
    requestChanges: SkipLearningCycleRequestChange[];
}