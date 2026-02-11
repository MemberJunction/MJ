/**
 * Mock for @memberjunction/api-keys-base
 * Provides a configurable APIKeysEngineBase for unit tests
 */

import {
    APIApplicationEntity,
    APIApplicationScopeEntity,
    APIKeyApplicationEntity,
    APIKeyScopeEntity,
    APIScopeEntity
} from '@memberjunction/core-entities';

// ---- Configurable state ----
let _scopes: APIScopeEntity[] = [];
let _applications: APIApplicationEntity[] = [];
let _applicationScopes: APIApplicationScopeEntity[] = [];
let _keyApplications: APIKeyApplicationEntity[] = [];
let _keyScopes: APIKeyScopeEntity[] = [];

// ---- Test helpers ----
export function setMockBaseScopes(scopes: APIScopeEntity[]): void {
    _scopes = scopes;
}

export function setMockBaseApplications(apps: APIApplicationEntity[]): void {
    _applications = apps;
}

export function setMockBaseApplicationScopes(appScopes: APIApplicationScopeEntity[]): void {
    _applicationScopes = appScopes;
}

export function setMockBaseKeyApplications(keyApps: APIKeyApplicationEntity[]): void {
    _keyApplications = keyApps;
}

export function setMockBaseKeyScopes(keyScopes: APIKeyScopeEntity[]): void {
    _keyScopes = keyScopes;
}

export function clearMockBaseState(): void {
    _scopes = [];
    _applications = [];
    _applicationScopes = [];
    _keyApplications = [];
    _keyScopes = [];
}

// ---- Mock APIKeysEngineBase ----
export class APIKeysEngineBase {
    private static _instance: APIKeysEngineBase = new APIKeysEngineBase();

    static get Instance(): APIKeysEngineBase {
        return APIKeysEngineBase._instance;
    }

    async Config(): Promise<void> {
        // No-op in mock
    }

    get Scopes(): APIScopeEntity[] {
        return _scopes;
    }

    get Applications(): APIApplicationEntity[] {
        return _applications;
    }

    GetScopeByPath(fullPath: string): APIScopeEntity | undefined {
        return _scopes.find(s => s.FullPath === fullPath && s.IsActive);
    }

    GetScopeById(id: string): APIScopeEntity | undefined {
        return _scopes.find(s => s.ID === id);
    }

    GetApplicationByName(name: string): APIApplicationEntity | undefined {
        return _applications.find(a => a.Name.toLowerCase() === name.toLowerCase());
    }

    GetApplicationById(id: string): APIApplicationEntity | undefined {
        return _applications.find(a => a.ID === id);
    }

    GetApplicationScopeRules(applicationId: string, scopeId: string): APIApplicationScopeEntity[] {
        return _applicationScopes.filter(
            rule => rule.ApplicationID === applicationId && rule.ScopeID === scopeId
        );
    }

    GetKeyApplicationsByKeyId(apiKeyId: string): APIKeyApplicationEntity[] {
        return _keyApplications.filter(ka => ka.APIKeyID === apiKeyId);
    }

    GetKeyScopeRules(apiKeyId: string, scopeId: string): APIKeyScopeEntity[] {
        return _keyScopes.filter(
            ks => ks.APIKeyID === apiKeyId && ks.ScopeID === scopeId
        );
    }
}
