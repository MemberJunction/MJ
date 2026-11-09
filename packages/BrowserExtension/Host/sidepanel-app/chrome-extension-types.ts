/**
 * @fileoverview Strongly-typed Chrome Manifest V3 WebExtension API contracts
 * and Side Panel domain models for the standalone Angular 21 Side Panel application.
 *
 * Strictly adheres to MemberJunction strong-typing rules (zero `any` types).
 */

import type { ExtensionBrandProfile } from '@memberjunction/browser-extension-core';

export interface ChromeTabInfo {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
  windowId?: number;
}

export interface ChromeTabChangeInfo {
  status?: string;
  url?: string;
}

export interface ChromeTabActiveInfo {
  tabId: number;
  windowId: number;
}

export interface ChromeSendMessageOptions {
  frameId?: number;
}

export interface ChromeWindowCreateResult {
  id?: number;
  tabs?: ChromeTabInfo[];
}

export interface ChromeTabsApi {
  query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<ChromeTabInfo[]>;
  sendMessage<TResponse>(
    tabId: number,
    message: { Type: string; Payload?: Record<string, string | number | boolean | undefined> },
    options?: ChromeSendMessageOptions
  ): Promise<TResponse>;
  create(createProperties: { url: string; active?: boolean }): Promise<ChromeTabInfo>;
  update(tabId: number, updateProperties: { active?: boolean; url?: string }): Promise<ChromeTabInfo>;
  remove(tabIds: number | number[]): Promise<void>;
  onActivated?: {
    addListener(callback: (activeInfo: ChromeTabActiveInfo) => void): void;
  };
  onUpdated?: {
    addListener(callback: (tabId: number, changeInfo: ChromeTabChangeInfo, tab: ChromeTabInfo) => void): void;
  };
}

export interface ChromeWindowsApi {
  create(createData: {
    url: string;
    type?: 'popup' | 'normal';
    width?: number;
    height?: number;
    focused?: boolean;
  }): Promise<ChromeWindowCreateResult>;
  remove(windowId: number): Promise<void>;
  onRemoved?: {
    addListener(callback: (windowId: number) => void): void;
    removeListener?(callback: (windowId: number) => void): void;
  };
}

export interface ChromeScriptingFileInjection {
  target: { tabId: number };
  files: string[];
}

export interface ChromeScriptingFuncInjection<TResult> {
  target: { tabId: number };
  world?: 'ISOLATED' | 'MAIN';
  func: () => TResult | Promise<TResult>;
}

export interface ChromeScriptingInjectionResult<TResult> {
  frameId: number;
  result?: TResult;
}

export interface ChromeScriptingApi {
  executeScript(injection: ChromeScriptingFileInjection): Promise<Array<{ frameId: number }>>;
  executeScript<TResult>(
    injection: ChromeScriptingFuncInjection<TResult>
  ): Promise<Array<ChromeScriptingInjectionResult<TResult>>>;
}

export interface PersistedAuthSession {
  provider: string;
  idToken: string;
  accessToken?: string;
  userName?: string;
  email?: string;
  graphQLUrl?: string;
  explorerOrigin?: string;
  activeConversationId?: string;
}

export interface ChromeStorageItems {
  mj_ext_auth_session?: PersistedAuthSession;
}

export interface ChromeStorageAreaApi {
  get(keys: string[], callback: (items: ChromeStorageItems) => void): void;
  set(items: ChromeStorageItems, callback?: () => void): void;
  remove(keys: string | string[], callback?: () => void): void;
}

export interface ChromeRuntimeSender {
  tab?: ChromeTabInfo;
  frameId?: number;
  url?: string;
}

export interface ChromeRuntimeInboundMessage {
  Type?: string;
  TabId?: number;
  Url?: string;
  Granted?: boolean;
  ErrorMessage?: string;
  Payload?: {
    SessionID?: string;
    LastSessionID?: string;
    ConversationID?: string;
    AgentID?: string;
    HostOrigin?: string;
    Origin?: string;
    IdToken?: string;
    GraphQLUrl?: string;
  };
}

export type ChromeRuntimeMessageListener = (
  message: ChromeRuntimeInboundMessage,
  sender: ChromeRuntimeSender,
  sendResponse: (response: { Received: boolean }) => void
) => boolean | void;

export interface ChromeRuntimeApi {
  getURL?: (path: string) => string;
  onMessage?: {
    addListener(callback: ChromeRuntimeMessageListener): void;
    removeListener?(callback: ChromeRuntimeMessageListener): void;
  };
}

export interface ChromeExtensionNamespace {
  tabs?: ChromeTabsApi;
  windows?: ChromeWindowsApi;
  scripting?: ChromeScriptingApi;
  storage?: {
    local?: ChromeStorageAreaApi;
  };
  runtime?: ChromeRuntimeApi;
}

export interface SidePanelWindowGlobals {
  __MJ_EXTENSION_BRAND_PROFILE__?: ExtensionBrandProfile;
  chrome?: ChromeExtensionNamespace;
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
  name: string;
  type: string;
  clientId?: string;
  domain?: string;
  issuer?: string;
  scopes?: string[];
  clientConfiguration?: {
    authority?: string;
  };
}

export interface SyncedConversationMessage {
  ID: string;
  Role: string;
  Message: string;
}
