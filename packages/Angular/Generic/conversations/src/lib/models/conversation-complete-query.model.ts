import { ConversationDetailEntityType } from '@memberjunction/core-entities';

/**
 * Agent Run data returned in JSON format from GetConversationComplete query
 * Contains only the fields needed for display in the gear icon
 */
export interface AgentRunJSON {
  ID: string;
  AgentID: string | null;
  Agent: string | null;
  Status: string;
  __mj_CreatedAt: string; // ISO date string from SQL
  __mj_UpdatedAt: string; // ISO date string from SQL
  TotalPromptTokensUsed: number | null;
  TotalCompletionTokensUsed: number | null;
  TotalCost: number | null;
  ConversationDetailID: string | null;
}

/**
 * Artifact data returned in JSON format from GetConversationComplete query
 * Contains only the fields needed for display in artifact cards (excludes Content field)
 */
export interface ArtifactJSON {
  ConversationDetailID: string;
  Direction: string;
  ArtifactVersionID: string;
  VersionNumber: number;
  ArtifactID: string;
  ArtifactName: string;
  ArtifactType: string;
  ArtifactDescription: string | null;
  Visibility: string;
}

/**
 * Complete conversation detail data returned from GetConversationComplete query
 * Extends the base ConversationDetailEntityType with JSON-aggregated related data
 *
 * This type represents the raw query result BEFORE parsing JSON columns.
 * AgentRunsJSON and ArtifactsJSON are JSON strings that need to be parsed.
 */
export type ConversationDetailComplete = ConversationDetailEntityType & {
  /**
   * JSON string containing array of agent runs for this conversation detail
   * Parse with JSON.parse() to get AgentRunJSON[]
   * Will be null if no agent runs exist
   */
  AgentRunsJSON: string | null;

  /**
   * JSON string containing array of artifacts for this conversation detail
   * Parse with JSON.parse() to get ArtifactJSON[]
   * Will be null if no artifacts exist
   */
  ArtifactsJSON: string | null;

  /**
   * User avatar image URL (Base64 or URL) - joined from vwUsers
   * Will be null if user has no avatar image set
   */
  UserImageURL: string | null;

  /**
   * User avatar Font Awesome icon class - joined from vwUsers
   * Will be null if user has no icon class set
   */
  UserImageIconClass: string | null;
};

/**
 * Parsed conversation detail with typed related data
 * This is what you get AFTER parsing the JSON columns
 */
export interface ConversationDetailParsed extends ConversationDetailEntityType {
  /**
   * Parsed array of agent runs (empty array if none exist)
   */
  agentRuns: AgentRunJSON[];

  /**
   * Parsed array of artifacts (empty array if none exist)
   */
  artifacts: ArtifactJSON[];
}

/**
 * Helper function to parse ConversationDetailComplete query result into typed objects
 * Handles JSON parsing and provides typed arrays for agent runs and artifacts
 *
 * @param queryResult - Raw result from GetConversationComplete query
 * @returns Parsed conversation detail with typed agent runs and artifacts
 */
export function parseConversationDetailComplete(
  queryResult: ConversationDetailComplete
): ConversationDetailParsed {
  return {
    ...queryResult,
    agentRuns: queryResult.AgentRunsJSON
      ? JSON.parse(queryResult.AgentRunsJSON) as AgentRunJSON[]
      : [],
    artifacts: queryResult.ArtifactsJSON
      ? JSON.parse(queryResult.ArtifactsJSON) as ArtifactJSON[]
      : []
  };
}
