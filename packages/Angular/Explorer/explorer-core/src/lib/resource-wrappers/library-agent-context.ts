import { UUIDsEqual } from '@memberjunction/global';
import type {
  LibraryCategoryFilter,
  LibraryHubTab,
  LibrarySurfaceMode,
  LibraryWorkspaceState,
} from '@memberjunction/ng-conversations';
import type { NavigationService } from '@memberjunction/ng-shared';

export type LibraryAgentClientTool = Parameters<NavigationService['SetAgentClientTools']>[1][number];
export type LibraryAgentToolParams = Parameters<LibraryAgentClientTool['Handler']>[0];
export type LibraryAgentContextPayload = Parameters<NavigationService['SetAgentContext']>[1];

export const DEFAULT_LIBRARY_AGENT_CONTEXT_CAP = 25;

export interface LibraryAgentController {
  GetState: () => LibraryWorkspaceState | null;
  SwitchMode: (mode: LibrarySurfaceMode) => void;
  SwitchHubTab: (tab: LibraryHubTab) => void;
  OpenCollectionById: (collectionId: string) => void;
  OpenArtifactById: (artifactId: string, splitView: boolean) => void;
  SetSearchQuery: (query: string) => void;
  SetCategoryFilter: (category: LibraryCategoryFilter) => void;
  OpenConnectedDrive: (accountId: string, folderPrefix: string) => void;
}

export interface LibraryToolOutcome {
  Success: boolean;
  Message: string;
  ResolvedId?: string;
}

/**
 * Builds a bounded, serializable agent context snapshot for the active `Library` surface.
 */
export function BuildLibraryAgentContext(
  state: LibraryWorkspaceState,
  cap: number = DEFAULT_LIBRARY_AGENT_CONTEXT_CAP,
): LibraryAgentContextPayload {
  const safeCap = Math.max(1, Math.min(cap, 50));
  return {
    Surface: 'Library',
    SurfaceMode: state.Mode,
    ActiveHubTab: state.HubTab,
    NavigatorSection: state.NavigatorSection,
    SelectedCollection: state.CollectionId
      ? { Id: state.CollectionId, Name: state.CollectionName }
      : null,
    SelectedConnectedDrive: state.DriveId
      ? {
          AccountId: state.DriveId,
          AccountName: state.DriveName,
          FolderPrefix: state.DriveFolderPrefix,
        }
      : null,
    OpenStudioArtifact: state.ActiveArtifactId
      ? {
          ArtifactId: state.ActiveArtifactId,
          Name: state.ActiveArtifactName,
          VersionNumber: state.ActiveVersionNumber,
          FullCanvas: state.IsFullCanvasOpen,
        }
      : null,
    SearchQuery: state.SearchQuery,
    CategoryFilter: state.CategoryFilter,
    OwnershipFilter: state.OwnershipFilter,
    VisibleItems: state.VisibleItems.slice(0, safeCap),
    Collections: state.Collections.slice(0, safeCap),
    ConnectedDrives: state.ConnectedDrives.slice(0, safeCap),
  };
}

/**
 * Resolves a collection target supplied by an agent (UUID, exact case-insensitive name, or unique substring).
 */
export function ResolveCollectionTarget(
  target: string,
  collections: LibraryWorkspaceState['Collections'],
): LibraryWorkspaceState['Collections'][number] | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  const byId = collections.find((c) => UUIDsEqual(c.Id, trimmed));
  if (byId) return byId;

  const lower = trimmed.toLowerCase();
  const exact = collections.find((c) => c.Name.toLowerCase() === lower);
  if (exact) return exact;

  return collections.find((c) => c.Name.toLowerCase().includes(lower)) ?? null;
}

/**
 * Resolves a Library item target supplied by an agent (UUID, exact case-insensitive name, or substring).
 */
