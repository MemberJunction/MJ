import { describe, expect, it, vi } from 'vitest';
import type { LibraryWorkspaceState } from '@memberjunction/ng-conversations';
import {
  BuildLibraryAgentClientTools,
  BuildLibraryAgentContext,
  LibraryToolOutcome,
  ResolveCollectionTarget,
  ResolveDriveTarget,
  ResolveItemTarget,
} from './library-agent-context';

function createSampleState(): LibraryWorkspaceState {
  const visibleItems = Array.from({ length: 30 }, (_, idx) => ({
    Id: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
    Name: idx === 0 ? 'Q4 Executive Brief' : `Document #${idx + 1}`,
    TypeName: 'Markdown Document',
    Category: 'documents' as const,
    VersionNumber: 2,
    UpdatedAtIso: '2026-11-09T12:00:00.000Z',
  }));

  return {
    Mode: 'hub',
    HubTab: 'overview',
    NavigatorSection: 'all',
    CollectionId: 'cccc0001-0000-4000-8000-000000000001',
    CollectionName: 'Board Materials',
    DriveId: null,
    DriveName: null,
    DriveFolderPrefix: '',
    ActiveArtifactId: visibleItems[0].Id,
    ActiveArtifactName: visibleItems[0].Name,
    ActiveVersionNumber: 2,
    IsFullCanvasOpen: true,
    SearchQuery: '',
    CategoryFilter: 'all',
    OwnershipFilter: 'all',
    VisibleItems: visibleItems,
    Collections: [
      {
        Id: 'cccc0001-0000-4000-8000-000000000001',
        Name: 'Board Materials',
        ParentId: null,
        ItemCount: 8,
      },
      {
        Id: 'cccc0002-0000-4000-8000-000000000002',
        Name: 'Product Architecture',
        ParentId: null,
        ItemCount: 14,
      },
    ],
    ConnectedDrives: [
      {
        AccountId: 'dddd0001-0000-4000-8000-000000000001',
        AccountName: 'Finance SharePoint',
        ProviderName: 'SharePoint',
      },
      {
        AccountId: 'dddd0002-0000-4000-8000-000000000002',
        AccountName: 'Design Assets Bucket',
        ProviderName: 'AWS S3',
      },
    ],
  };
}

describe('library-agent-context', () => {
  it('bounds VisibleItems, Collections, and ConnectedDrives in BuildLibraryAgentContext', () => {
    const state = createSampleState();
    const ctx = BuildLibraryAgentContext(state, 25);

    expect(ctx['Surface']).toBe('Library');
    expect(ctx['SurfaceMode']).toBe('hub');
    const items = ctx['VisibleItems'] as LibraryWorkspaceState['VisibleItems'];
    expect(items).toHaveLength(25);
    expect(ctx['OpenStudioArtifact']).toEqual({
      ArtifactId: state.VisibleItems[0].Id,
      Name: 'Q4 Executive Brief',
      VersionNumber: 2,
      FullCanvas: true,
    });
  });

  it('resolves collections, items, and connected drives by UUID, exact name, or substring', () => {
    const state = createSampleState();

    expect(
      ResolveCollectionTarget('CCCC0002-0000-4000-8000-000000000002', state.Collections)?.Name,
    ).toBe('Product Architecture');
    expect(ResolveCollectionTarget('board materials', state.Collections)?.Id).toBe(
      'cccc0001-0000-4000-8000-000000000001',
    );
    expect(ResolveItemTarget('Executive Brief', state.VisibleItems)?.Id).toBe(
      state.VisibleItems[0].Id,
    );
    expect(ResolveDriveTarget('s3', state.ConnectedDrives)?.AccountName).toBe(
      'Design Assets Bucket',
    );
  });

  it('executes all Library client tools against the controller with clear outcomes', async () => {
    const state = createSampleState();
    const controller = {
      GetState: () => state,
      SwitchMode: vi.fn(),
      SwitchHubTab: vi.fn(),
      OpenCollectionById: vi.fn(),
      OpenArtifactById: vi.fn(),
      SetSearchQuery: vi.fn(),
      SetCategoryFilter: vi.fn(),
      OpenConnectedDrive: vi.fn(),
    };

    const tools = BuildLibraryAgentClientTools(controller);
    const run = async (
      name: string,
      params: Record<string, string | boolean>,
    ): Promise<LibraryToolOutcome> => {
      const tool = tools.find((t) => t.Name === name);
      if (!tool) throw new Error(`Missing tool ${name}`);
      return (await tool.Handler(params)) as LibraryToolOutcome;
    };

    expect((await run('SwitchLibraryMode', { mode: 'navigator' })).Success).toBe(true);
    expect(controller.SwitchMode).toHaveBeenCalledWith('navigator');

    expect((await run('SwitchLibraryTab', { tab: 'drives' })).Success).toBe(true);
    expect(controller.SwitchHubTab).toHaveBeenCalledWith('drives');

    const colOut = await run('OpenCollection', { target: 'Product Architecture' });
    expect(colOut.Success).toBe(true);
    expect(controller.OpenCollectionById).toHaveBeenCalledWith(
      'cccc0002-0000-4000-8000-000000000002',
    );

    const itemOut = await run('OpenLibraryItem', {
      target: 'Q4 Executive Brief',
      splitView: true,
    });
    expect(itemOut.Success).toBe(true);
    expect(controller.OpenArtifactById).toHaveBeenCalledWith(state.VisibleItems[0].Id, true);

    expect((await run('SearchLibrary', { query: 'forecast' })).Success).toBe(true);
    expect(controller.SetSearchQuery).toHaveBeenCalledWith('forecast');

    expect((await run('FilterLibraryByCategory', { category: 'spreadsheets' })).Success).toBe(true);
    expect(controller.SetCategoryFilter).toHaveBeenCalledWith('spreadsheets');

    const driveOut = await run('OpenConnectedDrive', {
      target: 'Finance SharePoint',
      folderPrefix: '2026/Budgets/',
    });
    expect(driveOut.Success).toBe(true);
    expect(controller.OpenConnectedDrive).toHaveBeenCalledWith(
      'dddd0001-0000-4000-8000-000000000001',
      '2026/Budgets/',
    );
  });
});
