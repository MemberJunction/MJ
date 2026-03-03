import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { LogError, LogStatus } from '@memberjunction/core';
import type { YMApiResponse } from '../types/ym-api-types';

/** YourMembership REST API base URL */
const YM_API_BASE = 'https://ws.yourmembership.com';

/** Cached session data */
interface YMSession {
    SessionId: string;
    ClientId: string;
    CreatedAt: number;
}

/** Sessions expire after 14 minutes (YM sessions typically last 15 min) */
const SESSION_TTL_MS = 14 * 60 * 1000;

/**
 * Abstract base class for all YourMembership actions.
 *
 * Provides session-based authentication, HTTP client methods, credential resolution,
 * pagination support, and shared parameter extraction helpers.
 *
 * Auth flow:
 *   1. POST /Ams/Authenticate with UserName + Password + ClientID + UserType=Admin
 *   2. Receive SessionId
 *   3. Pass SessionId as X-SS-ID header on all data requests
 */
export abstract class BaseYMAction extends BaseAction {

    /** Session cache keyed by clientId */
    private static sessionCache = new Map<string, YMSession>();

    // ─── Session management ──────────────────────────────────────

    /**
     * Obtains or reuses a YM session for the given credentials.
     */
    protected async GetSession(
        clientId: string,
        apiKey: string,
        apiPassword: string
    ): Promise<string> {
        const cached = BaseYMAction.sessionCache.get(clientId);
        if (cached && (Date.now() - cached.CreatedAt) < SESSION_TTL_MS) {
            return cached.SessionId;
        }

        return this.createSession(clientId, apiKey, apiPassword);
    }

    private async createSession(
        clientId: string,
        apiKey: string,
        apiPassword: string
    ): Promise<string> {
        LogStatus(`YM Auth: Creating session for client ${clientId}`);

        const response = await fetch(`${YM_API_BASE}/Ams/Authenticate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                provider: 'credentials',
                UserName: apiKey,
                Password: apiPassword,
                UserType: 'Admin',
                ClientID: Number(clientId),
            }),
        });

        if (!response.ok) {
            throw new Error(`YM Auth failed: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as {
            SessionId?: string;
            ResponseStatus?: { ErrorCode?: string; Message?: string };
        };

        if (json.ResponseStatus?.ErrorCode) {
            throw new Error(
                `YM Auth error: ${json.ResponseStatus.Message ?? json.ResponseStatus.ErrorCode}`
            );
        }

        if (!json.SessionId) {
            throw new Error('YM Auth: No SessionId returned');
        }

        BaseYMAction.sessionCache.set(clientId, {
            SessionId: json.SessionId,
            ClientId: clientId,
            CreatedAt: Date.now(),
        });

        LogStatus(`YM Auth: Session created for client ${clientId}`);
        return json.SessionId;
    }

    /**
     * Invalidates the cached session so the next request re-authenticates.
     */
    protected InvalidateSession(clientId: string): void {
        BaseYMAction.sessionCache.delete(clientId);
    }

    // ─── HTTP helpers ────────────────────────────────────────────

    /**
     * Makes a single YM API request using session auth.
     * Returns the raw response object — callers extract data from named keys.
     */
    protected async MakeYMRequest(
        endpoint: string,
        clientId: string,
        apiKey: string,
        apiPassword: string,
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
        body?: Record<string, unknown>
    ): Promise<YMApiResponse> {
        const sessionId = await this.GetSession(clientId, apiKey, apiPassword);
        const url = `${YM_API_BASE}/Ams/${clientId}/${endpoint}`;

        const options: RequestInit = {
            method,
            headers: {
                'X-SS-ID': sessionId,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        // If we get 401, session may have expired — retry once with fresh session
        if (response.status === 401) {
            return this.retryWithNewSession(endpoint, clientId, apiKey, apiPassword, method, body);
        }

        if (!response.ok) {
            throw new Error(`YM API error for ${endpoint}: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as YMApiResponse;
        if (json.ResponseStatus?.ErrorCode) {
            throw new Error(
                `YM API error for ${endpoint}: ${json.ResponseStatus.Message ?? json.ResponseStatus.ErrorCode}`
            );
        }
        return json;
    }

    private async retryWithNewSession(
        endpoint: string,
        clientId: string,
        apiKey: string,
        apiPassword: string,
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        body?: Record<string, unknown>
    ): Promise<YMApiResponse> {
        LogStatus(`YM Auth: Session expired for ${clientId}, re-authenticating...`);
        this.InvalidateSession(clientId);
        const newSessionId = await this.GetSession(clientId, apiKey, apiPassword);
        const url = `${YM_API_BASE}/Ams/${clientId}/${endpoint}`;

        const options: RequestInit = {
            method,
            headers: {
                'X-SS-ID': newSessionId,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`YM API error for ${endpoint}: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as YMApiResponse;
        if (json.ResponseStatus?.ErrorCode) {
            throw new Error(
                `YM API error for ${endpoint}: ${json.ResponseStatus.Message ?? json.ResponseStatus.ErrorCode}`
            );
        }
        return json;
    }

    /**
     * Makes paginated requests and accumulates all pages into a single array.
     */
    /**
     * Makes paginated requests using PageSize/PageNumber and accumulates all pages.
     * @param responseDataKey The JSON key in the response that holds the data array
     */
    protected async MakeYMPaginatedRequest<T>(
        endpoint: string,
        clientId: string,
        apiKey: string,
        apiPassword: string,
        responseDataKey: string,
        pageSize: number = 200,
        maxResults: number = 0
    ): Promise<T[]> {
        const results: T[] = [];
        let pageNumber = 1;
        let hasMore = true;
        let sessionId = await this.GetSession(clientId, apiKey, apiPassword);

        const baseUrl = `${YM_API_BASE}/Ams/${clientId}`;

        while (hasMore) {
            const url = `${baseUrl}/${endpoint}?PageSize=${pageSize}&PageNumber=${pageNumber}`;
            let response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-SS-ID': sessionId,
                    'Accept': 'application/json',
                },
            });

            // Retry on 401 with fresh session
            if (response.status === 401) {
                this.InvalidateSession(clientId);
                sessionId = await this.GetSession(clientId, apiKey, apiPassword);
                response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'X-SS-ID': sessionId,
                        'Accept': 'application/json',
                    },
                });
            }

            if (!response.ok) {
                throw new Error(`YM API error for ${endpoint}: ${response.status} ${response.statusText}`);
            }

            const json = await response.json() as Record<string, unknown>;
            const rs = json.ResponseStatus as { ErrorCode?: string; Message?: string } | undefined;
            if (rs?.ErrorCode) {
                throw new Error(
                    `YM API error for ${endpoint}: ${rs.Message ?? rs.ErrorCode}`
                );
            }

            const page = json[responseDataKey];
            if (!page || !Array.isArray(page) || page.length === 0) {
                hasMore = false;
                break;
            }

            results.push(...(page as T[]));

            if (page.length < pageSize) {
                hasMore = false;
            } else {
                pageNumber++;
            }

            if (maxResults > 0 && results.length >= maxResults) {
                return results.slice(0, maxResults);
            }
        }