export function ResolveItemTarget(
  target: string,
  items: LibraryWorkspaceState['VisibleItems'],
): LibraryWorkspaceState['VisibleItems'][number] | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  const byId = items.find((i) => UUIDsEqual(i.Id, trimmed));
  if (byId) return byId;

  const lower = trimmed.toLowerCase();
  const exact = items.find((i) => i.Name.toLowerCase() === lower);
  if (exact) return exact;

  return items.find((i) => i.Name.toLowerCase().includes(lower)) ?? null;
}

/**
 * Resolves a Connected Drive target supplied by an agent (AccountID, exact name, or provider/name substring).
 */
export function ResolveDriveTarget(
  target: string,
  drives: LibraryWorkspaceState['ConnectedDrives'],
): LibraryWorkspaceState['ConnectedDrives'][number] | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  const byId = drives.find((d) => UUIDsEqual(d.AccountId, trimmed));
  if (byId) return byId;

  const lower = trimmed.toLowerCase();
  const exact = drives.find((d) => d.AccountName.toLowerCase() === lower);
  if (exact) return exact;

  return (
    drives.find(
      (d) =>
        d.AccountName.toLowerCase().includes(lower) ||
        d.ProviderName.toLowerCase().includes(lower),
    ) ?? null
  );
}

/**
 * Builds the interactive client tools registered while the `Library` resource is active.
 */
