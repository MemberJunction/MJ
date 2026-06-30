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
  SimpleRunQuery,
  SimpleRunView,
  SimpleExecutePromptParams,
  SimpleExecutePromptResult,
  SimpleEmbedTextParams,
  SimpleEmbedTextResult
} from '@memberjunction/interactive-component-types';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
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
   * Builds the complete utilities object for React components
   * This is the main method that components will use
   */
  public buildUtilities(debug: boolean = false): ComponentUtilities {
    this.debug = debug;
    const md = new Metadata();  // global-provider-ok: utility — single-provider context
    return this.SetupUtilities(md);
  }

  /**
   * Sets up the utilities object - copied from skip-chat implementation
   */
  private SetupUtilities(md: Metadata): ComponentUtilities {
    const rv = new RunView();
    const rq = new RunQuery();
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
      ): Promise<SimpleMLScoreResult> => this.scoreMLRecords(graphQLProvider, modelId, records, options)
    };
  }

  /**
   * Loads the trained-model catalog from `MJ: ML Models`, newest version first, mapping each row
   * to a {@link SimpleMLModelInfo}. Resilient — logs and returns `[]` on any failure.
   */
  private async listMLModels(filter?: SimpleMLListModelsFilter, contextUser?: UserInfo): Promise<SimpleMLModelInfo[]> {
    try {
      const rv = new RunView();
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

  private CreateSimpleMetadata(md: Metadata): SimpleMetadata {
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