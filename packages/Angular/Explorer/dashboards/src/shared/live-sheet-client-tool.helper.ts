import { ActionEngineBase, ActionParam } from '@memberjunction/actions-base';
import { RunView, type UserInfo } from '@memberjunction/core';
import type { MJActionEntity } from '@memberjunction/core-entities';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

export type GovernedArtifactActionName =
  | '__CreateGovernedArtifact'
  | '__InspectGovernedArtifact'
  | '__MutateGovernedArtifact';

export interface GovernedActionParamInput {
  Name: string;
  Value: unknown;
  Type: 'Input' | 'Output' | 'Both';
}

export interface GovernedActionExecutionRequest {
  ActionName: GovernedArtifactActionName;
  Params: GovernedActionParamInput[];
}

export interface GovernedActionExecutionResult {
  Success: boolean;
  Message?: string;
  OutputParams: Record<string, unknown>;
}

export type GovernedActionExecutor = (
  request: GovernedActionExecutionRequest,
) => Promise<GovernedActionExecutionResult>;

export interface CreateLiveSheetFromQueryInput {
  QueryID: string;
  QueryName: string;
  Title?: string;
  SheetName?: string;
  TableTitle?: string;
  Parameters?: Record<string, unknown>;
  MaxRows?: number;
  AnchorCell?: string;
  Description?: string;
  CollectionID?: string;
}

export interface AppendQueryToLiveSheetInput {
  ArtifactID: string;
  QueryID: string;
  QueryName: string;
  SheetName?: string;
  TableTitle?: string;
  Parameters?: Record<string, unknown>;
  MaxRows?: number;
  AnchorCell?: string;
}

export interface CreateLiveSheetFromViewInput {
  EntityName: string;
  Title?: string;
  SheetName?: string;
  TableTitle?: string;
  ViewID?: string;
  ViewName?: string;
  ExtraFilter?: string;
  Fields?: string[];
  MaxRows?: number;
  AnchorCell?: string;
  Description?: string;
  CollectionID?: string;
}

export interface LiveSheetToolResult {
  Success: boolean;
  ArtifactID?: string;
  VersionID?: string;
  VersionNumber?: number;
  ArtifactName?: string;
  ArtifactTypeName?: string;
  DriverClass?: string;
  SheetName?: string;
  BoundingRange?: string;
  RowCount?: number;
  ErrorMessage?: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes `GraphQLActionClient.RunAction`'s `Result` payload (`ActionParam[]` JSON or object)
 * into a flat `Name -> Value` lookup map.
 */
export function ExtractActionOutputParams(resultPayload: unknown): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  if (Array.isArray(resultPayload)) {
    for (const item of resultPayload) {
      if (isPlainRecord(item) && typeof item['Name'] === 'string') {
        outputs[item['Name']] = item['Value'];
      }
    }
    return outputs;
  }
  if (isPlainRecord(resultPayload)) {
    for (const [k, v] of Object.entries(resultPayload)) {
      outputs[k] = v;
    }
  }
  return outputs;
}

const ACTION_DISPLAY_NAME_MAP: Record<GovernedArtifactActionName, string> = {
  __CreateGovernedArtifact: 'Create Governed Artifact',
  __InspectGovernedArtifact: 'Inspect Governed Artifact',
  __MutateGovernedArtifact: 'Mutate Governed Artifact',
};

