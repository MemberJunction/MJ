/**
 * @fileoverview Shared base class for MemberJunction GitHub Actions.
 *
 * Provides case-insensitive parameter extraction, repository coordinate parsing
 * (`Repository` as `"owner/repo"` or URL, or explicit `Owner` + `Repo`),
 * credential resolution via {@link ResolveGitHubAuth}, client instantiation,
 * and structured error-to-`ActionResultSimple` mapping.
 *
 * @module @memberjunction/core-actions/github
 */

import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { ParseGitHubRepository } from './github-app-auth';
import {
    GitHubAuthError,
    GitHubNotFoundError,
    GitHubPolicyError,
    GitHubRateLimitError,
    GitHubRequestError,
    GitHubRestClient,
} from './github-client';
import { ResolveGitHubAuth } from './github-credential-resolver';
import type { GitHubInstallationPermissions, GitHubRepoCoordinate, GitHubResolvedAuth } from './github-types';


export abstract class GitHubBaseAction extends BaseAction {
    /** Case-insensitive string parameter lookup; returns undefined when absent or blank. */
    protected getStringParam(params: RunActionParams, name: string): string | undefined {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value == null) {
            return undefined;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    /** Case-insensitive numeric parameter lookup; returns defaultValue when absent or NaN. */
    protected getNumericParam(params: RunActionParams, name: string, defaultValue?: number): number | undefined {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value == null || param.Value === '') {
            return defaultValue;
        }
        const num = typeof param.Value === 'number' ? param.Value : Number(param.Value);
        return Number.isFinite(num) ? num : defaultValue;
    }

