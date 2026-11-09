/**
 * @fileoverview Standalone Angular 21 Root Component for the MemberJunction Browser Extension
 * Side Panel (`<mj-extension-sidepanel-app>`).
 *
 * Architecture:
 * - Runs natively inside `chrome-extension://<id>/sidepanel.html` (zero `<iframe>`, zero `MJExplorer` shell).
 * - Connects directly to `MJAPI` via `SetupGraphQLClient` (`@memberjunction/graphql-dataprovider`).
 * - Mounts `@memberjunction/ng-conversations` (`<mj-conversation-chat-area [overlayMode]="true">`)
 *   for standard MemberJunction agent chat, markdown, artifacts, `@` mentions, `/` skills, and realtime voice.
 * - Mounts `@memberjunction/ng-browser-extension` (`<mj-extension-playbook-stepper>`) for guided actions.
 * - Executes live 2-stage `RunViews` context braiding against real business entities only (zero mock data)
 *   and isolates DOM inspection to `frameId: 0` (blocking third-party ad/tracker iframes).
 */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { CompositeKey, Metadata, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  ConversationEngine,
  MJConversationEntity,
  MJEnvironmentEntityExtended,
  UserInfoEngine,
} from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
  BuildAppContextSnapshot,
  ParseAgentSettings,
  type AppContextSnapshot,
  type ClientToolMetadata,
  type RealtimeChannelExposure,
} from '@memberjunction/ai-core-plus';
import type { InteractiveElement } from '@memberjunction/computer-use/browser-probe';
import {
  GraphQLDataProvider,
  GraphQLProviderConfigData,
  SetupGraphQLClient,
} from '@memberjunction/graphql-dataprovider';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import {
  ConversationChatAreaComponent,
  ConversationsModule,
  RealtimeSessionService,
} from '@memberjunction/ng-conversations';
import {
  MJExtensionPlaybookStepperComponent,
  PlaybookStepExecuteEvent,
} from '@memberjunction/ng-browser-extension';
import {
  BrowserControlBackendMode,
  BrowserPageStateSnapshot,
  BrowserPlaybookDefinition,
  ExtensionBrandProfile,
  RuntimeBrandKitHydrator,
} from '@memberjunction/browser-extension-core';
import type {
  ChromeExtensionNamespace,
  ChromeWindowCreateResult,
  ContextualQuickActionItem,
  DiscoveredAuthProviderCatalogEntry,
  InteractiveElementRoleFilter,
  LiveBraidedFacetGroup,
  LivePageContextDossier,
  MjHostSessionExtractResult,
  PersistedAuthSession,
  SidePanelWindowGlobals,
  SyncedConversationMessage,
} from './chrome-extension-types';

type SidePanelTabId = 'context' | 'chat' | 'playbooks';

interface PendingOAuthPkceFlow {
  provider: 'msal' | 'auth0';
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  tokenEndpoint: string;
  state: string;
  windowId: number | null;
  tabId: number | null;
}

interface DynamicContextRuleEntry {
  RuleName?: string;
  EntityName?: string;
  EntityResolution?: {
    EntityName?: string;
  };
}

interface DynamicEntityFacetEntry {
  ApplicationName?: string;
  SourceApp?: string;
  AnchorEntityName?: string;
  ParentEntityName?: string;
  HeaderLabel?: string;
  Title?: string;
  FacetEntityName?: string;
  RelatedEntityName?: string;
  ForeignKeyField?: string;
  ForeignKeyFilterTemplate?: string;
  OrderBy?: string;
  MaxRecords?: number;
  TitleField?: string;
  SubtitleField?: string;
  BadgeField?: string;
  Query?: {
    EntityName?: string;
    FilterTemplate?: string;
    OrderBy?: string;
    MaxRows?: number;
  };
  QuickActions?: Array<{
    Label?: string;
    IconClass?: string;
    Kind?: 'agent-prompt' | 'remote-operation' | 'open-in-explorer' | 'create-related-record';
    Target?: string;
  }>;
}

interface DynamicPlaybookEntry extends BrowserPlaybookDefinition {
  UrlPatterns?: string[];
  SourceApp?: string;
}

const BROWSER_EXTENSION_TOOL_MANIFEST: ClientToolMetadata[] = [
  {
    Name: 'GetActiveTabPageState',
    Description:
      'Reads the active browser tab URL, title, hostname, OpenGraph metadata, visible text excerpt, and grounded interactive elements.',
    Category: 'Browser Extension',
    InputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    Name: 'HighlightElementOnPage',
    Description:
      'Draws a non-intrusive Shadow-DOM Coach-Mark Spotlight ring and floating instruction callout around an element on the active browser tab.',
    Category: 'Browser Extension',
    InputSchema: {
      type: 'object',
      properties: {
        Selector: {
          type: 'string',
          description: 'CSS selector or xpath=... expression of the element to highlight.',
        },
        Index: {
          type: 'number',
          description: 'Grounded interactive element index from GetActiveTabPageState or TopGroundedElements.',
        },
        Label: {
          type: 'string',
          description: 'Instruction text shown in the floating Coach-Mark callout.',
        },
        StepBadge: {
          type: 'string',
          description: 'Optional step badge pill text (e.g. "Step 1 of 3").',
        },
      },
      required: ['Label'],
    },
  },
  {
    Name: 'ClearPageHighlights',
    Description: 'Clears all Coach-Mark Spotlight rings and callouts on the active browser tab.',
    Category: 'Browser Extension',
    InputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    Name: 'ClickElementOnPage',
    Description: 'Clicks a grounded interactive element on the active browser tab by Selector or Index.',
    Category: 'Browser Extension',
    InputSchema: {
      type: 'object',
      properties: {
        Selector: {
          type: 'string',
          description: 'CSS selector or xpath=... expression of the element to click.',
        },
        Index: {
          type: 'number',
          description: 'Grounded interactive element index from GetActiveTabPageState or TopGroundedElements.',
        },
      },
    },
  },
  {
    Name: 'FillInputOnPage',
    Description: 'Fills text into an input or textarea on the active browser tab by Selector or Index.',
    Category: 'Browser Extension',
    InputSchema: {
      type: 'object',
      properties: {
        Selector: {
          type: 'string',
          description: 'CSS selector or xpath=... expression of the input element.',
        },
        Index: {
          type: 'number',
          description: 'Grounded interactive element index from GetActiveTabPageState or TopGroundedElements.',
        },
        Value: {
          type: 'string',
          description: 'Text value to enter into the input.',
        },
        PressEnter: {
          type: 'boolean',
          description: 'Whether to press Enter after filling the input.',
        },
      },
      required: ['Value'],
    },
  },
];

interface GraphQLRunViewBatchItem {
  Success: boolean;
  TotalRowCount: number;
  ErrorMessage?: string;
  Results: Array<Record<string, string | number | boolean | null | undefined>>;
}

const DEFAULT_BRAND_PROFILE: ExtensionBrandProfile = {
  BrandSlug: 'mj-copilot',
  BrandName: 'MemberJunction Agent',
  ShortName: 'MJ Agent',
  Version: '6.2.0',
  Description: 'Enterprise AI Browser Agent with multi-app context braiding and guided playbooks.',
  AssistantDisplayName: 'MJ Agent',
  AgentTabLabel: 'Agent',
  SidePanelHeaderTitle: 'MemberJunction Agent',
  Tagline: 'MemberJunction Browser Agent',
  DefaultServerUrl: 'http://localhost:4115/',
  DefaultAuthProvider: 'msal',
  DefaultControlBackend: 'content-script',
  IncludeDebuggerPermission: true,
  HostPermissions: ['<all_urls>'],
  ExternallyConnectableMatches: ['http://localhost:*/*', 'https://*.memberjunction.com/*'],
  BlockedDomains: ['*.1password.com', '*.lastpass.com', '*.bitwarden.com', '*.dashlane.com'],
  ThemeSeeds: {
    primary: '#0076B6',
    accent: '#5CC0ED',
    tertiary: '#092340',
    radius: 8,
  },
  Icons: {
    Icon16: 'icons/icon-16.png',
    Icon32: 'icons/icon-32.png',
    Icon48: 'icons/icon-48.png',
    Icon128: 'icons/icon-128.png',
  },
};

const DEFAULT_OAUTH_CONFIG = {
  msal: {
    clientId: '7e6e6ecf-66ff-4733-9c60-1e6def949897',
    authority: 'https://login.microsoftonline.com/ff10ade7-5d03-40a9-be28-cb7ab99670b1',
    redirectUri: 'http://localhost:4200',
    scopes: ['openid', 'profile', 'email', 'User.Read'],
  },
  auth0: {
    clientId: 'uRNpH3B0sFKVc2yrfBGBalfiUphUK5JI',
    domain: 'bluecypress-dev.us.auth0.com',
    redirectUri: 'http://localhost:4200',
    scopes: ['openid', 'profile', 'email'],
  },
} as const;

