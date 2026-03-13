import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { GetBundlesParams, GetBundlesResult, LearnWorldsBundle } from '../interfaces';

/**
 * Raw bundle shape returned by the LearnWorlds API
 */
interface LWApiBundle {
  id?: string;
  _id?: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  courses?: string[];
  is_active?: boolean;
  created?: string | number;
  created_at?: string;
  updated?: string | number;
  updated_at?: string;
  thumbnail_url?: string;
  image?: string;
  total_courses?: number;
  total_enrollments?: number;
  students_count?: number;
}

/**
 * Action to retrieve bundles from LearnWorlds
 */
@RegisterClass(BaseAction, 'GetBundlesAction')
export class GetBundlesAction extends LearnWorldsBaseAction {
  /**
   * Retrieves bundles from LearnWorlds with optional search filtering.
   */
  public async GetBundles(params: GetBundlesParams, contextUser: UserInfo): Promise<GetBundlesResult> {
    this.SetCompanyContext(params.CompanyID);

    const queryParams = this.buildBundleQueryParams(params);
    const rawBundles = await this.makeLearnWorldsPaginatedRequest<LWApiBundle>('bundles', queryParams, contextUser);

    const bundles = rawBundles.map((b) => this.mapApiBundle(b));

    return {
      Bundles: bundles,
      TotalCount: bundles.length,
    };
  }

  /**
   * Builds query parameters for the bundles API request
   */
  private buildBundleQueryParams(params: GetBundlesParams): Record<string, string | number | boolean> {
    const queryParams: Record<string, string | number | boolean> = {};

    if (params.SearchText) {
      queryParams.search = params.SearchText;
    }

    if (params.MaxResults) {
      queryParams.limit = Math.min(params.MaxResults, 100);
    }

    return queryParams;
  }

  /**
   * Maps a raw LearnWorlds API bundle to the standard LearnWorldsBundle interface
   */
  private mapApiBundle(raw: LWApiBundle): LearnWorldsBundle {
    const createdRaw = raw.created || raw.created_at || '';
    const updatedRaw = raw.updated || raw.updated_at || '';

    return {
      id: raw.id || raw._id || '',
      title: raw.title || '',
      description: raw.description,
      price: raw.price,
      currency: raw.currency,
      courses: raw.courses || [],
      isActive: raw.is_active !== false,
      createdAt: createdRaw ? this.parseLearnWorldsDate(createdRaw).toISOString() : '',
      updatedAt: updatedRaw ? this.parseLearnWorldsDate(updatedRaw).toISOString() : '',
      thumbnailUrl: raw.thumbnail_url || raw.image,
      totalCourses: raw.total_courses || (raw.courses ? raw.courses.length : 0),
      totalEnrollments: raw.total_enrollments || raw.students_count || 0,
    };
  }

  /**
   * Framework entry point that delegates to the typed public method
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const bundleParams: GetBundlesParams = {
        CompanyID: this.getRequiredStringParam(Params, 'CompanyID'),
        SearchText: this.getOptionalStringParam(Params, 'SearchText'),
        MaxResults: this.getOptionalNumberParam(Params, 'MaxResults', LearnWorldsBaseAction.LW_MAX_PAGE_SIZE),
      };

      const result = await this.GetBundles(bundleParams, ContextUser);

      this.setOutputParam(Params, 'Bundles', result.Bundles);
      this.setOutputParam(Params, 'TotalCount', result.TotalCount);

      return this.buildSuccessResult(`Successfully retrieved ${result.TotalCount} bundle(s) from LearnWorlds`, Params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', `Error retrieving bundles: ${errorMessage}`, Params);
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'SearchText', Type: 'Input', Value: null },
      { Name: 'MaxResults', Type: 'Input', Value: null },
      { Name: 'Bundles', Type: 'Output', Value: null },
      { Name: 'TotalCount', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Retrieves course bundles from LearnWorlds with optional search filtering';
  }
}