        return results;
    }

    // ─── Credential resolution ───────────────────────────────────

    /**
     * Resolves the YM Client ID from action parameters.
     */
    protected GetClientID(params: ActionParam[]): string {
        const clientId = this.GetParamValue(params, 'ClientID');
        if (!clientId) {
            throw new Error('ClientID parameter is required');
        }
        return clientId;
    }

    /**
     * Resolves the API key (software license key) from env vars or action parameters.
     * Env var pattern: BIZAPPS_YM_{ClientID}_API_KEY
     */
    protected GetAPIKey(params: ActionParam[], clientId: string): string {
        const envKey = this.getCredentialFromEnv(clientId, 'API_KEY');
        if (envKey) return envKey;

        const paramKey = this.GetParamValue(params, 'APIKey');
        if (paramKey) return paramKey;

        throw new Error(
            `API key not found. Set environment variable BIZAPPS_YM_${clientId}_API_KEY or provide APIKey parameter.`
        );
    }

    /**
     * Resolves the API password from env vars or action parameters.
     * Env var pattern: BIZAPPS_YM_{ClientID}_API_PASSWORD
     */
    protected GetAPIPassword(params: ActionParam[], clientId: string): string {
        const envPassword = this.getCredentialFromEnv(clientId, 'API_PASSWORD');
        if (envPassword) return envPassword;

        const paramPassword = this.GetParamValue(params, 'APIPassword');
        if (paramPassword) return paramPassword;

        throw new Error(
            `API password not found. Set environment variable BIZAPPS_YM_${clientId}_API_PASSWORD or provide APIPassword parameter.`
        );
    }

    private getCredentialFromEnv(clientId: string, suffix: string): string | undefined {
        const envVar = `BIZAPPS_YM_${clientId}_${suffix}`;
        const value = process.env[envVar];
        return value && value.trim().length > 0 ? value.trim() : undefined;
    }

    // ─── Parameter extraction helpers ────────────────────────────

    protected GetParamValue(params: ActionParam[], name: string): string | undefined {
        const param = params.find(p => p.Name?.toLowerCase() === name.toLowerCase());
        return param?.Value != null ? String(param.Value) : undefined;
    }

    protected GetNumericParam(params: ActionParam[], name: string, defaultValue: number): number {
        const value = this.GetParamValue(params, name);
        if (value == null) return defaultValue;
        const parsed = Number(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    protected GetBooleanParam(params: ActionParam[], name: string, defaultValue: boolean): boolean {
        const value = this.GetParamValue(params, name);
        if (value == null) return defaultValue;
        return value.toLowerCase() === 'true' || value === '1';
    }

    // ─── Output / result helpers ─────────────────────────────────

    protected SetOutputParam(params: RunActionParams, name: string, value: unknown): void {
        if (!params.Params) return;
        const existing = params.Params.find(p => p.Name?.toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.Value = value as string;
        } else {
            params.Params.push({ Name: name, Value: value as string, Type: 'Output' });
        }
    }

    protected BuildSuccessResult(message: string): ActionResultSimple {
        return { Success: true, Message: message, ResultCode: 'SUCCESS' };
    }

    protected BuildErrorResult(message: string, resultCode: string): ActionResultSimple {
        LogError(`YM Action Error: ${message}`);
        return { Success: false, Message: message, ResultCode: resultCode };
    }
}
