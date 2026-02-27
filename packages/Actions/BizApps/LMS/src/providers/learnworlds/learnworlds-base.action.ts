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
   * Concurrency limit for parallel API calls to avoid overwhelming the API.
   */
  protected static readonly CONCURRENCY_LIMIT = 5;

  /**
   * Allowed user roles in LearnWorlds.
   */
  protected static readonly ALLOWED_ROLES: readonly string[] = ['student', 'observer', 'instructor'] as const;

  /**
   * Maximum number of items per page supported by the LearnWorlds API
   */
  protected static readonly LW_MAX_PAGE_SIZE = 100;

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

    this.validateSchoolDomain(schoolDomain);

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
    const limit = (queryParams.limit as number) || LearnWorldsBaseAction.LW_MAX_PAGE_SIZE;

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
   * Safely parses a date string to ISO format.
   * Returns undefined if the input is falsy or produces an invalid date.
   */
  protected safeParseDateToISO(dateString: string | undefined): string | undefined {
    if (!dateString) return undefined;
    const parsed = new Date(dateString);
    if (isNaN(parsed.getTime())) {
      console.warn(`Invalid date string "${dateString}" — skipping date filter`);
      return undefined;
    }
    return parsed.toISOString();
  }

  // ----------------------------------------------------------------
  // Validation helpers
  // ----------------------------------------------------------------

  /**
   * Validates that a value is safe to use as a URL path segment.
   * Rejects values containing path traversal or URL manipulation characters.
   */
  protected validatePathSegment(value: string, paramName: string): string {
    if (value.length === 0) {
      throw new Error(`${paramName} must not be empty`);
    }
    if (/[\/\\?#@%]|\.\./.test(value)) {
      throw new Error(`Invalid ${paramName}: contains forbidden characters`);
    }
    return value;
  }

  /**
   * Validates that a school domain is safe to use in URL construction.
   * Must look like a hostname (alphanumeric + hyphens + dots).
   */
  private validateSchoolDomain(domain: string): string {
    if (/[\/\\?#@\s]/.test(domain)) {
      throw new Error('Invalid school domain: contains URL-unsafe characters');
    }
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(domain)) {
      throw new Error('Invalid school domain format');
    }
    return domain;
  }

  /**
   * Validates that a role is in the allowed set.
   */
  protected validateRole(role: string): string {
    const normalizedRole = role.toLowerCase();
    if (!LearnWorldsBaseAction.ALLOWED_ROLES.includes(normalizedRole)) {
      throw new Error(`Invalid role '${role}'. Allowed roles: ${LearnWorldsBaseAction.ALLOWED_ROLES.join(', ')}`);
    }
    return normalizedRole;
  }

  /**
   * Validates that a string is a plausible email address.
   */
  protected validateEmail(email: string, paramName: string = 'Email'): string {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid ${paramName} format: '${email}'`);
    }
    return email;
  }

  /**
   * Validates that a redirect URL is either a relative path or an absolute URL
   * that belongs to the LearnWorlds school domain and uses http(s).
   */
  protected validateRedirectTo(redirectTo: string, schoolDomain?: string): string {
    // Allow relative paths
    if (redirectTo.startsWith('/')) {
      return redirectTo;
    }
    // If absolute URL, parse and check against school domain
    let url: URL;
    try {
      url = new URL(redirectTo);
    } catch {
      throw new Error('RedirectTo is not a valid URL or relative path');
    }
    // Block dangerous protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('RedirectTo must use http or https protocol');
    }
    if (schoolDomain && !url.hostname.endsWith('.learnworlds.com') && url.hostname !== schoolDomain) {
      throw new Error('RedirectTo must be a relative path or a LearnWorlds domain URL');
    }
    return redirectTo;
  }

  // ----------------------------------------------------------------
  // Batch concurrency helper
  // ----------------------------------------------------------------

  /**
   * Processes items in batches with controlled concurrency.
   * Prevents unbounded parallel API calls from overwhelming the target API.
   */
  protected async processInBatches<TItem, TResult>(
    items: TItem[],
    processFn: (item: TItem) => Promise<TResult>,
    batchSize: number = LearnWorldsBaseAction.CONCURRENCY_LIMIT,
  ): Promise<TResult[]> {
    const results: TResult[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processFn));
      results.push(...batchResults);
    }
    return results;
  }

  // ----------------------------------------------------------------
  // Parameter extraction helpers
  // ----------------------------------------------------------------

  /**
   * Gets a required string parameter, throwing if missing or empty.
   */
  protected getRequiredStringParam(params: ActionParam[], name: string): string {
    const value = this.getParamValue(params, name);
    if (typeof value !== 'string' || !value) {
      throw new Error(`Required string parameter '${name}' is missing or invalid`);
    }
    return value;
  }

  /**
   * Gets an optional string parameter.
   */
  protected getOptionalStringParam(params: ActionParam[], name: string): string | undefined {
    const value = this.getParamValue(params, name);
    if (value === undefined || value === null) return undefined;
    return typeof value === 'string' ? value : String(value);
  }

  /**
   * Gets an optional boolean parameter with a default value.
   * When defaultValue is undefined, returns undefined if the parameter is missing.
   */
  protected getOptionalBooleanParam(params: ActionParam[], name: string, defaultValue: boolean): boolean;
  protected getOptionalBooleanParam(params: ActionParam[], name: string, defaultValue: boolean | undefined): boolean | undefined;
  protected getOptionalBooleanParam(params: ActionParam[], name: string, defaultValue: boolean | undefined): boolean | undefined {
    const value = this.getParamValue(params, name);
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    const strVal = String(value).toLowerCase();
    if (strVal === 'true' || strVal === '1') return true;
    if (strVal === 'false' || strVal === '0') return false;
    return defaultValue;
  }

  /**
   * Gets an optional number parameter with a default value.
   * When defaultValue is undefined, returns undefined if the parameter is missing.
   */
  protected getOptionalNumberParam(params: ActionParam[], name: string, defaultValue: number): number;
  protected getOptionalNumberParam(params: ActionParam[], name: string, defaultValue: number | undefined): number | undefined;
  protected getOptionalNumberParam(params: ActionParam[], name: string, defaultValue: number | undefined): number | undefined {
    const value = this.getParamValue(params, name);
    if (value === undefined || value === null) return defaultValue;
    const parsed = Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Gets an optional string array parameter.
   */
  protected getOptionalStringArrayParam(params: ActionParam[], name: string): string[] | undefined {
    const value = this.getParamValue(params, name);
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) return value.map(String);
    return undefined;
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