@Component({
  selector: 'mj-extension-sidepanel-app',
  standalone: true,
  imports: [ConversationsModule, MJExtensionPlaybookStepperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      id="mj-extension-sidepanel-root"
      class="mj-sidepanel-shell"
      [attr.data-brand-slug]="BrandProfile.BrandSlug"
      [attr.data-assistant-name]="BrandProfile.AssistantDisplayName"
      [attr.data-agent-tab-label]="AgentTabLabel"
      [attr.data-ready]="IsBootstrapped ? 'true' : null"
      [attr.data-default-backend]="BrandProfile.DefaultControlBackend"
      [attr.data-last-oauth-url]="LastOAuthUrl"
      [attr.data-last-oauth-provider]="LastOAuthProvider"
      [attr.data-app-context-app]="AgentAppContext.App.Name"
      [attr.data-app-context-resource-type]="AgentAppContext.ActiveNavItem?.ResourceType ?? null"
      [attr.data-app-context-tools]="AgentAppContext.Capabilities?.Tools?.length ?? 0"
      [attr.data-app-context-has-instructions]="AgentAppContext.AdditionalContext?.['SpecialAgentInstructions'] ? 'true' : 'false'"
    >
      <!-- Top Brand & Connection Header -->
      <header class="mj-sidepanel-header">
        <div class="mj-brand-identity">
          <div class="mj-brand-mark" aria-hidden="true">{{ BrandInitials }}</div>
          <div class="mj-brand-copy">
            <div class="mj-brand-title-row">
              <h1 class="mj-sidepanel-title">{{ BrandProfile.AssistantDisplayName }}</h1>
              <span id="mj-active-host-badge" class="mj-host-badge" [title]="ActiveTabUrl">
                <i class="fa-solid fa-globe" aria-hidden="true"></i>
                {{ ActiveHostLabel }}
              </span>
            </div>
            <p class="mj-sidepanel-tagline">{{ BrandProfile.Tagline }}</p>
          </div>
        </div>
        <div class="mj-header-actions">
          <button
            id="mj-btn-toggle-auth"
            type="button"
            class="mj-auth-pill"
            [class.connected]="IsSignedIn"
            title="Account &amp; Connection Status"
            (click)="OnToggleAuthDrawer()"
          >
            @if (IsSignedIn) {
              <span class="mj-status-dot" aria-hidden="true"></span>
              <span class="mj-auth-pill-name">{{ SignedInUserDisplay }}</span>
            } @else {
              <i class="fa-solid fa-plug" aria-hidden="true"></i>
              <span>Sign In</span>
            }
          </button>
          <button
            id="mj-btn-resume-in-explorer"
            type="button"
            class="mj-icon-btn"
            title="Open in MemberJunction Explorer"
            aria-label="Open in MemberJunction Explorer"
            (click)="OnResumeConversationInExplorer()"
          >
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </button>
          <button
            id="mj-btn-toggle-settings"
            type="button"
            class="mj-icon-btn"
            title="Page Perception &amp; Control Mode Settings"
            aria-label="Page Perception and Control Mode Settings"
            (click)="OnToggleSettingsDrawer()"
          >
            <i class="fa-solid fa-sliders" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <!-- Collapsible Sign-In Drawer -->
      <section
        id="mj-auth-drawer"
        class="mj-drawer"
        [class.open]="AuthDrawerOpen"
        aria-label="MemberJunction Sign-In"
      >
        <div class="mj-drawer-header">
          <strong class="mj-drawer-title">Connect to MemberJunction</strong>
          <span
            id="mj-auth-mode-badge"
            class="mj-badge"
            [class.mj-badge-success]="IsSignedIn"
            [class.mj-badge-warn]="!IsSignedIn"
          >
            @if (IsSignedIn) {
              Signed In ({{ AuthProviderLabel }})
            } @else if (IsConnectingProvider) {
              Connecting...
            } @else {
              Not Signed In
            }
          </span>
        </div>

        @if (!IsSignedIn) {
          <p class="mj-drawer-copy">
            Sign in with one click using your open <strong>MemberJunction Explorer</strong> session (auto-detects your MJAPI endpoint &amp; active conversation).
          </p>
        } @else {
          <div id="mj-signed-in-user-bar" class="mj-signed-in-bar">
            <span id="mj-signed-in-user-label" class="mj-signed-in-label">
              <span class="mj-status-dot" aria-hidden="true"></span>
              {{ SignedInUserDisplay }}@if (SignedInUserEmail) { ({{ SignedInUserEmail }}) }
            </span>
            <button id="mj-btn-sign-out" type="button" class="mj-btn mj-btn-xs" (click)="OnSignOut()">
              Sign Out
            </button>
          </div>
        }

        <button
          id="mj-btn-sync-explorer-tab"
          type="button"
          class="mj-btn mj-btn-primary mj-btn-hero"
          [disabled]="IsConnectingProvider"
          (click)="OnSyncFromMjExplorerTab()"
        >
          <i class="fa-solid fa-bolt" aria-hidden="true"></i>
          <span>{{ IsSignedIn ? 'Refresh Session from MemberJunction Explorer' : 'Sign In via MemberJunction Explorer' }}</span>
        </button>

        @if (DiscoveredProviders.length > 0) {
          <div id="mj-provider-catalog-list" class="mj-catalog-list">
            @for (prov of DiscoveredProviders; track prov.name) {
              <button
                type="button"
                class="mj-btn mj-btn-primary"
                (click)="OnLaunchCatalogProvider(prov)"
              >
                🔐 Sign In with {{ prov.name }} ({{ prov.type }})
              </button>
            }
          </div>
        }

        <details id="mj-auth-advanced-details" class="mj-advanced-details">
          <summary class="mj-advanced-summary">Direct SSO &amp; Server Endpoint Options</summary>
          <div class="mj-advanced-body">
            <div class="mj-toolbar-actions">
              <button id="mj-btn-idp-msal" type="button" class="mj-btn" (click)="OnLaunchOAuthPopup('msal', null)">
                🔐 Sign In with Microsoft
              </button>
              <button id="mj-btn-idp-auth0" type="button" class="mj-btn" (click)="OnLaunchOAuthPopup('auth0', null)">
                🔐 Sign In with Auth0
              </button>
              <button id="mj-btn-discover-catalog" type="button" class="mj-btn" (click)="OnDiscoverAuthProviders()">
                🔄 Discover /auth/providers
              </button>
            </div>

            <label class="mj-field-label" for="mj-input-api-url">MJAPI GraphQL Endpoint URL</label>
            <input
              id="mj-input-api-url"
              class="mj-input"
              type="url"
              [value]="ConnectedServerUrl"
              (input)="OnServerUrlInput($event)"
              placeholder="http://localhost:4115/ or http://localhost:4000/graphql"
            />

            <label class="mj-field-label" for="mj-input-api-token">Bearer Token (auto-filled from MJ Explorer)</label>
            <input
              id="mj-input-api-token"
              class="mj-input"
              type="password"
              [value]="ApiTokenInput"
              (input)="OnApiTokenInput($event)"
              placeholder="Auto-populated via MJ Explorer / MSAL / Auth0..."
            />

            <div class="mj-toolbar-actions">
              <button id="mj-btn-save-auth" type="button" class="mj-btn mj-btn-primary" (click)="OnSaveAndConnectAuth()">
                Save &amp; Connect
              </button>
              <button id="mj-btn-open-explorer" type="button" class="mj-btn" (click)="OnOpenMjExplorer()">
                Open MJ Explorer
              </button>
            </div>
          </div>
        </details>
      </section>

      <!-- Collapsible Perception & Control Mode Settings Drawer -->
      <section
        id="mj-settings-drawer"
        class="mj-drawer"
        [class.open]="SettingsDrawerOpen"
        aria-label="Perception and Control Mode Settings"
      >
        <div class="mj-drawer-header">
          <strong class="mj-drawer-title">Page Guidance &amp; Perception Controls</strong>
          <span class="mj-el-counter">Grounded Elements: <strong id="mj-el-count">{{ GroundedElementCount }}</strong></span>
        </div>
        <div class="mj-trust-row">
          <select
            id="mj-select-exposure"
            class="mj-select"
            aria-label="Channel Exposure Ceiling"
            [value]="ExposureMode"
            (change)="OnExposureChange($event)"
          >
            <option value="state">Exposure: DOM State</option>
            <option value="pixels">Exposure: Pixels + DOM</option>
            <option value="none">Exposure: Paused (None)</option>
          </select>
          <select
            id="mj-select-backend"
            class="mj-select"
            aria-label="Browser Control Backend Mode"
            [value]="ControlBackendMode"
            (change)="OnBackendModeChange($event)"
          >
            <option value="content-script">Mode 1: Content Script</option>
            <option value="auto">Mode 3: Auto Escalation</option>
            @if (BrandProfile.IncludeDebuggerPermission) {
              <option value="debugger-cdp">Mode 2: Debugger CDP</option>
            }
          </select>
        </div>
        <div class="mj-toolbar-actions">
          <button id="mj-btn-scan-tab" type="button" class="mj-btn mj-btn-primary" (click)="ScanActiveTab()">
            🔄 Rescan Page
          </button>
          <button id="mj-btn-spotlight-main" type="button" class="mj-btn" (click)="OnSpotlightPrimaryElement()">
            🎯 Spotlight Header
          </button>
          <button id="mj-btn-clear-spotlight" type="button" class="mj-btn" (click)="OnClearSpotlights()">
            🧹 Clear Spotlight
          </button>
        </div>
      </section>

      <!-- Status Toast -->
      @if (ToastMessage) {
        <div id="mj-status-toast" class="mj-status-toast visible" role="status" aria-live="polite">
          {{ ToastMessage }}
        </div>
      }

      <!-- Primary 3-Tab Strip -->
      <nav class="mj-nav-tabs" aria-label="Extension Views">
        <button
          type="button"
          class="mj-nav-tab"
          [class.active]="ActiveTab === 'context'"
          data-tab="context"
          (click)="SwitchTab('context')"
        >
          Context
        </button>
        <button
          type="button"
          class="mj-nav-tab"
          [class.active]="ActiveTab === 'chat'"
          data-tab="chat"
          (click)="SwitchTab('chat')"
        >
          {{ AgentTabLabel }}
        </button>
        <button
          type="button"
          class="mj-nav-tab"
          [class.active]="ActiveTab === 'playbooks'"
          data-tab="playbooks"
          (click)="SwitchTab('playbooks')"
        >
          Actions
        </button>
      </nav>

      <!-- Main Viewport -->
      <main id="mj-sidepanel-context-view" class="mj-main-viewport" [class.mj-chat-active]="ActiveTab === 'chat'">
        <!-- TAB 1: CONTEXT -->
        @if (ActiveTab === 'context') {
          <div class="mj-tab-scroll">
            @if (PageSnapshot?.IsAuthOrMfaScreen) {
              <div class="mj-sensitive-banner" role="alert">
                🔒 <strong>Sensitive Login / MFA Screen Detected</strong> — Password, OTP, and payment inputs are automatically redacted before context leaves the page.
              </div>
            }

            @if (PageDossier; as dossier) {
              <article class="mj-card">
                <div class="mj-entity-hero">
                  <div class="mj-entity-avatar" aria-hidden="true">{{ GetInitials(dossier.DisplayName) }}</div>
                  <div class="mj-entity-hero-body">
                    <div class="mj-entity-title-row">
                      <h2 class="mj-entity-name">{{ dossier.DisplayName }}</h2>
                      @if (dossier.MatchedInMJ) {
                        <span class="mj-badge mj-badge-success">✓ In MemberJunction ({{ dossier.MatchedEntityName }})</span>
                      } @else if (IsSignedIn) {
                        <span class="mj-badge mj-badge-neutral">Not in MemberJunction ({{ dossier.EntityType }})</span>
                      } @else {
                        <span class="mj-badge mj-badge-warn">Not in MemberJunction · Sign in to check</span>
                      }
                    </div>
                    <p class="mj-entity-sub">{{ dossier.Subtitle }}</p>
                  </div>
                </div>

                @for (entry of dossier.FieldEntries; track entry.Key) {
                  <div class="mj-kv-row">
                    <span class="mj-kv-key">{{ entry.Key }}</span>
                    <span class="mj-kv-val">{{ entry.Value }}</span>
                  </div>
                }

                <div class="mj-toolbar-actions mj-top-gap">
                  @if (dossier.MatchedInMJ && dossier.MatchedRecordID) {
                    <button
                      type="button"
                      class="mj-btn mj-btn-primary"
                      (click)="OnOpenMatchedRecordInExplorer(dossier)"
                    >
                      ↗ Open Record in MJ Explorer
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="mj-btn mj-btn-primary"
                      (click)="OnCaptureCandidateToMj(dossier)"
                    >
                      ➕ Create in MemberJunction
                    </button>
                  }
                  <button type="button" class="mj-btn" (click)="OnAskAgentAboutPage(dossier)">
                    💬 Ask {{ AgentTabLabel }}
                  </button>
                  <button type="button" class="mj-btn" (click)="OnSpotlightPrimaryElement()">
                    🎯 Highlight on Page
                  </button>
                </div>
              </article>

              @if (!IsSignedIn) {
                <section class="mj-card mj-muted-card">
                  <strong class="mj-card-kicker">Connect to Query Live MemberJunction Records</strong>
                  <p class="mj-card-body-copy">
                    Only real signals extracted from <strong>{{ PageSnapshot?.Hostname || 'this tab' }}</strong> are shown above. Sign in via <strong>MemberJunction Explorer</strong> to resolve matching Organizations, People, and installed Open App records.
                  </p>
                </section>
              } @else if (dossier.Facets.length > 0) {
                @for (facet of dossier.Facets; track facet.Header) {
                  <section class="mj-card">
                    <div class="mj-facet-header">
                      <div>
                        <div class="mj-facet-app">{{ facet.App }}</div>
                        <h3 class="mj-facet-title">{{ facet.Header }}</h3>
                      </div>
                      <span class="mj-badge mj-badge-info">{{ facet.Badge }}</span>
                    </div>
                    @for (item of facet.Items; track item.RecordID) {
                      <div class="mj-facet-item">
                        <div class="mj-facet-item-main">
                          <div class="mj-facet-item-title">{{ item.Title }}</div>
                          <div class="mj-facet-item-sub">{{ item.Subtitle }}</div>
                        </div>
                        <span class="mj-badge mj-badge-success">{{ item.Badge }}</span>
                      </div>
                    }
                  </section>
                }
              } @else if (!dossier.MatchedInMJ) {
                <section class="mj-card mj-muted-card">
                  <strong class="mj-card-kicker">No Matching {{ dossier.TargetEntityName }} Found in MemberJunction</strong>
                  <p class="mj-card-body-copy">
                    Queried live <code>{{ dossier.TargetEntityName }}</code> records on your MemberJunction server and found <strong>0</strong> matches for <strong>{{ dossier.DisplayName }}</strong>. Click <strong>➕ Create in MemberJunction</strong> above to add this record, or switch to <strong>{{ AgentTabLabel }}</strong>.
                  </p>
                </section>
              }

              <details class="mj-card mj-signals-details">
                <summary class="mj-signals-summary">
                  Extracted Page Signals ({{ dossier.FieldEntries.length }} fields · {{ GroundedElementCount }} grounded elements)
                </summary>
                <div class="mj-signals-list">
                  @for (entry of dossier.FieldEntries; track entry.Key) {
                    <div class="mj-signal-line">
                      <span>{{ entry.Key }}</span>
                      <code>{{ entry.Value }}</code>
                    </div>
                  }
                </div>
              </details>
            } @else {
              <section class="mj-card mj-muted-card">
                <strong class="mj-card-kicker">Scanning Active Browser Tab</strong>
                <p class="mj-card-body-copy">
                  Switch to any web page (such as LinkedIn, Wikipedia, or a customer website) or click <strong>🔄 Rescan Page</strong> to extract live DOM signals.
                </p>
                <div class="mj-toolbar-actions mj-top-gap">
                  <button type="button" class="mj-btn mj-btn-primary" (click)="ScanActiveTab()">
                    🔄 Scan Active Tab
                  </button>
                </div>
              </section>
            }
          </div>
        }

        <!-- TAB 2: AGENT (Mounts standard @memberjunction/ng-conversations directly — ZERO iframe, ZERO MJExplorer shell) -->
        <div class="mj-agent-pane" [hidden]="ActiveTab !== 'chat'">
          <!-- Compact Page Context & Handoff Strip -->
          <div class="mj-agent-context-strip">
            <div class="mj-agent-context-meta">
              <span
                class="mj-agent-context-dot"
                [class.paused]="ExposureMode === 'none'"
                aria-hidden="true"
              ></span>
              <span class="mj-agent-context-label" [title]="ActiveTabUrl">
                @if (ExposureMode === 'none') {
                  <strong>Context Paused</strong>
                  <span class="mj-agent-tools-count"> · Perception Off</span>
                } @else {
                  <strong>{{ PageDossier?.DisplayName || ActiveHostLabel }}</strong>
                  <span class="mj-agent-tools-count">
                    · {{ GroundedElementCount }} els · 5 Tools@if (PageDossier?.MatchedInMJ) { · ✓ MJ Linked }
                  </span>
                }
              </span>
            </div>
            <div class="mj-agent-context-actions">
              @if (IsProviderReady) {
                <button
                  type="button"
                  class="mj-strip-btn"
                  title="Start a new conversation"
                  (click)="OnStartNewConversation()"
                >
                  <i class="fa-solid fa-plus" aria-hidden="true"></i>
                  <span>New</span>
                </button>
              }
              <button
                type="button"
                class="mj-strip-btn"
                title="Open in MemberJunction Explorer"
                (click)="OnResumeConversationInExplorer()"
              >
                <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                <span>Explorer</span>
              </button>
            </div>
          </div>

          @if (IsProviderReady && CurrentUser) {
            <div class="mj-conversations-host">
              <mj-conversation-chat-area
                [Provider]="Provider"
                [environmentId]="EnvironmentId"
                [currentUser]="CurrentUser"
                [conversationId]="ActiveConversationId"
                [conversation]="ActiveConversation"
                [isNewConversation]="IsNewConversation"
                [pendingMessage]="PendingMessage"
                [pendingAttachments]="PendingAttachments"
                [pendingMessageConversationId]="PendingMessageConversationId"
                [linkedEntityId]="MatchedEntityId"
                [linkedRecordId]="PageDossier?.MatchedRecordID ?? null"
                [overlayMode]="true"
                [showExportButton]="false"
                [showShareButton]="false"
                [showArtifactIndicator]="true"
                [assistantDisplayName]="BrandProfile.AssistantDisplayName"
                [appContext]="AgentAppContext"
                [emptyStateGreeting]="EmptyStateGreeting"
                (conversationCreated)="OnConversationCreated($event)"
                (conversationRenamed)="OnConversationRenamed($event)"
                (pendingMessageConsumed)="OnPendingMessageConsumed()"
                (openEntityRecord)="OnOpenEntityRecordFromChat($event)"
              ></mj-conversation-chat-area>
            </div>
          } @else if (IsConnectingProvider) {
            <div class="mj-agent-placeholder">
              <div class="mj-spinner" aria-hidden="true"></div>
              <strong>Connecting {{ BrandProfile.AssistantDisplayName }} to MemberJunction...</strong>
              <p>Loading entity metadata and conversation workspace from {{ ConnectedServerUrl }}.</p>
            </div>
          } @else if (IsSignedIn && SyncedLightweightMessages.length > 0) {
            <!-- Lightweight RunViews-only mode (used when connected to a minimal RunViews test endpoint without full GetAllMetadata) -->
            <div class="mj-tab-scroll">
              <section class="mj-card">
                <div class="mj-facet-header">
                  <div>
                    <div class="mj-facet-app">Synced MJ Explorer Conversation</div>
                    <h3 class="mj-facet-title">{{ ActiveConversationName || 'Active Conversation' }}</h3>
                  </div>
                  <span class="mj-badge mj-badge-success">Live Sync</span>
                </div>
                <div class="mj-synced-messages">
                  @for (msg of SyncedLightweightMessages; track msg.ID) {
                    <div class="mj-synced-bubble" [class.mj-synced-user]="msg.Role === 'User'">
                      <div class="mj-synced-role">{{ msg.Role === 'User' ? 'You' : BrandProfile.AssistantDisplayName }}</div>
                      <div class="mj-synced-text">{{ msg.Message }}</div>
                    </div>
                  }
                </div>
              </section>
            </div>
          } @else if (IsSignedIn) {
            <div class="mj-agent-placeholder">
              <i class="fa-solid fa-rotate mj-placeholder-icon" aria-hidden="true"></i>
              <strong>Reconnect {{ BrandProfile.AssistantDisplayName }} Workspace</strong>
              <p>
                {{ ProviderConnectionError || 'Your saved token expired or the server restarted. Refresh your active session from MemberJunction Explorer.' }}
              </p>
              <button
                type="button"
                class="mj-btn mj-btn-primary"
                (click)="OnSyncFromMjExplorerTab()"
              >
                <i class="fa-solid fa-bolt" aria-hidden="true"></i>
                <span>Refresh Session from MJ Explorer</span>
              </button>
            </div>
          } @else {
            <div class="mj-agent-placeholder">
              <i class="fa-solid fa-comments mj-placeholder-icon" aria-hidden="true"></i>
              <strong>Sign in to launch {{ BrandProfile.AssistantDisplayName }}</strong>
              <p>
                Click <strong>Sign In via MemberJunction Explorer</strong> to mount the live MemberJunction Conversations workspace with text, artifacts, and realtime voice.
              </p>
              <button
                type="button"
                class="mj-btn mj-btn-primary"
                (click)="OnSyncFromMjExplorerTab()"
              >
                <i class="fa-solid fa-bolt" aria-hidden="true"></i>
                <span>Sign In via MemberJunction Explorer</span>
              </button>
            </div>
          }
        </div>

        <!-- TAB 3: ACTIONS & GUIDED PLAYBOOKS (100% Live DOM + Metadata-Driven — Zero Hardcoded Playbooks) -->
        @if (ActiveTab === 'playbooks') {
          <div class="mj-tab-scroll">
            <!-- 1. Contextual Agent & Record Quick Actions -->
            <section id="mj-contextual-actions-card" class="mj-card">
              <div class="mj-facet-header">
                <div>
                  <div class="mj-facet-app">Live Page &amp; MemberJunction</div>
                  <h2 class="mj-facet-title">Contextual Actions</h2>
                </div>
                <span class="mj-badge mj-badge-info">{{ ActiveHostLabel }}</span>
              </div>
              <div class="mj-toolbar-actions mj-top-gap">
                @for (act of ContextualQuickActions; track act.Id) {
                  <button
                    type="button"
                    class="mj-btn mj-btn-compact"
                    [class.mj-btn-primary]="act.Id === 'summarize-page'"
                    (click)="OnRunContextualQuickAction(act)"
                  >
                    <i [class]="act.IconClass" aria-hidden="true"></i>
                    <span>{{ act.Label }}</span>
                  </button>
                }
              </div>
            </section>

            <!-- 2. Live Grounded Interactive Elements on Active Browser Tab -->
            <section id="mj-grounded-elements-card" class="mj-card">
              <div class="mj-facet-header">
                <div>
                  <div class="mj-facet-app">DOM Perception · Coach-Marks</div>
                  <h2 class="mj-facet-title">Grounded Elements on {{ ActiveHostLabel }}</h2>
                </div>
                <span class="mj-badge mj-badge-neutral">
                  {{ FilteredInteractiveElements.length }} / {{ GroundedElementCount }}
                </span>
              </div>

              <div class="mj-toolbar-actions">
                <button type="button" class="mj-btn mj-btn-xs mj-btn-primary" (click)="ScanActiveTab()">
                  <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                  <span>Rescan Tab</span>
                </button>
                <button type="button" class="mj-btn mj-btn-xs" (click)="OnSpotlightPrimaryElement()">
                  <i class="fa-solid fa-bullseye" aria-hidden="true"></i>
                  <span>Spotlight #0</span>
                </button>
                <button type="button" class="mj-btn mj-btn-xs" (click)="OnClearSpotlights()">
                  <i class="fa-solid fa-eraser" aria-hidden="true"></i>
                  <span>Clear Highlights</span>
                </button>
              </div>

              @if (ExposureMode === 'none') {
                <p class="mj-card-body-copy mj-top-gap">
                  Page perception is paused (<code>Exposure: None</code>). Re-enable DOM State in Settings to inspect or spotlight live elements.
                </p>
              } @else if (GroundedElementCount === 0) {
                <p class="mj-card-body-copy mj-top-gap">
                  No grounded interactive elements captured yet. Focus an <code>http://</code> or <code>https://</code> tab and click <strong>Rescan Tab</strong>.
                </p>
              } @else {
                <search class="mj-elements-search mj-top-gap">
                  <label class="mj-field-label" for="mj-filter-elements-input">
                    Filter elements on {{ ActiveHostLabel }}
                  </label>
                  <input
                    id="mj-filter-elements-input"
                    name="elementFilter"
                    type="search"
                    class="mj-input"
                    [value]="ElementSearchQuery"
                    (input)="OnElementSearchInput($event)"
                    placeholder="Search buttons, links, inputs..."
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                  />
                  <div class="mj-role-filter-row" role="group" aria-label="Filter by element role">
                    <button
                      type="button"
                      class="mj-btn mj-btn-xs"
                      [class.mj-btn-primary]="ElementRoleFilter === 'all'"
                      (click)="SetElementRoleFilter('all')"
                    >
                      All ({{ GroundedElementCount }})
                    </button>
                    <button
                      type="button"
                      class="mj-btn mj-btn-xs"
                      [class.mj-btn-primary]="ElementRoleFilter === 'button'"
                      (click)="SetElementRoleFilter('button')"
                    >
                      Buttons
                    </button>
                    <button
                      type="button"
                      class="mj-btn mj-btn-xs"
                      [class.mj-btn-primary]="ElementRoleFilter === 'link'"
                      (click)="SetElementRoleFilter('link')"
                    >
                      Links
                    </button>
                    <button
                      type="button"
                      class="mj-btn mj-btn-xs"
                      [class.mj-btn-primary]="ElementRoleFilter === 'input'"
                      (click)="SetElementRoleFilter('input')"
                    >
                      Inputs
                    </button>
                  </div>
                </search>

                @if (FilteredInteractiveElements.length === 0) {
                  <p class="mj-card-body-copy mj-top-gap">
                    No elements match "{{ ElementSearchQuery }}" in filter <code>{{ ElementRoleFilter }}</code>.
                  </p>
                } @else {
                  <ul class="mj-grounded-element-list">
                    @for (el of FilteredInteractiveElements; track el.Index) {
                      <li class="mj-grounded-element-item">
                        <div class="mj-grounded-element-info">
                          <div class="mj-grounded-element-header">
                            <span class="mj-el-idx-pill">#{{ el.Index }}</span>
                            <span class="mj-el-role-pill">{{ el.Role }}</span>
                            @if (el.Scope) {
                              <span class="mj-el-scope-text">{{ el.Scope }}</span>
                            }
                          </div>
                          <div class="mj-grounded-element-name">{{ GetElementDisplayLabel(el) }}</div>
                        </div>
                        <div class="mj-grounded-element-actions">
                          <button
                            type="button"
                            class="mj-btn mj-btn-xs"
                            title="Draw Coach-Mark Spotlight on page"
                            (click)="OnSpotlightElement(el)"
                          >
                            Spotlight
                          </button>
                          <button
                            type="button"
                            class="mj-btn mj-btn-xs"
                            [disabled]="el.Disabled"
                            title="Click element on active tab"
                            (click)="OnClickGroundedElement(el)"
                          >
                            Click
                          </button>
                          <button
                            type="button"
                            class="mj-btn mj-btn-xs"
                            title="Ask Agent about this element"
                            (click)="OnAskAgentAboutElement(el)"
                          >
                            Ask
                          </button>
                        </div>
                      </li>
                    }
                  </ul>
                }
              }
            </section>

            <!-- 3. Metadata-Driven Guided Playbooks (from Application.AgentSettings.BrowserExtension.Playbooks) -->
            <section id="mj-guided-playbooks-card" class="mj-card mj-playbook-picker-card">
              @if (AvailablePlaybooks.length > 1) {
                <div class="mj-playbook-tabs">
                  @for (pb of AvailablePlaybooks; track pb.Id) {
                    <button
                      type="button"
                      class="mj-btn mj-btn-xs"
                      [class.mj-btn-primary]="SelectedPlaybook?.Id === pb.Id"
                      (click)="SelectPlaybook(pb)"
                    >
                      {{ pb.Name }}
                    </button>
                  }
                </div>
              }
              <mj-extension-playbook-stepper
                [Playbook]="SelectedPlaybook"
                [HostLabel]="ActiveHostLabel"
                [ActiveStepIndex]="ActivePlaybookStepIndex"
                (ExecuteStep)="OnExecutePlaybookStep($event)"
              ></mj-extension-playbook-stepper>
            </section>
          </div>
        }
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        font-family: var(
          --mj-font-family,
          Inter,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          Roboto,
          system-ui,
          sans-serif
        );
      }
      button,
      input,
      select,
      textarea {
        font-family: inherit;
      }
      .mj-sidepanel-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100vh;
        overflow: hidden;
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-primary, #0f172a);
        font-family: var(
          --mj-font-family,
          Inter,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          Roboto,
          system-ui,
          sans-serif
        );
      }
      .mj-sidepanel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 12px;
        border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
        background: var(--mj-bg-surface-card, #ffffff);
        flex-shrink: 0;
      }
      .mj-brand-identity {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
      }
      .mj-brand-mark {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        background: var(--mj-brand-primary, #0076b6);
        color: var(--mj-text-inverse, #ffffff);
        font-size: 11px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .mj-brand-copy {
        min-width: 0;
        flex: 1;
      }
      .mj-brand-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .mj-sidepanel-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.01em;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .mj-sidepanel-tagline {
        margin: 1px 0 0;
        font-size: 10.5px;
        color: var(--mj-text-secondary, #64748b);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mj-host-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 600;
        padding: 1.5px 6px;
        border-radius: 999px;
        background: var(--mj-bg-surface-sunken, #f1f5f9);
        color: var(--mj-brand-primary, #0076b6);
        max-width: 110px;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mj-header-actions {
        display: flex;
        align-items: center;
        gap: 5px;
        flex-shrink: 0;
      }
      .mj-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #16a34a;
        display: inline-block;
        flex-shrink: 0;
      }
      .mj-auth-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.2;
        padding: 4px 9px;
        border-radius: 999px;
        border: 1px solid var(--mj-border-default, #cbd5e1);
        background: var(--mj-bg-surface-sunken, #f8fafc);
        color: var(--mj-text-primary, #0f172a);
        cursor: pointer;
        max-width: 132px;
        white-space: nowrap;
        overflow: hidden;
      }
      .mj-auth-pill-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mj-auth-pill.connected {
        background: #dcfce7;
        border-color: #86efac;
        color: #15803d;
      }
      .mj-icon-btn {
        width: 27px;
        height: 27px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default, #cbd5e1);
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-secondary, #475569);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11.5px;
        padding: 0;
        flex-shrink: 0;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }
      .mj-icon-btn:hover {
        background: var(--mj-bg-surface-sunken, #f1f5f9);
        color: var(--mj-brand-primary, #0076b6);
        border-color: var(--mj-brand-primary, #0076b6);
      }
      .mj-drawer {
        display: none;
        flex-direction: column;
        gap: 8px;
        padding: 10px 12px;
        background: var(--mj-bg-surface-sunken, #f8fafc);
        border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
        flex-shrink: 0;
      }
      .mj-drawer.open {
        display: flex;
      }
      .mj-drawer-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .mj-drawer-title {
        font-size: 12px;
      }
      .mj-drawer-copy {
        margin: 0;
        font-size: 11px;
        line-height: 1.4;
        color: var(--mj-text-secondary, #475569);
      }
      .mj-signed-in-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 6px;
        background: #dcfce7;
        border: 1px solid #86efac;
        color: #14532d;
        font-size: 11px;
      }
      .mj-signed-in-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mj-catalog-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .mj-advanced-details {
        font-size: 11px;
        color: var(--mj-text-secondary, #475569);
      }
      .mj-advanced-summary {
        cursor: pointer;
        font-weight: 600;
        user-select: none;
      }
      .mj-advanced-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 8px;
      }
      .mj-field-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--mj-text-secondary, #475569);
      }
      .mj-input,
      .mj-select {
        width: 100%;
        font-family: inherit;
        font-size: 12px;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default, #cbd5e1);
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-primary, #0f172a);
      }
      .mj-trust-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .mj-el-counter {
        font-size: 10px;
        color: var(--mj-text-secondary, #64748b);
      }
      .mj-nav-tabs {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
        padding: 5px 10px;
        background: var(--mj-bg-surface-sunken, #f1f5f9);
        border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
        flex-shrink: 0;
      }
      .mj-nav-tab {
        padding: 6px 4px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        text-align: center;
        border-radius: 6px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--mj-text-secondary, #475569);
        cursor: pointer;
      }
      .mj-nav-tab.active {
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-brand-primary, #0076b6);
        border-color: var(--mj-border-default, #e2e8f0);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
      }
      .mj-main-viewport {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .mj-tab-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .mj-agent-pane {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .mj-agent-context-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 10px;
        border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
        background: var(--mj-bg-surface-sunken, #f8fafc);
        font-size: 11.5px;
        line-height: 1.3;
        flex-shrink: 0;
      }
      .mj-agent-context-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        flex: 1;
      }
      .mj-agent-context-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #16a34a;
        flex-shrink: 0;
      }
      .mj-agent-context-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--mj-text-primary, #0f172a);
        font-weight: 500;
      }
      .mj-agent-tools-count {
        color: var(--mj-text-secondary, #64748b);
        font-weight: 400;
        font-size: 11px;
      }
      .mj-agent-context-actions {
        display: flex;
        align-items: center;
        gap: 5px;
        flex-shrink: 0;
      }
      .mj-strip-btn {
        font-family: inherit;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.2;
        letter-spacing: -0.005em;
        padding: 4px 8px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default, #cbd5e1);
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-primary, #1e293b);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      }
      .mj-strip-btn i {
        font-size: 10px;
        color: var(--mj-brand-primary, #0076b6);
      }
      .mj-strip-btn:hover {
        background: var(--mj-bg-surface-sunken, #f1f5f9);
        border-color: var(--mj-brand-primary, #0076b6);
        color: var(--mj-brand-primary, #0076b6);
      }
      .mj-conversations-host {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .mj-conversations-host ::ng-deep mj-conversation-chat-area {
        flex: 1;
        min-height: 0;
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .mj-agent-placeholder {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 10px;
        padding: 24px 18px;
        color: var(--mj-text-secondary, #475569);
        font-size: 12px;
        line-height: 1.45;
      }
      .mj-placeholder-icon {
        font-size: 28px;
        color: var(--mj-brand-primary, #0076b6);
      }
      .mj-spinner {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        border: 2.5px solid var(--mj-border-default, #cbd5e1);
        border-top-color: var(--mj-brand-primary, #0076b6);
        animation: mj-spin 0.8s linear infinite;
      }
      @keyframes mj-spin {
        to {
          transform: rotate(360deg);
        }
      }
      .mj-card {
        border: 1px solid var(--mj-border-default, #e2e8f0);
        border-radius: var(--mj-radius-md, 10px);
        padding: 12px;
        background: var(--mj-bg-surface-card, #ffffff);
      }
      .mj-muted-card {
        background: var(--mj-bg-surface-sunken, #f8fafc);
      }
      .mj-card-kicker {
        display: block;
        font-size: 12px;
        color: var(--mj-text-primary, #0f172a);
      }
      .mj-card-body-copy {
        margin: 4px 0 0;
        font-size: 11px;
        line-height: 1.45;
        color: var(--mj-text-secondary, #475569);
      }
      .mj-entity-hero {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-bottom: 8px;
      }
      .mj-entity-avatar {
        width: 36px;
        height: 36px;
        border-radius: 9px;
        background: var(--mj-brand-primary, #0076b6);
        color: var(--mj-text-inverse, #ffffff);
        font-weight: 800;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .mj-entity-hero-body {
        min-width: 0;
        flex: 1;
      }
      .mj-entity-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .mj-entity-name {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
      }
      .mj-entity-sub {
        margin: 2px 0 0;
        font-size: 11px;
        color: var(--mj-text-secondary, #64748b);
      }
      .mj-kv-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
        padding: 4px 0;
        border-bottom: 1px dashed var(--mj-border-default, #e2e8f0);
      }
      .mj-kv-key {
        color: var(--mj-text-secondary, #64748b);
        flex-shrink: 0;
      }
      .mj-kv-val {
        font-weight: 600;
        text-align: right;
        word-break: break-word;
      }
      .mj-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 999px;
      }
      .mj-badge-success {
        background: #dcfce7;
        color: #15803d;
      }
      .mj-badge-info {
        background: #dbeafe;
        color: #1d4ed8;
      }
      .mj-badge-warn {
        background: #fef3c7;
        color: #b45309;
      }
      .mj-badge-neutral {
        background: #f1f5f9;
        color: #475569;
      }
      .mj-btn {
        font-family: inherit;
        border: 1px solid var(--mj-border-default, #cbd5e1);
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-primary, #0f172a);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.25;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .mj-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .mj-btn-compact {
        padding: 4px 7px;
        font-size: 11px;
      }
      .mj-btn-xs {
        padding: 3px 7px;
        font-size: 11px;
      }
      .mj-btn-primary {
        background: var(--mj-brand-primary, #0076b6);
        color: var(--mj-text-inverse, #ffffff);
        border-color: var(--mj-brand-primary, #0076b6);
      }
      .mj-btn-hero {
        width: 100%;
        justify-content: center;
        padding: 8px 12px;
        font-size: 12.5px;
        font-weight: 700;
      }
      .mj-toolbar-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .mj-top-gap {
        margin-top: 10px;
      }
      .mj-facet-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      .mj-facet-app {
        font-size: 10px;
        font-weight: 700;
        color: var(--mj-text-secondary, #64748b);
        text-transform: uppercase;
      }
      .mj-facet-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
      }
      .mj-facet-item {
        padding: 7px 9px;
        border-radius: 7px;
        background: var(--mj-bg-surface-sunken, #f8fafc);
        margin-top: 6px;
        font-size: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .mj-facet-item-title {
        font-weight: 600;
      }
      .mj-facet-item-sub {
        font-size: 11px;
        color: var(--mj-text-secondary, #64748b);
      }
      .mj-signals-details {
        font-size: 12px;
      }
      .mj-signals-summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--mj-brand-primary, #0076b6);
      }
      .mj-signals-list {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .mj-signal-line {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
      }
      .mj-sensitive-banner {
        padding: 8px 10px;
        border-radius: 8px;
        background: #fef3c7;
        color: #92400e;
        font-size: 11px;
        border: 1px solid #fcd34d;
      }
      .mj-status-toast {
        margin: 6px 12px 0;
        padding: 7px 10px;
        border-radius: 6px;
        font-size: 11px;
        background: #eff6ff;
        color: #1e40af;
        border: 1px solid #bfdbfe;
        flex-shrink: 0;
      }
      .mj-playbook-picker-card {
        padding: 0;
        overflow: hidden;
      }
      .mj-playbook-tabs {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        padding: 10px 12px;
        border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
        background: var(--mj-bg-surface-sunken, #f8fafc);
      }
      .mj-synced-messages {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }
      .mj-synced-bubble {
        padding: 8px 10px;
        border-radius: 8px;
        background: var(--mj-bg-surface-sunken, #f1f5f9);
        font-size: 12px;
      }
      .mj-synced-bubble.mj-synced-user {
        background: #dbeafe;
      }
      .mj-synced-role {
        font-size: 10px;
        font-weight: 700;
        color: var(--mj-text-secondary, #475569);
        margin-bottom: 2px;
      }
      .mj-synced-text {
        white-space: pre-wrap;
      }
      .mj-agent-context-dot.paused {
        background: #94a3b8;
      }
      .mj-elements-search {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .mj-role-filter-row {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
      }
      .mj-grounded-element-list {
        list-style: none;
        margin: 8px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 290px;
        overflow-y: auto;
      }
      .mj-grounded-element-item {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 9px;
        border-radius: 7px;
        border: 1px solid var(--mj-border-default, #e2e8f0);
        background: var(--mj-bg-surface-sunken, #f8fafc);
      }
      .mj-grounded-element-info {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .mj-grounded-element-header {
        display: flex;
        align-items: center;
        gap: 5px;
        flex-wrap: wrap;
      }
      .mj-el-idx-pill {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 4px;
        background: var(--mj-brand-primary, #0076b6);
        color: var(--mj-text-inverse, #ffffff);
      }
      .mj-el-role-pill {
        font-size: 10px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 4px;
        background: #e2e8f0;
        color: #334155;
      }
      .mj-el-scope-text {
        font-size: 10px;
        color: var(--mj-text-secondary, #64748b);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 150px;
      }
      .mj-grounded-element-name {
        font-size: 11.5px;
        font-weight: 600;
        color: var(--mj-text-primary, #0f172a);
        word-break: break-word;
      }
      .mj-grounded-element-actions {
        display: flex;
        align-items: center;
        gap: 5px;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class ExtensionSidePanelRootComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly realtimeSession = inject(RealtimeSessionService);
  private readonly agentClient = inject(AgentClientService);
  private readonly brandHydrator = new RuntimeBrandKitHydrator();

  public BrandProfile: ExtensionBrandProfile = DEFAULT_BRAND_PROFILE;
  public IsBootstrapped = false;
  public ActiveTab: SidePanelTabId = 'context';

  // Connection & Auth state
  public AuthDrawerOpen = false;
  public SettingsDrawerOpen = false;
  public IsSignedIn = false;
  public IsConnectingProvider = false;
  public IsProviderReady = false;
  public ProviderConnectionError: string | null = null;
  public ConnectedServerUrl = 'http://localhost:4115/';
  public ApiTokenInput = '';
  public SignedInUserDisplay = '';
  public SignedInUserEmail = '';
  public AuthProviderLabel = 'MJ Explorer';
  public LastOAuthUrl: string | null = null;
  public LastOAuthProvider: string | null = null;
  public DiscoveredProviders: DiscoveredAuthProviderCatalogEntry[] = [];

  // MemberJunction GraphQL Provider & Conversations state
  public GraphQLProvider: GraphQLDataProvider | null = null;
  public CurrentUser: UserInfo | null = null;
  public EnvironmentId: string = MJEnvironmentEntityExtended.DefaultEnvironmentID;
  public ActiveConversationId: string | null = null;
  public ActiveConversationName: string | null = null;
  public ActiveConversation: MJConversationEntity | null = null;
  public IsNewConversation = true;
  public PendingMessage: string | null = null;
  public PendingAttachments: ConversationChatAreaComponent['PendingAttachments'] = null;
  public PendingMessageConversationId: string | null = null;
  public SyncedLightweightMessages: SyncedConversationMessage[] = [];

  // Active Browser Tab & Braided Context state
  public ActiveTabId: number | null = null;
  public ActiveTabUrl = '';
  public ActiveHostLabel = 'Ready';
  public ExplorerTabId: number | null = null;
  public ExplorerOrigin = 'http://localhost:4215';
  public PageSnapshot: BrowserPageStateSnapshot | null = null;
  public PageDossier: LivePageContextDossier | null = null;
  public ExposureMode: RealtimeChannelExposure = 'state';
  public ControlBackendMode: BrowserControlBackendMode = 'content-script';

  // Actions Tab: Grounded Elements & Metadata-Driven Guided Playbooks (zero hardcoded playbooks)
  public ElementSearchQuery = '';
  public ElementRoleFilter: InteractiveElementRoleFilter = 'all';
  public ContextualQuickActions: ContextualQuickActionItem[] = [];
  public AvailablePlaybooks: BrowserPlaybookDefinition[] = [];
  public SelectedPlaybook: BrowserPlaybookDefinition | null = null;
  public ActivePlaybookStepIndex = 0;

  // Canonical AppContextSnapshot & Linked Entity Context for <mj-conversation-chat-area> + Realtime Voice
  public MatchedEntityId: string | null = null;
  public AgentAppContext: AppContextSnapshot = BuildAppContextSnapshot({
    App: {
      Name: DEFAULT_BRAND_PROFILE.BrandName,
      Description: DEFAULT_BRAND_PROFILE.Description,
    },
    Capabilities: { Tools: BROWSER_EXTENSION_TOOL_MANIFEST },
  });

  // Toast feedback
  public ToastMessage = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Dynamic Open App context rules, entity facets, prompt instructions & playbooks
  private installedAppNames: string[] = [];
  private dynamicContextRules: DynamicContextRuleEntry[] = [];
  private dynamicEntityFacets: DynamicEntityFacetEntry[] = [];
  private dynamicAgentPromptInstructions: string[] = [];
  private allConfiguredPlaybooks: DynamicPlaybookEntry[] = [];
  private pendingOAuthFlow: PendingOAuthPkceFlow | null = null;
  private boundForwardListener: ((ev: Event) => void) | null = null;

  public get AgentTabLabel(): string {
    return this.BrandProfile.AgentTabLabel || 'Agent';
  }

  public get BrandInitials(): string {
    return (this.BrandProfile.ShortName || 'MJ').slice(0, 2).toUpperCase();
  }

  public get GroundedElementCount(): number {
    return this.PageSnapshot?.InteractiveElements?.length ?? 0;
  }

  public get FilteredInteractiveElements(): InteractiveElement[] {
    const all = this.PageSnapshot?.InteractiveElements ?? [];
    const q = this.ElementSearchQuery.trim().toLowerCase();
    return all
      .filter((el) => {
        const role = (el.Role || '').toLowerCase();
        if (this.ElementRoleFilter === 'button' && !role.includes('button') && role !== 'tab' && role !== 'menuitem') {
          return false;
        }
        if (this.ElementRoleFilter === 'link' && !role.includes('link')) {
          return false;
        }
        if (
          this.ElementRoleFilter === 'input' &&
          !['textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'spinbutton', 'slider'].includes(role)
        ) {
          return false;
        }
        if (!q) {
          return true;
        }
        const hay = `${el.Name || ''} ${el.Role || ''} ${el.Scope || ''} ${el.Value || ''} #${el.Index}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }

  public get EmptyStateGreeting(): string {
    const target = this.PageDossier?.DisplayName;
    return target
      ? `Ask ${this.BrandProfile.AssistantDisplayName} about ${target}`
      : `How can ${this.BrandProfile.AssistantDisplayName} help with this page?`;
  }

  public ngOnInit(): void {
    this.hydrateBrandProfile();
    this.rebuildAgentAppContext();
    this.wireInProcessBrowserToolBridge();
    this.wireChromeExtensionListeners();
    void this.initializeSessionAndScan();
  }

  public ngOnDestroy(): void {
    if (this.boundForwardListener && typeof document !== 'undefined') {
      document.removeEventListener('mj-ext-command', this.boundForwardListener);
      this.boundForwardListener = null;
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  public SwitchTab(tab: SidePanelTabId): void {
    this.ActiveTab = tab;
    this.cdr.markForCheck();
  }

  public OnToggleAuthDrawer(): void {
    this.AuthDrawerOpen = !this.AuthDrawerOpen;
    if (this.AuthDrawerOpen) {
      this.SettingsDrawerOpen = false;
    }
    this.cdr.markForCheck();
  }

  public OnToggleSettingsDrawer(): void {
    this.SettingsDrawerOpen = !this.SettingsDrawerOpen;
    if (this.SettingsDrawerOpen) {
      this.AuthDrawerOpen = false;
    }
    this.cdr.markForCheck();
  }

  public OnServerUrlInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (input) {
      this.ConnectedServerUrl = input.value.trim();
    }
  }

  public OnApiTokenInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (input) {
      this.ApiTokenInput = input.value.trim();
    }
  }

  public OnExposureChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    const val = select?.value;
    if (val === 'state' || val === 'pixels' || val === 'none') {
      this.ExposureMode = val;
      if (val === 'none') {
        this.PageSnapshot = null;
        this.PageDossier = null;
        this.rebuildAgentAppContext();
      } else {
        void this.ScanActiveTab();
      }
      this.showToast(`Perception exposure set to "${val}".`);
    }
  }

  public OnBackendModeChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    const val = select?.value;
    if (val === 'content-script' || val === 'auto' || val === 'debugger-cdp') {
      this.ControlBackendMode = val;
      this.rebuildAgentAppContext();
      this.showToast(`Browser control mode set to "${val}".`);
    }
  }

  public GetInitials(label: string): string {
    const cleaned = (label || 'MJ').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase();
  }

  public async OnSyncFromMjExplorerTab(): Promise<void> {
    const synced = await this.syncWithOpenMjExplorerTab(false);
    if (!synced) {
      this.cdr.markForCheck();
    }
  }

  public async OnSaveAndConnectAuth(): Promise<void> {
    const token = this.ApiTokenInput.trim();
    const url = this.ConnectedServerUrl.trim() || 'http://localhost:4115/';
    if (!token) {
      this.showToast('Provide a Bearer Token or click "Sign In via MemberJunction Explorer".');
      return;
    }
    const claims = this.decodeJwtClaims(token);
    await this.applyAuthenticatedSession({
      provider: 'Bearer Token',
      idToken: token,
      userName: claims.name || claims.preferred_username || 'Authenticated User',
      email: claims.email || '',
      graphQLUrl: url,
      explorerOrigin: this.ExplorerOrigin,
      activeConversationId: this.ActiveConversationId ?? undefined,
    });
  }

  public OnSignOut(): void {
    this.agentClient.StopSession();
    this.IsSignedIn = false;
    this.IsProviderReady = false;
    this.GraphQLProvider = null;
    this.Provider = null;
    this.CurrentUser = null;
    this.ApiTokenInput = '';
    this.SignedInUserDisplay = '';
    this.SignedInUserEmail = '';
    this.ActiveConversationId = null;
    this.ActiveConversation = null;
    this.IsNewConversation = true;
    this.SyncedLightweightMessages = [];
    this.installedAppNames = [];
    this.dynamicContextRules = [];
    this.dynamicEntityFacets = [];
    this.dynamicAgentPromptInstructions = [];
    this.allConfiguredPlaybooks = [];
    this.AvailablePlaybooks = [];
    this.SelectedPlaybook = null;
    this.AuthDrawerOpen = true;
    const chromeApi = this.getChromeApi();
    chromeApi?.storage?.local?.remove('mj_ext_auth_session');
    this.rebuildAgentAppContext();
    void this.ScanActiveTab();
    this.showToast('Signed out of MemberJunction.');
    this.cdr.markForCheck();
  }

  public OnOpenMjExplorer(): void {
    const chromeApi = this.getChromeApi();
    const targetUrl = this.ExplorerOrigin || 'http://localhost:4215';
    if (chromeApi?.tabs) {
      void chromeApi.tabs.create({ url: targetUrl });
    } else if (typeof window !== 'undefined') {
      window.open(targetUrl, '_blank', 'noopener');
    }
  }

  public async OnResumeConversationInExplorer(): Promise<void> {
    await this.syncWithOpenMjExplorerTab(true);
    const chromeApi = this.getChromeApi();
    if (chromeApi?.tabs) {
      if (this.ExplorerTabId) {
        try {
          await chromeApi.tabs.update(this.ExplorerTabId, { active: true });
          if (this.ActiveConversationId) {
            await chromeApi.tabs.sendMessage(
              this.ExplorerTabId,
              {
                Type: 'MJ_CS_RESUME_CONVERSATION',
                Payload: { ConversationID: this.ActiveConversationId },
              },
              { frameId: 0 }
            );
            this.showToast('Switched to MemberJunction Explorer & resumed conversation!');
            return;
          }
        } catch {
          // Fall through to opening a fresh MJ Explorer tab
        }
      }
      const targetUrl = this.ActiveConversationId
        ? `${this.ExplorerOrigin}/?conversationId=${encodeURIComponent(this.ActiveConversationId)}`
        : this.ExplorerOrigin;
      await chromeApi.tabs.create({ url: targetUrl });
    }
  }

  public async OnDiscoverAuthProviders(): Promise<void> {
    const bases = [
      this.ConnectedServerUrl.replace(/\/graphql\/?$/, '').replace(/\/+$/, ''),
      'http://localhost:4115',
      'http://localhost:4000',
      'http://localhost:4103',
    ].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);

    for (const base of bases) {
      try {
        const resp = await fetch(`${base}/auth/providers`);
        if (resp.ok) {
          const body = (await resp.json()) as { providers?: DiscoveredAuthProviderCatalogEntry[] };
          const list = Array.isArray(body.providers) ? body.providers : [];
          if (list.length > 0) {
            this.DiscoveredProviders = list;
            this.showToast(`Discovered ${list.length} auth provider(s) from ${base}/auth/providers.`);
            this.cdr.markForCheck();
            return;
          }
        }
      } catch {
        // Try next candidate port
      }
    }
    this.showToast('Could not reach /auth/providers — use Microsoft or Auth0 Sign-In directly.');
  }

  public OnLaunchCatalogProvider(entry: DiscoveredAuthProviderCatalogEntry): void {
    const kind: 'msal' | 'auth0' = entry.type === 'auth0' ? 'auth0' : 'msal';
    void this.OnLaunchOAuthPopup(kind, entry);
  }

  public async OnLaunchOAuthPopup(
    providerType: 'msal' | 'auth0',
    catalogEntry: DiscoveredAuthProviderCatalogEntry | null
  ): Promise<void> {
    const { codeVerifier, codeChallenge } = await this.generatePkcePair();
    const stateToken = this.base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
    const nonceToken = this.base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
    const redirectUri = DEFAULT_OAUTH_CONFIG.msal.redirectUri;

    let authorizeUrl = '';
    let tokenEndpoint = '';
    let clientId = '';

    if (providerType === 'auth0') {
      clientId = catalogEntry?.clientId || DEFAULT_OAUTH_CONFIG.auth0.clientId;
      const rawDomain = catalogEntry?.domain || catalogEntry?.issuer || DEFAULT_OAUTH_CONFIG.auth0.domain;
      const cleanDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const scopes =
        catalogEntry?.scopes && catalogEntry.scopes.length > 0
          ? catalogEntry.scopes.join(' ')
          : DEFAULT_OAUTH_CONFIG.auth0.scopes.join(' ');
      tokenEndpoint = `https://${cleanDomain}/oauth/token`;
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: scopes,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: stateToken,
        nonce: nonceToken,
      });
      authorizeUrl = `https://${cleanDomain}/authorize?${params.toString()}`;
    } else {
      clientId = catalogEntry?.clientId || DEFAULT_OAUTH_CONFIG.msal.clientId;
      let authority =
        catalogEntry?.clientConfiguration?.authority ||
        (catalogEntry?.issuer ? catalogEntry.issuer.replace(/\/v2\.0\/?$/, '') : '') ||
        DEFAULT_OAUTH_CONFIG.msal.authority;
      authority = authority.replace(/\/+$/, '');
      const scopes =
        catalogEntry?.scopes && catalogEntry.scopes.length > 0
          ? catalogEntry.scopes.join(' ')
          : DEFAULT_OAUTH_CONFIG.msal.scopes.join(' ');
      tokenEndpoint = `${authority}/oauth2/v2.0/token`;
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: scopes,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: stateToken,
        nonce: nonceToken,
        prompt: 'select_account',
      });
      authorizeUrl = `${authority}/oauth2/v2.0/authorize?${params.toString()}`;
    }

    this.LastOAuthUrl = authorizeUrl;
    this.LastOAuthProvider = providerType;
    this.pendingOAuthFlow = {
      provider: providerType,
      clientId,
      redirectUri,
      codeVerifier,
      tokenEndpoint,
      state: stateToken,
      windowId: null,
      tabId: null,
    };
    this.cdr.markForCheck();

    const chromeApi = this.getChromeApi();
    if (chromeApi?.windows?.create) {
      try {
        const win: ChromeWindowCreateResult = await chromeApi.windows.create({
          url: authorizeUrl,
          type: 'popup',
          width: 520,
          height: 680,
          focused: true,
        });
        if (this.pendingOAuthFlow && win.id) {
          this.pendingOAuthFlow.windowId = win.id;
        }
        return;
      } catch {
        // Fall through to window.open
      }
    }
    if (typeof window !== 'undefined') {
      window.open(authorizeUrl, 'mj_oauth_pkce_popup', 'popup=yes,width=520,height=680');
    }
  }

  public async ScanActiveTab(): Promise<void> {
    if (this.ExposureMode === 'none') {
      this.PageSnapshot = null;
      this.PageDossier = null;
      this.rebuildAgentAppContext();
      this.cdr.markForCheck();
      return;
    }

    const snap = await this.sendToActiveTab<BrowserPageStateSnapshot>('MJ_CS_GET_PAGE_STATE', {});
    if (!snap || !snap.Url) {
      this.rebuildAgentAppContext();
      this.cdr.markForCheck();
      return;
    }

    this.PageSnapshot = snap;
    this.ActiveTabUrl = snap.Url;
    this.ActiveHostLabel = (snap.CapturedSignals?.['HostnameRoot'] || snap.Hostname || 'Web').slice(0, 22);

    const baseDossier = this.extractLivePageSignals(snap);
    this.PageDossier = await this.resolveLiveMjBraiding(baseDossier);
    this.rebuildAgentAppContext();
    this.cdr.markForCheck();
  }

  public OnElementSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.ElementSearchQuery = input?.value ?? '';
    this.cdr.markForCheck();
  }

  public SetElementRoleFilter(filter: InteractiveElementRoleFilter): void {
    this.ElementRoleFilter = filter;
    this.cdr.markForCheck();
  }

  public GetElementDisplayLabel(el: InteractiveElement): string {
    const label = (el.Name || el.Value || '').trim();
    if (label) {
      return label.length > 90 ? `${label.slice(0, 87)}...` : label;
    }
    return el.Selector || `Element #${el.Index}`;
  }

  public async OnSpotlightElement(el: InteractiveElement): Promise<void> {
    const labelText = this.GetElementDisplayLabel(el);
    const res = await this.sendToActiveTab<{ Success?: boolean }>('MJ_CS_HIGHLIGHT_ELEMENT', {
      Index: el.Index,
      Selector: el.Selector,
      StepBadge: `#${el.Index} · ${el.Role}`,
      Label: labelText,
    });
    if (res?.Success) {
      this.showToast(`Spotlighted #${el.Index} (${labelText}) on ${this.ActiveHostLabel}.`);
    } else {
      this.showToast(`Could not locate element #${el.Index} on active tab.`);
    }
  }

  public async OnClickGroundedElement(el: InteractiveElement): Promise<void> {
    const labelText = this.GetElementDisplayLabel(el);
    const res = await this.sendToActiveTab<{ Success?: boolean; ErrorMessage?: string }>('MJ_CS_CLICK_ELEMENT', {
      Index: el.Index,
      Selector: el.Selector,
    });
    if (res?.Success) {
      this.showToast(`Clicked #${el.Index} (${labelText}).`);
      setTimeout(() => {
        void this.ScanActiveTab();
      }, 350);
    } else {
      this.showToast(res?.ErrorMessage || `Could not click element #${el.Index}.`);
    }
  }

  public OnAskAgentAboutElement(el: InteractiveElement): void {
    const labelText = this.GetElementDisplayLabel(el);
    this.sendPromptToAgent(
      `Inspect interactive element #${el.Index} (${el.Role}: "${labelText}") on ${this.ActiveTabUrl || this.ActiveHostLabel}, highlight it on the page if helpful, and explain what it does or how to proceed.`
    );
  }

  public OnRunContextualQuickAction(action: ContextualQuickActionItem): void {
    if (action.Kind === 'open-in-explorer' && this.PageDossier) {
      this.OnOpenMatchedRecordInExplorer(this.PageDossier);
      return;
    }
    if (action.Kind === 'spotlight-page') {
      void this.OnSpotlightPrimaryElement();
      return;
    }
    if (action.Prompt) {
      this.sendPromptToAgent(action.Prompt);
    }
  }

  public async OnSpotlightPrimaryElement(): Promise<void> {
    const res = await this.sendToActiveTab<{ Success?: boolean }>('MJ_CS_HIGHLIGHT_ELEMENT', {
      Index: 0,
      StepBadge: this.BrandProfile.AssistantDisplayName,
      Label: `${this.BrandProfile.AssistantDisplayName} Spotlight`,
    });
    if (res?.Success) {
      this.showToast(`Highlighted primary interactive element on ${this.ActiveHostLabel}.`);
    } else {
      this.showToast('No interactive element available to spotlight on this tab.');
    }
  }

  public async OnClearSpotlights(): Promise<void> {
    await this.sendToActiveTab<{ Success?: boolean }>('MJ_CS_CLEAR_HIGHLIGHTS', {});
    this.showToast('Cleared Coach-Mark highlights on page.');
  }

  public SelectPlaybook(playbook: BrowserPlaybookDefinition): void {
    this.SelectedPlaybook = playbook;
    this.ActivePlaybookStepIndex = 0;
    this.cdr.markForCheck();
  }

  public async OnExecutePlaybookStep(event: PlaybookStepExecuteEvent): Promise<void> {
    if (!this.SelectedPlaybook) {
      return;
    }
    const step = this.SelectedPlaybook.Steps[event.StepIndex];
    if (!step) {
      return;
    }
    if (step.Kind === 'Navigate' && step.NavigateUrl) {
      const chromeApi = this.getChromeApi();
      if (chromeApi?.tabs && this.ActiveTabId) {
        await chromeApi.tabs.update(this.ActiveTabId, { url: step.NavigateUrl });
      }
    } else if (step.Kind === 'HighlightElement') {
      await this.sendToActiveTab('MJ_CS_HIGHLIGHT_ELEMENT', {
        Selector: step.TargetSelector,
        Label: step.Instruction,
        StepBadge: `Step ${event.StepIndex + 1} of ${this.SelectedPlaybook.Steps.length}`,
      });
    } else if (step.Kind === 'ClickElement') {
      await this.sendToActiveTab('MJ_CS_CLICK_ELEMENT', {
        Selector: step.TargetSelector,
      });
    } else if (step.Kind === 'FillInput') {
      await this.sendToActiveTab('MJ_CS_FILL_INPUT', {
        Selector: step.TargetSelector,
        Value: step.InputValue ?? '',
      });
    }
    if (this.ActivePlaybookStepIndex < this.SelectedPlaybook.Steps.length - 1) {
      this.ActivePlaybookStepIndex += 1;
    } else {
      this.showToast(`Completed playbook "${this.SelectedPlaybook.Name}"!`);
    }
    this.cdr.markForCheck();
  }

  public OnOpenMatchedRecordInExplorer(dossier: LivePageContextDossier): void {
    if (!dossier.MatchedRecordID || !dossier.MatchedEntityName) {
      return;
    }
    const url = `${this.ExplorerOrigin}/?entity=${encodeURIComponent(dossier.MatchedEntityName)}&recordId=${encodeURIComponent(dossier.MatchedRecordID)}`;
    const chromeApi = this.getChromeApi();
    if (chromeApi?.tabs) {
      void chromeApi.tabs.create({ url });
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  }

  public OnCaptureCandidateToMj(dossier: LivePageContextDossier): void {
    const summary = dossier.FieldEntries.map((e) => `${e.Key}: ${e.Value}`).join(', ');
    this.sendPromptToAgent(
      `Create or enrich a ${dossier.TargetEntityName} record in MemberJunction for "${dossier.DisplayName}" using these live page details: ${summary}`
    );
  }

  public OnAskAgentAboutPage(dossier: LivePageContextDossier): void {
    this.sendPromptToAgent(
      `Summarize this page (${dossier.DisplayName} — ${this.ActiveTabUrl}) and check any related MemberJunction records.`
    );
  }

  private sendPromptToAgent(prompt: string): void {
    this.ActiveTab = 'chat';
    if (this.IsProviderReady) {
      this.IsNewConversation = !this.ActiveConversationId;
      this.PendingMessageConversationId = this.ActiveConversationId;
      this.PendingMessage = prompt;
    } else {
      this.AuthDrawerOpen = true;
      this.showToast(`Sign in to MemberJunction first to run ${this.BrandProfile.AssistantDisplayName}.`);
    }
    this.cdr.markForCheck();
  }

  // --- @memberjunction/ng-conversations Event Handlers ---

  public OnStartNewConversation(): void {
    this.ActiveConversationId = null;
    this.ActiveConversation = null;
    this.ActiveConversationName = null;
    this.IsNewConversation = true;
    this.PendingMessage = null;
    this.PendingAttachments = null;
    this.PendingMessageConversationId = null;
    this.cdr.markForCheck();
  }

  public OnConversationCreated(
    event: Parameters<ConversationChatAreaComponent['ConversationCreated']['emit']>[0]
  ): void {
    if (!event) {
      return;
    }
    this.PendingMessage = event.pendingMessage || null;
    this.PendingAttachments = event.pendingAttachments || null;
    this.PendingMessageConversationId = event.conversation.ID;
    this.ActiveConversation = event.conversation;
    this.ActiveConversationId = event.conversation.ID;
    this.ActiveConversationName = event.conversation.Name || null;
    this.IsNewConversation = false;
    this.cdr.markForCheck();
  }

  public OnConversationRenamed(event: { conversationId: string; name: string; description: string }): void {
    if (this.ActiveConversation && this.ActiveConversation.ID === event.conversationId) {
      this.ActiveConversationName = event.name;
      this.cdr.markForCheck();
    }
  }

  public OnPendingMessageConsumed(): void {
    this.PendingMessage = null;
    this.PendingAttachments = null;
    this.PendingMessageConversationId = null;
    this.cdr.markForCheck();
  }

  public OnOpenEntityRecordFromChat(event: { entityName: string; compositeKey: CompositeKey }): void {
    const firstPair = event.compositeKey.KeyValuePairs?.[0];
    const recordId = firstPair ? String(firstPair.Value ?? '') : '';
    const url = `${this.ExplorerOrigin}/?entity=${encodeURIComponent(event.entityName)}&recordId=${encodeURIComponent(recordId)}`;
    const chromeApi = this.getChromeApi();
    if (chromeApi?.tabs) {
      void chromeApi.tabs.create({ url });
    }
  }

  // --- Internal Plumbing ---

  private hydrateBrandProfile(): void {
    const win = (typeof window !== 'undefined' ? window : undefined) as SidePanelWindowGlobals | undefined;
    if (win?.__MJ_EXTENSION_BRAND_PROFILE__) {
      this.BrandProfile = win.__MJ_EXTENSION_BRAND_PROFILE__;
    }
    this.ControlBackendMode = this.BrandProfile.DefaultControlBackend || 'content-script';
    if (this.BrandProfile.DefaultServerUrl) {
      this.ConnectedServerUrl = this.BrandProfile.DefaultServerUrl;
    }
    if (typeof document !== 'undefined') {
      const hydrated = this.brandHydrator.HydrateFromBrandProfile(this.BrandProfile);
      this.brandHydrator.ApplyThemeToDocument(document, hydrated);
      document.title = this.BrandProfile.SidePanelHeaderTitle || this.BrandProfile.BrandName;
    }
  }

  /**
   * Assembles the canonical `AppContextSnapshot` (via `BuildAppContextSnapshot` from `@memberjunction/ai-core-plus`)
   * consumed by `BaseAgent.buildAppContextSection` + `BaseAgent.resolveClientToolsForRun` on text runs
   * AND streamed live to `RealtimeSessionService` (`ClientContextChannel` + `ContextTool`) on voice runs.
   * Also refreshes contextual quick actions and metadata-configured playbooks for the active tab.
   */
  private rebuildAgentAppContext(): void {
    this.refreshContextualQuickActionsAndPlaybooks();

    let resolvedEntityId: string | null = null;
    if (this.IsProviderReady && this.PageDossier?.MatchedInMJ && this.PageDossier.MatchedEntityName) {
      try {
        const md = new Metadata();
        const foundEntity = md.Entities.find(
          (e) => e.Name.toLowerCase() === this.PageDossier!.MatchedEntityName!.toLowerCase()
        );
        resolvedEntityId = foundEntity?.ID ?? null;
      } catch {
        resolvedEntityId = null;
      }
    }
    this.MatchedEntityId = resolvedEntityId;

    const snap = this.ExposureMode === 'none' ? null : this.PageSnapshot;
    const dossier = this.ExposureMode === 'none' ? null : this.PageDossier;

    const basePromptInstructions = [
      `You are ${this.BrandProfile.AssistantDisplayName}, operating inside the MemberJunction Browser Extension Side Panel alongside the user's active web browser tab.`,
      'Use ActiveBrowserTab, ExtractedPageSignals, TopGroundedElements, and MatchedMemberJunctionRecord below directly without asking the user what URL or page they are looking at.',
      'Use Browser Extension client tools (GetActiveTabPageState, HighlightElementOnPage, ClearPageHighlights, ClickElementOnPage, FillInputOnPage) to inspect fresh DOM state, spotlight elements with Shadow-DOM Coach-Marks, click elements, or fill inputs; confirm with the user before destructive clicks or form submissions.',
      ...this.dynamicAgentPromptInstructions,
    ].join(' ');

    const additionalContext: Record<string, unknown> = {
      Surface: 'BrowserExtensionSidePanel',
      ExposureMode: this.ExposureMode,
      BrowserControlMode: this.ControlBackendMode,
      SpecialAgentInstructions: basePromptInstructions,
    };

    if (snap) {
      additionalContext['ActiveBrowserTab'] = {
        Url: snap.Url,
        Title: snap.Title,
        Hostname: snap.Hostname,
        IsAuthOrMfaScreen: snap.IsAuthOrMfaScreen,
        GroundedElementCount: snap.InteractiveElements?.length ?? 0,
        MetaDescription: snap.OpenGraph?.['description'] || snap.MetaTags?.['description'] || null,
      };
      additionalContext['VisiblePageExcerpt'] = snap.IsAuthOrMfaScreen
        ? '[Redacted on sensitive login/MFA screen]'
        : (snap.VisibleTextExcerpt || '').slice(0, 2500);
      additionalContext['TopGroundedElements'] = (snap.InteractiveElements ?? []).slice(0, 20).map((el) => ({
        Index: el.Index,
        Role: el.Role,
        Name: (el.Name || el.Value || '').slice(0, 80),
        Selector: el.Selector,
        Disabled: Boolean(el.Disabled),
      }));
    }

    if (dossier) {
      additionalContext['ExtractedPageSignals'] = dossier.Fields;
      additionalContext['MatchedMemberJunctionRecord'] = dossier.MatchedInMJ
        ? {
            MatchedInMJ: true,
            EntityName: dossier.MatchedEntityName,
            RecordID: dossier.MatchedRecordID,
            DisplayName: dossier.DisplayName,
            RelatedFacets: dossier.Facets.map((f) => ({
              App: f.App,
              Header: f.Header,
              Badge: f.Badge,
              Items: f.Items.slice(0, 5).map((item) => ({
                RecordID: item.RecordID,
                Title: item.Title,
                Subtitle: item.Subtitle,
              })),
            })),
          }
        : {
            MatchedInMJ: false,
            CandidateTargetEntity: dossier.TargetEntityName,
            DisplayName: dossier.DisplayName,
            ProposedFields: dossier.Fields,
          };
    }

    const visibleEntities: string[] = [];
    if (dossier?.MatchedEntityName) {
      visibleEntities.push(dossier.MatchedEntityName);
    } else if (dossier?.TargetEntityName) {
      visibleEntities.push(dossier.TargetEntityName);
    }

    this.AgentAppContext = BuildAppContextSnapshot({
      App: {
        Name: this.BrandProfile.BrandName,
        Description:
          "MemberJunction Browser Extension Side Panel running alongside the user's live web browser tab with grounded DOM perception, Coach-Mark Spotlights, and multi-app MemberJunction context braiding.",
      },
      ActiveNavItem: {
        Name:
          this.ExposureMode === 'none'
            ? 'Page Context Paused'
            : dossier
              ? `${dossier.DisplayName} (${this.ActiveHostLabel})`
              : this.ActiveHostLabel,
        Description:
          this.ExposureMode === 'none'
            ? 'User paused browser tab perception (Exposure: none).'
            : snap?.Title
              ? `${snap.Title} — ${snap.Url}`
              : this.ActiveTabUrl || 'Browser Extension Side Panel',
        ResourceType: 'Active Browser Tab',
      },
      OtherNavItems: [
        { Name: 'Context', Description: '360° MemberJunction entity resolution and Open App facets for active tab' },
        { Name: this.AgentTabLabel, Description: 'AI Agent chat, artifacts, and realtime voice' },
        { Name: 'Actions', Description: 'Live grounded DOM elements and metadata-driven playbooks' },
      ],
      NavigableApps: this.installedAppNames.map((Name) => ({ Name })),
      User: {
        Name: this.CurrentUser?.Name || this.SignedInUserDisplay || '',
        Roles: this.CurrentUser?.UserRoles?.map((r) => r.Role) ?? [],
      },
      View: {
        VisibleEntities: visibleEntities,
        Selection:
          dossier?.MatchedInMJ && dossier.MatchedRecordID && dossier.MatchedEntityName
            ? { EntityName: dossier.MatchedEntityName, RecordIDs: [dossier.MatchedRecordID] }
            : null,
        FreeText:
          this.ExposureMode === 'none'
            ? 'Browser tab perception is paused by the user.'
            : snap?.Url
              ? `Active browser tab: "${snap.Title || this.ActiveHostLabel}" (${snap.Url}) with ${this.GroundedElementCount} grounded interactive elements.`
              : 'No http/https browser tab currently focused.',
      },
      AdditionalContext: additionalContext,
      Capabilities: {
        Tools: this.ExposureMode === 'none' ? [] : BROWSER_EXTENSION_TOOL_MANIFEST,
      },
    });

    this.realtimeSession.UpdateAppContext(this.AgentAppContext);
  }

  private refreshContextualQuickActionsAndPlaybooks(): void {
    const actions: ContextualQuickActionItem[] = [];
    const pageLabel = this.PageDossier?.DisplayName || this.ActiveHostLabel;
    const urlContext = this.ActiveTabUrl ? ` (${this.ActiveTabUrl})` : '';

    actions.push({
      Id: 'summarize-page',
      Label: 'Summarize This Page',
      IconClass: 'fa-solid fa-wand-magic-sparkles',
      Kind: 'agent-prompt',
      Prompt: `Summarize the active page "${pageLabel}"${urlContext}, highlighting the key facts and any relevant MemberJunction context.`,
    });

    actions.push({
      Id: 'extract-action-items',
      Label: 'Extract Key Signals & Next Steps',
      IconClass: 'fa-solid fa-list-check',
      Kind: 'agent-prompt',
      Prompt: `Extract the structured facts, key entities, and recommended action items from "${pageLabel}"${urlContext}.`,
    });

    if (this.PageDossier?.MatchedInMJ && this.PageDossier.MatchedRecordID) {
      actions.push({
        Id: 'mj-360-briefing',
        Label: `360° Briefing: ${this.PageDossier.DisplayName}`,
        IconClass: 'fa-solid fa-layer-group',
        Kind: 'agent-prompt',
        Prompt: `Prepare a 360° MemberJunction briefing for "${this.PageDossier.DisplayName}" (${this.PageDossier.MatchedEntityName} ID: ${this.PageDossier.MatchedRecordID}), combining live page signals with MemberJunction records.`,
      });
      actions.push({
        Id: 'open-matched-in-explorer',
        Label: 'Open Record in Explorer',
        IconClass: 'fa-solid fa-arrow-up-right-from-square',
        Kind: 'open-in-explorer',
      });
    } else if (this.PageDossier) {
      const summary = this.PageDossier.FieldEntries.map((e) => `${e.Key}: ${e.Value}`).join(', ');
      actions.push({
        Id: 'capture-candidate-to-mj',
        Label: `Create ${this.PageDossier.TargetEntityName} in MJ`,
        IconClass: 'fa-solid fa-plus',
        Kind: 'agent-prompt',
        Prompt: `Create or enrich a ${this.PageDossier.TargetEntityName} record in MemberJunction for "${this.PageDossier.DisplayName}" using these live page details: ${summary}`,
      });
    }

    // Append any metadata-configured QuickActions from matching Open App EntityFacets
    if (this.PageDossier) {
      const anchor = this.PageDossier.MatchedEntityName || this.PageDossier.TargetEntityName;
      for (const facet of this.dynamicEntityFacets) {
        const parent = facet.AnchorEntityName || facet.ParentEntityName || '';
        if ((parent === anchor || parent === this.PageDossier.TargetEntityName) && Array.isArray(facet.QuickActions)) {
          facet.QuickActions.forEach((qa, qaIdx) => {
            if (!qa.Label || !qa.Target) {
              return;
            }
            const interpolated = qa.Target.replace(
              /\{\{?AnchorRecordID\}?\}/g,
              this.PageDossier?.MatchedRecordID || ''
            )
              .replace(/\{\{?DisplayName\}?\}/g, this.PageDossier?.DisplayName || '')
              .replace(/\{\{?Url\}?\}/g, this.ActiveTabUrl || '');
            actions.push({
              Id: `facet-qa-${facet.Title || 'app'}-${qaIdx}`,
              Label: qa.Label,
              IconClass: qa.IconClass || 'fa-solid fa-bolt',
              Kind: qa.Kind === 'open-in-explorer' ? 'open-in-explorer' : 'agent-prompt',
              Prompt: interpolated,
            });
          });
        }
      }
    }

    this.ContextualQuickActions = actions;

    // Filter / prioritize metadata-configured playbooks for the active URL (ZERO hardcoded playbooks!)
    const activeUrlLower = (this.ActiveTabUrl || '').toLowerCase();
    const matchingPlaybooks = this.allConfiguredPlaybooks.filter((pb) => {
      if (Array.isArray(pb.UrlPatterns) && pb.UrlPatterns.length > 0) {
        return pb.UrlPatterns.some((pat) => {
          const clean = pat.replace(/\*/g, '').trim().toLowerCase();
          return !clean || activeUrlLower.includes(clean);
        });
      }
      return true;
    });

    this.AvailablePlaybooks = matchingPlaybooks;
    if (matchingPlaybooks.length === 0) {
      this.SelectedPlaybook = null;
      this.ActivePlaybookStepIndex = 0;
    } else if (!this.SelectedPlaybook || !matchingPlaybooks.some((p) => p.Id === this.SelectedPlaybook?.Id)) {
      this.SelectedPlaybook = matchingPlaybooks[0];
      this.ActivePlaybookStepIndex = 0;
    }
  }

  /**
   * Routes `MJ_EXT_FORWARD_TO_ACTIVE_TAB` CustomEvents emitted by
   * `ConversationsRuntimeBootstrap` (`GetActiveTabPageState`, `HighlightElementOnPage`,
   * `ClearPageHighlights`, `ClickElementOnPage`, `FillInputOnPage`) directly to the
   * active tab's content script (`frameId: 0`) in-process!
   */
  private wireInProcessBrowserToolBridge(): void {
    if (typeof document === 'undefined') {
      return;
    }
    this.boundForwardListener = (ev: Event): void => {
      const customEv = ev as CustomEvent<{
        RequestId?: string;
        Type?: string;
        Payload?: {
          CommandType?: string;
          CommandPayload?: Record<string, string | number | boolean | undefined>;
        };
      }>;
      const detail = customEv.detail;
      if (!detail || detail.Type !== 'MJ_EXT_FORWARD_TO_ACTIVE_TAB' || !detail.RequestId) {
        return;
      }
      const reqId = detail.RequestId;
      if (this.ExposureMode === 'none') {
        document.dispatchEvent(
          new CustomEvent('mj-ext-response', {
            detail: {
              RequestId: reqId,
              Result: {
                Success: false,
                ErrorMessage: 'Browser tab perception is paused by the user (Exposure: none).',
              },
            },
          })
        );
        return;
      }
      const commandType = detail.Payload?.CommandType || 'MJ_CS_GET_PAGE_STATE';
      const commandPayload = detail.Payload?.CommandPayload ?? {};
      void (async () => {
        const result = await this.sendToActiveTab<Record<string, string | number | boolean | object | null>>(
          commandType,
          commandPayload
        );
        document.dispatchEvent(
          new CustomEvent('mj-ext-response', {
            detail: {
              RequestId: reqId,
              Result: result ?? { Success: false, ErrorMessage: 'No active tab content script response' },
            },
          })
        );
      })();
    };
    document.addEventListener('mj-ext-command', this.boundForwardListener);
  }

  private wireChromeExtensionListeners(): void {
    const chromeApi = this.getChromeApi();
    if (!chromeApi) {
      return;
    }
    chromeApi.tabs?.onActivated?.addListener(() => {
      void this.ScanActiveTab();
    });
    chromeApi.tabs?.onUpdated?.addListener((_tabId, changeInfo, tab) => {
      const candidateUrl = changeInfo.url || tab.url;
      if (candidateUrl && this.pendingOAuthFlow) {
        void this.handleOAuthRedirectUrl(candidateUrl);
      }
      if (changeInfo.status === 'complete' && tab.active) {
        void this.ScanActiveTab();
      }
    });
    chromeApi.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
      if (message?.Type === 'MJ_EXT_ACTIVE_TAB_UPDATED') {
        void this.ScanActiveTab();
        return;
      }
      if (
        (message?.Type === 'MJ_EXT_SESSION_HANDOFF' || message?.Type === 'MJ_EXT_HOST_SYNC') &&
        message.Payload
      ) {
        const p = message.Payload;
        if (p.Origin || p.HostOrigin) {
          this.ExplorerOrigin = p.Origin || p.HostOrigin || this.ExplorerOrigin;
        }
        const shouldAcceptToken =
          Boolean(p.IdToken) &&
          !this.isJwtExpired(p.IdToken!) &&
          (!this.IsSignedIn || !this.IsProviderReady || p.IdToken !== this.ApiTokenInput);
        if (shouldAcceptToken && p.IdToken) {
          const claims = this.decodeJwtClaims(p.IdToken);
          void this.applyAuthenticatedSession({
            provider: 'MJ Explorer',
            idToken: p.IdToken,
            userName: claims.name || claims.preferred_username || claims.nickname || 'MJ User',
            email: claims.email || claims.preferred_username || '',
            graphQLUrl: p.GraphQLUrl || this.ConnectedServerUrl,
            explorerOrigin: this.ExplorerOrigin,
            activeConversationId: p.ConversationID,
          });
          sendResponse({ Received: true });
          return;
        }
        if (p.ConversationID && p.ConversationID !== this.ActiveConversationId) {
          this.ActiveConversationId = p.ConversationID;
          this.IsNewConversation = false;
          if (this.IsProviderReady) {
            void ConversationEngine.Instance.Config(true).then(() => {
              const found = ConversationEngine.Instance.Conversations.find(
                (c) => c.ID.toLowerCase() === p.ConversationID!.toLowerCase()
              );
              if (found) {
                this.ActiveConversation = found;
                this.ActiveConversationName = found.Name;
              }
              this.cdr.markForCheck();
            });
          } else if (this.IsSignedIn) {
            void this.loadLightweightConversationMessages(p.ConversationID).then(() => {
              this.cdr.markForCheck();
            });
          }
          this.cdr.markForCheck();
        }
        sendResponse({ Received: true });
      }
    });
  }

  private async initializeSessionAndScan(): Promise<void> {
    try {
      // 1. Always check open MemberJunction Explorer tabs FIRST so a signed-in MJ Explorer
      //    user connects immediately with a fresh token (including MSAL v5 encrypted sessions)
      //    and never sees a stale expired cached token or a redundant sign-in prompt.
      const syncedFromLiveTab = await this.syncWithOpenMjExplorerTab(true);

      // 2. If no open MJ Explorer tab provided a live session, fall back to persisted storage
      //    only when the stored JWT has not expired.
      if (!syncedFromLiveTab) {
        const chromeApi = this.getChromeApi();
        if (chromeApi?.storage?.local) {
          const stored = await new Promise<PersistedAuthSession | undefined>((resolve) => {
            chromeApi.storage!.local!.get(['mj_ext_auth_session'], (items) => {
              resolve(items?.mj_ext_auth_session);
            });
          });
          if (stored?.idToken) {
            if (!this.isJwtExpired(stored.idToken)) {
              await this.applyAuthenticatedSession(stored);
            } else {
              chromeApi.storage.local.remove('mj_ext_auth_session');
            }
          }
        }
      }

      await this.ScanActiveTab();
    } finally {
      this.AuthDrawerOpen = !this.IsSignedIn;
      this.IsBootstrapped = true;
      this.cdr.markForCheck();
    }
  }

  /**
   * Reads the live authenticated `GraphQLDataProvider` directly from an open MJ Explorer tab's
   * `MAIN` world (`window['___SINGLETON__GraphQLDataProvider']`), automatically invoking its
   * `RefreshTokenFunction` when near expiry. This works across every auth provider (including
   * `@azure/msal-browser` v5 AES-GCM encrypted `localStorage`, Auth0, Okta, Cognito, WorkOS,
   * and Local Dev). Falls back to `content-script.js` (`MJ_CS_GET_MJ_HOST_SESSION`) if needed.
   */
  private async extractHostSessionFromTab(
    tabId: number,
    tabUrl: string
  ): Promise<MjHostSessionExtractResult | null> {
    const chromeApi = this.getChromeApi();
    if (!chromeApi) {
      return null;
    }

    if (chromeApi.scripting) {
      try {
        const results = await chromeApi.scripting.executeScript<MjHostSessionExtractResult | null>({
          target: { tabId },
          world: 'MAIN',
          func: async (): Promise<MjHostSessionExtractResult | null> => {
            interface InPageGlobalStore {
              ___SINGLETON__GraphQLDataProvider?: {
                ConfigData?: {
                  Token?: string;
                  URL?: string;
                  WSURL?: string;
                  RefreshTokenFunction?: () => Promise<string>;
                };
                CurrentUser?: {
                  Name?: string;
                  Email?: string;
                };
              };
            }
            const win: Window & InPageGlobalStore = window;
            const gql = win.___SINGLETON__GraphQLDataProvider;
            if (!gql?.ConfigData) {
              return null;
            }
            let token = gql.ConfigData.Token || '';
            if (token) {
              try {
                const segs = token.split('.');
                if (segs.length >= 2) {
                  const payloadJson = atob(segs[1].replace(/-/g, '+').replace(/_/g, '/'));
                  const parsed = JSON.parse(payloadJson) as { exp?: number };
                  if (
                    parsed.exp &&
                    parsed.exp * 1000 < Date.now() + 120_000 &&
                    typeof gql.ConfigData.RefreshTokenFunction === 'function'
                  ) {
                    const refreshed = await gql.ConfigData.RefreshTokenFunction();
                    if (refreshed) {
                      token = refreshed;
                    }
                  }
                }
              } catch {
                // Keep existing in-memory token if decode/refresh fails
              }
            }
            if (!token) {
              return null;
            }
            let convId =
              (document.documentElement &&
                document.documentElement.getAttribute('data-mj-active-conversation-id')) ||
              '';
            if (!convId) {
              try {
                const u = new URL(window.location.href);
                convId = u.searchParams.get('conversationId') || u.searchParams.get('ConversationID') || '';
              } catch {
                convId = '';
              }
            }
            return {
              Success: true,
              HasHostSession: true,
              IdToken: token,
              GraphQLUrl: gql.ConfigData.URL || null,
              ConversationID: convId || null,
              LastSessionID: null,
              Origin: window.location.origin,
              Url: window.location.href,
              UserName: gql.CurrentUser?.Name || null,
              UserEmail: gql.CurrentUser?.Email || null,
            };
          },
        });
        const mainResult = results?.[0]?.result ?? null;
        if (mainResult?.Success && mainResult.IdToken) {
          return mainResult;
        }
      } catch {
        // Fall through to isolated content-script inspection
      }
    }

    if (chromeApi.tabs) {
      try {
        return await chromeApi.tabs.sendMessage<MjHostSessionExtractResult>(
          tabId,
          { Type: 'MJ_CS_GET_MJ_HOST_SESSION' },
          { frameId: 0 }
        );
      } catch {
        if (tabUrl.startsWith('http://localhost:42') && chromeApi.scripting) {
          try {
            await chromeApi.scripting.executeScript({
              target: { tabId },
              files: ['content-script.js'],
            });
            return await chromeApi.tabs.sendMessage<MjHostSessionExtractResult>(
              tabId,
              { Type: 'MJ_CS_GET_MJ_HOST_SESSION' },
              { frameId: 0 }
            );
          } catch {
            return null;
          }
        }
      }
    }

    return null;
  }

  private async syncWithOpenMjExplorerTab(silent: boolean): Promise<boolean> {
    const chromeApi = this.getChromeApi();
    if (chromeApi?.tabs) {
      try {
        const allTabs = await chromeApi.tabs.query({});
        // Prioritize localhost:42xx / memberjunction tabs first so scanning is instant
        const sortedTabs = [...allTabs].sort((a, b) => {
          const score = (u: string | undefined): number => {
            if (!u) return 0;
            if (u.startsWith('http://localhost:42')) return 3;
            if (u.includes('memberjunction')) return 2;
            if (u.startsWith('http://localhost:')) return 1;
            return 0;
          };
          return score(b.url) - score(a.url);
        });

        let fallbackExplorerTabId: number | null = null;
        for (const tab of sortedTabs) {
          if (!tab.id || !tab.url) {
            continue;
          }
          const isCandidateHost =
            tab.url.startsWith('http://localhost:') ||
            tab.url.startsWith('https://') ||
            tab.url.includes('memberjunction');
          if (!isCandidateHost) {
            continue;
          }

          const hostSession = await this.extractHostSessionFromTab(tab.id, tab.url);

          if (hostSession?.Success && (hostSession.HasHostSession || tab.url.startsWith('http://localhost:42'))) {
            this.ExplorerTabId = tab.id;
            if (tab.url.startsWith('http://localhost:42')) {
              fallbackExplorerTabId = tab.id;
            }
            if (hostSession.Origin) {
              this.ExplorerOrigin = hostSession.Origin;
            }
            if (hostSession.GraphQLUrl) {
              this.ConnectedServerUrl = hostSession.GraphQLUrl;
            }
            if (hostSession.ConversationID) {
              this.ActiveConversationId = hostSession.ConversationID;
              this.IsNewConversation = false;
            }
            if (hostSession.IdToken && !this.isJwtExpired(hostSession.IdToken)) {
              const claims = this.decodeJwtClaims(hostSession.IdToken);
              await this.applyAuthenticatedSession({
                provider: 'MJ Explorer',
                idToken: hostSession.IdToken,
                userName:
                  hostSession.UserName ||
                  claims.name ||
                  claims.preferred_username ||
                  claims.nickname ||
                  'MJ User',
                email: hostSession.UserEmail || claims.email || claims.preferred_username || '',
                graphQLUrl: hostSession.GraphQLUrl || this.ConnectedServerUrl,
                explorerOrigin: hostSession.Origin || this.ExplorerOrigin,
                activeConversationId: hostSession.ConversationID ?? undefined,
              });
              if (!silent) {
                this.showToast(`Connected via MemberJunction Explorer (${this.ExplorerOrigin})!`);
              }
              return true;
            }
          }
        }

        if (!silent && fallbackExplorerTabId) {
          await chromeApi.tabs.update(fallbackExplorerTabId, { active: true });
          this.showToast('Focused MemberJunction Explorer — finish signing in there to connect.');
          return false;
        }
      } catch {
        // Ignore tab enumeration errors
      }
    }

    if (!silent) {
      const candidateUrls = ['http://localhost:4215', 'http://localhost:4200', 'http://localhost:4203'];
      let targetUrl = this.ExplorerOrigin || 'http://localhost:4215';
      for (const candidate of candidateUrls) {
        try {
          const resp = await fetch(candidate, { method: 'HEAD' });
          if (resp.ok) {
            targetUrl = candidate;
            this.ExplorerOrigin = candidate;
            break;
          }
        } catch {
          // Try next port
        }
      }
      if (chromeApi?.tabs) {
        await chromeApi.tabs.create({ url: targetUrl });
      }
      this.showToast(`Opening MemberJunction Explorer (${targetUrl}) — sign in there to connect.`);
    }
    return false;
  }

  private async refreshTokenFromExplorerTab(): Promise<string> {
    if (this.ExplorerTabId) {
      const refreshed = await this.extractHostSessionFromTab(this.ExplorerTabId, this.ExplorerOrigin);
      if (refreshed?.IdToken) {
        this.ApiTokenInput = refreshed.IdToken;
        return refreshed.IdToken;
      }
    }
    return this.ApiTokenInput;
  }

  private async applyAuthenticatedSession(session: PersistedAuthSession): Promise<void> {
    this.IsSignedIn = true;
    this.ProviderConnectionError = null;
    this.ApiTokenInput = session.idToken;
    this.AuthProviderLabel = session.provider || 'MJ Explorer';
    this.SignedInUserDisplay = session.userName || session.email || 'Authenticated User';
    this.SignedInUserEmail = session.email || '';
    if (session.graphQLUrl) {
      this.ConnectedServerUrl = session.graphQLUrl;
    }
    if (session.explorerOrigin) {
      this.ExplorerOrigin = session.explorerOrigin;
    }
    if (session.activeConversationId) {
      this.ActiveConversationId = session.activeConversationId;
      this.IsNewConversation = false;
    }
    this.AuthDrawerOpen = false;
    this.SettingsDrawerOpen = false;

    const chromeApi = this.getChromeApi();
    chromeApi?.storage?.local?.set({ mj_ext_auth_session: session });

    this.IsConnectingProvider = true;
    this.cdr.markForCheck();

    await this.connectMjGraphQLProvider(session.idToken, this.ConnectedServerUrl);

    if (this.CurrentUser) {
      this.SignedInUserDisplay = this.CurrentUser.Name || this.SignedInUserDisplay;
      this.SignedInUserEmail = this.CurrentUser.Email || this.SignedInUserEmail;
    }

    this.IsConnectingProvider = false;
    await this.loadInstalledOpenAppMetadata();
    if (!this.IsProviderReady && this.ActiveConversationId) {
      await this.loadLightweightConversationMessages(this.ActiveConversationId);
    }
    await this.ScanActiveTab();
    this.cdr.markForCheck();
  }

  /**
   * Connects `@memberjunction/graphql-dataprovider` directly to `MJAPI` so
   * `<mj-conversation-chat-area>` runs natively inside the Side Panel.
   * Gracefully falls back to lightweight `RunViews` mode if connected to a test mock
   * that does not implement full `GetAllMetadata`.
   */
  private async connectMjGraphQLProvider(idToken: string, preferredUrl: string): Promise<void> {
    const resolvedUrl = await this.probeLiveGraphQLEndpoint(idToken, preferredUrl);
    this.ConnectedServerUrl = resolvedUrl;
    const wsUrl = resolvedUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');

    try {
      const config = new GraphQLProviderConfigData(
        idToken,
        resolvedUrl,
        wsUrl,
        async () => this.refreshTokenFromExplorerTab()
      );
      const provider = await SetupGraphQLClient(config);
      this.GraphQLProvider = provider;
      this.Provider = provider;
      if (provider.sessionId) {
        this.agentClient.StartSession(provider.sessionId);
      }

      const md = new Metadata();
      this.CurrentUser = md.CurrentUser;
      this.EnvironmentId = MJEnvironmentEntityExtended.DefaultEnvironmentID;

      await Promise.allSettled([
        AIEngineBase.Instance.Config(false),
        ArtifactMetadataEngine.Instance.Config(false),
        UserInfoEngine.Instance.Config(false),
        ConversationEngine.Instance.Config(false),
      ]);

      if (this.ActiveConversationId) {
        const existing = ConversationEngine.Instance.Conversations.find(
          (c) => c.ID.toLowerCase() === this.ActiveConversationId!.toLowerCase()
        );
        if (existing) {
          this.ActiveConversation = existing;
          this.ActiveConversationName = existing.Name;
          this.IsNewConversation = false;
        }
      }

      this.IsProviderReady = Boolean(this.CurrentUser);
      this.ProviderConnectionError = null;
    } catch (err) {
      // Lightweight RunViews-only mode (e.g. synthetic test route without GetAllMetadata) or expired token
      this.IsProviderReady = false;
      this.ProviderConnectionError = err instanceof Error ? err.message : String(err);
    }
  }

  private async probeLiveGraphQLEndpoint(idToken: string, preferredUrl: string): Promise<string> {
    const candidates = [
      preferredUrl,
      'http://localhost:4115/',
      'http://localhost:4115/graphql',
      'http://localhost:4000/graphql',
      'http://localhost:4000/',
      'http://localhost:4103/',
    ].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);

    const authHeader = idToken.startsWith('Bearer ') ? idToken : `Bearer ${idToken}`;
    let firstReachableEndpoint: string | null = null;

    for (const endpoint of candidates) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify({ query: 'query { __typename }' }),
        });
        if (resp.ok) {
          if (!firstReachableEndpoint) {
            firstReachableEndpoint = endpoint;
          }
          const payload = (await resp.json()) as {
            data?: { __typename?: string };
            errors?: Array<{ message?: string }>;
          };
          if (payload?.data && (!payload.errors || payload.errors.length === 0)) {
            return endpoint;
          }
        }
      } catch {
        // Try next candidate
      }
    }
    return firstReachableEndpoint || preferredUrl || 'http://localhost:4115/';
  }

  private async executeRawGraphQL<TData>(
    query: string,
    variables: Record<string, object | string | number | boolean | null>
  ): Promise<TData | null> {
    const candidates = [
      this.ConnectedServerUrl,
      'http://localhost:4115/',
      'http://localhost:4000/graphql',
      'http://localhost:4000/',
    ].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.ApiTokenInput) {
      headers['Authorization'] = this.ApiTokenInput.startsWith('Bearer ')
        ? this.ApiTokenInput
        : `Bearer ${this.ApiTokenInput}`;
    }

    for (const endpoint of candidates) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, variables }),
        });
        if (resp.ok) {
          const payload = (await resp.json()) as { data?: TData; errors?: object[] };
          if (payload?.data && !payload.errors) {
            this.ConnectedServerUrl = endpoint;
            return payload.data;
          }
        }
      } catch {
        // Try next candidate
      }
    }
    return null;
  }

  private async runViewsViaGraphQL(
    inputs: Array<{ EntityName: string; ExtraFilter?: string; OrderBy?: string; MaxRows?: number }>
  ): Promise<GraphQLRunViewBatchItem[] | null> {
    const query = `
      query RunViewsQuery($input: [RunViewGenericInput!]!) {
        RunViews(input: $input) {
          Results {
            PrimaryKey { FieldName Value }
            EntityID
            Data
          }
          RowCount
          TotalRowCount
          Success
          ErrorMessage
        }
      }
    `;
    const formatted = inputs.map((v) => ({
      EntityName: v.EntityName,
      ExtraFilter: v.ExtraFilter || '',
      OrderBy: v.OrderBy || '',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: v.MaxRows || 10,
      ForceAuditLog: false,
      ResultType: 'simple',
    }));

    interface RawRunViewsResponse {
      RunViews?: Array<{
        Success?: boolean;
        TotalRowCount?: number;
        ErrorMessage?: string;
        Results?: Array<
          | { Data?: string | Record<string, string | number | boolean | null | undefined> }
          | Record<string, string | number | boolean | null | undefined>
        >;
      }>;
    }

    const data = await this.executeRawGraphQL<RawRunViewsResponse>(query, { input: formatted });
    if (!data || !Array.isArray(data.RunViews)) {
      return null;
    }

    return data.RunViews.map((rv) => ({
      Success: Boolean(rv?.Success),
      TotalRowCount: rv?.TotalRowCount ?? 0,
      ErrorMessage: rv?.ErrorMessage,
      Results: Array.isArray(rv?.Results)
        ? rv.Results.map((row) => {
            if (row && typeof row === 'object' && 'Data' in row && row.Data !== undefined) {
              if (typeof row.Data === 'string') {
                try {
                  return JSON.parse(row.Data) as Record<string, string | number | boolean | null | undefined>;
                } catch {
                  return {};
                }
              }
              if (row.Data && typeof row.Data === 'object') {
                return row.Data;
              }
            }
            return row as Record<string, string | number | boolean | null | undefined>;
          })
        : [],
    }));
  }

  private async loadInstalledOpenAppMetadata(): Promise<void> {
    if (!this.IsSignedIn) {
      return;
    }
    const res = await this.runViewsViaGraphQL([
      { EntityName: 'MJ: Applications', ExtraFilter: '', MaxRows: 50 },
    ]);
    if (!res || !res[0]?.Success) {
      return;
    }

    const rules: DynamicContextRuleEntry[] = [];
    const facets: DynamicEntityFacetEntry[] = [];
    const promptInstructions: string[] = [];
    const playbooks: DynamicPlaybookEntry[] = [];
    const names: string[] = [];

    for (const app of res[0].Results) {
      const appName = String(app['Name'] ?? '');
      if (appName) {
        names.push(appName);
      }
      const rawSettings = app['AgentSettings'];
      if (!rawSettings) {
        continue;
      }
      const serialized = typeof rawSettings === 'string' ? rawSettings : JSON.stringify(rawSettings);
      const parsed = ParseAgentSettings(serialized);
      const ext = parsed?.BrowserExtension;
      if (!ext) {
        continue;
      }
      if (typeof ext.AgentPromptInstructions === 'string' && ext.AgentPromptInstructions.trim().length > 0) {
        promptInstructions.push(`[${appName || 'MJ App'}]: ${ext.AgentPromptInstructions.trim()}`);
      }
      const rawRules = ext.ContextRules as Array<DynamicContextRuleEntry & { Key?: string; Name?: string }> | null | undefined;
      if (Array.isArray(rawRules)) {
        for (const r of rawRules) {
          rules.push({
            ...r,
            RuleName: r.RuleName || r.Key || r.Name,
            EntityName: r.EntityName || r.EntityResolution?.EntityName,
          });
        }
      }
      const rawFacets = ext.EntityFacets as DynamicEntityFacetEntry[] | null | undefined;
      if (Array.isArray(rawFacets)) {
        for (const f of rawFacets) {
          facets.push({
            ...f,
            SourceApp: appName || 'MJ Open App',
          });
        }
      }
      if (Array.isArray(ext.Playbooks)) {
        for (const pb of ext.Playbooks) {
          if (pb && pb.Id && pb.Name && Array.isArray(pb.Steps) && pb.Steps.length > 0) {
            playbooks.push({
              Id: pb.Id,
              Name: pb.Name,
              Description: pb.Description || '',
              StartUrl: pb.StartUrl,
              UrlPatterns: pb.UrlPatterns,
              PreferredBackend: pb.PreferredBackend,
              Steps: pb.Steps,
              SourceApp: appName || 'MJ Open App',
            });
          }
        }
      }
    }

    this.installedAppNames = names;
    this.dynamicContextRules = rules;
    this.dynamicEntityFacets = facets;
    this.dynamicAgentPromptInstructions = promptInstructions;
    this.allConfiguredPlaybooks = playbooks;
    this.rebuildAgentAppContext();
  }

  private async loadLightweightConversationMessages(conversationId: string): Promise<void> {
    const safeId = conversationId.replace(/'/g, "''");
    const res = await this.runViewsViaGraphQL([
      { EntityName: 'MJ: Conversations', ExtraFilter: `ID = '${safeId}'`, MaxRows: 1 },
      {
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: `ConversationID = '${safeId}'`,
        OrderBy: '__mj_CreatedAt ASC',
        MaxRows: 20,
      },
    ]);
    if (!res) {
      return;
    }
    const convRow = res[0]?.Results?.[0];
    if (convRow?.['Name']) {
      this.ActiveConversationName = String(convRow['Name']);
    }
    const details = res[1]?.Results ?? [];
    this.SyncedLightweightMessages = details.map((d, idx) => ({
      ID: String(d['ID'] ?? `msg-${idx}`),
      Role: String(d['Role'] ?? 'AI'),
      Message: String(d['Message'] ?? ''),
    }));
  }

  private extractLivePageSignals(snap: BrowserPageStateSnapshot): LivePageContextDossier {
    const url = snap.Url || '';
    const host = snap.Hostname || '';
    const signals = snap.CapturedSignals || {};
    const og = snap.OpenGraph || {};
    const meta = snap.MetaTags || {};

    const isLinkedInProfile = host.includes('linkedin.com') && url.includes('/in/');
    const isLinkedInCompany = host.includes('linkedin.com') && url.includes('/company/');

    if (isLinkedInProfile) {
      let rawTitle = (snap.Title || '').split('|')[0].trim();
      if (rawTitle.startsWith('(') && rawTitle.indexOf(')') > 0) {
        rawTitle = rawTitle.slice(rawTitle.indexOf(')') + 1).trim();
      }
      const parts = rawTitle.split(' - ');
      const fullName = signals['PrimaryHeading'] || parts[0] || 'LinkedIn Profile';
      const headline = signals['Headline'] || parts.slice(1).join(' - ') || meta['description'] || '';
      const location = signals['Location'] || '';
      const handleMatch = url.split('/in/')[1] ? url.split('/in/')[1].split('/')[0].split('?')[0] : 'profile';
      const safeName = fullName.replace(/'/g, "''");
      const safeHandle = handleMatch.replace(/'/g, "''");

      const fields: Record<string, string> = {
        FullName: fullName,
        LinkedInURL: `https://www.linkedin.com/in/${handleMatch}`,
        SourceDomain: 'linkedin.com',
      };
      if (headline) {
        fields['Title'] = headline;
      }
      if (location) {
        fields['Location'] = location;
      }

      return {
        EntityType: 'Person Candidate',
        RuleName: 'common.person.linkedin',
        TargetEntityName: 'People',
        LookupFilter: `LinkedInURL LIKE '%${safeHandle}%' OR Name LIKE '%${safeName}%'`,
        SearchQuery: `${fullName} ${handleMatch}`,
        DisplayName: fullName,
        Subtitle: headline || `linkedin.com/in/${handleMatch}`,
        BadgeText: `LinkedIn /in/${handleMatch}`,
        MatchedInMJ: false,
        MatchedRecordID: null,
        MatchedEntityName: null,
        Fields: fields,
        FieldEntries: Object.entries(fields).map(([Key, Value]) => ({ Key, Value })),
        Facets: [],
      };
    }

    const orgName =
      (isLinkedInCompany ? signals['PrimaryHeading'] : '') ||
      og['site_name'] ||
      og['og:site_name'] ||
      (snap.Title ? snap.Title.split(' - ')[0].split('|')[0].trim() : '') ||
      signals['HostnameRoot'] ||
      host ||
      'Active Web Page';

    const description =
      og['description'] ||
      meta['description'] ||
      signals['Headline'] ||
      (snap.VisibleTextExcerpt ? snap.VisibleTextExcerpt.slice(0, 160) : '');

    const cleanDomain = (signals['HostnameRoot'] || host || '').replace(/^www\./, '').replace(/'/g, "''");
    const safeOrg = orgName.replace(/'/g, "''");

    const fields: Record<string, string> = {
      Name: orgName,
      Website: url,
      Domain: signals['HostnameRoot'] || host,
    };
    if (description) {
      fields['Description'] = description.slice(0, 200);
    }

    return {
      EntityType: 'Web Domain',
      RuleName: 'common.organization.by-domain',
      TargetEntityName: 'Organizations',
      LookupFilter: cleanDomain
        ? `Website LIKE '%${cleanDomain}%' OR Name LIKE '%${safeOrg}%'`
        : `Name LIKE '%${safeOrg}%'`,
      SearchQuery: `${orgName} ${cleanDomain}`,
      DisplayName: orgName,
      Subtitle: signals['HostnameRoot'] || host,
      BadgeText: signals['HostnameRoot'] || 'Web Domain',
      MatchedInMJ: false,
      MatchedRecordID: null,
      MatchedEntityName: null,
      Fields: fields,
      FieldEntries: Object.entries(fields).map(([Key, Value]) => ({ Key, Value })),
      Facets: [],
    };
  }

  private async resolveLiveMjBraiding(dossier: LivePageContextDossier): Promise<LivePageContextDossier> {
    if (!this.IsSignedIn) {
      return dossier;
    }
    if (this.installedAppNames.length === 0) {
      await this.loadInstalledOpenAppMetadata();
    }

    const matchingRule = this.dynamicContextRules.find((r) => {
      const ruleEntity = r.EntityName || r.EntityResolution?.EntityName || '';
      return (
        r.RuleName === dossier.RuleName ||
        ruleEntity.toLowerCase().includes(dossier.TargetEntityName.toLowerCase())
      );
    });
    const candidateRuleEntity = matchingRule?.EntityName || matchingRule?.EntityResolution?.EntityName || '';
    const anchorEntity =
      (candidateRuleEntity && !candidateRuleEntity.startsWith('MJ:') ? candidateRuleEntity : '') ||
      dossier.TargetEntityName ||
      'Organizations';

    const stage1Inputs: Array<{ EntityName: string; ExtraFilter?: string; OrderBy?: string; MaxRows?: number }> = [
      {
        EntityName: anchorEntity,
        ExtraFilter: dossier.LookupFilter,
        MaxRows: 5,
      },
    ];
    if (!this.IsProviderReady) {
      stage1Inputs.push({
        EntityName: 'MJ: Conversations',
        ExtraFilter: '',
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: 5,
      });
    }

    const stage1Res = await this.runViewsViaGraphQL(stage1Inputs);
    if (!stage1Res) {
      return dossier;
    }

    const anchorRes = stage1Res[0];
    const convsRes = stage1Res[1];

    if (!this.IsProviderReady && convsRes?.Success && convsRes.Results.length > 0 && !this.ActiveConversationId) {
      const latestConv = convsRes.Results[0];
      if (latestConv['ID']) {
        this.ActiveConversationId = String(latestConv['ID']);
        this.ActiveConversationName = String(latestConv['Name'] ?? 'Active Conversation');
        await this.loadLightweightConversationMessages(this.ActiveConversationId);
      }
    }

    if (anchorRes?.Success && anchorRes.Results.length > 0) {
      const matched = anchorRes.Results[0];
      const matchedId = String(matched['ID'] ?? '');
      dossier.MatchedInMJ = true;
      dossier.MatchedRecordID = matchedId || null;
      dossier.MatchedEntityName = anchorEntity;
      const recordName = matched['Name'] || matched['FullName'];
      if (recordName) {
        dossier.DisplayName = String(recordName);
      }
      dossier.EntityType = anchorEntity;

      const matchingFacets = this.dynamicEntityFacets.filter((f) => {
        const parent = f.AnchorEntityName || f.ParentEntityName || '';
        return parent === anchorEntity || parent === dossier.TargetEntityName;
      });

      if (matchingFacets.length > 0 && matchedId) {
        const safeId = matchedId.replace(/'/g, "''");
        const stage2Inputs = matchingFacets.map((f) => {
          const rawTemplate = f.Query?.FilterTemplate || f.ForeignKeyFilterTemplate || '';
          const filter = rawTemplate
            ? rawTemplate.replace(/\{\{?AnchorRecordID\}?\}/g, safeId)
            : f.ForeignKeyField
              ? `${f.ForeignKeyField} = '${safeId}'`
              : '';
          return {
            EntityName: f.Query?.EntityName || f.FacetEntityName || f.RelatedEntityName || 'People',
            ExtraFilter: filter,
            OrderBy: f.Query?.OrderBy || f.OrderBy || '',
            MaxRows: f.Query?.MaxRows || f.MaxRecords || 5,
          };
        });

        const stage2Res = await this.runViewsViaGraphQL(stage2Inputs);
        if (stage2Res) {
          const facetGroups: LiveBraidedFacetGroup[] = [];
          stage2Res.forEach((rv, idx) => {
            const spec = matchingFacets[idx];
            if (rv?.Success && rv.Results.length > 0) {
              const facetEntity = spec.Query?.EntityName || spec.FacetEntityName || spec.RelatedEntityName || 'Records';
              facetGroups.push({
                App: spec.ApplicationName || spec.SourceApp || 'MJ Open App',
                Header: spec.HeaderLabel || spec.Title || facetEntity,
                Badge: `${rv.TotalRowCount} in MJ`,
                Items: rv.Results.map((row) => ({
                  RecordID: String(row['ID'] ?? ''),
                  EntityName: facetEntity,
                  Title: String(
                    (spec.TitleField ? row[spec.TitleField] : undefined) ??
                      row['Name'] ??
                      row['FullName'] ??
                      row['Title'] ??
                      row['ID'] ??
                      'Record'
                  ),
                  Subtitle: String(
                    (spec.SubtitleField ? row[spec.SubtitleField] : undefined) ??
                      row['Status'] ??
                      row['Title'] ??
                      facetEntity
                  ),
                  Badge: String((spec.BadgeField ? row[spec.BadgeField] : undefined) ?? 'MJ Live'),
                })),
              });
            }
          });
          dossier.Facets = facetGroups;
        }
      }
    }

    return dossier;
  }

  private async handleOAuthRedirectUrl(rawUrl: string): Promise<void> {
    if (!this.pendingOAuthFlow || !rawUrl.startsWith(this.pendingOAuthFlow.redirectUri)) {
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }

    const queryParams = new URLSearchParams(parsed.search);
    const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
    const code = queryParams.get('code') || hashParams.get('code');
    const directIdToken = hashParams.get('id_token') || queryParams.get('id_token');
    const oauthErr = queryParams.get('error') || hashParams.get('error');

    if (!code && !directIdToken && !oauthErr) {
      return;
    }

    const flow = this.pendingOAuthFlow;
    this.pendingOAuthFlow = null;

    const chromeApi = this.getChromeApi();
    if (flow.windowId && chromeApi?.windows?.remove) {
      void chromeApi.windows.remove(flow.windowId).catch(() => {});
    }

    if (oauthErr) {
      this.showToast(`OAuth Sign-In error: ${oauthErr}`);
      return;
    }

    if (directIdToken) {
      const claims = this.decodeJwtClaims(directIdToken);
      await this.applyAuthenticatedSession({
        provider: flow.provider,
        idToken: directIdToken,
        userName: claims.name || claims.preferred_username || 'MJ User',
        email: claims.email || '',
      });
      return;
    }

    if (code) {
      try {
        const body = new URLSearchParams({
          client_id: flow.clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: flow.redirectUri,
          code_verifier: flow.codeVerifier,
        });
        const resp = await fetch(flow.tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        const tokenData = (await resp.json()) as {
          id_token?: string;
          access_token?: string;
          error?: string;
          error_description?: string;
        };
        const jwt = tokenData.id_token || tokenData.access_token;
        if (jwt) {
          const claims = this.decodeJwtClaims(jwt);
          await this.applyAuthenticatedSession({
            provider: flow.provider,
            idToken: jwt,
            accessToken: tokenData.access_token,
            userName: claims.name || claims.preferred_username || 'MJ User',
            email: claims.email || '',
          });
          this.showToast(`Signed in via ${flow.provider.toUpperCase()}!`);
        } else {
          this.showToast(`Token exchange error: ${tokenData.error_description || tokenData.error || 'No token'}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.showToast(`PKCE token exchange failed: ${msg}`);
      }
    }
  }

  private async sendToActiveTab<TResponse>(
    type: string,
    payload: Record<string, string | number | boolean | undefined>
  ): Promise<TResponse | null> {
    const chromeApi = this.getChromeApi();
    if (!chromeApi?.tabs) {
      return null;
    }

    let tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
    let targetTab = tabs.find(
      (t) => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://'))
    );
    if (!targetTab) {
      const allTabs = await chromeApi.tabs.query({});
      targetTab = allTabs.find(
        (t) => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://'))
      );
    }
    if (!targetTab?.id) {
      return null;
    }

    this.ActiveTabId = targetTab.id;
    try {
      return await chromeApi.tabs.sendMessage<TResponse>(
        targetTab.id,
        { Type: type, Payload: payload },
        { frameId: 0 }
      );
    } catch {
      if (chromeApi.scripting && targetTab.url && /^https?:\/\//.test(targetTab.url)) {
        try {
          await chromeApi.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ['content-script.js'],
          });
          return await chromeApi.tabs.sendMessage<TResponse>(
            targetTab.id,
            { Type: type, Payload: payload },
            { frameId: 0 }
          );
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private getChromeApi(): ChromeExtensionNamespace | undefined {
    const win = (typeof window !== 'undefined' ? window : undefined) as SidePanelWindowGlobals | undefined;
    return win?.chrome;
  }

  private showToast(message: string): void {
    this.ToastMessage = message;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.ToastMessage = '';
      this.cdr.markForCheck();
    }, 3800);
    this.cdr.markForCheck();
  }

  private base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private async generatePkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const codeVerifier = this.base64UrlEncode(randomBytes);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const codeChallenge = this.base64UrlEncode(new Uint8Array(digest));
    return { codeVerifier, codeChallenge };
  }

  private isJwtExpired(jwt: string, bufferSeconds = 30): boolean {
    const claims = this.decodeJwtClaims(jwt);
    if (typeof claims.exp === 'number' && claims.exp > 0) {
      return claims.exp * 1000 < Date.now() + bufferSeconds * 1000;
    }
    return false;
  }

  private decodeJwtClaims(jwt: string): {
    name?: string;
    preferred_username?: string;
    nickname?: string;
    email?: string;
    exp?: number;
  } {
    try {
      const parts = jwt.split('.');
      if (parts.length < 2) {
        return {};
      }
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(json) as {
        name?: string;
        preferred_username?: string;
        nickname?: string;
        email?: string;
        exp?: number;
      };
    } catch {
      return {};
    }
  }
}
