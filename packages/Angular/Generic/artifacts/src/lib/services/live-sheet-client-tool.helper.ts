import { ActionEngineBase, ActionParam, type ActionResult } from '@memberjunction/actions-base';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
  SanitizeWorksheetName,
  type MJActionEntity,
  type MJArtifactEntity,
  type MJArtifactVersionEntity,
  type MJCollectionArtifactEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, SafeJSONParse } from '@memberjunction/global';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

export type LiveSheetJsonPrimitive = string | number | boolean | null | undefined;
export type LiveSheetJsonValue =
  | LiveSheetJsonPrimitive
  | LiveSheetJsonValue[]
  | { [key: string]: LiveSheetJsonValue };
export type LiveSheetJsonObject = { [key: string]: LiveSheetJsonValue };

export type GovernedArtifactActionName =
  | '__CreateGovernedArtifact'
  | '__InspectGovernedArtifact'
  | '__MutateGovernedArtifact';

export interface GovernedActionParamInput {
  Name: string;
  Value: LiveSheetJsonValue;
  Type: 'Input' | 'Output' | 'Both';
}

export interface GovernedActionExecutionRequest {
  ActionName: GovernedArtifactActionName;
  Params: GovernedActionParamInput[];
}

export interface GovernedActionExecutionResult {
  Success: boolean;
  Message?: string;
  OutputParams: LiveSheetJsonObject;
}

export type GovernedActionExecutor = (
  request: GovernedActionExecutionRequest,
) => Promise<GovernedActionExecutionResult>;

export type GovernedArtifactRollback = (
  artifactId: string,
  versionId?: string,
) => Promise<boolean>;

export interface CreateLiveSheetFromQueryInput {
  QueryID: string;
  QueryName: string;
  Title?: string;
  SheetName?: string;
  TableTitle?: string;
  Parameters?: LiveSheetJsonObject;
  MaxRows?: number;
  AnchorCell?: string;
  Description?: string;
  CollectionID?: string;
  ExistingArtifactID?: string;
}

export interface AppendQueryToLiveSheetInput {
  ArtifactID: string;
  QueryID: string;
  QueryName: string;
  SheetName?: string;
  TableTitle?: string;
  Parameters?: LiveSheetJsonObject;
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
  ExistingArtifactID?: string;
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

function isPlainRecord(value: LiveSheetJsonValue | ActionResult['Result']): value is LiveSheetJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes `GraphQLActionClient.RunAction`'s `Result` payload (`ActionParam[]` JSON,
 * `CopyScalarsAndArrays(ActionParam[])` index-keyed object `{"0": {"Name": ..., "Value": ...}}`,
 * or flat object) into a `Name -> Value` lookup map.
 */
export function ExtractActionOutputParams(
  resultPayload: LiveSheetJsonValue | ActionResult['Result'],
): LiveSheetJsonObject {
  const outputs: LiveSheetJsonObject = {};
  if (Array.isArray(resultPayload)) {
    for (const item of resultPayload) {
      if (isPlainRecord(item) && typeof item['Name'] === 'string') {
        outputs[item['Name']] = item['Value'];
      }
    }
    return outputs;
  }
  if (isPlainRecord(resultPayload)) {
    const entries = Object.entries(resultPayload);
    const values = Object.values(resultPayload);
    const keysAreNumericIndices = entries.length > 0 && entries.every(([k]) => /^\d+$/.test(k));
    const hasNamedParamEntry = values.some(
      (entry) => isPlainRecord(entry) && typeof entry['Name'] === 'string',
    );
    const allEntriesAreNamedParams =
      values.length > 0 &&
      values.every((entry) => isPlainRecord(entry) && typeof entry['Name'] === 'string');

    if ((keysAreNumericIndices && hasNamedParamEntry) || allEntriesAreNamedParams) {
      for (const entry of values) {
        if (isPlainRecord(entry) && typeof entry['Name'] === 'string') {
          outputs[entry['Name']] = entry['Value'];
        }
      }
      return outputs;
    }

    for (const [k, v] of entries) {
      outputs[k] = v;
    }
  }
  return outputs;
}

