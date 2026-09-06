/**
 * @fileoverview Runtime utilities for React components providing access to MemberJunction core functionality
 * @module @memberjunction/ng-react/utilities
 */

import {
  Metadata,
  RunView,
  RunQuery,
  RunViewParams,
  RunQueryParams,
  LogError,
  BaseEntity,
  IEntityDataProvider,
  IMetadataProvider,
  IRunQueryProvider,
  UserInfo
} from '@memberjunction/core';

import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { GeoDataEngine } from '@memberjunction/core-entities';
import {
  ComponentUtilities,
  SimpleAITools,
  SimpleGeoDataEngine,
  SimpleMetadata,
  SimpleMLTools,
  SimpleMLModelInfo,
  SimpleMLListModelsFilter,
  SimpleMLScoreResult,
  SimpleMLSignalInfo,
  SimpleMLSignalBinding,
  SimpleMLComputeSignalResult,
  SimpleRunQuery,
  SimpleRunView,
  SimpleExecutePromptParams,
  SimpleExecutePromptResult,
  SimpleEmbedTextParams,
  SimpleEmbedTextResult
} from '@memberjunction/interactive-component-types';
import { GraphQLDataProvider, GraphQLActionClient } from '@memberjunction/graphql-dataprovider';
import { ActionEngineBase, type ActionParam, type ActionResult } from '@memberjunction/actions-base';
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import {
  MJMLModelEntity,
  PredictiveStudioScoreRecordSetOperation,
  PredictiveStudioScoreRecordSetInput
} from '@memberjunction/core-entities';

/**
 * Base class for providing runtime utilities to React components in Angular.
 * This class can be extended and registered with MJ's ClassFactory
 * to provide custom implementations of data access methods.
 */
@RegisterClass(RuntimeUtilities, 'RuntimeUtilities')
export class RuntimeUtilities {
  private debug: boolean = false;
  /**
   * The provider every read in the built utilities goes through. Always set by
   * {@link buildUtilities} before use — falls back to the global provider there
   * (`provider ?? Metadata.Provider`) when the host doesn't supply one.
   */
  private provider!: IMetadataProvider;

  /**
   * Builds the complete utilities object for React components
   * This is the main method that components will use
   *
   * @param provider the host's provider. A React component mounted under a non-default provider
   *        passes its own `ProviderToUse`; omitting it falls back to the global default, named
   *        explicitly rather than reached for via `new Metadata()`.
   */
  public buildUtilities(debug: boolean = false, provider?: IMetadataProvider): ComponentUtilities {
    this.debug = debug;
    this.provider = provider ?? Metadata.Provider;
    return this.SetupUtilities(this.provider);
  }

  /**
   * Sets up the utilities object - copied from skip-chat implementation
   */
  private SetupUtilities(md: IMetadataProvider): ComponentUtilities {
    const rv = RunView.FromMetadataProvider(md);
    const rq = new RunQuery(md as unknown as IRunQueryProvider);
    const u: ComponentUtilities = {
      md: this.CreateSimpleMetadata(md),
      rv: this.CreateSimpleRunView(rv),
      rq: this.CreateSimpleRunQuery(rq),
      ai: this.CreateSimpleAITools(),
      geoDataEngine: this.CreateSimpleGeoDataEngine(),
      ml: this.CreateSimpleMLTools()
    };
    return u;
  }

