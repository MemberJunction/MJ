import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import type { YMApiResponse } from '../types/ym-api-types';

/**
 * YM API base URL
 */
const YM_API_BASE = 'https://ws.yourmembership.com';

/**
 * Base class for all YourMembership actions.
 * Provides HTTP client, authentication, pagination, and parameter extraction.
 *
 * Follows the same pattern as LearnWorldsBaseAction:
 * - Auth via env vars or action params
 * - Paginated and single-page request methods
 * - Standard param helpers and output param setters
 */
@RegisterClass(BaseAction, 'BaseYMAction')
export abstract class BaseYMAction extends BaseAction {
    /**
     * Current action parameters (set in InternalRunAction before use).
     */
    protected params: ActionParam[] = [];

    // ── HTTP Client Methods ──────────────────────────────────────────────

    /**
     * Makes an authenticated request to the YM API.
     *
     * @param endpoint - Path after /Ams/{ClientID}/ (e.g., "MemberList")
     * @param clientId - YM client/site identifier
     * @param apiKey - YM API key (used as Basic Auth username:password)
     * @param method - HTTP method (default GET)
     * @param body - Optional request body for POST/PUT
     */
    protected async MakeYMRequest<T>(
        endpoint: string,
        clientId: string,
        apiKey: string,
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
        body?: Record<string, unknown>
    ): Promise<YMApiResponse<T>> {
        const url = `${YM_API_BASE}/Ams/${clientId}/${endpoint}.json`;
        const authToken = Buffer.from(`${apiKey}:${apiKey}`).toString('base64');

        const headers: Record<string, string> = {
            'Authorization': `Basic ${authToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };

        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `YM API error: ${response.status} ${response.statusText}`;

            try {
                const errorJson = JSON.parse(errorText) as { ResponseStatus?: { Message?: string } };
                if (errorJson.ResponseStatus?.Message) {
                    errorMessage = `YM API error: ${errorJson.ResponseStatus.Message}`;
                }
            } catch {
                errorMessage += ` - ${errorText}`;
            }

            throw new Error(errorMessage);
        }

        const result = await response.json() as YMApiResponse<T>;

        if (result.ResponseStatus?.ErrorCode) {
            throw new Error(`YM API error: ${result.ResponseStatus.Message ?? result.ResponseStatus.ErrorCode}`);
        }

        return result;
    }

    /**
     * Makes a paginated request to the YM API, accumulating all pages.
     * YM uses MaxRows + Offset for pagination.
     *
     * @param endpoint - Path after /Ams/{ClientID}/
     * @param clientId - YM client/site identifier
     * @param apiKey - YM API key
     * @param pageSize - Records per page (default 200)
     * @param maxResults - Maximum total records (0 = unlimited)
     * @returns All accumulated records
     */
    protected async MakeYMPaginatedRequest<T>(
        endpoint: string,
        clientId: string,
        apiKey: string,
        pageSize: number = 200,
        maxResults: number = 0
    ): Promise<T[]> {
        const results: T[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const paginatedEndpoint = `${endpoint}?MaxRows=${pageSize}&Offset=${offset}`;
            const response = await this.MakeYMRequest<T[]>(paginatedEndpoint, clientId, apiKey);

            const page = response.Result;
            if (!page || !Array.isArray(page) || page.length === 0) {
                hasMore = false;
                break;
            }

            results.push(...page);

            // Stop if we got fewer records than requested (last page)
            if (page.length < pageSize) {
                hasMore = false;
            } else {
                offset += pageSize;
            }

            // Respect max results limit
            if (maxResults > 0 && results.length >= maxResults) {
                return results.slice(0, maxResults);
            }
        }

        return results;
    }

    // ── Credential Helpers ───────────────────────────────────────────────

    /**
     * Resolves the API key from env vars or action params.
     * Env var pattern: BIZAPPS_YM_{CLIENT_ID}_API_KEY
     */
    protected GetAPIKey(params: ActionParam[], clientId: string): string {
        // Try environment variable first
        const envKey = this.GetCredentialFromEnv(clientId, 'API_KEY');
        if (envKey) {
            return envKey;
        }

        // Fall back to action parameter
        const paramKey = this.GetParamValue(params, 'APIKey');
        if (paramKey) {
            return paramKey;
        }

        throw new Error(
            `API key not found. Set environment variable BIZAPPS_YM_${clientId}_API_KEY or provide APIKey parameter.`
        );
    }

    /**
     * Gets the Client ID from action params.
     */
    protected GetClientID(params: ActionParam[]): string {
        const clientId = this.GetParamValue(params, 'ClientID');
        if (!clientId) {
            throw new Error('ClientID parameter is required');
        }
        return clientId;
    }

    /**
     * Gets a credential from environment variables.
     * Format: BIZAPPS_YM_{CLIENT_ID}_{CREDENTIAL_TYPE}
     */
    protected GetCredentialFromEnv(clientId: string, credentialType: string): string | undefined {
        const envKey = `BIZAPPS_YM_${clientId}_${credentialType.toUpperCase()}`;
        return process.env[envKey];
    }

    // ── Parameter Helpers ────────────────────────────────────────────────

    /**
     * Gets a parameter value by name (case-insensitive).
     */
    protected GetParamValue(params: ActionParam[], name: string): string | undefined {
        const param = params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return undefined;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    /**
     * Gets a string parameter with a default value.
     */
    protected GetStringParam(params: ActionParam[], name: string, defaultValue: string = ''): string {
        return this.GetParamValue(params, name) ?? defaultValue;
    }

    /**
     * Gets a numeric parameter with a default value.
     */
    protected GetNumericParam(params: ActionParam[], name: string, defaultValue: number): number {
        const value = this.GetParamValue(params, name);
        if (value === undefined) {
            return defaultValue;
        }
        const parsed = Number(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Gets a boolean parameter with a default value.
     */
    protected GetBooleanParam(params: ActionParam[], name: string, defaultValue: boolean): boolean {
        const value = this.GetParamValue(params, name);
        if (value === undefined) {
            return defaultValue;
        }
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
        return defaultValue;
    }

    // ── Output Param Helper ──────────────────────────────────────────────

    /**
     * Sets an output parameter (creates or updates).
     * Matches the LearnWorlds check-then-create pattern.
     */
    protected SetOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find(p => p.Name === name);
        if (existing) {
            existing.Value = value;
        } else {
            params.Params.push({ Name: name, Type: 'Output', Value: value });
        }
    }

    // ── Result Builders ──────────────────────────────────────────────────

    /**
     * Builds a failure result.
     */
    protected BuildErrorResult(message: string, resultCode: string = 'ERROR'): ActionResultSimple {
        return { Success: false, ResultCode: resultCode, Message: message };
    }

    /**
     * Builds a success result.
     */
    protected BuildSuccessResult(message: string): ActionResultSimple {
        return { Success: true, ResultCode: 'SUCCESS', Message: message };
    }
}
