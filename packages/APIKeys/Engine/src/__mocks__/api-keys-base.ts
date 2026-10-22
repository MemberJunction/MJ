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
export function SetMockBaseScopes(scopes: MJAPIScopeEntity[]): void {
    _scopes = scopes;
}

/** @deprecated Use {@link SetMockBaseScopes}. */
export function setMockBaseScopes(scopes: MJAPIScopeEntity[]): void {
    return SetMockBaseScopes(scopes);
}

export function SetMockBaseApplications(apps: MJAPIApplicationEntity[]): void {
    _applications = apps;
}

/** @deprecated Use {@link SetMockBaseApplications}. */
export function setMockBaseApplications(apps: MJAPIApplicationEntity[]): void {
    return SetMockBaseApplications(apps);
}

export function SetMockBaseApplicationScopes(appScopes: MJAPIApplicationScopeEntity[]): void {
    _applicationScopes = appScopes;
}

/** @deprecated Use {@link SetMockBaseApplicationScopes}. */
export function setMockBaseApplicationScopes(appScopes: MJAPIApplicationScopeEntity[]): void {
    return SetMockBaseApplicationScopes(appScopes);
}

export function SetMockBaseKeyApplications(keyApps: MJAPIKeyApplicationEntity[]): void {
    _keyApplications = keyApps;
}

/** @deprecated Use {@link SetMockBaseKeyApplications}. */
export function setMockBaseKeyApplications(keyApps: MJAPIKeyApplicationEntity[]): void {
    return SetMockBaseKeyApplications(keyApps);
}

export function SetMockBaseKeyScopes(keyScopes: MJAPIKeyScopeEntity[]): void {
    _keyScopes = keyScopes;
}

/** @deprecated Use {@link SetMockBaseKeyScopes}. */
export function setMockBaseKeyScopes(keyScopes: MJAPIKeyScopeEntity[]): void {
    return SetMockBaseKeyScopes(keyScopes);
}

let _loaded = true;

export function SetMockBaseLoaded(loaded: boolean): void {
    _loaded = loaded;
}

/** @deprecated Use {@link SetMockBaseLoaded}. */
export function setMockBaseLoaded(loaded: boolean): void {
    return SetMockBaseLoaded(loaded);
}

export function ClearMockBaseState(): void {
    _scopes = [];
    _applications = [];
    _applicationScopes = [];
    _keyApplications = [];
    _keyScopes = [];
    _loaded = true;
}

/** @deprecated Use {@link ClearMockBaseState}. */
export function clearMockBaseState(): void {
    return ClearMockBaseState();
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

    get ApplicationScopes(): MJAPIApplicationScopeEntity[] {
        return _applicationScopes;
    }

    get KeyScopes(): MJAPIKeyScopeEntity[] {
        return _keyScopes;
    }

    get Loaded(): boolean {
        return _loaded;
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
            rule => UUIDsEqual(rule.ApplicationID, applicationId) && UUIDsEqual(rule.ScopeID, scopeId)
        );
    }

    GetKeyApplicationsByKeyId(apiKeyId: string): MJAPIKeyApplicationEntity[] {
        return _keyApplications.filter(ka => UUIDsEqual(ka.APIKeyID, apiKeyId));
    }

    GetKeyScopeRules(apiKeyId: string, scopeId: string): MJAPIKeyScopeEntity[] {
        return _keyScopes.filter(
            ks => UUIDsEqual(ks.APIKeyID, apiKeyId) && UUIDsEqual(ks.ScopeID, scopeId)
        );
    }

    GetKeyScopesByKeyId(apiKeyId: string): MJAPIKeyScopeEntity[] {
        return _keyScopes.filter(ks => UUIDsEqual(ks.APIKeyID, apiKeyId));
    }
}
