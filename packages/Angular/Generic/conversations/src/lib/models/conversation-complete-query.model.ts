import {
  MJConversationDetailEntityType,
  MJConversationDetailRatingEntityType,
  MJAIAgentRunEntityType,
  MJConversationDetailArtifactEntityType
} from '@memberjunction/core-entities';

/**
 * Agent Run data returned in JSON format from GetConversationComplete query.
 * Uses the auto-generated MJAIAgentRunEntityType plus Agent view field.
 */
export type AgentRunJSON = MJAIAgentRunEntityType & {
  Agent: string | null; // View field from join
};

/**
 * Artifact data returned in JSON format from GetConversationComplete query.
 * Combines ConversationDetailArtifact and joined Artifact/ArtifactVersion data.
 */
export type ArtifactJSON = MJConversationDetailArtifactEntityType & {
  ArtifactVersionID: string;
  VersionNumber: number;
  VersionName: string | null;
  VersionDescription: string | null;
  VersionCreatedAt: Date;
  ArtifactID: string;
  ArtifactName: string;
  ArtifactType: string;
  ArtifactDescription: string | null;
  Visibility: string;
};

/**
 * Rating data returned in JSON format from GetConversationComplete query.
 * Uses the auto-generated MJConversationDetailRatingEntityType plus UserName for display.
 */
export type RatingJSON = MJConversationDetailRatingEntityType & {
  UserName: string;
};

/**
 * Complete conversation detail data returned from GetConversationComplete query
 * Extends the base MJConversationDetailEntityType with JSON-aggregated related data
 *
 * This type represents the raw query result BEFORE parsing JSON columns.
 * AgentRunsJSON and ArtifactsJSON are JSON strings that need to be parsed.
 */
export type ConversationDetailComplete = MJConversationDetailEntityType & {
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
   * JSON string containing array of user ratings for this conversation detail
   * Parse with JSON.parse() to get RatingJSON[]
   * Will be null if no ratings exist
   */
  RatingsJSON: string | null;

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
export interface ConversationDetailParsed extends MJConversationDetailEntityType {
  /**
   * Parsed array of agent runs (empty array if none exist)
   */
  agentRuns: AgentRunJSON[];

  /**
   * Parsed array of artifacts (empty array if none exist)
   */
  artifacts: ArtifactJSON[];

  /**
   * Parsed array of user ratings (empty array if none exist)
   */
  ratings: RatingJSON[];
}

/**
 * Helper function to parse ConversationDetailComplete query result into typed objects
 * Handles JSON parsing and provides typed arrays for agent runs, artifacts, and ratings
 *
 * @param queryResult - Raw result from GetConversationComplete query
 * @returns Parsed conversation detail with typed agent runs, artifacts, and ratings
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
      : [],
    ratings: queryResult.RatingsJSON
      ? JSON.parse(queryResult.RatingsJSON) as RatingJSON[]
      : []
  };
}