    /** Case-insensitive boolean parameter lookup with fallback default. */
    protected getBooleanParam(params: RunActionParams, name: string, defaultValue?: boolean): boolean | undefined {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value == null || param.Value === '') {
            return defaultValue;
        }
        if (typeof param.Value === 'boolean') {
            return param.Value;
        }
        const value = String(param.Value).trim().toLowerCase();
        if (value === 'true' || value === '1' || value === 'yes') return true;
        if (value === 'false' || value === '0' || value === 'no') return false;
        return defaultValue;
    }

    /**
     * Case-insensitive string array parameter lookup; accepts an array of strings,
     * a JSON array string, or a comma-separated string.
     */
    protected getStringArrayParam(params: RunActionParams, name: string): string[] | undefined {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value == null) {
            return undefined;
        }
        if (Array.isArray(param.Value)) {
            return param.Value.map((v) => String(v).trim()).filter((v) => v.length > 0);
        }
        if (typeof param.Value === 'string') {
            const trimmed = param.Value.trim();
            if (!trimmed) return undefined;
            if (trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        return parsed.map((v) => String(v).trim()).filter((v) => v.length > 0);
                    }
                } catch {
                    // Fall through to comma-separated split
                }
            }
            return trimmed
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
        }
        return undefined;
    }

    /**
     * Case-insensitive JSON object/array parameter lookup.
     */
    protected getObjectParam<T>(params: RunActionParams, name: string): T | undefined {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value == null) {
            return undefined;
        }
        if (typeof param.Value === 'string') {
            const trimmed = param.Value.trim();
            if (!trimmed) return undefined;
            try {
                return JSON.parse(trimmed) as T;
            } catch {
                return undefined;
            }
        }
        return param.Value as T;
    }

    /** Appends or updates an Output parameter on `params.Params`. */
    protected addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find(
            (p) => p.Name.trim().toLowerCase() === name.toLowerCase() && p.Type === 'Output'
        );
        if (existing) {
            existing.Value = value;
            return;
        }
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value,
        } as ActionParam);
    }

    /**
     * Resolves GitHub authentication, constructs a {@link GitHubRestClient}, and optionally resolves
     * the target `Owner` and `Repo` coordinates (using `Repository`, `Owner`+`Repo`, or `auth.DefaultOwner`).
     */
    protected async resolveClientAndRepo(
        params: RunActionParams,
        options: {
            requireRepo?: boolean;
            permissions?: GitHubInstallationPermissions;
        } = {}
    ): Promise<{
        client: GitHubRestClient;
        auth: GitHubResolvedAuth;
        coordinate?: GitHubRepoCoordinate;
    }> {
        const credentialId = this.getStringParam(params, 'CredentialID');
        const credentialName = this.getStringParam(params, 'CredentialName');
        const companyId = this.getStringParam(params, 'CompanyID');
        const useUserAuth =
            this.getBooleanParam(params, 'UseUserDelegatedAuth') ??
            this.getBooleanParam(params, 'UseUserAuth', false) ??
            false;

        const rawRepository = this.getStringParam(params, 'Repository');
        const rawOwner = this.getStringParam(params, 'Owner');
        const rawRepo = this.getStringParam(params, 'Repo');

        // Pre-parse coordinate if possible so installation token minting can scope to the exact repo
        let preCoordinate: GitHubRepoCoordinate | undefined;
        try {
            if (rawRepository) {
                preCoordinate = ParseGitHubRepository(rawRepository, rawOwner);
            } else if (rawOwner && rawRepo) {
                preCoordinate = ParseGitHubRepository(`${rawOwner}/${rawRepo}`);
            }
        } catch {
            // May rely on auth.DefaultOwner resolved in the next step
        }

        const auth = await ResolveGitHubAuth({
            ContextUser: params.ContextUser,
            CredentialID: credentialId,
            CredentialName: credentialName,
            CompanyID: companyId,
            UseUserDelegatedAuth: useUserAuth,
            TargetRepository: preCoordinate
                ? { owner: preCoordinate.Owner, repo: preCoordinate.Repo }
                : undefined,
            Permissions: options.permissions,
        });

        let coordinate = preCoordinate;
        if (!coordinate && (rawRepository || rawRepo)) {
            coordinate = ParseGitHubRepository(rawRepository ?? rawRepo!, rawOwner ?? auth.DefaultOwner);
        }

        if ((options.requireRepo ?? true) && !coordinate) {
            throw new Error(
                `Target repository is required. Pass 'Repository' (e.g. 'MemberJunction/MJ' or full GitHub URL) or 'Owner' + 'Repo'.`
            );
        }

        const client = new GitHubRestClient(auth);
        return { client, auth, coordinate };
    }

    /**
     * Maps any thrown error from {@link GitHubRestClient} or {@link ResolveGitHubAuth}
     * into a structured {@link ActionResultSimple} with descriptive `ResultCode`.
     */
    protected handleGitHubError(error: unknown, params: RunActionParams): ActionResultSimple {
        if (error instanceof GitHubPolicyError) {
            return {
                Success: false,
                ResultCode: error.PolicyCode,
                Message: error.message,
                Params: params.Params,
            };
        }
        if (error instanceof GitHubRateLimitError) {
            return {
                Success: false,
                ResultCode: 'RATE_LIMITED',
                Message: error.message,
                Params: params.Params,
            };
        }
        if (error instanceof GitHubAuthError) {
            return {
                Success: false,
                ResultCode: 'AUTH_ERROR',
                Message: error.message,
                Params: params.Params,
            };
        }
        if (error instanceof GitHubNotFoundError) {
            return {
                Success: false,
                ResultCode: 'NOT_FOUND',
                Message: error.message,
                Params: params.Params,
            };
        }
        if (error instanceof GitHubRequestError) {
            return {
                Success: false,
                ResultCode: `GITHUB_HTTP_${error.StatusCode}`,
                Message: error.message,
                Params: params.Params,
            };
        }
        const message = error instanceof Error ? error.message : String(error);
        return {
            Success: false,
            ResultCode: 'ERROR',
            Message: message,
            Params: params.Params,
        };
    }
}