async function resolveActionIdByName(
  actionName: GovernedArtifactActionName,
  provider: GraphQLDataProvider,
  contextUser: UserInfo,
): Promise<string | null> {
  const loweredDriver = actionName.toLowerCase();
  const displayName = ACTION_DISPLAY_NAME_MAP[actionName];
  const loweredName = displayName.toLowerCase();

  if (ActionEngineBase.Instance.Actions.length === 0) {
    await ActionEngineBase.Instance.Config(false, contextUser, provider);
  }
  const cached = ActionEngineBase.Instance.Actions.find(
    (a) =>
      a.DriverClass?.trim().toLowerCase() === loweredDriver ||
      a.Name.trim().toLowerCase() === loweredName ||
      a.Name.trim().toLowerCase() === loweredDriver,
  );
  if (cached) {
    return cached.ID;
  }

  const rv = RunView.FromMetadataProvider(provider);
  const safeDriver = actionName.replace(/'/g, "''");
  const safeDisplay = displayName.replace(/'/g, "''");
  const res = await rv.RunView<MJActionEntity>(
    {
      EntityName: 'MJ: Actions',
      ExtraFilter: `DriverClass='${safeDriver}' OR Name='${safeDisplay}' OR Name='${safeDriver}'`,
      MaxRows: 1,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  return res.Success && res.Results[0] ? res.Results[0].ID : null;
}

/**
 * Builds the default GraphQL-backed executor invoking `__CreateGovernedArtifact`,
 * `__InspectGovernedArtifact`, and `__MutateGovernedArtifact` under the signed-in user.
 */
export function CreateGraphQLGovernedActionExecutor(
  provider: GraphQLDataProvider,
  contextUser: UserInfo,
): GovernedActionExecutor {
  const client = new GraphQLActionClient(provider);
  return async (request: GovernedActionExecutionRequest): Promise<GovernedActionExecutionResult> => {
    const actionId = await resolveActionIdByName(request.ActionName, provider, contextUser);
    if (!actionId) {
      return {
        Success: false,
        Message: `Server action "${request.ActionName}" is not registered or accessible.`,
        OutputParams: {},
      };
    }

    const actionParams: ActionParam[] = request.Params.map((p) =>
      Object.assign(new ActionParam(), {
        Name: p.Name,
        Value: p.Value,
        Type: p.Type,
      }),
    );

    const res = await client.RunAction(actionId, actionParams);
    return {
      Success: res.Success,
      Message: res.Message,
      OutputParams: ExtractActionOutputParams(res.Result),
    };
  };
}

/**
 * Resolves a GraphQL provider + context user into a `LiveSheetClientToolHelper` instance
 * shared across dashboard client-tool handlers (`QueryBrowser`, `DataExplorer`).
 */
export function CreateLiveSheetHelperForProvider(
  providerToUse: unknown,
  currentUser?: UserInfo | null,
): LiveSheetClientToolHelper | null {
  const provider =
    providerToUse instanceof GraphQLDataProvider
      ? providerToUse
      : GraphQLDataProvider.Instance;
  const user = currentUser ?? provider?.CurrentUser;
  if (!provider || !user) {
    return null;
  }
  return new LiveSheetClientToolHelper(
    CreateGraphQLGovernedActionExecutor(provider, user),
  );
}

function readStringOut(outputs: Record<string, unknown>, key: string): string | undefined {
  const val = outputs[key];
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
}

function readNumberOut(outputs: Record<string, unknown>, key: string): number | undefined {
  const val = outputs[key];
  return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
}

function extractMutationMetrics(outputs: Record<string, unknown>): {
  BoundingRange?: string;
  RowCount?: number;
} {
  const results = outputs['Results'];
  if (!Array.isArray(results) || results.length === 0) {
    return {};
  }
  const last = results[results.length - 1];
  if (!isPlainRecord(last)) {
    return {};
  }
  const data = isPlainRecord(last['data']) ? last['data'] : last;
  return {
    BoundingRange: typeof data['boundingRange'] === 'string' ? data['boundingRange'] : undefined,
    RowCount: typeof data['rowCount'] === 'number' ? data['rowCount'] : undefined,
  };
}

/**
 * Shared client-tool orchestrator used by QueryBrowser and DataExplorer to materialize
 * live query-backed or view-backed Excel Spreadsheets and return artifact coordinates
 * that the realtime `ArtifactWorkspace` channel can open immediately.
 */
export class LiveSheetClientToolHelper {
  public constructor(private readonly executor: GovernedActionExecutor) {}

  public async CreateLiveSheetFromQuery(
    input: CreateLiveSheetFromQueryInput,
  ): Promise<LiveSheetToolResult> {
    const sheetName = input.SheetName?.trim() || 'Query Data';
    const title = input.Title?.trim() || `${input.QueryName} — Live Sheet`;
    const tableTitle = input.TableTitle?.trim() || input.QueryName;

    const created = await this.executor({
      ActionName: '__CreateGovernedArtifact',
      Params: [
        { Name: 'Title', Value: title, Type: 'Input' },
        { Name: 'ArtifactType', Value: 'Excel Spreadsheet', Type: 'Input' },
        { Name: 'SheetNames', Value: [sheetName], Type: 'Input' },
        ...(input.Description
          ? [{ Name: 'Description', Value: input.Description, Type: 'Input' as const }]
          : []),
        ...(input.CollectionID
          ? [{ Name: 'CollectionID', Value: input.CollectionID, Type: 'Input' as const }]
          : []),
      ],
    });

    const artifactId = readStringOut(created.OutputParams, 'ArtifactID');
    if (!created.Success || !artifactId) {
      return {
        Success: false,
        ErrorMessage: created.Message || 'Failed to create governed spreadsheet artifact.',
      };
    }

    const mutated = await this.executor({
      ActionName: '__MutateGovernedArtifact',
      Params: [
        { Name: 'ArtifactID', Value: artifactId, Type: 'Input' },
        { Name: 'Tool', Value: 'upsert_live_table', Type: 'Input' },
        {
          Name: 'Input',
          Value: {
            sheet: sheetName,
            title: tableTitle,
            sourceType: 'SavedQuery',
            queryId: input.QueryID,
            queryName: input.QueryName,
            ...(input.Parameters ? { parameters: input.Parameters } : {}),
            ...(typeof input.MaxRows === 'number' ? { maxRows: input.MaxRows } : {}),
            anchorCell: input.AnchorCell?.trim() || 'A1',
          },
          Type: 'Input',
        },
      ],
    });

    if (!mutated.Success) {
      return {
        Success: false,
        ArtifactID: artifactId,
        ErrorMessage: mutated.Message || 'Created sheet but failed to populate live query table.',
      };
    }

    const metrics = extractMutationMetrics(mutated.OutputParams);
    return {
      Success: true,
      ArtifactID: readStringOut(mutated.OutputParams, 'ArtifactID') ?? artifactId,
      VersionID:
        readStringOut(mutated.OutputParams, 'VersionID') ??
        readStringOut(created.OutputParams, 'VersionID'),
      VersionNumber:
        readNumberOut(mutated.OutputParams, 'VersionNumber') ??
        readNumberOut(created.OutputParams, 'VersionNumber') ??
        1,
      ArtifactName:
        readStringOut(mutated.OutputParams, 'ArtifactName') ??
        readStringOut(created.OutputParams, 'ArtifactName') ??
        title,
      ArtifactTypeName: 'Excel Spreadsheet',
      DriverClass: 'SpreadsheetArtifactViewerPlugin',
      SheetName: sheetName,
      BoundingRange: metrics.BoundingRange,
      RowCount: metrics.RowCount,
    };
  }

  public async AppendQueryToLiveSheet(
    input: AppendQueryToLiveSheetInput,
  ): Promise<LiveSheetToolResult> {
    if (!input.ArtifactID?.trim()) {
      return { Success: false, ErrorMessage: 'ArtifactID is required to append a query table.' };
    }

    const targetSheet = input.SheetName?.trim();
    const operations: Array<{ tool: string; input: Record<string, unknown> }> = [];

    if (targetSheet) {
      const inspected = await this.executor({
        ActionName: '__InspectGovernedArtifact',
        Params: [
          { Name: 'ArtifactID', Value: input.ArtifactID, Type: 'Input' },
          { Name: 'Tool', Value: 'get_sheets', Type: 'Input' },
          { Name: 'Input', Value: {}, Type: 'Input' },
        ],
      });

      const sheetExists = this.hasExistingWorksheet(inspected.OutputParams['InspectionResult'], targetSheet);
      if (!sheetExists) {
        operations.push({ tool: 'add_sheet', input: { name: targetSheet } });
      }
    }

    operations.push({
      tool: 'upsert_live_table',
      input: {
        ...(targetSheet ? { sheet: targetSheet } : {}),
        title: input.TableTitle?.trim() || input.QueryName,
        sourceType: 'SavedQuery',
        queryId: input.QueryID,
        queryName: input.QueryName,
        ...(input.Parameters ? { parameters: input.Parameters } : {}),
        ...(typeof input.MaxRows === 'number' ? { maxRows: input.MaxRows } : {}),
        anchorCell: input.AnchorCell?.trim() || 'A1',
      },
    });

    const mutated = await this.executor({
      ActionName: '__MutateGovernedArtifact',
      Params: [
        { Name: 'ArtifactID', Value: input.ArtifactID, Type: 'Input' },
        { Name: 'Operations', Value: operations, Type: 'Input' },
      ],
    });

    if (!mutated.Success) {
      return {
        Success: false,
        ArtifactID: input.ArtifactID,
        ErrorMessage: mutated.Message || 'Failed to append live query table to spreadsheet.',
      };
    }

    const metrics = extractMutationMetrics(mutated.OutputParams);
    return {
      Success: true,
      ArtifactID: readStringOut(mutated.OutputParams, 'ArtifactID') ?? input.ArtifactID,
      VersionID: readStringOut(mutated.OutputParams, 'VersionID'),
      VersionNumber: readNumberOut(mutated.OutputParams, 'VersionNumber'),
      ArtifactName: readStringOut(mutated.OutputParams, 'ArtifactName'),
      ArtifactTypeName: 'Excel Spreadsheet',
      DriverClass: 'SpreadsheetArtifactViewerPlugin',
      SheetName: targetSheet,
      BoundingRange: metrics.BoundingRange,
      RowCount: metrics.RowCount,
    };
  }

  public async CreateLiveSheetFromView(
    input: CreateLiveSheetFromViewInput,
  ): Promise<LiveSheetToolResult> {
    if (!input.EntityName?.trim()) {
      return { Success: false, ErrorMessage: 'EntityName is required.' };
    }

    const sheetName = input.SheetName?.trim() || input.EntityName;
    const title =
      input.Title?.trim() ||
      (input.ViewName ? `${input.EntityName} — ${input.ViewName}` : `${input.EntityName} — Live Sheet`);
    const tableTitle = input.TableTitle?.trim() || input.ViewName || input.EntityName;

    const created = await this.executor({
      ActionName: '__CreateGovernedArtifact',
      Params: [
        { Name: 'Title', Value: title, Type: 'Input' },
        { Name: 'ArtifactType', Value: 'Excel Spreadsheet', Type: 'Input' },
        { Name: 'SheetNames', Value: [sheetName], Type: 'Input' },
        ...(input.Description
          ? [{ Name: 'Description', Value: input.Description, Type: 'Input' as const }]
          : []),
        ...(input.CollectionID
          ? [{ Name: 'CollectionID', Value: input.CollectionID, Type: 'Input' as const }]
          : []),
      ],
    });

    const artifactId = readStringOut(created.OutputParams, 'ArtifactID');
    if (!created.Success || !artifactId) {
      return {
        Success: false,
        ErrorMessage: created.Message || 'Failed to create governed spreadsheet artifact.',
      };
    }

    const mutated = await this.executor({
      ActionName: '__MutateGovernedArtifact',
      Params: [
        { Name: 'ArtifactID', Value: artifactId, Type: 'Input' },
        { Name: 'Tool', Value: 'upsert_live_table', Type: 'Input' },
        {
          Name: 'Input',
          Value: {
            sheet: sheetName,
            title: tableTitle,
            sourceType: 'EntityView',
            entityName: input.EntityName,
            ...(input.ViewID ? { viewId: input.ViewID } : {}),
            ...(input.ViewName ? { viewName: input.ViewName } : {}),
            ...(input.ExtraFilter ? { extraFilter: input.ExtraFilter } : {}),
            ...(input.Fields && input.Fields.length > 0 ? { fields: input.Fields } : {}),
            ...(typeof input.MaxRows === 'number' ? { maxRows: input.MaxRows } : {}),
            anchorCell: input.AnchorCell?.trim() || 'A1',
          },
          Type: 'Input',
        },
      ],
    });

    if (!mutated.Success) {
      return {
        Success: false,
        ArtifactID: artifactId,
        ErrorMessage: mutated.Message || 'Created sheet but failed to populate live view table.',
      };
    }

    const metrics = extractMutationMetrics(mutated.OutputParams);
    return {
      Success: true,
      ArtifactID: readStringOut(mutated.OutputParams, 'ArtifactID') ?? artifactId,
      VersionID:
        readStringOut(mutated.OutputParams, 'VersionID') ??
        readStringOut(created.OutputParams, 'VersionID'),
      VersionNumber:
        readNumberOut(mutated.OutputParams, 'VersionNumber') ??
        readNumberOut(created.OutputParams, 'VersionNumber') ??
        1,
      ArtifactName:
        readStringOut(mutated.OutputParams, 'ArtifactName') ??
        readStringOut(created.OutputParams, 'ArtifactName') ??
        title,
      ArtifactTypeName: 'Excel Spreadsheet',
      DriverClass: 'SpreadsheetArtifactViewerPlugin',
      SheetName: sheetName,
      BoundingRange: metrics.BoundingRange,
      RowCount: metrics.RowCount,
    };
  }

  private hasExistingWorksheet(inspectionResult: unknown, sheetName: string): boolean {
    if (!isPlainRecord(inspectionResult)) {
      return false;
    }
    const sheets = inspectionResult['sheets'];
    if (!Array.isArray(sheets)) {
      return false;
    }
    const target = sheetName.trim().toLowerCase();
    return sheets.some(
      (s) =>
        isPlainRecord(s) &&
        ((typeof s['name'] === 'string' && s['name'].trim().toLowerCase() === target) ||
          (typeof s['sheetId'] === 'string' && s['sheetId'].trim().toLowerCase() === target)),
    );
  }
}