  private CreateSimpleAITools(): SimpleAITools {
    // Get the GraphQL provider - it's the same as the BaseEntity provider
    const provider = BaseEntity.Provider;
    
    // Check if it's a GraphQLDataProvider
    if (!(provider instanceof GraphQLDataProvider)) {
      throw new Error('Current data provider is not a GraphQLDataProvider. AI tools require GraphQL provider.');
    }

    const graphQLProvider = provider as GraphQLDataProvider;
    
    return {
      ExecutePrompt: async (params: SimpleExecutePromptParams): Promise<SimpleExecutePromptResult> => {
        try {
          // Use the AI client from GraphQLDataProvider to execute simple prompt
          const result = await graphQLProvider.AI.ExecuteSimplePrompt({
            systemPrompt: params.systemPrompt,
            messages: params.messages,
            preferredModels: params.preferredModels,
            modelPower: params.modelPower
          });

          console.log(`🤖  ExecutePrompt succeeded!`);
          if (this.debug) {
            console.log('     > params', params);
            console.log('     > result:', result);
          }

          return {
            success: result.success,
            result: result.result || '',
            resultObject: result.resultObject,
            modelName: result.modelName || ''
          };
        } catch (error) {
          LogError(error);
          return {
            success: false,
            result: 'Failed to execute prompt: ' + (error instanceof Error ? error.message : String(error)),
            modelName: ''
          };
        }
      },
      
      EmbedText: async (params: SimpleEmbedTextParams): Promise<SimpleEmbedTextResult> => {
        try {
          // Use the AI client from GraphQLDataProvider to generate embeddings
          const result = await graphQLProvider.AI.EmbedText({
            textToEmbed: params.textToEmbed,
            modelSize: params.modelSize
          });
          
          if (result.error) {
            throw new Error(result.error || 'Failed to generate embeddings');
          }

          const numEmbeddings: number = Array.isArray(params.textToEmbed) ? result.embeddings?.length : 1;
          console.log(`🤖  EmbedText succeeded! ${numEmbeddings} embeddings returned`);
          if (this.debug) {
            console.log('     > params', params);
            console.log('     > result:', result);
          }
          return {
            result: result.embeddings,
            modelName: result.modelName,
            vectorDimensions: result.vectorDimensions
          };
        } catch (error) {
          LogError(error);
          throw error; // Re-throw for embeddings as they're critical
        }
      },
      
      VectorService: new SimpleVectorService()
    };
  }

  /**
   * Creates the ML tools surface for components — listing trained models and scoring records.
   * `listModels` reads the `MJ: ML Models` catalog via RunView; `score` marshals the
   * `PredictiveStudio.ScoreRecordSet` Remote Operation over GraphQL to the server engine (the
   * Python sidecar lives server-side and cannot run in the browser). Returns `undefined` when no
   * GraphQL provider is available, so the `ml` capability degrades cleanly.
   */
  private CreateSimpleMLTools(): SimpleMLTools | undefined {
    const provider = BaseEntity.Provider;
    // Scoring requires a GraphQL provider to route the Remote Operation to the server engine.
    if (!(provider instanceof GraphQLDataProvider)) {
      return undefined;
    }
    const graphQLProvider = provider as GraphQLDataProvider;

    return {
      listModels: (filter?: SimpleMLListModelsFilter, contextUser?: UserInfo): Promise<SimpleMLModelInfo[]> =>
        this.listMLModels(filter, contextUser),

      score: (
        modelId: string,
        records: Array<Record<string, unknown> | string>,
        options?: { primaryKeyField?: string; contextUser?: UserInfo }
      ): Promise<SimpleMLScoreResult> => this.scoreMLRecords(graphQLProvider, modelId, records, options),

      listSignals: (
        filter?: { search?: string; rebindableOnly?: boolean; maxRows?: number }
      ): Promise<SimpleMLSignalInfo[]> => this.listMLSignals(graphQLProvider, filter),

      computeSignal: (
        signalId: string,
        targetEntity: string,
        options?: {
          filter?: string;
          maxRows?: number;
          asOfColumn?: string;
          binding?: SimpleMLSignalBinding;
        }
      ): Promise<SimpleMLComputeSignalResult> =>
        this.computeMLSignal(graphQLProvider, signalId, targetEntity, options)
    };
  }

  /**
   * Loads the trained-model catalog from `MJ: ML Models`, newest version first, mapping each row
   * to a {@link SimpleMLModelInfo}. Resilient — logs and returns `[]` on any failure.
   */
  private async listMLModels(filter?: SimpleMLListModelsFilter, contextUser?: UserInfo): Promise<SimpleMLModelInfo[]> {
    try {
      const rv = RunView.FromMetadataProvider(this.provider);
      const result = await rv.RunView<MJMLModelEntity>(
        {
          EntityName: 'MJ: ML Models',
          ExtraFilter: this.buildMLModelsFilter(filter),
          OrderBy: 'Version DESC',
          MaxRows: filter?.maxResults,
          ResultType: 'entity_object'
        },
        contextUser
      );
      if (!result.Success) {
        console.error(`❌ listModels failed for MJ: ML Models: ${result.ErrorMessage}`);
        return [];
      }
      return result.Results.map((m) => this.mapMLModel(m));
    } catch (error) {
      LogError(error);
      return [];
    }
  }

