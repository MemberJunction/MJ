/**
 * Unit tests for LiveSheetClientToolHelper and ExtractActionOutputParams
 * (`lib/services/live-sheet-client-tool.helper.ts`).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ActionEngineBase, ActionParam, RunActionParams, type MJActionEntityExtended } from '@memberjunction/actions-base';
import {
  EntityInfo,
  EntityUserPermissionInfo,
  RunView,
  type EntityFieldInfo,
  type IMetadataProvider,
  type RunViewResult,
  type UserInfo,
} from '@memberjunction/core';
import {
  SanitizeWorksheetName,
  SpreadsheetEngine,
  type MJActionEntity,
  type MJArtifactEntity,
  type MJArtifactVersionEntity,
  type MJCollectionArtifactEntity,
  type SpreadsheetLiveTableSpec,
  type WorkbookSpec,
} from '@memberjunction/core-entities';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
  CreateGraphQLGovernedActionExecutor,
  CreateLiveSheetHelperForProvider,
  ExtractActionOutputParams,
  LiveSheetClientToolHelper,
  RollbackCreatedArtifact,
  type GovernedActionExecutionRequest,
  type GovernedActionExecutionResult,
  type GovernedArtifactRollback,
} from '../lib/services/live-sheet-client-tool.helper';

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
    it('creates an Excel Spreadsheet and populates a SavedQuery live table atomically at v1 via InitialOperations', async () => {
      const calls: GovernedActionExecutionRequest[] = [];
      const executor = vi.fn(
        async (req: GovernedActionExecutionRequest): Promise<GovernedActionExecutionResult> => {
          calls.push(req);
          return {
            Success: true,
            OutputParams: {
              ArtifactID: 'art-q1',
              VersionID: 'ver-1',
              VersionNumber: 1,
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
        VersionID: 'ver-1',
        VersionNumber: 1,
        ArtifactName: 'Monthly Revenue — Live Sheet',
        ArtifactTypeName: 'Excel Spreadsheet',
        DriverClass: 'SpreadsheetArtifactViewerPlugin',
        SheetName: 'Query Data',
        BoundingRange: 'A1:D25',
        RowCount: 24,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].ActionName).toBe('__CreateGovernedArtifact');
      expect(calls[0].Params).toEqual([
        { Name: 'Title', Value: 'Monthly Revenue — Live Sheet', Type: 'Input' },
        { Name: 'ArtifactType', Value: 'Excel Spreadsheet', Type: 'Input' },
        { Name: 'SheetNames', Value: ['Query Data'], Type: 'Input' },
        {
          Name: 'InitialOperations',
          Value: [
            {
              tool: 'upsert_live_table',
              input: {
                sheet: 'Query Data',
                title: 'Monthly Revenue',
                sourceType: 'SavedQuery',
                queryId: 'qry-123',
                queryName: 'Monthly Revenue',
                parameters: { Year: 2026 },
                maxRows: 250,
                anchorCell: 'A1',
              },
            },
          ],
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

    it('stops and returns inspection error without mutating when __InspectGovernedArtifact fails', async () => {
      const calls: GovernedActionExecutionRequest[] = [];
      const helper = new LiveSheetClientToolHelper(async (req) => {
        calls.push(req);
        return {
          Success: false,
          Message: 'Access denied inspecting artifact',
          OutputParams: {},
        };
      });

      const res = await helper.AppendQueryToLiveSheet({
        ArtifactID: 'art-locked',
        QueryID: 'qry-2',
        QueryName: 'Top Accounts',
        SheetName: 'Accounts: Tab',
      });

      expect(res.Success).toBe(false);
      expect(res.ArtifactID).toBe('art-locked');
      expect(res.ErrorMessage).toContain('Access denied inspecting artifact');
      expect(calls.map((c) => c.ActionName)).toEqual(['__InspectGovernedArtifact']);
    });
  });

  describe('LiveSheetClientToolHelper.CreateLiveSheetFromView', () => {
    it('materializes an EntityView live table atomically at v1 through real SpreadsheetEngine execution', async () => {
      const fakeUser = { ID: 'user-exec-1', Name: 'Analyst' } as UserInfo;
      const fakeFields = [
        { Name: 'ID', DisplayName: 'ID', Type: 'uniqueidentifier', IsBinaryFieldType: false, DefaultInView: false } as EntityFieldInfo,
        { Name: 'Name', DisplayName: 'Name', Type: 'nvarchar', IsBinaryFieldType: false, DefaultInView: true } as EntityFieldInfo,
        { Name: 'Email', DisplayName: 'Email', Type: 'nvarchar', IsBinaryFieldType: false, DefaultInView: true } as EntityFieldInfo,
        { Name: 'Type', DisplayName: 'Type', Type: 'nvarchar', IsBinaryFieldType: false, DefaultInView: true } as EntityFieldInfo,
      ];
      const fakeEntityInfo = {
        Name: 'MJ: Users',
        DisplayNameOrName: 'Users',
        FieldLevelSecurityApplies: false,
        Fields: fakeFields,
        GetUserPermisions: () =>
          Object.assign(new EntityUserPermissionInfo(), {
            CanRead: true,
            CanCreate: false,
            CanUpdate: false,
            CanDelete: false,
          }),
      } as Partial<EntityInfo> as EntityInfo;

      const capturedRunViews: Array<{ EntityName: string; ExtraFilter?: string; Fields?: string[]; MaxRows?: number }> = [];
      const fakeProvider = {
        CurrentUser: fakeUser,
        EntityByName: (name: string) => (name === 'MJ: Users' ? fakeEntityInfo : undefined),
        RunView: vi.fn(async (params: { EntityName: string; ExtraFilter?: string; Fields?: string[]; MaxRows?: number }) => {
          capturedRunViews.push(params);
          return {
            Success: true,
            Results: [
              { Name: 'Alice', Email: 'alice@example.com' },
              { Name: 'Bob', Email: 'bob@example.com' },
            ],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }),
      } as Partial<IMetadataProvider> as IMetadataProvider;

      let materializedWorkbook: WorkbookSpec | null = null;
      const calls: GovernedActionExecutionRequest[] = [];
      const helper = new LiveSheetClientToolHelper(async (req) => {
        calls.push(req);
        expect(req.ActionName).toBe('__CreateGovernedArtifact');

        const title = String(req.Params.find((p) => p.Name === 'Title')?.Value ?? 'Untitled');
        const sheetNames = req.Params.find((p) => p.Name === 'SheetNames')?.Value as string[] | undefined;
        const initialOps = req.Params.find((p) => p.Name === 'InitialOperations')?.Value as Array<{
          tool: string;
          input: Record<string, string | number | boolean | string[] | null | undefined>;
        }>;

        const engine = SpreadsheetEngine.Instance;
        const workbook = engine.CreateEmptyWorkbook(title, sheetNames);
        let boundingRange: string | undefined;
        let rowCount = 0;

        for (const op of initialOps) {
          if (op.tool === 'upsert_live_table') {
            const targetSheet = engine.GetWorksheet(workbook, String(op.input['sheet'] ?? ''));
            if (!targetSheet) {
              return { Success: false, Message: 'Target sheet missing', OutputParams: {} };
            }
            const liveSpec: SpreadsheetLiveTableSpec = {
              TableID: 'tbl-live-1',
              Title: String(op.input['title'] ?? 'Live Table'),
              SourceType: op.input['sourceType'] === 'SavedQuery' ? 'SavedQuery' : 'EntityView',
              EntityName: typeof op.input['entityName'] === 'string' ? op.input['entityName'] : undefined,
              ViewID: typeof op.input['viewId'] === 'string' ? op.input['viewId'] : undefined,
              ViewName: typeof op.input['viewName'] === 'string' ? op.input['viewName'] : undefined,
              ExtraFilter: typeof op.input['extraFilter'] === 'string' ? op.input['extraFilter'] : undefined,
              Fields: Array.isArray(op.input['fields']) ? op.input['fields'].map(String) : undefined,
              MaxRows: typeof op.input['maxRows'] === 'number' ? op.input['maxRows'] : undefined,
              AnchorCell: typeof op.input['anchorCell'] === 'string' ? op.input['anchorCell'] : 'A1',
              IncludeHeaders: true,
              Mode: 'Live',
            };
            targetSheet.LiveTables.push(liveSpec);
            const refreshRes = await engine.RefreshLiveTables(workbook, fakeUser, fakeProvider, {
              TableID: liveSpec.TableID,
            });
            const tblResult = refreshRes[liveSpec.TableID];
            if (!tblResult?.Success) {
              return { Success: false, Message: tblResult?.ErrorMessage || 'Refresh failed', OutputParams: {} };
            }
            rowCount = tblResult.Rows.length;
            const colCount = Math.max(tblResult.Columns.length, 1);
            const lastColLetter = String.fromCharCode(64 + colCount);
            boundingRange = `A1:${lastColLetter}${rowCount + 1}`;
          }
        }
        materializedWorkbook = workbook;

        return {
          Success: true,
          OutputParams: {
            ArtifactID: 'art-v1',
            VersionID: 'ver-v1',
            VersionNumber: 1,
            ArtifactName: title,
            Results: [{ ok: true, data: { boundingRange, rowCount } }],
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

      const expectedSheet = SanitizeWorksheetName('MJ: Users');
      expect(expectedSheet).toBe('MJ  Users');
      expect(calls).toHaveLength(1);
      expect(res).toEqual({
        Success: true,
        ArtifactID: 'art-v1',
        VersionID: 'ver-v1',
        VersionNumber: 1,
        ArtifactName: 'MJ: Users — Active Admins',
        ArtifactTypeName: 'Excel Spreadsheet',
        DriverClass: 'SpreadsheetArtifactViewerPlugin',
        SheetName: expectedSheet,
        BoundingRange: 'A1:B3',
        RowCount: 2,
      });

      expect(capturedRunViews).toHaveLength(1);
      expect(capturedRunViews[0]).toMatchObject({
        EntityName: 'MJ: Users',
        ExtraFilter: "Type='Owner'",
        Fields: ['Name', 'Email', 'ID'],
        MaxRows: 100,
      });

      expect(materializedWorkbook).not.toBeNull();
      const ws = materializedWorkbook!.Worksheets[0];
      expect(ws.Name).toBe(expectedSheet);
      expect(ws.LiveTables).toHaveLength(1);
      expect(ws.LiveTables[0]).toMatchObject({
        SourceType: 'EntityView',
        EntityName: 'MJ: Users',
        ViewID: 'view-99',
        ViewName: 'Active Admins',
        ExtraFilter: "Type='Owner'",
        Fields: ['Name', 'Email'],
        MaxRows: 100,
        AnchorCell: 'A1',
      });
      // Verify SpreadsheetEngine.RefreshLiveTables populated header and data cells
      expect(ws.Cells['A1']?.RawValue).toBe('Name');
      expect(ws.Cells['B1']?.RawValue).toBe('Email');
      expect(ws.Cells['A2']?.RawValue).toBe('Alice');
      expect(ws.Cells['B2']?.RawValue).toBe('alice@example.com');
      expect(ws.Cells['A3']?.RawValue).toBe('Bob');
      expect(ws.Cells['B3']?.RawValue).toBe('bob@example.com');
    });

    it('rejects empty EntityName', async () => {
      const executor = vi.fn();
      const helper = new LiveSheetClientToolHelper(executor);
      const res = await helper.CreateLiveSheetFromView({ EntityName: '' });
      expect(res.Success).toBe(false);
      expect(executor).not.toHaveBeenCalled();
    });

    it('fails atomically with zero orphan on Create failure, and inspects/creates missing worksheet when ExistingArtifactID is provided', async () => {
      const rollbackArtifact = vi.fn<GovernedArtifactRollback>(async () => true);
      const executor = vi.fn(async (): Promise<GovernedActionExecutionResult> => ({
        Success: false,
        Message: 'Entity view permission denied',
        OutputParams: {},
      }));

      const helper = new LiveSheetClientToolHelper(executor, rollbackArtifact);
      const failedRes = await helper.CreateLiveSheetFromView({ EntityName: 'MJ: Users' });
      expect(failedRes.Success).toBe(false);
      expect(failedRes.ArtifactID).toBeUndefined();
      expect(failedRes.ErrorMessage).toContain('Entity view permission denied');
      expect(executor).toHaveBeenCalledTimes(1);
      expect(rollbackArtifact).not.toHaveBeenCalled();

      // ExistingArtifactID path skips __CreateGovernedArtifact, inspects sheets, and prepends add_sheet when absent
      const reuseCalls: GovernedActionExecutionRequest[] = [];
      const reuseExecutor = vi.fn(async (req: GovernedActionExecutionRequest): Promise<GovernedActionExecutionResult> => {
        reuseCalls.push(req);
        if (req.ActionName === '__InspectGovernedArtifact') {
          return {
            Success: true,
            OutputParams: {
              InspectionResult: { sheets: [{ name: 'Sheet1' }] },
            },
          };
        }
        return {
          Success: true,
          OutputParams: {
            ArtifactID: 'art-v1',
            VersionID: 'ver-v2',
            VersionNumber: 2,
            Results: [{ ok: true }, { ok: true, data: { boundingRange: 'A1:B5', rowCount: 4 } }],
          },
        };
      });

      const reuseHelper = new LiveSheetClientToolHelper(reuseExecutor);
      const reused = await reuseHelper.CreateLiveSheetFromQuery({
        QueryID: 'q-1',
        QueryName: 'Sales',
        SheetName: 'Sales: Q4',
        ExistingArtifactID: 'art-v1',
      });
      expect(reused.Success).toBe(true);
      expect(reused.SheetName).toBe('Sales  Q4');
      expect(reuseCalls.map((c) => c.ActionName)).toEqual([
        '__InspectGovernedArtifact',
        '__MutateGovernedArtifact',
      ]);
      const reuseOps = reuseCalls[1].Params.find((p) => p.Name === 'Operations')?.Value;
      expect(reuseOps).toEqual([
        { tool: 'add_sheet', input: { name: 'Sales  Q4' } },
        {
          tool: 'upsert_live_table',
          input: {
            sheet: 'Sales  Q4',
            title: 'Sales',
            sourceType: 'SavedQuery',
            queryId: 'q-1',
            queryName: 'Sales',
            anchorCell: 'A1',
          },
        },
      ]);
      expect(reused.ArtifactID).toBe('art-v1');
      expect(reused.VersionNumber).toBe(2);
    });
  });

  describe('RollbackCreatedArtifact', () => {
    it('deletes MJ: Collection Artifacts links before deleting version and artifact entities', async () => {
      const fakeUser = { ID: 'user-1', Name: 'Tester' } as UserInfo;
      const deleteOrder: string[] = [];

      const linkEntity = {
        Delete: vi.fn(async () => {
          deleteOrder.push('collection-link');
          return true;
        }),
      } as Partial<MJCollectionArtifactEntity> as MJCollectionArtifactEntity;

      const versionEntity = {
        Load: vi.fn(async () => true),
        Delete: vi.fn(async () => {
          deleteOrder.push('version');
          return true;
        }),
      } as Partial<MJArtifactVersionEntity> as MJArtifactVersionEntity;

      const artifactEntity = {
        Load: vi.fn(async () => true),
        Delete: vi.fn(async () => {
          deleteOrder.push('artifact');
          return true;
        }),
      } as Partial<MJArtifactEntity> as MJArtifactEntity;

      const fakeProvider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
          if (entityName === 'MJ: Artifact Versions') return versionEntity;
          if (entityName === 'MJ: Artifacts') return artifactEntity;
          throw new Error(`Unexpected entity ${entityName}`);
        }),
      } as Partial<GraphQLDataProvider> as GraphQLDataProvider;

      const mockRunView = {
        RunView: vi.fn(async () => ({
          Success: true,
          Results: [linkEntity],
        } as Partial<RunViewResult<MJCollectionArtifactEntity>> as RunViewResult<MJCollectionArtifactEntity>)),
      } as Partial<RunView> as RunView;
      vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(mockRunView);

      const ok = await RollbackCreatedArtifact(fakeProvider, fakeUser, 'art-1', 'ver-1');
      expect(ok).toBe(true);
      expect(mockRunView.RunView).toHaveBeenCalledWith(
        expect.objectContaining({
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: "ArtifactVersionID='ver-1'",
        }),
        fakeUser,
      );
      expect(deleteOrder).toEqual(['collection-link', 'version', 'artifact']);
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
        ResultCode: 'SUCCESS',
      });

      const executor = CreateGraphQLGovernedActionExecutor(fakeProvider, fakeUser);
      const res = await executor({
        ActionName: '__CreateGovernedArtifact',
        Params: [{ Name: 'Name', Value: 'From Message', Type: 'Input' }],
      });

      expect(getProviderSpy).toHaveBeenCalledWith(fakeProvider, ActionEngineBase);
      expect(runActionSpy).toHaveBeenCalledTimes(1);
      expect(runActionSpy.mock.calls[0]?.[0]).toBe('act-create-1');
      expect(runActionSpy.mock.calls[0]?.[1]?.some((p) => p instanceof ActionParam)).toBe(true);
      expect(res.Success).toBe(true);
      expect(res.OutputParams['ArtifactID']).toBe('art-from-msg');
      expect(res.OutputParams['VersionID']).toBe('ver-from-msg');
      expect(res.OutputParams['VersionNumber']).toBe(1);
    });

    it('falls back to RunView.FromMetadataProvider when ActionEngineBase cache does not contain the action', async () => {
      const fakeUser = { ID: 'user-1', Name: 'Tester' } as UserInfo;
      const fakeProvider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider;

      vi.spyOn(ActionEngineBase, 'GetProviderInstance').mockReturnValue({
        Actions: [],
        Config: vi.fn(async () => undefined),
      } as Partial<ActionEngineBase> as ActionEngineBase);

      const fallbackAction = { ID: 'act-mutate-rv' } as Partial<MJActionEntity> as MJActionEntity;
      const mockRunView = {
        RunView: vi.fn(async () => ({
          Success: true,
          Results: [fallbackAction],
        } as Partial<RunViewResult<MJActionEntity>> as RunViewResult<MJActionEntity>)),
      } as Partial<RunView> as RunView;
      vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(mockRunView);

      const runActionSpy = vi.spyOn(GraphQLActionClient.prototype, 'RunAction').mockResolvedValue({
        RunParams: new RunActionParams(),
        Success: true,
        Message: JSON.stringify({ ArtifactID: 'art-rv', VersionNumber: 2 }),
        ResultCode: 'SUCCESS',
      });

      const executor = CreateGraphQLGovernedActionExecutor(fakeProvider, fakeUser);
      const res = await executor({
        ActionName: '__MutateGovernedArtifact',
        Params: [{ Name: 'ArtifactID', Value: 'art-rv', Type: 'Input' }],
      });

      expect(mockRunView.RunView).toHaveBeenCalledWith(
        expect.objectContaining({
          EntityName: 'MJ: Actions',
          MaxRows: 1,
        }),
        fakeUser,
      );
      expect(runActionSpy).toHaveBeenCalledTimes(1);
      expect(runActionSpy.mock.calls[0]?.[0]).toBe('act-mutate-rv');
      expect(Array.isArray(runActionSpy.mock.calls[0]?.[1])).toBe(true);
      expect(res.Success).toBe(true);
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
