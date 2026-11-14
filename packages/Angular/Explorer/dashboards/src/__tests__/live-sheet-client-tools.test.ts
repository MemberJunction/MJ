/**
 * Unit tests for LiveSheetClientToolHelper and ExtractActionOutputParams
 * (`shared/live-sheet-client-tool.helper.ts`).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ExtractActionOutputParams,
  LiveSheetClientToolHelper,
  type GovernedActionExecutionRequest,
  type GovernedActionExecutionResult,
} from '../shared/live-sheet-client-tool.helper';

describe('live-sheet-client-tool.helper', () => {
  describe('ExtractActionOutputParams', () => {
    it('extracts Name -> Value pairs from ActionParam arrays', () => {
      const result = ExtractActionOutputParams([
        { Name: 'ArtifactID', Value: 'art-1', Type: 'Output' },
        { Name: 'VersionNumber', Value: 2, Type: 'Output' },
      ]);
      expect(result).toEqual({ ArtifactID: 'art-1', VersionNumber: 2 });
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
  });
});