  /**
   * Builds the ExtraFilter clause for {@link listMLModels}. Defaults to `Status='Published'` so
   * components only see promoted models unless the caller overrides the status.
   */
  private buildMLModelsFilter(filter?: SimpleMLListModelsFilter): string {
    const clauses: string[] = [];
    const status = filter?.status ?? 'Published';
    clauses.push(`Status='${this.escapeSqlLiteral(status)}'`);
    if (filter?.targetVariable) {
      clauses.push(`TargetVariable='${this.escapeSqlLiteral(filter.targetVariable)}'`);
    }
    return clauses.join(' AND ');
  }

  /** Maps a single `MJ: ML Models` row to the component-facing {@link SimpleMLModelInfo} shape. */
  private mapMLModel(m: MJMLModelEntity): SimpleMLModelInfo {
    return {
      id: m.ID,
      pipeline: m.Pipeline,
      version: m.Version,
      targetVariable: m.TargetVariable,
      problemType: m.ProblemType,
      status: m.Status,
      metrics: this.parseMLMetrics(m.Metrics),
      holdoutMetrics: this.parseMLMetrics(m.HoldoutMetrics)
    };
  }

  /** Defensively parses a JSON metrics blob; returns `undefined` for null/empty/invalid JSON. */
  private parseMLMetrics(raw: string | null): Record<string, unknown> | undefined {
    if (!raw) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Scores records with a trained model by invoking the `PredictiveStudio.ScoreRecordSet` Remote
   * Operation. Normalizes `records` to primary-key strings, requests ephemeral predictions (no
   * write-back), and maps the result. Resilient — logs and returns a zeroed result with the input
   * records counted as failed on any error.
   */
  private async scoreMLRecords(
    provider: GraphQLDataProvider,
    modelId: string,
    records: Array<Record<string, unknown> | string>,
    options?: { primaryKeyField?: string; contextUser?: UserInfo }
  ): Promise<SimpleMLScoreResult> {
    const keys = this.normalizeRecordKeys(records, options?.primaryKeyField ?? 'ID');
    try {
      const input: PredictiveStudioScoreRecordSetInput = {
        modelId,
        scope: { records: keys }
        // No writeBack → predictions are returned ephemerally.
      };
      const op = new PredictiveStudioScoreRecordSetOperation();
      const result = await op.Execute(input, { provider, user: options?.contextUser });
      if (!result.Success || !result.Output) {
        console.error(`❌ score failed for model ${modelId}: ${result.ErrorMessage}`);
        return { scoredCount: 0, failedCount: keys.length, skippedCount: 0, predictions: [] };
      }
      const out = result.Output;
      return {
        scoredCount: out.scored,
        failedCount: out.failed,
        skippedCount: out.skipped,
        predictions: (out.predictions ?? []).map((p) => ({
          recordId: p.recordId,
          score: p.score,
          class: p.class
        }))
      };
    } catch (error) {
      LogError(error);
      return { scoredCount: 0, failedCount: keys.length, skippedCount: 0, predictions: [] };
    }
  }

  /**
   * Lists the signal catalogue by running the `List Signals` action server-side.
   *
   * Deliberately not a RunView: whether a measure is *rebindable* is a property of the component
   * type's driver, and the type tree is not in the browser. A client-side guess would eventually
   * offer a population picker beside a measure that cannot be pointed anywhere. Meaning-search is
   * server-side for the same reason the reuse search is — the query has to be embedded with the
   * model that wrote the stories, and the story vectors never reach the browser.
   *
   * Resilient — logs and returns `[]` on any failure, so a component degrades to "no signals".
   */
  private async listMLSignals(
    provider: GraphQLDataProvider,
    filter?: { search?: string; rebindableOnly?: boolean; maxRows?: number }
  ): Promise<SimpleMLSignalInfo[]> {
    const params: ActionParam[] = [];
    // Only send what the caller set — an explicit undefined would override the action's own defaults.
    const optional: Array<[string, unknown]> = [
      ['QueryText', filter?.search],
      ['RebindableOnly', filter?.rebindableOnly],
      ['MaxRows', filter?.maxRows]
    ];
    for (const [name, value] of optional) {
      if (value !== undefined) {
        params.push({ Name: name, Value: value, Type: 'Input' });
      }
    }

    const result = await this.runMLAction(provider, 'List Signals', params);
    if (!result) {
      return [];
    }
    const signals = this.actionOutput(result, 'Signals');
    if (!Array.isArray(signals)) {
      return [];
    }
    return signals.map((raw) => {
      const s = raw as Record<string, unknown>;
      return {
        id: String(s['ID'] ?? ''),
        name: String(s['Name'] ?? ''),
        type: String(s['TypeName'] ?? ''),
        story: typeof s['Story'] === 'string' ? s['Story'] : null,
        rebindable: s['Rebindable'] === true
      };
    });
  }

  /**
   * Computes one signal over a population by running the `Compute Signal` action.
   *
   * The whole point of routing through the server is that this uses the same feature-assembly path
   * training used — including the as-of cut and the missing-data rules — so the number a component
   * renders and the number a model trained on come from one definition rather than two that quietly
   * disagree.
   *
   * A refusal (a substituted field that does not exist, a measure that cannot be rebound) comes back
   * as `success: false` with the message naming what was wrong, rather than as a column of nulls
   * that looks like a real answer.
   */
  private async computeMLSignal(
    provider: GraphQLDataProvider,
    signalId: string,
    targetEntity: string,
    options?: {
      filter?: string;
      maxRows?: number;
      asOfColumn?: string;
      binding?: SimpleMLSignalBinding;
    }
  ): Promise<SimpleMLComputeSignalResult> {
    const failed = (message: string): SimpleMLComputeSignalResult => ({
      success: false,
      outputColumn: '',
      values: [],
      errorMessage: message
    });

    const params: ActionParam[] = [
      { Name: 'SignalID', Value: signalId, Type: 'Input' },
      { Name: 'TargetEntity', Value: targetEntity, Type: 'Input' }
    ];
    const optional: Array<[string, unknown]> = [
      ['Filter', options?.filter],
      ['MaxRows', options?.maxRows],
      ['AsOfColumn', options?.asOfColumn],
      // Binding substitutions travel as flat params — omitted ones keep the signal's stored default.
      ['SourceEntity', options?.binding?.sourceEntity],
      ['ForeignKeyField', options?.binding?.foreignKeyField],
      ['DateField', options?.binding?.dateField],
      ['ValueField', options?.binding?.valueField],
      ['Column', options?.binding?.column]
    ];
    for (const [name, value] of optional) {
      if (value !== undefined) {
        params.push({ Name: name, Value: value, Type: 'Input' });
      }
    }

    const result = await this.runMLAction(provider, 'Compute Signal', params);
    if (!result) {
      return failed(`The 'Compute Signal' action could not be run.`);
    }
    if (!result.Success) {
      return failed(result.Message ?? 'The signal could not be computed.');
    }

    const values = this.actionOutput(result, 'Values');
    return {
      success: true,
      outputColumn: String(this.actionOutput(result, 'OutputColumn') ?? ''),
      values: Array.isArray(values)
        ? values.map((raw) => {
            const v = raw as Record<string, unknown>;
            const value = v['Value'];
            return {
              recordId: String(v['RecordID'] ?? ''),
              value:
                value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
                  ? value
                  : null
            };
          })
        : [],
      errorMessage: null
    };
  }

  /**
   * Runs a Predictive Studio action by name. Returns `undefined` when the action is not in metadata
   * — which is the normal state on a server where Predictive Studio's seeds were never pushed, and
   * the reason the two signal methods are optional on the capability surface.
   */
  private async runMLAction(
    provider: GraphQLDataProvider,
    actionName: string,
    params: ActionParam[]
  ): Promise<ActionResult | undefined> {
    try {
      const action = ActionEngineBase.Instance.Actions.find((a) => a.Name === actionName);
      if (!action) {
        console.error(`❌ the '${actionName}' action is not in metadata — Predictive Studio seeds may not be pushed.`);
        return undefined;
      }
      return await new GraphQLActionClient(provider).RunAction(action.ID, params);
    } catch (error) {
      LogError(error);
      return undefined;
    }
  }

  /** Read one output parameter off an action result. */
  private actionOutput(result: ActionResult, name: string): unknown {
    return result.Params?.find((p) => p.Name === name)?.Value;
  }

  /**
   * Normalizes a mixed array of primary-key strings and row objects into an array of primary-key
   * strings, reading `primaryKeyField` from objects. Drops entries without a resolvable key.
   */
  private normalizeRecordKeys(records: Array<Record<string, unknown> | string>, primaryKeyField: string): string[] {
    const keys: string[] = [];
    for (const r of records) {
      if (typeof r === 'string') {
        keys.push(r);
      } else if (r != null) {
        const value = r[primaryKeyField];
        if (value != null) {
          keys.push(String(value));
        }
      }
    }
    return keys;
  }

  /** Escapes single quotes for safe inlining into a RunView ExtraFilter SQL string literal. */
  private escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
  }

