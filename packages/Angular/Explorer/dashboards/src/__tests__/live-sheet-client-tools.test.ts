/**
 * Unit tests for LiveSheetClientToolHelper and ExtractActionOutputParams
 * (`shared/live-sheet-client-tool.helper.ts`).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ActionEngineBase, ActionParam, RunActionParams, type MJActionEntityExtended } from '@memberjunction/actions-base';
import { type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
  CreateGraphQLGovernedActionExecutor,
  CreateLiveSheetHelperForProvider,
  ExtractActionOutputParams,
  LiveSheetClientToolHelper,
  type GovernedActionExecutionRequest,
  type GovernedActionExecutionResult,
  type GovernedArtifactRollback,
} from '../shared/live-sheet-client-tool.helper';

describe('live-sheet-client-tool.helper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ExtractActionOutputParams', () => {
    it('extracts Name -> Value pairs from ActionParam arrays', () => {
      const result = ExtractActionOutputParams([
        { Name: 'ArtifactID', Value: 'art-1', Type: 'Output' },
        { Name: 'VersionNumber', Value: 2, Type: 'Output' },
      ]);
      expect(result).toEqual({ ArtifactID: 'art-1', VersionNumber: 2 });
    });

    it('unwraps CopyScalarsAndArrays index-keyed object maps of ActionParam entries', () => {
      const copyScalarsOutput = {
        '0': { Name: 'ArtifactID', Value: 'art-copy-1', Type: 'Output' },
        '1': { Name: 'VersionID', Value: 'ver-copy-1', Type: 'Output' },
        '2': { Name: 'VersionNumber', Value: 1, Type: 'Output' },
      };

      expect(ExtractActionOutputParams(copyScalarsOutput)).toEqual({
        ArtifactID: 'art-copy-1',
        VersionID: 'ver-copy-1',
        VersionNumber: 1,
      });
    });

    it('copies keys from plain object payloads and handles empty inputs', () => {
      expect(ExtractActionOutputParams({ ArtifactID: 'art-2', RowCount: 42 })).toEqual({
        ArtifactID: 'art-2',
        RowCount: 42,
      });
      expect(ExtractActionOutputParams(null)).toEqual({});
      expect(ExtractActionOutputParams('unexpected')).toEqual({});
    });
  });

  describe('LiveSheetClientToolHelper.CreateLiveSheetFromQuery', () => {
    it('creates an Excel Spreadsheet and populates a SavedQuery live table', async () => {
      const calls: GovernedActionExecutionRequest[] = [];
      const executor = vi.fn(
        async (req: GovernedActionExecutionRequest): Promise<GovernedActionExecutionResult> => {
          calls.push(req);
          if (req.ActionName === '__CreateGovernedArtifact') {
            return {
              Success: true,
              OutputParams: { ArtifactID: 'art-q1', VersionID: 'ver-1', VersionNumber: 1 },
            };
          }
          return {
            Success: true,
            OutputParams: {
              ArtifactID: 'art-q1',
              VersionID: 'ver-2',
              VersionNumber: 2,
              ArtifactName: 'Monthly Revenue — Live Sheet',
              Results: [{ ok: true, data: { boundingRange: 'A1:D25', rowCount: 24 } }],
            },
          };
        },
      );

      const helper = new LiveSheetClientToolHelper(executor);
      const res = await helper.CreateLiveSheetFromQuery({
        QueryID: 'qry-123',
        QueryName: 'Monthly Revenue',
        Parameters: { Year: 2026 },
        MaxRows: 250,
      });

      expect(res).toEqual({
        Success: true,
        ArtifactID: 'art-q1',
        VersionID: 'ver-2',
        VersionNumber: 2,
        ArtifactName: 'Monthly Revenue — Live Sheet',
        ArtifactTypeName: 'Excel Spreadsheet',
        DriverClass: 'SpreadsheetArtifactViewerPlugin',
        SheetName: 'Query Data',
        BoundingRange: 'A1:D25',
        RowCount: 24,
      });

      expect(calls).toHaveLength(2);
      expect(calls[0].ActionName).toBe('__CreateGovernedArtifact');
      expect(calls[0].Params).toEqual([
        { Name: 'Title', Value: 'Monthly Revenue — Live Sheet', Type: 'Input' },
        { Name: 'ArtifactType', Value: 'Excel Spreadsheet', Type: 'Input' },
        { Name: 'SheetNames', Value: ['Query Data'], Type: 'Input' },
      ]);

      expect(calls[1].ActionName).toBe('__MutateGovernedArtifact');
      expect(calls[1].Params).toEqual([
        { Name: 'ArtifactID', Value: 'art-q1', Type: 'Input' },
        { Name: 'Tool', Value: 'upsert_live_table', Type: 'Input' },
        {
          Name: 'Input',
          Value: {
            sheet: 'Query Data',
            title: 'Monthly Revenue',
            sourceType: 'SavedQuery',
            queryId: 'qry-123',
            queryName: 'Monthly Revenue',
            parameters: { Year: 2026 },
            maxRows: 250,
            anchorCell: 'A1',
          },
          Type: 'Input',
        },
      ]);
    });

    it('returns failure cleanly if artifact creation fails', async () => {
      const helper = new LiveSheetClientToolHelper(async () => ({
        Success: false,
        Message: 'Permission denied',
        OutputParams: {},
      }));
      const res = await helper.CreateLiveSheetFromQuery({
        QueryID: 'qry-1',
        QueryName: 'Restricted',
      });
      expect(res.Success).toBe(false);
      expect(res.ErrorMessage).toBe('Permission denied');
    });
  });

  describe('LiveSheetClientToolHelper.AppendQueryToLiveSheet', () => {
    it('creates a missing worksheet via add_sheet before upserting the live table', async () => {
      const calls: GovernedActionExecutionRequest[] = [];
      const helper = new LiveSheetClientToolHelper(async (req) => {
        calls.push(req);
        if (req.ActionName === '__InspectGovernedArtifact') {
          return {
            Success: true,
            OutputParams: {
              InspectionResult: { sheets: [{ name: 'Overview' }] },
            },
          };
        }
        return {
          Success: true,
          OutputParams: {
            ArtifactID: 'art-existing',
            VersionID: 'ver-5',
            VersionNumber: 5,
            Results: [
              { ok: true },
              { ok: true, data: { boundingRange: 'A1:C10', rowCount: 9 } },
            ],
          },
        };
      });

      const res = await helper.AppendQueryToLiveSheet({
        ArtifactID: 'art-existing',
        QueryID: 'qry-2',
        QueryName: 'Top Accounts',
        SheetName: 'Accounts Tab',
      });

      expect(res.Success).toBe(true);
      expect(res.SheetName).toBe('Accounts Tab');
      expect(res.BoundingRange).toBe('A1:C10');
      expect(res.RowCount).toBe(9);

      const mutateCall = calls[1];
      expect(mutateCall.ActionName).toBe('__MutateGovernedArtifact');
      const opsParam = mutateCall.Params.find((p) => p.Name === 'Operations');
      expect(opsParam?.Value).toEqual([
        { tool: 'add_sheet', input: { name: 'Accounts Tab' } },
        {
          tool: 'upsert_live_table',
          input: {
            sheet: 'Accounts Tab',
            title: 'Top Accounts',
            sourceType: 'SavedQuery',
            queryId: 'qry-2',
            queryName: 'Top Accounts',
            anchorCell: 'A1',
          },
        },
      ]);
    });

    it('skips add_sheet when target sheet already exists', async () => {
      const calls: GovernedActionExecutionRequest[] = [];
      const helper = new LiveSheetClientToolHelper(async (req) => {
        calls.push(req);
        if (req.ActionName === '__InspectGovernedArtifact') {
          return {
            Success: true,
            OutputParams: {
              InspectionResult: { sheets: [{ name: 'Accounts Tab' }] },
            },
          };
        }
        return {
          Success: true,
          OutputParams: { ArtifactID: 'art-existing', VersionNumber: 6 },
        };
      });

      const res = await helper.AppendQueryToLiveSheet({
        ArtifactID: 'art-existing',
        QueryID: 'qry-2',
        QueryName: 'Top Accounts',
        SheetName: 'Accounts Tab',
        AnchorCell: 'E2',
      });

      expect(res.Success).toBe(true);
      const opsParam = calls[1].Params.find((p) => p.Name === 'Operations');
      expect(opsParam?.Value).toEqual([
        {
          tool: 'upsert_live_table',
          input: {
            sheet: 'Accounts Tab',
            title: 'Top Accounts',
            sourceType: 'SavedQuery',
            queryId: 'qry-2',
            queryName: 'Top Accounts',
            anchorCell: 'E2',
          },
        },
      ]);
    });

    it('rejects empty ArtifactID without invoking server actions', async () => {
      const executor = vi.fn();
      const helper = new LiveSheetClientToolHelper(executor);
      const res = await helper.AppendQueryToLiveSheet({
        ArtifactID: '   ',
        QueryID: 'q1',
        QueryName: 'Test',
      });
      expect(res.Success).toBe(false);
      expect(res.ErrorMessage).toContain('ArtifactID');
      expect(executor).not.toHaveBeenCalled();
    });
  });

  describe('LiveSheetClientToolHelper.CreateLiveSheetFromView', () => {
    it('creates an EntityView live table with view metadata and filters', async () => {
      const calls: GovernedActionExecutionRequest[] = [];
      const helper = new LiveSheetClientToolHelper(async (req) => {
        calls.push(req);
        if (req.ActionName === '__CreateGovernedArtifact') {
          return { Success: true, OutputParams: { ArtifactID: 'art-v1', VersionNumber: 1 } };
        }
        return {
          Success: true,
          OutputParams: {
            ArtifactID: 'art-v1',
            VersionID: 'ver-v2',
            VersionNumber: 2,
            Results: [{ ok: true, data: { boundingRange: 'A1:E51', rowCount: 50 } }],
          },
        };
      });

      const res = await helper.CreateLiveSheetFromView({
        EntityName: 'MJ: Users',
        ViewID: 'view-99',
        ViewName: 'Active Admins',
        ExtraFilter: "Type='Owner'",
        Fields: ['Name', 'Email'],
        MaxRows: 100,
      });

      expect(res).toEqual({
        Success: true,
        ArtifactID: 'art-v1',
        VersionID: 'ver-v2',
        VersionNumber: 2,
        ArtifactName: 'MJ: Users — Active Admins',
        ArtifactTypeName: 'Excel Spreadsheet',
        DriverClass: 'SpreadsheetArtifactViewerPlugin',
        SheetName: 'MJ: Users',
        BoundingRange: 'A1:E51',
        RowCount: 50,
      });

      expect(calls[1].Params.find((p) => p.Name === 'Input')?.Value).toEqual({
        sheet: 'MJ: Users',
        title: 'Active Admins',
        sourceType: 'EntityView',
        entityName: 'MJ: Users',
        viewId: 'view-99',
        viewName: 'Active Admins',
        extraFilter: "Type='Owner'",
        fields: ['Name', 'Email'],
        maxRows: 100,
        anchorCell: 'A1',
      });
    });

    it('rejects empty EntityName', async () => {
      const executor = vi.fn();
      const helper = new LiveSheetClientToolHelper(executor);
      const res = await helper.CreateLiveSheetFromView({ EntityName: '' });
      expect(res.Success).toBe(false);
      expect(executor).not.toHaveBeenCalled();
    });

    it('rolls back step-1 artifact when step-2 fails, and skips __CreateGovernedArtifact when ExistingArtifactID is provided', async () => {
      const rollbackArtifact = vi.fn<GovernedArtifactRollback>(async () => true);
      const executor = vi.fn(async (req: GovernedActionExecutionRequest): Promise<GovernedActionExecutionResult> => {
        if (req.ActionName === '__CreateGovernedArtifact') {
          return {
            Success: true,
            OutputParams: { ArtifactID: 'art-orphan', VersionID: 'ver-orphan', VersionNumber: 1 },
          };
        }
        return {
          Success: false,
          Message: 'Entity view permission denied',
          OutputParams: {},
        };
      });

      const helper = new LiveSheetClientToolHelper(executor, rollbackArtifact);
      const failedRes = await helper.CreateLiveSheetFromView({ EntityName: 'MJ: Users' });
      expect(failedRes.Success).toBe(false);
      expect(failedRes.ArtifactID).toBeUndefined();
      expect(rollbackArtifact).toHaveBeenCalledWith('art-orphan', 'ver-orphan');

      // ExistingArtifactID path skips __CreateGovernedArtifact and mutates directly
      const reuseCalls: string[] = [];
      const reuseExecutor = vi.fn(async (req: GovernedActionExecutionRequest): Promise<GovernedActionExecutionResult> => {
        reuseCalls.push(req.ActionName);
        return {
          Success: true,
          OutputParams: {
            ArtifactID: 'art-v1',
            VersionID: 'ver-v2',
            VersionNumber: 2,
            Results: [{ ok: true, data: { boundingRange: 'A1:B5', rowCount: 4 } }],
          },
        };
      });

      const reuseHelper = new LiveSheetClientToolHelper(reuseExecutor);
      const reused = await reuseHelper.CreateLiveSheetFromQuery({
        QueryID: 'q-1',
        QueryName: 'Sales',
        ExistingArtifactID: 'art-v1',
      });
      expect(reused.Success).toBe(true);
      expect(reuseCalls).toEqual(['__MutateGovernedArtifact']);
      expect(reused.ArtifactID).toBe('art-v1');
      expect(reused.VersionNumber).toBe(2);
    });
  });

  describe('CreateGraphQLGovernedActionExecutor & CreateLiveSheetHelperForProvider', () => {
    it('falls back to res.Message JSON when Result is empty and resolves actions via ActionEngineBase.GetProviderInstance', async () => {
      const fakeUser = { ID: 'user-1', Name: 'Tester' } as UserInfo;
      const fakeProvider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider;

      const getProviderSpy = vi.spyOn(ActionEngineBase, 'GetProviderInstance').mockReturnValue({
        Actions: [
          {
            ID: 'act-create-1',
            Name: 'Create Governed Artifact',
            DriverClass: '__CreateGovernedArtifact',
          } as Partial<MJActionEntityExtended> as MJActionEntityExtended,
        ],
        Config: vi.fn(async () => undefined),
      } as Partial<ActionEngineBase> as ActionEngineBase);

      const runActionSpy = vi.spyOn(GraphQLActionClient.prototype, 'RunAction').mockResolvedValue({
        RunParams: new RunActionParams(),
        Success: true,
        Message: JSON.stringify({
          artifactId: 'art-from-msg',
          versionId: 'ver-from-msg',
          versionNumber: 1,
          name: 'From Message',
        }),
        Result: undefined as never,
      });

      const executor = CreateGraphQLGovernedActionExecutor(fakeProvider, fakeUser);
      const res = await executor({
        ActionName: '__CreateGovernedArtifact',
        Params: [{ Name: 'Name', Value: 'From Message', Type: 'Input' }],
      });

      expect(getProviderSpy).toHaveBeenCalledWith(fakeProvider, ActionEngineBase);
      expect(runActionSpy).toHaveBeenCalledWith('act-create-1', expect.arrayContaining([expect.any(ActionParam)]));
      expect(res.Success).toBe(true);
      expect(res.OutputParams['ArtifactID']).toBe('art-from-msg');
      expect(res.OutputParams['VersionID']).toBe('ver-from-msg');
      expect(res.OutputParams['VersionNumber']).toBe(1);
    });

    it('CreateLiveSheetHelperForProvider returns null without GraphQLDataProvider and builds helper with one', () => {
      const fakeUser = { ID: 'user-1' } as UserInfo;
      const nonGraphQLProvider = {} as IMetadataProvider;
      const fakeGraphQLProvider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider;
      Object.defineProperty(fakeGraphQLProvider, 'CurrentUser', {
        value: fakeUser,
        configurable: true,
      });

      expect(CreateLiveSheetHelperForProvider(null)).toBeNull();
      expect(CreateLiveSheetHelperForProvider(undefined)).toBeNull();
      expect(CreateLiveSheetHelperForProvider(nonGraphQLProvider, fakeUser)).toBeNull();
      expect(CreateLiveSheetHelperForProvider(fakeGraphQLProvider)).toBeInstanceOf(LiveSheetClientToolHelper);
    });
  });
});