const MESSAGE_JSON_KEY_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['artifactId', 'ArtifactID'],
  ['versionId', 'VersionID'],
  ['versionNumber', 'VersionNumber'],
  ['name', 'ArtifactName'],
  ['typeName', 'ArtifactTypeName'],
  ['driverClass', 'DriverClass'],
  ['results', 'Results'],
  ['data', 'InspectionResult'],
];

function extractOutputParamsFromMessage(message: string | undefined): LiveSheetJsonObject {
  if (!message) {
    return {};
  }
  const trimmed = message.trim();
  if (!trimmed.startsWith('{')) {
    return {};
  }
  const parsed = SafeJSONParse<LiveSheetJsonObject>(trimmed, false);
  if (!parsed || !isPlainRecord(parsed)) {
    return {};
  }
  const normalized: LiveSheetJsonObject = { ...parsed };
  for (const [camelKey, pascalKey] of MESSAGE_JSON_KEY_ALIASES) {
    if (normalized[pascalKey] === undefined && parsed[camelKey] !== undefined) {
      normalized[pascalKey] = parsed[camelKey];
    }
  }
  return normalized;
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

  const actionEngine = ActionEngineBase.GetProviderInstance(provider, ActionEngineBase) as ActionEngineBase;
  if (actionEngine.Actions.length === 0) {
    await actionEngine.Config(false, contextUser, provider);
  }
  const cached = actionEngine.Actions.find(
    (a) =>
      a.DriverClass?.trim().toLowerCase() === loweredDriver ||
      a.Name.trim().toLowerCase() === loweredName ||
      a.Name.trim().toLowerCase() === loweredDriver,
  );
  if (cached) {
    return cached.ID;
  }

  const rv = RunView.FromMetadataProvider(provider);
  const safeDriver = EscapeSQLString(actionName);
  const safeDisplay = EscapeSQLString(displayName);
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
    const outputParams = ExtractActionOutputParams(res.Result);
    const fromMessage = extractOutputParamsFromMessage(res.Message);
    for (const [key, val] of Object.entries(fromMessage)) {
      if (outputParams[key] === undefined) {
        outputParams[key] = val;
      }
    }
    return {
      Success: res.Success,
      Message: res.Message,
      OutputParams: outputParams,
    };
  };
}