  private CreateSimpleMetadata(md: IMetadataProvider): SimpleMetadata {
    return {
      Entities: md.Entities,
      GetEntityObject: (entityName: string) => {
        return md.GetEntityObject(entityName)
      }
    }
  }

  private CreateSimpleGeoDataEngine(): SimpleGeoDataEngine | undefined {
    try {
      const geo = GeoDataEngine.Instance;
      if (!geo) return undefined;
      return {
        ResolvePointToLocation: (lat: number, lng: number) => {
          return geo.ResolvePointToLocation(lat, lng);
        },
        // GeoDataEngine is on-demand load — callers must await before ResolvePointToLocation works.
        EnsureLoaded: () => geo.EnsureLoaded(),
        get Loaded() {
          return geo.Loaded;
        }
      };
    } catch {
      // GeoDataEngine may not be configured yet — return undefined
      return undefined;
    }
  }

  private CreateSimpleRunQuery(rq: RunQuery): SimpleRunQuery {
    return {
      RunQuery: async (params: RunQueryParams) => {
        // Run a single query and return the results
        try {
          const result = await rq.RunQuery(params);
          if (result.Success) {
            console.log(`✅ RunQuery "${params.QueryName}" succeeded: ${result.RowCount} rows returned`);
            if (this.debug) {
              console.log('     > params', params);
              console.log('     > result:', result);
            }
          } else {
            console.error(`❌ RunQuery failed: ${result.ErrorMessage}`);
          }
          return result;
        } catch (error) {
          console.error(`❌ RunQuery threw exception:`, error);
          LogError(error);
          throw error; // Re-throw to handle it in the caller
        }
      }
    }
  }

