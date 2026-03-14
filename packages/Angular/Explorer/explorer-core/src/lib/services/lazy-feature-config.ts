/**
 * Maps resource type names to lazy-loading functions for each feature chunk.
 * The import() calls point to the feature module files in @memberjunction/ng-dashboards
 * and @memberjunction/ng-explorer-settings using subpath exports.
 *
 * When a resource type is not found in ClassFactory, the LazyModuleRegistry uses
 * this config to load the chunk containing that resource type. Loading a feature
 * module triggers all @RegisterClass decorators within it, making its components
 * available to ClassFactory.
 */

/** Helper to create a loader that all resource types in a feature share. */
function featureLoader(importFn: () => Promise<unknown>): () => Promise<void> {
  return () => importFn().then(() => {});
}

// --- AI Dashboard feature chunk ---
const loadAI = featureLoader(() => import('@memberjunction/ng-dashboards/ai-dashboards.module'));

// --- Actions Dashboard feature chunk ---
const loadActions = featureLoader(() => import('@memberjunction/ng-dashboards/actions-dashboards.module'));

// --- Testing Dashboard feature chunk ---
const loadTesting = featureLoader(() => import('@memberjunction/ng-dashboards/testing-dashboards.module'));

// --- Scheduling Dashboard feature chunk ---
const loadScheduling = featureLoader(() => import('@memberjunction/ng-dashboards/scheduling-dashboards.module'));

// --- Communication Dashboard feature chunk ---
const loadCommunication = featureLoader(() => import('@memberjunction/ng-dashboards/communication-dashboards.module'));

// --- Credentials Dashboard feature chunk ---
const loadCredentials = featureLoader(() => import('@memberjunction/ng-dashboards/credentials-dashboards.module'));

// --- Data Explorer feature chunk ---
const loadDataExplorer = featureLoader(() => import('@memberjunction/ng-dashboards/data-explorer-dashboards.module'));

// --- Lists Dashboard feature chunk ---
const loadLists = featureLoader(() => import('@memberjunction/ng-dashboards/lists-dashboards.module'));

// --- Component Studio feature chunk ---
const loadComponentStudio = featureLoader(() => import('@memberjunction/ng-dashboards/component-studio-dashboards.module'));

// --- Integration feature chunk ---
const loadIntegration = featureLoader(() => import('@memberjunction/ng-dashboards/integration.module'));

// --- MCP feature chunk ---
const loadMCP = featureLoader(() => import('@memberjunction/ng-dashboards/mcp.module'));

// --- Explorer Settings feature chunk ---
const loadSettings = featureLoader(() => import(
  /* webpackChunkName: "explorer-settings" */
  '@memberjunction/ng-explorer-settings'
));

/**
 * Complete mapping of resource type strings to lazy-loading functions.
 * Covers both BaseResourceComponent and BaseDashboard registrations.
 */
export const LAZY_FEATURE_CONFIG: Record<string, () => Promise<void>> = {
  // ── AI Dashboard (BaseResourceComponent types) ──
  'AIModelsResource':       loadAI,
  'AIPromptsResource':      loadAI,
  'AIAgentsResource':       loadAI,
  'AIMonitorResource':      loadAI,
  'AIConfigResource':       loadAI,

  // ── Actions Dashboard (BaseResourceComponent types) ──
  'ActionsOverviewResource':  loadActions,
  'ActionsMonitorResource':   loadActions,
  'ActionsScheduleResource':  loadActions,
  'ActionsCodeResource':      loadActions,
  'ActionsEntitiesResource':  loadActions,
  'ActionsSecurityResource':  loadActions,
  'ActionExplorerResource':   loadActions,

  // ── Testing Dashboard ──
  'TestingDashboard':              loadTesting,   // BaseDashboard
  'TestingDashboardTabResource':   loadTesting,   // BaseResourceComponent
  'TestingRunsResource':           loadTesting,
  'TestingAnalyticsResource':      loadTesting,
  'TestingReviewResource':         loadTesting,
  'TestingExplorerResource':       loadTesting,

  // ── Scheduling Dashboard ──
  'SchedulingDashboard':           loadScheduling, // BaseDashboard
  'SchedulingDashboardResource':   loadScheduling, // BaseResourceComponent
  'SchedulingJobsResource':        loadScheduling,
  'SchedulingActivityResource':    loadScheduling,

  // ── Communication Dashboard ──
  'CommunicationDashboard':              loadCommunication, // BaseDashboard
  'CommunicationLogsResource':           loadCommunication,
  'CommunicationMonitorResource':        loadCommunication,
  'CommunicationProvidersResource':      loadCommunication,
  'CommunicationRunsResource':           loadCommunication,
  'CommunicationTemplatesResource':      loadCommunication,

  // ── Credentials Dashboard ──
  'CredentialsDashboard':                loadCredentials, // BaseDashboard
  'CredentialsOverviewResource':         loadCredentials,
  'CredentialsListResource':             loadCredentials,
  'CredentialsTypesResource':            loadCredentials,
  'CredentialsCategoriesResource':       loadCredentials,
  'CredentialsAuditResource':            loadCredentials,

  // ── Data Explorer ──
  'DataExplorer':              loadDataExplorer,  // BaseDashboard
  'DataExplorerResource':      loadDataExplorer,  // BaseResourceComponent

  // ── Lists Dashboard ──
  'ListsBrowseResource':       loadLists,
  'ListsCategoriesResource':   loadLists,
  'ListsMyListsResource':      loadLists,
  'ListsOperationsResource':   loadLists,

  // ── Component Studio ──
  'ComponentStudioDashboard':  loadComponentStudio, // BaseDashboard

  // ── Integration Dashboard ──
  'IntegrationOverview':          loadIntegration,
  'IntegrationConnections':       loadIntegration,
  'IntegrationPipelines':         loadIntegration,
  'IntegrationMappingWorkspace':  loadIntegration,
  'IntegrationActivity':          loadIntegration,
  'IntegrationSchedules':         loadIntegration,

  // ── MCP Dashboard ──
  'MCPDashboard':   loadMCP, // BaseDashboard
  'MCPResource':    loadMCP, // BaseResourceComponent

  // ── Explorer Settings (BaseDashboard types) ──
  'ApplicationManagement':  loadSettings,
  'EntityPermissions':      loadSettings,
  'RoleManagement':         loadSettings,
  'UserManagement':         loadSettings,
  'SqlLogging':             loadSettings,
};