export function BuildLibraryAgentClientTools(
  controller: LibraryAgentController,
): LibraryAgentClientTool[] {
  return [
    {
      Name: 'SwitchLibraryMode',
      Description:
        'Switch the Library surface between spacious Hub landing mode ("hub") and Power Navigator split tree mode ("navigator").',
      ParameterSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['hub', 'navigator'],
            description: 'Target Library layout mode.',
          },
        },
        required: ['mode'],
      },
      Handler: async (params: LibraryAgentToolParams): Promise<LibraryToolOutcome> => {
        const rawMode = typeof params['mode'] === 'string' ? params['mode'].toLowerCase() : '';
        if (rawMode !== 'hub' && rawMode !== 'navigator') {
          return { Success: false, Message: 'Parameter "mode" must be "hub" or "navigator".' };
        }
        controller.SwitchMode(rawMode);
        return { Success: true, Message: `Switched Library to ${rawMode} mode.` };
      },
    },
    {
      Name: 'SwitchLibraryTab',
      Description:
        'Switch the active tab in Library Hub mode ("overview", "collections", "all", "shared", or "drives").',
      ParameterSchema: {
        type: 'object',
        properties: {
          tab: {
            type: 'string',
            enum: ['overview', 'collections', 'all', 'shared', 'drives'],
            description: 'Hub tab key to display.',
          },
        },
        required: ['tab'],
      },
      Handler: async (params: LibraryAgentToolParams): Promise<LibraryToolOutcome> => {
        const rawTab = typeof params['tab'] === 'string' ? params['tab'].toLowerCase() : '';
        const allowed: LibraryHubTab[] = ['overview', 'collections', 'all', 'shared', 'drives'];
        if (!allowed.includes(rawTab as LibraryHubTab)) {
          return {
            Success: false,
            Message: 'Parameter "tab" must be overview, collections, all, shared, or drives.',
          };
        }
        controller.SwitchMode('hub');
        controller.SwitchHubTab(rawTab as LibraryHubTab);
        return { Success: true, Message: `Opened Library "${rawTab}" tab.` };
      },
    },
    {
      Name: 'OpenCollection',
      Description: 'Open a Library Collection by ID or name in Power Navigator view.',
      ParameterSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Collection ID or name.',
          },
        },
        required: ['target'],
      },
      Handler: async (params: LibraryAgentToolParams): Promise<LibraryToolOutcome> => {
        const rawTarget = typeof params['target'] === 'string' ? params['target'] : '';
        const state = controller.GetState();
        const match = state ? ResolveCollectionTarget(rawTarget, state.Collections) : null;
        if (!match) {
          return { Success: false, Message: `No readable collection matched "${rawTarget}".` };
        }
        controller.OpenCollectionById(match.Id);
        return {
          Success: true,
          Message: `Opened collection "${match.Name}".`,
          ResolvedId: match.Id,
        };
      },
    },
    {
      Name: 'OpenLibraryItem',
      Description:
        'Open a document, spreadsheet, presentation, query, component, or file in the Library Studio by ID or title.',
      ParameterSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Artifact ID or title of the visible Library item.',
          },
          splitView: {
            type: 'boolean',
            description: 'When true, docks the Studio in Navigator Split View instead of Full-Canvas.',
          },
        },
        required: ['target'],
      },
      Handler: async (params: LibraryAgentToolParams): Promise<LibraryToolOutcome> => {
        const rawTarget = typeof params['target'] === 'string' ? params['target'] : '';
        const splitView = params['splitView'] === true;
        const state = controller.GetState();
        const match = state ? ResolveItemTarget(rawTarget, state.VisibleItems) : null;
        if (!match) {
          return {
            Success: false,
            Message: `No visible Library item matched "${rawTarget}". Try SearchLibrary first if needed.`,
          };
        }
        controller.OpenArtifactById(match.Id, splitView);
        return {
          Success: true,
          Message: `Opened "${match.Name}" in ${splitView ? 'Split Navigator' : 'Studio'}.`,
          ResolvedId: match.Id,
        };
      },
    },
    {
      Name: 'SearchLibrary',
      Description: 'Filter or search items in the Library by keyword (or pass empty string to clear).',
      ParameterSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search keyword (empty string clears the search filter).',
          },
        },
        required: ['query'],
      },
      Handler: async (params: LibraryAgentToolParams): Promise<LibraryToolOutcome> => {
        const query = typeof params['query'] === 'string' ? params['query'] : '';
        controller.SetSearchQuery(query);
        return {
          Success: true,
          Message: query ? `Filtered Library by "${query}".` : 'Cleared Library search filter.',
        };
      },
    },
    {
      Name: 'FilterLibraryByCategory',
      Description:
        'Filter Library items by content category ("all", "documents", "spreadsheets", "presentations", "interactive", "queries", or "files").',
      ParameterSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['all', 'documents', 'spreadsheets', 'presentations', 'interactive', 'queries', 'files'],
          },
        },
        required: ['category'],
      },
      Handler: async (params: LibraryAgentToolParams): Promise<LibraryToolOutcome> => {
        const raw = typeof params['category'] === 'string' ? params['category'].toLowerCase() : '';
        const valid: LibraryCategoryFilter[] = [
          'all',
          'documents',
          'spreadsheets',
          'presentations',
          'interactive',
          'queries',
          'files',
        ];
        if (!valid.includes(raw as LibraryCategoryFilter)) {
          return { Success: false, Message: `Unsupported category "${raw}".` };
        }
        controller.SetCategoryFilter(raw as LibraryCategoryFilter);
        return { Success: true, Message: `Applied Library category filter "${raw}".` };
      },
    },
    {
      Name: 'OpenConnectedDrive',
      Description:
        'Open a dynamic Connected Drive (external cloud storage account) by Account ID, name, or provider name.',
      ParameterSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Connected Drive Account ID, account name, or provider name.',
          },
          folderPrefix: {
            type: 'string',
            description: 'Optional remote folder prefix inside the drive.',
          },
        },
        required: ['target'],
      },
      Handler: async (params: LibraryAgentToolParams): Promise<LibraryToolOutcome> => {
        const rawTarget = typeof params['target'] === 'string' ? params['target'] : '';
        const folderPrefix = typeof params['folderPrefix'] === 'string' ? params['folderPrefix'] : '';
        const state = controller.GetState();
        const match = state ? ResolveDriveTarget(rawTarget, state.ConnectedDrives) : null;
        if (!match) {
          return { Success: false, Message: `No connected drive matched "${rawTarget}".` };
        }
        controller.OpenConnectedDrive(match.AccountId, folderPrefix);
        return {
          Success: true,
          Message: `Opened Connected Drive "${match.AccountName}".`,
          ResolvedId: match.AccountId,
        };
      },
    },
  ];
}
