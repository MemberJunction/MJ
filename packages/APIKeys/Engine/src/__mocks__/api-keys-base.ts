/**
 * Mock for @memberjunction/api-keys-base
 * Provides a configurable APIKeysEngineBase for unit tests
 */

import {
    MJAPIApplicationEntity,
    MJAPIApplicationScopeEntity,
    MJAPIKeyApplicationEntity,
    MJAPIKeyScopeEntity,
    MJAPIScopeEntity
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

// ---- Configurable state ----
let _scopes: MJAPIScopeEntity[] = [];
let _applications: MJAPIApplicationEntity[] = [];
let _applicationScopes: MJAPIApplicationScopeEntity[] = [];
let _keyApplications: MJAPIKeyApplicationEntity[] = [];
let _keyScopes: MJAPIKeyScopeEntity[] = [];

// ---- Test helpers ----
export function setMockBaseScopes(scopes: MJAPIScopeEntity[]): void {
    _scopes = scopes;
}

export function setMockBaseApplications(apps: MJAPIApplicationEntity[]): void {
    _applications = apps;
}

export function setMockBaseApplicationScopes(appScopes: MJAPIApplicationScopeEntity[]): void {
    _applicationScopes = appScopes;
}

export function setMockBaseKeyApplications(keyApps: MJAPIKeyApplicationEntity[]): void {
    _keyApplications = keyApps;
}

export function setMockBaseKeyScopes(keyScopes: MJAPIKeyScopeEntity[]): void {
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

    get Scopes(): MJAPIScopeEntity[] {
        return _scopes;
    }

    get Applications(): MJAPIApplicationEntity[] {
        return _applications;
    }

    GetScopeByPath(fullPath: string): MJAPIScopeEntity | undefined {
        return _scopes.find(s => s.FullPath === fullPath && s.IsActive);
    }

    GetScopeById(id: string): MJAPIScopeEntity | undefined {
        return _scopes.find(s => UUIDsEqual(s.ID, id));
    }

    GetApplicationByName(name: string): MJAPIApplicationEntity | undefined {
        return _applications.find(a => a.Name.toLowerCase() === name.toLowerCase());
    }

    GetApplicationById(id: string): MJAPIApplicationEntity | undefined {
        return _applications.find(a => UUIDsEqual(a.ID, id));
    }

    GetApplicationScopeRules(applicationId: string, scopeId: string): MJAPIApplicationScopeEntity[] {
        return _applicationScopes.filter(
            rule => rule.ApplicationID === applicationId && rule.ScopeID === scopeId
        );
    }

    GetKeyApplicationsByKeyId(apiKeyId: string): MJAPIKeyApplicationEntity[] {
        return _keyApplications.filter(ka => ka.APIKeyID === apiKeyId);
    }

    GetKeyScopeRules(apiKeyId: string, scopeId: string): MJAPIKeyScopeEntity[] {
        return _keyScopes.filter(
            ks => ks.APIKeyID === apiKeyId && ks.ScopeID === scopeId
        );
    }
}
