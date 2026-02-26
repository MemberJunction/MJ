import { RegisterClass } from '@memberjunction/global';
import { BaseLMSAction } from '../../base/base-lms.action';
import { UserInfo } from '@memberjunction/core';
import { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { BaseAction } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';
import { LWApiEnrollmentStatus, LWApiProgressData, LWApiUser, LearnWorldsUser, LearnWorldsPaginatedResponse } from './interfaces';

/**
 * Base class for all LearnWorlds LMS actions.
 * Handles LearnWorlds-specific authentication and API interaction patterns.
 */
@RegisterClass(BaseAction, 'LearnWorldsBaseAction')
export abstract class LearnWorldsBaseAction extends BaseLMSAction {
  protected lmsProvider = 'LearnWorlds';
  protected integrationName = 'LearnWorlds';

  /**
   * LearnWorlds API version
   */
  protected apiVersion = 'v2';

  /**
   * Current action parameters (set by the framework or by SetCompanyContext)
   */
  protected params: ActionParam[] = [];

  /**
   * Tracks the number of actual HTTP requests made since last reset.
   * Useful for callers that need accurate API call counts (e.g., bulk data).
   */
  protected apiCallCount = 0;

  /**
   * Public accessor for the running API call count.
   */
  public get ApiCallCount(): number {
    return this.apiCallCount;
  }

  /**
   * Set the company context for direct (non-framework) calls.
   * This populates `this.params` so that `makeLearnWorldsRequest` can find the CompanyID.
   */
  public SetCompanyContext(companyId: string): void {
    this.params = [{ Name: 'CompanyID', Type: 'Input', Value: companyId }];
  }

  /**
   * Makes an authenticated request to LearnWorlds API.
   * The body parameter accepts any object that will be JSON-serialized.
   */
  protected async makeLearnWorldsRequest<T = Record<string, unknown>>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: object | null,
    contextUser?: UserInfo,
  ): Promise<T> {
    if (!contextUser) {
      throw new Error('Context user is required for LearnWorlds API calls');
    }

    const { fullUrl, headers } = await this.buildRequestConfig(contextUser);
    const requestUrl = `${fullUrl}/${endpoint}`;

    try {
      this.apiCallCount++;
      const response = await fetch(requestUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(await this.buildErrorMessage(response));
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`LearnWorlds API request failed: ${error}`);
    }
  }

  /**
   * Resolves integration credentials and builds the base URL and headers.
   */
  private async buildRequestConfig(contextUser: UserInfo): Promise<{ fullUrl: string; headers: Record<string, string> }> {
    const companyId = this.getParamValue(this.params, 'CompanyID') as string | undefined;
    if (!companyId) {
      throw new Error('CompanyID parameter is required');
    }

    const integration = await this.getCompanyIntegration(companyId, contextUser);
    const credentials = await this.getAPICredentials(integration);

    if (!credentials.apiKey) {
      throw new Error('API Key is required for LearnWorlds integration');
    }

    const schoolDomain = integration.ExternalSystemID || this.getCredentialFromEnv(companyId, 'SCHOOL_DOMAIN');
    if (!schoolDomain) {
      throw new Error('School domain not found. Set in CompanyIntegration.ExternalSystemID or environment variable');
    }

    return {
      fullUrl: `https://${schoolDomain}/api/${this.apiVersion}`,
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Lw-Client': 'MemberJunction',
      },
    };
  }

  /**
   * Parses error details from a non-OK API response.
   */
  private async buildErrorMessage(response: Response): Promise<string> {
    const errorText = await response.text();
    let errorMessage = `LearnWorlds API error: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText) as { error?: { message?: string }; message?: string };
      if (errorJson.error) {
        errorMessage = `LearnWorlds API error: ${errorJson.error.message || String(errorJson.error)}`;
      } else if (errorJson.message) {
        errorMessage = `LearnWorlds API error: ${errorJson.message}`;
      }
    } catch {
      errorMessage += ` - ${errorText}`;
    }

    return errorMessage;
  }

  /**
   * Makes a paginated request to LearnWorlds API
   */
  protected async makeLearnWorldsPaginatedRequest<T = Record<string, unknown>>(
    endpoint: string,
    queryParams: Record<string, string | number | boolean> = {},
    contextUser?: UserInfo,
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    let hasMore = true;
    const limit = (queryParams.limit as number) || 50;

    while (hasMore) {
      const paginatedParams: Record<string, string> = {};
      for (const [key, val] of Object.entries(queryParams)) {
        paginatedParams[key] = String(val);
      }
      paginatedParams.page = page.toString();
      paginatedParams.limit = limit.toString();

      const qs = new URLSearchParams(paginatedParams);

      const response = await this.makeLearnWorldsRequest<LearnWorldsPaginatedResponse<T>>(`${endpoint}?${qs}`, 'GET', undefined, contextUser);

      if (response.data && Array.isArray(response.data)) {
        results.push(...response.data);
      }

      // Check if there are more pages
      if (response.meta && response.meta.page < response.meta.totalPages) {
        page++;
      } else {
        hasMore = false;
      }

      // Respect max results if specified
      const maxResults = this.getParamValue(this.params, 'MaxResults') as number | undefined;
      if (maxResults && results.length >= maxResults) {
        return results.slice(0, maxResults);
      }
    }

    return results;
  }

  /**
   * Convert LearnWorlds date format to Date object
   */
  protected parseLearnWorldsDate(dateString: string | number): Date {
    // LearnWorlds sometimes returns timestamps as seconds since epoch
    if (typeof dateString === 'number') {
      return new Date(dateString * 1000);
    }
    return new Date(dateString);
  }

  /**
   * Format date for LearnWorlds API (ISO 8601)
   */
  protected formatLearnWorldsDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Map LearnWorlds user status to standard status
   */
  protected mapUserStatus(status: string): 'active' | 'inactive' | 'suspended' {
    const statusMap: Record<string, 'active' | 'inactive' | 'suspended'> = {
      active: 'active',
      inactive: 'inactive',
      suspended: 'suspended',
      blocked: 'suspended',
    };

    return statusMap[status.toLowerCase()] || 'inactive';
  }

  /**
   * Map LearnWorlds enrollment status
   */
  protected mapLearnWorldsEnrollmentStatus(enrollment: LWApiEnrollmentStatus): 'active' | 'completed' | 'expired' | 'suspended' {
    if (enrollment.completed) {
      return 'completed';
    }
    if (enrollment.expired) {
      return 'expired';
    }
    if (enrollment.suspended || !enrollment.active) {
      return 'suspended';
    }
    return 'active';
  }

  /**
   * Calculate progress from LearnWorlds data
   */
  protected calculateProgress(progressData: LWApiProgressData): {
    percentage: number;
    completedUnits: number;
    totalUnits: number;
    timeSpent: number;
  } {
    return {
      percentage: progressData.percentage || 0,
      completedUnits: progressData.completed_units || 0,
      totalUnits: progressData.total_units || 0,
      timeSpent: progressData.time_spent || 0,
    };
  }

  /**
   * Shared utility: find a LearnWorlds user by email.
   * Returns the user if found, null if not found (empty results).
   * Re-throws errors for network failures, auth errors, rate limiting, etc.
   */
  public async FindUserByEmail(email: string, contextUser: UserInfo): Promise<LearnWorldsUser | null> {
    const response = await this.makeLearnWorldsPaginatedRequest<LWApiUser>('users', { search: email, limit: 5 }, contextUser);

    const match = response.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!match) return null;

    return this.mapLWApiUserToLearnWorldsUser(match);
  }

  /**
   * Maps a raw LW API user to the normalized LearnWorldsUser shape.
   */
  private mapLWApiUserToLearnWorldsUser(user: LWApiUser): LearnWorldsUser {
    return {
      id: user.id || user._id || '',
      email: user.email,
      username: user.username || user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      status: this.mapUserStatus(user.status || 'active'),
      role: user.role || 'student',
      createdAt: this.parseLearnWorldsDate(user.created || user.created_at || ''),
      lastLoginAt: user.last_login ? this.parseLearnWorldsDate(user.last_login) : undefined,
      tags: user.tags || [],
      customFields: user.custom_fields || {},
    };
  }
}
