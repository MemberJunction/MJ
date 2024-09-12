import { BaseEngine, Metadata, UserInfo, LogError } from '@memberjunction/core';
import { RecommendationEntity, RecommendationProviderEntity, RecommendationRunEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { RecommendationProviderBase } from './ProviderBase';

/**
 * Used to make requests to providers
 */
export class RecommendationRequest {
  /**
   * The ID of the RecommendationRun record that will be created by the caller of a given provider. This must be created before a provider is called.
   * This is done automatically by the Recommendation Engine and can be populated manually if for some reason you want to call a provider directly outside
   * of the engine. This is a required field.
   */
  RunID: string;

  /**
   * Array of the requested recommendations. When preparing a batch of recommendations to request, do NOT set the RecommendationRunID or attempt
   * to save the Recommendation records. This will be done as the batch is processed. You cannot save a Recommendation record until a Run is created
   * which is done by the RecommendationEngineBase.Recommend() method.
   */
  Recommendations: RecommendationEntity[] = [];

  /**
   * The specific provider to use for the request. Leave this undefined if you want to use the default provider.
   */
  Provider?: RecommendationProviderEntity;
}

/**
 * This response is generated for each Recommend() request
 */
export class RecommendationResult {
  Success: boolean;
  Request: RecommendationRequest;
  ErrorMessage: string;

  constructor(request: RecommendationRequest) {
    this.Request = request;
  }
}

/**
 * Engine class to be used for running all recommendation requests
 */
export class RecommendationEngineBase extends BaseEngine<RecommendationEngineBase> {
  private _RecommendationProviders: RecommendationProviderEntity[] = [];

  public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
    const params = [
      {
        PropertyName: '_RecommendationProviders',
        EntityName: 'Recommendation Providers',
      },
    ];
    return await this.Load(params, forceRefresh, contextUser);
  }

  /**
   * Call this method with a provider and a request and a result will be generated
   * @param request - The Recommendations to request, and an optional provider
   */
  public async Recommend(request: RecommendationRequest): Promise<RecommendationRunEntity> {
    const provider = request.Provider ?? this._RecommendationProviders[0];

    if (!provider) {
      throw new Error('No recommendation provider available');
    }

    // get the driver
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<RecommendationProviderBase>(RecommendationProviderBase, provider.Name);

    // make sure we have only one run
    const runIDs = [...new Set(request.Recommendations.map((r) => r.RecommendationRunID))];
    if (runIDs.length > 1) {
      const message = 'All Recommendations must use the same RecommendationRunID';
      LogError(message, null, { runIDs });
      throw new Error(message);
    }
    const [runID] = runIDs;

    // load the run
    const run = await new Metadata().GetEntityObject<RecommendationRunEntity>('Recommendation Runs');
    if (!(await run.Load(runID))) {
      throw new Error(`Error loading RecommendationRun with ID: ${runID}`);
    }

    // update status for current run
    run.Status = 'In Progress';
    if (!(await run.Save())) {
      throw new Error(`Error saving In Progress RecommendationRun with ID: ${runID}`);
    }

    request.RunID = run.ID;

    const result = await driver.Recommend(request);

    // finalize status for current run
    if (result.Success) {
      run.Status = 'Completed';
      if (!(await run.Save())) {
        throw new Error(`Error saving Completed RecommendationRun with ID: ${runID}`);
      }
    } else {
      run.Status = 'Error';
      run.Description = result.ErrorMessage;
      if (!(await run.Save())) {
        throw new Error(`Error saving Errored RecommendationRun with ID: ${runID}`);
      }
    }

    return run;
  }
}
