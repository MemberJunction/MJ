/**
 * @fileoverview Strongly-typed Side Panel domain models for the standalone Angular 21
 * MemberJunction Browser Extension Side Panel application.
 *
 * Strictly adheres to MemberJunction strong-typing and PascalCase naming rules (zero `any` types).
 */

export interface PersistedAuthSession {
  Provider: string;
  IdToken: string;
  AccessToken?: string;
  UserName?: string;
  Email?: string;
  GraphQLUrl?: string;
  ExplorerOrigin?: string;
  ActiveConversationId?: string;
}

export interface MjHostSessionExtractResult {
  Success: boolean;
  HasHostSession: boolean;
  IdToken: string | null;
  GraphQLUrl: string | null;
  ConversationID: string | null;
  LastSessionID: string | null;
  Origin: string;
  Url: string;
  UserName?: string | null;
  UserEmail?: string | null;
}

export interface LiveBraidedFacetItem {
  RecordID: string;
  EntityName: string;
  Title: string;
  Subtitle: string;
  Badge: string;
}

export interface LiveBraidedFacetGroup {
  App: string;
  Header: string;
  Badge: string;
  Items: LiveBraidedFacetItem[];
}

export interface LivePageContextDossier {
  EntityType: string;
  RuleName: string;
  TargetEntityName: string;
  LookupFilter: string;
  SearchQuery: string;
  DisplayName: string;
  Subtitle: string;
  BadgeText: string;
  MatchedInMJ: boolean;
  MatchedRecordID: string | null;
  MatchedEntityName: string | null;
  Fields: Record<string, string>;
  FieldEntries: Array<{ Key: string; Value: string }>;
  Facets: LiveBraidedFacetGroup[];
}

export interface DiscoveredAuthProviderCatalogEntry {
  Name: string;
  Type: string;
  ClientId?: string;
  Domain?: string;
  Issuer?: string;
  Scopes?: string[];
  Authority?: string;
}

export interface SyncedConversationMessage {
  ID: string;
  Role: string;
  Message: string;
}

export type InteractiveElementRoleFilter = 'all' | 'button' | 'link' | 'input';

export interface ContextualQuickActionItem {
  Id: string;
  Label: string;
  IconClass: string;
  Kind: 'agent-prompt' | 'open-in-explorer' | 'spotlight-page';
  Prompt?: string;
  Badge?: string;
}