export async function RollbackCreatedArtifact(
  provider: GraphQLDataProvider,
  contextUser: UserInfo,
  artifactId: string,
  versionId?: string,
): Promise<boolean> {
  try {
    if (versionId) {
      const rv = RunView.FromMetadataProvider(provider);
      const safeVersionId = EscapeSQLString(versionId);
      const collectionLinks = await rv.RunView<MJCollectionArtifactEntity>(
        {
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `ArtifactVersionID='${safeVersionId}'`,
          ResultType: 'entity_object',
        },
        contextUser,
      );
      if (collectionLinks.Success) {
        for (const link of collectionLinks.Results) {
          await link.Delete();
        }
      }
      const versionEntity = await provider.GetEntityObject<MJArtifactVersionEntity>(
        'MJ: Artifact Versions',
        contextUser,
      );
      if (await versionEntity.Load(versionId)) {
        await versionEntity.Delete();
      }
    }
    const artifactEntity = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
    if (await artifactEntity.Load(artifactId)) {
      return await artifactEntity.Delete();
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolves a GraphQL provider + context user into a `LiveSheetClientToolHelper` instance
 * shared across dashboard client-tool handlers (`QueryBrowser`, `DataExplorer`).
 */
export function CreateLiveSheetHelperForProvider(
  providerToUse: IMetadataProvider | null | undefined,
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
    (artifactId, versionId) => RollbackCreatedArtifact(provider, user, artifactId, versionId),
  );
}

function readStringOut(outputs: LiveSheetJsonObject, key: string): string | undefined {
  const val = outputs[key];
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
}

function readNumberOut(outputs: LiveSheetJsonObject, key: string): number | undefined {
  const val = outputs[key];
  return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
}

function extractMutationMetrics(outputs: LiveSheetJsonObject): {
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
  public constructor(
    private readonly executor: GovernedActionExecutor,
    private readonly rollbackArtifact?: GovernedArtifactRollback,
  ) {}

  public async CreateLiveSheetFromQuery(
    input: CreateLiveSheetFromQueryInput,
  ): Promise<LiveSheetToolResult> {
    const sheetName = SanitizeWorksheetName(input.SheetName?.trim() || 'Query Data');
    const title = input.Title?.trim() || `${input.QueryName} — Live Sheet`;
    const tableTitle = input.TableTitle?.trim() || input.QueryName;

    return this.createAndPopulateLiveSheet({
      title,
      sheetName,
      description: input.Description,
      collectionId: input.CollectionID,
      existingArtifactId: input.ExistingArtifactID,
      defaultMutationFailureMessage: 'Created sheet but failed to populate live query table.',
      tableInput: {
        sheet: sheetName,
        title: tableTitle,
        sourceType: 'SavedQuery',
        queryId: input.QueryID,
        queryName: input.QueryName,
        ...(input.Parameters ? { parameters: input.Parameters } : {}),
        ...(typeof input.MaxRows === 'number' ? { maxRows: input.MaxRows } : {}),
        anchorCell: input.AnchorCell?.trim() || 'A1',
      },
    });
  }

  public async AppendQueryToLiveSheet(
    input: AppendQueryToLiveSheetInput,
  ): Promise<LiveSheetToolResult> {
    if (!input.ArtifactID?.trim()) {
      return { Success: false, ErrorMessage: 'ArtifactID is required to append a query table.' };
    }

    const rawTargetSheet = input.SheetName?.trim();
    const targetSheet = rawTargetSheet ? SanitizeWorksheetName(rawTargetSheet) : undefined;
    const operations: Array<{ tool: string; input: LiveSheetJsonObject }> = [];

    if (targetSheet) {
      const inspected = await this.executor({
        ActionName: '__InspectGovernedArtifact',
        Params: [
          { Name: 'ArtifactID', Value: input.ArtifactID, Type: 'Input' },
          { Name: 'Tool', Value: 'get_sheets', Type: 'Input' },
          { Name: 'Input', Value: {}, Type: 'Input' },
        ],
      });

      if (!inspected.Success) {
        return {
          Success: false,
          ArtifactID: input.ArtifactID,
          ErrorMessage: inspected.Message || 'Failed to inspect target spreadsheet worksheets.',
        };
      }

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

    const sheetName = SanitizeWorksheetName(input.SheetName?.trim() || input.EntityName);
    const title =
      input.Title?.trim() ||
      (input.ViewName ? `${input.EntityName} — ${input.ViewName}` : `${input.EntityName} — Live Sheet`);
    const tableTitle = input.TableTitle?.trim() || input.ViewName || input.EntityName;

    return this.createAndPopulateLiveSheet({
      title,
      sheetName,
      description: input.Description,
      collectionId: input.CollectionID,
      existingArtifactId: input.ExistingArtifactID,
      defaultMutationFailureMessage: 'Created sheet but failed to populate live view table.',
      tableInput: {
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
    });
  }

  private async createAndPopulateLiveSheet(opts: {
    title: string;
    sheetName: string;
    description?: string;
    collectionId?: string;
    existingArtifactId?: string;
    defaultMutationFailureMessage: string;
    tableInput: LiveSheetJsonObject;
  }): Promise<LiveSheetToolResult> {
    const normalizedSheetName = SanitizeWorksheetName(opts.sheetName);
    const tableInputWithSanitizedSheet: LiveSheetJsonObject = {
      ...opts.tableInput,
      sheet: normalizedSheetName,
    };
    let artifactId = opts.existingArtifactId?.trim();
    const operations: Array<{ tool: string; input: LiveSheetJsonObject }> = [];

    if (!artifactId) {
      const created = await this.executor({
        ActionName: '__CreateGovernedArtifact',
        Params: [
          { Name: 'Title', Value: opts.title, Type: 'Input' },
          { Name: 'ArtifactType', Value: 'Excel Spreadsheet', Type: 'Input' },
          { Name: 'SheetNames', Value: [normalizedSheetName], Type: 'Input' },
          {
            Name: 'InitialOperations',
            Value: [{ tool: 'upsert_live_table', input: tableInputWithSanitizedSheet }],
            Type: 'Input',
          },
          ...(opts.description
            ? [{ Name: 'Description', Value: opts.description, Type: 'Input' as const }]
            : []),
          ...(opts.collectionId
            ? [{ Name: 'CollectionID', Value: opts.collectionId, Type: 'Input' as const }]
            : []),
        ],
      });

      artifactId = readStringOut(created.OutputParams, 'ArtifactID');
      if (!created.Success || !artifactId) {
        if (!created.Success && artifactId && this.rollbackArtifact) {
          await this.rollbackArtifact(artifactId, readStringOut(created.OutputParams, 'VersionID'));
        }
        return {
          Success: false,
          ErrorMessage: created.Message || 'Failed to create governed spreadsheet artifact.',
        };
      }

      const metrics = extractMutationMetrics(created.OutputParams);
      return {
        Success: true,
        ArtifactID: artifactId,
        VersionID: readStringOut(created.OutputParams, 'VersionID'),
        VersionNumber: readNumberOut(created.OutputParams, 'VersionNumber') ?? 1,
        ArtifactName: readStringOut(created.OutputParams, 'ArtifactName') ?? opts.title,
        ArtifactTypeName: 'Excel Spreadsheet',
        DriverClass: 'SpreadsheetArtifactViewerPlugin',
        SheetName: normalizedSheetName,
        BoundingRange: metrics.BoundingRange,
        RowCount: metrics.RowCount,
      };
    }

    const inspected = await this.executor({
      ActionName: '__InspectGovernedArtifact',
      Params: [
        { Name: 'ArtifactID', Value: artifactId, Type: 'Input' },
        { Name: 'Tool', Value: 'get_sheets', Type: 'Input' },
        { Name: 'Input', Value: {}, Type: 'Input' },
      ],
    });
    if (!inspected.Success) {
      return {
        Success: false,
        ArtifactID: artifactId,
        ErrorMessage: inspected.Message || 'Failed to inspect target spreadsheet worksheets.',
      };
    }
    const sheetExists = this.hasExistingWorksheet(inspected.OutputParams['InspectionResult'], normalizedSheetName);
    if (!sheetExists) {
      operations.push({ tool: 'add_sheet', input: { name: normalizedSheetName } });
    }

    const mutated =
      operations.length > 0
        ? await this.executor({
            ActionName: '__MutateGovernedArtifact',
            Params: [
              { Name: 'ArtifactID', Value: artifactId, Type: 'Input' },
              {
                Name: 'Operations',
                Value: [...operations, { tool: 'upsert_live_table', input: tableInputWithSanitizedSheet }],
                Type: 'Input',
              },
            ],
          })
        : await this.executor({
            ActionName: '__MutateGovernedArtifact',
            Params: [
              { Name: 'ArtifactID', Value: artifactId, Type: 'Input' },
              { Name: 'Tool', Value: 'upsert_live_table', Type: 'Input' },
              { Name: 'Input', Value: tableInputWithSanitizedSheet, Type: 'Input' },
            ],
          });

    if (!mutated.Success) {
      return {
        Success: false,
        ArtifactID: artifactId,
        ErrorMessage: mutated.Message || opts.defaultMutationFailureMessage,
      };
    }

    const metrics = extractMutationMetrics(mutated.OutputParams);
    return {
      Success: true,
      ArtifactID: readStringOut(mutated.OutputParams, 'ArtifactID') ?? artifactId,
      VersionID: readStringOut(mutated.OutputParams, 'VersionID'),
      VersionNumber: readNumberOut(mutated.OutputParams, 'VersionNumber') ?? 1,
      ArtifactName: readStringOut(mutated.OutputParams, 'ArtifactName') ?? opts.title,
      ArtifactTypeName: 'Excel Spreadsheet',
      DriverClass: 'SpreadsheetArtifactViewerPlugin',
      SheetName: normalizedSheetName,
      BoundingRange: metrics.BoundingRange,
      RowCount: metrics.RowCount,
    };
  }

  private hasExistingWorksheet(inspectionResult: LiveSheetJsonValue, sheetName: string): boolean {
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