  private CreateSimpleRunView(rv: RunView): SimpleRunView {
    return {
      RunView: async (params: RunViewParams) => {
        // Run a single view and return the results
        try {
          const result = await rv.RunView(params);
          if (result.Success) {
            console.log(`✅ RunView succeeded for ${params.EntityName}: ${result.TotalRowCount} rows returned`);
            if (this.debug) {
              console.log('     > params', params);
              console.log('     > result:', result);
            }
          } else {
            console.error(`❌ RunView failed for ${params.EntityName}: ${result.ErrorMessage}`);
          }
          return result;
        } catch (error) {
          console.error(`❌ RunView threw exception:`, error);
          LogError(error);
          throw error; // Re-throw to handle it in the caller
        }
      },
      RunViews: async (params: RunViewParams[]) => {
        // Runs multiple views and returns the results
        try {
          const results = await rv.RunViews(params);
          const entityNames = params.map(p => p.EntityName).join(', ');
          const totalRows = results.reduce((sum, r) => sum + (r.TotalRowCount || 0), 0);
          console.log(`✅ RunViews succeeded for [${entityNames}]: ${totalRows} total rows returned`);
          if (this.debug) {
            console.log('     > params', params);
            console.log('     > results:', results);
          }
          return results;
        } catch (error) {
          console.error(`❌ RunViews threw exception:`, error);
          LogError(error);
          throw error; // Re-throw to handle it in the caller
        }
      }
    }
  }
}

/**
 * Factory function to create RuntimeUtilities
 * In a Node.js environment, this will use MJ's ClassFactory for runtime substitution
 * In a browser environment, it will use the base class directly
 */
export function createRuntimeUtilities(): RuntimeUtilities {
  // Check if we're in a Node.js environment with MJGlobal available
  if (typeof window === 'undefined') {
    try {
      // Use ClassFactory to get the registered class, defaulting to base RuntimeUtilities
      const obj = MJGlobal.Instance.ClassFactory.CreateInstance<RuntimeUtilities>(RuntimeUtilities);
      if (!obj) {
        throw new Error('Failed to create RuntimeUtilities instance');
      }

      // Ensure the object is an instance of RuntimeUtilities
      return obj;
    } catch (e) {
      // Fall through to default
    }
  }
  
  // Default: just use the base class
  return new RuntimeUtilities();
}