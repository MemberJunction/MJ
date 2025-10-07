import { ConversationEntity, ConversationDetailEntity, ArtifactEntity, CollectionEntity, ProjectEntity, TaskEntity } from '@memberjunction/core-entities';

/**
 * Represents an active agent process
 */
export interface AgentProcess {
  id: string;
  agentId: string;
  agentName: string;
  agentColor: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  message: string;
  progress?: number;
  startedAt: Date;
}

/**
 * Options for filtering tasks
 */
export interface TaskFilters {
  status?: string[];
  projectId?: string;
  assignedToUserId?: string;
  assignedToAgentId?: string;
  environmentId?: string;
}

/**
 * Options for creating public links
 */
export interface PublicLinkOptions {
  password?: string;
  expiresAt?: Date;
  maxViews?: number;
}

/**
 * Tab types for the main navigation
 */
export type NavigationTab = 'conversations' | 'collections';

/**
 * Layout modes for the workspace
 */
export type WorkspaceLayout = 'full' | 'compact' | 'embedded';

/**
 * View modes for collections
 */
export type CollectionViewMode = 'grid' | 'list';

/**
 * Sort options for artifacts
 */
export type ArtifactSortBy = 'name' | 'date' | 'type' | 'modified';

/**
 * Grouping options for conversations
 */
export type ConversationGroupBy = 'project' | 'date' | 'none';

/**
 * Type of entity being mentioned
 */
export type MentionType = 'agent' | 'user';

/**
 * Represents a mention in a message (@Agent or @User)
 */
export interface Mention {
  type: MentionType;
  id: string;
  name: string;
}

/**
 * Result of parsing mentions from a message
 */
export interface MentionParseResult {
  mentions: Mention[];
  agentMention: Mention | null; // Single agent mention (first one found)
  userMentions: Mention[]; // All user mentions
}